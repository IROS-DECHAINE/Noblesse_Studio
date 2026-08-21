import { rm } from 'node:fs/promises'
import path from 'node:path'

export const removeElectronWelcomeFallback = async ({ appOutDir, electronPlatformName }) => {
  if (electronPlatformName !== 'win32') return { removed: false }
  const fallbackPath = path.join(appOutDir, 'resources', 'default_app.asar')
  await rm(fallbackPath, { force: true })
  return { removed: true, fallbackPath }
}

export default async function afterPack(context) {
  await removeElectronWelcomeFallback(context)
}
