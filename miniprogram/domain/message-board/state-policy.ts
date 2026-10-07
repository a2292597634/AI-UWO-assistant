import type { MessageStatus, SafetyStatus } from '../../contracts/message-board'

export function canPublish(input: {
  status: MessageStatus
  safety: readonly SafetyStatus[]
  manualReviewsComplete: boolean
  ownerClearing: boolean
  assetRevoked: boolean
}): boolean {
  return (
    ['pending-review', 'published', 'hidden'].includes(input.status) &&
    !input.ownerClearing &&
    !input.assetRevoked &&
    input.safety.length >= 3 &&
    input.safety.every(
      (status) => status === 'pass' || (status === 'review' && input.manualReviewsComplete),
    )
  )
}
