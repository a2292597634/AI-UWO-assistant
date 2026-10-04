import { expect, it, vi } from 'vitest'
import { waitForCondition } from '../../tools/miniprogram-review/wait-condition'
import { isDevToolsConnectionError } from '../../tools/miniprogram-review/adapter'
it('抖動後需連續兩次成立，單次成功不足以結束', async () => {
  let now = 0
  const values = [false, true, false, true, true]
  const probe = vi.fn(async () => values.shift() ?? true)
  await waitForCondition({
    probe,
    timeoutMs: 1000,
    pollMs: 100,
    stableSamples: 2,
    nowMs: () => now,
    sleep: async (ms) => {
      now += ms
    },
  })
  expect(probe).toHaveBeenCalledTimes(5)
  expect(now).toBe(400)
})
it('協議錯誤保留原始例外，不能當成元素消失', async () => {
  const original = new Error('Connection closed')
  await expect(
    waitForCondition({
      probe: async () => {
        throw original
      },
      timeoutMs: 1000,
      pollMs: 100,
      stableSamples: 2,
    }),
  ).rejects.toBe(original)
})
it.each([false, true])('條件永不成立／probe 永不 resolve 均有界，hung=%s', async (hung) => {
  vi.useFakeTimers()
  try {
    let calls = 0
    const pending = waitForCondition({
      probe: async () => {
        calls++
        return hung ? await new Promise<boolean>(() => {}) : false
      },
      timeoutMs: 500,
      pollMs: 100,
      stableSamples: 2,
      nowMs: () => Date.now(),
    }).catch((e) => e)
    await vi.advanceTimersByTimeAsync(500)
    const error = await pending
    expect(error).toMatchObject({ message: expect.stringContaining('500') })
    expect(isDevToolsConnectionError(error)).toBe(hung)
    expect(calls).toBe(hung ? 1 : 5)
    await vi.advanceTimersByTimeAsync(500)
    expect(calls).toBe(hung ? 1 : 5)
  } finally {
    vi.useRealTimers()
  }
})
