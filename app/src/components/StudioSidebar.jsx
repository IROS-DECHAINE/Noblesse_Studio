import { Blocks, CalendarDays, FileText, FolderKanban, Gamepad2, Home, PanelLeftClose, Settings, Vault, WalletCards } from 'lucide-react'
import { publicAsset } from '../lib/desktopApi.js'
import { layoutLimits } from '../lib/layoutPreferences.js'
import ColumnResizeHandle from './ColumnResizeHandle.jsx'

const navItems = [
  { id: 'home', label: 'Accueil', icon: Home },
  { id: 'projects', label: 'Projets', icon: FolderKanban },
  { id: 'vault', label: 'Coffre', icon: Vault },
  { id: 'fortnite', label: 'Fortnite', icon: Gamepad2 },
  { id: 'roblox', label: 'Roblox', icon: Blocks },
  { id: 'documents', label: 'Documents', icon: FileText },
  { id: 'finance', label: 'Finances', icon: WalletCards },
  { id: 'calendar', label: 'Calendrier', icon: CalendarDays },
]

export default function StudioSidebar({ section, connected, width, onNavigate, onWidth, onCollapse }) {
  return (
    <aside id="studio-sidebar" className="studio-sidebar" aria-label="Navigation Noblesse Studio">
      <button className="studio-brand" type="button" aria-label="Noblesse Studio — Accueil" onClick={() => onNavigate('home')}>
        <img src={publicAsset('assets/noblesse-vault-icon.png')} alt="" />
        <span>NOBLESSE STUDIO</span>
      </button>
      <button className="studio-sidebar-collapse" type="button" aria-label="Masquer la navigation" title="Masquer la navigation" onClick={onCollapse}>
        <PanelLeftClose size={18} />
      </button>

      <nav className="studio-navigation">
        {navItems.map(({ id, label, icon: Icon }) => (
          <button key={id} type="button" aria-label={label} title={label} className={section === id ? 'is-active' : ''} onClick={() => onNavigate(id)}>
            <Icon size={20} strokeWidth={1.8} />
            <span>{label}</span>
          </button>
        ))}
      </nav>

      <div className="sidebar-footer">
        <div className={`live-state ${connected ? 'is-connected' : ''}`}>
          <span /> {connected ? 'UEFN connecté' : 'UEFN hors ligne'}
        </div>
        <button type="button" aria-label="Réglages" title="Sécurité et récupération" className={section === 'settings' ? 'is-active' : ''} onClick={() => onNavigate('settings')}><Settings size={20} /></button>
      </div>

      <ColumnResizeHandle
        className="studio-sidebar-resizer"
        label="Redimensionner la navigation"
        value={width}
        min={layoutLimits.sidebar.min}
        max={layoutLimits.sidebar.max}
        defaultValue={layoutLimits.sidebar.defaultValue}
        onChange={onWidth}
      />
    </aside>
  )
}
