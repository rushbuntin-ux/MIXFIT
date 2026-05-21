import json
from pathlib import Path
from models import MeasurementProfile, SizeRecommendation, FitZone, GarmentType, GarmentDimensions

_CHARTS_PATH = Path(__file__).parent / "data" / "size_charts.json"

with open(_CHARTS_PATH) as f:
    SIZE_CHARTS = json.load(f)

# Ease allowances (inches added to body measurement for comfortable fit)
EASE = {
    "chest": 2.0,
    "waist": 1.0,
    "hip": 1.5,
    "thigh": 1.0,
    "neck": 0.5,
    "inseam": 0.5,
}

# Tight/loose thresholds (inches past the size range edge)
TIGHT_THRESHOLD = 0.5
LOOSE_THRESHOLD = 1.5


def _zone_status(body_meas: float, size_range: list, ease: float) -> tuple:
    low, high = size_range
    needed = body_meas + ease
    if needed < low:
        delta = low - needed
        status = "loose" if delta > LOOSE_THRESHOLD else "good"
    elif needed > high:
        delta = needed - high
        status = "tight" if delta > TIGHT_THRESHOLD else "good"
        delta = -delta
    else:
        delta = 0.0
        status = "good"
    return delta, status


def recommend_top(profile: MeasurementProfile) -> SizeRecommendation:
    chart = SIZE_CHARTS[profile.gender.value]["tops"]
    scores: dict[str, dict] = {}

    for size, ranges in chart.items():
        zones = []
        penalty = 0

        for zone_key, ease_key, body_val in [
            ("chest", "chest", profile.chest_in),
            ("waist", "waist", profile.waist_in),
        ]:
            if zone_key not in ranges:
                continue
            delta, status = _zone_status(body_val, ranges[zone_key], EASE[ease_key])
            zones.append(FitZone(zone=zone_key, status=status, delta_in=round(delta, 2)))
            if status == "tight":
                penalty += abs(delta) * 10
            elif status == "loose":
                penalty += abs(delta) * 3

        if profile.neck_in and "neck" in ranges:
            delta, status = _zone_status(profile.neck_in, ranges["neck"], EASE["neck"])
            zones.append(FitZone(zone="neck", status=status, delta_in=round(delta, 2)))
            if status == "tight":
                penalty += abs(delta) * 10

        scores[size] = {"penalty": penalty, "zones": zones}

    best_size = min(scores, key=lambda s: scores[s]["penalty"])
    best = scores[best_size]

    tight_zones = [z for z in best["zones"] if z.status == "tight"]
    loose_zones = [z for z in best["zones"] if z.status == "loose"]

    if not tight_zones and not loose_zones:
        confidence = "exact"
        notes = f"Size {best_size} fits your measurements well across all zones."
    elif tight_zones and loose_zones:
        confidence = "between_sizes"
        tight_names = ", ".join(z.zone for z in tight_zones)
        loose_names = ", ".join(z.zone for z in loose_zones)
        notes = f"Size {best_size} is your closest match — snug in {tight_names}, roomy in {loose_names}. You're between sizes."
    elif tight_zones:
        confidence = "size_up"
        tight_names = ", ".join(z.zone for z in tight_zones)
        notes = f"Size {best_size} may be snug in: {tight_names}. Consider sizing up."
    else:
        confidence = "size_down"
        loose_names = ", ".join(z.zone for z in loose_zones)
        notes = f"Size {best_size} has extra room in: {loose_names}. You could size down."

    return SizeRecommendation(
        recommended_size=best_size,
        fit_zones=best["zones"],
        confidence=confidence,
        notes=notes,
    )


