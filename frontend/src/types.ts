export type Gender = 'mens' | 'womens'
export type GarmentType = 'top' | 'bottom'

export interface MeasurementProfile {
  user_id: string
  gender: Gender
  height_in: number
  weight_lbs: number
  chest_in: number
  waist_in: number
  hip_in: number
  inseam_in: number
  neck_in?: number
  thigh_in?: number
}

export interface FitZone {
  zone: string
  status: 'tight' | 'loose' | 'good'
  delta_in: number
}

export interface SizeRecommendation {
  recommended_size: string
  fit_zones: FitZone[]
  confidence: 'exact' | 'size_up' | 'size_down' | 'between_sizes'
  notes: string
}

export interface GarmentDimensions {
  name?: string
  brand?: string
  size_label?: string
  chest_in?: number
  waist_in?: number
  shoulder_in?: number
  sleeve_in?: number
  neck_in?: number
  hip_in?: number
  inseam_in?: number
  thigh_in?: number
}
