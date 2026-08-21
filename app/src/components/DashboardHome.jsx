import { useEffect, useState } from 'react'
import {
  ArrowRight,
  Blocks,
  Clock3,
  Euro,
  Gamepad2,
  MoreVertical,
  RefreshCw,
  Star,
  TrendingUp,
  Users,
} from 'lucide-react'
import {
  Area,
  AreaChart,
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import { publicAsset } from '../lib/desktopApi.js'

const zeroHours = Array.from({ length: 24 }, (_, index) => ({
  timestamp: new Date(Date.now() - (23 - index) * 60 * 60 * 1000).toISOString(),
  value: null,
  available: false,
}))
const FAVORITE_PROJECTS_KEY = 'noblesse-studio:favorite-projects:v1'

const readFavoriteProjects = () => {
  try {
    const stored = JSON.parse(window.localStorage.getItem(FAVORITE_PROJECTS_KEY) || '[]')
    return new Set(Array.isArray(stored) ? stored.filter((name) => typeof name === 'string') : [])
  } catch {
    return new Set()
  }
}

const formatNumber = (value) => Number.isFinite(value) ? new Intl.NumberFormat('fr-FR').format(value) : '—'
const formatHour = (timestamp) => new Intl.DateTimeFormat('fr-FR', { hour: '2-digit', minute: '2-digit' }).format(new Date(timestamp))

const privateMetricLabel = (available, value, suppressed, threshold) => {
  if (available && Number.isFinite(value)) return formatNumber(value)
  if (suppressed) return `< ${threshold}`
  return '—'
}

function buildAudienceData(fortniteStats) {
  const series = fortniteStats.hourlyPeakCCU?.length ? fortniteStats.hourlyPeakCCU : zeroHours
  return series.slice(-24).map((entry) => ({
    time: formatHour(entry.timestamp),
    fortnite: entry.available && Number.isFinite(entry.value) ? entry.value : null,
    roblox: null,
  }))
}

function AudienceChart({ data, hasPublicData, emptyLabel }) {
  const availableValues = data.flatMap((entry) => [entry.fortnite, entry.roblox]).filter(Number.isFinite)
  const maxValue = Math.max(0, ...availableValues)
  const yMax = Math.max(5, Math.ceil(maxValue / 5) * 5)
  const ticks = [0, yMax * 0.25, yMax * 0.5, yMax * 0.75, yMax]

  return (
    <div className="audience-canvas" role="img" aria-label="Courbes réelles des joueurs Fortnite et Roblox sur 24 heures">
      <ResponsiveContainer width="100%" height="100%" initialDimension={{ width: 960, height: 240 }}>
        <AreaChart data={data} margin={{ top: 12, right: 8, left: -10, bottom: 0 }}>
          <CartesianGrid stroke="rgba(88,118,146,.22)" strokeDasharray="2 4" vertical={false} />
          <XAxis dataKey="time" tick={{ fill: '#8997a7', fontSize: 10 }} tickLine={false} axisLine={{ stroke: '#2a3d50' }} interval={3} />
          <YAxis domain={[0, yMax]} ticks={ticks} tickFormatter={(value) => formatNumber(value)} tick={{ fill: '#8997a7', fontSize: 10 }} tickLine={false} axisLine={false} />
          <Tooltip
            cursor={{ stroke: '#53697d', strokeDasharray: '3 3' }}
            contentStyle={{ background: '#091522', border: '1px solid #2a3d50', borderRadius: 6, fontSize: 10 }}
            labelStyle={{ color: '#d9e1e8' }}
            formatter={(value, name) => [`${formatNumber(value)} joueur${value > 1 ? 's' : ''}`, name === 'fortnite' ? 'Fortnite' : 'Roblox']}
          />
          <Area type="natural" dataKey="fortnite" stroke="#347eff" strokeWidth={2.5} fill="#347eff" fillOpacity={0.16} dot={false} activeDot={{ r: 4 }} connectNulls={false} isAnimationActive={false} />
          <Area type="natural" dataKey="roblox" stroke="#e4aa3c" strokeWidth={2.3} fill="#e4aa3c" fillOpacity={0.13} dot={false} activeDot={{ r: 4 }} connectNulls={false} isAnimationActive={false} />
        </AreaChart>
      </ResponsiveContainer>
      {!hasPublicData && <span className="chart-empty-note">{emptyLabel}</span>}
    </div>
  )
}

function Sparkline({ points, color }) {
  const data = points.map((value, index) => ({ index, value }))
  return (
    <div className="project-sparkline" aria-hidden="true">
      <LineChart width={120} height={27} data={data}>
        <Line type="natural" dataKey="value" stroke={color} strokeWidth={1.7} dot={false} isAnimationActive={false} />
      </LineChart>
    </div>
  )
}

export default function DashboardHome({ fortniteStats, refreshing = false, onNavigate, onRefresh }) {
  const [favoriteProjects, setFavoriteProjects] = useState(readFavoriteProjects)
  const audienceData = buildAudienceData(fortniteStats)
  const hasPublicData = Boolean(fortniteStats.hourlyPeakCCU?.some((entry) => entry.available))
  const updatedAt = fortniteStats.updatedAt ? formatHour(fortniteStats.updatedAt) : '—'
  const realSpark = audienceData.map((entry) => entry.fortnite)
  const availablePeaks = (fortniteStats.hourlyPeakCCU || []).filter((entry) => entry.available)
  const peakEntry = [...availablePeaks].sort((a, b) => b.value - a.value)[0]
  const hourlyBuckets = fortniteStats.hourlyPeakCCU || []
  const chartEmptyLabel = hourlyBuckets.some((entry) => !entry.available)
    ? 'Données masquées · moins de 5 joueurs uniques par fenêtre Epic'
    : 'Aucune donnée horaire Epic disponible pour cette fenêtre'
  const currentPlayers = privateMetricLabel(
    fortniteStats.currentPlayersAvailable,
    fortniteStats.currentPlayers,
    fortniteStats.currentPlayersSuppressed,
    fortniteStats.threshold || 5,
  )
  const peak24h = privateMetricLabel(
    fortniteStats.peak24hAvailable,
    fortniteStats.peak24h,
    fortniteStats.peak24hSuppressed,
    fortniteStats.threshold || 5,
  )
  const sessions24h = fortniteStats.plays24hAvailable
    ? `${fortniteStats.plays24hComplete ? '' : '≥ '}${formatNumber(fortniteStats.plays24h)}`
    : '—'
  const sourceLabel = fortniteStats.stale
    ? 'Dernières données · Epic indisponible'
    : (fortniteStats.connected
      ? (
        fortniteStats.dataStatus === 'SUPPRESSED'
          ? 'API Epic active · volume masqué'
          : (fortniteStats.dataStatus === 'UNAVAILABLE' ? 'API Epic active · aucune donnée' : 'API Epic active')
      )
      : 'API Epic indisponible')
  const sessionsNote = fortniteStats.plays24hAvailable
    ? (fortniteStats.plays24hComplete ? 'source publique' : 'volume partiel')
    : (fortniteStats.plays24hSuppressed ? 'volume masqué' : 'aucune donnée')

  const stats = [
    { icon: Users, label: 'Joueurs connectés', value: currentPlayers, accent: 'blue', foot: fortniteStats.stale ? 'Dernière lecture' : (fortniteStats.connected ? 'Epic public' : 'Hors ligne'), note: 'fenêtre 10 min' },
    { icon: TrendingUp, label: "Pic aujourd’hui", value: peak24h, accent: 'blue', foot: '24 h', note: `actualisé ${updatedAt}` },
    { icon: Clock3, label: 'Sessions', value: sessions24h, accent: 'blue', foot: '24 h', note: sessionsNote },
    { icon: Euro, label: 'Revenus estimés', value: '—', accent: 'gold', foot: 'Privé', note: 'Creator Portal à brancher' },
  ]

  const projectRows = [
    {
      name: fortniteStats.island?.title || 'PRIMEBOT RUSH',
      platform: 'Fortnite / UEFN',
      platformKey: 'fortnite',
      image: publicAsset('assets/previews/primebot-rush-project.png'),
      players: currentPlayers,
      secondary: fortniteStats.island?.code || '4971-3856-2517',
      trend: '—',
      peak: peak24h,
      peakTime: peakEntry?.timestamp ? formatHour(peakEntry.timestamp) : (fortniteStats.peak24hSuppressed ? 'masqué' : '—'),
      spark: realSpark,
      status: sourceLabel,
      live: fortniteStats.connected,
      stale: fortniteStats.stale,
    },
    {
      name: 'PRIME INDUSTRY',
      platform: 'Roblox',
      platformKey: 'roblox',
      image: publicAsset('assets/previews/prime-industry-project.png'),
      players: '—',
      secondary: 'Non publié',
      trend: '—',
      peak: '—',
      peakTime: '—',
      spark: zeroHours.map(() => null),
      status: 'En cours',
      live: false,
      stale: false,
    },
    {
      name: 'HOW MANY BOX',
      platform: 'Roblox',
      platformKey: 'roblox',
      image: publicAsset('assets/previews/how-many-box-project.png'),
      players: '—',
      secondary: 'Non publié',
      trend: '—',
      peak: '—',
      peakTime: '—',
      spark: zeroHours.map(() => null),
      status: 'En cours',
      live: false,
      stale: false,
    },
  ]

  const toggleFavorite = (projectName) => {
    setFavoriteProjects((current) => {
      const next = new Set(current)
      if (next.has(projectName)) next.delete(projectName)
      else next.add(projectName)
      return next
    })
  }

  const sourceState = fortniteStats.stale
    ? { label: 'Dernière lecture conservée', className: 'is-warning' }
    : (fortniteStats.connected
      ? { label: 'Actif · sans clé', className: 'is-ready' }
      : { label: 'Indisponible', className: '' })

  useEffect(() => {
    window.localStorage.setItem(FAVORITE_PROJECTS_KEY, JSON.stringify([...favoriteProjects]))
  }, [favoriteProjects])

  return (
    <section className="dashboard-home">
      <header className="pulse-header">
        <h1>NOBLESSE STUDIO</h1>
        <div className="pulse-title-mark">
          <span />
          <img src={publicAsset('assets/noblesse-vault-icon.png')} alt="" />
          <span />
        </div>
        <p>
          Vue d’ensemble
          <span className="pulse-source-state">
            <em
              className={fortniteStats.stale ? 'is-stale' : (fortniteStats.connected ? 'is-connected' : '')}
              aria-live="polite"
            >
              {sourceLabel}
            </em>
            <button
              type="button"
              className="pulse-refresh"
              onClick={onRefresh}
              disabled={refreshing}
              aria-label="Actualiser les données Epic"
              title="Actualiser les données Epic"
            >
              <RefreshCw size={13} className={refreshing ? 'is-spinning' : ''} />
            </button>
          </span>
        </p>
      </header>

      <div className="pulse-kpis">
        {stats.map(({ icon: Icon, label, value, accent, foot, note }) => (
          <article className="pulse-kpi" key={label}>
            <span className={`kpi-icon is-${accent}`}><Icon size={21} /></span>
            <span className="kpi-copy"><small>{label}</small><strong>{value}</strong><span><b>{foot}</b> {note}</span></span>
          </article>
        ))}
      </div>

      <section className="audience-panel">
        <header>
          <div className="audience-heading">
            <h2>Joueurs en direct</h2>
            <span><i className="legend-dot is-fortnite" /> Fortnite</span>
            <span><i className="legend-dot is-roblox" /> Roblox · en cours</span>
          </div>
          <div className="audience-total"><small>24 dernières heures</small><span>Total actuel</span><strong>{currentPlayers}</strong></div>
        </header>
        <AudienceChart data={audienceData} hasPublicData={hasPublicData} emptyLabel={chartEmptyLabel} />
      </section>

      <section className="online-projects">
        <header>
          <div><h2>Projets suivis</h2><span className={`online-label ${fortniteStats.connected ? '' : 'is-offline'}`}><i /> {fortniteStats.stale ? '1 dernière lecture' : (fortniteStats.connected ? '1 source connectée' : 'Sources hors ligne')}</span></div>
          <button type="button" onClick={() => onNavigate('projects')}>Voir tous les projets <ArrowRight size={16} /></button>
        </header>

        <div className="project-data-list">
          {projectRows.map((project) => {
            const PlatformIcon = project.platformKey === 'fortnite' ? Gamepad2 : Blocks
            const color = project.platformKey === 'fortnite' ? '#347eff' : '#e4aa3c'
            return (
              <article className="project-data-row" key={project.name}>
                <img className="project-thumbnail" src={project.image} alt={`Miniature ${project.name}`} />
                <div className="project-identity">
                  <strong>{project.name}</strong>
                  <span><PlatformIcon size={14} /> {project.platform}</span>
                  <small className={project.live ? '' : (project.stale ? 'is-stale' : 'is-progress')}><i className={project.live ? 'is-live' : (project.stale ? 'is-stale' : '')} /> {project.status}</small>
                </div>
                <div className="project-metric"><small>Joueurs actuels</small><strong>{project.players}</strong><span><Users size={13} /> {project.secondary}</span></div>
                <div className="project-metric project-trend"><small>Tendance (24h)</small><strong>{project.trend}</strong><Sparkline points={project.spark} color={color} /></div>
                <div className="project-metric"><small>Pic aujourd’hui</small><strong>{project.peak}</strong><span><Clock3 size={13} /> {project.peakTime}</span></div>
                <div className="project-actions">
                  <button
                    type="button"
                    className={favoriteProjects.has(project.name) ? 'is-favorite' : ''}
                    aria-label={favoriteProjects.has(project.name) ? `Retirer ${project.name} des favoris` : `Ajouter ${project.name} aux favoris`}
                    aria-pressed={favoriteProjects.has(project.name)}
                    onClick={() => toggleFavorite(project.name)}
                  >
                    <Star size={17} fill={favoriteProjects.has(project.name) ? 'currentColor' : 'none'} />
                  </button>
                  <button type="button" aria-label={`Ouvrir ${project.name} dans Projets`} onClick={() => onNavigate('projects')}><MoreVertical size={17} /></button>
                </div>
              </article>
            )
          })}
        </div>
      </section>

      <section className="studio-data-sources" aria-labelledby="studio-data-sources-title">
        <header>
          <div><h2 id="studio-data-sources-title">Connexions studio</h2><span>État réel des sources</span></div>
          <small>Les estimations ne sont jamais mélangées aux paiements reçus.</small>
        </header>
        <div className="studio-source-list">
          <div>
            <strong>Epic public</strong><span>Audience et engagement</span>
            <footer><b className={sourceState.className}>{sourceState.label}</b><button type="button" onClick={onRefresh} disabled={refreshing}>Actualiser <RefreshCw size={11} /></button></footer>
          </div>
          <div>
            <strong>Epic Creator</strong><span>Payouts et estimations privées</span>
            <footer><b>À brancher</b><button type="button" onClick={() => onNavigate('finance')}>Finances <ArrowRight size={11} /></button></footer>
          </div>
          <div>
            <strong>Roblox Open Cloud</strong><span>CCU, sessions et revenus Robux</span>
            <footer><b>Clé requise</b><button type="button" onClick={() => onNavigate('roblox')}>Ouvrir <ArrowRight size={11} /></button></footer>
          </div>
          <div>
            <strong>Steamworks</strong><span>Joueurs et registre financier</span>
            <footer><b>AppID + clé finance</b><button type="button" onClick={() => onNavigate('finance')}>Finances <ArrowRight size={11} /></button></footer>
          </div>
          <div><strong>Radar gaming</strong><span>Liste X et flux officiels</span><footer><b>Optionnel · coût borné</b></footer></div>
        </div>
      </section>
    </section>
  )
}
