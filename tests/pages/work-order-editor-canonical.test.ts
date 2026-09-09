import { existsSync, readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { resolve } from 'node:path'
import { runInNewContext } from 'node:vm'
import ts from 'typescript'
import { describe, expect, it } from 'vitest'
import type { MaintenanceWorkOrderDraft } from '../../miniprogram/contracts/officer-maintenance'

interface EditorPage {
  data: {
    loadError: string
    error: string
    options: Record<string, { id: string; name: string }[]>
    languageRows: { id: string; name: string }[]
  }
  setData(update: Record<string, unknown>): void
  onLoad(query: Record<string, string>): Promise<void>
  onFieldInput(event: unknown): void
  onSaveDraft(): Promise<void>
}

/** 執行真實頁面、資料 store 與校驗器，僅替代小程序平台及雲函數邊界。 */
const loadEditor = () => {
  let page: EditorPage
  const saved: MaintenanceWorkOrderDraft[] = []
  const cache = new Map<string, unknown>()
  const load = (file: string): unknown => {
    if (cache.has(file)) return cache.get(file)
    const localRequire = createRequire(file)
    const runtimeRequire = Object.assign(
      (specifier: string) => {
        const target = resolve(file, '..', `${specifier}.ts`)
        return existsSync(target) ? load(target) : localRequire(specifier)
      },
      { async: async (specifier: string) => localRequire(specifier) },
    )
    const exports = {}
    cache.set(file, exports)
    runInNewContext(
      ts.transpileModule(readFileSync(file, 'utf8'), {
        compilerOptions: { target: ts.ScriptTarget.ES2020, module: ts.ModuleKind.CommonJS },
      }).outputText,
      {
        exports,
        require: runtimeRequire,
        Page: (definition: EditorPage) => {
          page = {
            ...definition,
            data: structuredClone(definition.data),
            setData(update) {
              Object.assign(this.data, update)
            },
          }
        },
        wx: {
          setNavigationBarTitle() {},
          cloud: {
            async callFunction({ data }: { data: MaintenanceWorkOrderDraft }) {
              saved.push(data)
              return {
                result: {
                  ok: true,
                  data: {
                    ...data,
                    status: 'draft',
                    workOrderId: 'wo-real',
                    revision: 1,
                    updatedAt: 'now',
                  },
                },
              }
            },
          },
        },
      },
    )
    return exports
  }
  load(resolve(__dirname, '../../miniprogram/subpkg-maintenance/pages/work-order-editor/index.ts'))
  return { page: page!, saved }
}

describe('正式資料維護編輯器整合', () => {
  it('完整正式快照修改名稱後可保存，四類關聯前綴 ID 完整保留', async () => {
    const { page, saved } = loadEditor()
    await page.onLoad({ targetOfficerId: 'officer_chast089' })
    expect(page.data.loadError).toBe('')
    page.onFieldInput({
      currentTarget: { dataset: { field: 'name' } },
      detail: { value: '修改名稱' },
    })
    await page.onSaveDraft()
    expect(page.data.error).toBe('')
    expect(saved).toHaveLength(1)
    expect(saved[0].baseSnapshot?.name).toBe('達納·卡洛斯')
    expect(saved[0].proposedData).toMatchObject({
      name: '修改名稱',
      nationalityId: 'nationality_ctn_swe',
      languages: [
        { languageId: 'language_lang70', level: 5 },
        { languageId: 'language_lang80', level: 3 },
      ],
      recruitment: {
        cityIds: [
          'city_town4105',
          'city_town10105',
          'city_town5303',
          'city_town6301',
          'city_town14205',
        ],
        requirementId: 'requirement_reqchasT089',
      },
    })
  })

  it('正式前綴 ID 可在同一份選項字典匹配國家、語言、城市及招募條件名稱', async () => {
    const { page } = loadEditor()
    await page.onLoad({ targetOfficerId: 'officer_chast089' })
    for (const [kind, id, name] of [
      ['nationality', 'nationality_ctn_swe', '瑞典'],
      ['language', 'language_lang70', '瑞典語'],
      ['city', 'city_town4105', '科科拉'],
      ['requirement', 'requirement_reqchasT089', '維托里奧·薩托里編年史中獲得'],
    ]) {
      expect(page.data.options[kind].find((item) => item.id === id)?.name).toBe(name)
    }
    expect(page.data.languageRows[0]).toMatchObject({ id: 'language_lang70', name: '瑞典語' })
  })
})
