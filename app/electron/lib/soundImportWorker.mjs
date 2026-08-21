import { parentPort, workerData } from 'node:worker_threads'
import { processSoundFile } from './audioFileProcessor.mjs'

processSoundFile(workerData)
  .then((result) => parentPort.postMessage({ ok: true, result }))
  .catch((error) => parentPort.postMessage({ ok: false, error: error instanceof Error ? error.message : String(error) }))
