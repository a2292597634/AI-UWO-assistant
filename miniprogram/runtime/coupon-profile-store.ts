import {
  COUPON_PROFILE_STORAGE_KEY,
  GAME_SERVERS,
  MAX_COUPON_PROFILE_NAME_LENGTH,
  MAX_COUPON_PROFILES,
  MAX_COUPON_USER_NAME_LENGTH,
  type CouponProfile,
  type CouponProfileInput,
  type CouponProfileStore,
  type GameServerId,
} from '../contracts/coupon-redemption'

export interface SyncStorage {
  getStorageSync(key: string): unknown
  setStorageSync(key: string, value: unknown): void
}

export interface CouponProfileStoreService {
  load(): CouponProfileStore
  saveProfile(input: CouponProfileInput): CouponProfileStore
  updateProfile(id: string, input: CouponProfileInput): CouponProfileStore
  deleteProfile(id: string): CouponProfileStore
  setActiveProfile(id: string): CouponProfileStore
}

export class CouponProfileStoreError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'CouponProfileStoreError'
  }
}

const validServerIds = new Set<string>(GAME_SERVERS.map(({ id }) => id))

const emptyStore = (): CouponProfileStore => ({ profiles: [], activeProfileId: null })

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

const isNonEmptyString = (value: unknown, maxLength: number): value is string =>
  typeof value === 'string' && value.trim().length > 0 && [...value.trim()].length <= maxLength

const isValidServerId = (value: unknown): value is GameServerId =>
  typeof value === 'string' && validServerIds.has(value)

const isValidProfile = (value: unknown): value is CouponProfile => {
  if (!isRecord(value)) return false
  return (
    isNonEmptyString(value.id, 100) &&
    isNonEmptyString(value.name, MAX_COUPON_PROFILE_NAME_LENGTH) &&
    isValidServerId(value.gameServerId) &&
    isNonEmptyString(value.userNo, MAX_COUPON_USER_NAME_LENGTH)
  )
}

const parseStore = (value: unknown): CouponProfileStore => {
  if (typeof value === 'string') {
    try {
      value = JSON.parse(value) as unknown
    } catch {
      return emptyStore()
    }
  }

  if (!isRecord(value) || !Array.isArray(value.profiles) || !isValidProfileStoreId(value)) {
    return emptyStore()
  }

  const profiles = value.profiles
  if (
    profiles.length > MAX_COUPON_PROFILES ||
    !profiles.every(isValidProfile) ||
    new Set(profiles.map((profile) => profile.id)).size !== profiles.length
  ) {
    return emptyStore()
  }

  if (value.activeProfileId !== null && typeof value.activeProfileId !== 'string') {
    return emptyStore()
  }
  if (value.activeProfileId !== null && !profiles.some(({ id }) => id === value.activeProfileId)) {
    return emptyStore()
  }

  return {
    profiles: profiles.map((profile) => ({
      id: profile.id,
      name: profile.name.trim(),
      gameServerId: profile.gameServerId,
      userNo: profile.userNo.trim(),
    })),
    activeProfileId: value.activeProfileId,
  }
}

const isValidProfileStoreId = (value: Record<string, unknown>): boolean =>
  value.activeProfileId === null || typeof value.activeProfileId === 'string'

const serialize = (store: CouponProfileStore): string => JSON.stringify(store)

const normalizeInput = (input: CouponProfileInput): CouponProfileInput => {
  const name = typeof input.name === 'string' ? input.name.trim() : ''
  const userNo = typeof input.userNo === 'string' ? input.userNo.trim() : ''
  if (!isNonEmptyString(name, MAX_COUPON_PROFILE_NAME_LENGTH)) {
    throw new CouponProfileStoreError('設定名稱不可為空，且不得超過 30 個字元。')
  }
  if (!isValidServerId(input.gameServerId)) {
    throw new CouponProfileStoreError('請選擇有效的伺服器。')
  }
  if (!isNonEmptyString(userNo, MAX_COUPON_USER_NAME_LENGTH)) {
    throw new CouponProfileStoreError('遊戲內暱稱不可為空，且不得超過 100 個字元。')
  }
  return { name, gameServerId: input.gameServerId, userNo }
}

const createProfileId = (): string =>
  `coupon-profile-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`

export const createCouponProfileStore = (storage: SyncStorage): CouponProfileStoreService => {
  const persist = (store: CouponProfileStore): CouponProfileStore => {
    storage.setStorageSync(COUPON_PROFILE_STORAGE_KEY, serialize(store))
    return store
  }

  return {
    load(): CouponProfileStore {
      return parseStore(storage.getStorageSync(COUPON_PROFILE_STORAGE_KEY))
    },

    saveProfile(input: CouponProfileInput): CouponProfileStore {
      const current = this.load()
      if (current.profiles.length >= MAX_COUPON_PROFILES) {
        throw new CouponProfileStoreError('最多保存 10 組玩家設定。')
      }
      const profile: CouponProfile = { id: createProfileId(), ...normalizeInput(input) }
      return persist({
        profiles: [...current.profiles, profile],
        activeProfileId: current.activeProfileId ?? profile.id,
      })
    },

    updateProfile(id: string, input: CouponProfileInput): CouponProfileStore {
      const current = this.load()
      if (!current.profiles.some((profile) => profile.id === id)) {
        throw new CouponProfileStoreError('找不到要編輯的玩家設定。')
      }
      const normalized = normalizeInput(input)
      return persist({
        profiles: current.profiles.map((profile) =>
          profile.id === id ? { id, ...normalized } : profile,
        ),
        activeProfileId: current.activeProfileId,
      })
    },

    deleteProfile(id: string): CouponProfileStore {
      const current = this.load()
      const profiles = current.profiles.filter((profile) => profile.id !== id)
      if (profiles.length === current.profiles.length) {
        throw new CouponProfileStoreError('找不到要刪除的玩家設定。')
      }
      const activeProfileId =
        current.activeProfileId === id ? (profiles[0]?.id ?? null) : current.activeProfileId
      return persist({ profiles, activeProfileId })
    },

    setActiveProfile(id: string): CouponProfileStore {
      const current = this.load()
      if (!current.profiles.some((profile) => profile.id === id)) {
        throw new CouponProfileStoreError('找不到要使用的玩家設定。')
      }
      return persist({ ...current, activeProfileId: id })
    },
  }
}
