import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const ROOT = resolve(__dirname, '../..')
const readPageFile = (file: string): string =>
  readFileSync(resolve(ROOT, 'miniprogram/pages/officer-editor', file), 'utf8')

describe('航海士資料錯誤回報頁契約', () => {
  it('以搜尋選擇器或完整身份卡呈現航海士', () => {
    const wxml = readPageFile('index.wxml')
    expect(wxml).toContain('<entity-search-picker')
    expect(wxml).toContain('bindselect="onOfficerSelect"')
    expect(wxml).toContain('officerIdentity.portraitPath')
    expect(wxml).toContain('binderror="onPortraitError"')
    expect(wxml).toContain('officerIdentity.rarityName')
    expect(wxml).toContain('officerIdentity.typeName')
    expect(wxml).toContain('officerIdentity.jobName')
    expect(wxml).toContain('officerIdentity.genderLabel')
    expect(wxml).toContain('officerIdentity.nationalityName')
    expect(wxml).toContain('officerIdentity.languageSummary')
    expect(wxml).toContain('更換')
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

  it('證據區可在原字段內收合並提供截圖移除名稱', () => {
    const wxml = readPageFile('index.wxml')
    expect(wxml).toContain('bindtap="onToggleEvidence"')
    expect(wxml).toContain('aria-expanded="{{evidenceExpanded}}"')
    expect(wxml).toContain('{{evidenceSummary}}')
    expect(wxml).toContain('wx:if="{{evidenceExpanded}}"')
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

  it('頁面配置註冊搜尋組件並使用資料勘誤導航標題', () => {
    const config = JSON.parse(readPageFile('index.json')) as {
      navigationBarTitleText: string
      usingComponents: Record<string, string>
    }
    expect(config.navigationBarTitleText).toBe('資料勘誤')
    expect(config.usingComponents).toEqual({
      'entity-search-picker': '/components/entity-search-picker/index',
    })
  })

  it('不重新引入完整航海士建立流程或遠程請求', () => {
    const wxml = readPageFile('index.wxml')
    const ts = readPageFile('index.ts')
    expect(wxml).not.toContain('新增航海士')
    expect(ts).not.toContain('wx.request')
    expect(ts).not.toContain('wx.cloud')
  })
})
