import assert from 'node:assert/strict'
import test from 'node:test'
import { createStudioIpcGateway } from './studioIpcGateway.mjs'

const fakeIpcMain = () => {
  const handlers = new Map()
  return {
    handlers,
    handle(channel, handler) { handlers.set(channel, handler) },
  }
}

test('authorizes, validates and serializes an IPC call in that order', async () => {
  const calls = []
  const ipcMain = fakeIpcMain()
  const gateway = createStudioIpcGateway({
    ipcMain,
    authorizeSender: () => calls.push('authorize'),
  })
  gateway.handle('noblesse:test', async (request) => {
    calls.push(`handle:${request.value}`)
    return { internal: 'D:\\Private\\value', public: request.value }
  }, {
    assertRequest: () => calls.push('validate'),
    serializeResponse: (response) => {
      calls.push('serialize')
      return { value: response.public }
    },
  })

  const result = await ipcMain.handlers.get('noblesse:test')({ sender: {} }, { value: 'safe' })
  assert.deepEqual(result, { value: 'safe' })
  assert.deepEqual(calls, ['authorize', 'validate', 'handle:safe', 'serialize'])
})

test('stops before validation and business logic when the sender is unauthorized', async () => {
  let businessCalls = 0
  const ipcMain = fakeIpcMain()
  const gateway = createStudioIpcGateway({
    ipcMain,
    authorizeSender: () => { throw new Error('unauthorized') },
  })
  gateway.handle('noblesse:test', () => { businessCalls += 1 }, {
    assertRequest: () => { throw new Error('should not validate') },
  })

  await assert.rejects(ipcMain.handlers.get('noblesse:test')({}, {}), /unauthorized/)
  assert.equal(businessCalls, 0)
})

test('stops before business logic when the request violates its contract', async () => {
  let businessCalls = 0
  const ipcMain = fakeIpcMain()
  const gateway = createStudioIpcGateway({ ipcMain, authorizeSender: () => {} })
  gateway.handle('noblesse:test', () => { businessCalls += 1 }, {
    assertRequest: () => { throw new Error('invalid request') },
  })

  await assert.rejects(ipcMain.handlers.get('noblesse:test')({}, {}), /invalid request/)
  assert.equal(businessCalls, 0)
})
