import io
import math
import os
from contextlib import asynccontextmanager
from fastapi import FastAPI, HTTPException, UploadFile, File, Form
from fastapi.middleware.cors import CORSMiddleware
from models import MeasurementProfile, SizeRecommendation, GarmentType, GarmentFitRequest
from size_engine import get_recommendation, recommend_from_garment
from database import init_db, upsert_profile, fetch_profile
from dotenv import load_dotenv
import replicate

load_dotenv()


@asynccontextmanager
async def lifespan(app: FastAPI):
    init_db()
    yield


app = FastAPI(title="MIXFIT Size Engine", version="0.1.0", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.post("/profiles", response_model=MeasurementProfile)
def save_profile(profile: MeasurementProfile):
    upsert_profile(profile)
    return profile


@app.get("/profiles/{user_id}", response_model=MeasurementProfile)
def get_profile(user_id: str):
    profile = fetch_profile(user_id)
    if profile is None:
        raise HTTPException(status_code=404, detail="Profile not found")
    return profile


@app.post("/recommend/{garment_type}", response_model=SizeRecommendation)
def recommend(garment_type: GarmentType, profile: MeasurementProfile):
    return get_recommendation(profile, garment_type)


@app.post("/recommend/{garment_type}/{user_id}", response_model=SizeRecommendation)
def recommend_saved(garment_type: GarmentType, user_id: str):
    profile = fetch_profile(user_id)
    if profile is None:
        raise HTTPException(status_code=404, detail="Profile not found — save measurements first")
    return get_recommendation(profile, garment_type)


@app.post("/recommend/garment", response_model=SizeRecommendation)
def recommend_garment(req: GarmentFitRequest):
    return recommend_from_garment(req.profile, req.garment)


@app.post("/tryon")
async def virtual_tryon(
    human_img: UploadFile = File(...),
    garm_img: UploadFile = File(...),
    garment_desc: str = Form(""),
    category: str = Form("upper_body"),
):
    token = os.environ.get("REPLICATE_API_TOKEN")
    if not token:
        raise HTTPException(status_code=500, detail="Replicate API token not configured")

    human_data = await human_img.read()
    garm_data = await garm_img.read()

    client = replicate.Client(api_token=token)

    try:
        human_file = await client.files.async_create(
            io.BytesIO(human_data), filename=human_img.filename or "person.jpg"
        )
        garm_file = await client.files.async_create(
            io.BytesIO(garm_data), filename=garm_img.filename or "garment.jpg"
        )

        output = await client.async_run(
            "cuuupid/idm-vton:0513734a452173b8173e907e3a59d19a36266e55b48528559432bd21c7d7e985",
            input={
                "human_img": human_file.urls["get"],
                "garm_img": garm_file.urls["get"],
                "garment_des": garment_desc,
                "category": category,
                "steps": 30,
                "seed": 42,
            },
        )
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"Try-on generation failed: {str(e)}")

    result_url = output[0] if isinstance(output, list) else str(output)
    return {"result_url": result_url}


@app.post("/measure-photo")
async def measure_photo(
    photo: UploadFile = File(...),
    height_in: float = Form(...),
    unit: str = Form("in"),
):
    import mediapipe as mp
    from PIL import Image
    import numpy as np

    if height_in < 48 or height_in > 96:
        raise HTTPException(status_code=422, detail="height_in must be between 48 and 96 inches")

    img_bytes = await photo.read()
    img = Image.open(io.BytesIO(img_bytes)).convert("RGB")
    img_array = np.array(img)
    img_h, img_w = img_array.shape[:2]

    with mp.solutions.pose.Pose(static_image_mode=True, model_complexity=1) as pose:
        result = pose.process(img_array)

    if not result.pose_landmarks:
        raise HTTPException(status_code=422, detail="No body detected — try a clear full-length photo")

    lm = result.pose_landmarks.landmark
    VIS_THRESHOLD = 0.4

    def ok(i):
        return lm[i].visibility > VIS_THRESHOLD

    def px(i):
        return lm[i].x * img_w, lm[i].y * img_h

    def dist(i, j):
        ax, ay = px(i)
        bx, by = px(j)
        return math.sqrt((ax - bx) ** 2 + (ay - by) ** 2)

    # Height scale: nose (0) to mid-ankle (27, 28)
    if not (ok(0) and ok(27) and ok(28)):
        raise HTTPException(status_code=422, detail="Full body not visible — ensure head to feet are in the photo")

    _, nose_y   = px(0)
    _, ank27_y  = px(27)
    _, ank28_y  = px(28)
    mid_ankle_y = (ank27_y + ank28_y) / 2
    height_px   = abs(mid_ankle_y - nose_y)
    if height_px < 20:
        raise HTTPException(status_code=422, detail="Could not determine scale — make sure full body is in frame")

    scale = height_in / height_px  # real inches per image pixel

    meas = {}

    if ok(11) and ok(12):
        shoulder_px = dist(11, 12)
        meas["chest_in"] = round(shoulder_px * scale * 2.15, 1)

    if ok(23) and ok(24):
        hip_px = dist(23, 24)
        meas["hip_in"] = round(hip_px * scale * 2.2, 1)

    if "chest_in" in meas and "hip_in" in meas:
        meas["waist_in"] = round((meas["chest_in"] * 0.45 + meas["hip_in"] * 0.55) * 0.92, 1)

    if ok(23) and ok(24) and ok(27) and ok(28):
        mh23x, mh23y = px(23)
        mh24x, mh24y = px(24)
        ma27x, ma27y = px(27)
        ma28x, ma28y = px(28)
        mhx = (mh23x + mh24x) / 2
        mhy = (mh23y + mh24y) / 2
        max_ = (ma27x + ma28x) / 2
        may  = (ma27y + ma28y) / 2
        inseam_px = math.sqrt((mhx - max_) ** 2 + (mhy - may) ** 2)
        meas["inseam_in"] = round(inseam_px * scale, 1)

    if ok(11) and ok(13) and ok(15):
        meas["sleeve_in"] = round((dist(11, 13) + dist(13, 15)) * scale, 1)
    elif ok(12) and ok(14) and ok(16):
        meas["sleeve_in"] = round((dist(12, 14) + dist(14, 16)) * scale, 1)

    if ok(23) and ok(24) and ok(25) and ok(26):
        mh23x, mh23y = px(23)
        mh24x, mh24y = px(24)
        mk25x, mk25y = px(25)
        mk26x, mk26y = px(26)
        mhx = (mh23x + mh24x) / 2
        mhy = (mh23y + mh24y) / 2
        mkx = (mk25x + mk26x) / 2
        mky = (mk25y + mk26y) / 2
        thigh_len_px = math.sqrt((mhx - mkx) ** 2 + (mhy - mky) ** 2)
        meas["thigh_in"] = round(thigh_len_px * scale * 1.8, 1)

    # Clamp to human ranges
    ranges = {"chest_in": (20, 80), "waist_in": (18, 70), "hip_in": (20, 80),
              "inseam_in": (20, 50), "sleeve_in": (18, 40), "thigh_in": (12, 40)}
    for k, (lo, hi) in ranges.items():
        if k in meas:
            meas[k] = max(lo, min(hi, meas[k]))

    if unit == "cm":
        meas = {k: round(v * 2.54, 1) for k, v in meas.items()}

    return meas


@app.get("/health")
def health():
    return {"status": "ok"}
