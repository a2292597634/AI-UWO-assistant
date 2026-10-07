import { describe, expect, it, vi } from 'vitest'
import { createMessageBoardService } from '../../miniprogram/runtime/message-board-service'
const viewer = {
  viewerKey: 'a'.repeat(64),
  isAdmin: false,
  serverTime: 1791340000000,
  read: true,
  write: true,
  review: true,
  restricted: false,
  clearing: false,
}
describe('留言板受控服務與回應校驗', () => {
  it('沒有回應時有界逾時，仍保留結果未確認語義', async () => {
    vi.useFakeTimers()
    try {
      const service = createMessageBoardService(async () => new Promise(() => {}))
      const checked = expect(service.invoke('getViewer', {})).rejects.toMatchObject({
        code: 'unconfirmed',
      })
      await vi.advanceTimersByTimeAsync(15000)
      await checked
    } finally {
      vi.useRealTimers()
    }
  })
  it('保留原操作 ID 與輸入，且只呼叫專用 RPC', async () => {
    let captured: unknown
    const service = createMessageBoardService(async (action, input) => {
      captured = { action, input }
      return { result: { ok: true, data: { assetId: 'b'.repeat(32) } } }
    })
    const input = { operationId: '1791340000000_' + '1'.repeat(32), base64: '合成測試資料' }
    expect(await service.invoke('uploadAvatar', input)).toEqual({ assetId: 'b'.repeat(32) })
    expect(captured).toEqual({ action: 'uploadAvatar', input })
  })
  it('拒絕夾帶私有欄位或未知狀態的成功回應', async () => {
    const leaking = createMessageBoardService(async () => ({
      result: { ok: true, data: { ...viewer, openId: '私人資料' } },
    }))
    await expect(leaking.invoke('getViewer', {})).rejects.toMatchObject({ code: 'protocol' })
    const invalid = createMessageBoardService(async () => ({
      result: {
        ok: true,
        data: { items: [{ ownerKey: 'private', status: 'published' }], nextCursor: null },
      },
    }))
    await expect(invalid.invoke('listPublic', {})).rejects.toMatchObject({ code: 'protocol' })
  })
  it('網路中斷表示結果未確認，而非自動再投稿', async () => {
    const service = createMessageBoardService(async () => {
      throw new Error('transport down')
    })
    await expect(
      service.invoke('clearMyData', { operationId: '1791340000000_' + '1'.repeat(32) }),
    ).rejects.toMatchObject({ code: 'unconfirmed' })
  })
})
