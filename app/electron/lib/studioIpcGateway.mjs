export const createStudioIpcGateway = ({ ipcMain, authorizeSender }) => {
  if (!ipcMain?.handle) throw new Error('La passerelle IPC exige ipcMain.handle.')
  if (typeof authorizeSender !== 'function') throw new Error('La passerelle IPC exige un contrôle d’émetteur.')

  const handle = (channel, handler, {
    assertRequest = null,
    serializeResponse = (response) => response,
  } = {}) => {
    if (typeof channel !== 'string' || !channel) throw new Error('Canal IPC invalide.')
    if (typeof handler !== 'function') throw new Error(`Handler IPC invalide pour ${channel}.`)
    if (assertRequest !== null && typeof assertRequest !== 'function') {
      throw new Error(`Validateur IPC invalide pour ${channel}.`)
    }
    if (typeof serializeResponse !== 'function') throw new Error(`Sérialiseur IPC invalide pour ${channel}.`)

    ipcMain.handle(channel, async (event, request) => {
      authorizeSender(event)
      if (assertRequest) assertRequest(request)
      const response = await handler(request, event)
      return serializeResponse(response)
    })
  }

  return Object.freeze({ handle })
}
