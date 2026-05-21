import { useState } from 'react'
import type { MeasurementProfile, Gender, GarmentType, GarmentDimensions, SizeRecommendation } from './types'
import { saveProfile, getRecommendation, getGarmentRecommendation } from './api'
import FitResult from './FitResult'
import './MeasurementForm.css'

type Unit = 'in' | 'cm'

const DEFAULT: MeasurementProfile = {
  user_id: 'guest',
  gender: 'mens',
  height_in: 0,
  weight_lbs: 0,
  chest_in: 0,
  waist_in: 0,
  hip_in: 0,
  inseam_in: 0,
}

function toInches(val: number, unit: Unit) {
  return unit === 'cm' ? val / 2.54 : val
}

export default function MeasurementForm() {
  const [profile, setProfile] = useState<MeasurementProfile>(DEFAULT)
  const [garmentType, setGarmentType] = useState<GarmentType>('top')
  const [unit, setUnit] = useState<Unit>('in')
  const [garment, setGarment] = useState<GarmentDimensions>({})
  const [showGarment, setShowGarment] = useState(false)
  const [result, setResult] = useState<SizeRecommendation | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  function set(field: keyof MeasurementProfile, value: string | number) {
    setProfile(p => ({ ...p, [field]: value }))
  }

  function setG(field: keyof GarmentDimensions, value: string | number) {
    setGarment(g => ({ ...g, [field]: value }))
  }

  function handleUnitToggle(next: Unit) {
    if (next === unit) return
    // convert existing values so the numbers stay correct
    const factor = next === 'cm' ? 2.54 : 1 / 2.54
    const measureFields: (keyof MeasurementProfile)[] = [
      'height_in', 'chest_in', 'waist_in', 'hip_in', 'inseam_in', 'neck_in', 'thigh_in',
    ]
    setProfile(p => {
      const updated = { ...p }
      for (const f of measureFields) {
        const v = p[f]
        if (typeof v === 'number' && v !== 0) {
          (updated as Record<string, unknown>)[f] = parseFloat((v * factor).toFixed(1))
        }
      }
      return updated
    })
    setUnit(next)
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError(null)
    setResult(null)
    try {
      const apiProfile: MeasurementProfile = {
        ...profile,
        height_in:  toInches(profile.height_in, unit),
        chest_in:   toInches(profile.chest_in, unit),
        waist_in:   toInches(profile.waist_in, unit),
        hip_in:     toInches(profile.hip_in, unit),
        inseam_in:  toInches(profile.inseam_in, unit),
        neck_in:    profile.neck_in  != null ? toInches(profile.neck_in,  unit) : undefined,
        thigh_in:   profile.thigh_in != null ? toInches(profile.thigh_in, unit) : undefined,
      }
      await saveProfile(apiProfile)

      const hasGarmentDims = showGarment && Object.values(garment).some(
        v => typeof v === 'number' && v > 0
      )

      let rec: SizeRecommendation
      if (hasGarmentDims) {
        const apiGarment: GarmentDimensions = {
          ...garment,
          chest_in:    garment.chest_in    ? toInches(garment.chest_in,    unit) : undefined,
          waist_in:    garment.waist_in    ? toInches(garment.waist_in,    unit) : undefined,
          hip_in:      garment.hip_in      ? toInches(garment.hip_in,      unit) : undefined,
          shoulder_in: garment.shoulder_in ? toInches(garment.shoulder_in, unit) : undefined,
          sleeve_in:   garment.sleeve_in   ? toInches(garment.sleeve_in,   unit) : undefined,
          neck_in:     garment.neck_in     ? toInches(garment.neck_in,     unit) : undefined,
          inseam_in:   garment.inseam_in   ? toInches(garment.inseam_in,   unit) : undefined,
          thigh_in:    garment.thigh_in    ? toInches(garment.thigh_in,    unit) : undefined,
        }
        rec = await getGarmentRecommendation(apiProfile, apiGarment)
      } else {
        rec = await getRecommendation(apiProfile, garmentType)
      }
      setResult(rec)
    } catch {
      setError('Could not connect to the fit engine. Make sure the backend is running.')
    } finally {
      setLoading(false)
    }
  }

  const u = unit === 'cm' ? 'cm' : 'in'

  return (
    <div className="widget">
      <div className="widget-header">
        <h1>MIX<span className="logo-accent">FIT</span></h1>
        <p>Enter your measurements — we'll find your perfect size.</p>
      </div>

      <form onSubmit={handleSubmit}>
        <div className="row">
          <label>
            I'm shopping for
            <select value={profile.gender} onChange={e => set('gender', e.target.value as Gender)}>
              <option value="mens">Men's</option>
              <option value="womens">Women's</option>
            </select>
          </label>
          <label>
            Garment type
            <select value={garmentType} onChange={e => setGarmentType(e.target.value as GarmentType)}>
              <option value="top">Top / Jacket</option>
              <option value="bottom">Pants / Shorts</option>
            </select>
          </label>
        </div>

        <div className="section-title">
          Body Measurements
          <div className="unit-toggle">
            <button type="button" className={unit === 'in' ? 'active' : ''} onClick={() => handleUnitToggle('in')}>in</button>
            <button type="button" className={unit === 'cm' ? 'active' : ''} onClick={() => handleUnitToggle('cm')}>cm</button>
          </div>
        </div>

        <div className="grid">
          <Field label="Height" unit={u} value={profile.height_in} onChange={v => set('height_in', v)} />
          <Field label="Weight (lbs)" value={profile.weight_lbs} onChange={v => set('weight_lbs', v)} />
          <Field label="Chest" unit={u} value={profile.chest_in} onChange={v => set('chest_in', v)} hint="Around fullest part" />
          <Field label="Waist" unit={u} value={profile.waist_in} onChange={v => set('waist_in', v)} hint="Around natural waist" />
          <Field label="Hips" unit={u} value={profile.hip_in} onChange={v => set('hip_in', v)} hint="Around fullest part" />
          <Field label="Inseam" unit={u} value={profile.inseam_in} onChange={v => set('inseam_in', v)} hint="Crotch to ankle" />
          {garmentType === 'top' && (
            <Field label="Neck (optional)" unit={u} value={profile.neck_in ?? ''} onChange={v => set('neck_in', v)} />
          )}
          {garmentType === 'bottom' && (
            <Field label="Thigh (optional)" unit={u} value={profile.thigh_in ?? ''} onChange={v => set('thigh_in', v)} hint="Around fullest part" />
          )}
        </div>

        <button
          type="button"
          className="garment-toggle"
          onClick={() => setShowGarment(s => !s)}
        >
          {showGarment ? '▾' : '▸'} Garment Dimensions
          <span className="garment-toggle-hint">
            {showGarment ? 'Hide' : 'Add measurements from the product page for an exact fit check'}
          </span>
        </button>

        {showGarment && (
          <>
            <div className="grid">
              <Field label="Brand / Name" value={garment.name ?? ''} onChange={v => setG('name', v)} textField />
              <Field label="Size label" value={garment.size_label ?? ''} onChange={v => setG('size_label', v)} textField placeholder="e.g. M, 32×30" />
            </div>
            <div className="grid">
              {(garmentType === 'top' || garmentType === 'bottom') && (
                <Field label="Chest" unit={u} value={garment.chest_in ?? ''} onChange={v => setG('chest_in', v)} hint="Garment circumference" />
              )}
              <Field label="Waist" unit={u} value={garment.waist_in ?? ''} onChange={v => setG('waist_in', v)} hint="Garment circumference" />
              {garmentType === 'top' && <>
                <Field label="Shoulder width" unit={u} value={garment.shoulder_in ?? ''} onChange={v => setG('shoulder_in', v)} hint="Seam to seam" />
                <Field label="Sleeve length" unit={u} value={garment.sleeve_in ?? ''} onChange={v => setG('sleeve_in', v)} />
              </>}
              {garmentType === 'bottom' && <>
                <Field label="Hip" unit={u} value={garment.hip_in ?? ''} onChange={v => setG('hip_in', v)} hint="Garment circumference" />
                <Field label="Inseam" unit={u} value={garment.inseam_in ?? ''} onChange={v => setG('inseam_in', v)} />
                <Field label="Thigh" unit={u} value={garment.thigh_in ?? ''} onChange={v => setG('thigh_in', v)} hint="Garment circumference" />
              </>}
            </div>
          </>
        )}

        <button type="submit" disabled={loading} className="submit-btn">
          {loading ? 'Checking fit…' : 'Find My Size'}
        </button>
      </form>

      {error && <div className="error">{error}</div>}
      {result && <FitResult result={result} />}
    </div>
  )
}

function Field({
  label, unit, value, onChange, hint, textField, placeholder
}: {
  label: string
  unit?: string
  value: number | string
  onChange: (v: number | string) => void
  hint?: string
  textField?: boolean
  placeholder?: string
}) {
  return (
    <label className="field">
      <span className="field-label">{label}{unit ? ` (${unit})` : ''}</span>
      {hint && <span className="field-hint">{hint}</span>}
      {textField
        ? <input
            type="text"
            value={value}
            placeholder={placeholder ?? ''}
            onChange={e => onChange(e.target.value)}
          />
        : <input
            type="number"
            step="0.5"
            min="0"
            value={value === 0 ? '' : value}
            placeholder="0"
            onChange={e => onChange(parseFloat(e.target.value) || 0)}
            required={!label.includes('optional')}
          />
      }
    </label>
  )
}
