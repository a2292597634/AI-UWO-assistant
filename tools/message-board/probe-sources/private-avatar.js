/* global module, require */
/* eslint-disable @typescript-eslint/no-require-imports */
const { createHmac, timingSafeEqual } = require('node:crypto')
const { Buffer } = require('node:buffer')
const { URL, URLSearchParams } = require('node:url')
const {
  collections,
  optionalDoc,
  imageBytes,
  sha256,
  docId,
  randomUUID,
  checkedApi,
} = require('./shared')
const fail = (code) => Object.assign(new Error(code), { code })
const scoped = (value, config) =>
  value &&
  value.runId === config.runId &&
  value.candidateSha === config.candidateSha &&
  value.buildSha === config.buildSha
const identity = (config) => ({
  runId: config.runId,
  candidateSha: config.candidateSha,
  buildSha: config.buildSha,
})

function checkedAsset(asset, config, actorHash) {
  if (
    !scoped(asset, config) ||
    (actorHash && asset.ownerHash !== actorHash) ||
    asset.expiresAt <= Date.now()
  )
    throw fail('not-found')
  const image = imageBytes(asset.base64)
  if (
    sha256(image.bytes) !== asset.sha256 ||
    image.bytes.length !== asset.byteSize ||
    image.extension !== asset.extension
  )
    throw fail('provider-response-invalid')
  return image
}
function checkedEndpoint(config) {
  if (!/^[a-f0-9]{64}$/.test(config.imageSigningKey || '')) throw fail('config-invalid')
  let url
  try {
    url = new URL(config.privateAvatarBaseUrl)
  } catch {
    throw fail('config-invalid')
  }
  if (
    url.protocol !== 'https:' ||
    url.username ||
    url.password ||
    url.search ||
    url.hash ||
    url.pathname !== '/message-board-g0/' + config.runId
  )
    throw fail('config-invalid')
  return url
}
function sign(config, assetId, sha, expires) {
  return createHmac('sha256', Buffer.from(config.imageSigningKey, 'hex'))
    .update(
      JSON.stringify([
        config.appId,
        config.testEnvironmentId,
        config.runId,
        config.buildSha,
        assetId,
        sha,
        expires,
      ]),
    )
    .digest('hex')
}
function imageUrl(config, assetId, asset) {
  const url = checkedEndpoint(config)
  // 連結限 60 分鐘且不超過固化授權；不把短授權包當成長效接收端。
  const expires = Date.now() + 3600000
  if (expires > Date.parse(config.sharedEnvironmentAuthorization.expiresAt))
    throw fail('config-invalid')
  url.pathname += '/avatar'
  url.search = new URLSearchParams({
    assetId,
    sha256: asset.sha256,
    expires: String(expires),
    signature: sign(config, assetId, asset.sha256, expires),
  }).toString()
  return url.toString()
}
async function stage(db, config, actorHash, base64) {
  const image = imageBytes(base64),
    digest = sha256(image.bytes)
  // 本次探測每個已批准帳號只保留一張圖；重送同圖不多寫，換圖先清除。
  const assetId = docId(config, 'private-avatar:' + actorHash)
  await db.runTransaction(async (tx) => {
    const existing = await optionalDoc(tx, collections.assets, assetId)
    if (existing) {
      checkedAsset(existing, config, actorHash)
      if (existing.sha256 !== digest) throw fail('safety-not-ready')
      return
    }
    await tx
      .collection(collections.assets)
      .doc(assetId)
      .set({
        data: {
          ...identity(config),
          ownerHash: actorHash,
          base64,
          sha256: digest,
          byteSize: image.bytes.length,
          width: image.width,
          height: image.height,
          extension: image.extension,
          createdAt: Date.now(),
          expiresAt: Date.now() + 86400000,
          status: 'staged',
          traceId: null,
        },
      })
  })
  return { assetId, sha256: digest, byteSize: image.bytes.length }
}

