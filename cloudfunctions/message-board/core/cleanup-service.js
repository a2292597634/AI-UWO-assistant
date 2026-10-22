const { randomUUID } = require('node:crypto')
const C = require('./collections')
function createCleanup(ctx) {
  async function references(assetId, publicOnly) {
    const eq = {
      avatarAssetId: assetId,
      deleted: false,
      ...(publicOnly ? { status: 'published' } : {}),
    }
    if ((await ctx.repo.query(C.messages, { eq, limit: 1 })).length) return true
    if (publicOnly) return false
    for (const profile of await ctx.repo.query(C.profiles, {
      eq: { avatarAssetId: assetId },
      limit: 100,
    })) {
      const owner = await ctx.repo.get(C.owners, profile.ownerKey)
      if (owner && !owner.clearing && owner.profileRevision === profile.profileRevision) return true
      if (
        (
          await ctx.repo.query(C.messages, {
            eq: { profileId: profile._id, deleted: false },
            limit: 1,
          })
        ).length
      )
        return true
    }
    return false
  }
  async function cleanAsset(asset, publicOnly) {
    if (await references(asset._id, publicOnly)) return
    const lease = randomUUID(),
      flag = publicOnly ? 'deletingPublic' : 'deleting'
    const claimed = await ctx.repo.transaction(async (tx) => {
      const row = await tx.get(C.assets, asset._id)
      if (!row || ((row.deleting || row.deletingPublic) && row.cleanupLeaseUntil > ctx.now()))
        return null
      row[flag] = true
      row.cleanupLease = lease
      row.cleanupLeaseUntil = ctx.now() + 60000
      await tx.set(C.assets, row._id, row)
      return row
    })
    if (!claimed) return
    if (await references(asset._id, publicOnly)) {
      await ctx.repo.transaction(async (tx) => {
        const row = await tx.get(C.assets, asset._id)
        if (row?.cleanupLease === lease) {
          row[flag] = false
          await tx.set(C.assets, row._id, row)
        }
      })
      return
    }
    if (claimed.publicFileId) await ctx.storage.remove(claimed.publicFileId)
    await ctx.repo.transaction(async (tx) => {
      const row = await tx.get(C.assets, asset._id)
      if (row?.cleanupLease !== lease) return
      if (publicOnly) {
        row.publicFileId = null
        row.deletingPublic = false
        await tx.set(C.assets, row._id, row)
      } else await tx.remove(C.assets, asset._id)
    })
  }
  // 以穩定文件 ID 記住掃描進度；只在當前候選完成後前進，失敗仍可重入。
  async function scanOld(collection, process) {
    const cursorId = `cleanup-cursor:${collection}`
    const cursor = await ctx.repo.get(C.operations, cursorId)
    const candidates = await ctx.repo.query(collection, {
      field: '_id',
      after: cursor?.after,
      beforeField: 'createdAt',
      before: ctx.now() - 86400000,
      order: 'asc',
      limit: 20,
    })
    for (const row of candidates) {
      await process(row)
      await ctx.repo.set(C.operations, cursorId, { after: row._id })
    }
    // 到達尾端後下輪從頭開始，讓此前仍被引用的資料有機會再次檢查。
    if (candidates.length < 20) await ctx.repo.set(C.operations, cursorId, { after: null })
  }
  async function run() {
    for (const candidate of await ctx.repo.query(C.messages, {
      eq: { deleted: false },
      field: 'expiresAt',
      before: ctx.now(),
      order: 'asc',
      limit: 20,
    }))
      await ctx.repo.transaction(async (tx) => {
        const row = await tx.get(C.messages, candidate._id)
        if (!row || row.deleted || !row.expiresAt || row.expiresAt >= ctx.now()) return
        if (row.status === 'pending-review') {
          row.status = 'rejected'
          row.reason = '留言超過審核保留期限。'
          row.expiresAt = ctx.now() + 2592000000
          row.revision++
        } else if (['rejected', 'withdrawn'].includes(row.status)) {
          row.deleted = true
          row.text = ''
          row.nickName = ''
          row.reply = null
          row.replyCandidate = null
          row.avatarAssetId = null
          row.avatarFileId = null
          row.reason = null
          row.expiresAt = null
          row.revision++
        } else return
        await tx.set(C.messages, row._id, row)
      })
    for (const collection of [C.operations, C.events, C.audit, C.tasks]) {
      for (const row of await ctx.repo.query(collection, {
        field: 'expiresAt',
        before: ctx.now(),
        order: 'asc',
        limit: 20,
      })) {
        if (collection === C.tasks && ['leased', 'waiting'].includes(row.state)) continue
        await ctx.repo.remove(collection, row._id)
      }
    }
    await scanOld(C.profiles, async (profile) => {
      const owner = await ctx.repo.get(C.owners, profile.ownerKey)
      if (owner?.profileRevision === profile.profileRevision || owner?.clearing) return
      if (
        (
          await ctx.repo.query(C.messages, {
            eq: { profileId: profile._id, deleted: false },
            limit: 1,
          })
        ).length
      )
        return
      await ctx.repo.remove(C.profiles, profile._id)
    })
    await scanOld(C.assets, async (asset) => {
      if (asset.publicFileId) await cleanAsset(asset, true)
      const current = await ctx.repo.get(C.assets, asset._id)
      if (current) await cleanAsset(current, false)
    })
    return { cleaned: true }
  }
  return { run }
}
module.exports = { createCleanup }
