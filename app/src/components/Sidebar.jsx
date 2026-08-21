import { Box, ChevronLeft, Layers3, Plus } from 'lucide-react'

export default function Sidebar({ packs, activePack, onSelectPack }) {
  return (
    <aside className="sidebar" aria-label="Packs de la bibliothèque">
      <div className="sidebar-title"><Layers3 size={20} /> Packs</div>
      <nav className="pack-list">
        {packs.map((pack) => (
          <button
            className={`pack-row ${activePack === pack.id ? 'is-active' : ''}`}
            key={pack.id}
            onClick={() => onSelectPack(pack.id)}
            type="button"
          >
            <span className="pack-icon"><Box size={18} /></span>
            <span>
              <strong>{pack.name}</strong>
              <small>{pack.state}</small>
            </span>
          </button>
        ))}
        <button className="create-pack" type="button" onClick={() => onSelectPack('create')}>
          <Plus size={19} /> Créer un pack
        </button>
      </nav>
      <button className="collapse-button" type="button" aria-label="Réduire la barre latérale">
        <ChevronLeft size={17} /> Réduire
      </button>
    </aside>
  )
}
