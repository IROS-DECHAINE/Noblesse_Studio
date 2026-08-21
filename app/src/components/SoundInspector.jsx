import { CheckCircle2, FileAudio, Pause, Play, Repeat2, ShieldCheck, SkipBack, SkipForward, Trash2 } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import {
  clampPlaybackTime,
  formatPlaybackTime,
  playbackProgress,
  resolvePlaybackDuration,
} from '../lib/audioTimeline.js'
import { adjacentSound, soundPosition } from '../lib/soundNavigation.js'
import VaultInstallControl from './VaultInstallControl.jsx'

const formatBytes = (bytes) => {
  const value = Number(bytes) || 0
  if (value < 1024 * 1024) return `${Math.max(1, Math.round(value / 1024))} Ko`
  return `${(value / (1024 * 1024)).toFixed(1)} Mo`
}

export default function SoundInspector({
  surface,
  sounds = [],
  projects = [],
  selectedProjectId,
  installing,
  onProject,
  onProjectFavorite,
  onInstall,
  onSelect,
  onTrash,
  trashBusy,
}) {
  const audioRef = useRef(null)
  const [loop, setLoop] = useState(false)
  const [playing, setPlaying] = useState(false)
  const [currentTime, setCurrentTime] = useState(0)
  const [duration, setDuration] = useState(() => resolvePlaybackDuration(0, surface.durationSeconds))
  const [playbackError, setPlaybackError] = useState('')
  const position = soundPosition(sounds, surface.id)
  const canNavigate = position.total > 1
  const canPlay = Boolean(surface.audioUrl && duration > 0 && !playbackError)
  const progress = playbackProgress(currentTime, duration)
  const currentLabel = formatPlaybackTime(currentTime)
  const durationLabel = formatPlaybackTime(duration)

  useEffect(() => {
    const audio = audioRef.current
    audio?.pause()
    if (audio) audio.currentTime = 0
    setPlaying(false)
    setCurrentTime(0)
    setDuration(resolvePlaybackDuration(0, surface.durationSeconds))
    setPlaybackError('')
  }, [surface.id, surface.durationSeconds])

  const navigate = (direction) => {
    const target = adjacentSound(sounds, surface.id, direction)
    if (target && target.id !== surface.id) onSelect?.(target)
  }
  const updateMeasuredDuration = () => {
    const measuredDuration = audioRef.current?.duration
    setDuration(resolvePlaybackDuration(measuredDuration, surface.durationSeconds))
  }
  const togglePlayback = async () => {
    const audio = audioRef.current
    if (!audio || !canPlay) return
    setPlaybackError('')
    if (!audio.paused) {
      audio.pause()
      return
    }
    if (duration > 0 && audio.currentTime >= duration - 0.05) audio.currentTime = 0
    try {
      await audio.play()
    } catch {
      setPlaying(false)
      setPlaybackError('La lecture de ce son a échoué.')
    }
  }
  const seek = (event) => {
    const audio = audioRef.current
    if (!audio || !canPlay) return
    const nextTime = clampPlaybackTime(event.currentTarget.value, duration)
    audio.currentTime = nextTime
    setCurrentTime(nextTime)
  }

  return (
    <aside className="surface-inspector sound-inspector" aria-label="Détails du son sélectionné">
      <header><h2>{surface.name}</h2><ShieldCheck size={20} /></header>
      <div className="sound-preview-stage">
        <FileAudio size={56} strokeWidth={1.2} />
        <strong>{surface.category}</strong>
        <span>{surface.converted ? 'MP3 converti en WAV haute qualité' : 'WAV original validé'}</span>
      </div>

      <div className="sound-player-navigation" aria-label="Navigation entre les sons">
        <button type="button" aria-label="Son précédent" disabled={!canNavigate} onClick={() => navigate(-1)}><SkipBack size={17} /></button>
        <span>{position.total ? `${position.index + 1} / ${position.total}` : '—'}</span>
        <button type="button" aria-label="Son suivant" disabled={!canNavigate} onClick={() => navigate(1)}><SkipForward size={17} /></button>
        <button type="button" className={loop ? 'is-active' : ''} aria-label="Lecture en boucle" aria-pressed={loop} onClick={() => setLoop((current) => !current)}><Repeat2 size={17} /> Boucle</button>
      </div>
      <div className={`sound-transport${canPlay ? '' : ' is-disabled'}`}>
        {surface.audioUrl ? (
          <audio
            ref={audioRef}
            className="sound-audio-engine"
            src={surface.audioUrl}
            loop={loop}
            preload="metadata"
            onLoadedMetadata={updateMeasuredDuration}
            onDurationChange={updateMeasuredDuration}
            onTimeUpdate={(event) => setCurrentTime(clampPlaybackTime(event.currentTarget.currentTime, duration))}
            onPlay={() => setPlaying(true)}
            onPause={() => setPlaying(false)}
            onEnded={() => {
              setPlaying(false)
              if (!loop) setCurrentTime(duration)
            }}
            onError={() => {
              setPlaying(false)
              setPlaybackError('Le fichier audio ne peut pas être lu.')
            }}
          >
            La lecture audio n’est pas prise en charge sur ce poste.
          </audio>
        ) : null}
        <div className="sound-transport-main">
          <button
            className="sound-play-toggle"
            type="button"
            aria-label={playing ? 'Mettre en pause' : 'Lire le son'}
            disabled={!canPlay}
            onClick={togglePlayback}
          >
            {playing ? <Pause size={18} fill="currentColor" /> : <Play size={18} fill="currentColor" />}
          </button>
          <div className="sound-timeline">
            <input
              type="range"
              min="0"
              max={duration || 1}
              step="0.01"
              value={clampPlaybackTime(currentTime, duration)}
              disabled={!canPlay}
              aria-label="Position de lecture"
              aria-valuetext={`${currentLabel} sur ${durationLabel}`}
              style={{ '--sound-progress': `${progress}%` }}
              onChange={seek}
            />
            <div className="sound-time-readout" aria-live="off">
              <time>{currentLabel}</time>
              <span>Durée totale&nbsp;: <time>{durationLabel}</time></span>
            </div>
          </div>
        </div>
        {!surface.audioUrl ? <p className="sound-playback-status">Lecture disponible dans l’application desktop.</p> : null}
        {playbackError ? <p className="sound-playback-status is-error" role="alert">{playbackError}</p> : null}
      </div>

      <dl className="surface-facts">
        <div><dt>Durée</dt><dd>{formatPlaybackTime(surface.durationSeconds)}</dd></div>
        <div><dt>Format</dt><dd>WAV · {surface.bitDepth || 24} bits</dd></div>
        <div><dt>Fréquence</dt><dd>{surface.sampleRate ? `${Math.round(surface.sampleRate / 1000)} kHz` : '—'}</dd></div>
        <div><dt>Canaux</dt><dd>{surface.channels === 1 ? 'Mono' : surface.channels === 2 ? 'Stéréo' : surface.channels || '—'}</dd></div>
        <div><dt>Taille</dt><dd>{formatBytes(surface.sizeBytes)}</dd></div>
      </dl>

      <div className="sound-vault-status">
        <CheckCircle2 size={17} />
        <span><strong>Original conservé dans le Vault</strong><small>ID permanent et hash vérifiés.</small></span>
      </div>
      <p className="sound-install-note">Le Coffre prépare le dossier Audio du projet et un WAV au nom unique. UEFN demande encore le glisser-déposer final tant que son connecteur officiel n’expose pas l’import automatique des SoundWave.</p>
      <VaultInstallControl
        surface={surface}
        projects={projects}
        selectedProjectId={selectedProjectId}
        installing={installing}
        onProject={onProject}
        onProjectFavorite={onProjectFavorite}
        onInstall={onInstall}
        variant={surface.variantOptions?.[0]}
      />
      <button className="vault-trash-trigger" type="button" disabled={trashBusy} onClick={() => onTrash?.(surface)}><Trash2 size={16} /> Mettre ce son dans la corbeille</button>
    </aside>
  )
}
