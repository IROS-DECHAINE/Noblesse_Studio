import { useEffect, useRef } from 'react'
import { getSkinDefinition } from '../lib/skinPreferences.js'

const vertexShaderSource = `
  attribute vec2 a_position;

  void main() {
    gl_Position = vec4(a_position, 0.0, 1.0);
  }
`

const fragmentShaderSource = `
  precision highp float;

  uniform vec2 u_resolution;
  uniform vec2 u_pointer;
  uniform float u_time;
  uniform float u_intensity;
  uniform vec3 u_primary;
  uniform vec3 u_secondary;
  uniform vec3 u_accent;

  float hash(vec2 point) {
    return fract(sin(dot(point, vec2(127.1, 311.7))) * 43758.5453123);
  }

  float noise(vec2 point) {
    vec2 cell = floor(point);
    vec2 local = fract(point);
    vec2 curve = local * local * (3.0 - 2.0 * local);
    float a = hash(cell);
    float b = hash(cell + vec2(1.0, 0.0));
    float c = hash(cell + vec2(0.0, 1.0));
    float d = hash(cell + vec2(1.0, 1.0));
    return mix(mix(a, b, curve.x), mix(c, d, curve.x), curve.y);
  }

  float fbm(vec2 point) {
    float value = 0.0;
    float amplitude = 0.52;
    mat2 rotation = mat2(0.80, -0.60, 0.60, 0.80);
    for (int octave = 0; octave < 5; octave++) {
      value += amplitude * noise(point);
      point = rotation * point * 2.03 + vec2(7.1, 3.7);
      amplitude *= 0.48;
    }
    return value;
  }

  void main() {
    vec2 uv = gl_FragCoord.xy / u_resolution.xy;
    float aspect = u_resolution.x / max(u_resolution.y, 1.0);
    vec2 field = vec2((uv.x - 0.5) * aspect, uv.y - 0.5);
    float time = u_time;

    vec2 firstWarp = vec2(
      fbm(field * 1.35 + vec2(time * 0.055, -time * 0.038)),
      fbm(field * 1.28 + vec2(-time * 0.041, time * 0.052) + 4.7)
    );
    vec2 secondWarp = vec2(
      fbm(field * 1.75 + firstWarp * 2.35 + vec2(-time * 0.033, time * 0.044)),
      fbm(field * 1.62 + firstWarp * 2.10 + vec2(time * 0.046, time * 0.029) + 8.9)
    );

    float body = fbm(field * 2.15 + secondWarp * 2.8);
    float folded = abs(sin((body + secondWarp.x * 0.72 - secondWarp.y * 0.38) * 7.2 + time * 0.11));
    float ribbon = 1.0 - smoothstep(0.08, 0.52, folded);
    float mist = smoothstep(0.49, 0.88, body) * 0.48;
    float filament = 1.0 - smoothstep(0.015, 0.13, abs(body - 0.57));

    vec2 pointer = vec2((u_pointer.x - 0.5) * aspect, u_pointer.y - 0.5);
    vec2 pointerDelta = field - pointer;
    float pointerDistance = length(pointerDelta);
    float pointerVortex = exp(-pointerDistance * 5.8) * (0.5 + 0.5 * sin(atan(pointerDelta.y, pointerDelta.x) * 3.0 - time * 0.7));

    float edgeMask = smoothstep(0.92, 0.18, length(field * vec2(0.73, 1.0)));
    float current = (ribbon * 0.48 + mist + filament * 0.22 + pointerVortex * 0.15) * edgeMask;
    float shimmer = smoothstep(0.55, 0.92, secondWarp.y + body * 0.34);
    vec3 color = mix(u_primary, u_secondary, smoothstep(0.25, 0.82, secondWarp.x));
    color = mix(color, u_accent, shimmer * (filament * 0.58 + pointerVortex * 0.2));

    float alpha = clamp(current * 0.38 * u_intensity, 0.0, 0.42);
    gl_FragColor = vec4(color, alpha);
  }
`

const hexToRgb = (hex) => {
  const normalized = String(hex || '').replace('#', '')
  const value = Number.parseInt(normalized, 16)
  return [
    ((value >> 16) & 255) / 255,
    ((value >> 8) & 255) / 255,
    (value & 255) / 255,
  ]
}

const compileShader = (gl, type, source) => {
  const shader = gl.createShader(type)
  gl.shaderSource(shader, source)
  gl.compileShader(shader)
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    gl.deleteShader(shader)
    return null
  }
  return shader
}

