const { randomUUID } = require('node:crypto')
const C = require('./collections')
const { fail, text } = require('./validation')

function createMessages(ctx) {
  async function saveProfile(input, actor) {
    const nickName = text(input.nickName, 'nickname')
    if (!Number.isInteger(input.profileRevision) || input.profileRevision < 0)
      throw fail('input-invalid')
    return ctx.operations.write('saveProfile', input, actor, async (tx, owner) => {
      if (owner.profileRevision !== input.profileRevision) throw fail('revision-conflict')
      const asset = input.avatarAssetId ? await tx.get(C.assets, input.avatarAssetId) : null
      if (
        input.avatarAssetId &&
        (!asset ||
          asset.ownerKey !== actor.ownerKey ||
          asset.deleting ||
          asset.revoked ||
          ['risky'].includes(asset.safety))
      )
        throw fail('asset-invalid')
      const profileRevision = (owner.profileSequence || owner.profileRevision) + 1,
        id = ctx.hash(actor.ownerKey + ':profile:' + profileRevision)
      await tx.set(C.profiles, id, {
        ownerKey: actor.ownerKey,
        profileRevision,
        nickName,
        avatarAssetId: input.avatarAssetId || null,
        nicknameSafety: 'checking',
        nicknameHash: ctx.hash(nickName),
        avatarSafety: asset ? asset.safety : 'pass',
        createdAt: ctx.now(),
      })
      owner.profileRevision = profileRevision
      owner.profileSequence = profileRevision
      await ctx.enqueue(tx, {
        type: 'text',
        target: 'profile',
        targetId: id,
        field: 'nicknameSafety',
        text: nickName,
        scene: 1,
        ownerKey: actor.ownerKey,
      })
      return { kind: 'profile', id }
    })
  }
  async function createMessage(input, actor) {
    const body = text(input.text, 'body'),
      server = ctx.catalog.servers.find((server) => server.id === input.gameServerId)
    if (!server || input.catalogVersion !== ctx.catalog.version) throw fail('server-invalid')
    if (!Number.isInteger(input.profileRevision) || input.profileRevision < 1)
      throw fail('input-invalid')
    const messageId = randomUUID().replaceAll('-', '')
    return ctx.operations.write('createMessage', input, actor, async (tx, owner) => {
      const profileId = ctx.hash(actor.ownerKey + ':profile:' + input.profileRevision),
        profile = await tx.get(C.profiles, profileId)
      if (!profile || profile.ownerKey !== actor.ownerKey) throw fail('profile-version-expired')
      if (profile.nicknameHash !== ctx.hash(profile.nickName)) throw fail('safety-not-ready')
      const asset = profile.avatarAssetId ? await tx.get(C.assets, profile.avatarAssetId) : null
      if (
        profile.nicknameSafety === 'risky' ||
        (asset && (asset.revoked || asset.safety === 'risky'))
      )
        throw fail('safety-not-ready')
      if (profile.avatarAssetId && !asset) throw fail('asset-invalid')
      if (asset?.deleting || asset?.deletingPublic) throw fail('asset-invalid')
      if (owner.lastSubmitAt !== null && ctx.now() - owner.lastSubmitAt < 60000)
        throw fail('rate-limited')
      const day = new Date(ctx.now() + 28800000).toISOString().slice(0, 10)
      if (owner.day !== day) {
        owner.day = day
        owner.dailyCount = 0
      }
      if (owner.dailyCount >= 10) throw fail('rate-limited')
      owner.dailyCount++
      owner.lastSubmitAt = ctx.now()
      owner.lastServerId = server.id
      const safety = {
        nickname: profile.nicknameSafety,
        body: 'checking',
        avatar: asset ? asset.safety : 'pass',
      }
      await tx.set(C.messages, messageId, {
        ownerKey: actor.ownerKey,
        profileId,
        nickName: profile.nickName,
        avatarAssetId: profile.avatarAssetId,
        avatarFileId: null,
        gameServerId: server.id,
        gameServerName: server.name,
        text: body,
        status: 'pending-review',
        safety,
        contentHashes: {
          nickname: ctx.hash(profile.nickName),
          body: ctx.hash(body),
          avatar: asset ? asset.sha256 : 'builtin',
        },
        manualReviewsComplete: false,
        reason: null,
        reply: null,
        revision: 1,
        createdAt: ctx.now(),
        publishedAt: null,
        expiresAt: ctx.now() + 2592000000,
        deleted: false,
        orderKey: String(ctx.now()).padStart(13, '0') + ':' + messageId,
      })
      await ctx.enqueue(tx, {
        type: 'text',
        target: 'message',
        targetId: messageId,
        field: 'body',
        text: body,
        scene: 2,
        ownerKey: actor.ownerKey,
      })
      if (safety.nickname !== 'pass')
        await ctx.enqueue(tx, {
          type: 'text',
          target: 'message',
          targetId: messageId,
          field: 'nickname',
          text: profile.nickName,
          scene: 1,
          ownerKey: actor.ownerKey,
        })
      return { kind: 'message', id: messageId }
    })
  }
  async function withdraw(input, actor) {
    return ctx.operations.write(
      'withdrawMessage',
      input,
      actor,
      async (tx) => {
        const message = await tx.get(C.messages, input.messageId)
        if (!message || message.ownerKey !== actor.ownerKey) throw fail('not-found')
        if (message.status !== 'withdrawn') {
          ctx.revision(message, input)
          if (!['pending-review', 'published', 'hidden'].includes(message.status))
            throw fail('state-conflict')
          message.status = 'withdrawn'
          message.revision++
          message.withdrawnAt = ctx.now()
          message.expiresAt = ctx.now() + 2592000000
          await tx.set(C.messages, message._id, message)
        }
        return { kind: 'message', id: message._id }
      },
      { allowClearing: true, allowRestricted: true },
    )
  }
  return { saveProfile, createMessage, withdraw }
}
module.exports = { createMessages }
