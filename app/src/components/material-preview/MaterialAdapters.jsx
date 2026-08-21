import { useFrame } from '@react-three/fiber'
import { useEffect, useMemo } from 'react'
import {
  Color,
  DoubleSide,
  FrontSide,
  MeshPhysicalMaterial,
  Vector2,
} from 'three'
import { assertMaterialPreviewDescriptor } from './previewContract.js'
import { SHADER_RUNTIME_PROFILE, ShaderRecipeRuntimeError } from './useShaderRecipeRuntime.js'

const color = (rgba) => new Color().setRGB(rgba[0], rgba[1], rgba[2])
const materialSide = (shape) => shape === 'plane' ? DoubleSide : FrontSide
const normalScale = (value = 1) => Array.isArray(value)
  ? new Vector2(value[0], value[1])
  : new Vector2(value, value)
const basePhysicalProps = (descriptor, shape) => ({
  color: color(descriptor.material.baseColor),
  emissive: color(descriptor.material.emissiveColor),
  emissiveIntensity: descriptor.material.emissiveIntensity,
  metalness: descriptor.material.metalness,
  roughness: descriptor.material.roughness,
  side: materialSide(shape),
  specularIntensity: descriptor.material.specularIntensity,
})

export function SolidParameterMaterial({ descriptor, shape = 'sphere' }) {
  assertMaterialPreviewDescriptor(descriptor)
  return <meshPhysicalMaterial {...basePhysicalProps(descriptor, shape)} />
}

export function PbrMapsMaterial({ descriptor, shape = 'sphere', textures }) {
  assertMaterialPreviewDescriptor(descriptor)
  if (descriptor.mode !== 'pbr_maps' || !textures?.baseColor || !textures?.normal || !textures?.orm) {
    throw new TypeError('PbrMapsMaterial exige le jeu atomique baseColor, normal et ORM.')
  }
  return (
    <meshPhysicalMaterial
      {...basePhysicalProps(descriptor, shape)}
      aoMap={textures.orm}
      map={textures.baseColor}
      metalnessMap={textures.orm}
      normalMap={textures.normal}
      normalScale={normalScale(descriptor.normalScale)}
      roughnessMap={textures.orm}
      emissiveMap={textures.emissive || null}
    />
  )
}

export function TextureReferenceMaterial({ descriptor, shape = 'sphere', textures }) {
  assertMaterialPreviewDescriptor(descriptor)
  if (descriptor.mode !== 'texture_reference' || !textures?.baseColor) {
    throw new TypeError('TextureReferenceMaterial exige une texture de r\u00e9f\u00e9rence charg\u00e9e.')
  }
  return (
    <meshBasicMaterial
      color="#ffffff"
      map={textures.baseColor}
      side={materialSide(shape)}
      toneMapped={false}
    />
  )
}

const replaceRequired = (source, anchor, replacement) => {
  if (!source.includes(anchor)) {
    throw new ShaderRecipeRuntimeError('THREE_SHADER_ANCHOR_MISSING', `Point d'injection Three.js absent: ${anchor}.`)
  }
  return source.replace(anchor, replacement)
}

const tangentFrame = /* glsl */`
mat3 previewTangentFrame(vec3 eyePosition, vec3 surfaceNormal, vec2 uv) {
  vec3 q0 = dFdx(eyePosition);
  vec3 q1 = dFdy(eyePosition);
  vec2 st0 = dFdx(uv);
  vec2 st1 = dFdy(uv);
  vec3 q1perp = cross(q1, surfaceNormal);
  vec3 q0perp = cross(surfaceNormal, q0);
  vec3 tangent = q1perp * st0.x + q0perp * st1.x;
  vec3 bitangent = q1perp * st0.y + q0perp * st1.y;
  float determinant = max(dot(tangent, tangent), dot(bitangent, bitangent));
  float scale = determinant == 0.0 ? 0.0 : inversesqrt(determinant);
  return mat3(tangent * scale, bitangent * scale, surfaceNormal);
}
`