async function match(tx, config, id) {
  const event = await optionalDoc(tx, collections.events, id),
    trace = await optionalDoc(tx, collections.traces, id)
  if (
    !scoped(event, config) ||
    !scoped(trace, config) ||
    event.matched ||
    event.traceId !== trace.traceId ||
    Date.now() - event.receivedAt > 3600000 ||
    Date.now() - trace.startedAt > 2700000
  )
    return false
  const asset = await optionalDoc(tx, collections.assets, trace.assetId)
  if (
    !scoped(asset, config) ||
    asset.expiresAt <= Date.now() ||
    asset.traceId !== trace.traceId ||
    asset.attemptId !== trace.attemptId ||
    asset.sha256 !== trace.sha256 ||
    asset.ownerHash !== trace.ownerHash
  )
    return false
  // 每個結果綁定不可變位元組與本次嘗試；此門檻沒有任何公開動作。
  await tx
    .collection(collections.results)
    .doc(id)
    .set({
      data: {
        ...identity(config),
        assetId: trace.assetId,
        sha256: trace.sha256,
        attemptId: trace.attemptId,
        traceId: trace.traceId,
        errCode: event.errCode,
        suggest: event.suggest,
        receivedAt: event.receivedAt,
      },
    })
  await tx
    .collection(collections.events)
    .doc(id)
    .update({ data: { matched: true } })
  return true
}
async function accept(db, config, payload) {
  const id = docId(config, payload.traceId)
  await db.runTransaction(async (tx) => {
    const existing = await optionalDoc(tx, collections.events, id)
    if (existing) {
      if (
        !scoped(existing, config) ||
        existing.errCode !== payload.errCode ||
        existing.suggest !== payload.suggest
      )
        throw fail('invalid-event')
    } else
      await tx
        .collection(collections.events)
        .doc(id)
        .set({
          data: {
            ...identity(config),
            ...payload,
            receivedAt: Date.now(),
            expiresAt: Date.now() + 3600000,
            matched: false,
          },
        })
    await match(tx, config, id)
  })
}
async function submit(cloud, db, config, current, actorHash, assetId) {
  const attemptId = randomUUID()
  // SDK 可能因提交衝突重播回調；只採用最後成功交易的結果，不保留前次 claim。
  const { asset, claimed } = await db.runTransaction(async (tx) => {
    const asset = await optionalDoc(tx, collections.assets, assetId)
    checkedAsset(asset, config, actorHash)
    if (asset.traceId) return { asset, claimed: false }
    if (asset.status !== 'staged') throw fail('safety-not-ready')
    const startedAt = Date.now()
    // 在 API 發送前驗證 URL 配置；交易內不呼叫 provider。
    imageUrl(config, assetId, asset)
    await tx
      .collection(collections.assets)
      .doc(assetId)
      .update({ data: { status: 'submitting', attemptId, startedAt } })
    return { asset: { ...asset, attemptId, startedAt }, claimed: true }
  })
  if (!claimed) return { assetId, traceId: asset.traceId }
  let traceId
  try {
    traceId = checkedApi(
      await cloud.openapi.security.mediaCheckAsync({
        openid: current.OPENID,
        version: 2,
        scene: 1,
        mediaType: 2,
        mediaUrl: imageUrl(config, assetId, asset),
      }),
    )
  } catch (error) {
    await db.runTransaction(async (tx) => {
      const latest = await optionalDoc(tx, collections.assets, assetId)
      if (scoped(latest, config) && latest.attemptId === attemptId)
        await tx
          .collection(collections.assets)
          .doc(assetId)
          .update({ data: { status: 'failed' } })
    })
    throw error
  }
  await db.runTransaction(async (tx) => {
    const latest = await optionalDoc(tx, collections.assets, assetId)
    if (
      !scoped(latest, config) ||
      latest.ownerHash !== actorHash ||
      latest.attemptId !== attemptId ||
      latest.sha256 !== asset.sha256
    )
      throw fail('not-found')
    const id = docId(config, traceId),
      existing = await optionalDoc(tx, collections.traces, id)
    if (existing) throw fail('provider-response-invalid')
    await tx
      .collection(collections.traces)
      .doc(id)
      .set({
        data: {
          ...identity(config),
          assetId,
          sha256: asset.sha256,
          ownerHash: actorHash,
          attemptId,
          traceId,
          startedAt: asset.startedAt,
        },
      })
    await tx
      .collection(collections.assets)
      .doc(assetId)
      .update({ data: { status: 'checking', traceId } })
    await match(tx, config, id)
  })
  return { assetId, traceId }
}
async function invoke(cloud, config, current, actorHash, event) {
  const db = cloud.database()
  if (event.action === 'stagePrivateAvatar') return stage(db, config, actorHash, event.base64)
  if (typeof event.assetId !== 'string' || !/^[a-f0-9]{64}$/.test(event.assetId))
    throw fail('not-found')
  if (event.action === 'submitPrivateImage')
    return submit(cloud, db, config, current, actorHash, event.assetId)
  const asset = await optionalDoc(db, collections.assets, event.assetId)
  const image = checkedAsset(asset, config, actorHash)
  if (event.action === 'previewPrivateAvatar')
    return { assetId: event.assetId, base64: image.bytes.toString('base64'), sha256: asset.sha256 }
  if (event.action === 'getPrivateImageStatus') {
    const result = asset.traceId
      ? await optionalDoc(db, collections.results, docId(config, asset.traceId))
      : null
    const valid =
      scoped(result, config) &&
      result.assetId === event.assetId &&
      result.sha256 === asset.sha256 &&
      result.attemptId === asset.attemptId
    const expired = asset.startedAt && Date.now() - asset.startedAt > 2700000
    return {
      assetId: event.assetId,
      status: valid ? 'matched' : expired ? 'timed-out' : asset.status,
      suggest: valid ? result.suggest : null,
      errCode: valid ? result.errCode : null,
      traceId: asset.traceId,
    }
  }
  if (event.action === 'removePrivateAvatar') {
    await db.runTransaction(async (tx) => {
      const latest = await optionalDoc(tx, collections.assets, event.assetId)
      if (!latest) return
      checkedAsset(latest, config, actorHash)
      if (latest.traceId) {
        const id = docId(config, latest.traceId)
        for (const name of [collections.traces, collections.events, collections.results]) {
          const row = await optionalDoc(tx, name, id)
          if (row && !scoped(row, config)) throw fail('not-found')
          if (row) await tx.collection(name).doc(id).remove()
        }
      }
      await tx.collection(collections.assets).doc(event.assetId).remove()
    })
    return { assetId: event.assetId, removed: true }
  }
  throw fail('unknown-action')
}
async function serve(db, config, event) {
  const endpoint = checkedEndpoint(config)
  if (event.httpMethod !== 'GET' || event.path !== endpoint.pathname + '/avatar')
    throw fail('invalid-http')
  const q = event.queryStringParameters
  if (
    !q ||
    !/^[a-f0-9]{64}$/.test(q.assetId || '') ||
    !/^[a-f0-9]{64}$/.test(q.sha256 || '') ||
    !/^[a-f0-9]{64}$/.test(q.signature || '') ||
    typeof q.expires !== 'string' ||
    !/^\d{13}$/.test(q.expires)
  )
    throw fail('invalid-signature')
  const expires = Number(q.expires)
  if (
    expires <= Date.now() ||
    expires > Date.now() + 3600000 ||
    expires > Date.parse(config.sharedEnvironmentAuthorization.expiresAt) ||
    !timingSafeEqual(
      Buffer.from(q.signature, 'hex'),
      Buffer.from(sign(config, q.assetId, q.sha256, expires), 'hex'),
    )
  )
    throw fail('invalid-signature')
  const asset = await optionalDoc(db, collections.assets, q.assetId),
    image = checkedAsset(asset, config)
  if (asset.sha256 !== q.sha256) throw fail('invalid-signature')
  return {
    statusCode: 200,
    headers: {
      'Content-Type': image.extension === 'png' ? 'image/png' : 'image/jpeg',
      'Cache-Control': 'no-store',
      'X-Content-Type-Options': 'nosniff',
    },
    body: image.bytes.toString('base64'),
    isBase64Encoded: true,
  }
}
module.exports = { invoke, serve, accept }
