import type {
  PublicMessage,
  MyMessage,
  AdminMessage,
  SafetyStatus,
} from '../contracts/message-board'
export const BOARD_DEFAULT_AVATAR = '/assets/ui/message-board-default-avatar.png'
export const STATUS_LABELS = {
  'pending-review': '待審核',
  published: '已公開',
  rejected: '未通過',
  withdrawn: '已撤回',
  hidden: '已下架',
} as const
export const SAFETY_LABELS: Record<SafetyStatus, string> = {
  checking: '檢查中',
  pass: '已通過',
  review: '需人工複核',
  risky: '未通過',
  'retryable-error': '檢查暫時失敗',
  'needs-author': '請重新確認安全檢查',
}
export function boardTime(value: string | null): string {
  if (!value) return ''
  const date = new Date(value),
    pad = (number: number) => String(number).padStart(2, '0')
  return `${date.getFullYear()}/${pad(date.getMonth() + 1)}/${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`
}
export function boardMessageView<T extends PublicMessage | MyMessage | AdminMessage>(message: T) {
  const isMine = (value: PublicMessage | MyMessage): value is MyMessage =>
    'status' in value && 'safety' in value
  const mine = isMine(message) ? message : null
  return {
    ...message,
    createdLabel: boardTime(message.createdAt),
    replyLabel: message.reply ? boardTime(message.reply.updatedAt) : '',
    statusLabel: mine ? STATUS_LABELS[mine.status] : '',
    safetyLabel: mine
      ? `暱稱：${SAFETY_LABELS[mine.safety.nickname]} · 留言：${SAFETY_LABELS[mine.safety.body]} · 頭像：${SAFETY_LABELS[mine.safety.avatar]}`
      : '',
    needsSafetyRetry: mine
      ? Object.values(mine.safety).some((value) =>
          ['needs-author', 'retryable-error'].includes(value),
        )
      : false,
  }
}
