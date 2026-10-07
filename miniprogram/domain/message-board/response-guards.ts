import { GAME_SERVERS } from '../../contracts/coupon-redemption'
import type { BoardAction } from '../../contracts/message-board'
const record = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === 'object' && !Array.isArray(value)
const only = (value: Record<string, unknown>, keys: readonly string[]) =>
  Object.keys(value).every((key) => keys.includes(key))
const string = (value: unknown, max: number) =>
  typeof value === 'string' && value.length > 0 && value.length <= max
const id = (value: unknown) => typeof value === 'string' && /^[a-f0-9]{32,64}$/.test(value)
const date = (value: unknown) => typeof value === 'string' && Number.isFinite(Date.parse(value))
const safety = (value: unknown) =>
  typeof value === 'string' &&
  ['checking', 'pass', 'review', 'risky', 'retryable-error', 'needs-author'].includes(value)
const status = (value: unknown) =>
  typeof value === 'string' &&
  ['pending-review', 'published', 'rejected', 'withdrawn', 'hidden'].includes(value)
const server = (value: unknown) => GAME_SERVERS.some((item) => item.id === value)
const nullable = (value: unknown, predicate: (input: unknown) => boolean) =>
  value === null || predicate(value)
const common = [
  'messageId',
  'revision',
  'nickName',
  'avatarFileId',
  'gameServerId',
  'gameServerName',
  'text',
  'createdAt',
  'publishedAt',
  'reply',
]
const privateKeys = ['status', 'reason', 'safety', 'canWithdraw', 'avatarAssetId']
export function validMessage(value: unknown, kind: 'public' | 'mine' | 'admin'): boolean {
  if (
    !record(value) ||
    !only(value, [
      ...common,
      ...(kind !== 'public' ? privateKeys : []),
      ...(kind === 'admin'
        ? ['canApprove', 'needsManualReview', 'replySafety', 'authorRestricted']
        : []),
    ])
  )
    return false
  if (
    !id(value.messageId) ||
    typeof value.revision !== 'number' ||
    !Number.isSafeInteger(value.revision) ||
    value.revision < 1 ||
    !string(value.nickName, 128) ||
    !string(value.text, 2000) ||
    !date(value.createdAt) ||
    !server(value.gameServerId) ||
    !string(value.gameServerName, 128)
  )
    return false
  if (
    !nullable(
      value.avatarFileId,
      (ref) => typeof ref === 'string' && ref.startsWith('cloud://') && ref.length <= 2048,
    )
  )
    return false
  if (kind === 'public' ? !date(value.publishedAt) : !nullable(value.publishedAt, date))
    return false
  if (
    value.reply !== null &&
    (!record(value.reply) ||
      !only(value.reply, ['text', 'createdAt', 'updatedAt']) ||
      !string(value.reply.text, 2000) ||
      !date(value.reply.createdAt) ||
      !date(value.reply.updatedAt))
  )
    return false
  if (kind !== 'public') {
    if (
      !status(value.status) ||
      !nullable(value.reason, (reason) => string(reason, 800)) ||
      typeof value.canWithdraw !== 'boolean' ||
      !nullable(value.avatarAssetId, id) ||
      !record(value.safety) ||
      !only(value.safety, ['nickname', 'body', 'avatar']) ||
      !safety(value.safety.nickname) ||
      !safety(value.safety.body) ||
      !safety(value.safety.avatar)
    )
      return false
  }
  return (
    kind !== 'admin' ||
    (typeof value.canApprove === 'boolean' &&
      typeof value.needsManualReview === 'boolean' &&
      (value.replySafety === undefined || nullable(value.replySafety, safety)) &&
      (value.authorRestricted === undefined || typeof value.authorRestricted === 'boolean'))
  )
}
function profile(value: unknown): boolean {
  return (
    record(value) &&
    only(value, [
      'profileRevision',
      'nickName',
      'avatarAssetId',
      'lastServerId',
      'nicknameSafety',
      'avatarSafety',
    ]) &&
    typeof value.profileRevision === 'number' &&
    Number.isSafeInteger(value.profileRevision) &&
    value.profileRevision >= 1 &&
    string(value.nickName, 128) &&
    nullable(value.avatarAssetId, id) &&
    nullable(value.lastServerId, server) &&
    safety(value.nicknameSafety) &&
    safety(value.avatarSafety)
  )
}
function bool(value: unknown, key: string): boolean {
  return record(value) && only(value, [key]) && typeof value[key] === 'boolean'
}
function asset(value: unknown): boolean {
  return record(value) && only(value, ['assetId']) && id(value.assetId)
}
function report(value: unknown): boolean {
  return (
    record(value) &&
    only(value, ['reportId', 'messageId', 'fixedReason', 'createdAt']) &&
    id(value.reportId) &&
    id(value.messageId) &&
    ['advertising', 'abuse', 'personal-information', 'other'].includes(String(value.fixedReason)) &&
    date(value.createdAt)
  )
}
function page(value: unknown, predicate: (input: unknown) => boolean): boolean {
  return (
    record(value) &&
    only(value, ['items', 'nextCursor']) &&
    Array.isArray(value.items) &&
    value.items.length <= 20 &&
    value.items.every(predicate) &&
    nullable(value.nextCursor, (cursor) => string(cursor, 1024))
  )
}
export function validBoardOutput(action: BoardAction, value: unknown): boolean {
  if (action === 'getViewer')
    return (
      record(value) &&
      only(value, [
        'viewerKey',
        'isAdmin',
        'serverTime',
        'read',
        'write',
        'review',
        'restricted',
        'clearing',
        'clearVersion',
      ]) &&
      typeof value.viewerKey === 'string' &&
      /^[a-f0-9]{64}$/.test(value.viewerKey) &&
      typeof value.serverTime === 'number' &&
      Number.isSafeInteger(value.serverTime) &&
      typeof value.clearVersion === 'number' &&
      Number.isSafeInteger(value.clearVersion) &&
      value.clearVersion >= 0 &&
      ['isAdmin', 'read', 'write', 'review', 'restricted', 'clearing'].every(
        (key) => typeof value[key] === 'boolean',
      )
    )
  if (action === 'getProfile') return value === null || profile(value)
  if (action === 'saveProfile') return profile(value)
  if (action === 'uploadAvatar') return asset(value)
  if (action === 'loadPrivateAvatar')
    return (
      record(value) &&
      only(value, ['assetId', 'base64']) &&
      id(value.assetId) &&
      typeof value.base64 === 'string' &&
      value.base64.length > 0 &&
      value.base64.length <= 87384 &&
      /^[A-Za-z0-9+/]+={0,2}$/.test(value.base64)
    )
  if (action === 'listPublic') return page(value, (item) => validMessage(item, 'public'))
  if (action === 'listMine') return page(value, (item) => validMessage(item, 'mine'))
  if (action === 'listAdmin') return page(value, (item) => validMessage(item, 'admin'))
  if (action === 'loadAdmin') return validMessage(value, 'admin')
  if (action === 'listReports') return page(value, report)
  if (action === 'reportMessage') return bool(value, 'reported')
  if (action === 'resolveReport') return bool(value, 'resolved')
  if (['clearMyData', 'getClearStatus'].includes(action)) return bool(value, 'clearing')
  if (action === 'getOperationResult')
    return (
      record(value) &&
      only(value, ['confirmed', 'result']) &&
      typeof value.confirmed === 'boolean' &&
      (value.confirmed
        ? validMessage(value.result, 'mine') ||
          profile(value.result) ||
          asset(value.result) ||
          bool(value.result, 'reported') ||
          bool(value.result, 'resolved') ||
          bool(value.result, 'clearing')
        : value.result === null)
    )
  if (action === 'revalidatePublic')
    return (
      record(value) &&
      only(value, ['items', 'unavailable']) &&
      Array.isArray(value.items) &&
      value.items.length <= 100 &&
      value.items.every((item) => validMessage(item, 'public')) &&
      Array.isArray(value.unavailable) &&
      value.unavailable.length <= 100 &&
      value.unavailable.every(id)
    )
  return validMessage(value, 'mine')
}
export { record, only }
