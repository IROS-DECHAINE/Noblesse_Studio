import { Blocks, CalendarDays, FileText, FolderKanban, Gamepad2, Home, Settings, Vault, WalletCards } from 'lucide-react'
import { publicAsset } from '../lib/desktopApi.js'

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

export default function StudioSidebar({ section, connected, onNavigate }) {
  return (
    <aside className="studio-sidebar" aria-label="Navigation Noblesse Studio">
      <button className="studio-brand" type="button" aria-label="Noblesse Studio — Accueil" onClick={() => onNavigate('home')}>
        <img src={publicAsset('assets/noblesse-vault-icon.png')} alt="" />
        <span>NOBLESSE STUDIO</span>
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
        <button type="button" aria-label="Réglages"><Settings size={20} /></button>
      </div>
    </aside>
  )
}
