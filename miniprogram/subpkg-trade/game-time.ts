export const GAME_TIME_OFFSET_SECONDS = 8 * 60 * 60

const SECONDS_PER_HOUR = 60 * 60
const SECONDS_PER_DAY = 24 * SECONDS_PER_HOUR

const assertFiniteDate = (date: Date, unixSeconds: number): Date => {
  if (!Number.isFinite(date.getTime())) {
    throw new Error(`無效的遊戲時間：${unixSeconds}`)
  }
  return date
}

export const toGameTimeDate = (unixSeconds: number): Date => {
  if (!Number.isFinite(unixSeconds)) {
    throw new Error(`無效的遊戲時間：${unixSeconds}`)
  }
  return assertFiniteDate(new Date((unixSeconds + GAME_TIME_OFFSET_SECONDS) * 1000), unixSeconds)
}

export const gameHourStartUnixSeconds = (unixSeconds: number): number => {
  toGameTimeDate(unixSeconds)
  return (
    Math.floor((unixSeconds + GAME_TIME_OFFSET_SECONDS) / SECONDS_PER_HOUR) * SECONDS_PER_HOUR -
    GAME_TIME_OFFSET_SECONDS
  )
}

export const gameDateKey = (unixSeconds: number): string => {
  const gameDate = toGameTimeDate(unixSeconds)
  const year = String(gameDate.getUTCFullYear()).padStart(4, '0')
  const month = String(gameDate.getUTCMonth() + 1).padStart(2, '0')
  const day = String(gameDate.getUTCDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

export const gameDateBounds = (dateKey: string): { start: number; end: number } | null => {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dateKey)
  if (match === null) return null

  const year = Number(match[1])
  const month = Number(match[2])
  const day = Number(match[3])
  const utcMidnight = new Date(0)
  utcMidnight.setUTCHours(0, 0, 0, 0)
  utcMidnight.setUTCFullYear(year, month - 1, day)
  if (
    utcMidnight.getUTCFullYear() !== year ||
    utcMidnight.getUTCMonth() !== month - 1 ||
    utcMidnight.getUTCDate() !== day
  ) {
    return null
  }

  const start = utcMidnight.getTime() / 1000 - GAME_TIME_OFFSET_SECONDS
  return { start, end: start + SECONDS_PER_DAY }
}
