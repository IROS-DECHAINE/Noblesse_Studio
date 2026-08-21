import { Waves } from 'lucide-react'
import SurfaceSphere from './SurfaceSphere.jsx'

export default function SurfaceCard({ surface, selected, onSelect }) {
  return (
    <button className={`surface-card ${selected ? 'is-selected' : ''}`} type="button" onClick={() => onSelect(surface)}>
      {surface.animated && <span className="animated-mark"><Waves size={14} /> Animée</span>}
      <SurfaceSphere surface={surface} />
      <strong>{surface.name}</strong>
      <small>{surface.variants.length} {surface.variants.length > 1 ? 'variantes' : 'rendu'}</small>
    </button>
  )
}
