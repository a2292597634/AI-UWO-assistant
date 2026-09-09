import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const ROOT = resolve(__dirname, '../..')
const COMPONENT_PATH = 'miniprogram/components/entity-search-picker'

const readComponentFile = (filename: string): string => {
  const filepath = resolve(ROOT, COMPONENT_PATH, filename)
  expect(existsSync(filepath), `${COMPONENT_PATH}/${filename} 應存在`).toBe(true)
  return existsSync(filepath) ? readFileSync(filepath, 'utf8') : ''
}

describe('實體搜尋選擇器元件', () => {
  it('提供微信原生元件的四件必要文件', () => {
    for (const filename of ['index.json', 'index.ts', 'index.wxml', 'index.wxss']) {
      readComponentFile(filename)
    }

    expect(JSON.parse(readComponentFile('index.json'))).toMatchObject({ component: true })
  })

  it('以既有 Presenter 搜尋選項，並只接受選項與選取狀態作為資料來源', () => {
    const script = readComponentFile('index.ts')

    expect(script).toContain("from '../../presenters/maintenance-option-presenter'")
    expect(script).toContain('searchMaintenanceOptions')
    for (const property of ['options', 'selectedIds', 'allowCandidate', 'label']) {
      expect(script).toMatch(new RegExp(`\\b${property}\\s*:`))
    }
    expect(script).not.toMatch(/(?:create|generate)[A-Z_a-z]*Id/)
  })

  it('提供搜尋、選取、移除與建立候選項的可見操作語義', () => {
    const wxml = readComponentFile('index.wxml')

    expect(wxml).toContain('bindinput="onQueryInput"')
    expect(wxml).toContain('bindtap="onSelect"')
    expect(wxml).toContain('bindtap="onRemove"')
    expect(wxml).toContain('bindtap="onCreateCandidate"')
    expect(wxml).toContain('{{item.name}}')
    expect(wxml).toContain('{{item.meta}}')
    expect(wxml).toContain('沒有符合的選項')
    expect(wxml).toContain('allowCandidate')
  })

  it('將選取、移除與候選項草稿事件交回父表單', () => {
    const script = readComponentFile('index.ts')

    expect(script).toMatch(/triggerEvent\(\s*['"]select['"]\s*,\s*\{\s*id\s*\}/)
    expect(script).toMatch(/triggerEvent\(\s*['"]remove['"]\s*,\s*\{\s*id\s*\}/)
    expect(script).toMatch(/triggerEvent\(\s*['"]createcandidate['"]\s*,\s*\{\s*name\s*\}/)
  })

  it('遵守 Design Foundation 的表面色彩、88rpx 熱區與長文字規範', () => {
    const wxss = readComponentFile('index.wxss')

    expect(wxss).toContain('var(--uwo-color-surface)')
    expect(wxss).toMatch(/min-height\s*:\s*88rpx/)
    expect(wxss).toContain('var(--uwo-font-size-body)')
    expect(wxss).toContain('var(--uwo-radius-control)')
    expect(wxss).toMatch(/overflow-wrap\s*:\s*anywhere/)
  })
})
