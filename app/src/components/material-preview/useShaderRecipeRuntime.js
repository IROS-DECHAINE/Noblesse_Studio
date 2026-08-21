import { useMemo } from 'react'
import { compileShaderRecipe } from './shaderRecipeCompiler.js'
import { shaderRecipeCompilerInput } from './shaderRecipeTransport.js'
import {
  assertMaterialPreviewDescriptor,
  materialPreviewResourceKey,
} from './previewContract.js'

export const SHADER_RUNTIME_PROFILE = 'three_mesh_physical_allowlist_v1'

export class ShaderRecipeRuntimeError extends Error {
  constructor(code, message, details = {}, cause = null) {
    super(message, cause ? { cause } : undefined)
    this.name = 'ShaderRecipeRuntimeError'
    this.code = code
    this.details = details
  }
}

const GLSL_TYPES = new Set(['scalar', 'vec2', 'vec3', 'vec4'])
const glslType = (type) => type === 'scalar' ? 'float' : type
const floatLiteral = (value) => {
  if (!Number.isFinite(value)) throw new ShaderRecipeRuntimeError('NON_FINITE_NUMBER', 'Le plan contient un nombre non fini.')
  const literal = Number(value).toString()
  return literal.includes('.') || /e/i.test(literal) ? literal : `${literal}.0`
}
const vectorLiteral = (type, values) => `${type}(${values.map(floatLiteral).join(', ')})`

const coerce = (expression, fromType, toType) => {
  if (fromType === toType) return expression
  if (fromType === 'scalar' && GLSL_TYPES.has(toType)) return `${glslType(toType)}(${expression})`
  if (fromType === 'vec4' && toType === 'vec3') return `(${expression}).rgb`
  throw new ShaderRecipeRuntimeError(
    'UNSUPPORTED_RUNTIME_CAST',
    `Conversion shader non autorisée: ${fromType} vers ${toType}.`,
  )
}

const outputSwizzle = Object.freeze({
  a: '.a',
  b: '.b',
  g: '.g',
  r: '.r',
  rgb: '.rgb',
  rgba: '',
  value: '',
})

