const { randomUUID, createHmac, timingSafeEqual } = require('node:crypto')
const { URL, URLSearchParams } = require('node:url')
const C = require('./collections')
const { fail } = require('./validation')
const { validateAvatar } = require('./image-validation')
const { providerErrorCode } = require('./provider-error-code')
function createAssets(ctx) {
  const sign = (asset, expires) =>
    createHmac('sha256', Buffer.from(ctx.callback.imageKey, 'hex'))
      .update(
        JSON.stringify([ctx.callback.appId, asset._id, asset.sha256, asset.attemptId, expires]),
      )
      .digest('hex')
  async function upload(input, actor) {
    const image = validateAvatar(input.base64),
      id = randomUUID().replaceAll('-', '')
    return ctx.operations.write('uploadAvatar', input, actor, async (tx) => {
      await tx.set(C.assets, id, {
        ownerKey: actor.ownerKey,
        base64: input.base64,
        sha256: image.sha256,
        width: image.width,
        height: image.height,
        extension: image.extension,
        byteSize: image.bytes.length,
        safety: 'checking',
        revoked: false,
        publicFileId: null,
        createdAt: ctx.now(),
        deleting: false,
      })
      await ctx.enqueue(tx, {
        type: 'image',
        target: 'asset',
        targetId: id,
        ownerKey: actor.ownerKey,
      })
      return { kind: 'asset', id }
    })
  }
  async function preview(input, actor) {
    const asset = await ctx.repo.get(C.assets, input.assetId)
    if (!asset || asset.deleting || (asset.ownerKey !== actor.ownerKey && !ctx.isAdmin(actor)))
      throw fail('not-found')
    const owner = await ctx.repo.get(C.owners, asset.ownerKey)
    if (!owner || owner.clearing) throw fail('not-found')
    if (validateAvatar(asset.base64).sha256 !== asset.sha256) throw fail('asset-invalid')
    return { assetId: asset._id, base64: asset.base64 }
  }
  async function match(tx, id) {
    const event = await tx.get(C.events, id),
      trace = await tx.get(C.traces, id)
    if (
      !event ||
      !trace ||
      event.matched ||
      ctx.now() - event.receivedAt > 3600000 ||
      ctx.now() - trace.startedAt > 2700000
    )
      return
    const asset = await tx.get(C.assets, trace.assetId),
      owner = asset ? await tx.get(C.owners, asset.ownerKey) : null
    if (
      !asset ||
      asset.deleting ||
      !owner ||
      owner.clearing ||
      asset.sha256 !== trace.sha256 ||
      asset.attemptId !== trace.attemptId ||
      asset.traceId !== trace.traceId
    )
      return
    asset.safety = event.errCode === 0 ? event.suggest : 'retryable-error'
    asset.revoked = asset.revoked || asset.safety === 'risky'
    asset.checkedAt = ctx.now()
    await tx.set(C.assets, asset._id, asset)
    event.matched = true
    await tx.set(C.events, id, event)
    const task = await tx.get(C.tasks, trace.taskId)
    if (task) {
      task.state = asset.safety === 'retryable-error' && task.attempts < 3 ? 'queued' : 'done'
      task.nextAttemptAt = ctx.now() + 300000
      await tx.set(C.tasks, task._id, task)
    }
    await ctx.enqueue(tx, {
      type: 'asset-update',
      target: 'asset',
      targetId: asset._id,
      field: trace.traceId,
      ownerKey: asset.ownerKey,
    })
  }
  async function acceptVerifiedEvent(payload) {
    if (
      typeof payload?.traceId !== 'string' ||
      !/^[a-zA-Z0-9_-]{1,160}$/.test(payload.traceId) ||
      !Number.isInteger(payload.errCode) ||
      (payload.errCode === 0 && !['pass', 'review', 'risky'].includes(payload.suggest))
    )
      throw fail('input-invalid')
    const id = ctx.hash('trace:' + payload.traceId)
    await ctx.repo.transaction(async (tx) => {
      const existing = await tx.get(C.events, id)
      if (existing) {
        if (existing.suggest !== payload.suggest || existing.errCode !== payload.errCode)
          throw fail('invalid-event')
      } else
        await tx.set(C.events, id, {
          ...payload,
          receivedAt: ctx.now(),
          expiresAt: ctx.now() + 3600000,
          matched: false,
        })
      await match(tx, id)
    })
  }
  async function checkImage(task) {
    const asset = await ctx.repo.transaction(async (tx) => {
      const asset = await tx.get(C.assets, task.targetId),
        owner = await tx.get(C.owners, task.ownerKey)
      if (!asset || asset.deleting || !owner || owner.clearing) return null
      if (asset.traceId && asset.safety !== 'retryable-error') return null
      asset.attemptId = task.lease
      asset.startedAt = ctx.now()
      asset.safety = 'checking'
      await tx.set(C.assets, asset._id, asset)
      return asset
    })
    if (!asset) return
    let result
    try {
      const expires = ctx.now() + 3600000,
        url = new URL(ctx.callback.baseUrl + '/avatar')
      url.search = new URLSearchParams({
        assetId: asset._id,
        sha256: asset.sha256,
        attemptId: asset.attemptId,
        expires: String(expires),
        signature: sign(asset, expires),
      }).toString()
      result = await ctx.safety.checkImage(url.toString(), task.openId)
      if (
        result.errCode !== 0 ||
        typeof result.traceId !== 'string' ||
        !/^[a-zA-Z0-9_-]{1,160}$/.test(result.traceId)
      )
        throw fail('provider-error')
    } catch (error) {
      await ctx.repo.transaction(async (tx) => {
        const current = await tx.get(C.tasks, task._id),
          row = await tx.get(C.assets, asset._id)
        if (current?.lease !== task.lease || !row || row.attemptId !== task.lease) return
        current.providerErrorCode = providerErrorCode(result) ?? providerErrorCode(error)
        row.safety = 'retryable-error'
        current.state = current.attempts < 3 ? 'queued' : 'done'
        current.nextAttemptAt = ctx.now() + (current.attempts === 1 ? 60000 : 300000)
        await tx.set(C.assets, row._id, row)
        await tx.set(C.tasks, current._id, current)
      })
      return
    }
    await ctx.repo.transaction(async (tx) => {
      const current = await tx.get(C.tasks, task._id),
        row = await tx.get(C.assets, asset._id),
        owner = await tx.get(C.owners, task.ownerKey)
      if (
        current?.lease !== task.lease ||
        !row ||
        row.attemptId !== task.lease ||
        !owner ||
        owner.clearing
      )
        return
      row.traceId = result.traceId
      await tx.set(C.assets, row._id, row)
      const id = ctx.hash('trace:' + result.traceId)
      await tx.set(C.traces, id, {
        assetId: asset._id,
        sha256: asset.sha256,
        attemptId: task.lease,
        traceId: result.traceId,
        taskId: task._id,
        startedAt: row.startedAt,
      })
      current.state = 'waiting'
      current.nextAttemptAt = ctx.now() + 2700000
      await tx.set(C.tasks, current._id, current)
      await match(tx, id)
    })
  }
  async function propagate(task) {
    const asset = await ctx.repo.get(C.assets, task.targetId)
    const messages = asset
      ? await ctx.repo.query(C.messages, {
          eq: { avatarAssetId: asset._id },
          ...(task.progressBefore ? { before: task.progressBefore } : {}),
          limit: 100,
        })
      : []
    if (asset)
      for (const message of messages)
        await ctx.repo.transaction(async (tx) => {
          const row = await tx.get(C.messages, message._id)
          if (!row || row.deleted || row.avatarAssetId !== asset._id) return
          row.safety.avatar = asset.safety
          row.revision++
          if (asset.safety === 'risky' && ['pending-review', 'published'].includes(row.status)) {
            row.status = row.status === 'published' ? 'hidden' : 'rejected'
            row.reason = '頭像未通過安全檢查，請重新選擇後另行投稿。'
          }
          await tx.set(C.messages, row._id, row)
        })
    await ctx.repo.transaction(async (tx) => {
      const current = await tx.get(C.tasks, task._id)
      if (current?.lease === task.lease) {
        current.state = messages.length === 100 ? 'queued' : 'done'
        current.progressBefore = messages.at(-1)?.orderKey || task.progressBefore || null
        current.nextAttemptAt = ctx.now() + 1000
        await tx.set(C.tasks, current._id, current)
      }
    })
  }
  async function preparePublic(input, actor) {
    if (!ctx.isAdmin(actor)) throw fail('forbidden')
    if (!ctx.policy().review) throw fail('feature-disabled')
    const message = await ctx.repo.get(C.messages, input.messageId)
    if (
      !message ||
      !message.avatarAssetId ||
      !['pending-review', 'hidden'].includes(message.status)
    )
      return
    ctx.revision(message, input)
    const owner = await ctx.repo.get(C.owners, message.ownerKey),
      asset = await ctx.repo.get(C.assets, message.avatarAssetId)
    if (!owner || owner.clearing || owner.restricted || !asset || asset.deleting || asset.revoked)
      throw fail('safety-not-ready')
    const prospective = {
      ...message,
      manualReviewsComplete: message.manualReviewsComplete || !!input.manualReviewReason,
    }
    if (!(await ctx.publishable(prospective, owner))) throw fail('safety-not-ready')
    if (asset.publicFileId) return
    const image = validateAvatar(asset.base64)
    if (image.sha256 !== asset.sha256) throw fail('asset-invalid')
    const fileId = await ctx.storage.publish(
      image.bytes,
      'message-board/public/' + randomUUID() + '.' + asset.extension,
    )
    await ctx.repo.transaction(async (tx) => {
      const latest = await tx.get(C.assets, asset._id),
        latestOwner = await tx.get(C.owners, asset.ownerKey)
      if (
        !latest ||
        latest.deleting ||
        latest.revoked ||
        !latestOwner ||
        latestOwner.clearing ||
        latest.sha256 !== asset.sha256
      ) {
        await ctx.enqueue(tx, {
          type: 'orphan-public',
          target: 'file',
          targetId: fileId,
          ownerKey: asset.ownerKey,
        })
        return
      }
      if (latest.publicFileId) {
        await ctx.enqueue(tx, {
          type: 'orphan-public',
          target: 'file',
          targetId: fileId,
          ownerKey: asset.ownerKey,
        })
        return
      }
      latest.publicFileId = fileId
      latest.publicPreparedAt = ctx.now()
      await tx.set(C.assets, latest._id, latest)
    })
  }
  async function serve(query) {
    if (
      typeof query?.assetId !== 'string' ||
      typeof query.signature !== 'string' ||
      !/^[a-f0-9]{64}$/.test(query.signature) ||
      !/^\d{13}$/.test(query.expires || '')
    )
      throw fail('invalid-signature')
    const expires = Number(query.expires),
      asset = await ctx.repo.get(C.assets, query.assetId),
      owner = asset ? await ctx.repo.get(C.owners, asset.ownerKey) : null
    if (
      !asset ||
      asset.deleting ||
      !owner ||
      owner.clearing ||
      expires <= ctx.now() ||
      expires > ctx.now() + 3600000 ||
      asset.sha256 !== query.sha256 ||
      asset.attemptId !== query.attemptId ||
      !timingSafeEqual(
        Buffer.from(query.signature, 'hex'),
        Buffer.from(sign(asset, expires), 'hex'),
      )
    )
      throw fail('invalid-signature')
    const image = validateAvatar(asset.base64)
    if (image.sha256 !== asset.sha256) throw fail('asset-invalid')
    return {
      statusCode: 200,
      headers: {
        'Content-Type': image.extension === 'png' ? 'image/png' : 'image/jpeg',
        'Cache-Control': 'no-store',
      },
      body: asset.base64,
      isBase64Encoded: true,
    }
  }
  return { upload, preview, acceptVerifiedEvent, checkImage, propagate, preparePublic, serve }
}
module.exports = { createAssets }
