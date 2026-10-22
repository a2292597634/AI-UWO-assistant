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
import type { BoardDraft } from '../../miniprogram/domain/message-board/draft-store'
import type { BoardInputs } from '../../miniprogram/contracts/message-board'

function recoverySetup(action: 'createMessage' | 'saveProfile' | 'uploadAvatar' = 'createMessage') {
  let stored: BoardDraft | null = null
  let now = 1791340000000
  let delivered = false
  let confirmed = false
  let ids = 0
  const writes: { action: string; input: unknown }[] = []
  const ports = {
    profile,
    now: () => now,
    operationId: async () => `${now}_${(++ids).toString(16).padStart(32, '0')}`,
    prepareAvatar: async () => '固定頭像快照',
    draft: {
      read: () => stored,
      write: (value: BoardDraft) => {
        stored = structuredClone(value)
      },
      clear: () => {
        stored = null
      },
    },
    service: {
      async invoke<A extends BoardAction>(
        name: A,
        input: BoardInputs[A],
      ): Promise<BoardOutputs[A]> {
        if (name === 'getOperationResult')
          return { confirmed, result: confirmed ? message : null } as BoardOutputs[A]
        if (name === 'listMine')
          return { items: [], nextCursor: null } as unknown as BoardOutputs[A]
        if (name === 'getProfile') return profile as BoardOutputs[A]
        writes.push({ action: name, input: structuredClone(input) })
        if (name === action && !delivered)
          throw new MessageBoardError('unconfirmed', '原請求未送達')
        if (name === 'createMessage') return message as BoardOutputs[A]
        if (name === 'saveProfile')
          return { ...profile, nickName: '新暱稱', profileRevision: 2 } as BoardOutputs[A]
        if (name === 'uploadAvatar') return { assetId: 'asset-a' } as BoardOutputs[A]
        throw Error(name)
      },
    },
  }
  return {
    ports,
    writes,
    get stored() {
      return stored
    },
    advance: () => {
      now += 86400000
    },
    deliver: () => {
      delivered = true
    },
    confirm: () => {
      confirmed = true
    },
  }
}

describe('重開與安全恢復', () => {
  it('重建控制器確認舊投稿時保留恢復的新草稿', async () => {
    const t = recoverySetup()
    const first = createComposeController(t.ports)
    first.selectServer('UWOGL-US-01')
    first.setBody('原正文')
    await first.submitForm({ nickname: '航海者' })
    first.setBody('後來寫的新草稿')
    first.dispose()
    const reopened = createComposeController(t.ports)
    t.confirm()
    await reopened.confirmPendingOperation()
    expect(reopened.view().body).toBe('後來寫的新草稿')
    expect(t.stored?.body).toBe('後來寫的新草稿')
    expect(t.stored?.pending).toBeUndefined()
  })
  it('查無回執可原ID原payload重試，後改表單不混入', async () => {
    const t = recoverySetup()
    const c = createComposeController(t.ports)
    c.selectServer('UWOGL-US-01')
    c.setBody(' 原正文 ')
    await c.submitForm({ nickname: '航海者' })
    c.setBody('新草稿')
    c.selectServer('UWOGL-US-02')
    t.deliver()
    await c.retryPendingOperation()
    expect(t.writes).toHaveLength(2)
    expect(t.writes[1]).toEqual(t.writes[0])
    expect(c.view().phase).toBe('accepted')
    expect(c.view().body).toBe('新草稿')
    await c.retryPendingOperation()
    expect(t.writes).toHaveLength(2)
  })
  it('24小時過期只查詢，列表核對後明確恢復草稿才能建立新操作', async () => {
    const t = recoverySetup()
    const c = createComposeController(t.ports)
    c.selectServer('UWOGL-US-01')
    c.setBody('原正文')
    await c.submitForm({ nickname: '航海者' })
    t.advance()
    await c.retryPendingOperation()
    expect(t.writes).toHaveLength(1)
    expect(c.view().pendingExpired).toBe(true)
    expect(c.restoreExpiredDraft()).toBe(false)
    await c.reviewExpiredOperation()
    expect(c.restoreExpiredDraft()).toBe(true)
    expect(c.view().phase).toBe('idle')
    expect(c.view().body).toBe('原正文')
    expect(t.stored?.pending).toBeUndefined()
    expect(t.writes).toHaveLength(1)
  })
  it.each(['saveProfile', 'uploadAvatar'] as const)(
    '%s 未確認也只重試原payload',
    async (action) => {
      const t = recoverySetup(action)
      const c = createComposeController(t.ports)
      c.setBody('保留草稿')
      if (action === 'uploadAvatar') c.selectAvatar('/tmp/a.png')
      await c.saveProfileOnly({ nickname: '新暱稱' })
      c.setNickname('後改暱稱')
      c.selectAvatar('/tmp/b.png')
      t.deliver()
      await c.retryPendingOperation()
      const attempts = t.writes.filter((row) => row.action === action)
      expect(attempts).toHaveLength(2)
      expect(attempts[1]).toEqual(attempts[0])
      expect(c.view().phase).toBe('profile-saved')
      expect(c.view().body).toBe('保留草稿')
    },
  )
})

