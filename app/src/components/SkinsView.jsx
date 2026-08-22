import { Check, Gauge, Gem, Palette, PanelLeft, ShieldCheck, Sparkles } from 'lucide-react'
import { publicAsset } from '../lib/desktopApi.js'
import { SIDEBAR_MATERIAL_OPTIONS, SKINS, SKIN_MOTION_OPTIONS, getSkinDefinition } from '../lib/skinPreferences.js'

export default function SkinsView({ skinId, motion, sidebarMaterial, onSkin, onMotion, onSidebarMaterial }) {
  const activeSkin = getSkinDefinition(skinId)

  return (
    <section className="skins-view" aria-labelledby="skins-title">
      <header className="skins-header">
        <div>
          <span className="skins-eyebrow"><Palette size={15} /> Apparence du studio</span>
          <h1 id="skins-title">Skins</h1>
          <p>Change l’atmosphère complète de Noblesse Studio sans toucher à tes données.</p>
        </div>
        <div className="skins-live-state" aria-label={`Skin actif : ${activeSkin.name}`}>
          <span><Sparkles size={16} /> Actif maintenant</span>
          <strong>{activeSkin.name}</strong>
        </div>
      </header>

      <section className="skin-motion-panel" aria-labelledby="skin-motion-title">
        <div className="skin-motion-copy">
          <span className="skin-motion-icon"><Gauge size={20} /></span>
          <div>
            <h2 id="skin-motion-title">Intensité dynamique</h2>
            <p>Un fluide WebGL autonome circule au-dessus de la texture et réagit doucement au pointeur.</p>
          </div>
        </div>
        <div className="skin-motion-options" role="group" aria-label="Intensité des animations du skin">
          {SKIN_MOTION_OPTIONS.map((option) => (
            <button
              key={option.id}
              type="button"
              className={motion === option.id ? 'is-active' : ''}
              aria-pressed={motion === option.id}
              title={option.description}
              onClick={() => onMotion(option.id)}
            >
              {option.label}
            </button>
          ))}
        </div>
      </section>

      <section className="sidebar-material-panel" aria-labelledby="sidebar-material-title">
        <div className="sidebar-material-copy">
          <span className="sidebar-material-icon"><PanelLeft size={20} /></span>
          <div>
            <span className="sidebar-material-kicker">Couche indépendante</span>
            <h2 id="sidebar-material-title">Matière de la colonne</h2>
            <p>Garde le même skin et change uniquement la colonne de navigation Noblesse Studio.</p>
          </div>
        </div>
        <div className="sidebar-material-options" role="group" aria-label="Matière de la colonne Noblesse Studio">
          {SIDEBAR_MATERIAL_OPTIONS.map((option) => {
            const isActive = sidebarMaterial === option.id
            const OptionIcon = option.id === 'mirror-glass' ? Gem : PanelLeft
            return (
              <button
                key={option.id}
                type="button"
                className={isActive ? 'is-active' : ''}
                aria-pressed={isActive}
                onClick={() => onSidebarMaterial(option.id)}
              >
                <span className="sidebar-material-option-icon"><OptionIcon size={19} /></span>
                <span className="sidebar-material-option-copy">
                  <strong>{option.label}</strong>
                  <small>{option.description}</small>
                </span>
                {isActive && <Check className="sidebar-material-option-check" size={17} />}
              </button>
            )
          })}
        </div>
      </section>

      <div className="skin-gallery" role="group" aria-label="Skins disponibles">
        {SKINS.map((skin) => {
          const isActive = skin.id === skinId
          return (
            <button
              key={skin.id}
              type="button"
              className={`skin-choice${isActive ? ' is-active' : ''}`}
              style={{ '--skin-preview-accent': skin.accent }}
              aria-pressed={isActive}
              onClick={() => onSkin(skin.id)}
            >
              <span className="skin-choice-visual">
                <img src={publicAsset(skin.asset)} alt="" loading="lazy" draggable="false" />
                <span className="skin-choice-resolution">4K</span>
                {isActive && <span className="skin-choice-check"><Check size={17} /> Actif</span>}
              </span>
              <span className="skin-choice-copy">
                <small>{skin.eyebrow}</small>
                <strong>{skin.name}</strong>
                <span>{skin.description}</span>
              </span>
            </button>
          )
        })}
      </div>

      <footer className="skins-footer-note">
        <ShieldCheck size={17} />
        <span>Ton choix est enregistré sur cet appareil et restauré au prochain lancement.</span>
      </footer>
    </section>
  )
}
