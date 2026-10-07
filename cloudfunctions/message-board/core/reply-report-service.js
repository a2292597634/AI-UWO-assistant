const C = require('./collections')
const { fail, text } = require('./validation')
function createReplyReports(ctx, queries) {
  async function reply(action, input, actor) {
    if (!ctx.isAdmin(actor)) throw fail('forbidden')
    const body = action === 'saveReply' ? text(input.text, 'body') : null
    return ctx.operations.write(
      action,
      input,
      actor,
      async (tx) => {
        if (!ctx.policy().review) throw fail('feature-disabled')
        const message = await tx.get(C.messages, input.messageId),
          owner = message ? await tx.get(C.owners, message.ownerKey) : null
        if (!message || message.deleted || !owner || owner.clearing) throw fail('not-found')
        ctx.revision(message, input)
        if (!['published', 'hidden'].includes(message.status)) throw fail('state-conflict')
        if (action === 'saveReply') {
          const candidateId = ctx.hash(actor.ownerKey + ':reply:' + input.operationId)
          message.replyCandidate = {
            candidateId,
            text: body,
            safety: 'checking',
            createdAt: ctx.now(),
          }
          await ctx.enqueue(tx, {
            type: 'text',
            target: 'message',
            targetId: message._id,
            field: 'reply',
            candidateId,
            text: body,
            scene: 2,
            ownerKey: actor.ownerKey,
          })
        } else {
          message.reply = null
          message.replyCandidate = null
        }
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
  async function report(input, actor) {
    if (!['advertising', 'abuse', 'personal-information', 'other'].includes(input.fixedReason))
      throw fail('input-invalid')
    const id = ctx.hash(actor.ownerKey + ':report:' + input.messageId)
    return ctx.operations.write(
      'reportMessage',
      input,
      actor,
      async (tx, owner) => {
        const message = await tx.get(C.messages, input.messageId),
          author = message ? await tx.get(C.owners, message.ownerKey) : null
        if (!message || message.ownerKey === actor.ownerKey) throw fail('input-invalid')
        if (
          message.status !== 'published' ||
          message.deleted ||
          !author ||
          author.clearing ||
          !(await ctx.publishable(message, author, tx))
        )
          throw fail('not-found')
        if (await tx.get(C.reports, id)) return { kind: 'report', id }
        const day = new Date(ctx.now() + 28800000).toISOString().slice(0, 10)
        if (owner.reportDay !== day) {
          owner.reportDay = day
          owner.reportCount = 0
        }
        if (owner.reportCount >= 20) throw fail('rate-limited')
        owner.reportCount++
        await tx.set(C.reports, id, {
          reporterKey: actor.ownerKey,
          messageId: message._id,
          fixedReason: input.fixedReason,
          processed: false,
          createdAt: ctx.now(),
          orderKey: String(ctx.now()).padStart(13, '0') + ':' + id,
          revision: 1,
        })
        return { kind: 'report', id }
      },
      { allowRestricted: true },
    )
  }
  async function list(input, actor) {
    if (!ctx.isAdmin(actor)) throw fail('forbidden')
    const scope = JSON.stringify(['reports', actor.ownerKey]),
      page = queries.cursor(input, scope)
    const rows = await ctx.repo.query(C.reports, {
      eq: { processed: false },
      before: page.before,
      limit: 20,
    })
    return {
      items: rows.map((row) => ({
        reportId: row._id,
        messageId: row.messageId,
        fixedReason: row.fixedReason,
        createdAt: new Date(row.createdAt).toISOString(),
      })),
      nextCursor:
        rows.length === 20
          ? queries.encode({ scope, before: rows[rows.length - 1].orderKey })
          : null,
    }
  }
  async function resolve(input, actor) {
    if (!ctx.isAdmin(actor)) throw fail('forbidden')
    if (!['hide', 'keep'].includes(input.outcome)) throw fail('input-invalid')
    const reason = text(input.reason, 'reason'),
      checked = await ctx.safety.checkText(reason, 2, actor.openId)
    if (checked.errCode !== 0 || checked.suggest !== 'pass') throw fail('safety-not-ready')
    return ctx.operations.write(
      'resolveReport',
      input,
      actor,
      async (tx) => {
        if (!ctx.policy().review) throw fail('feature-disabled')
        const report = await tx.get(C.reports, input.reportId),
          message = await tx.get(C.messages, input.messageId)
        if (!report || report.messageId !== input.messageId || !message) throw fail('not-found')
        ctx.revision(message, input)
        if (!report.processed) {
          if (input.outcome === 'hide' && message.status === 'published') {
            message.status = 'hidden'
            message.reason = reason
            message.revision++
            await tx.set(C.messages, message._id, message)
          }
          report.processed = true
          report.outcome = input.outcome
          report.reason = reason
          report.processedAt = ctx.now()
          await tx.set(C.reports, report._id, report)
          await tx.set(C.audit, ctx.hash(actor.ownerKey + ':' + input.operationId), {
            actorKey: actor.ownerKey,
            targetId: message._id,
            action: 'resolveReport',
            revision: message.revision,
            createdAt: ctx.now(),
            expiresAt: ctx.now() + 7776000000,
          })
        }
        return { kind: 'resolvedReport', id: report._id }
      },
      { admin: true, allowRestricted: true },
    )
  }
  return { reply, report, list, resolve }
}
module.exports = { createReplyReports }