const createProgram = (gl) => {
  const vertexShader = compileShader(gl, gl.VERTEX_SHADER, vertexShaderSource)
  const fragmentShader = compileShader(gl, gl.FRAGMENT_SHADER, fragmentShaderSource)
  if (!vertexShader || !fragmentShader) return null

  const program = gl.createProgram()
  gl.attachShader(program, vertexShader)
  gl.attachShader(program, fragmentShader)
  gl.linkProgram(program)
  gl.deleteShader(vertexShader)
  gl.deleteShader(fragmentShader)

  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
    gl.deleteProgram(program)
    return null
  }
  return program
}

export default function SkinFluidCanvas({ skinId, motion }) {
  const canvasRef = useRef(null)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas || motion === 'off') return undefined

    const gl = canvas.getContext('webgl', {
      alpha: true,
      antialias: false,
      depth: false,
      powerPreference: 'high-performance',
      premultipliedAlpha: false,
    })
    if (!gl) return undefined

    const program = createProgram(gl)
    if (!program) return undefined

    const buffer = gl.createBuffer()
    gl.bindBuffer(gl.ARRAY_BUFFER, buffer)
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW)
    gl.useProgram(program)

    const positionLocation = gl.getAttribLocation(program, 'a_position')
    gl.enableVertexAttribArray(positionLocation)
    gl.vertexAttribPointer(positionLocation, 2, gl.FLOAT, false, 0, 0)

    const uniforms = {
      resolution: gl.getUniformLocation(program, 'u_resolution'),
      pointer: gl.getUniformLocation(program, 'u_pointer'),
      time: gl.getUniformLocation(program, 'u_time'),
      intensity: gl.getUniformLocation(program, 'u_intensity'),
      primary: gl.getUniformLocation(program, 'u_primary'),
      secondary: gl.getUniformLocation(program, 'u_secondary'),
      accent: gl.getUniformLocation(program, 'u_accent'),
    }

    const skin = getSkinDefinition(skinId)
    const fluid = skin.fluid
    const targetPointer = { x: 0.72, y: 0.68 }
    const renderedPointer = { ...targetPointer }
    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    const speed = motion === 'calm' ? fluid.speed * 0.42 : fluid.speed
    const intensity = motion === 'calm' ? fluid.intensity * 0.52 : fluid.intensity
    const startedAt = performance.now()
    let animationFrame = 0
    let previousFrame = 0

    const resize = () => {
      const bounds = canvas.getBoundingClientRect()
      const renderScale = motion === 'calm' ? 0.72 : 1
      const pixelRatio = Math.min(window.devicePixelRatio || 1, 1.15) * renderScale
      const width = Math.max(1, Math.round(bounds.width * pixelRatio))
      const height = Math.max(1, Math.round(bounds.height * pixelRatio))
      if (canvas.width !== width || canvas.height !== height) {
        canvas.width = width
        canvas.height = height
        gl.viewport(0, 0, width, height)
      }
    }

    const updatePointer = (event) => {
      targetPointer.x = event.clientX / Math.max(window.innerWidth, 1)
      targetPointer.y = 1 - (event.clientY / Math.max(window.innerHeight, 1))
    }

    const draw = (timestamp) => {
      const frameInterval = motion === 'calm' ? 1000 / 30 : 1000 / 60
      if (timestamp - previousFrame >= frameInterval || reducedMotion) {
        resize()
        renderedPointer.x += (targetPointer.x - renderedPointer.x) * 0.035
        renderedPointer.y += (targetPointer.y - renderedPointer.y) * 0.035
        gl.clearColor(0, 0, 0, 0)
        gl.clear(gl.COLOR_BUFFER_BIT)
        gl.useProgram(program)
        gl.uniform2f(uniforms.resolution, canvas.width, canvas.height)
        gl.uniform2f(uniforms.pointer, renderedPointer.x, renderedPointer.y)
        gl.uniform1f(uniforms.time, ((timestamp - startedAt) / 1000) * speed)
        gl.uniform1f(uniforms.intensity, intensity)
        gl.uniform3fv(uniforms.primary, hexToRgb(fluid.primary))
        gl.uniform3fv(uniforms.secondary, hexToRgb(fluid.secondary))
        gl.uniform3fv(uniforms.accent, hexToRgb(fluid.accent))
        gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4)
        previousFrame = timestamp
      }
      if (!reducedMotion) animationFrame = window.requestAnimationFrame(draw)
    }

    window.addEventListener('pointermove', updatePointer, { passive: true })
    window.addEventListener('resize', resize, { passive: true })
    animationFrame = window.requestAnimationFrame(draw)

    return () => {
      window.removeEventListener('pointermove', updatePointer)
      window.removeEventListener('resize', resize)
      if (animationFrame) window.cancelAnimationFrame(animationFrame)
      gl.deleteBuffer(buffer)
      gl.deleteProgram(program)
    }
  }, [motion, skinId])

  return <canvas ref={canvasRef} className="skin-fluid-canvas" aria-hidden="true" />
}
