/**
 * 將現實時間換算成遊戲內月份。
 *
 * 基準固定採日本時區的 2026-09-04 00:00，該時刻對應遊戲 12 月；
 * 每經過一個日本時區的日曆日，遊戲月份前進一個月。
 */

export const GAME_MONTH_ANCHOR_MS = Date.UTC(2026, 8, 3, 15, 0, 0)

const DAY_MS = 24 * 60 * 60 * 1000
const GAME_MONTH_COUNT = 12

const positiveModulo = (value: number, modulo: number): number =>
  ((value % modulo) + modulo) % modulo

export const gameMonthAt = (timestampMs: number): number => {
  if (!Number.isFinite(timestampMs)) {
    throw new Error('INVALID_TIMESTAMP')
  }

  const elapsedDays = Math.floor((timestampMs - GAME_MONTH_ANCHOR_MS) / DAY_MS)
  return positiveModulo(elapsedDays + 11, GAME_MONTH_COUNT) + 1
}
