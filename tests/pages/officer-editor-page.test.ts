import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const ROOT = resolve(__dirname, '../..')
const readPageFile = (file: string): string =>
  readFileSync(resolve(ROOT, 'miniprogram/pages/officer-editor', file), 'utf8')

describe('航海士資料錯誤回報頁契約', () => {
  it('只收集既有航海士的錯誤回報，不再建立完整航海士', () => {
    const wxml = readPageFile('index.wxml')
    expect(wxml).toContain('回報資料錯誤')
    expect(wxml).toContain('選擇航海士')
    expect(wxml).toContain('錯誤類型')
    expect(wxml).toContain('錯誤說明')
    expect(wxml).toContain('建議的正確內容')
    expect(wxml).not.toContain('新增航海士')
    expect(wxml).not.toContain('技能等級')
    expect(wxml).not.toContain('解鎖等級')
  })

  it('來源網址與最多三張截圖明確標示為選填', () => {
    const wxml = readPageFile('index.wxml')
    expect(wxml).toContain('來源網址（選填）')
    expect(wxml).toContain('證據截圖（選填）')
    expect(wxml).toContain('最多 3 張')
    expect(wxml).toContain('提供來源可加快確認')
  })

  it('使用既有 Design Foundation 並保留安全區', () => {
    const wxml = readPageFile('index.wxml')
    const wxss = readPageFile('index.wxss')
    expect(wxml).toContain('提交回報')
    expect(wxss).toContain('var(--uwo-color-canvas)')
    expect(wxss).toContain('var(--uwo-color-surface)')
    expect(wxss).toMatch(/min-height\s*:\s*88rpx/)
    expect(wxss).toContain('env(safe-area-inset-bottom)')
    expect(wxss).toMatch(/overflow-wrap\s*:\s*anywhere/)
    expect(wxss).not.toMatch(/#[0-9a-f]{3,8}\b|(?:rgb|hsl)a?\s*\(/i)
  })

  it('從 query 帶入航海士並透過錯誤回報服務提交', () => {
    const ts = readPageFile('index.ts')
    expect(ts).toContain('query?.officerId')
    expect(ts).toContain('validateOfficerErrorReportDraft')
    expect(ts).toContain('getOfficerErrorReportService()')
    expect(ts).toContain('uploadScreenshots')
  })
})
