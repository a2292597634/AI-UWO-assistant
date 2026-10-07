import { describe, expect, it } from 'vitest'
import { createComposeController } from '../../miniprogram/controllers/message-board-compose-controller'
import type {
  BoardOutputs,
  BoardAction,
  MessageBoardService,
} from '../../miniprogram/contracts/message-board'
import { MessageBoardError } from '../../miniprogram/runtime/message-board-service'
const profile = {
  profileRevision: 1,
  nickName: '航海者',
  avatarAssetId: null,
  lastServerId: null,
  nicknameSafety: 'pass' as const,
  avatarSafety: 'pass' as const,
}
const message = {
  messageId: 'a'.repeat(32),
  revision: 1,
  nickName: '航海者',
  avatarFileId: null,
  gameServerId: 'UWOGL-US-01' as const,
  gameServerName: 'Atlantic Ocean',
  text: '原正文',
  createdAt: '2026-10-07T00:00:00.000Z',
  publishedAt: null,
  reply: null,
  status: 'pending-review' as const,
  reason: null,
  safety: { nickname: 'pass' as const, body: 'checking' as const, avatar: 'pass' as const },
  canWithdraw: true,
  avatarAssetId: null,
}
function setup() {
  let calls = 0,
    ids = 0,
    confirmed = false
  const stored: unknown[] = []
  const service: MessageBoardService = {
    async invoke<A extends BoardAction>(action: A): Promise<BoardOutputs[A]> {
      if (action === 'createMessage') {
        calls++
        throw new MessageBoardError('unconfirmed', '尚未確認')
      }
      if (action === 'getOperationResult')
        return { confirmed, result: confirmed ? message : null } as BoardOutputs[A]
      if (action === 'saveProfile') return profile as BoardOutputs[A]
      throw new Error('不預期的動作')
    },
  }
  const controller = createComposeController({
    service,
    operationId: async () => `1791340000000_${(++ids).toString(16).padStart(32, '0')}`,
    prepareAvatar: async () => '',
    draft: {
      read: () => null,
      write: (value) => {
        stored.push(value)
      },
      clear: () => {
        stored.push('cleared')
      },
    },
    profile,
  })
  return {
    controller,
    stored,
    calls: () => calls,
    ids: () => ids,
    confirm: () => {
      confirmed = true
    },
  }
}
describe('投稿意圖與未確認結果', () => {
  it('只儲存留言資料時不要求伺服器，也不發表或清除正文草稿', async () => {
    const t = setup()
    t.controller.setBody('保留正文草稿')
    await t.controller.saveProfileOnly({ nickname: '新暱稱' })
    expect(t.calls()).toBe(0)
    expect(t.controller.view().phase).toBe('profile-saved')
    expect(t.controller.view().body).toBe('保留正文草稿')
    expect(t.stored).not.toContain('cleared')
  })
  it('未選伺服器不能投稿，失焦前舊暱稱不代替 form 提交值', async () => {
    const t = setup()
    t.controller.setBody('原正文')
    await t.controller.submitForm({ nickname: '航海者' })
    expect(t.calls()).toBe(0)
    expect(t.controller.view().phase).toBe('error')
    t.controller.selectServer('UWOGL-US-01')
    await t.controller.submitForm({ nickname: '' })
    expect(t.calls()).toBe(0)
  })
  it('傳輸不明不建立第二個 operation，確認期間保留原內容', async () => {
    const t = setup()
    t.controller.selectServer('UWOGL-US-01')
    t.controller.setBody('原正文')
    await t.controller.submitForm({ nickname: '航海者' })
    const first = t.controller.pendingOperationId()
    expect(t.controller.view().phase).toBe('unconfirmed')
    await t.controller.confirmPendingOperation()
    expect(t.controller.pendingOperationId()).toBe(first)
    expect(t.ids()).toBe(1)
    expect(t.calls()).toBe(1)
    expect(t.controller.view().body).toBe('原正文')
  })
  it('已送出結果確認時，不清除後來新寫的草稿', async () => {
    const t = setup()
    t.controller.selectServer('UWOGL-US-01')
    t.controller.setBody('原正文')
    await t.controller.submitForm({ nickname: '航海者' })
    t.controller.setBody('新草稿')
    t.confirm()
    await t.controller.confirmPendingOperation()
    expect(t.controller.view().phase).toBe('accepted')
    expect(t.controller.view().body).toBe('新草稿')
    expect(t.stored).not.toContain('cleared')
  })
})
