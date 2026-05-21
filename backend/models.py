from pydantic import BaseModel, Field
from typing import Optional
from enum import Enum


class Gender(str, Enum):
    mens = "mens"
    womens = "womens"


class GarmentType(str, Enum):
    top = "top"
    bottom = "bottom"


class MeasurementProfile(BaseModel):
    user_id: str
    gender: Gender
    height_in: float = Field(..., ge=0, description="Height in inches")
    weight_lbs: float = Field(..., ge=0, description="Weight in pounds")
    chest_in: float = Field(..., ge=0, description="Chest circumference in inches")
    waist_in: float = Field(..., ge=0, description="Waist circumference in inches")
    hip_in: float = Field(..., ge=0, description="Hip circumference in inches")
    inseam_in: float = Field(..., ge=0, description="Inseam length in inches")
    neck_in: Optional[float] = Field(None, gt=0, description="Neck circumference in inches")
    thigh_in: Optional[float] = Field(None, gt=0, description="Thigh circumference in inches")
    sleeve_in: Optional[float] = Field(None, gt=0, description="Sleeve length in inches")


class FitZone(BaseModel):
    zone: str
    status: str  # "tight", "loose", "good"
    delta_in: float  # how many inches off from ideal


class SizeRecommendation(BaseModel):
    recommended_size: str
    fit_zones: list[FitZone]
    confidence: str  # "exact", "size_up", "size_down", "between_sizes"
    notes: str


class GarmentDimensions(BaseModel):
    name: str = ""
    brand: str = ""
    size_label: str = ""
    # Tops
    chest_in: Optional[float] = Field(None, gt=0)
    waist_in: Optional[float] = Field(None, gt=0)
    shoulder_in: Optional[float] = Field(None, gt=0)
    sleeve_in: Optional[float] = Field(None, gt=0)
    neck_in: Optional[float] = Field(None, gt=0)
    # Bottoms
    hip_in: Optional[float] = Field(None, gt=0)
    inseam_in: Optional[float] = Field(None, gt=0)
    thigh_in: Optional[float] = Field(None, gt=0)


class GarmentFitRequest(BaseModel):
    profile: MeasurementProfile
    garment: GarmentDimensions
