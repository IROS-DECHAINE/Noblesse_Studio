import assert from 'node:assert/strict'
import test from 'node:test'

import { buildWindowsTaskbarDetails, windowsAppId } from './windowsTaskbarIdentity.mjs'

test('the packaged taskbar identity relaunches the Noblesse Studio executable', () => {
  const executablePath = 'D:\\NO_BLESSE Studio\\Noblesse Studio App\\app\\build\\Noblesse Studio.exe'
  const details = buildWindowsTaskbarDetails({
    isPackaged: true,
    executablePath,
    applicationPath: 'D:\\unused',
    developmentIconPath: 'D:\\unused.ico',
  })

  assert.equal(windowsAppId, 'com.noblesse.studio.desktop')
  assert.equal(details.appId, windowsAppId)
  assert.equal(details.appIconPath, executablePath)
  assert.equal(details.relaunchCommand, `"${executablePath}"`)
  assert.equal(details.relaunchDisplayName, 'Noblesse Studio')
})

test('the development taskbar identity always relaunches Electron with the application path', () => {
  const executablePath = 'D:\\Noblesse Studio\\node_modules\\electron\\dist\\electron.exe'
  const applicationPath = 'D:\\Noblesse Studio\\app'
  const developmentIconPath = 'D:\\Noblesse Studio\\app\\assets\\noblesse-vault.ico'
  const details = buildWindowsTaskbarDetails({
    isPackaged: false,
    executablePath,
    applicationPath,
    developmentIconPath,
  })

  assert.equal(details.appIconPath, developmentIconPath)
  assert.equal(details.relaunchCommand, `"${executablePath}" "${applicationPath}"`)
})

test('the taskbar identity refuses an incomplete relaunch command', () => {
  assert.throws(() => buildWindowsTaskbarDetails({
    isPackaged: false,
    executablePath: 'electron.exe',
    applicationPath: '',
    developmentIconPath: 'noblesse.ico',
  }), /chemin de l’application/u)
})
