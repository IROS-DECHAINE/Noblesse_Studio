import { useRef } from 'react'

const keyboardStep = 16

export default function ColumnResizeHandle({
  className = '',
  label,
  value,
  min,
  max,
  defaultValue,
  direction = 1,
  onChange,
}) {
  const dragRef = useRef(null)

  const update = (nextValue) => onChange(Math.min(max, Math.max(min, Math.round(nextValue))))

  const stopDragging = (event) => {
    if (dragRef.current?.pointerId !== event.pointerId) return
    dragRef.current = null
    document.body.classList.remove('is-resizing-columns')
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId)
  }

  return (
    <div
      className={`column-resize-handle ${className}`.trim()}
      role="separator"
      aria-label={label}
      aria-orientation="vertical"
      aria-valuemin={min}
      aria-valuemax={max}
      aria-valuenow={value}
      tabIndex={0}
      title="Glisser pour redimensionner · Double-cliquer pour réinitialiser"
      onDoubleClick={() => update(defaultValue)}
      onKeyDown={(event) => {
        if (!['ArrowLeft', 'ArrowRight', 'Home'].includes(event.key)) return
        event.preventDefault()
        if (event.key === 'Home') update(defaultValue)
        else update(value + (event.key === 'ArrowRight' ? keyboardStep : -keyboardStep) * direction)
      }}
      onPointerDown={(event) => {
        if (event.button !== 0) return
        dragRef.current = { pointerId: event.pointerId, startX: event.clientX, startValue: value }
        event.currentTarget.setPointerCapture(event.pointerId)
        document.body.classList.add('is-resizing-columns')
      }}
      onPointerMove={(event) => {
        if (dragRef.current?.pointerId !== event.pointerId) return
        update(dragRef.current.startValue + (event.clientX - dragRef.current.startX) * direction)
      }}
      onPointerUp={stopDragging}
      onPointerCancel={stopDragging}
    >
      <span aria-hidden="true" />
    </div>
  )
}
