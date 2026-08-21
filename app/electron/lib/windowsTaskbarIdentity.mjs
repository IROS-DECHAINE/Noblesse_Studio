export const windowsAppId = 'com.noblesse.studio.desktop'

const quoteCommandArgument = (value, label) => {
  const normalized = String(value || '').trim()
  if (!normalized) throw new Error(`${label} est requis pour l’identité Windows.`)
  if (normalized.includes('"')) throw new Error(`${label} contient un caractère interdit.`)
  return `"${normalized}"`
}

export const buildWindowsTaskbarDetails = ({
  isPackaged,
  executablePath,
  applicationPath,
  developmentIconPath,
}) => {
  const executable = quoteCommandArgument(executablePath, 'Le chemin de l’exécutable')
  const relaunchCommand = isPackaged
    ? executable
    : `${executable} ${quoteCommandArgument(applicationPath, 'Le chemin de l’application')}`

  return {
    appId: windowsAppId,
    appIconPath: isPackaged ? String(executablePath) : String(developmentIconPath),
    appIconIndex: 0,
    relaunchCommand,
    relaunchDisplayName: 'Noblesse Studio',
  }
}
