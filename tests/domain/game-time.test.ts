import { describe, expect, it, vi } from 'vitest'
import {
  gameDateBounds,
  gameDateKey,
  gameHourStartUnixSeconds,
  toGameTimeDate,
} from '../../miniprogram/subpkg-trade/game-time'

describe('遊戲 UTC+8 時間工具', () => {
  it('在非 UTC+8 執行環境仍以 UTC+8 取得日期、時間和整點', () => {
    vi.stubEnv('TZ', 'America/Los_Angeles')
    try {
      const instant = Date.parse('2026-09-25T10:47:00+08:00') / 1000

      expect(gameDateKey(instant)).toBe('2026-09-25')
      expect(toGameTimeDate(instant).getUTCHours()).toBe(10)
      expect(toGameTimeDate(instant).getUTCMinutes()).toBe(47)
      expect(gameHourStartUnixSeconds(instant)).toBe(Date.parse('2026-09-25T10:00:00+08:00') / 1000)
    } finally {
      vi.unstubAllEnvs()
    }
  })

  it('以 UTC+8 日期計算跨日範圍並拒絕無效日期', () => {
    expect(gameDateBounds('2026-09-25')).toEqual({
      start: Date.parse('2026-09-25T00:00:00+08:00') / 1000,
      end: Date.parse('2026-09-26T00:00:00+08:00') / 1000,
    })
    expect(gameDateBounds('2026-02-30')).toBeNull()
    expect(gameDateBounds('2026/09/25')).toBeNull()
  })
})
