import { beforeAll, expect, it, vi } from 'vitest'
import type {
  AdminMessage,
  BoardReport,
  MessageBoardService,
  ViewerCapabilities,
} from '../../miniprogram/contracts/message-board'
interface AdminPage {
  data: {
    reports: BoardReport[]
    rows: AdminMessage[]
    viewer: ViewerCapabilities | null
    reportMode: boolean
    error: string
    cursor: string | null
    loading: boolean
  }
  service: MessageBoardService
  active: boolean
  setData(update: Record<string, unknown>): void
  onLoad(): void
  onRefresh(): Promise<void>
  onToggleReports(): Promise<void>
  onMore(): Promise<void>
}
let registered: AdminPage
beforeAll(async () => {
  vi.stubGlobal('Page', (page: AdminPage) => {
    registered = page
  })
  vi.stubGlobal('wx', { cloud: { callFunction: vi.fn() } })
  await import('../../miniprogram/subpkg-message-board/pages/admin/index')
})
function harness() {
  let isAdmin = true,
    failMore = false,
    reportCalls = 0
  const reports = Array.from({ length: 20 }, (_, i) => ({
    reportId: 'report-' + i,
    messageId: 'same-message',
    fixedReason: 'advertising' as const,
    createdAt: '2026-10-07T00:00:00.000Z',
  }))
  const invoke = vi.fn(async (action: string) => {
    if (action === 'getViewer')
      return {
        isAdmin,
        viewerKey: 'a'.repeat(64),
        clearVersion: 0,
        serverTime: Date.now(),
        read: true,
        write: true,
        review: true,
        restricted: false,
        clearing: false,
      }
    if (action === 'listReports') {
      if (++reportCalls > 1 && failMore) throw new Error('檢舉載入失敗')
      return { items: reports, nextCursor: 'next' }
    }
    if (action === 'listAdmin')
      return {
        items: [
          {
            messageId: 'message-1',
            nickName: '航海者',
            text: '正文',
            createdAt: '2026-10-07T00:00:00.000Z',
            status: 'pending-review',
            safety: { nickname: 'pass', body: 'pass', avatar: 'pass' },
            reply: null,
          },
        ],
        nextCursor: null,
      }
    throw new Error('測試沒有此接口')
  })
  const page = Object.create(registered) as AdminPage
  page.data = structuredClone(registered.data)
  page.setData = (update) => {
    Object.assign(page.data, update)
  }
  page.service = { invoke } as unknown as MessageBoardService
  page.active = true
  page.onLoad()
  return {
    page,
    setAdmin(value: boolean) {
      isAdmin = value
    },
    failMore() {
      failMore = true
    },
  }
}
it('載入更多檢舉失敗時保留已有列表並顯示錯誤，不能未處理地拒絕事件', async () => {
  const t = harness()
  await t.page.onToggleReports()
  expect(t.page.data.reports).toHaveLength(20)
  t.failMore()
  await expect(t.page.onMore()).resolves.toBeUndefined()
  expect(t.page.data.reports).toHaveLength(20)
  expect(t.page.data.error).toContain('檢舉載入失敗')
})
it('管理權限撤銷後再次恢復，重新進入能建立有效的列表控制器', async () => {
  const t = harness()
  t.setAdmin(false)
  await t.page.onRefresh()
  expect(t.page.data.viewer).toBeNull()
  t.setAdmin(true)
  await t.page.onRefresh()
  expect(t.page.data.rows).toHaveLength(1)
})
