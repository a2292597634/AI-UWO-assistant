import { describe, expect, it } from 'vitest'
import { presentMajorEventWait } from '../../miniprogram/subpkg-trade/presenters/major-event-next-presenter'

describe('下一場等待時間', () => {
  it.each([
    [0, '即將開始'],
    [1, '還有 1 分'],
    [3600, '還有 1 小時'],
    [3601, '還有 1 小時 1 分'],
    [90000, '還有 1 天 1 小時'],
  ])('將 %s 秒轉成不提前歸零的等待文字', (seconds, expected) => {
    expect(presentMajorEventWait(1000 + seconds, 1000)).toBe(expected)
  })
})
