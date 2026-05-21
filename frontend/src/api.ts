import type { MeasurementProfile, SizeRecommendation, GarmentType, GarmentDimensions } from './types'

const BASE = 'http://localhost:8001'

export async function saveProfile(profile: MeasurementProfile): Promise<MeasurementProfile> {
  const res = await fetch(`${BASE}/profiles`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(profile),
  })
  if (!res.ok) throw new Error('Failed to save profile')
  return res.json()
}

export async function getRecommendation(
  profile: MeasurementProfile,
  garmentType: GarmentType
): Promise<SizeRecommendation> {
  const res = await fetch(`${BASE}/recommend/${garmentType}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(profile),
  })
  if (!res.ok) throw new Error('Failed to get recommendation')
  return res.json()
}

export async function getGarmentRecommendation(
  profile: MeasurementProfile,
  garment: GarmentDimensions
): Promise<SizeRecommendation> {
  const res = await fetch(`${BASE}/recommend/garment`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ profile, garment }),
  })
  if (!res.ok) throw new Error('Failed to get garment recommendation')
  return res.json()
}
