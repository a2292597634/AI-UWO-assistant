import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const ROOT = resolve(__dirname, '../../miniprogram/subpkg-maintenance/pages/modify-officer')

const readPageFile = (filename: string): string => {
  const filepath = resolve(ROOT, filename)
  expect(existsSync(filepath), `修改頁缺少 ${filename}`).toBe(true)
  return existsSync(filepath) ? readFileSync(filepath, 'utf8') : ''
}

describe('修改既有航海士獨立入口', () => {
  it('建立完整頁面檔案與可搜尋選擇器', () => {
    const json = JSON.parse(readPageFile('index.json')) as {
      usingComponents?: Record<string, string>
    }
    const wxml = readPageFile('index.wxml')

    expect(json.usingComponents?.['entity-search-picker']).toBe(
      '/components/entity-search-picker/index',
    )
    expect(wxml).toContain('entity-search-picker')
    expect(wxml).toContain('selectedOfficerIds')
    expect(wxml).toContain('onStartModify')
  })

  it('以 targetOfficerId 進入既有編輯器，不允許輸入新正式 ID', () => {
    const script = readPageFile('index.ts')

    expect(script).toContain('targetOfficerId')
    expect(script).toContain('/subpkg-maintenance/pages/work-order-editor/index?targetOfficerId=')
    expect(script).not.toMatch(/create[A-Z_a-z]*Id|generate[A-Z_a-z]*Id/)
  })

  it('使用 Design Foundation 的安全區與按鈕熱區樣式', () => {
    const wxss = readPageFile('index.wxss')

    expect(wxss).toContain('env(safe-area-inset-bottom)')
    expect(wxss).toContain('var(--uwo-font-size-page-title)')
    expect(wxss).toContain('var(--uwo-radius-card)')
  })
})
