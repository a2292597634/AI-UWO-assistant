import Page from 'miniprogram-automator/out/Page'
import { describe, expect, it, vi } from 'vitest'

import { createAutomatorAdapter } from '../../tools/miniprogram-review/adapter'

// 在協議邊界模擬頁面及兩個元件；實際查詢與動作由正式 SDK 及適配器執行。
const setup = (queryFailure?: () => Promise<unknown>, tapFailure?: () => Promise<unknown>) => {
  const actions: Array<{ method: string; params: Record<string, unknown> }> = []
  let pageId = 1
  const connection = {
    async send(method: string, params: Record<string, unknown>) {
      if (method === 'Page.getElement') throw new Error('Element not found: page scope')
      if (method === 'Page.getElements') {
        if (params.selector !== '*') return { elements: [] }
        return {
          elements: [
            { elementId: 'inline', nodeId: 10, tagName: 'component' },
            { elementId: 'sheet', nodeId: 20, tagName: 'component' },
          ],
        }
      }
      if (method === 'Element.getElements' || method === 'Element.getElement') {
        if (queryFailure) return await queryFailure()
        const selector = String(params.selector)
        const matched = params.elementId === 'sheet' && selector.includes('--sheet')
        const element = {
          elementId: selector,
          tagName: selector.endsWith('__search')
            ? 'input'
            : selector.endsWith('__list')
              ? 'scroll-view'
              : 'view',
        }
        if (method === 'Element.getElements') return { elements: matched ? [element] : [] }
        if (!matched) throw new Error('Element not found: component scope')
        return element
      }
      actions.push({ method, params })
      if (method === 'Element.tap' && tapFailure) return await tapFailure()
      if (method === 'Element.getDOMProperties') {
        return {
          properties:
            params.names instanceof Array && params.names[0] === 'innerText'
              ? ['觀測後採集']
              : [320, 400],
        }
      }
      return { result: undefined }
    },
  }
  const adapter = createAutomatorAdapter({
    currentPage: async () =>
      new Page(connection as never, { id: pageId, path: 'pages/adventure-fleet/index', query: {} }),
  } as never)
  return {
    adapter,
    actions,
    nextPage: () => {
      pageId += 1
    },
  }
}

describe('正式 SDK 元件作用域查詢', () => {
  it('查詢完成後原生點擊掛起仍在同一動作期限內失敗', async () => {
    vi.useFakeTimers()
    try {
      const { adapter } = setup(undefined, () => new Promise(() => undefined))
      let settled = false
      const pending = adapter
        .tap('.skill-picker-sheet--sheet .skill-picker-sheet__select')
        .catch((error: unknown) => {
          settled = true
          return error
        })
      await vi.advanceTimersByTimeAsync(5000)
      expect(settled).toBe(true)
      expect(await pending).toMatchObject({
        message: expect.stringContaining('automator response timeout'),
      })
    } finally {
      vi.useRealTimers()
    }
  })
  it('fixture 還原失敗仍釋放 SDK 連線，保留還原錯誤', async () => {
    const failure = new Error('Connection closed')
    let evaluations = 0
    let disconnected = false
    const adapter = createAutomatorAdapter({
      evaluate: async () => {
        if (evaluations++ === 0) return 'uwo-review-fixture:coupon-success'
        throw failure
      },
      disconnect: () => {
        disconnected = true
      },
    } as never)
    await adapter.installFixture!('coupon-success')
    await expect(adapter.disconnect()).rejects.toBe(failure)
    expect(disconnected).toBe(true)
  })
  it.each(['導航', 'fixture'] as const)(
    'SDK %s 不返回時有限期失敗，不能掛住整批驗收',
    async (operation) => {
      vi.useFakeTimers()
      try {
        const adapter = createAutomatorAdapter({
          callWxMethod: async () => new Promise(() => undefined),
          evaluate: async () => new Promise(() => undefined),
        } as never)
        const pending = (
          operation === '導航'
            ? adapter.reLaunch('/pages/adventure-fleet/index')
            : adapter.installFixture!('coupon-success')
        ).catch((error: unknown) => error)
        // fixture 安裝失敗仍須嘗試還原；兩個協議呼叫各有 5 秒期限。
        await vi.advanceTimersByTimeAsync(operation === 'fixture' ? 10000 : 5000)
        expect(await pending).toMatchObject({
          message: expect.stringContaining('automator response timeout'),
        })
      } finally {
        vi.useRealTimers()
      }
    },
  )
  it('只有宿主元件而沒有內部元素時，不能宣稱找到彈窗', async () => {
    const { adapter } = setup()
    expect(await adapter.queryElement('.skill-sheet__not-present')).toBe(false)
  })
  it('頁級不存在時找到 sheet 內部元素並保留原生輸入、點擊及滾動', async () => {
    const { adapter, actions } = setup()
    const root = '.skill-picker-sheet--sheet'
    await adapter.waitFor(root, 100)
    await adapter.input(`${root} .skill-picker-sheet__search`, '採集')
    await adapter.clearInput(`${root} .skill-picker-sheet__search`)
    expect(await adapter.readText(`${root} .skill-picker-sheet__name`)).toBe('觀測後採集')
    expect(await adapter.isVisible(root)).toBe(true)
    expect(await adapter.queryElement(root)).toBe(true)
    await adapter.tap(`${root} .skill-picker-sheet__detail[data-id='skill_skillT0172']`)
    await adapter.scrollElement(`${root} .skill-picker-sheet__list`, 300)
    expect(actions).toEqual(
      expect.arrayContaining([
        {
          method: 'Element.callFunction',
          params: expect.objectContaining({ functionName: 'input.input', args: ['採集'] }),
        },
        {
          method: 'Element.callFunction',
          params: expect.objectContaining({ functionName: 'input.input', args: [''] }),
        },
        {
          method: 'Element.tap',
          params: expect.objectContaining({
            elementId:
              ".skill-picker-sheet--sheet .skill-picker-sheet__detail[data-id='skill_skillT0172']",
          }),
        },
        {
          method: 'Element.callFunction',
          params: expect.objectContaining({ functionName: 'scroll-view.scrollTo', args: [0, 300] }),
        },
      ]),
    )
    expect(actions.some(({ method }) => method.includes('callMethod'))).toBe(false)
  })

  it('轉場後重新取得當前頁與元件，不重用舊頁節點', async () => {
    const { adapter, actions, nextPage } = setup()
    await adapter.tap('.skill-picker-sheet--sheet .skill-picker-sheet__close')
    nextPage()
    await adapter.tap('.skill-picker-sheet--sheet .skill-picker-sheet__close')
    expect(
      actions.filter(({ method }) => method === 'Element.tap').map(({ params }) => params.pageId),
    ).toEqual([1, 2])
  })

  it('元件協議連線錯誤保留原始錯誤', async () => {
    const failure = new Error('Connection closed, check if wechat web devTools is still running')
    const { adapter } = setup(async () => {
      throw failure
    })
    await expect(adapter.queryElement('.skill-picker-sheet--sheet')).rejects.toBe(failure)
  })

  it('元件查詢掛起仍服從整個等待期限', async () => {
    vi.useFakeTimers()
    try {
      const { adapter } = setup(() => new Promise(() => undefined))
      const result = adapter
        .waitFor('.skill-picker-sheet--sheet', 500)
        .catch((error: unknown) => error)
      await vi.advanceTimersByTimeAsync(500)
      expect(await result).toMatchObject({ message: expect.stringMatching(/timeout|超时|逾時/) })
    } finally {
      vi.useRealTimers()
    }
  })
})
