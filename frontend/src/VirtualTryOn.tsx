import { useRef, useState, useCallback } from 'react'
import { FilesetResolver, PoseLandmarker } from '@mediapipe/tasks-vision'
import type { NormalizedLandmark } from '@mediapipe/tasks-vision'
import type { FitZone } from './types'
import './VirtualTryOn.css'

const ZONE_COLORS: Record<FitZone['status'], string> = {
  tight: 'rgba(224, 82, 82, 0.52)',
  loose: 'rgba(224, 154, 82, 0.52)',
  good: 'rgba(82, 168, 82, 0.52)',
}

const ZONE_LABELS: Record<FitZone['status'], string> = {
  tight: 'Snug',
  loose: 'Roomy',
  good: 'Good',
}

let landmarkerCache: PoseLandmarker | null = null

async function loadLandmarker(): Promise<PoseLandmarker> {
  if (landmarkerCache) return landmarkerCache
  const vision = await FilesetResolver.forVisionTasks(
    'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14/wasm'
  )
  landmarkerCache = await PoseLandmarker.createFromOptions(vision, {
    baseOptions: {
      modelAssetPath:
        'https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/1/pose_landmarker_lite.task',
      delegate: 'GPU',
    },
    runningMode: 'IMAGE',
    numPoses: 1,
  })
  return landmarkerCache
}

function fillZone(
  ctx: CanvasRenderingContext2D,
  x: number, y: number, w: number, h: number,
  color: string, label: string, fontSize: number
) {
  ctx.save()
  ctx.fillStyle = color
  ctx.beginPath()
  ctx.roundRect(x, y, w, h, Math.min(w, h) * 0.14)
  ctx.fill()
  if (label) {
    ctx.fillStyle = 'rgba(255,255,255,0.92)'
    ctx.font = `bold ${fontSize}px sans-serif`
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.fillText(label, x + w / 2, y + h / 2)
  }
  ctx.restore()
}

function drawFitZones(
  ctx: CanvasRenderingContext2D,
  lm: NormalizedLandmark[],
  W: number, H: number,
  fitZones: FitZone[]
) {
  const px = (i: number) => ({ x: lm[i].x * W, y: lm[i].y * H })
  const zoneSet = new Set(fitZones.map(z => z.zone))
  const fontSize = Math.max(11, W * 0.024)

  const lSh = px(11), rSh = px(12)
  const lHp = px(23), rHp = px(24)
  const lKn = px(25), rKn = px(26)
  const lAn = px(27), rAn = px(28)
  const nose = px(0)

  const sCX = (lSh.x + rSh.x) / 2, sCY = (lSh.y + rSh.y) / 2
  const hCX = (lHp.x + rHp.x) / 2, hCY = (lHp.y + rHp.y) / 2
  const sW = Math.abs(rSh.x - lSh.x)
  const hW = Math.abs(rHp.x - lHp.x)
  const torsoH = hCY - sCY

  const color = (name: string) => {
    const z = fitZones.find(z => z.zone === name)
    return z ? ZONE_COLORS[z.status] : 'rgba(150,150,150,0.3)'
  }
  const label = (name: string) => {
    const z = fitZones.find(z => z.zone === name)
    return z ? ZONE_LABELS[z.status] : ''
  }

  if (zoneSet.has('neck')) {
    const nW = sW * 0.28
    const nTop = nose.y + (sCY - nose.y) * 0.4
    fillZone(ctx, sCX - nW / 2, nTop, nW, sCY - nTop, color('neck'), label('neck'), fontSize)
  }
  if (zoneSet.has('chest')) {
    fillZone(ctx, sCX - sW * 0.62, sCY, sW * 1.24, torsoH * 0.42, color('chest'), label('chest'), fontSize)
  }
  if (zoneSet.has('waist')) {
    const wW = (sW + hW) / 2 * 1.05
    fillZone(ctx, sCX - wW / 2, sCY + torsoH * 0.44, wW, torsoH * 0.32, color('waist'), label('waist'), fontSize)
  }
  if (zoneSet.has('hip')) {
    fillZone(ctx, hCX - hW * 0.72, hCY - torsoH * 0.06, hW * 1.44, torsoH * 0.28, color('hip'), label('hip'), fontSize)
  }
  if (zoneSet.has('thigh')) {
    const thighH = ((lKn.y + rKn.y) / 2 - hCY) * 0.85
    const tW = sW * 0.38
    fillZone(ctx, lHp.x - tW / 2, hCY + torsoH * 0.18, tW, thighH, color('thigh'), label('thigh'), fontSize)
    fillZone(ctx, rHp.x - tW / 2, hCY + torsoH * 0.18, tW, thighH, color('thigh'), '', fontSize)
  }
  if (zoneSet.has('inseam')) {
    const legH = ((lAn.y + rAn.y) / 2 - hCY) * 0.88
    const iW = sW * 0.13
    fillZone(ctx, hCX - iW / 2, hCY + torsoH * 0.18, iW, legH, color('inseam'), label('inseam'), fontSize)
  }
}

