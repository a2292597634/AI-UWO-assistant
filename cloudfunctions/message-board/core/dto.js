const iso = (value) => new Date(value).toISOString()
function publicDto(message) {
  return {
    messageId: message._id,
    revision: message.revision,
    nickName: message.nickName,
    avatarFileId: message.avatarFileId || null,
    gameServerId: message.gameServerId,
    gameServerName: message.gameServerName,
    text: message.text,
    createdAt: iso(message.createdAt),
    publishedAt: message.publishedAt ? iso(message.publishedAt) : null,
    reply: message.reply
      ? {
          text: message.reply.text,
          createdAt: iso(message.reply.createdAt),
          updatedAt: iso(message.reply.updatedAt),
        }
      : null,
  }
}
function mineDto(message) {
  return {
    ...publicDto(message),
    status: message.status,
    reason: message.reason || null,
    safety: { ...message.safety },
    avatarAssetId: message.avatarAssetId || null,
    canWithdraw: ['pending-review', 'published', 'hidden'].includes(message.status),
  }
}
function profileDto(profile, lastServerId = null) {
  return {
    profileRevision: profile.profileRevision,
    nickName: profile.nickName,
    avatarAssetId: profile.avatarAssetId || null,
    nicknameSafety: profile.nicknameSafety,
    avatarSafety: profile.avatarSafety,
    lastServerId,
  }
}
module.exports = { publicDto, mineDto, profileDto }