function buildProgram(plan) {
  if (plan?.kind !== 'shader_recipe_plan' || plan.schemaVersion !== 1) {
    throw new ShaderRecipeRuntimeError('INVALID_COMPILER_PLAN', 'Plan shader compilé non pris en charge.')
  }

  const variables = new Map()
  const textureUniforms = new Map(plan.textures.map(({ role }, index) => [role, `uPreviewTexture${index}`]))
  const reference = (input) => {
    if (input?.builtin === 'uv0') return { expression: 'vPreviewUv', type: 'vec2' }
    const variable = variables.get(input?.node)
    if (!variable || !Object.hasOwn(outputSwizzle, input.output)) {
      throw new ShaderRecipeRuntimeError('INVALID_PLAN_REFERENCE', 'Référence de plan shader invalide.', { input })
    }
    return { expression: `${variable.name}${outputSwizzle[input.output]}`, type: input.type }
  }
  const binary = (left, right, resultType, operator) => {
    const a = reference(left)
    const b = reference(right)
    return `(${coerce(a.expression, a.type, resultType)} ${operator} ${coerce(b.expression, b.type, resultType)})`
  }

  const body = []
  for (let index = 0; index < plan.operations.length; index += 1) {
    const operation = plan.operations[index]
    if (!GLSL_TYPES.has(operation.resultType)) {
      throw new ShaderRecipeRuntimeError('INVALID_RESULT_TYPE', 'Type de résultat shader non pris en charge.', { operation })
    }
    const name = `previewNode${index}`
    let expression
    switch (operation.op) {
      case 'constantColor':
        expression = vectorLiteral('vec4', operation.value)
        break
      case 'constantScalar':
        expression = floatLiteral(operation.value)
        break
      case 'uv0':
        expression = `(vPreviewUv * ${vectorLiteral('vec2', operation.scale)})`
        break
      case 'time':
        expression = 'uPreviewTime'
        break
      case 'panner': {
        const coordinate = reference(operation.coordinate)
        expression = `(${coordinate.expression} + uPreviewTime * ${vectorLiteral('vec2', operation.speed)})`
        break
      }
      case 'rotator': {
        const coordinate = reference(operation.coordinate)
        const center = vectorLiteral('vec2', operation.center)
        const angle = `(uPreviewTime * ${floatLiteral(operation.speed)} * 6.28318530718)`
        expression = `(${center} + mat2(cos(${angle}), -sin(${angle}), sin(${angle}), cos(${angle})) * (${coordinate.expression} - ${center}))`
        break
      }
      case 'textureSample': {
        const uniform = textureUniforms.get(operation.textureRole)
        if (!uniform) throw new ShaderRecipeRuntimeError('UNBOUND_TEXTURE_ROLE', 'Rôle texture absent du plan.', { operation })
        expression = `texture2D(${uniform}, ${reference(operation.uv).expression})`
        break
      }
      case 'sine': {
        const input = reference(operation.input)
        expression = `sin((${input.expression} / ${floatLiteral(operation.period)}) * 6.28318530718)`
        break
      }
      case 'fresnel':
        expression = `(${floatLiteral(operation.baseReflectFraction)} + (1.0 - ${floatLiteral(operation.baseReflectFraction)}) * pow(1.0 - clamp(dot(normalize(normal), normalize(vViewPosition)), 0.0, 1.0), ${floatLiteral(operation.exponent)}))`
        break
      case 'add':
        expression = binary(operation.a, operation.b, operation.resultType, '+')
        break
      case 'multiply':
        expression = binary(operation.a, operation.b, operation.resultType, '*')
        break
      case 'lerp': {
        const a = reference(operation.a)
        const b = reference(operation.b)
        const alpha = reference(operation.alpha)
        expression = `mix(${coerce(a.expression, a.type, operation.resultType)}, ${coerce(b.expression, b.type, operation.resultType)}, ${coerce(alpha.expression, alpha.type, operation.resultType)})`
        break
      }
      default:
        throw new ShaderRecipeRuntimeError('UNSUPPORTED_RUNTIME_OPERATION', `Opération runtime refusée: ${operation.op}.`)
    }
    variables.set(operation.id, { name, type: operation.resultType })
    body.push(`${glslType(operation.resultType)} ${name} = ${expression};`)
  }

  const output = (slot, targetType) => {
    const descriptor = plan.outputs[slot]
    if (!descriptor) return ''
    const value = reference(descriptor)
    return coerce(value.expression, value.type, targetType)
  }

  const assignments = []
  const baseColor = output('baseColor', 'vec3')
  const normal = output('normal', 'vec3')
  const roughness = output('roughness', 'scalar')
  const metalness = output('metalness', 'scalar')
  const emissive = output('emissiveColor', 'vec3')
  if (baseColor) assignments.push(`diffuseColor.rgb = clamp(${baseColor}, vec3(0.0), vec3(1.0));`)
  if (roughness) assignments.push(`roughnessFactor = clamp(${roughness}, 0.0, 1.0);`)
  if (metalness) assignments.push(`metalnessFactor = clamp(${metalness}, 0.0, 1.0);`)
  if (normal) assignments.push(`normal = normalize(previewTangentFrame(-vViewPosition, normal, vPreviewUv) * (${normal} * 2.0 - 1.0));`)
  if (emissive) assignments.push(`totalEmissiveRadiance = max(${emissive}, vec3(0.0));`)

  const specular = output('specular', 'scalar')
  const ambientOcclusion = output('ambientOcclusion', 'scalar')
  const textureDeclarations = plan.textures
    .map(({ role }, index) => `uniform sampler2D uPreviewTexture${index}; // ${role}`)
    .join('\n')

  return Object.freeze({
    ambientOcclusionExpression: ambientOcclusion,
    body: [...body, ...assignments].join('\n'),
    specularExpression: specular,
    textureDeclarations,
    textureUniforms: Object.freeze(plan.textures.map(({ role }, index) => Object.freeze({
      role,
      uniform: `uPreviewTexture${index}`,
    }))),
  })
}

export function prepareShaderRecipeRuntime(descriptor) {
  try {
    assertMaterialPreviewDescriptor(descriptor)
    if (descriptor.mode !== 'shader_recipe') {
      throw new ShaderRecipeRuntimeError('INVALID_RUNTIME_MODE', 'Le runtime shader exige le mode shader_recipe.')
    }
    const compiled = compileShaderRecipe(shaderRecipeCompilerInput(descriptor.graph))
    if (!compiled.ok) {
      throw new ShaderRecipeRuntimeError(
        'SHADER_RECIPE_REJECTED',
        'La recette shader a été refusée sans plan partiel.',
        { errors: compiled.errors },
      )
    }
    if (!compiled.plan.features.usesTime) {
      throw new ShaderRecipeRuntimeError(
        'UNPROVEN_RUNTIME_ANIMATION',
        'La recette animée ne relie aucun noeud temporel à une sortie matériau.',
      )
    }
    const program = buildProgram(compiled.plan)
    return {
      error: null,
      plan: Object.freeze({
        compilerPlan: compiled.plan,
        kind: 'shader_recipe_runtime_plan',
        profile: SHADER_RUNTIME_PROFILE,
        program,
        schemaVersion: 1,
      }),
      resourceKey: materialPreviewResourceKey(descriptor),
      status: 'ready',
    }
  } catch (error) {
    return { error, plan: null, resourceKey: '', status: 'error' }
  }
}

export { shaderRecipeCompilerInput }

export function useShaderRecipeRuntime(descriptor) {
  return useMemo(
    () => descriptor?.mode === 'shader_recipe'
      ? prepareShaderRecipeRuntime(descriptor)
      : { error: null, plan: null, resourceKey: '', status: 'disabled' },
    [descriptor],
  )
}
