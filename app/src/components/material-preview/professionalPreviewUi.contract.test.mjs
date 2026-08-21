import assert from 'node:assert/strict'
import { readFile, readdir } from 'node:fs/promises'
import test from 'node:test'

const previewRoot = new URL('./', import.meta.url)
const previewSource = await readFile(new URL('../MaterialPreview3D.jsx', import.meta.url), 'utf8')
const inspectorSource = await readFile(new URL('../SurfaceInspector.jsx', import.meta.url), 'utf8')
const overlaySource = await readFile(new URL('./SourcePreviewOverlay.jsx', import.meta.url), 'utf8')
const failoverSource = await readFile(new URL('./useAtomicPreviewFailover.js', import.meta.url), 'utf8')
const previewStyles = await readFile(new URL('../../styles.css', import.meta.url), 'utf8')

const runtimeFiles = (await readdir(previewRoot, { withFileTypes: true }))
  .filter((entry) => entry.isFile() && /\.(?:js|jsx)$/.test(entry.name) && !/\.test\./.test(entry.name))
const runtimeSources = await Promise.all(runtimeFiles.map(async (entry) => ({
  name: entry.name,
  source: await readFile(new URL(entry.name, previewRoot), 'utf8'),
})))
runtimeSources.push({ name: 'MaterialPreview3D.jsx', source: previewSource })

const jsxOpeningTags = (source, tagName) => {
  const tags = []
  const needle = `<${tagName}`
  let cursor = 0
  while ((cursor = source.indexOf(needle, cursor)) >= 0) {
    const start = cursor
    let braceDepth = 0
    let quote = ''
    let escaped = false
    cursor += needle.length
    for (; cursor < source.length; cursor += 1) {
      const character = source[cursor]
      if (quote) {
        if (escaped) escaped = false
        else if (character === '\\') escaped = true
        else if (character === quote) quote = ''
        continue
      }
      if (character === '"' || character === "'" || character === '`') quote = character
      else if (character === '{') braceDepth += 1
      else if (character === '}') braceDepth = Math.max(0, braceDepth - 1)
      else if (character === '>' && braceDepth === 0) {
        tags.push(source.slice(start, cursor + 1))
        cursor += 1
        break
      }
    }
  }
  return tags
}

const openingTag = (source, tagName, predicate = () => true) => {
  const tag = jsxOpeningTags(source, tagName).find(predicate)
  assert.ok(tag, `${tagName} opening tag must exist`)
  return tag
}

const shapeButton = (shape) => {
  const pattern = new RegExp(`<button\\b(?:(?!</button>)[\\s\\S])*?setShape\\(['"]${shape}['"]\\)(?:(?!</button>)[\\s\\S])*?</button>`)
  const match = inspectorSource.match(pattern)
  assert.ok(match, `${shape} button must exist`)
  return match[0]
}

test('one persistent unkeyed Canvas owns live and rendered-capture presentations', () => {
  const canvasOwners = runtimeSources.filter(({ source }) => /<Canvas\b/.test(source))
  assert.equal(canvasOwners.length, 1, 'the preview runtime must own exactly one Canvas')
  assert.equal((canvasOwners[0].source.match(/<Canvas\b/g) || []).length, 1)

  const canvasTag = openingTag(canvasOwners[0].source, 'Canvas')
  assert.doesNotMatch(canvasTag, /\bkey\s*=/)
  assert.match(canvasTag, /\bshadows\s*=\s*['"]percentage['"]/)
  assert.match(canvasOwners[0].source, /SourcePreviewOverlay/)
  assert.match(canvasOwners[0].source, /shape=\{shape\}/)

  assert.doesNotMatch(previewSource, /if\s*\([^)]*(?:previewKind|rendered_capture|rendered_sphere)[^)]*\)\s*\{?\s*return/i)
  assert.doesNotMatch(previewSource, /RenderedSpherePreview/)
})

test('Sphere and Plane remain enabled for every material, including source captures', () => {
  const sphereButton = shapeButton('sphere')
  const planeButton = shapeButton('plane')

  assert.doesNotMatch(sphereButton, /\bdisabled\b/)
  assert.doesNotMatch(planeButton, /\bdisabled\b/)
  assert.equal((inspectorSource.match(/setShape\(['"]sphere['"]\)/g) || []).length, 1)
  assert.equal((inspectorSource.match(/setShape\(['"]plane['"]\)/g) || []).length, 1)
  assert.doesNotMatch(inspectorSource, /isRenderedSphere/)
})

test('the active variant owns animation truth and technical channels', () => {
  assert.match(inspectorSource, /activeVariant\?\.animated/)
  assert.doesNotMatch(inspectorSource, /surface\.animated\s*\?/)
  assert.doesNotMatch(inspectorSource, /roleTokens|surface\.textureRoles/)
  assert.match(inspectorSource, /(?:preview)?descriptor\?*\.channels|descriptorState\?*\.descriptor\?*\.channels/i)

  assert.doesNotMatch(previewSource, /surface\.animated|texture\.offset|texture\.rotation/)
})

test('fallbacks are silent, source-faithful, non-black and shape-aware', () => {
  const safeColorMatch = overlaySource.match(/SAFE_SOURCE_POSTER_COLOR\s*=\s*['"](#[0-9a-f]{6})['"]/i)
  assert.ok(safeColorMatch, 'the source overlay must declare a deterministic fallback color')
  assert.notEqual(safeColorMatch[1].toLowerCase(), '#000000')
  assert.match(overlaySource, /is-\$\{shape\}/)
  assert.match(overlaySource, /data-preview-shape=\{shape\}/)
  assert.match(overlaySource, /backgroundColor:\s*color\s*\|\|\s*SAFE_SOURCE_POSTER_COLOR/)
  assert.match(failoverSource, /descriptor\?\.mode\s*===\s*['"]rendered_capture['"]\s*\?\s*['"]Capture source['"]/)

  const allPreviewSource = [previewSource, inspectorSource, overlaySource, failoverSource]
    .join('\n')
  assert.doesNotMatch(allPreviewSource, /Aper(?:\u00e7u|\u00c3\u00a7u)\s+statique\s+de\s+secours/i)
})

test('a committed live frame fully hides the source poster behind the transparent Canvas', () => {
  assert.match(previewStyles, /\.material-preview-source-overlay\.is-background\s*\{[^}]*\bopacity:\s*0\b[^}]*\}/)
})
