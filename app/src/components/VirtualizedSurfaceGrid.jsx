import { useEffect, useMemo, useRef, useState } from 'react'

import SurfaceCard from './SurfaceCard.jsx'

export const OVERSCAN_ROWS = 3

const layoutFor = (width) => {
  const viewportWidth = window.innerWidth
  if (viewportWidth <= 430) return { columns: 1, gap: 9, rowHeight: 254 }
  if (viewportWidth <= 680) return { columns: 2, gap: 9, rowHeight: 254 }
  if (width >= 760) return { columns: 3, gap: 13, rowHeight: 315 }
  if (width >= 400) return { columns: 2, gap: 13, rowHeight: 315 }
  return { columns: 1, gap: 13, rowHeight: 315 }
}

const initialWindow = { columns: 1, gap: 13, rowHeight: 315, startRow: 0, endRow: 8, totalRows: 0 }

export default function VirtualizedSurfaceGrid({ surfaces, selectedId, onSelect, scrollContainerRef }) {
  const gridRef = useRef(null)
  const frameRef = useRef(0)
  const [renderWindow, setRenderWindow] = useState(initialWindow)

  useEffect(() => {
    const grid = gridRef.current
    const scrollContainer = scrollContainerRef.current
    if (!grid || !scrollContainer) return undefined

    const measure = () => {
      frameRef.current = 0
      const gridRect = grid.getBoundingClientRect()
      const containerStyle = window.getComputedStyle(scrollContainer)
      const containerScrolls = containerStyle.overflowY === 'auto' || containerStyle.overflowY === 'scroll'
      const viewportTop = containerScrolls ? scrollContainer.getBoundingClientRect().top : 0
      const viewportBottom = containerScrolls ? scrollContainer.getBoundingClientRect().bottom : window.innerHeight
      const layout = layoutFor(grid.clientWidth)
      const totalRows = Math.ceil(surfaces.length / layout.columns)
      const firstVisible = Math.max(0, Math.floor((viewportTop - gridRect.top) / layout.rowHeight))
      const lastVisible = Math.max(firstVisible, Math.ceil((viewportBottom - gridRect.top) / layout.rowHeight))
      const startRow = Math.max(0, firstVisible - OVERSCAN_ROWS)
      const endRow = Math.min(totalRows, lastVisible + OVERSCAN_ROWS)

      setRenderWindow((current) => {
        const next = { ...layout, startRow, endRow, totalRows }
        return Object.keys(next).every((key) => next[key] === current[key]) ? current : next
      })
    }

    const scheduleMeasure = () => {
      if (frameRef.current) return
      frameRef.current = window.requestAnimationFrame(measure)
    }

    const observer = new ResizeObserver(scheduleMeasure)
    observer.observe(grid)
    observer.observe(scrollContainer)
    scrollContainer.addEventListener('scroll', scheduleMeasure, { passive: true })
    window.addEventListener('scroll', scheduleMeasure, { passive: true })
    window.addEventListener('resize', scheduleMeasure)
    measure()

    return () => {
      observer.disconnect()
      scrollContainer.removeEventListener('scroll', scheduleMeasure)
      window.removeEventListener('scroll', scheduleMeasure)
      window.removeEventListener('resize', scheduleMeasure)
      if (frameRef.current) window.cancelAnimationFrame(frameRef.current)
    }
  }, [scrollContainerRef, surfaces.length])

  const visibleRows = useMemo(() => {
    const rows = []
    for (let row = renderWindow.startRow; row < renderWindow.endRow; row += 1) {
      const start = row * renderWindow.columns
      rows.push({ row, items: surfaces.slice(start, start + renderWindow.columns), start })
    }
    return rows
  }, [renderWindow, surfaces])

  return (
    <div
      ref={gridRef}
      className="virtual-surface-grid"
      role="list"
      aria-label={`${surfaces.length} éléments dans le Coffre`}
      style={{ height: renderWindow.totalRows * renderWindow.rowHeight }}
    >
      {visibleRows.map(({ row, items, start }) => (
        <div
          className="virtual-surface-row"
          key={row}
          style={{
            gap: renderWindow.gap,
            gridTemplateColumns: `repeat(${renderWindow.columns}, minmax(0, 1fr))`,
            height: renderWindow.rowHeight - renderWindow.gap,
            transform: `translateY(${row * renderWindow.rowHeight}px)`,
          }}
        >
          {items.map((surface, index) => (
            <div role="listitem" aria-posinset={start + index + 1} aria-setsize={surfaces.length} key={surface.id}>
              <SurfaceCard surface={surface} selected={selectedId === surface.id} onSelect={onSelect} />
            </div>
          ))}
        </div>
      ))}
    </div>
  )
}
