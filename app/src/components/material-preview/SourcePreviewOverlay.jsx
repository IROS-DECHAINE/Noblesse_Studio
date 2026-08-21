import { useEffect, useState } from 'react'
import { assertLocalPreviewUri } from './localPreviewUri.js'
import { assertMaterialPreviewShape } from './previewContract.js'

export const SAFE_SOURCE_POSTER_COLOR = '#2d4055'

export default function SourcePreviewOverlay({
  color = SAFE_SOURCE_POSTER_COLOR,
  label = 'Aper\u00e7u source',
  onImageError,
  previewUrl = '',
  shape = 'sphere',
  sourceKind = 'poster',
  visible = true,
}) {
  assertMaterialPreviewShape(shape)
  const [imageFailed, setImageFailed] = useState(false)
  const frameStyle = {
    aspectRatio: '1 / 1',
    backgroundColor: color || SAFE_SOURCE_POSTER_COLOR,
    borderRadius: shape === 'sphere' ? '50%' : '10px',
    overflow: 'hidden',
  }
  const safeUrl = (() => {
    if (!previewUrl || imageFailed) return ''
    try {
      return assertLocalPreviewUri(previewUrl)
    } catch {
      return ''
    }
  })()

  useEffect(() => setImageFailed(false), [previewUrl])

  return (
    <div
      className={`material-preview-source-overlay is-${shape} is-${sourceKind} ${visible ? 'is-foreground' : 'is-background'}`}
      data-preview-fidelity="source"
      data-preview-layer={visible ? 'foreground' : 'background'}
      data-preview-shape={shape}
      role={visible ? 'img' : 'presentation'}
      aria-label={visible ? label : undefined}
      aria-hidden={visible ? undefined : 'true'}
    >
      <i className="material-preview-source-frame" style={frameStyle}>
        {safeUrl && (
          <img
            src={safeUrl}
            alt=""
            draggable="false"
            decoding="async"
            onError={(event) => {
              setImageFailed(true)
              onImageError?.(event)
            }}
          />
        )}
      </i>
      {visible && <span className="material-preview-source-label">{label}</span>}
    </div>
  )
}
