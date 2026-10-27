import { afterEach, describe, expect, it, vi } from 'vitest'
import type { FleetCalculation } from '../../miniprogram/domain/fleet-solver-core'

const loadRunner = async () => {
  const api = await import('../../miniprogram/runtime/fleet-calculation').catch(() => null)
  expect(api?.FleetCalculationRunner, '需提供可中斷的計算 runner').toBeTypeOf('function')
  return new api!.FleetCalculationRunner<number>()
}

function* calculation(value = 7, batches = 4): FleetCalculation<number> {
  for (let i = 0; i < batches; i++) {
    vi.setSystemTime(Date.now() + 4)
    yield {
      phase: 'searching',
      processedCandidates: i,
      totalCandidates: batches,
      candidateFraction: 0,
    }
  }
  return value
}

afterEach(() => vi.useRealTimers())

describe('配隊計算排程', () => {
  it('進度回調取消後同一時間片也不再 next 或發佈進度', async () => {
    vi.useFakeTimers()
    const runner = await loadRunner()
    let afterCancellation = 0
    function* work(): FleetCalculation<number> {
      yield { phase: 'searching', processedCandidates: 0, totalCandidates: 1, candidateFraction: 0 }
      yield {
        phase: 'finalizing',
        processedCandidates: 1,
        totalCandidates: 1,
        candidateFraction: 0,
      }
      afterCancellation++
      return 1
    }
    const onProgress = vi.fn(() => runner.cancel())
    const pending = runner.start({ key: 'a', create: work, isCurrent: () => true, onProgress })
    await vi.runAllTimersAsync()
    expect(await pending).toEqual({ status: 'cancelled' })
    expect(afterCancellation).toBe(0)
    expect(onProgress).toHaveBeenCalledTimes(1)
    expect(vi.getTimerCount()).toBe(0)
  })

  it('完整輸入鍵區分貢獻、目標順序、容量、約束、目標船、模式與基線', async () => {
    const api = await import('../../miniprogram/runtime/fleet-calculation')
    expect(api).toHaveProperty('buildFleetCalculationKey')
    const input = {
      officers: [{ id: 'a', skills: [{ skillId: 's', level: 1 }] }],
      targets: [
        { skillId: 's', targetLevel: 1 },
        { skillId: 't', targetLevel: 2 },
      ],
      capacity: 11,
      lockedOfficerIds: [],
      excludedOfficerIds: [],
      occupiedByOtherShips: [],
      currentOfficerIds: [],
      shipId: 'ship-1',
      baseStateFingerprint: 'baseline-a',
    }
    const key = api.buildFleetCalculationKey('battle', input, 'auto')
    expect(api.buildFleetCalculationKey('battle', structuredClone(input), 'auto')).toBe(key)
    for (const change of [
      { officers: [{ id: 'a', skills: [{ skillId: 's', level: 2 }] }] },
      { targets: [...input.targets].reverse() },
      { targets: [{ skillId: 's', targetLevel: 3 }] },
      { capacity: 77 },
      { lockedOfficerIds: ['a'] },
      { excludedOfficerIds: ['a'] },
      { occupiedByOtherShips: ['a'] },
      { currentOfficerIds: ['a'] },
      { shipId: 'ship-2' },
      { baseStateFingerprint: 'baseline-b' },
    ])
      expect(api.buildFleetCalculationKey('battle', { ...input, ...change }, 'auto')).not.toBe(key)
    expect(api.buildFleetCalculationKey('adventure', input, 'auto')).not.toBe(key)
    expect(api.buildFleetCalculationKey('battle', input, 'manual')).not.toBe(key)
  })

  it('首輪先釋放事件迴圈，8ms 批次之間讓出宏任務且只回報真實進度', async () => {
    vi.useFakeTimers()
    const runner = await loadRunner()
    const create = vi.fn(() => calculation())
    const views: { progress: number | null; status: string }[] = []
    const result = runner.start({
      key: 'a',
      create,
      isCurrent: () => true,
      onProgress: (v) => views.push(v),
    })
    expect(create).not.toHaveBeenCalled()
    await vi.advanceTimersToNextTimerAsync()
    expect(runner.isRunning).toBe(true)
    expect(views[0]).toMatchObject({ status: 'searching', progress: 25 })
    await vi.runAllTimersAsync()
    expect(await result).toEqual({ status: 'completed', value: 7, cached: false })
    expect(runner.isRunning).toBe(false)
  })

  it('取消立即 settle 並釋放排程；取消和錯誤都不快取且可立即重試', async () => {
    vi.useFakeTimers()
    const runner = await loadRunner()
    const create = vi.fn(() => calculation())
    const first = runner.start({ key: 'a', create, isCurrent: () => true })
    runner.cancel()
    expect(await first).toEqual({ status: 'cancelled' })
    expect(vi.getTimerCount()).toBe(0)
    const failure = runner.start({
      key: 'a',
      create: () => {
        throw Error('測試錯誤')
      },
      isCurrent: () => true,
    })
    await vi.runAllTimersAsync()
    expect(await failure).toMatchObject({ status: 'error' })
    const retry = runner.start({ key: 'a', create, isCurrent: () => true })
    await vi.runAllTimersAsync()
    expect(await retry).toMatchObject({ status: 'completed', cached: false })
    expect(create).toHaveBeenCalledTimes(1)
  })

  it('每批和結果回填前檢查是否過期，generator.next 拋錯也可重試', async () => {
    vi.useFakeTimers()
    const runner = await loadRunner()
    let current = true
    const pending = runner.start({
      key: 'a',
      create: () => calculation(),
      isCurrent: () => current,
    })
    await vi.advanceTimersToNextTimerAsync()
    current = false
    await vi.runAllTimersAsync()
    expect(await pending).toEqual({ status: 'cancelled' })
    function* broken(): FleetCalculation<number> {
      yield { phase: 'preparing', processedCandidates: 0, totalCandidates: 0, candidateFraction: 0 }
      throw Error('next 失敗')
    }
    const failure = runner.start({ key: 'a', create: broken, isCurrent: () => true })
    await vi.runAllTimersAsync()
    expect(await failure).toMatchObject({ status: 'error' })
    const retry = runner.start({ key: 'a', create: () => calculation(), isCurrent: () => true })
    await vi.runAllTimersAsync()
    expect(await retry).toMatchObject({ status: 'completed', cached: false })
  })

  it('重複啟動共用任務，只保留最近一個完整輸入快取且 dispose 會釋放', async () => {
    vi.useFakeTimers()
    const runner = await loadRunner()
    const create = vi.fn(() => calculation())
    const options = { key: 'a', create, isCurrent: () => true }
    const first = runner.start(options)
    expect(runner.start(options)).toBe(first)
    await vi.runAllTimersAsync()
    await first
    expect(await runner.start(options)).toMatchObject({ cached: true })
    const other = runner.start({ ...options, key: 'b' })
    await vi.runAllTimersAsync()
    await other
    const original = runner.start(options)
    await vi.runAllTimersAsync()
    expect(await original).toMatchObject({ cached: false })
    runner.dispose()
    const disposed = runner.start(options)
    await vi.runAllTimersAsync()
    expect(await disposed).toMatchObject({ cached: false })
    expect(create).toHaveBeenCalledTimes(4)
  })

  it('同階段進度至少相隔120ms，階段改變即時通知且搜尋百分比包含候選內比例', async () => {
    vi.useFakeTimers()
    const runner = await loadRunner()
    const views: { at: number; status: string; progress: number | null; notice: string }[] = []
    function* slow(): FleetCalculation<number> {
      for (let i = 0; i < 80; i++) {
        vi.setSystemTime(Date.now() + 4)
        yield {
          phase: 'searching',
          processedCandidates: 0,
          totalCandidates: 1,
          candidateFraction: i / 80,
        }
      }
      yield {
        phase: 'finalizing',
        processedCandidates: 1,
        totalCandidates: 1,
        candidateFraction: 0,
      }
      return 1
    }
    const result = runner.start({
      key: 'slow',
      create: slow,
      isCurrent: () => true,
      onProgress: (v) => views.push({ ...v, at: Date.now() }),
    })
    await vi.runAllTimersAsync()
    await result
    const searching = views.filter((v) => v.status === 'searching')
    expect(searching.length).toBeGreaterThan(1)
    for (let i = 1; i < searching.length; i++)
      expect(searching[i].at - searching[i - 1].at).toBeGreaterThanOrEqual(120)
    expect(searching[0].progress).toBeGreaterThan(0)
    expect(views[views.length - 1]).toMatchObject({ status: 'finalizing', progress: null })
  })
})
