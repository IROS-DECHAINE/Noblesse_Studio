import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { createReadStream } from 'node:fs'
import { createFortnitePrimebotFetcher } from './electron/lib/fortniteData.mjs'
import { loadMaterialPreviewDescriptor, resolveVaultPreviewSource } from './electron/lib/vaultService.mjs'

export function localUefnBridge() {
  const getFortnitePrimebot = createFortnitePrimebotFetcher()

  const json = (res, status, payload) => {
    res.statusCode = status
    res.setHeader('Content-Type', 'application/json; charset=utf-8')
    res.end(JSON.stringify(payload))
  }

  const fortnitePrimebot = async (req, res) => {
    res.setHeader('Cache-Control', 'no-store')
    const force = new URL(req.url || '/', 'http://noblesse.local').searchParams.get('force') === '1'
    json(res, 200, await getFortnitePrimebot({ force }))
  }

  const health = async (_req, res) => {
    const startedAt = Date.now()
    try {
      const response = await fetch('http://127.0.0.1:8000/mcp', {
        method: 'GET',
        headers: { Accept: 'application/json, text/event-stream' },
        signal: AbortSignal.timeout(900),
      })
      json(res, 200, {
        connected: true,
        port: 8000,
        latencyMs: Date.now() - startedAt,
        transportStatus: response.status,
      })
    } catch {
      json(res, 200, {
        connected: false,
        port: 8000,
        latencyMs: Date.now() - startedAt,
      })
    }
  }

  const materialPreview = async (req, res) => {
    res.setHeader('Cache-Control', 'no-store')
    if (req.method !== 'GET') return json(res, 405, { error: 'MÃ©thode non autorisÃ©e' })
    const assetId = new URL(req.url || '/', 'http://noblesse.local').searchParams.get('assetId')?.trim()
    if (!assetId || assetId.length > 256) return json(res, 400, { error: 'Asset invalide' })
    try {
      return json(res, 200, await loadMaterialPreviewDescriptor(assetId))
    } catch {
      return json(res, 404, { error: 'AperÃ§u matÃ©riau indisponible' })
    }
  }

  const vaultPreviewFile = async (req, res) => {
    if (req.method !== 'GET' && req.method !== 'HEAD') {
      return json(res, 405, { error: 'MÃ©thode non autorisÃ©e' })
    }
    try {
      const source = new URL(req.url || '/', 'http://noblesse.local').searchParams.get('source') || ''
      const { filePath, mimeType, size } = await resolveVaultPreviewSource(source)
      res.statusCode = 200
      res.setHeader('Content-Type', mimeType)
      res.setHeader('Content-Length', String(size))
      res.setHeader('Cache-Control', 'no-store')
      res.setHeader('X-Content-Type-Options', 'nosniff')
      if (req.method === 'HEAD') return res.end()
      const stream = createReadStream(filePath)
      stream.on('error', () => {
        if (!res.headersSent) json(res, 404, { error: 'AperÃ§u indisponible' })
        else res.destroy()
      })
      return stream.pipe(res)
    } catch {
      return json(res, 404, { error: 'AperÃ§u indisponible' })
    }
  }

  const installPlan = (req, res) => {
    let body = ''
    req.on('data', (chunk) => {
      body += chunk
      if (body.length > 64_000) req.destroy()
    })
    req.on('end', () => {
      try {
        const request = JSON.parse(body || '{}')
        json(res, 200, {
          accepted: true,
          mode: 'PLAN_ONLY',
          packId: request.packId,
          assetId: request.assetId,
          targetPath: request.targetPath,
          steps: [
            'Vérifier la version UEFN cible',
            'Résoudre les dépendances du pack',
            'Transférer par UEFN MCP ou migration officielle',
            'Relire les références et lancer la validation UEFN',
          ],
          warning: "Aucune mutation n’est exécutée depuis le mode aperçu navigateur.",
        })
      } catch {
        json(res, 400, { accepted: false, error: 'Requête invalide' })
      }
    })
  }

  return {
    name: 'noblesse-local-uefn-bridge',
    configureServer(server) {
      server.middlewares.use('/api/uefn-health', health)
      server.middlewares.use('/api/fortnite-primebot', fortnitePrimebot)
      server.middlewares.use('/api/material-preview', materialPreview)
      server.middlewares.use('/api/vault-preview', vaultPreviewFile)
      server.middlewares.use('/api/install-plan', installPlan)
    },
    configurePreviewServer(server) {
      server.middlewares.use('/api/uefn-health', health)
      server.middlewares.use('/api/fortnite-primebot', fortnitePrimebot)
      server.middlewares.use('/api/material-preview', materialPreview)
      server.middlewares.use('/api/vault-preview', vaultPreviewFile)
      server.middlewares.use('/api/install-plan', installPlan)
    },
  }
}

export default defineConfig({
  base: './',
  cacheDir: './node_modules/.vite',
  plugins: [react(), localUefnBridge()],
  server: { port: 4178, strictPort: true },
  preview: { port: 4178, strictPort: true },
})
