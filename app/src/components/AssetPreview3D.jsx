import { Bounds, Center, Environment, Lightformer, OrbitControls } from '@react-three/drei'
import { Canvas, useFrame, useLoader } from '@react-three/fiber'
import { Component, Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { MOUSE, TOUCH, Vector3 } from 'three'
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js'
import {
  clampAssetNavigationDelta,
  computeAssetNavigationBlend,
  computeAssetNavigationSpeed,
  normalizeAssetNavigationKey,
  readAssetNavigationIntent,
} from '../lib/assetCameraNavigation.js'

const CANVAS_GL = Object.freeze({
  alpha: true,
  antialias: true,
  powerPreference: 'high-performance',
  preserveDrawingBuffer: false,
})

class AssetPreviewErrorBoundary extends Component {
  state = { failed: false }

  static getDerivedStateFromError() {
    return { failed: true }
  }

  componentDidCatch(error) {
    this.props.onError?.(error)
  }

  componentDidUpdate(previousProps) {
    if (previousProps.resetToken !== this.props.resetToken && this.state.failed) this.setState({ failed: false })
  }

  render() {
    return this.state.failed ? null : this.props.children
  }
}

function AssetModel({ modelUrl, onReady }) {
  // Drei's useGLTF wires MeshoptDecoder by default. That decoder compiles
  // WebAssembly in a way blocked by our deliberate `script-src 'self'` CSP.
  // Our managed previews are exported without Meshopt, so the standard loader
  // is both sufficient and compatible with the production security boundary.
  const { scene } = useLoader(GLTFLoader, modelUrl)
  const instance = useMemo(() => scene.clone(true), [scene])
  useEffect(() => onReady?.(), [onReady])
  return (
    <Bounds fit clip margin={1.22} maxDuration={0.12}>
      <Center bottom>
        <primitive object={instance} dispose={null} />
      </Center>
    </Bounds>
  )
}

function AssetStudioLighting() {
  return (
    <>
      <ambientLight intensity={0.46} />
      <hemisphereLight color="#e9f3ff" groundColor="#142333" intensity={0.92} />
      <directionalLight castShadow color="#fff0d5" intensity={3.1} position={[5, 7, 5]} />
      <directionalLight color="#78aef8" intensity={1.35} position={[-5, 3, 3]} />
      <directionalLight color="#efad70" intensity={1.2} position={[1, 0, -5]} />
      <Environment resolution={128} frames={1} background={false}>
        <Lightformer form="rect" color="#fff3db" intensity={5} position={[4, 5, 4]} scale={[4, 2, 1]} />
        <Lightformer form="rect" color="#6ea7ff" intensity={3} position={[-4, 2, 2]} scale={[2, 4, 1]} />
      </Environment>
    </>
  )
}

const createEmptyNavigationIntent = () => ({
  forward: 0,
  right: 0,
  vertical: 0,
  precise: false,
  remainingSeconds: 0,
})

function AssetKeyboardNavigation({ controlsRef, motionResetRef, pendingIntentRef, pressedKeysRef }) {
  const vectors = useMemo(() => ({
    desiredDirection: new Vector3(),
    forward: new Vector3(),
    right: new Vector3(),
    targetVelocity: new Vector3(),
    velocity: new Vector3(),
  }), [])
  const lastMotionResetRef = useRef(motionResetRef.current)

  useFrame(({ camera, invalidate }, delta) => {
    const controls = controlsRef.current
    if (!controls) return

    if (lastMotionResetRef.current !== motionResetRef.current) {
      lastMotionResetRef.current = motionResetRef.current
      vectors.velocity.set(0, 0, 0)
    }

    const frameDelta = clampAssetNavigationDelta(delta)
    const heldIntent = readAssetNavigationIntent(pressedKeysRef.current)
    const pendingIntent = pendingIntentRef.current
    const hasHeldInput = Boolean(heldIntent.forward || heldIntent.right || heldIntent.vertical)
    const hasPendingInput = pendingIntent.remainingSeconds > 0
      && Boolean(pendingIntent.forward || pendingIntent.right || pendingIntent.vertical)
    const hasInput = hasHeldInput || hasPendingInput
    const intent = hasHeldInput ? heldIntent : pendingIntent

    if (hasHeldInput) pendingIntentRef.current = createEmptyNavigationIntent()
    else if (hasPendingInput) pendingIntent.remainingSeconds = Math.max(0, pendingIntent.remainingSeconds - frameDelta)

    const { desiredDirection, forward, right, targetVelocity, velocity } = vectors
    forward.subVectors(controls.target, camera.position).setY(0)
    if (forward.lengthSq() < 0.000001) camera.getWorldDirection(forward).setY(0)
    if (forward.lengthSq() < 0.000001) forward.set(0, 0, -1)
    forward.normalize()
    right.crossVectors(forward, camera.up).normalize()

    desiredDirection.set(0, 0, 0)
    if (hasInput) {
      desiredDirection
        .addScaledVector(forward, intent.forward)
        .addScaledVector(right, intent.right)
        .addScaledVector(camera.up, intent.vertical)
      if (desiredDirection.lengthSq() > 1) desiredDirection.normalize()
    }

    const speed = hasInput
      ? computeAssetNavigationSpeed({
          distanceToTarget: camera.position.distanceTo(controls.target),
          precise: intent.precise,
        })
      : 0
    targetVelocity.copy(desiredDirection).multiplyScalar(speed)
    const blend = computeAssetNavigationBlend({ deltaSeconds: frameDelta, accelerating: hasInput })
    velocity.lerp(targetVelocity, blend)
    if (!hasInput && velocity.lengthSq() < 0.000001) velocity.set(0, 0, 0)
    if (!hasInput && velocity.lengthSq() === 0) return

    camera.position.addScaledVector(velocity, frameDelta)
    controls.target.addScaledVector(velocity, frameDelta)
    controls.update()
    if (hasInput || velocity.lengthSq() > 0.000001) invalidate()
  })

  return null
}

export default function AssetPreview3D({ modelUrl, posterUrl, resetToken }) {
  const [ready, setReady] = useState(false)
  const [failed, setFailed] = useState(false)
  const controlsRef = useRef(null)
  const invalidateRef = useRef(null)
  const motionResetRef = useRef(0)
  const pendingIntentRef = useRef(createEmptyNavigationIntent())
  const pressedKeysRef = useRef(new Set())
  useEffect(() => {
    setReady(false)
    setFailed(false)
    pendingIntentRef.current = createEmptyNavigationIntent()
    pressedKeysRef.current.clear()
  }, [modelUrl, resetToken])

  const handleKeyDown = useCallback((event) => {
    const key = normalizeAssetNavigationKey(event.key)
    if (!key) return
    event.preventDefault()
    pressedKeysRef.current.add(key)
    if (key !== 'shift' && !event.repeat) {
      const pending = pendingIntentRef.current
      if (key === 'z') pending.forward += 1
      if (key === 's') pending.forward -= 1
      if (key === 'd') pending.right += 1
      if (key === 'q') pending.right -= 1
      if (key === 'e') pending.vertical += 1
      if (key === 'a') pending.vertical -= 1
      pending.precise = pressedKeysRef.current.has('shift')
      pending.remainingSeconds = 0.085
    }
    invalidateRef.current?.()
  }, [])

  const handleKeyUp = useCallback((event) => {
    const key = normalizeAssetNavigationKey(event.key)
    if (!key) return
    event.preventDefault()
    pressedKeysRef.current.delete(key)
    invalidateRef.current?.()
  }, [])

  const releaseKeys = useCallback(() => {
    pendingIntentRef.current = createEmptyNavigationIntent()
    pressedKeysRef.current.clear()
  }, [])

  const resetCamera = useCallback(() => {
    pendingIntentRef.current = createEmptyNavigationIntent()
    pressedKeysRef.current.clear()
    motionResetRef.current += 1
    controlsRef.current?.reset?.()
    invalidateRef.current?.()
  }, [])

  return (
    <div
      className={`asset-preview-3d${ready ? ' is-ready' : ''}${failed || !modelUrl ? ' is-poster-only' : ''}`}
      data-preview-status={failed ? 'fallback' : ready ? 'live' : 'loading'}
      tabIndex={0}
      role="application"
      aria-label="Aperçu 3D interactif. Z Q S D pour se déplacer, A et E pour descendre et monter, Maj pour la précision."
      onPointerDownCapture={(event) => event.currentTarget.focus({ preventScroll: true })}
      onWheelCapture={(event) => event.currentTarget.focus({ preventScroll: true })}
      onKeyDown={handleKeyDown}
      onKeyUp={handleKeyUp}
      onBlur={releaseKeys}
      onContextMenu={(event) => event.preventDefault()}
      onDoubleClick={resetCamera}
    >
      <div className="asset-preview-poster">
        {posterUrl ? <img src={posterUrl} alt="" /> : <i />}
      </div>
      {modelUrl && !failed && (
        <Canvas
          camera={{ position: [5.2, 3.8, 6.4], fov: 36, near: 0.01, far: 10_000 }}
          dpr={[1, 2]}
          frameloop="demand"
          gl={CANVAS_GL}
          shadows="percentage"
          onCreated={({ gl, invalidate }) => {
            gl.setClearColor('#07111c', 0)
            invalidateRef.current = invalidate
          }}
        >
          <AssetPreviewErrorBoundary resetToken={resetToken} onError={() => setFailed(true)}>
            <Suspense fallback={null}>
              <AssetModel modelUrl={modelUrl} onReady={() => setReady(true)} />
              <AssetStudioLighting />
              <AssetKeyboardNavigation
                controlsRef={controlsRef}
                motionResetRef={motionResetRef}
                pendingIntentRef={pendingIntentRef}
                pressedKeysRef={pressedKeysRef}
              />
              <OrbitControls
                ref={controlsRef}
                makeDefault
                enablePan={false}
                enableDamping
                dampingFactor={0.075}
                minDistance={0.1}
                maxDistance={1_000}
                zoomSpeed={0.35}
                zoomToCursor
                mouseButtons={{ LEFT: MOUSE.ROTATE, MIDDLE: MOUSE.DOLLY, RIGHT: MOUSE.ROTATE }}
                touches={{ ONE: TOUCH.ROTATE, TWO: TOUCH.DOLLY_ROTATE }}
              />
            </Suspense>
          </AssetPreviewErrorBoundary>
        </Canvas>
      )}
      <span className="preview-help">Souris : tourner · molette : zoom précis · ZQSD : déplacer · A/E : bas/haut · Maj : précision</span>
      <span className="preview-fidelity">{ready ? 'Modèle 3D local' : failed || !modelUrl ? 'Rendu source' : 'Chargement 3D…'}</span>
    </div>
  )
}
