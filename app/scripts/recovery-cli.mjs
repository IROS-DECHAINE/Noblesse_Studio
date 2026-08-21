import process from 'node:process'

import { createBackupService } from '../electron/lib/backupService.mjs'
import {
  studioBackupsRoot,
  studioDocumentsRoot,
  studioStateRoot,
  studioVaultRoot,
} from '../electron/lib/studioPaths.mjs'

const service = createBackupService({
  backupRoot: studioBackupsRoot(),
  roots: {
    vault: studioVaultRoot(),
    documents: studioDocumentsRoot(),
    state: studioStateRoot(),
  },
})

const [command = 'status', ...args] = process.argv.slice(2)
const json = (value) => process.stdout.write(`${JSON.stringify(value, null, 2)}\n`)

if (command === 'status') {
  json(await service.status())
} else if (command === 'create') {
  json(await service.createSnapshot({ reason: 'cli', label: args.join(' ') }))
} else if (command === 'verify') {
  if (!args[0]) throw new Error('Usage : pnpm recovery verify <snapshotId>')
  json(await service.verifySnapshot(args[0]))
} else if (command === 'plan-restore') {
  if (!args[0]) throw new Error('Usage : pnpm recovery plan-restore <snapshotId>')
  json(await service.planRestore(args[0]))
} else if (command === 'apply-restore') {
  const [planId, planHash] = args
  if (!planId || !planHash || !args.includes('--acknowledge-app-closed')) {
    throw new Error('Fermez Noblesse Studio puis utilisez : pnpm recovery apply-restore <planId> <planHash> --acknowledge-app-closed')
  }
  json(await service.applyRestore({ planId, planHash }))
} else {
  throw new Error('Commandes : status, create, verify, plan-restore, apply-restore')
}
