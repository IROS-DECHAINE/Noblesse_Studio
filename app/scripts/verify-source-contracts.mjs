import { readFile, readdir } from 'node:fs/promises'
import path from 'node:path'

import { studioAppRoot } from '../electron/lib/studioPaths.mjs'

const appRoot = studioAppRoot()
const sourceRoot = path.join(appRoot, 'app')
const read = (relativePath) => readFile(path.join(appRoot, relativePath), 'utf8')
const fail = (message) => { throw new Error(`Contrat source refusé : ${message}`) }
const requireText = (source, pattern, message) => { if (!pattern.test(source)) fail(message) }
const forbidText = (source, pattern, message) => { if (pattern.test(source)) fail(message) }

const walkSourceFiles = async (root) => {
  const files = []
  for (const entry of await readdir(root, { withFileTypes: true })) {
    if (['dist', 'node_modules', 'release'].includes(entry.name)) continue
    const target = path.join(root, entry.name)
    if (entry.isDirectory()) files.push(...await walkSourceFiles(target))
    else if (/\.(?:cjs|html|js|jsx|mjs)$/u.test(entry.name)) files.push(target)
  }
  return files
}

const [packageJson, main, preload, html, virtualGrid, coffre] = await Promise.all([
  read('app/package.json').then(JSON.parse),
  read('app/electron/main.mjs'),
  read('app/electron/preload.cjs'),
  read('app/index.html'),
  read('app/src/components/VirtualizedSurfaceGrid.jsx'),
  read('app/src/components/CoffreView.jsx'),
])

if (!/^\d+\.\d+\.\d+$/u.test(packageJson.version)) fail('la version du paquet doit suivre SemVer.')
if (Number(packageJson.version.split('.')[0]) < 1) fail('une livraison finale ne peut pas rester en version 0.x.')
if (packageJson.private !== true) fail('le paquet applicatif doit rester privé.')

requireText(main, /contextIsolation:\s*true/u, 'contextIsolation doit être activé.')
requireText(main, /nodeIntegration:\s*false/u, 'nodeIntegration doit être désactivé.')
requireText(main, /sandbox:\s*true/u, 'le sandbox renderer doit être activé.')
requireText(main, /webSecurity:\s*true/u, 'webSecurity doit être explicitement activé.')
requireText(main, /setPermissionRequestHandler\([^]*callback\(false\)/u, 'les permissions Chromium doivent être refusées par défaut.')
requireText(main, /setWindowOpenHandler/u, 'les nouvelles fenêtres doivent passer par une politique explicite.')
requireText(main, /senderFrame\s*!==\s*event\.sender\.mainFrame/u, 'les appels IPC doivent être limités à la frame principale.')
forbidText(main, /nodeIntegration:\s*true|contextIsolation:\s*false|webSecurity:\s*false/u, 'une préférence Electron dangereuse est présente.')

const handlerCount = [...main.matchAll(/ipcMain\.handle\(/gu)].length
const senderCheckCount = [...main.matchAll(/requireStudioSender\(event\)/gu)].length
if (!handlerCount || handlerCount !== senderCheckCount) fail('chaque handler IPC doit avoir exactement un contrôle d’émetteur.')

requireText(preload, /contextBridge\.exposeInMainWorld\('noblesseDesktop'/u, 'le preload doit exposer une API métier unique.')
forbidText(preload, /window\.(?:fs|ipcRenderer|shell|childProcess)|exposeInMainWorld\([^]*?\bipcRenderer\s*[,}]/u, 'le preload expose un accès privilégié brut.')
forbidText(html, /script-src[^;]*'unsafe-eval'/u, 'la CSP ne doit jamais autoriser unsafe-eval.')
requireText(html, /object-src 'none'/u, 'la CSP doit bloquer les objets embarqués.')

requireText(virtualGrid, /OVERSCAN_ROWS\s*=\s*3/u, 'le Coffre doit précharger exactement trois lignes.')
requireText(virtualGrid, /surfaces\.slice\(/u, 'la grille doit monter une tranche bornée de cartes.')
forbidText(coffre, /filtered\.map\(/u, 'CoffreView ne doit pas monter toute la bibliothèque.')

const dangerousRendererPatterns = [
  [/dangerouslySetInnerHTML/u, 'dangerouslySetInnerHTML'],
  [/\beval\s*\(/u, 'eval'],
  [/\bnew\s+Function\s*\(/u, 'new Function'],
  [/\.innerHTML\s*=/u, 'une écriture innerHTML'],
  [/document\.write\s*\(/u, 'document.write'],
]
const files = await walkSourceFiles(path.join(sourceRoot, 'src'))
for (const file of files) {
  const source = await readFile(file, 'utf8')
  for (const [pattern, label] of dangerousRendererPatterns) {
    if (pattern.test(source)) fail(`${label} est présent dans ${path.relative(appRoot, file)}.`)
  }
}

console.log(JSON.stringify({
  status: 'PASS',
  version: packageJson.version,
  ipcHandlers: handlerCount,
  rendererFilesChecked: files.length,
  virtualizationOverscanRows: 3,
}, null, 2))
