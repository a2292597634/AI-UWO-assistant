import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const ROOT = resolve(__dirname, '../..')
const readPageFile = (file: string): string =>
  readFileSync(resolve(ROOT, 'miniprogram/pages/officer-editor', file), 'utf8')

describe('航海士資料錯誤回報頁契約', () => {
  it('使用單一搜尋框與帶稀有度分層頭像的候選列表', () => {
    const wxml = readPageFile('index.wxml')
    const config = JSON.parse(readPageFile('index.json'))
    expect(wxml).toContain('bindinput="onOfficerSearchInput"')
    expect(wxml).toContain('wx:for="{{officerCandidates}}"')
    expect(wxml).toContain('item.visuals.framePath')
    expect(wxml).toContain('item.visuals.rarityIconPath')
    expect(wxml).not.toContain('<entity-search-picker')
    expect(config.usingComponents).not.toHaveProperty('entity-search-picker')
  })

  it('身份卡使用左上稀有度圖示並把更換放在右上角', () => {
    const wxml = readPageFile('index.wxml')
    const wxss = readPageFile('index.wxss')
    expect(wxml).toContain('officerIdentity.visuals.framePath')
    expect(wxml).toContain('officerIdentity.visuals.rarityIconPath')
    expect(wxml).toContain('data-layer="rarityIcon"')
    expect(wxml).toContain('class="officer-identity__change"')
    expect(wxml).not.toContain('class="officer-identity__rarity"')
    expect(wxss).toMatch(/\.officer-identity__body\s*\{[^}]*min-width:\s*0/s)
    expect(wxss).toMatch(/\.officer-identity__change\s*\{[^}]*position:\s*absolute/s)
    expect(wxss).toMatch(
      /\.officer-identity__change\s*\{[^}]*background:\s*var\(--uwo-color-surface-muted\)/s,
    )
    expect(wxss).toMatch(/\.officer-identity__rarity-icon\s*\{[^}]*top:\s*4rpx[^}]*left:\s*4rpx/s)
  })

  it('更換按鈕固定尺寸並保留邊框，避免壓住航海士文字', () => {
    const wxss = readPageFile('index.wxss')
    expect(wxss).toMatch(/\.officer-identity\s*\{[^}]*display:\s*flex/s)
    expect(wxss).toMatch(/\.officer-identity__body\s*\{[^}]*flex:\s*1/s)
    expect(wxss).toMatch(/\.officer-identity__body\s*\{[^}]*padding-right:\s*0/s)
    expect(wxss).toMatch(/\.officer-identity__change\s*\{[^}]*position:\s*absolute/s)
    expect(wxss).toMatch(/\.officer-identity__change\s*\{[^}]*width:\s*128rpx\s*!important/s)
    expect(wxss).toMatch(/\.officer-identity__change\s*\{[^}]*max-width:\s*128rpx/s)
    expect(wxss).toMatch(/\.officer-identity__change\s*\{[^}]*padding:\s*0/s)
    expect(wxss).toMatch(
      /\.officer-identity__change\s*\{[^}]*border:\s*2rpx solid var\(--uwo-color-border-strong\)/s,
    )
    expect(wxss).toMatch(/\.officer-identity__change::after\s*\{[^}]*border:\s*0/s)
  })

  it('所有回報字段位於單一表單容器並提供字段級回饋', () => {
    const wxml = readPageFile('index.wxml')
    expect(wxml.match(/class="report-form"/g)).toHaveLength(1)
    expect(wxml).toContain('id="field-errorTypes"')
    expect(wxml).toContain('id="field-description"')
    expect(wxml).toContain('id="field-suggestedCorrection"')
    expect(wxml).toContain('fieldErrors.errorTypes')
    expect(wxml).toContain('fieldErrors.description')
    expect(wxml).toContain('fieldErrors.suggestedCorrection')
    expect(wxml).toContain('{{descriptionCount}} / 500')
    expect(wxml).toContain('{{correctionCount}} / 500')
    expect(wxml).toContain('maxlength="500"')
  })

  it('證據區以整行入口收合並提供截圖移除名稱', () => {
    const wxml = readPageFile('index.wxml')
    expect(wxml).toContain('bindtap="onToggleEvidence"')
    expect(wxml).toContain('aria-expanded="{{evidenceExpanded}}"')
    expect(wxml).toContain('{{evidenceSummary}}')
    expect(wxml).toContain('wx:if="{{evidenceExpanded}}"')
    expect(wxml).toContain('補充證據（選填）')
    expect(wxml).toContain('來源網址或最多 3 張截圖')
    expect(wxml).toContain('aria-label="移除第 {{index + 1}} 張證據截圖"')
    expect(wxml).toContain('最多 3 張')
  })

  it('提交區呈現失敗、提交中及成功後續操作', () => {
    const wxml = readPageFile('index.wxml')
    expect(wxml).toContain('wx:if="{{submittedReportId}}"')
    expect(wxml).toContain('回報已提交')
    expect(wxml).toContain('回報編號')
    expect(wxml).toContain('{{submittedReportId}}')
    expect(wxml).toContain('查看我的回報')
    expect(wxml).toContain("{{returnToOfficerId ? '返回航海士詳情' : '返回名鑑'}}")
    expect(wxml).toContain("{{submitting ? '正在提交回報…' : '提交回報'}}")
    expect(wxml).toContain('{{submitError}}')
  })

  it('樣式只使用 Design Foundation Token 並保護窄屏與觸控尺寸', () => {
    const wxss = readPageFile('index.wxss')
    expect(wxss).toContain('.report-form')
    expect(wxss).toContain('border-top: 2rpx solid var(--uwo-color-border-subtle)')
    expect(wxss).toContain('var(--uwo-color-surface-muted)')
    expect(wxss).toContain('var(--uwo-color-ink)')
    expect(wxss).toContain('var(--uwo-radius-card)')
    expect(wxss).toMatch(/min-height\s*:\s*88rpx/)
    expect(wxss).toContain('env(safe-area-inset-bottom)')
    expect(wxss).toContain('overflow-wrap: anywhere')
    expect(wxss).toContain('min-width: 0')
    expect(wxss).not.toMatch(/#[0-9a-f]{3,8}\b|(?:rgb|hsl)a?\s*\(/i)
  })

  it('頁面配置移除搜尋組件並使用資料勘誤導航標題', () => {
    const config = JSON.parse(readPageFile('index.json')) as {
      navigationBarTitleText: string
      usingComponents: Record<string, string>
    }
    expect(config.navigationBarTitleText).toBe('資料勘誤')
    expect(config.usingComponents).toEqual({})
  })

  it('標題、整行回報入口與固定提交欄保持可理解且不浪費窄屏寬度', () => {
    const wxml = readPageFile('index.wxml')
    const wxss = readPageFile('index.wxss')
    expect(wxml).toContain('回報航海士資料錯誤')
    expect(wxml).toContain('查看我的回報與處理進度')
    expect(wxml).toContain('class="report-actions"')
    expect(wxss).toMatch(/\.report-header__entry\s*\{[^}]*display:\s*flex[^}]*width:\s*100%/s)
    expect(wxss).toMatch(/\.type-chip\s*\{[^}]*min-height:\s*64rpx/s)
    expect(wxss).toMatch(/\.type-chip\s*\{[^}]*display:\s*inline-flex\s*!important/s)
    expect(wxss).toMatch(/\.type-chip\s*\{[^}]*width:\s*auto\s*!important/s)
    expect(wxss).toMatch(/\.report-actions\s*\{[^}]*position:\s*fixed/s)
    expect(wxss).toMatch(
      /\.report-actions__submit\s*\{[^}]*display:\s*flex\s*!important[^}]*width:\s*100%\s*!important/s,
    )
    expect(wxss).toContain('env(safe-area-inset-bottom)')
    expect(wxss).toMatch(/\.report-page__content\s*\{[^}]*padding-bottom:/s)
  })

  it('不重新引入完整航海士建立流程或遠程請求', () => {
    const wxml = readPageFile('index.wxml')
    const ts = readPageFile('index.ts')
    expect(wxml).not.toContain('新增航海士')
    expect(ts).not.toContain('wx.request')
    expect(ts).not.toContain('wx.cloud')
  })
})