it('服務端回報 operation-expired 時保留原操作，不能直接重新投稿', async () => {
  const t = recoverySetup()
  const original = t.ports.service.invoke
  let expired = false
  t.ports.service.invoke = async (action, input) => {
    if (expired && action === 'createMessage')
      throw new MessageBoardError('operation-expired', '操作已過期')
    return original(action, input)
  }
  const c = createComposeController(t.ports)
  c.selectServer('UWOGL-US-01')
  c.setBody('原正文')
  await c.submitForm({ nickname: '航海者' })
  const id = c.pendingOperationId()
  expired = true
  await c.retryPendingOperation()
  expect(c.view().phase).toBe('unconfirmed')
  expect(c.view().pendingExpired).toBe(true)
  expect(c.pendingOperationId()).toBe(id)
  expect(t.stored?.pending?.input.operationId).toBe(id)
})

it('確認資料保存後接續的首次留言失聯，不在同一重試動作內再送一次', async () => {
  const t = recoverySetup('saveProfile')
  const original = t.ports.service.invoke
  t.ports.service.invoke = async (action, input) => {
    if (action === 'getOperationResult')
      return {
        confirmed: true,
        result: { ...profile, nickName: '新暱稱', profileRevision: 2 },
      } as never
    if (action === 'createMessage') {
      t.writes.push({ action, input: structuredClone(input) })
      throw new MessageBoardError('unconfirmed', '接續投稿未確認')
    }
    return original(action, input)
  }
  const c = createComposeController(t.ports)
  c.selectServer('UWOGL-US-01')
  c.setBody('原正文')
  await c.submitForm({ nickname: '新暱稱' })
  await c.retryPendingOperation()
  expect(c.view().phase).toBe('unconfirmed')
  expect(t.writes.filter((row) => row.action === 'createMessage')).toHaveLength(1)
})

it.each(['saveProfile', 'uploadAvatar'] as const)(
  '過期 %s 回執只查收結果，不自動接續新寫入',
  async (action) => {
    const t = recoverySetup(action)
    const original = t.ports.service.invoke
    t.ports.service.invoke = async (name, input) => {
      if (name === 'getOperationResult')
        return {
          confirmed: true,
          result:
            action === 'saveProfile'
              ? { ...profile, nickName: '新暱稱', profileRevision: 2 }
              : { assetId: 'confirmed-asset' },
        } as never
      return original(name, input)
    }
    const c = createComposeController(t.ports)
    c.selectServer('UWOGL-US-01')
    c.setBody('原正文')
    if (action === 'uploadAvatar') c.selectAvatar('/tmp/a.png')
    await c.submitForm({ nickname: '新暱稱' })
    const before = structuredClone(t.writes)
    t.advance()
    await c.confirmPendingOperation()
    expect(t.writes).toEqual(before)
    expect(c.view().phase).toBe('unconfirmed')
    expect(c.view().body).toBe('原正文')
    expect(c.view().pendingExpired).toBe(true)
    if (action === 'saveProfile') expect(c.currentProfile()?.profileRevision).toBe(2)
    else expect(c.view().avatarAssetId).toBe('confirmed-asset')
    await c.reviewExpiredOperation()
    expect(c.restoreExpiredDraft()).toBe(true)
    expect(t.writes).toEqual(before)
  },
)

it('過期留言回執仍能確認已收件，並保留後寫草稿', async () => {
  const t = recoverySetup()
  const c = createComposeController(t.ports)
  c.selectServer('UWOGL-US-01')
  c.setBody('原正文')
  await c.submitForm({ nickname: '航海者' })
  c.setBody('新草稿')
  t.advance()
  t.confirm()
  await c.confirmPendingOperation()
  expect(c.view().phase).toBe('accepted')
  expect(c.view().body).toBe('新草稿')
  expect(t.stored?.pending).toBeUndefined()
  expect(t.writes).toHaveLength(1)
})

it.each(['saveProfile', 'uploadAvatar'] as const)(
  '%s 重試成功後接續編號失敗可恢復，且不再重發已接受操作',
  async (action) => {
    const t = recoverySetup(action)
    const originalId = t.ports.operationId
    let failNextId = false
    t.ports.operationId = async () => {
      if (failNextId) throw new Error('安全操作編號失敗')
      return originalId()
    }
    const c = createComposeController(t.ports)
    c.selectServer('UWOGL-US-01')
    c.setBody('原正文')
    if (action === 'uploadAvatar') c.selectAvatar('/tmp/a.png')
    await c.submitForm({ nickname: '新暱稱' })
    const pending = c.pendingOperationId()
    t.deliver()
    failNextId = true
    await expect(c.retryPendingOperation()).resolves.toBeUndefined()
    expect(c.view().phase).toBe('unconfirmed')
    expect(c.view().body).toBe('原正文')
    expect(c.pendingOperationId()).toBe(pending)
    expect(c.view().error).toContain('安全操作編號失敗')
    await expect(c.retryPendingOperation()).resolves.toBeUndefined()
    expect(t.writes.filter((row) => row.action === action)).toHaveLength(2)
    failNextId = false
    await c.confirmPendingOperation()
    expect(c.view().phase).toBe('accepted')
    expect(t.writes.filter((row) => row.action === action)).toHaveLength(2)
    expect(t.writes.filter((row) => row.action === 'createMessage')).toHaveLength(1)
  },
)

