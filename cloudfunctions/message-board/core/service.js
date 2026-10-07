const { createHmac } = require('node:crypto')
const C = require('./collections')
const { fail, exact } = require('./validation')
const { canPublish } = require('./state-policy')
const { createOperations } = require('./operation-service')
const { createMessages } = require('./message-service')
const { createQueries } = require('./query-service')
const { createReviews } = require('./review-service')
const { createTaskWorker } = require('./task-worker')
const { profileDto } = require('./dto')
const { createAssets } = require('./asset-service')
const { createPrivacy } = require('./privacy-service')
const { createReplyReports } = require('./reply-report-service')
const { createCleanup } = require('./cleanup-service')

const explanations = {
  forbidden: '沒有管理員權限。',
  'not-authenticated': '無法確認微信身分，請重新開啟小程序。',
  'input-invalid': '輸入資料不正確，請重新載入。',
  'text-invalid': '文字長度或格式不正確。',
  'rate-limited': '操作太頻繁，請稍候再試。',
  restricted: '目前暫停新投稿，請聯絡管理員。',
  clearing: '留言資料正在清除，請稍候再試。',
  'operation-expired': '操作已過期，請重新確認。',
  'operation-conflict': '本次操作內容與原先提交不同，請確認提交結果。',
  'revision-conflict': '資料已更新，請重新載入後操作。',
  'not-found': '內容不存在或已不可用。',
  'profile-version-expired': '留言資料版本已失效，請重新確認暱稱與頭像。',
  'asset-invalid': '頭像不可用，請重新選擇或使用預設頭像。',
  'server-invalid': '伺服器清單已更新，請重新選擇。',
  'safety-not-ready': '內容安全檢查尚未完成或未通過。',
  'state-conflict': '留言狀態已改變，請重新載入。',
  'manual-review-required': '此內容需要額外人工複核並填寫理由。',
  'cursor-invalid': '列表已變更，請重新整理。',
  'feature-disabled': '留言板暫時停止此項操作。',
  'invalid-signature': '請求驗證失敗。',
  'invalid-event': '回調格式不正確。',
}
const writeKeys = ['operationId']
const targetKeys = [...writeKeys, 'messageId', 'expectedRevision']
const schemas = {
  getViewer: [],
  getProfile: [],
  getClearStatus: [],
  listPublic: ['cursor', 'gameServerId', 'limit'],
  listMine: ['cursor', 'limit'],
  listAdmin: ['cursor', 'gameServerId', 'status', 'limit'],
  saveProfile: [...writeKeys, 'profileRevision', 'nickName', 'avatarAssetId'],
  createMessage: [...writeKeys, 'profileRevision', 'gameServerId', 'catalogVersion', 'text'],
  withdrawMessage: targetKeys,
  approve: [...targetKeys, 'manualReviewReason'],
  restore: [...targetKeys, 'manualReviewReason'],
  reject: [...targetKeys, 'reason'],
  hide: [...targetKeys, 'reason'],
  restrictAuthor: [...targetKeys, 'reason'],
  unrestrictAuthor: [...targetKeys, 'reason'],
  clearMyData: writeKeys,
  getOperationResult: ['operationId', 'action'],
  uploadAvatar: [...writeKeys, 'base64'],
  loadPrivateAvatar: ['assetId'],
  retrySafety: targetKeys,
  saveReply: [...targetKeys, 'text'],
  removeReply: targetKeys,
  reportMessage: [...writeKeys, 'messageId', 'fixedReason'],
  listReports: ['cursor'],
  resolveReport: [...targetKeys, 'reportId', 'outcome', 'reason'],
  loadAdmin: ['messageId'],
  revalidatePublic: ['messageIds'],
}

