import { GAME_SERVERS } from '../contracts/coupon-redemption'
import type { BoardListInput, BoardPage, MessageStatus } from '../contracts/message-board'
type Item = { messageId: string }
interface Window<T> {
  items: T[]
  cursor: string | null
  startCursor: string | null
}
export function createBoardListController<T extends Item>(
  fetch: (input: BoardListInput) => Promise<BoardPage<T>>,
  options: { status?: MessageStatus; key?: (item: T) => string } = {},
) {
  let items: T[] = [],
    cursor: string | null = null,
    server: string | null = null,
    status = options.status || null,
    busy = false,
    error = '',
    token = 0,
    index = 0,
    startCursor: string | null = null,
    disposed = false
  const windows = new Map<number, Window<T>>(),
    starts = new Map<number, string | null>([[0, null]])
  const key = options.key || ((item: T) => item.messageId)
  const input = (after: string | null, limit: number): BoardListInput => ({
    limit,
    ...(after ? { cursor: after } : {}),
    ...(server ? { gameServerId: GAME_SERVERS.find((item) => item.id === server)!.id } : {}),
    ...(status ? { status } : {}),
  })
  function cache() {
    windows.set(index, { items: [...items], cursor, startCursor })
    while (windows.size > 3) windows.delete(windows.keys().next().value!)
  }
  async function request(reset: boolean, after: string | null = null) {
    const current = ++token
    busy = true
    error = ''
    try {
      const page = await fetch(
        input(reset ? after : cursor, reset ? 20 : Math.min(20, 100 - items.length)),
      )
      if (current !== token || disposed) return
      if (!reset && page.items.length === 0 && page.nextCursor === cursor)
        throw new Error('列表游標未前進，請重新整理。')
      const merged = reset ? page.items : [...items, ...page.items],
        seen = new Set<string>()
      items = merged
        .filter((item) => {
          const value = key(item)
          if (seen.has(value)) return false
          seen.add(value)
          return true
        })
        .slice(0, 100)
      cursor = page.nextCursor
      cache()
    } catch (caught) {
      if (current === token && !disposed)
        error = caught instanceof Error ? caught.message : '留言載入失敗，請重試。'
    } finally {
      if (current === token && !disposed) busy = false
    }
  }
  async function refresh() {
    index = 0
    startCursor = null
    windows.clear()
    starts.clear()
    starts.set(0, null)
    await request(true)
  }
  const changed = async () => {
    items = []
    cursor = null
    await refresh()
  }
  async function nextWindow() {
    if (busy || !cursor || items.length < 100) return
    cache()
    startCursor = cursor
    index++
    starts.set(index, startCursor)
    items = []
    cursor = null
    const cached = windows.get(index)
    if (cached) {
      items = [...cached.items]
      cursor = cached.cursor
      startCursor = cached.startCursor
      return
    }
    await request(true, startCursor)
  }
  async function previousWindow() {
    if (busy || index === 0) return
    cache()
    index--
    const cached = windows.get(index)
    startCursor = starts.get(index) || null
    if (cached) {
      items = [...cached.items]
      cursor = cached.cursor
      startCursor = cached.startCursor
      return
    }
    items = []
    cursor = null
    await request(true, startCursor)
  }
  return {
    view: () => ({
      items,
      cursor,
      server,
      status,
      busy,
      error,
      windowNumber: index + 1,
      canPrevious: index > 0,
      canNext: items.length === 100 && !!cursor,
    }),
    refresh,
    loadMore: async () => {
      if (!busy && cursor && items.length < 100) await request(false)
    },
    nextWindow,
    previousWindow,
    selectServer: async (value: string | null) => {
      if (value && !GAME_SERVERS.some((item) => item.id === value)) return
      server = value
      await changed()
    },
    selectStatus: async (value: MessageStatus) => {
      status = value
      await changed()
    },
    replaceRevalidated: (values: T[], unavailable: string[]) => {
      const fresh = new Map(values.map((item) => [key(item), item]))
      items = items
        .filter((item) => !unavailable.includes(item.messageId))
        .map((item) => fresh.get(key(item)) || item)
      cache()
    },
    onHide: () => {
      token++
      busy = false
    },
    dispose: () => {
      disposed = true
      token++
      items = []
      windows.clear()
      starts.clear()
    },
  }
}
