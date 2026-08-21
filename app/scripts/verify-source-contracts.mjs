import { readFile, readdir } from 'node:fs/promises'
import path from 'node:path'

import { studioAppRoot } from '../electron/lib/studioPaths.mjs'
import { findMojibake } from './source-text-contract.mjs'

const appRoot = studioAppRoot()
const sourceRoot = path.join(appRoot, 'app')
const read = (relativePath) => readFile(path.join(appRoot, relativePath), 'utf8')
const fail = (message) => { throw new Error(`Contrat source refusé : ${message}`) }
const requireText = (source, pattern, message) => { if (!pattern.test(source)) fail(message) }
const forbidText = (source, pattern, message) => { if (pattern.test(source)) fail(message) }

const walkSourceFiles = async (root) => {
  const files = []
  for (const entry of await readdir(root, { withFileTypes: true })) {
    if (['dist', 'node_modules'].includes(entry.name) || /^(?:build|release)(?:-|$)/u.test(entry.name)) continue
    const target = path.join(root, entry.name)
    if (entry.isDirectory()) files.push(...await walkSourceFiles(target))
    else if (/\.(?:cjs|css|html|js|jsx|json|md|mjs|ps1|ts|tsx|yaml|yml)$/u.test(entry.name)) files.push(target)
  }
  return files
}

const [packageJson, main, preload, html, virtualGrid, coffre, windowsTaskbarIdentity, ipcGateway, publicIpcContracts] = await Promise.all([
  read('app/package.json').then(JSON.parse),
  read('app/electron/main.mjs'),
  read('app/electron/preload.cjs'),
  read('app/index.html'),
  read('app/src/components/VirtualizedSurfaceGrid.jsx'),
  read('app/src/components/CoffreView.jsx'),
  read('app/electron/lib/windowsTaskbarIdentity.mjs'),
  read('app/electron/lib/studioIpcGateway.mjs'),
  read('app/shared/publicIpcContracts.mjs'),
])

if (!/^\d+\.\d+\.\d+$/u.test(packageJson.version)) fail('la version du paquet doit suivre SemVer.')
if (Number(packageJson.version.split('.')[0]) < 1) fail('une livraison finale ne peut pas rester en version 0.x.')
if (packageJson.private !== true) fail('le paquet applicatif doit rester privé.')
if (packageJson.scripts?.prebuild) fail('le build reproductible ne doit pas dépendre d’un Vault local privé.')
if (packageJson.scripts?.predev !== 'node scripts/sync-data.mjs') fail('le catalogue web local doit être synchronisé uniquement avant le mode développement.')
if (!packageJson.build?.files?.includes('assets/noblesse-vault.ico')) fail('l’icône runtime doit être incluse dans app.asar.')
if (packageJson.build?.electronDist !== 'node_modules/electron/dist') fail('le packaging Windows doit utiliser le moteur Electron local vérifié.')
if (packageJson.build?.afterPack !== 'scripts/after-pack.mjs') fail('le packaging doit supprimer l’application d’accueil générique Electron.')
requireText(windowsTaskbarIdentity, new RegExp(`windowsAppId\\s*=\\s*['"]${packageJson.build.appId.replaceAll('.', '\\.')}['"]`, 'u'), 'l’identité de la fenêtre doit correspondre exactement à celle de l’installateur.')

