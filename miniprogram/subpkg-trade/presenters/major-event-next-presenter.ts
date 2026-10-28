export const presentMajorEventWait = (
  triggerAtUnixSeconds: number,
  nowUnixSeconds: number,
): string => {
  const minutes = Math.max(0, Math.ceil((triggerAtUnixSeconds - nowUnixSeconds) / 60))
  if (minutes === 0) return '即將開始'
  const days = Math.floor(minutes / 1440)
  const hours = Math.floor((minutes % 1440) / 60)
  const remainingMinutes = minutes % 60
  if (days > 0) return `還有 ${days} 天 ${hours} 小時`
  if (hours > 0) return `還有 ${hours} 小時${remainingMinutes > 0 ? ` ${remainingMinutes} 分` : ''}`
  return `還有 ${remainingMinutes} 分`
}
