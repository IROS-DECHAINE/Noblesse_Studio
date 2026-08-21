# Material preview low-level API

This folder owns the fail-closed preview pipeline. Its descriptor contract is `schemaVersion: 1` with exactly these modes: `rendered_capture`, `pbr_maps`, `solid_parameters`, `shader_recipe`, `texture_reference`, and `unsupported`.

Integration rules:

- Keep one React Three Fiber `Canvas` mounted while the active asset, mode, source overlay, or sphere/plane shape changes.
- Load descriptors through `usePreviewDescriptor({ loadDescriptor: studioApi.materialPreview })`. Descriptor and texture loading each perform one bounded retry by default. The desktop API resolves `descriptor.previewSource` to `descriptor.previewUrl`, map sources to `map.url`, and recipe sources to `graph.textures[].url`.
- Pass the descriptor to `useAtomicTextureSet` and `useShaderRecipeRuntime`, then combine their states with `useAtomicPreviewFailover`.
- Mount `SourcePreviewOverlay` before/under the transparent Canvas at all times. Its `visible` prop changes `data-preview-layer` from `background` to `foreground` during source/warming states; it never unmounts or becomes an empty fallback. It renders a shape-aware disk or panel, labels Unreal captures `Capture source`, and never claims that a capture is live PBR.
- Pass `markCommitted` from `useCommittedLivePreview` to `StudioPreviewScene.onFirstFrame`. The source overlay remains visible until the matching live resource has produced a frame.
- Sphere and plane controls stay enabled for every mode, including `rendered_capture` and `unsupported`.
- Set Canvas `frameloop` to `always` only for the active variant when `descriptor.animated` is true. All other variants remain static.
- `StudioPreviewScene.environmentMap` accepts only a preloaded local Three.js texture; omitting it uses the bounded procedural Lightformer studio. `geometry` accepts a caller-owned `BufferGeometry` for future meshes while sphere and plane remain the built-in choices.

Minimal orchestration:

```jsx
const descriptorState = usePreviewDescriptor({
  assetId: surface.id,
  loadDescriptor: studioApi.materialPreview,
})
const descriptor = descriptorState.descriptor
const textureState = useAtomicTextureSet(descriptor)
const runtimeState = useShaderRecipeRuntime(descriptor)
const targetKey = descriptor
  ? materialPreviewCommitKey(materialPreviewResourceKey(descriptor), shape, renderEpoch)
  : ''
const { committedResourceKey, markCommitted } = useCommittedLivePreview(targetKey)
const presentation = useAtomicPreviewFailover({
  committedResourceKey,
  descriptorState,
  previewUrl: descriptor?.previewUrl,
  renderEpoch,
  runtimeState,
  shape,
  surfacePreviewUrl: surface.preview,
  textureState,
})

return <>
  <SourcePreviewOverlay
    visible={presentation.sourceVisible}
    previewUrl={presentation.previewUrl || presentation.fallbackPreviewUrl}
    label={presentation.label || presentation.fallbackLabel}
    sourceKind={presentation.sourceKind || presentation.fallbackSourceKind}
    shape={shape}
  />
  <Canvas camera={{ position: STUDIO_CAMERA_POSITION, fov: 38 }}>
    <StudioPreviewScene
      active={isActiveVariant}
      onFirstFrame={markCommitted}
      presentation={presentation}
      resetToken={`${surface.id}:${shape}`}
      shape={shape}
    />
  </Canvas>
</>
```

Texture URLs are accepted only from the local `noblesse-vault://preview` scheme or the current web origin. Recipe compilation accepts only the bounded node/property/pin allowlist and returns no partial plan. Unsupported or failed exact rendering falls back to the manifested source without replacing the Canvas.

`shader_recipe` executes the accepted graph algebra and declared PBR outputs through the explicit `three_mesh_physical_allowlist_v1` profile. This is a real-time Three.js studio interpretation, not a claim of pixel-identical Unreal rendering. `texture_reference` is deliberately unlit and is never presented as reconstructed PBR.