interface Props {
  fitZones: FitZone[]
}

type Status = 'idle' | 'generating' | 'overlaying' | 'done' | 'error'

function UploadSlot({
  label, hint, file, onChange,
}: {
  label: string
  hint: string
  file: File | null
  onChange: (f: File) => void
}) {
  return (
    <label className="tryon-slot">
      <input type="file" accept="image/*" onChange={e => {
        const f = e.target.files?.[0]
        if (f) onChange(f)
      }} />
      {file
        ? <img src={URL.createObjectURL(file)} className="slot-preview" alt={label} />
        : <>
            <span className="slot-label">{label}</span>
            <span className="slot-hint">{hint}</span>
          </>
      }
    </label>
  )
}

export default function VirtualTryOn({ fitZones }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [personFile, setPersonFile] = useState<File | null>(null)
  const [garmentFile, setGarmentFile] = useState<File | null>(null)
  const [garmentDesc, setGarmentDesc] = useState('')
  const [category, setCategory] = useState('upper_body')
  const [status, setStatus] = useState<Status>('idle')
  const [errorMsg, setErrorMsg] = useState('')

  const generate = useCallback(async () => {
    if (!personFile || !garmentFile || !canvasRef.current) return
    setStatus('generating')
    setErrorMsg('')

    try {
      const form = new FormData()
      form.append('human_img', personFile)
      form.append('garm_img', garmentFile)
      form.append('garment_desc', garmentDesc)
      form.append('category', category)

      const res = await fetch('http://localhost:8001/tryon', { method: 'POST', body: form })
      if (!res.ok) {
        const err = await res.json().catch(() => ({ detail: 'Unknown error' }))
        throw new Error(err.detail || 'Generation failed')
      }
      const { result_url } = await res.json()

      setStatus('overlaying')

      const img = new Image()
      img.crossOrigin = 'anonymous'
      img.src = result_url
      await new Promise<void>((res, rej) => { img.onload = () => res(); img.onerror = () => rej(new Error('img')) })

      const canvas = canvasRef.current
      const MAX_W = 520
      const scale = Math.min(1, MAX_W / img.naturalWidth)
      canvas.width = img.naturalWidth * scale
      canvas.height = img.naturalHeight * scale

      const ctx = canvas.getContext('2d')!
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height)

      const landmarker = await loadLandmarker()
      const result = landmarker.detect(img)

      if (result.landmarks?.length) {
        drawFitZones(ctx, result.landmarks[0], canvas.width, canvas.height, fitZones)
      }

      setStatus('done')
    } catch (e: unknown) {
      setErrorMsg(e instanceof Error ? e.message : 'Something went wrong.')
      setStatus('error')
    }
  }, [personFile, garmentFile, garmentDesc, fitZones])

  const reset = () => {
    setStatus('idle')
    setPersonFile(null)
    setGarmentFile(null)
    setGarmentDesc('')
    setCategory('upper_body')
    setErrorMsg('')
  }

  const isLoading = status === 'generating' || status === 'overlaying'

  return (
    <div className="tryon-wrap">
      <div className="tryon-title">Virtual Try-On</div>

      {status !== 'done' && (
        <>
          <div className="tryon-slots">
            <UploadSlot
              label="Your Photo"
              hint="Full body, facing camera"
              file={personFile}
              onChange={setPersonFile}
            />
            <UploadSlot
              label="Garment Photo"
              hint="Flat lay or product image"
              file={garmentFile}
              onChange={setGarmentFile}
            />
          </div>

          <select
            className="garment-desc-input"
            value={category}
            onChange={e => setCategory(e.target.value)}
            disabled={isLoading}
          >
            <option value="upper_body">Top (shirt, jacket, hoodie…)</option>
            <option value="lower_body">Bottom (pants, skirt, shorts…)</option>
            <option value="dresses">Full outfit / dress</option>
          </select>

          <input
            className="garment-desc-input"
            placeholder="Describe the garment (e.g. white linen button-down shirt)"
            value={garmentDesc}
            onChange={e => setGarmentDesc(e.target.value)}
            disabled={isLoading}
          />

          <button
            className="generate-btn"
            onClick={generate}
            disabled={!personFile || !garmentFile || isLoading}
          >
            {isLoading ? (
              status === 'generating'
                ? <><span className="spinner" /> Generating… (30–60s)</>
                : <><span className="spinner" /> Overlaying fit zones…</>
            ) : 'Try It On'}
          </button>
        </>
      )}

      {status === 'error' && <p className="tryon-error">{errorMsg}</p>}

      <canvas ref={canvasRef} className={`tryon-canvas${status === 'done' ? '' : ' hidden'}`} />

      {status === 'done' && (
        <button className="reset-btn" onClick={reset}>Try a different outfit</button>
      )}
    </div>
  )
}
