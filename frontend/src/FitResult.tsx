import type { SizeRecommendation, FitZone } from './types'
import VirtualTryOn from './VirtualTryOn'
import './FitResult.css'

const STATUS_LABEL: Record<FitZone['status'], string> = {
  tight: 'Snug fit',
  loose: 'Extra room',
  good: 'Good fit',
}

const STATUS_COLOR: Record<FitZone['status'], string> = {
  tight: '#e05252',
  loose: '#e09a52',
  good: '#52a852',
}

const CONFIDENCE_BADGE: Record<SizeRecommendation['confidence'], string> = {
  exact: 'Perfect match',
  size_up: 'Consider sizing up',
  size_down: 'Consider sizing down',
  between_sizes: 'Between sizes',
}

export default function FitResult({ result }: { result: SizeRecommendation }) {
  const hasWarning = result.confidence !== 'exact'

  return (
    <div className="fit-result">
      <div className="result-header">
        <div className="size-badge">{result.recommended_size}</div>
        <div className="result-meta">
          <span className={`confidence-tag${hasWarning ? ' warn' : ''}`}>
            {CONFIDENCE_BADGE[result.confidence]}
          </span>
        </div>
      </div>

      <p className="result-notes">{result.notes}</p>

      <div className="zones-title">Fit Breakdown</div>
      <div className="zones">
        {result.fit_zones.map(zone => (
          <div key={zone.zone} className="zone-row">
            <span className="zone-name">{zone.zone}</span>
            <span className="zone-bar-wrap">
              <span
                className="zone-bar"
                style={{ background: STATUS_COLOR[zone.status], width: '100%' }}
              />
            </span>
            <span className="zone-status" style={{ color: STATUS_COLOR[zone.status] }}>
              {STATUS_LABEL[zone.status]}
            </span>
          </div>
        ))}
      </div>

      <VirtualTryOn fitZones={result.fit_zones} />
    </div>
  )
}
