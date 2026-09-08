import { beforeEach, describe, expect, it } from 'vitest'
import {
  createCouponProfileStore,
  type SyncStorage,
} from '../../miniprogram/runtime/coupon-profile-store'

const profileInput = (name: string) => ({
  name,
  gameServerId: 'UWOGL-US-01' as const,
  userNo: '航海家',
})

const createMemoryStorage = (): SyncStorage & { value: unknown } => ({
  value: undefined,
  getStorageSync() {
    return this.value
  },
  setStorageSync(_key, value) {
    this.value = value
  },
})

describe('本機兌換設定儲存', () => {
  let memoryStorage: ReturnType<typeof createMemoryStorage>

  beforeEach(() => {
    memoryStorage = createMemoryStorage()
  })

  it('新增第 11 組設定時拒絕且不覆寫既有設定', () => {
    const store = createCouponProfileStore(memoryStorage)
    for (let index = 0; index < 10; index += 1) {
      store.saveProfile(profileInput(`設定${index}`))
    }

    expect(() => store.saveProfile(profileInput('超額'))).toThrow('最多保存 10 組')
    expect(store.load().profiles).toHaveLength(10)
  })

  it('刪除目前設定時改選第一組剩餘設定', () => {
    const store = createCouponProfileStore(memoryStorage)
    const first = store.saveProfile(profileInput('第一組')).profiles[0]!
    const second = store.saveProfile(profileInput('第二組')).profiles[1]!

    store.setActiveProfile(second.id)

    expect(store.deleteProfile(second.id).activeProfileId).toBe(first.id)
  })

  it('編輯既有設定時保留 ID 並只更新設定欄位', () => {
    const store = createCouponProfileStore(memoryStorage)
    const saved = store.saveProfile(profileInput('舊名稱')).profiles[0]!

    const updated = store.updateProfile(saved.id, profileInput('新名稱'))

    expect(updated.profiles).toEqual([
      expect.objectContaining({ id: saved.id, name: '新名稱', userNo: '航海家' }),
    ])
  })

  it('遇到破損的本機資料時回復為空設定', () => {
    memoryStorage.value = { profiles: [{ id: 42 }], activeProfileId: 'bad' }

    expect(createCouponProfileStore(memoryStorage).load()).toEqual({
      profiles: [],
      activeProfileId: null,
    })
  })
})