def recommend_bottom(profile: MeasurementProfile) -> SizeRecommendation:
    chart = SIZE_CHARTS[profile.gender.value]["bottoms"]
    scores: dict[str, dict] = {}

    for size, ranges in chart.items():
        zones = []
        penalty = 0

        checks = [
            ("waist", "waist", profile.waist_in),
            ("hip", "hip", profile.hip_in),
            ("inseam", "inseam", profile.inseam_in),
        ]
        if profile.thigh_in and "thigh" in ranges:
            checks.append(("thigh", "thigh", profile.thigh_in))

        for zone_key, ease_key, body_val in checks:
            if zone_key not in ranges:
                continue
            delta, status = _zone_status(body_val, ranges[zone_key], EASE[ease_key])
            zones.append(FitZone(zone=zone_key, status=status, delta_in=round(delta, 2)))
            if status == "tight":
                penalty += abs(delta) * 10
            elif status == "loose":
                penalty += abs(delta) * 3

        scores[size] = {"penalty": penalty, "zones": zones}

    best_size = min(scores, key=lambda s: scores[s]["penalty"])
    best = scores[best_size]

    tight_zones = [z for z in best["zones"] if z.status == "tight"]
    loose_zones = [z for z in best["zones"] if z.status == "loose"]

    if not tight_zones and not loose_zones:
        confidence = "exact"
        notes = f"Size {best_size} fits your measurements well."
    elif tight_zones and loose_zones:
        confidence = "between_sizes"
        tight_names = ", ".join(z.zone for z in tight_zones)
        loose_names = ", ".join(z.zone for z in loose_zones)
        notes = f"Size {best_size} is your closest match — snug in {tight_names}, roomy in {loose_names}. You're between sizes."
    elif tight_zones:
        confidence = "size_up"
        tight_names = ", ".join(z.zone for z in tight_zones)
        notes = f"Size {best_size} may be tight in: {tight_names}."
    else:
        confidence = "size_down"
        loose_names = ", ".join(z.zone for z in loose_zones)
        notes = f"Size {best_size} has extra room in: {loose_names}."

    return SizeRecommendation(
        recommended_size=best_size,
        fit_zones=best["zones"],
        confidence=confidence,
        notes=notes,
    )


def get_recommendation(profile: MeasurementProfile, garment_type: GarmentType) -> SizeRecommendation:
    if garment_type == GarmentType.top:
        return recommend_top(profile)
    return recommend_bottom(profile)


# --- Phase 1: garment-dimension-based fit engine ---

_GARMENT_EASE = {
    "chest":    2.0,
    "waist":    1.0,
    "hip":      1.5,
    "thigh":    1.0,
    "neck":     0.5,
    "inseam":   0.5,
    "shoulder": 0.0,
    "sleeve":   0.5,
}

_TIGHT_THRESHOLD = 0.5   # delta below 0 by more than this → tight
_LOOSE_THRESHOLD = 2.0   # delta above ease by more than this → loose


def _garment_zone(zone: str, body_meas: float, garment_meas: float) -> FitZone:
    ease = _GARMENT_EASE.get(zone, 0.5)
    delta = garment_meas - (body_meas + ease)
    if delta < -_TIGHT_THRESHOLD:
        status = "tight"
    elif delta > _LOOSE_THRESHOLD:
        status = "loose"
    else:
        status = "good"
    return FitZone(zone=zone, status=status, delta_in=round(delta, 2))


def recommend_from_garment(profile: MeasurementProfile, garment: GarmentDimensions) -> SizeRecommendation:
    zones: list[FitZone] = []

    checks = [
        ("chest",    profile.chest_in,  garment.chest_in),
        ("waist",    profile.waist_in,  garment.waist_in),
        ("hip",      profile.hip_in,    garment.hip_in),
        ("inseam",   profile.inseam_in, garment.inseam_in),
        ("shoulder", None,               garment.shoulder_in),
        ("sleeve",   profile.sleeve_in, garment.sleeve_in),
        ("neck",     profile.neck_in,   garment.neck_in),
        ("thigh",    profile.thigh_in,  garment.thigh_in),
    ]

    for zone, body_val, garm_val in checks:
        if garm_val is None:
            continue
        if not body_val:
            continue
        zones.append(_garment_zone(zone, body_val, garm_val))

    tight = [z for z in zones if z.status == "tight"]
    loose = [z for z in zones if z.status == "loose"]
    label = garment.size_label or "this garment"

    if not tight and not loose:
        confidence = "exact"
        notes = f"{label} fits your body well across all measured zones."
    elif tight and loose:
        confidence = "between_sizes"
        t = ", ".join(z.zone for z in tight)
        l = ", ".join(z.zone for z in loose)
        notes = f"{label} is your closest match — snug in {t}, roomy in {l}."
    elif tight:
        confidence = "size_up"
        t = ", ".join(z.zone for z in tight)
        notes = f"{label} runs snug in {t}. Consider sizing up."
    else:
        confidence = "size_down"
        l = ", ".join(z.zone for z in loose)
        notes = f"{label} has extra room in {l}. You could size down."

    return SizeRecommendation(
        recommended_size=garment.size_label or "—",
        fit_zones=zones,
        confidence=confidence,
        notes=notes,
    )
