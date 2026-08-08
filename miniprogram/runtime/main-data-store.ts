/**
 * Main Data Store
 *
 * The ONLY module in the main package allowed to require() generated runtime
 * data files. All pages and presenters must go through this store — never
 * directly read miniprogram/generated/.
 */

import type {
  RuntimeCatalogEntry,
  RuntimeSkill,
  RuntimeFleetOfficer,
  RuntimeDictionaries,
  RuntimeDatasetMeta,
} from '../contracts/runtime-data'

// eslint-disable-next-line @typescript-eslint/no-require-imports
const _catalog = require('../generated/catalog') as RuntimeCatalogEntry[]
// eslint-disable-next-line @typescript-eslint/no-require-imports
const _skills = require('../generated/skills') as Record<string, RuntimeSkill>
// eslint-disable-next-line @typescript-eslint/no-require-imports
const _fleetOfficers = require('../generated/fleet-officers') as RuntimeFleetOfficer[]
// eslint-disable-next-line @typescript-eslint/no-require-imports
const _dicts = require('../generated/dictionaries') as RuntimeDictionaries
// eslint-disable-next-line @typescript-eslint/no-require-imports
const _meta = require('../generated/dataset-meta') as RuntimeDatasetMeta

export function getDatasetMeta(): RuntimeDatasetMeta {
  return _meta
}

export function getCatalog(): readonly RuntimeCatalogEntry[] {
  return _catalog
}

export function getSkills(): Readonly<Record<string, RuntimeSkill>> {
  return _skills
}

export function getFleetOfficers(): readonly RuntimeFleetOfficer[] {
  return _fleetOfficers
}

export function getDictionaries(): RuntimeDictionaries {
  return _dicts
}

// ── 自定义航海士（从 CloudBase 运行时加载） ──

const CUSTOM_OFFICERS_STORAGE_KEY = 'custom_officers_cache'

let _customOfficers: Record<string, unknown>[] | null = null

/** 从 wx.storage 加载缓存的自定义航海士 */
function loadCachedCustomOfficers(): Record<string, unknown>[] {
  try {
    const raw = wx.getStorageSync(CUSTOM_OFFICERS_STORAGE_KEY)
    if (typeof raw === 'string') {
      const parsed = JSON.parse(raw)
      if (Array.isArray(parsed)) return parsed
    }
  } catch {
    // 缓存无效，忽略
  }
  return []
}

/** 将自定义航海士缓存到 wx.storage */
function saveCachedCustomOfficers(officers: Record<string, unknown>[]): void {
  try {
    wx.setStorageSync(CUSTOM_OFFICERS_STORAGE_KEY, JSON.stringify(officers))
  } catch {
    // 静默失败
  }
}

/**
 * 获取所有自定义航海士的 CanonicalOfficer 数据。
 * 优先返回缓存，首次调用时从 wx.storage 加载。
 */
export function getCustomOfficers(): Record<string, unknown>[] {
  if (_customOfficers === null) {
    _customOfficers = loadCachedCustomOfficers()
  }
  return _customOfficers
}

/**
 * 添加一个新自定义航海士到本地缓存。
 * 提交成功后调用此函数，无需重新拉取 CloudBase。
 */
export function addCachedCustomOfficer(
  officerId: string,
  canonicalData: Record<string, unknown>,
): void {
  if (_customOfficers === null) {
    _customOfficers = loadCachedCustomOfficers()
  }
  // 避免重复
  const existingIdx = _customOfficers.findIndex(
    (o) => (o as Record<string, unknown>).id === officerId,
  )
  if (existingIdx >= 0) {
    _customOfficers[existingIdx] = canonicalData
  } else {
    _customOfficers.push(canonicalData)
  }
  saveCachedCustomOfficers(_customOfficers)
}

/**
 * 从 CloudBase 刷新自定义航海士缓存。
 * 在有网络时调用，离线时保留旧缓存。
 */
export async function refreshCustomOfficers(): Promise<void> {
  try {
    const response = await wx.cloud.callFunction({
      name: 'officer-custom',
      data: { action: 'listCustom' },
    })
    const result = response.result as {
      ok?: boolean
      data?: { officers?: Record<string, unknown>[] }
    }
    if (result?.ok && result?.data?.officers) {
      _customOfficers = result.data.officers
      saveCachedCustomOfficers(_customOfficers)
    }
  } catch {
    // 离线时使用缓存，不报错
  }
}
