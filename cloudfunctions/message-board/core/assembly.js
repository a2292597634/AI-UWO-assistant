const { URL } = require('node:url')
const { createBoardService } = require('./service')
const { createRepository } = require('./repository')
const catalog = require('../game-servers.json')
const { createSafetyProvider } = require('./safety-provider')
function readConfig() {
  const config = {
    environmentId: process.env.MESSAGE_BOARD_ENV,
    appId: process.env.MESSAGE_BOARD_APP_ID,
    identitySecret: process.env.MESSAGE_BOARD_IDENTITY_SECRET,
    callback: {
      baseUrl: process.env.MESSAGE_BOARD_CALLBACK_URL,
      token: process.env.MESSAGE_BOARD_CALLBACK_TOKEN,
      aesKey: process.env.MESSAGE_BOARD_CALLBACK_AES_KEY,
      imageKey: process.env.MESSAGE_BOARD_IMAGE_KEY,
      appId: process.env.MESSAGE_BOARD_APP_ID,
    },
  }
  if (
    !config.environmentId ||
    !config.appId ||
    !config.identitySecret ||
    config.identitySecret.length < 32 ||
    !/^[a-f0-9]{64}$/.test(config.callback.imageKey || '') ||
    !/^[A-Za-z0-9+/]{43}$/.test(config.callback.aesKey || '') ||
    !/^[a-zA-Z0-9_-]{3,32}$/.test(config.callback.token || '') ||
    new URL(config.callback.baseUrl).protocol !== 'https:'
  )
    throw new Error('留言板服務端配置不完整')
  return config
}
function createRuntimePorts(cloud, config = readConfig()) {
  const service = createBoardService({
    repo: createRepository(cloud.database()),
    catalog,
    secret: config.identitySecret,
    clock: () => Date.now(),
    callback: config.callback,
    adminOpenIds: () =>
      new Set(
        (process.env.MESSAGE_BOARD_ADMIN_OPENIDS || '')
          .split(',')
          .map((id) => id.trim())
          .filter(Boolean),
      ),
    policy: () => ({
      read: process.env.MESSAGE_BOARD_READ === 'true',
      write: process.env.MESSAGE_BOARD_WRITE === 'true',
      review: process.env.MESSAGE_BOARD_REVIEW === 'true',
    }),
    safety: createSafetyProvider(cloud, config.appId),
    storage: {
      async publish(bytes, cloudPath) {
        const result = await cloud.uploadFile({ cloudPath, fileContent: bytes })
        if (!result.fileID) throw new Error('public-asset-failed')
        return result.fileID
      },
      async remove(fileId) {
        const result = await cloud.deleteFile({ fileList: [fileId] })
        if (result.fileList.some((file) => file.status !== 0))
          throw new Error('public-asset-cleanup-failed')
      },
    },
  })
  return { service, readContext: () => cloud.getWXContext(), ...config }
}
function createEventsPorts(cloud, config = readConfig()) {
  return {
    ...createRuntimePorts(cloud, config),
    callbackPath: new URL(config.callback.baseUrl).pathname,
    runtimeEnvironment: () => ({
      TCB_ENV: process.env.TCB_ENV,
      SCF_NAMESPACE: process.env.SCF_NAMESPACE,
    }),
  }
}
module.exports = { readConfig, createRuntimePorts, createEventsPorts }
