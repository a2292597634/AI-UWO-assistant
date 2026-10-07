const { randomUUID } = require('node:crypto')
const C = require('./collections')
const { providerErrorCode } = require('./provider-error-code')

function createTaskWorker(ctx) {
  async function enqueue(tx, input) {
    const parts = [input.type, input.target, input.targetId, input.field || null]
    if (input.candidateId) parts.push(input.candidateId)
    const id = ctx.hash(JSON.stringify(parts))
    const existing = await tx.get(C.tasks, id)
    if (!existing)
      await tx.set(C.tasks, id, {
        ...input,
        state: 'queued',
        attempts: 0,
        nextAttemptAt: ctx.now(),
        orderKey: String(ctx.now()).padStart(13, '0') + ':' + id,
        createdAt: ctx.now(),
        expiresAt: ctx.now() + 2592000000,
        contentHash: typeof input.text === 'string' ? ctx.hash(input.text) : null,
      })
  }
  async function runDue(ownerKey) {
    const ownerScope = ownerKey ? { ownerKey } : {}
    for (const stale of await ctx.repo.query(C.tasks, {
      eq: { state: 'leased', ...ownerScope },
      limit: 20,
    })) {
      if (stale.leaseUntil > ctx.now()) continue
      await ctx.repo.transaction(async (tx) => {
        const current = await tx.get(C.tasks, stale._id)
        if (current?.state === 'leased' && current.leaseUntil <= ctx.now()) {
          current.state = 'queued'
          await tx.set(C.tasks, current._id, current)
        }
      })
    }
    for (const waiting of await ctx.repo.query(C.tasks, {
      eq: { state: 'waiting', ...ownerScope },
      limit: 20,
    })) {
      if (waiting.nextAttemptAt > ctx.now()) continue
      await ctx.repo.transaction(async (tx) => {
        const current = await tx.get(C.tasks, waiting._id),
          asset = await tx.get(C.assets, waiting.targetId)
        if (current?.state === 'waiting' && current.nextAttemptAt <= ctx.now()) {
          current.state = 'done'
          if (asset) {
            asset.safety = 'retryable-error'
            await tx.set(C.assets, asset._id, asset)
          }
          await tx.set(C.tasks, current._id, current)
        }
      })
    }
    const tasks = await ctx.repo.query(C.tasks, {
      eq: { state: 'queued', ...ownerScope },
      limit: 20,
      order: 'asc',
    })
    let completed = 0
    for (const candidate of tasks) {
      if (ownerKey && completed >= 4) break
      if (candidate.nextAttemptAt > ctx.now()) continue
      if (['text', 'image'].includes(candidate.type) && ctx.safety.available?.() === false) continue
      const lease = randomUUID()
      const task = await ctx.repo.transaction(async (tx) => {
        const row = await tx.get(C.tasks, candidate._id)
        if (!row || row.state !== 'queued' || row.nextAttemptAt > ctx.now()) return null
        const owner = await tx.get(C.owners, row.ownerKey)
        if (!owner) return null
        if (row.type === 'text' && owner.clearing) {
          row.state = 'cancelled'
          await tx.set(C.tasks, row._id, row)
          return null
        }
        row.state = 'leased'
        row.lease = lease
        row.leaseUntil = ctx.now() + 30000
        row.attempts++
        await tx.set(C.tasks, row._id, row)
        return { ...row, openId: owner.openId, lastVisitAt: owner.lastVisitAt }
      })
      if (!task) continue
      if (task.type === 'clear') {
        await ctx.clearBatch(task)
        completed++
        continue
      }
      if (task.type === 'image') {
        if (ctx.now() - task.lastVisitAt > 7200000)
          await ctx.repo.transaction(async (tx) => {
            const row = await tx.get(C.assets, task.targetId),
              current = await tx.get(C.tasks, task._id)
            if (current?.lease === task.lease) {
              current.state = 'needs-author'
              if (row) {
                row.safety = 'needs-author'
                await tx.set(C.assets, row._id, row)
              }
              await tx.set(C.tasks, current._id, current)
            }
          })
        else await ctx.checkImage(task)
        completed++
        continue
      }
      if (task.type === 'asset-update') {
        await ctx.propagateAsset(task)
        completed++
        continue
      }
      if (task.type === 'orphan-public') {
        await ctx.storage.remove(task.targetId)
        await ctx.repo.transaction(async (tx) => {
          const current = await tx.get(C.tasks, task._id)
          if (current?.lease === task.lease) {
            current.state = 'done'
            await tx.set(C.tasks, current._id, current)
          }
        })
        completed++
        continue
      }
      if (task.type !== 'text') continue
      let safety = 'retryable-error'
      let errorCode = null
      try {
        if (ctx.now() - task.lastVisitAt > 7200000) safety = 'needs-author'
        else {
          const result = await ctx.safety.checkText(task.text, task.scene, task.openId)
          errorCode = providerErrorCode(result)
          if (result.errCode === 0 && ['pass', 'review', 'risky'].includes(result.suggest))
            safety = result.suggest
        }
      } catch (error) {
        errorCode = providerErrorCode(error)
        /* 外部錯誤不回傳原始內容或 OpenID。 */
      }
      await ctx.repo.transaction(async (tx) => {
        const current = await tx.get(C.tasks, task._id)
        if (!current || current.lease !== lease || current.state !== 'leased') return
        current.providerErrorCode = errorCode
        const collection = task.target === 'profile' ? C.profiles : C.messages,
          row = await tx.get(collection, task.targetId),
          owner = await tx.get(C.owners, task.ownerKey)
        if (!row || !owner || owner.clearing || row.deleted) {
          current.state = 'cancelled'
          await tx.set(C.tasks, current._id, current)
          return
        }
        const boundText =
          task.target === 'profile'
            ? row.nickName
            : task.field === 'body'
              ? row.text
              : task.field === 'nickname'
                ? row.nickName
                : row.replyCandidate?.text
        if (task.contentHash !== ctx.hash(boundText || '')) {
          current.state = 'cancelled'
          await tx.set(C.tasks, current._id, current)
          return
        }
        if (task.target === 'profile') row[task.field] = safety
        else if (task.field === 'reply') {
          if (!row.replyCandidate || row.replyCandidate.candidateId !== task.candidateId) {
            current.state = 'cancelled'
            await tx.set(C.tasks, current._id, current)
            return
          }
          row.replyCandidate.safety = safety
          if (safety === 'pass') {
            row.reply = {
              text: row.replyCandidate.text,
              createdAt: row.reply?.createdAt || ctx.now(),
              updatedAt: ctx.now(),
            }
            row.replyCandidate = null
          }
          row.revision++
        } else {
          row.safety[task.field] = safety
          row.revision++
          if (safety === 'risky' && ['pending-review', 'published'].includes(row.status)) {
            row.status = row.status === 'published' ? 'hidden' : 'rejected'
            row.reason = '內容未通過安全檢查，請修改後另行投稿。'
            row.expiresAt = row.status === 'rejected' ? ctx.now() + 2592000000 : null
          }
        }
        await tx.set(collection, row._id, row)
        current.state =
          safety === 'retryable-error' && current.attempts < 3
            ? 'queued'
            : safety === 'needs-author'
              ? 'needs-author'
              : 'done'
        current.nextAttemptAt = ctx.now() + (current.attempts === 1 ? 60000 : 300000)
        await tx.set(C.tasks, current._id, current)
      })
      completed++
    }
    if (ctx.cleanup) await ctx.cleanup()
    return { completed }
  }
  return { enqueue, runDue }
}
module.exports = { createTaskWorker }
