import { ContactShadows, Environment, Lightformer, OrbitControls } from '@react-three/drei'
import { useThree } from '@react-three/fiber'
import {
  forwardRef,
  useEffect,
  useImperativeHandle,
  useRef,
} from 'react'
import { MOUSE, TOUCH } from 'three'
import { PreviewMaterialAdapter } from './MaterialAdapters.jsx'
import { assertMaterialPreviewShape } from './previewContract.js'

export const STUDIO_CAMERA_POSITION = Object.freeze([0, 0.15, 4.45])
export const STUDIO_CAMERA_TARGET = Object.freeze([0, 0.05, 0])

export function LocalStudioEnvironment({ contactShadow = true, environmentMap = null }) {
  if (environmentMap && !environmentMap.isTexture) {
    throw new TypeError('environmentMap doit être une texture Three.js locale déjà chargée.')
  }
  return (
    <>
      <ambientLight intensity={0.2} />
      {environmentMap ? (
        <Environment map={environmentMap} background={false} />
      ) : (
      <Environment resolution={128} frames={1} background={false}>
        <Lightformer
          form="rect"
          color="#fff4df"
          intensity={5.5}
          position={[3.5, 4.2, 4]}
          rotation={[0, -0.55, 0]}
          scale={[4, 2.2, 1]}
        />
        <Lightformer
          form="rect"
          color="#70a7ff"
          intensity={3.2}
          position={[-4, 1.1, 2.2]}
          rotation={[0, 0.9, 0]}
          scale={[2, 3.5, 1]}
        />
        <Lightformer
          form="ring"
          color="#ffc981"
          intensity={2.1}
          position={[0, -1.5, -3.4]}
          rotation={[-0.45, 0, 0]}
          scale={2.8}
        />
      </Environment>
      )}
      {contactShadow && (
        <ContactShadows
          position={[0, -1.38, 0]}
          opacity={0.48}
          scale={5.5}
          blur={2.4}
          far={3.8}
          resolution={256}
          frames={1}
        />
      )}
    </>
  )
}

export const PreviewOrbitControls = forwardRef(function PreviewOrbitControls(
  { enabled = true, resetToken = '' },
  forwardedRef,
) {
  const controls = useRef(null)
  const { camera, invalidate } = useThree()

  const reset = () => {
    camera.position.set(...STUDIO_CAMERA_POSITION)
    camera.fov = 38
    camera.updateProjectionMatrix()
    if (controls.current) {
      controls.current.target.set(...STUDIO_CAMERA_TARGET)
      controls.current.update()
      controls.current.saveState()
    }
    invalidate()
  }

  useImperativeHandle(forwardedRef, () => ({ reset }), [camera, invalidate])
  useEffect(reset, [resetToken])

  return (
    <OrbitControls
      ref={controls}
      makeDefault
      enabled={enabled}
      enablePan={false}
      enableDamping
      dampingFactor={0.075}
      minDistance={2.7}
      maxDistance={7}
      minPolarAngle={0.2}
      maxPolarAngle={Math.PI - 0.2}
      mouseButtons={{ LEFT: MOUSE.ROTATE, MIDDLE: MOUSE.DOLLY, RIGHT: MOUSE.ROTATE }}
      touches={{ ONE: TOUCH.ROTATE, TWO: TOUCH.DOLLY_ROTATE }}
    />
  )
})

export function PreviewSwatch({
  active = true,
  geometry = null,
  onFirstFrame,
  presentation,
  shape = 'sphere',
}) {
  assertMaterialPreviewShape(shape)
  if (geometry && !geometry.isBufferGeometry) {
    throw new TypeError('geometry doit être une BufferGeometry Three.js gérée par l\'intégrateur.')
  }
  const committed = useRef('')
  const resourceKey = presentation?.mode === 'live' ? presentation.commitKey : ''

  useEffect(() => { committed.current = '' }, [resourceKey])
  const reportFrame = () => {
    if (!resourceKey || committed.current === resourceKey) return
    committed.current = resourceKey
    onFirstFrame?.(resourceKey)
  }

  return (
    <mesh
      castShadow={shape === 'sphere'}
      receiveShadow
      onAfterRender={reportFrame}
      position={shape === 'sphere' ? [0, 0.03, 0] : [0, 0.05, 0]}
    >
      {geometry
        ? <primitive attach="geometry" object={geometry} dispose={null} />
        : shape === 'sphere'
          ? <sphereGeometry args={[1.32, 96, 64]} />
          : <planeGeometry args={[2.72, 2.72, 1, 1]} />}
      {presentation?.mode === 'live' ? (
        <PreviewMaterialAdapter
          active={active}
          descriptor={presentation.descriptor}
          resourceKey={presentation.resourceKey}
          runtimePlan={presentation.runtimePlan}
          shape={shape}
          textures={presentation.textures}
        />
      ) : (
        <meshPhysicalMaterial color="#2d4055" metalness={0.08} roughness={0.56} />
      )}
    </mesh>
  )
}

export function StudioPreviewScene({
  active = true,
  controlsRef,
  controlsEnabled = true,
  environmentMap = null,
  geometry = null,
  onFirstFrame,
  presentation,
  resetToken = '',
  shape = 'sphere',
}) {
  assertMaterialPreviewShape(shape)
  return (
    <>
      <LocalStudioEnvironment contactShadow={shape === 'sphere'} environmentMap={environmentMap} />
      <PreviewSwatch
        active={active}
        geometry={geometry}
        onFirstFrame={onFirstFrame}
        presentation={presentation}
        shape={shape}
      />
      <PreviewOrbitControls
        ref={controlsRef}
        enabled={controlsEnabled}
        resetToken={resetToken}
      />
    </>
  )
}

export default StudioPreviewScene
