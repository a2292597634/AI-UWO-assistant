import { existsSync, readFileSync, statSync } from 'node:fs'
import { createRequire } from 'node:module'
import { resolve } from 'node:path'
import { runInNewContext } from 'node:vm'
import ts from 'typescript'
import { describe, expect, it } from 'vitest'
import { loadCanonicalOfficers } from '../../tools/data-pipeline/load-officers'
import type {
  MaintenanceDictionaries,
  MaintenanceOfficerData,
  MaintenanceWorkOrderDraft,
} from '../../miniprogram/contracts/officer-maintenance'
import type { RuntimeDictionaries, RuntimeSkill } from '../../miniprogram/contracts/runtime-data'
import { validateMaintenanceDraft } from '../../miniprogram/domain/officer-maintenance'

const root = resolve(__dirname, '../..')
const indexPath = resolve(root, 'miniprogram/subpkg-maintenance/maintenance-officers.js')
type Snapshot = { dataVersion: string; data: MaintenanceOfficerData }
type Store = {
  getMaintenanceOfficer(id: string): Promise<Snapshot | null>
  getMaintenanceDictionaries(): Promise<MaintenanceDictionaries>
  getDictionaries(): RuntimeDictionaries
  getSkills(): Record<string, RuntimeSkill>
  getCatalog(): { id: string }[]
}

/** 執行真實 store；僅替代小程序分包載入邊界，檔案內容仍由生成產物提供。 */
const loadStore = (failFirst = false) => {
  const asyncPaths: string[] = []
  const cache = new Map<string, unknown>()
  const load = (file: string): unknown => {
    if (cache.has(file)) return cache.get(file)
    const localRequire = createRequire(file)
    const runtimeRequire = Object.assign(
      (specifier: string) => {
        const target = resolve(file, '..', `${specifier}.ts`)
        return existsSync(target) ? load(target) : localRequire(specifier)
      },
      {
        async: async (specifier: string) => {
          asyncPaths.push(specifier)
          if (failFirst && asyncPaths.length === 1) throw new Error('分包載入失敗')
          return localRequire(specifier)
        },
      },
    )
    const exports = {}
    cache.set(file, exports)
    runInNewContext(
      ts.transpileModule(readFileSync(file, 'utf8'), {
        compilerOptions: { target: ts.ScriptTarget.ES2020, module: ts.ModuleKind.CommonJS },
      }).outputText,
      { exports, require: runtimeRequire },
    )
    return exports
  }
  return {
    store: load(resolve(root, 'miniprogram/runtime/main-data-store.ts')) as Store,
    asyncPaths,
  }
}

