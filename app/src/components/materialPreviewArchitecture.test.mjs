import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

const previewSource = await readFile(new URL('./MaterialPreview3D.jsx', import.meta.url), 'utf8')
const sphereSource = await readFile(new URL('./SurfaceSphere.jsx', import.meta.url), 'utf8')

function openingTag(source, componentName) {
  const match = source.match(new RegExp(`<${componentName}\\b[\\s\\S]*?>`))
  assert.ok(match, `${componentName} doit rester present dans le previsualisateur`)
  return match[0]
}

test('keeps one stable Canvas, resets failures by active asset and preserves the camera between variants', () => {
  const boundaryTag = openingTag(previewSource, 'PreviewErrorBoundary')
  const canvasTag = openingTag(previewSource, 'Canvas')
  const sceneTag = openingTag(previewSource, 'StudioPreviewScene')

  assert.doesNotMatch(boundaryTag, /\bkey\s*=/)
  assert.doesNotMatch(canvasTag, /\bkey\s*=/)
  assert.match(previewSource, /const renderResetToken\s*=\s*`\$\{surface\.id\}:\$\{surface\.assetId\s*\|\|\s*['"]{2}\}:\$\{shape\}`/)
  assert.match(previewSource, /const cameraResetToken\s*=\s*`\$\{surface\.id\}:\$\{shape\}`/)
  assert.match(boundaryTag, /\bresetToken=\{renderResetToken\}/)
  assert.match(sceneTag, /\bresetToken=\{cameraResetToken\}/)
  assert.match(previewSource, /previousProps\.resetToken\s*!==\s*this\.props\.resetToken/)
})

test('forbids application-owned WebGL context-loss handling', () => {
  assert.doesNotMatch(previewSource, /webglcontextlost|forceContextLoss|setContextLost|\bcontextLost\b/i)
})

test('never exposes the emergency static-preview label to users', () => {
  assert.doesNotMatch(previewSource, /Aper(?:\u00e7u|\u00c3\u00a7u)\s+statique\s+de\s+secours/i)
})

test('keeps catalogue thumbnails lazy and asynchronously decoded', () => {
  const imageTag = openingTag(sphereSource, 'img')

  assert.match(imageTag, /\bloading=["']lazy["']/)
  assert.match(imageTag, /\bdecoding=["']async["']/)
})