function createBoardService(deps) {
  const ctx = {
    ...deps,
    now: deps.clock,
    hash: (value) => createHmac('sha256', deps.secret).update(value).digest('hex'),
    isAdmin: (actor) => deps.adminOpenIds().has(actor.openId),
  }
  ctx.revision = (message, input) => {
    if (!Number.isInteger(input.expectedRevision) || input.expectedRevision !== message.revision)
      throw fail('revision-conflict')
  }
  ctx.publishable = async (message, owner, repo = ctx.repo) => {
    const asset = message.avatarAssetId ? await repo.get(C.assets, message.avatarAssetId) : null
    if (message.avatarAssetId && !asset) return false
    if (
      !message.contentHashes ||
      message.contentHashes.body !== ctx.hash(message.text) ||
      message.contentHashes.nickname !== ctx.hash(message.nickName) ||
      message.contentHashes.avatar !== (asset ? asset.sha256 : 'builtin') ||
      (asset && asset.ownerKey !== message.ownerKey)
    )
      return false
    if (asset?.deleting || asset?.deletingPublic) return false
    return canPublish({
      status: message.status,
      safety: [
        message.safety.nickname,
        message.safety.body,
        asset ? asset.safety : message.safety.avatar,
      ],
      manualReviewsComplete: message.manualReviewsComplete,
      ownerClearing: owner.clearing,
      assetRevoked: !!asset?.revoked,
    })
  }
  ctx.operations = createOperations(ctx)
  const worker = createTaskWorker(ctx)
  ctx.enqueue = worker.enqueue
  const assets = createAssets(ctx)
  ctx.checkImage = assets.checkImage
  ctx.propagateAsset = assets.propagate
  const messages = createMessages(ctx),
    queries = createQueries(ctx),
    reviews = createReviews(ctx)
  const privacy = createPrivacy(ctx),
    replyReports = createReplyReports(ctx, queries)
  ctx.clearBatch = privacy.batch
  ctx.cleanup = createCleanup(ctx).run
  async function invoke(action, input, actor) {
    try {
      if (!actor?.openId || !actor.ownerKey) throw fail('not-authenticated')
      if (!schemas[action]) throw fail('input-invalid')
      exact(input, schemas[action])
      const admin = [
        'listAdmin',
        'loadAdmin',
        'approve',
        'restore',
        'reject',
        'hide',
        'restrictAuthor',
        'unrestrictAuthor',
        'saveReply',
        'removeReply',
        'listReports',
        'resolveReport',
      ].includes(action)
      if (admin && !ctx.isAdmin(actor)) throw fail('forbidden')
      if (
        ['saveProfile', 'createMessage', 'uploadAvatar', 'retrySafety'].includes(action) &&
        !ctx.policy().write
      )
        throw fail('feature-disabled')
      if (action === 'listPublic' && !ctx.policy().read) throw fail('feature-disabled')
      await ctx.repo.transaction(async (tx) => {
        const owner = await ctx.operations.owner(tx, actor)
        owner.lastVisitAt = ctx.now()
        owner.openId = actor.openId
        await tx.set(C.owners, actor.ownerKey, owner)
      })
      let data, reference
      const owner = await ctx.repo.get(C.owners, actor.ownerKey)
      if (action === 'getViewer')
        data = {
          viewerKey: actor.ownerKey,
          isAdmin: ctx.isAdmin(actor),
          serverTime: ctx.now(),
          ...ctx.policy(),
          restricted: owner.restricted,
          clearing: owner.clearing,
          clearVersion: owner.clearGeneration || 0,
        }
      else if (action === 'getProfile') {
        const profile = owner.profileRevision
          ? await ctx.repo.get(
              C.profiles,
              ctx.hash(actor.ownerKey + ':profile:' + owner.profileRevision),
            )
          : null
        data = profile && !owner.clearing ? profileDto(profile, owner.lastServerId || null) : null
      } else if (action === 'getClearStatus') data = { clearing: owner.clearing }
      else if (['listPublic', 'listMine', 'listAdmin'].includes(action)) {
        if (
          input.status &&
          !['pending-review', 'published', 'rejected', 'withdrawn', 'hidden'].includes(input.status)
        )
          throw fail('input-invalid')
        data = await queries.list(
          action === 'listPublic' ? 'public' : action === 'listMine' ? 'mine' : 'admin',
          input,
          actor,
        )
      } else if (action === 'saveProfile') reference = await messages.saveProfile(input, actor)
      else if (action === 'uploadAvatar') reference = await assets.upload(input, actor)
      else if (action === 'loadPrivateAvatar') data = await assets.preview(input, actor)
      else if (action === 'revalidatePublic') {
        if (!ctx.policy().read) throw fail('feature-disabled')
        if (
          !Array.isArray(input.messageIds) ||
          input.messageIds.length > 100 ||
          input.messageIds.some((id) => typeof id !== 'string' || id.length > 64)
        )
          throw fail('input-invalid')
        const items = [],
          unavailable = []
        for (const id of input.messageIds) {
          const message = await ctx.repo.get(C.messages, id)
          if (message && !message.deleted && (await queries.eligible(message)))
            items.push(require('./dto').publicDto(message))
          else unavailable.push(id)
        }
        data = { items, unavailable }
      } else if (action === 'loadAdmin') {
        const message = await ctx.repo.get(C.messages, input.messageId),
          author = message ? await ctx.repo.get(C.owners, message.ownerKey) : null
        if (!message || message.deleted || !author) throw fail('not-found')
        data = {
          ...require('./dto').mineDto(message),
          canApprove: !author.restricted && (await ctx.publishable(message, author)),
          needsManualReview:
            Object.values(message.safety).includes('review') && !message.manualReviewsComplete,
          replySafety: message.replyCandidate?.safety || null,
          authorRestricted: author.restricted,
        }
      } else if (action === 'createMessage') reference = await messages.createMessage(input, actor)
      else if (action === 'withdrawMessage') reference = await messages.withdraw(input, actor)
      else if (action === 'clearMyData') reference = await privacy.clear(input, actor)
      else if (['saveReply', 'removeReply'].includes(action))
        reference = await replyReports.reply(action, input, actor)
      else if (action === 'reportMessage') reference = await replyReports.report(input, actor)
      else if (action === 'listReports') data = await replyReports.list(input, actor)
      else if (action === 'resolveReport') reference = await replyReports.resolve(input, actor)
      else if (action === 'retrySafety')
        reference = await ctx.operations.write(action, input, actor, async (tx) => {
          const message = await tx.get(C.messages, input.messageId)
          if (!message || message.deleted || message.ownerKey !== actor.ownerKey)
            throw fail('not-found')
          ctx.revision(message, input)
          if (message.status !== 'pending-review') throw fail('state-conflict')
          for (const field of ['body', 'nickname'])
            if (['needs-author', 'retryable-error'].includes(message.safety[field])) {
              const id = ctx.hash(JSON.stringify(['text', 'message', message._id, field])),
                task = await tx.get(C.tasks, id)
              if (task) {
                task.state = 'queued'
                task.attempts = 0
                task.nextAttemptAt = ctx.now()
                await tx.set(C.tasks, id, task)
                message.safety[field] = 'checking'
              }
            }
          if (message.avatarAssetId) {
            const asset = await tx.get(C.assets, message.avatarAssetId)
            if (
              asset &&
              ['needs-author', 'retryable-error'].includes(asset.safety) &&
              !asset.revoked
            ) {
              const id = ctx.hash(JSON.stringify(['image', 'asset', asset._id, null])),
                task = await tx.get(C.tasks, id)
              if (task) {
                task.state = 'queued'
                task.attempts = 0
                task.nextAttemptAt = ctx.now()
                asset.safety = 'retryable-error'
                await tx.set(C.assets, asset._id, asset)
                await tx.set(C.tasks, id, task)
                message.safety.avatar = 'checking'
              }
            }
          }
          message.revision++
          await tx.set(C.messages, message._id, message)
          return { kind: 'message', id: message._id }
        })
      else if (action === 'getOperationResult') {
        if (!schemas[input.action] || !input.operationId) throw fail('input-invalid')
        const receiptAdmin = [
          'approve',
          'restore',
          'reject',
          'hide',
          'restrictAuthor',
          'unrestrictAuthor',
          'saveReply',
          'removeReply',
          'resolveReport',
        ].includes(input.action)
        if (receiptAdmin && !ctx.isAdmin(actor)) throw fail('forbidden')
        const receipt = await ctx.repo.get(
          C.operations,
          ctx.hash(actor.ownerKey + ':' + input.action + ':' + input.operationId),
        )
        data = receipt
          ? {
              confirmed: true,
              result: await queries.resolve(receipt.reference, actor, receiptAdmin),
            }
          : { confirmed: false, result: null }
      } else {
        if (['approve', 'restore'].includes(action)) await assets.preparePublic(input, actor)
        reference = await reviews.invoke(action, input, actor)
      }
      if (reference) data = await queries.resolve(reference, actor, admin)
      if (Buffer.byteLength(JSON.stringify({ ok: true, data })) > 98304) throw fail('input-invalid')
      return { ok: true, data }
    } catch (error) {
      const code = explanations[error.code] ? error.code : 'network'
      return {
        ok: false,
        code,
        message: explanations[code] || '伺服器暫時無法確認操作結果，請稍後確認。',
      }
    }
  }
  return {
    invoke,
    runDue: worker.runDue,
    acceptVerifiedEvent: assets.acceptVerifiedEvent,
    servePrivateAvatar: assets.serve,
    context: ctx,
  }
}
module.exports = { createBoardService }
