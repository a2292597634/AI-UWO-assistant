const C = require('./collections')
const { fail, text } = require('./validation')

function createReviews(ctx) {
  async function invoke(action, input, actor) {
    if (!ctx.isAdmin(actor)) throw fail('forbidden')
    let reason = null
    if (['reject', 'hide', 'restrictAuthor', 'unrestrictAuthor'].includes(action))
      reason = text(input.reason, 'reason')
    if (input.manualReviewReason) reason = text(input.manualReviewReason, 'reason')
    if (reason) {
      const result = await ctx.safety.checkText(reason, 2, actor.openId)
      if (result.errCode !== 0 || result.suggest !== 'pass') throw fail('safety-not-ready')
    }
    return ctx.operations.write(
      action,
      input,
      actor,
      async (tx, actorState) => {
        if (!ctx.policy().review) throw fail('feature-disabled')
        const message = await tx.get(C.messages, input.messageId)
        if (!message || message.deleted) throw fail('not-found')
        ctx.revision(message, input)
        const owner =
          message.ownerKey === actor.ownerKey
            ? actorState
            : await tx.get(C.owners, message.ownerKey)
        if (!owner || owner.clearing) throw fail('clearing')
        if (['approve', 'restore'].includes(action)) {
          if (!['pending-review', 'hidden'].includes(message.status)) throw fail('state-conflict')
          if (owner.restricted) throw fail('restricted')
          if (Object.values(message.safety).includes('review')) {
            if (!input.manualReviewReason) throw fail('manual-review-required')
            message.manualReviewsComplete = true
          }
          if (!(await ctx.publishable(message, owner, tx))) throw fail('safety-not-ready')
          // 自訂頭像的公開副本由資產服務在交易前準備，這裡只核對其內容绑定。
          if (message.avatarAssetId) {
            const asset = await tx.get(C.assets, message.avatarAssetId)
            if (!asset?.publicFileId) throw fail('safety-not-ready')
            message.avatarFileId = asset.publicFileId
          }
          message.status = 'published'
          message.publishedAt = message.publishedAt || ctx.now()
          message.publishedKey = String(message.publishedAt).padStart(13, '0') + ':' + message._id
          message.reason = null
          message.expiresAt = null
        } else if (action === 'reject') {
          if (message.status !== 'pending-review') throw fail('state-conflict')
          message.status = 'rejected'
          message.expiresAt = ctx.now() + 2592000000
          message.reason = reason
        } else if (action === 'hide') {
          if (message.status !== 'published') throw fail('state-conflict')
          message.status = 'hidden'
          message.expiresAt = null
          message.reason = reason
        } else if (['restrictAuthor', 'unrestrictAuthor'].includes(action)) {
          owner.restricted = action === 'restrictAuthor'
          owner.restrictionReason = reason
          await tx.set(C.owners, message.ownerKey, owner)
        } else throw fail('input-invalid')
        message.revision++
        await tx.set(C.messages, message._id, message)
        await tx.set(C.audit, ctx.hash(actor.ownerKey + ':' + input.operationId), {
          actorKey: actor.ownerKey,
          targetId: message._id,
          action,
          revision: message.revision,
          createdAt: ctx.now(),
          expiresAt: ctx.now() + 7776000000,
        })
        return { kind: 'message', id: message._id }
      },
      { admin: true, allowRestricted: true },
    )
  }
  return { invoke }
}
module.exports = { createReviews }
