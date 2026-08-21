const MCP_URL = 'http://127.0.0.1:8000/mcp'

const decodePayload = async (response) => {
  const text = (await response.text()).trim()
  if (!text) return {}
  if (text.startsWith('data:')) {
    const lines = text.split(/\r?\n/).filter((line) => line.startsWith('data:'))
    return JSON.parse(lines.at(-1).slice(5).trim())
  }
  return JSON.parse(text)
}

const resultMessage = (response) => {
  if (response?.error) throw new Error(response.error.message || 'Action MCP impossible')
  const result = response?.result || {}
  const message = (result.content || [])
    .filter((item) => item.type === 'text')
    .map((item) => item.text || '')
    .join('\n')
  if (result.isError) throw new Error(message || 'Le serveur MCP a refusé l’action')
  return message
}

export class UefnMcpClient {
  constructor(url = MCP_URL, { timeoutMs = 90_000 } = {}) {
    this.url = url
    this.timeoutMs = timeoutMs
    this.sessionId = null
    this.nextId = 100
  }

  async post(payload, timeoutMs = this.timeoutMs) {
    const headers = {
      Accept: 'application/json, text/event-stream',
      'Content-Type': 'application/json',
    }
    if (this.sessionId) headers['mcp-session-id'] = this.sessionId
    const response = await fetch(this.url, {
      method: 'POST',
      headers,
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(timeoutMs),
    })
    if (!response.ok) throw new Error(`UEFN MCP indisponible (${response.status})`)
    this.sessionId = response.headers.get('mcp-session-id') || this.sessionId
    return decodePayload(response)
  }

  async initialize() {
    if (this.sessionId) return
    const response = await this.post({
      jsonrpc: '2.0',
      id: 1,
      method: 'initialize',
      params: {
        protocolVersion: '2025-06-18',
        capabilities: {},
        clientInfo: { name: 'Noblesse Studio', version: '0.2.0' },
      },
    })
    if (response.error) throw new Error(response.error.message || 'Initialisation MCP impossible')
    await this.post({ jsonrpc: '2.0', method: 'notifications/initialized', params: {} })
  }

  async callMetaTool(name, args = {}) {
    await this.initialize()
    this.nextId += 1
    const response = await this.post({
      jsonrpc: '2.0',
      id: this.nextId,
      method: 'tools/call',
      params: { name, arguments: args },
    })
    return resultMessage(response)
  }

  async listToolsets() {
    const message = await this.callMetaTool('list_toolsets')
    return String(message)
      .split(/\r?\n/)
      .map((line) => line.match(/^- ([A-Za-z0-9_.]+):/)?.[1] || '')
      .filter(Boolean)
  }

  async describeToolset(toolsetName) {
    const message = await this.callMetaTool('describe_toolset', { toolset_name: toolsetName })
    try {
      return JSON.parse(message)
    } catch {
      throw new Error(`Le serveur MCP a renvoyé une description invalide pour ${toolsetName}`)
    }
  }

  async missingTools(requirements) {
    const missing = []
    for (const [toolsetName, expectedTools] of Object.entries(requirements)) {
      const description = await this.describeToolset(toolsetName)
      const available = new Set((description.tools || []).map((tool) => String(tool.name).split('.').at(-1)))
      for (const tool of expectedTools) {
        if (!available.has(tool)) missing.push(`${toolsetName}.${tool}`)
      }
    }
    return missing
  }

  async call(toolsetName, toolName, args = {}) {
    await this.initialize()
    this.nextId += 1
    const response = await this.post({
      jsonrpc: '2.0',
      id: this.nextId,
      method: 'tools/call',
      params: {
        name: 'call_tool',
        arguments: { toolset_name: toolsetName, tool_name: toolName, arguments: args },
      },
    })
    const message = resultMessage(response)
    if (!message) return null
    try {
      const parsed = JSON.parse(message)
      return parsed.returnValue ?? parsed
    } catch {
      return message
    }
  }
}