requireText(main, /contextIsolation:\s*true/u, 'contextIsolation doit être activé.')
requireText(main, /nodeIntegration:\s*false/u, 'nodeIntegration doit être désactivé.')
requireText(main, /sandbox:\s*true/u, 'le sandbox renderer doit être activé.')
requireText(main, /webSecurity:\s*true/u, 'webSecurity doit être explicitement activé.')
requireText(main, /setPermissionRequestHandler\([^]*callback\(false\)/u, 'les permissions Chromium doivent être refusées par défaut.')
requireText(main, /setWindowOpenHandler/u, 'les nouvelles fenêtres doivent passer par une politique explicite.')
requireText(main, /senderFrame\s*!==\s*event\.sender\.mainFrame/u, 'les appels IPC doivent être limités à la frame principale.')
requireText(main, /isAllowedRendererUrl\(event\.senderFrame\?\.url\)/u, 'les appels IPC doivent vérifier l’URL exacte de la frame principale.')
requireText(main, /app\.setAppUserModelId\(windowsAppId\)/u, 'l’identité Windows doit correspondre à l’appId de distribution.')
requireText(main, /window\.setAppDetails\(buildWindowsTaskbarDetails/u, 'la fenêtre doit publier une commande de relance explicite à la barre des tâches.')
requireText(main, /const applicationIconPath[^]*assets[^]*noblesse-vault\.ico/u, 'l’icône runtime doit utiliser un chemin centralisé.')
requireText(main, /if \(tray\) \{[^]*event\.preventDefault\(\)[^]*window\.hide\(\)/u, 'la fermeture ne doit être interceptée que si l’icône système existe.')
forbidText(main, /nodeIntegration:\s*true|contextIsolation:\s*false|webSecurity:\s*false/u, 'une préférence Electron dangereuse est présente.')

const directHandlerCount = [...main.matchAll(/ipcMain\.handle\(/gu)].length
const gatewayHandlerCount = [...main.matchAll(/studioIpc\.handle\(/gu)].length
const handlerCount = directHandlerCount + gatewayHandlerCount
const senderCheckCount = [...main.matchAll(/requireStudioSender\(event\)/gu)].length
if (!directHandlerCount || directHandlerCount !== senderCheckCount) fail('chaque handler IPC direct doit avoir exactement un contrôle d’émetteur.')
if (gatewayHandlerCount !== 3) fail('les trois réponses assets/projets doivent passer par la passerelle IPC publique.')
for (const channel of ['noblesse:assets', 'noblesse:projects', 'noblesse:project-favorite']) {
  requireText(main, new RegExp(`studioIpc\\.handle\\('${channel}'`, 'u'), `${channel} doit passer par la passerelle IPC publique.`)
}
forbidText(main, /ipcMain\.handle\('noblesse:(?:assets|projects|project-favorite)'/u, 'un canal public assets/projets contourne la passerelle IPC.')
requireText(ipcGateway, /authorizeSender\(event\)[^]*assertRequest\(request\)[^]*handler\(request, event\)[^]*serializeResponse\(response\)/u, 'la passerelle IPC doit autoriser, valider, exécuter puis sérialiser dans cet ordre.')
requireText(publicIpcContracts, /additionalProperties:\s*false/u, 'les DTO IPC publics doivent être fermés par défaut.')
requireText(publicIpcContracts, /serializeAssetsResponseV1[^]*serializeProjectsResponseV1/u, 'les réponses assets et projets doivent avoir des sérialiseurs publics dédiés.')
requireText(publicIpcContracts, /Windows drive path[^]*UNC path[^]*Windows device path[^]*file URL/u, 'le garde-fou IPC doit refuser les formes de chemins privés connues.')

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
const rendererFiles = await walkSourceFiles(path.join(sourceRoot, 'src'))
for (const file of rendererFiles) {
  const source = await readFile(file, 'utf8')
  for (const [pattern, label] of dangerousRendererPatterns) {
    if (pattern.test(source)) fail(`${label} est présent dans ${path.relative(appRoot, file)}.`)
  }
}

const sourceTextFiles = await walkSourceFiles(sourceRoot)
for (const file of sourceTextFiles) {
  const issue = findMojibake(await readFile(file, 'utf8'))
  if (issue) {
    fail(`texte UTF-8 suspect dans ${path.relative(appRoot, file)}:${issue.line} (${issue.reason}; ${issue.codePoints}).`)
  }
}

console.log(JSON.stringify({
  status: 'PASS',
  version: packageJson.version,
  ipcHandlers: handlerCount,
  rendererFilesChecked: rendererFiles.length,
  sourceTextFilesChecked: sourceTextFiles.length,
  virtualizationOverscanRows: 3,
}, null, 2))
