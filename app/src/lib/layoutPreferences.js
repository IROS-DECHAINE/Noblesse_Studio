export const LAYOUT_STORAGE_KEY = 'noblesse-studio:layout:v1'

export const layoutLimits = Object.freeze({
  sidebar: Object.freeze({ min: 168, max: 360, defaultValue: 226 }),
  inspector: Object.freeze({ min: 300, max: 1020, defaultValue: 402 }),
  preview: Object.freeze({ min: 306, max: 680, reservedForControls: 420, compactViewportMax: 900 }),
  coffreMainMinForTwoCards: 470,
})

export const maxInspectorWidthFor = (availableWidth) => {
  const width = Number(availableWidth)
  if (!Number.isFinite(width) || width <= 0) return layoutLimits.inspector.max
  return Math.max(
    layoutLimits.inspector.min,
    Math.min(layoutLimits.inspector.max, Math.floor(width - layoutLimits.coffreMainMinForTwoCards)),
  )
}

export const maxPreviewHeightFor = (availableHeight) => {
  const height = Number(availableHeight)
  if (!Number.isFinite(height) || height <= 0) return layoutLimits.preview.max
  if (height > layoutLimits.preview.compactViewportMax) return layoutLimits.preview.max
  return Math.max(
    layoutLimits.preview.min,
    Math.min(layoutLimits.preview.max, Math.floor(height - layoutLimits.preview.reservedForControls)),
  )
}

export const defaultStudioLayout = Object.freeze({
  schemaVersion: 1,
  sidebarWidth: layoutLimits.sidebar.defaultValue,
  sidebarCollapsed: false,
  inspectorWidth: layoutLimits.inspector.defaultValue,
})

export const clampPanelSize = (value, limits) => {
  const numericValue = Number(value)
  if (!Number.isFinite(numericValue)) return limits.defaultValue
  return Math.min(limits.max, Math.max(limits.min, Math.round(numericValue)))
}

export const normalizeStudioLayout = (value) => {
  if (!value || typeof value !== 'object' || value.schemaVersion !== 1) return { ...defaultStudioLayout }
  return {
    schemaVersion: 1,
    sidebarWidth: clampPanelSize(value.sidebarWidth, layoutLimits.sidebar),
    sidebarCollapsed: value.sidebarCollapsed === true,
    inspectorWidth: clampPanelSize(value.inspectorWidth, layoutLimits.inspector),
  }
}

const browserStorage = () => {
  try {
    return globalThis.window?.localStorage || null
  } catch {
    return null
  }
}

export const loadStudioLayout = (storage = browserStorage()) => {
  if (!storage) return { ...defaultStudioLayout }
  try {
    return normalizeStudioLayout(JSON.parse(storage.getItem(LAYOUT_STORAGE_KEY) || 'null'))
  } catch {
    return { ...defaultStudioLayout }
  }
}

export const saveStudioLayout = (layout, storage = browserStorage()) => {
  const normalized = normalizeStudioLayout(layout)
  if (!storage) return normalized
  try {
    storage.setItem(LAYOUT_STORAGE_KEY, JSON.stringify(normalized))
  } catch {
    // A blocked or full localStorage must never make the application unusable.
  }
  return normalized
}
