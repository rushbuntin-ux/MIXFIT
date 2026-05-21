import { useRef, useState, useCallback } from 'react'
import { FilesetResolver, PoseLandmarker } from '@mediapipe/tasks-vision'
import type { NormalizedLandmark } from '@mediapipe/tasks-vision'
import type { FitZone } from './types'
import './BodyFitVisualization.css'

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

function zoneColor(fitZones: FitZone[], name: string): string {
  const z = fitZones.find(z => z.zone === name)
  return z ? ZONE_COLORS[z.status] : 'rgba(150,150,150,0.3)'
}

function zoneLabel(fitZones: FitZone[], name: string): string {
  const z = fitZones.find(z => z.zone === name)
  return z ? ZONE_LABELS[z.status] : ''
}

function fillZone(
  ctx: CanvasRenderingContext2D,
  x: number, y: number, w: number, h: number,
  color: string, label: string, fontSize: number
) {
  ctx.save()
  ctx.fillStyle = color
  ctx.beginPath()
  const r = Math.min(w, h) * 0.14
  ctx.roundRect(x, y, w, h, r)
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

function drawOverlays(
  ctx: CanvasRenderingContext2D,
  lm: NormalizedLandmark[],
  W: number,
  H: number,
  fitZones: FitZone[]
) {
  const px = (i: number) => ({ x: lm[i].x * W, y: lm[i].y * H })
  const zones = new Set(fitZones.map(z => z.zone))
  const fontSize = Math.max(11, W * 0.024)

  const lShoulder = px(11)
  const rShoulder = px(12)
  const lHip     = px(23)
  const rHip     = px(24)
  const lKnee    = px(25)
  const rKnee    = px(26)
  const lAnkle   = px(27)
  const rAnkle   = px(28)
  const nose     = px(0)

  const sCX = (lShoulder.x + rShoulder.x) / 2
  const sCY = (lShoulder.y + rShoulder.y) / 2
  const hCX = (lHip.x + rHip.x) / 2
  const hCY = (lHip.y + rHip.y) / 2
  const sW  = Math.abs(rShoulder.x - lShoulder.x)
  const hW  = Math.abs(rHip.x - lHip.x)
  const torsoH = hCY - sCY

  if (zones.has('neck')) {
    const nW = sW * 0.28
    const nTop = nose.y + (sCY - nose.y) * 0.4
    fillZone(ctx, sCX - nW / 2, nTop, nW, sCY - nTop,
      zoneColor(fitZones, 'neck'), zoneLabel(fitZones, 'neck'), fontSize)
  }

  if (zones.has('chest')) {
    fillZone(
      ctx,
      sCX - sW * 0.62, sCY,
      sW * 1.24, torsoH * 0.42,
      zoneColor(fitZones, 'chest'), zoneLabel(fitZones, 'chest'), fontSize
    )
  }

  if (zones.has('waist')) {
    const wW = (sW + hW) / 2 * 1.05
    fillZone(
      ctx,
      sCX - wW / 2, sCY + torsoH * 0.44,
      wW, torsoH * 0.32,
      zoneColor(fitZones, 'waist'), zoneLabel(fitZones, 'waist'), fontSize
    )
  }

  if (zones.has('hip')) {
    fillZone(
      ctx,
      hCX - hW * 0.72, hCY - torsoH * 0.06,
      hW * 1.44, torsoH * 0.28,
      zoneColor(fitZones, 'hip'), zoneLabel(fitZones, 'hip'), fontSize
    )
  }

  if (zones.has('thigh')) {
    const thighH = ((lKnee.y + rKnee.y) / 2 - hCY) * 0.85
    const thighW = sW * 0.38
    fillZone(ctx, lHip.x - thighW / 2, hCY + torsoH * 0.18, thighW, thighH,
      zoneColor(fitZones, 'thigh'), zoneLabel(fitZones, 'thigh'), fontSize)
    fillZone(ctx, rHip.x - thighW / 2, hCY + torsoH * 0.18, thighW, thighH,
      zoneColor(fitZones, 'thigh'), '', fontSize)
  }

  if (zones.has('inseam')) {
    const ankleY = (lAnkle.y + rAnkle.y) / 2
    const legH = (ankleY - hCY) * 0.88
    const inW = sW * 0.13
    fillZone(ctx, hCX - inW / 2, hCY + torsoH * 0.18, inW, legH,
      zoneColor(fitZones, 'inseam'), zoneLabel(fitZones, 'inseam'), fontSize)
  }
}

interface Props {
  fitZones: FitZone[]
}

export default function BodyFitVisualization({ fitZones }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [status, setStatus] = useState<'idle' | 'loading' | 'done' | 'error'>('idle')
  const [errorMsg, setErrorMsg] = useState('')

  const handleFile = useCallback(async (file: File) => {
    const canvas = canvasRef.current
    if (!canvas) return
    setStatus('loading')
    setErrorMsg('')

    try {
      const img = new Image()
      img.src = URL.createObjectURL(file)
      await new Promise<void>((res, rej) => {
        img.onload = () => res()
        img.onerror = () => rej(new Error('load'))
      })

      const MAX_W = 520
      const scale = Math.min(1, MAX_W / img.naturalWidth)
      canvas.width  = img.naturalWidth  * scale
      canvas.height = img.naturalHeight * scale

      const ctx = canvas.getContext('2d')!
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height)

      const landmarker = await loadLandmarker()
      const result = landmarker.detect(img)

      if (!result.landmarks?.length) {
        setErrorMsg('No person detected — try a clear full-body photo facing the camera.')
        setStatus('error')
        return
      }

      drawOverlays(ctx, result.landmarks[0], canvas.width, canvas.height, fitZones)
      setStatus('done')
    } catch {
      setErrorMsg('Could not process the photo. Please try again.')
      setStatus('error')
    }
  }, [fitZones])

  return (
    <div className="body-viz">
      <div className="body-viz-title">Fit on Your Body</div>

      {status !== 'done' && (
        <label className="upload-area">
          <input
            type="file"
            accept="image/*"
            onChange={e => {
              const f = e.target.files?.[0]
              if (f) handleFile(f)
            }}
          />
          {status === 'loading'
            ? <span className="viz-loading">Detecting pose…</span>
            : <>
                <span className="upload-cta">Upload a full-body photo</span>
                <span className="upload-hint">Stand straight, facing the camera</span>
              </>
          }
        </label>
      )}

      {status === 'error' && <p className="viz-error">{errorMsg}</p>}

      <canvas
        ref={canvasRef}
        className={`viz-canvas${status === 'done' ? '' : ' hidden'}`}
      />

      {status === 'done' && (
        <button className="retake-btn" onClick={() => setStatus('idle')}>
          Use different photo
        </button>
      )}
    </div>
  )
}
