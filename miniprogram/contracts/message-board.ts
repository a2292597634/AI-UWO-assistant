import type { GameServerId } from './coupon-redemption'

export type MessageStatus = 'pending-review' | 'published' | 'rejected' | 'withdrawn' | 'hidden'
export type SafetyStatus =
  'checking' | 'pass' | 'review' | 'risky' | 'retryable-error' | 'needs-author'
export type BoardResult<T> = { ok: true; data: T } | { ok: false; code: string; message: string }
export interface BoardOperation {
  operationId: string
  expectedRevision?: number
}
export interface PublicMessage {
  messageId: string
  revision: number
  nickName: string
  avatarFileId: string | null
  gameServerId: GameServerId
  gameServerName: string
  text: string
  createdAt: string
  publishedAt: string
  reply: { text: string; createdAt: string; updatedAt: string } | null
}
export interface MyMessage extends Omit<PublicMessage, 'publishedAt'> {
  publishedAt: string | null
  status: MessageStatus
  reason: string | null
  safety: { nickname: SafetyStatus; body: SafetyStatus; avatar: SafetyStatus }
  canWithdraw: boolean
  avatarAssetId: string | null
}
export interface AdminMessage extends MyMessage {
  canApprove: boolean
  needsManualReview: boolean
  replySafety?: SafetyStatus | null
  authorRestricted?: boolean
}
export interface ViewerCapabilities {
  clearVersion: number
  viewerKey: string
  isAdmin: boolean
  serverTime: number
  read: boolean
  write: boolean
  review: boolean
  restricted: boolean
  clearing: boolean
}
export interface BoardProfile {
  profileRevision: number
  nickName: string
  avatarAssetId: string | null
  lastServerId: GameServerId | null
  nicknameSafety: SafetyStatus
  avatarSafety: SafetyStatus
}
export interface BoardPage<T> {
  items: T[]
  nextCursor: string | null
}
export interface BoardListInput {
  limit?: number
  cursor?: string
  gameServerId?: GameServerId
  status?: MessageStatus
}
export interface MessageTarget extends BoardOperation {
  messageId: string
  expectedRevision: number
}
export type ReportReason = 'advertising' | 'abuse' | 'personal-information' | 'other'

export interface BoardReport {
  reportId: string
  messageId: string
  fixedReason: ReportReason
  createdAt: string
}
export interface BoardInputs {
  getViewer: Record<string, never>
  getProfile: Record<string, never>
  getClearStatus: Record<string, never>
  listPublic: BoardListInput
  listMine: Pick<BoardListInput, 'cursor' | 'limit'>
  listAdmin: BoardListInput
  listReports: Pick<BoardListInput, 'cursor'>
  saveProfile: BoardOperation & {
    profileRevision: number
    nickName: string
    avatarAssetId: string | null
  }
  uploadAvatar: BoardOperation & { base64: string }
  loadPrivateAvatar: { assetId: string }
  createMessage: BoardOperation & {
    profileRevision: number
    gameServerId: GameServerId
    catalogVersion: string
    text: string
  }
  withdrawMessage: MessageTarget
  retrySafety: MessageTarget
  approve: MessageTarget & { manualReviewReason?: string }
  restore: MessageTarget & { manualReviewReason?: string }
  reject: MessageTarget & { reason: string }
  hide: MessageTarget & { reason: string }
  restrictAuthor: MessageTarget & { reason: string }
  unrestrictAuthor: MessageTarget & { reason: string }
  saveReply: MessageTarget & { text: string }
  removeReply: MessageTarget
  reportMessage: BoardOperation & { messageId: string; fixedReason: ReportReason }
  resolveReport: MessageTarget & { reportId: string; outcome: 'hide' | 'keep'; reason: string }
  clearMyData: BoardOperation
  getOperationResult: { operationId: string; action: BoardAction }
  loadAdmin: { messageId: string }
  revalidatePublic: { messageIds: string[] }
}
export interface BoardOutputs {
  getViewer: ViewerCapabilities
  getProfile: BoardProfile | null
  getClearStatus: { clearing: boolean }
  listPublic: BoardPage<PublicMessage>
  listMine: BoardPage<MyMessage>
  listAdmin: BoardPage<AdminMessage>
  listReports: BoardPage<BoardReport>
  saveProfile: BoardProfile
  uploadAvatar: { assetId: string }
  loadPrivateAvatar: { assetId: string; base64: string }
  createMessage: MyMessage
  withdrawMessage: MyMessage
  retrySafety: MyMessage
  approve: MyMessage
  restore: MyMessage
  reject: MyMessage
  hide: MyMessage
  restrictAuthor: MyMessage
  unrestrictAuthor: MyMessage
  saveReply: MyMessage
  removeReply: MyMessage
  reportMessage: { reported: boolean }
  resolveReport: { resolved: boolean }
  clearMyData: { clearing: boolean }
  getOperationResult: {
    confirmed: boolean
    result:
      | MyMessage
      | BoardProfile
      | { assetId: string }
      | { reported: boolean }
      | { resolved: boolean }
      | { clearing: boolean }
      | null
  }
  loadAdmin: AdminMessage
  revalidatePublic: { items: PublicMessage[]; unavailable: string[] }
}
export type BoardAction = keyof BoardInputs
export interface MessageBoardService {
  invoke<A extends BoardAction>(action: A, input: BoardInputs[A]): Promise<BoardOutputs[A]>
}
