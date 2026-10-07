const C = require('./collections')
function createPrivacy(ctx) {
  async function clear(input, actor) {
    return ctx.operations.write(
      'clearMyData',
      input,
      actor,
      async (tx, owner) => {
        if (!owner.clearing) {
          owner.clearing = true
          owner.clearGeneration = (owner.clearGeneration || 0) + 1
          await ctx.enqueue(tx, {
            type: 'clear',
            target: 'owner',
            targetId: actor.ownerKey,
            field: owner.clearGeneration,
            ownerKey: actor.ownerKey,
          })
        }
        return { kind: 'clear', id: actor.ownerKey }
      },
      { allowClearing: true, allowRestricted: true },
    )
  }
  async function batch(task) {
    const rows = await ctx.repo.query(C.messages, {
      eq: { ownerKey: task.ownerKey, deleted: false },
      limit: 20,
    })
    for (const message of rows)
      await ctx.repo.transaction(async (tx) => {
        const row = await tx.get(C.messages, message._id)
        if (!row || row.deleted) return
        await tx.set(C.messages, row._id, {
          ...row,
          status: 'withdrawn',
          text: '',
          nickName: '',
          reply: null,
          replyCandidate: null,
          avatarAssetId: null,
          avatarFileId: null,
          reason: null,
          deleted: true,
          revision: row.revision + 1,
        })
      })
    const remainingMessages =
      (
        await ctx.repo.query(C.messages, {
          eq: { ownerKey: task.ownerKey, deleted: false },
          limit: 1,
        })
      ).length > 0
    let remaining = remainingMessages
    if (!remainingMessages) {
      for (const profile of await ctx.repo.query(C.profiles, {
        eq: { ownerKey: task.ownerKey },
        limit: 20,
      }))
        await ctx.repo.remove(C.profiles, profile._id)
      for (const asset of await ctx.repo.query(C.assets, {
        eq: { ownerKey: task.ownerKey },
        limit: 20,
      })) {
        await ctx.repo.transaction(async (tx) => {
          const row = await tx.get(C.assets, asset._id)
          if (row) {
            row.deleting = true
            await tx.set(C.assets, row._id, row)
          }
        })
        if (asset.publicFileId) await ctx.storage.remove(asset.publicFileId)
        await ctx.repo.remove(C.assets, asset._id)
      }
      for (const report of await ctx.repo.query(C.reports, {
        eq: { reporterKey: task.ownerKey },
        limit: 20,
      }))
        await ctx.repo.remove(C.reports, report._id)
      // 安全任務也可能包含待檢查原文；不能只清除展示資料。
      for (const type of ['text', 'image'])
        for (const queued of await ctx.repo.query(C.tasks, {
          eq: { ownerKey: task.ownerKey, type },
          limit: 20,
        }))
          await ctx.repo.remove(C.tasks, queued._id)
      remaining =
        (await ctx.repo.query(C.profiles, { eq: { ownerKey: task.ownerKey }, limit: 1 })).length >
          0 ||
        (await ctx.repo.query(C.assets, { eq: { ownerKey: task.ownerKey }, limit: 1 })).length >
          0 ||
        (await ctx.repo.query(C.reports, { eq: { reporterKey: task.ownerKey }, limit: 1 })).length >
          0 ||
        (await ctx.repo.query(C.tasks, { eq: { ownerKey: task.ownerKey, type: 'text' }, limit: 1 }))
          .length > 0 ||
        (
          await ctx.repo.query(C.tasks, {
            eq: { ownerKey: task.ownerKey, type: 'image' },
            limit: 1,
          })
        ).length > 0
    }
    await ctx.repo.transaction(async (tx) => {
      const current = await tx.get(C.tasks, task._id),
        owner = await tx.get(C.owners, task.ownerKey)
      if (!current || current.lease !== task.lease || !owner) return
      current.state = remaining ? 'queued' : 'done'
      current.nextAttemptAt = ctx.now() + 1000
      if (!remaining) {
        owner.clearing = false
        owner.profileRevision = 0
        owner.lastServerId = null
        owner.clearedAt = ctx.now()
        owner.openId = null
        await tx.set(C.owners, task.ownerKey, owner)
      }
      await tx.set(C.tasks, current._id, current)
    })
  }
  return { clear, batch }
}
module.exports = { createPrivacy }
