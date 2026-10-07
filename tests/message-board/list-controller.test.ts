import { describe, expect, it } from 'vitest'
import { createBoardListController } from '../../miniprogram/controllers/message-board-list-controller'
describe('留言列表意圖與窗口', () => {
  it('舊篩選的晚回應不能覆蓋最新篩選', async () => {
    const waits: ((value: { items: { messageId: string }[]; nextCursor: null }) => void)[] = []
    const controller = createBoardListController<{ messageId: string }>(
      async () =>
        new Promise((resolve) => {
          waits.push(resolve)
        }),
    )
    const first = controller.selectServer('UWOGL-US-01'),
      second = controller.selectServer('UWOGL-JP-02')
    waits[1]({ items: [{ messageId: 'jp' }], nextCursor: null })
    await second
    waits[0]({ items: [{ messageId: 'us' }], nextCursor: null })
    await first
    expect(controller.view().items.map((item) => item.messageId)).toEqual(['jp'])
  })
  it('空頁但有游標仍能繼續載入，分頁錯誤保留已載入資料', async () => {
    let calls = 0
    const controller = createBoardListController<{ messageId: string }>(async () => {
      calls++
      if (calls === 1) return { items: [], nextCursor: 'cursor-one' }
      if (calls === 2) return { items: [{ messageId: 'kept' }], nextCursor: 'cursor-two' }
      throw new Error('網路暫時中斷')
    })
    await controller.refresh()
    expect(controller.view().cursor).toBe('cursor-one')
    await controller.loadMore()
    await controller.loadMore()
    expect(controller.view().items).toEqual([{ messageId: 'kept' }])
    expect(controller.view().error).toContain('網路')
  })
  it('每段最多100項，下一段與上一段返回相同資料', async () => {
    let offset = 0
    const controller = createBoardListController<{ messageId: string }>(async () => {
      const start = offset
      offset += 20
      return {
        items: Array.from({ length: 20 }, (_, i) => ({ messageId: String(start + i) })),
        nextCursor: 'cursor-' + offset,
      }
    })
    await controller.refresh()
    for (let i = 0; i < 4; i++) await controller.loadMore()
    expect(controller.view().items).toHaveLength(100)
    await controller.nextWindow()
    expect(controller.view().items[0].messageId).toBe('100')
    await controller.previousWindow()
    expect(controller.view().items[0].messageId).toBe('0')
    expect(controller.view().items).toHaveLength(100)
  })
})
