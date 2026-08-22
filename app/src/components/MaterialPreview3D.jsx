import { Canvas } from '@react-three/fiber'
import { Component, useEffect, useMemo, useRef, useState } from 'react'
import {
  SourcePreviewOverlay,
  STUDIO_CAMERA_POSITION,
  StudioPreviewScene,
  materialPreviewCommitKey,
  materialPreviewResourceKey,
  useAtomicPreviewFailover,
  useAtomicTextureSet,
  useCommittedLivePreview,
  useShaderRecipeRuntime,
} from './material-preview/index.js'

const CANVAS_GL = Object.freeze({
  alpha: true,
  antialias: true,
  powerPreference: 'high-performance',
  preserveDrawingBuffer: false,
})

class PreviewErrorBoundary extends Component {
  state = { failed: false, retried: false }

  static getDerivedStateFromError() {
    return { failed: true }
  }

  componentDidCatch(error) {
    this.props.onError?.(error)
    if (!this.state.retried) {
      window.clearTimeout(this.retryTimer)
      this.retryTimer = window.setTimeout(() => this.setState({ failed: false, retried: true }), 250)
    }
  }

  componentDidUpdate(previousProps) {
    if (previousProps.resetToken !== this.props.resetToken && (this.state.failed || this.state.retried)) {
      window.clearTimeout(this.retryTimer)
      this.setState({ failed: false, retried: false })
    }
  }

  componentWillUnmount() {
    window.clearTimeout(this.retryTimer)
  }

  render() {
    return this.state.failed ? null : this.props.children
  }
}

const rgbaToCss = (rgba, fallback = '#2d4055') => {
  if (!Array.isArray(rgba) || rgba.length < 3) return fallback || '#2d4055'
  const channels = rgba.slice(0, 3).map((value) => Math.round(Math.max(0, Math.min(1, Number(value) || 0)) * 255))
  return `rgb(${channels.join(' ')})`
}

export default function MaterialPreview3D({ descriptorState, shape, surface, preview }) {
  const descriptor = descriptorState?.descriptor || null
  const textureState = useAtomicTextureSet(descriptor, {
    maxAnisotropy: 16,
    maxRetries: 2,
    retryDelayMs: 220,
  })
  const runtimeState = useShaderRecipeRuntime(descriptor)
  const resourceKey = useMemo(
    () => descriptor ? materialPreviewResourceKey(descriptor) : '',
    [descriptor],
  )
  const renderResetToken = `${surface.id}:${surface.assetId || ''}:${shape}`
  const cameraResetToken = `${surface.id}:${shape}`
  const commitKey = materialPreviewCommitKey(resourceKey, shape, 0)
  const { committedResourceKey, markCommitted } = useCommittedLivePreview(commitKey)
  const [renderFailed, setRenderFailed] = useState(false)
  const controlsRef = useRef(null)

  useEffect(() => setRenderFailed(false), [renderResetToken])

  const presentation = useAtomicPreviewFailover({
    committedResourceKey,
    descriptorState,
    previewUrl: descriptor?.previewUrl || preview,
    renderEpoch: 0,
    runtimeState,
    shape,
    surfacePreviewUrl: preview,
    textureState,
  })
  const sourcePresentation = renderFailed
    ? {
        ...presentation,
        diagnostic: 'render_error',
        label: descriptor?.mode === 'rendered_capture' ? 'Capture source' : 'Aperçu source',
        mode: 'source',
        previewUrl: descriptor?.previewUrl || preview,
        sourceKind: descriptor?.mode === 'rendered_capture' ? 'rendered_capture' : 'poster',
        sourceVisible: true,
      }
    : presentation
  const sourceUrl = sourcePresentation.previewUrl
    || sourcePresentation.fallbackPreviewUrl
    || descriptor?.previewUrl
    || preview
    || ''
  const sourceLabel = sourcePresentation.label
    || sourcePresentation.fallbackLabel
    || descriptor?.fidelityLabel
    || 'Aperçu source'
  const sourceKind = sourcePresentation.sourceKind
    || sourcePresentation.fallbackSourceKind
    || (descriptor?.mode === 'rendered_capture' ? 'rendered_capture' : 'poster')
  const fallbackColor = rgbaToCss(descriptor?.material?.baseColor, surface.previewColor)
  const liveAnimation = sourcePresentation.mode === 'live' && Boolean(descriptor?.animated)

  return (
    <div
      className={`material-preview-3d is-${shape}`}
      data-preview-mode={descriptor?.mode || 'loading'}
      data-preview-status={sourcePresentation.diagnostic || descriptorState?.status || 'loading'}
      onContextMenu={(event) => event.preventDefault()}
      onDoubleClick={() => controlsRef.current?.reset?.()}
    >
      <SourcePreviewOverlay
        color={fallbackColor}
        label={sourceLabel}
        previewUrl={sourceUrl}
        shape={shape}
        sourceKind={sourceKind}
        visible={Boolean(sourcePresentation.sourceVisible)}
      />

      <Canvas
        camera={{ position: STUDIO_CAMERA_POSITION, fov: 38 }}
        dpr={[1, 2]}
        frameloop={liveAnimation ? 'always' : 'demand'}
        gl={CANVAS_GL}
        shadows="percentage"
        onCreated={({ gl }) => gl.setClearColor('#07111c', 0)}
      >
        <PreviewErrorBoundary
          resetToken={renderResetToken}
          onError={(error) => {
            console.error('[Noblesse Studio] Le rendu exact a échoué, la preuve source est conservée.', error)
            setRenderFailed(true)
          }}
        >
          <StudioPreviewScene
            active
            controlsRef={controlsRef}
            onFirstFrame={markCommitted}
            presentation={sourcePresentation}
            resetToken={cameraResetToken}
            shape={shape}
          />
        </PreviewErrorBoundary>
      </Canvas>

      <span
        key={surface.assetId || surface.id}
        className="material-preview-switch-shade"
        aria-hidden="true"
      />

      <span className="preview-help">Clic droit : tourner · molette : zoom · double-clic : centrer</span>
      {descriptor?.fidelityLabel && <span className="preview-fidelity">{descriptor.fidelityLabel}</span>}
      {liveAnimation && <span className="preview-live"><i /> Animation temps réel</span>}
    </div>
  )
}
