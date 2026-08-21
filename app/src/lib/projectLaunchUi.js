const BUSY_STATES = new Set(['LAUNCHING', 'CONNECTING'])
const ERROR_STATES = new Set([
  'WRONG_PROJECT',
  'WRONG_PORT',
  'PORT_IN_USE',
  'PORT_CONFLICT',
  'OPEN_MCP_UNAVAILABLE',
  'CONNECTED_UNSUPPORTED',
  'DESCRIPTOR_MISSING',
])

export function getProjectLaunchAction(profile, pending = false) {
  if (!profile) return null
  const busy = pending || BUSY_STATES.has(profile.state)
  if (profile.state === 'READY') {
    return {
      label: `Ouvert · MCP ${profile.expectedPort}`,
      statusLabel: `Session vérifiée sur le port ${profile.expectedPort}`,
      tone: 'ready',
      disabled: true,
      busy: false,
    }
  }
  if (busy) {
    return {
      label: profile.state === 'CONNECTING' ? 'Validation MCP\u2026' : 'Lancement UEFN\u2026',
      statusLabel: profile.message,
      tone: 'busy',
      disabled: true,
      busy: true,
    }
  }
  if (profile.state === 'CLOSED') {
    return {
      label: `Lancer UEFN · MCP ${profile.expectedPort}`,
      statusLabel: profile.message,
      tone: 'idle',
      disabled: !profile.canLaunch,
      busy: false,
    }
  }
  if (profile.state === 'LAUNCH_TIMEOUT') {
    return {
      label: `Relancer UEFN · MCP ${profile.expectedPort}`,
      statusLabel: profile.message,
      tone: 'warning',
      disabled: !profile.canLaunch,
      busy: false,
    }
  }
  if (profile.state === 'LAUNCH_FAILED') {
    return {
      label: `Relancer UEFN · MCP ${profile.expectedPort}`,
      statusLabel: profile.message,
      tone: 'warning',
      disabled: !profile.canLaunch,
      busy: false,
    }
  }
  if (profile.state === 'PROJECT_BROWSER') {
    return {
      label: 'Portail UEFN ouvert',
      statusLabel: profile.message,
      tone: 'warning',
      disabled: true,
      busy: false,
    }
  }
  if (profile.state === 'WRONG_PROJECT') {
    return {
      label: 'Mauvais projet ouvert',
      statusLabel: profile.message,
      tone: 'error',
      disabled: true,
      busy: false,
    }
  }
  if (profile.state === 'PORT_IN_USE') {
    return {
      label: `Port MCP ${profile.expectedPort} occupé`,
      statusLabel: profile.message,
      tone: 'error',
      disabled: true,
      busy: false,
    }
  }
  return {
    label: profile.opened ? 'Projet à relancer proprement' : 'Lancement indisponible',
    statusLabel: profile.message,
    tone: ERROR_STATES.has(profile.state) ? 'error' : 'warning',
    disabled: true,
    busy: false,
  }
}

export const projectLaunchUiInternals = { BUSY_STATES, ERROR_STATES }
