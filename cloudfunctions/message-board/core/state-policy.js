function canPublish(input) {
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
module.exports = { canPublish }