it('profile 重試已接受但接續草稿寫入失敗時，保留新草稿並可只恢復未開始的投稿', async () => {
  const t = recoverySetup('saveProfile')
  const write = t.ports.draft.write
  let failDraft = false
  t.ports.draft.write = (value) => {
    if (failDraft && value.pending) throw new Error('接續草稿寫入失敗')
    write(value)
  }
  const c = createComposeController(t.ports)
  c.selectServer('UWOGL-US-01')
  c.setBody('原正文')
  await c.submitForm({ nickname: '新暱稱' })
  c.setBody('等待時另寫的新草稿')
  t.deliver()
  failDraft = true
  await expect(c.retryPendingOperation()).resolves.toBeUndefined()
  expect(c.view().phase).toBe('unconfirmed')
  expect(c.view().error).toContain('接續草稿寫入失敗')
  expect(c.view().body).toBe('等待時另寫的新草稿')
  expect(t.stored?.body).toBe('等待時另寫的新草稿')
  expect(t.writes.filter((row) => row.action === 'createMessage')).toHaveLength(0)
  failDraft = false
  await c.retryPendingOperation()
  expect(c.view().phase).toBe('accepted')
  expect(c.view().body).toBe('等待時另寫的新草稿')
  expect(t.stored?.body).toBe('等待時另寫的新草稿')
  expect(t.stored?.pending).toBeUndefined()
  expect(t.writes.filter((row) => row.action === 'saveProfile')).toHaveLength(2)
  expect(t.writes.filter((row) => row.action === 'createMessage')).toHaveLength(1)
})

it.each(['saveProfile', 'uploadAvatar'] as const)(
  '%s 已完成但本地保存失敗不建立無pending的確認死路',
  async (action) => {
    const t = recoverySetup(action)
    const invoke = t.ports.service.invoke
    t.ports.service.invoke = async (name, input) => {
      const result = await invoke(name, input)
      if (name === 'saveProfile')
        return {
          ...result,
          avatarAssetId: (input as BoardInputs['saveProfile']).avatarAssetId,
        } as typeof result
      return result
    }
    const write = t.ports.draft.write
    let failDraft = false
    t.ports.draft.write = (value) => {
      if (failDraft) throw new Error('儲存空間不足')
      write(value)
    }
    const c = createComposeController(t.ports)
    c.setBody('保留正文')
    if (action === 'uploadAvatar') c.selectAvatar('/tmp/a.png')
    await c.saveProfileOnly({ nickname: '新暱稱' })
    t.deliver()
    failDraft = true
    await expect(c.retryPendingOperation()).resolves.toBeUndefined()
    expect(c.view().phase).toBe('profile-saved')
    expect(c.pendingOperationId()).toBeNull()
    expect(c.view().body).toBe('保留正文')
    expect(c.view().error).toContain('本機草稿儲存失敗')
    const writes = structuredClone(t.writes)
    failDraft = false
    await c.confirmPendingOperation()
    await c.retryPendingOperation()
    await c.saveProfileOnly({ nickname: '新暱稱' })
    expect(c.view().phase).toBe('profile-saved')
    expect(c.view().error).toBe('')
    expect(t.stored?.body).toBe('保留正文')
    expect(t.writes).toEqual(writes)
  },
)

it.each(['clear', 'save'] as const)(
  '留言已接受但本地%s失敗保留結果與正文，且不重送已接受留言',
  async (mode) => {
    const t = recoverySetup()
    const write = t.ports.draft.write
    const clear = t.ports.draft.clear
    let failDraft = false
    t.ports.draft.write = (value) => {
      if (failDraft && !value.pending) throw new Error('儲存空間不足')
      write(value)
    }
    t.ports.draft.clear = () => {
      if (failDraft) throw new Error('儲存空間不足')
      clear()
    }
    const c = createComposeController(t.ports)
    c.selectServer('UWOGL-US-01')
    c.setBody('原正文')
    await c.submitForm({ nickname: '航海者' })
    if (mode === 'save') c.setBody('後寫草稿')
    t.deliver()
    failDraft = true
    await expect(c.retryPendingOperation()).resolves.toBeUndefined()
    expect(c.view().phase).toBe('accepted')
    expect(c.view().received?.messageId).toBe(message.messageId)
    expect(c.pendingOperationId()).toBeNull()
    expect(c.view().body).toBe(mode === 'save' ? '後寫草稿' : '原正文')
    expect(c.view().error).toContain(mode === 'save' ? '本機草稿儲存失敗' : '本機草稿清除失敗')
    const writes = structuredClone(t.writes)
    failDraft = false
    await c.confirmPendingOperation()
    await c.retryPendingOperation()
    expect(t.writes).toEqual(writes)
    c.setBody('可繼續編輯的新草稿')
    expect(c.view().phase).toBe('idle')
    expect(t.stored?.body).toBe('可繼續編輯的新草稿')
  },
)
