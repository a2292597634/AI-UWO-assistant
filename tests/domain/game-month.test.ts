import { describe, expect, it } from 'vitest'
import { gameMonthAt } from '../../miniprogram/subpkg-trade/domain/game-month'

const cst = (year: number, month: number, day: number, hour = 0, minute = 0, second = 0): number =>
  Date.UTC(year, month - 1, day, hour - 8, minute, second)

describe('gameMonthAt', () => {
  it('maps the calibrated China Standard Time anchor to game month 12', () => {
    expect(gameMonthAt(cst(2026, 9, 3, 9))).toBe(12)
  })

  it('advances one game month per China Standard Time calendar day and wraps after 12', () => {
    expect(gameMonthAt(cst(2026, 9, 4, 9))).toBe(1)
    expect(gameMonthAt(cst(2026, 9, 7, 9))).toBe(4)
    expect(gameMonthAt(cst(2026, 9, 15, 9))).toBe(12)
  })

  it('uses the China Standard Time 09:00 boundary rather than the device timezone', () => {
    expect(gameMonthAt(cst(2026, 9, 7, 8, 59, 59))).toBe(3)
    expect(gameMonthAt(cst(2026, 9, 7, 9))).toBe(4)
  })

  it('shows game month 4 at the current calibrated date', () => {
    expect(gameMonthAt(cst(2026, 9, 7, 12))).toBe(4)
  })

  it('normalizes dates before the anchor into the 1–12 range', () => {
    expect(gameMonthAt(cst(2026, 9, 2, 9))).toBe(11)
  })
})
