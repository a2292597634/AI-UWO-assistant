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
  RuntimeDictionaries,
  RuntimeDatasetMeta,
} from '../contracts/runtime-data'
import { getOfficerSubmissionService } from './officer-editor-service'
import type {
  MaintenanceDictionaries,
  MaintenanceOfficerData,
} from '../contracts/officer-maintenance'

// eslint-disable-next-line @typescript-eslint/no-require-imports
const _catalog = require('../generated/catalog') as RuntimeCatalogEntry[]
// eslint-disable-next-line @typescript-eslint/no-require-imports
const _skills = require('../generated/skills') as Record<string, RuntimeSkill>
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

export function getDictionaries(): RuntimeDictionaries {
  return _dicts
}

interface MaintenanceOfficerIndex {
  dataVersion: string
  dictionaries: MaintenanceDictionaries
  officers: Record<string, MaintenanceOfficerData>
}

/** 遞迴凍結獨立快照，避免呼叫端改寫修改工單的正式基準。 */
const freezeMaintenanceSnapshot = <T>(value: T): T => {
  if (value !== null && typeof value === 'object') {
    Object.values(value).forEach(freezeMaintenanceSnapshot)
    Object.freeze(value)
  }
  return value
}

/** 讀取 canonical 正式 ID 字典，供維護選項與校驗共同使用。 */
export async function getMaintenanceDictionaries(): Promise<MaintenanceDictionaries> {
  const index = (await require.async(
    '../subpkg-maintenance/maintenance-officers.js',
  )) as MaintenanceOfficerIndex
  return freezeMaintenanceSnapshot(
    JSON.parse(JSON.stringify(index.dictionaries)) as MaintenanceDictionaries,
  )
}

/** 按需讀取維護子包的完整正式資料；分包載入錯誤交由頁面呈現及重試。 */
export async function getMaintenanceOfficer(
  targetOfficerId: string,
): Promise<{ readonly dataVersion: string; readonly data: MaintenanceOfficerData } | null> {
  const index = (await require.async(
    '../subpkg-maintenance/maintenance-officers.js',
  )) as MaintenanceOfficerIndex
  if (!Object.prototype.hasOwnProperty.call(index.officers, targetOfficerId)) return null
  return freezeMaintenanceSnapshot({
    dataVersion: index.dataVersion,
    data: JSON.parse(JSON.stringify(index.officers[targetOfficerId])) as MaintenanceOfficerData,
  })
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
 * 从 CloudBase 刷新自定义航海士缓存。
 * 服务端只返回 published 记录；pending、approved、rejected 永远不进入 runtime 缓存。
 * 在有网络时调用，离线时保留旧缓存。
 */
export async function refreshCustomOfficers(): Promise<void> {
  try {
    const officers = await getOfficerSubmissionService().listPublishedCustomOfficers()
    _customOfficers = [...officers]
    saveCachedCustomOfficers(_customOfficers)
  } catch {
    // 离线时使用缓存，不报错
  }
}
