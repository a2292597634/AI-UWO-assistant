import { describe, expect, it } from 'vitest'
import { gameMonthAt } from '../../miniprogram/subpkg-trade/domain/game-month'

const jst = (year: number, month: number, day: number, hour = 0): number =>
  Date.UTC(year, month - 1, day, hour - 9)

describe('gameMonthAt', () => {
  it('maps the calibrated JST anchor to game month 12', () => {
    expect(gameMonthAt(jst(2026, 9, 4))).toBe(12)
  })

  it('advances one game month per JST calendar day and wraps after 12', () => {
    expect(gameMonthAt(jst(2026, 9, 3))).toBe(11)
    expect(gameMonthAt(jst(2026, 9, 5))).toBe(1)
    expect(gameMonthAt(jst(2026, 9, 16))).toBe(12)
  })

  it('uses the JST midnight boundary rather than the device timezone', () => {
    expect(gameMonthAt(jst(2026, 9, 3, 23) + 59 * 60 * 1000 + 59 * 1000)).toBe(11)
    expect(gameMonthAt(jst(2026, 9, 4))).toBe(12)
  })

  it('normalizes dates before the anchor into the 1–12 range', () => {
    expect(gameMonthAt(jst(2026, 9, 2))).toBe(10)
  })
})
