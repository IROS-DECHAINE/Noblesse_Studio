#!/usr/bin/env node

import { randomUUID } from 'node:crypto'
import { readFile } from 'node:fs/promises'
import { homedir } from 'node:os'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import { createCalendarStore, enqueueCalendarInboxOperation } from '../electron/lib/calendarStore.mjs'
import { CalendarValidationError } from '../shared/calendarDomain.mjs'

const usage = `Noblesse Studio calendar CLI

Usage:
  node scripts/calendar-cli.mjs [--root <directory>] list
  node scripts/calendar-cli.mjs [--root <directory>] create [--operation-id <id>] --json '<item>'
  node scripts/calendar-cli.mjs [--root <directory>] update <id> [--operation-id <id>] --json '<patch>'
  node scripts/calendar-cli.mjs [--root <directory>] delete <id> [--operation-id <id>]
  node scripts/calendar-cli.mjs [--root <directory>] settings [--operation-id <id>] --json '<patch>'
  node scripts/calendar-cli.mjs [--root <directory>] import-legacy [--operation-id <id>] --file <items.json>

Mutations are written atomically to calendar-inbox. The desktop store applies
them with drainInbox(); list only reads the committed calendar snapshot.
`

const defaultRoot = () => process.env.NOBLESSE_CALENDAR_ROOT
  || (process.env.APPDATA
    ? path.join(process.env.APPDATA, 'Noblesse Studio', 'calendar')
    : path.join(homedir(), '.noblesse-studio', 'calendar'))

export const parseCalendarCliArgs = (argv) => {
  const args = [...argv]
  let rootDir = defaultRoot()
  let operationId
  const filtered = []
  for (let index = 0; index < args.length; index += 1) {
    const token = args[index]
    if (token === '--root') {
      rootDir = args[++index]
      if (!rootDir) throw new CalendarValidationError('--root attend un dossier', 'CALENDAR_CLI_INVALID')
    } else if (token.startsWith('--root=')) {
      rootDir = token.slice('--root='.length)
    } else if (token === '--operation-id') {
      operationId = args[++index]
      if (!operationId) throw new CalendarValidationError('--operation-id attend une valeur', 'CALENDAR_CLI_INVALID')
    } else if (token.startsWith('--operation-id=')) {
      operationId = token.slice('--operation-id='.length)
    } else filtered.push(token)
  }
  const command = filtered.shift() ?? 'help'
  const options = operationId ? { operationId } : {}
  const positionals = []
  for (let index = 0; index < filtered.length; index += 1) {
    const token = filtered[index]
    if (token === '--json' || token === '--file') {
      const value = filtered[++index]
      if (value === undefined) throw new CalendarValidationError(`${token} attend une valeur`, 'CALENDAR_CLI_INVALID')
      options[token.slice(2)] = value
    } else positionals.push(token)
  }
  return { rootDir: path.resolve(rootDir), command, options, positionals }
}

const readJsonPayload = async (options) => {
  let raw
  if (options.json !== undefined) raw = options.json
  else if (options.file !== undefined) raw = await readFile(path.resolve(options.file), 'utf8')
  else if (!process.stdin.isTTY) raw = await readFile(0, 'utf8')
  else throw new CalendarValidationError('Ajoute --json, --file ou du JSON sur stdin', 'CALENDAR_CLI_INVALID')
  try {
    return JSON.parse(String(raw).replace(/^\uFEFF/, ''))
  } catch {
    throw new CalendarValidationError('Payload JSON invalide', 'CALENDAR_CLI_INVALID')
  }
}

const printJson = (value, stdout) => stdout.write(`${JSON.stringify(value, null, 2)}\n`)

export const runCalendarCli = async (argv, {
  stdout = process.stdout,
  stderr = process.stderr,
  now = () => new Date(),
  createId = randomUUID,
} = {}) => {
  const { rootDir, command, options, positionals } = parseCalendarCliArgs(argv)
  if (command === 'help' || command === '--help' || command === '-h') {
    stdout.write(usage)
    return 0
  }

  if (command === 'list') {
    const store = createCalendarStore({ rootDir, now, randomUUID: createId })
    const snapshot = await store.getSnapshot()
    printJson({ schemaVersion: snapshot.schemaVersion, revision: snapshot.revision, items: snapshot.items }, stdout)
    return 0
  }

  let type
  let payload
  if (command === 'create') {
    type = 'create'
    payload = { input: await readJsonPayload(options) }
  } else if (command === 'update') {
    if (!positionals[0]) throw new CalendarValidationError('update attend un id', 'CALENDAR_CLI_INVALID')
    type = 'update'
    payload = { id: positionals[0], patch: await readJsonPayload(options) }
  } else if (command === 'delete') {
    if (!positionals[0]) throw new CalendarValidationError('delete attend un id', 'CALENDAR_CLI_INVALID')
    type = 'delete'
    payload = { id: positionals[0] }
  } else if (command === 'settings') {
    type = 'updateSettings'
    payload = { patch: await readJsonPayload(options) }
  } else if (command === 'import-legacy') {
    type = 'importLegacy'
    payload = { items: await readJsonPayload(options) }
  } else {
    stderr.write(`Commande inconnue: ${command}\n\n${usage}`)
    return 2
  }

  const queued = await enqueueCalendarInboxOperation({
    rootDir,
    type,
    payload,
    operationId: options.operationId ?? createId(),
    now,
  })
  printJson({ status: queued.status, operationId: queued.operation.operationId, type: queued.operation.type, filePath: queued.filePath }, stdout)
  return 0
}

export const main = async () => {
  try {
    process.exitCode = await runCalendarCli(process.argv.slice(2))
  } catch (error) {
    process.stderr.write(`${error?.code ? `[${error.code}] ` : ''}${error instanceof Error ? error.message : String(error)}\n`)
    process.exitCode = 1
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) await main()
