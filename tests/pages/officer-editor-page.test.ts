import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const ROOT = resolve(__dirname, '../..')
const readPageFile = (file: string): string =>
  readFileSync(resolve(ROOT, 'miniprogram/pages/officer-editor', file), 'utf8')

describe('航海士資料投稿頁契約', () => {
  it('使用兩步流程，移除舊的低頻與內部欄位', () => {
    const wxml = readPageFile('index.wxml')
    expect(wxml).toContain('stepLabels')
    expect(wxml).toContain('下一步：語言與技能')
    expect(wxml).toContain('招募資料（選填）')
    expect(wxml).not.toContain('Boss')
    expect(wxml).not.toContain('voyage.tw')
    expect(wxml).not.toContain('維護備註')
    expect(wxml).not.toContain('招募備註')
    expect(wxml).not.toContain('disclosure-section')
  })

  it('技能名稱只能從篩選後的 picker 選取，解鎖等級保留預設提示', () => {
    const wxml = readPageFile('index.wxml')
    expect(wxml).toContain('搜尋技能名稱')
    expect(wxml).toContain('range="{{item.filteredOptions}}"')
    expect(wxml).toContain('解鎖等級')
    expect(wxml).toContain('預設 Lv.1，可修改')
    expect(wxml).not.toContain('placeholder="輸入技能名稱')
  })

  it('明確展示正式版頭像限制與審核後發布流程', () => {
    const wxml = readPageFile('index.wxml')
    const wxss = readPageFile('index.wxss')
    expect(wxml).toContain('不超過 512 KB')
    expect(wxml).toContain('最長邊不超過 512 px')
    expect(readPageFile('index.ts')).toContain("imageTypeName === 'jpg'")
    expect(wxml).toContain('提交後狀態為「待審核」')
    expect(wxml).toContain('portraitFileId')
    expect(wxss).toContain('var(--uwo-color-canvas)')
    expect(wxss).toContain('var(--uwo-color-surface)')
    expect(wxss).toMatch(/min-height\s*:\s*88rpx/)
    expect(wxss).toContain('env(safe-area-inset-bottom)')
    expect(wxss).toMatch(/overflow-wrap\s*:\s*anywhere/)
    expect(wxss).not.toMatch(/#[0-9a-f]{3,8}\b|(?:rgb|hsl)a?\s*\(/i)
  })
})