describe('完整維護資料 store', () => {
  it('正式字典涵蓋全部 canonical 項目並校驗所有完整快照，且不改寫查詢字典', async () => {
    const { store } = loadStore()
    const displayBefore = JSON.stringify(store.getDictionaries())
    const dictionaries = await store.getMaintenanceDictionaries()
    const canonical = JSON.parse(
      readFileSync(resolve(root, 'data/master/dictionaries.json'), 'utf8'),
    ) as Record<string, { id: string; name: string }[]>
    for (const group of Object.keys(dictionaries) as (keyof MaintenanceDictionaries)[]) {
      expect(dictionaries[group]).toEqual(
        canonical[group]
          .map(({ id, name }) => ({ id, name }))
          .sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0)),
      )
      expect(Object.isFrozen(dictionaries[group])).toBe(true)
      expect(Object.isFrozen(dictionaries[group][0])).toBe(true)
    }
    const context = {
      dictionaries,
      skills: Object.values(store.getSkills()),
      officers: store.getCatalog(),
    }
    for (const officer of loadCanonicalOfficers(resolve(root, 'data/master'))) {
      const official = (await store.getMaintenanceOfficer(officer.id))!
      const draft: MaintenanceWorkOrderDraft = {
        operation: 'updateOfficer',
        targetOfficerId: officer.id,
        baseDataVersion: official.dataVersion,
        baseSnapshot: official.data,
        proposedData: { ...official.data, name: `${official.data.name}修改` },
        referenceCandidates: [],
      }
      expect(validateMaintenanceDraft(draft, context), officer.id).toEqual([])
    }
    expect(JSON.stringify(store.getDictionaries())).toBe(displayBefore)
    expect(store.getDictionaries().nationalities.some(({ id }) => id === 'ctn_swe')).toBe(true)
  })

  it('維護校驗拒絕四類去前綴展示 ID', async () => {
    const { store } = loadStore()
    const official = (await store.getMaintenanceOfficer('officer_chast089'))!
    const errors = validateMaintenanceDraft(
      {
        operation: 'updateOfficer',
        targetOfficerId: 'officer_chast089',
        baseDataVersion: official.dataVersion,
        baseSnapshot: official.data,
        proposedData: {
          ...official.data,
          nationalityId: 'ctn_swe',
          languages: [{ languageId: 'lang70', level: 5 }],
          recruitment: {
            ...official.data.recruitment,
            cityIds: ['town4105'],
            requirementId: 'reqchasT089',
          },
        },
        referenceCandidates: [],
      },
      {
        dictionaries: await store.getMaintenanceDictionaries(),
        skills: Object.values(store.getSkills()),
        officers: store.getCatalog(),
      },
    )
    expect(errors.map(({ field }) => field)).toEqual([
      'proposedData.nationalityId',
      'proposedData.languages[0].languageId',
      'proposedData.recruitment.cityIds[0]',
      'proposedData.recruitment.requirementId',
    ])
  })

  it('按需跨包載入並回傳每位正式及自訂航海士的完整欄位與版本', async () => {
    const { store, asyncPaths } = loadStore()
    expect(asyncPaths).toEqual([])
    expect(store).toHaveProperty('getMaintenanceOfficer')
    const { contentVersion } = JSON.parse(
      readFileSync(resolve(root, 'data/master/dataset.json'), 'utf8'),
    )
    for (const officer of loadCanonicalOfficers(resolve(root, 'data/master'))) {
      const expected = { ...officer } as Record<string, unknown>
      delete expected.id
      delete expected.sourceRefs
      expect(await store.getMaintenanceOfficer(officer.id)).toEqual({
        dataVersion: contentVersion,
        data: expected,
      })
    }
    expect(asyncPaths.length).toBeGreaterThan(0)
    expect(new Set(asyncPaths)).toEqual(new Set(['../subpkg-maintenance/maintenance-officers.js']))
  })

  it('未知 ID 與物件原型鍵都回傳 null', async () => {
    const { store } = loadStore()
    for (const id of ['', 'officer_missing', 'constructor', '__proto__', 'toString']) {
      expect(await store.getMaintenanceOfficer(id)).toBeNull()
    }
  })

  it('每層快照均不可變，變異嘗試不會污染後續讀取', async () => {
    const { store } = loadStore()
    const snapshot = (await store.getMaintenanceOfficer('officer_chast089'))!
    const expected = JSON.parse(JSON.stringify(snapshot))
    const assertFrozen = (value: unknown): void => {
      if (!value || typeof value !== 'object') return
      expect(Object.isFrozen(value)).toBe(true)
      for (const [key, nested] of Object.entries(value)) {
        expect(Reflect.set(value, key, '竄改')).toBe(false)
        assertFrozen(nested)
      }
    }
    assertFrozen(snapshot)
    expect(await store.getMaintenanceOfficer('officer_chast089')).toEqual(expected)
  })

  it('分包載入失敗向呼叫端回報且下一次可以重試', async () => {
    const { store } = loadStore(true)
    await expect(store.getMaintenanceOfficer('officer_chast089')).rejects.toThrow('分包載入失敗')
    expect(await store.getMaintenanceOfficer('officer_chast089')).not.toBeNull()
  })

  it('完整索引只在維護子包生成且不超出單包 2MiB 上限', () => {
    expect(existsSync(resolve(root, 'miniprogram/generated/maintenance-officers.js'))).toBe(false)
    expect(statSync(indexPath).size).toBeLessThan(2 * 1024 * 1024)
  })
})
