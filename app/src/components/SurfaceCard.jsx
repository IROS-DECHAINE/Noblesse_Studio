import { AudioLines, Waves } from 'lucide-react'
import SurfaceSphere from './SurfaceSphere.jsx'

export default function SurfaceCard({ surface, selected, onSelect }) {
  if (surface.kind === 'sound') {
    return (
      <button className={`surface-card sound-card ${selected ? 'is-selected' : ''}`} type="button" onClick={() => onSelect(surface)}>
        <span className="sound-card-visual" aria-hidden="true">
          <AudioLines size={54} strokeWidth={1.3} />
          <i /><i /><i /><i /><i /><i /><i />
        </span>
        <strong>{surface.name}</strong>
        <small>{surface.category} · {Math.max(1, Math.round(surface.durationSeconds))} s</small>
      </button>
    )
  }
  return (
    <button className={`surface-card ${selected ? 'is-selected' : ''}`} type="button" onClick={() => onSelect(surface)}>
      {surface.animated && <span className="animated-mark"><Waves size={14} /> Animée</span>}
      <SurfaceSphere surface={surface} />
      <strong>{surface.name}</strong>
      <small>{surface.variants.length} {surface.variants.length > 1 ? 'variantes' : 'rendu'}</small>
    </button>
  )
}