export function installShaderRecipeRuntime(material, runtimePlan, textures, { resourceKey = '' } = {}) {
  if (!material?.isMeshPhysicalMaterial
    || runtimePlan?.kind !== 'shader_recipe_runtime_plan'
    || runtimePlan.profile !== SHADER_RUNTIME_PROFILE) {
    throw new ShaderRecipeRuntimeError('INVALID_RUNTIME_BINDING', 'Mat\u00e9riau ou plan runtime incompatible.')
  }

  const timeUniform = { value: 0 }
  const textureUniforms = {}
  for (const binding of runtimePlan.program.textureUniforms) {
    const texture = textures?.[binding.role]
    if (!texture?.isTexture) {
      throw new ShaderRecipeRuntimeError(
        'MISSING_RUNTIME_TEXTURE',
        `La texture manifest\u00e9e ${binding.role} n'est pas disponible atomiquement.`,
      )
    }
    textureUniforms[binding.uniform] = { value: texture }
  }

  material.onBeforeCompile = (shader) => {
    shader.uniforms.uPreviewTime = timeUniform
    Object.assign(shader.uniforms, textureUniforms)
    shader.vertexShader = replaceRequired(
      shader.vertexShader,
      '#include <common>',
      '#include <common>\nvarying vec2 vPreviewUv;',
    )
    shader.vertexShader = replaceRequired(
      shader.vertexShader,
      '#include <uv_vertex>',
      '#include <uv_vertex>\nvPreviewUv = uv;',
    )
    shader.fragmentShader = replaceRequired(
      shader.fragmentShader,
      '#include <common>',
      `#include <common>\nvarying vec2 vPreviewUv;\nuniform float uPreviewTime;\n${runtimePlan.program.textureDeclarations}\n${tangentFrame}`,
    )
    shader.fragmentShader = replaceRequired(
      shader.fragmentShader,
      '#include <normal_fragment_maps>',
      `#include <normal_fragment_maps>\n${runtimePlan.program.body}`,
    )
    if (runtimePlan.program.specularExpression) {
      shader.fragmentShader = replaceRequired(
        shader.fragmentShader,
        '#include <lights_physical_fragment>',
        `#define specularIntensity (${runtimePlan.program.specularExpression})\n#include <lights_physical_fragment>\n#undef specularIntensity`,
      )
    }
    if (runtimePlan.program.ambientOcclusionExpression) {
      shader.fragmentShader = replaceRequired(
        shader.fragmentShader,
        '#include <aomap_fragment>',
        `#include <aomap_fragment>\nfloat previewAmbientOcclusion = clamp(${runtimePlan.program.ambientOcclusionExpression}, 0.0, 1.0);\nreflectedLight.indirectDiffuse *= previewAmbientOcclusion;\nreflectedLight.indirectSpecular *= previewAmbientOcclusion;`,
      )
    }
    material.userData.previewShader = shader
  }
  material.customProgramCacheKey = () => `${SHADER_RUNTIME_PROFILE}:${resourceKey}:${JSON.stringify(runtimePlan.compilerPlan)}`
  material.needsUpdate = true
  return Object.freeze({ timeUniform })
}

export function ShaderRecipeMaterial({
  active = true,
  descriptor,
  resourceKey = '',
  runtimePlan,
  shape = 'sphere',
  textures,
}) {
  assertMaterialPreviewDescriptor(descriptor)
  const binding = useMemo(() => {
    const material = new MeshPhysicalMaterial(basePhysicalProps(descriptor, shape))
    return {
      material,
      runtime: installShaderRecipeRuntime(material, runtimePlan, textures, { resourceKey }),
    }
  }, [descriptor, resourceKey, runtimePlan, shape, textures])

  useFrame(({ clock }) => {
    binding.runtime.timeUniform.value = active && descriptor.animated
      ? clock.getElapsedTime()
      : 0
  })

  useEffect(() => () => binding.material.dispose(), [binding])
  return <primitive attach="material" object={binding.material} dispose={null} />
}

export function PreviewMaterialAdapter({
  active = true,
  descriptor,
  resourceKey = '',
  runtimePlan = null,
  shape = 'sphere',
  textures = null,
}) {
  assertMaterialPreviewDescriptor(descriptor)
  switch (descriptor.mode) {
    case 'solid_parameters':
      return <SolidParameterMaterial descriptor={descriptor} shape={shape} />
    case 'pbr_maps':
      return <PbrMapsMaterial descriptor={descriptor} shape={shape} textures={textures} />
    case 'texture_reference':
      return <TextureReferenceMaterial descriptor={descriptor} shape={shape} textures={textures} />
    case 'shader_recipe':
      return (
        <ShaderRecipeMaterial
          active={active}
          descriptor={descriptor}
          resourceKey={resourceKey}
          runtimePlan={runtimePlan}
          shape={shape}
          textures={textures}
        />
      )
    default:
      throw new TypeError(`Le mode ${descriptor.mode} ne peut pas produire un mat\u00e9riau live.`)
  }
}
