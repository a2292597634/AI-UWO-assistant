import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const ROOT = resolve(__dirname, '../..')
const SPEC_PATH = 'docs/superpowers/specs/2026-08-09-design-foundation-design.md'
const TASK_7_WXSS_PATHS = [
  'miniprogram/subpkg-fleet/pages/index/index.wxss',
  'miniprogram/pages/adventure-fleet/index.wxss',
  'miniprogram/pages/officer-editor/index.wxss',
  'miniprogram/pages/catalog/index.wxss',
  'miniprogram/subpkg-detail/pages/detail/index.wxss',
  'miniprogram/components/config-conflict-modal/index.wxss',
  'miniprogram/components/config-name-modal/index.wxss',
  'miniprogram/components/mode-tabs/index.wxss',
  'miniprogram/components/skill-picker-sheet/index.wxss',
  'miniprogram/components/officer-action-sheet/index.wxss',
  'miniprogram/components/result-preview-sheet/index.wxss',
  'miniprogram/components/config-bar/index.wxss',
  'miniprogram/components/empty-state/index.wxss',
  'miniprogram/components/disclosure-section/index.wxss',
  'miniprogram/components/skill-sheet/index.wxss',
] as const

const readProjectFile = (relativePath: string): string => {
  const target = resolve(ROOT, relativePath)
  return existsSync(target) ? readFileSync(target, 'utf8') : ''
}

const COLOR_TOKENS = {
  '--uwo-color-canvas': '#e7deca',
  '--uwo-color-surface': '#f5efe0',
  '--uwo-color-surface-muted': '#e8dfce',
  '--uwo-color-ink': '#26332f',
  '--uwo-color-text-primary': '#292a26',
  '--uwo-color-text-secondary': '#625947',
  '--uwo-color-accent-brass': '#b99552',
  '--uwo-color-accent-text': '#76501a',
  '--uwo-color-success': '#596257',
  '--uwo-color-warning': '#7a541c',
  '--uwo-color-danger': '#8b3a3a',
  '--uwo-color-border-subtle': '#c8bda4',
  '--uwo-color-border-strong': '#8c7e63',
} as const

const EVENT_COLOR_TOKENS = {
  '--uwo-color-event-brass': '#85661f',
  '--uwo-color-event-rust': '#923f38',
  '--uwo-color-event-forest': '#526f54',
  '--uwo-color-event-sea': '#32677e',
} as const

const GAME_SCHEDULE_COLOR_TOKENS = {
  '--uwo-color-event-schedule-green': '#10d62e',
  '--uwo-color-time-current-hour': '#e4d21b',
} as const

const relativeLuminance = (hex: string): number => {
  const channels = hex
    .slice(1)
    .match(/.{2}/g)
    ?.map((channel) => Number.parseInt(channel, 16) / 255)
  if (channels === undefined || channels.length !== 3) throw new Error(`Invalid color: ${hex}`)
  const [red, green, blue] = channels.map((channel) =>
    channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4,
  )
  return 0.2126 * red! + 0.7152 * green! + 0.0722 * blue!
}

const contrastRatio = (foreground: string, background: string): number => {
  const foregroundLuminance = relativeLuminance(foreground)
  const backgroundLuminance = relativeLuminance(background)
  return (
    (Math.max(foregroundLuminance, backgroundLuminance) + 0.05) /
    (Math.min(foregroundLuminance, backgroundLuminance) + 0.05)
  )
}

describe('Design Foundation 文件入口', () => {
  it.each(['AGENTS.md', 'CLAUDE.md'])('%s 在 UI 編碼前強制讀取同一份規格', (file) => {
    const content = readProjectFile(file)

    expect(content).toContain(SPEC_PATH)
    expect(content).toMatch(/UI、WXML 或 WXSS/s)
    expect(content).toMatch(/編碼前必須完整閱讀|编码前必须完整阅读/s)
  })
})

describe('Design Foundation 全局入口與 Token', () => {
  it('app.wxss 只引入唯一基礎樣式來源', () => {
    expect(readProjectFile('miniprogram/app.wxss').trim()).toMatch(
      /^@import\s+['"]\.\/styles\/design-foundation\.wxss['"];$/,
    )
  })

  it('定義全部指定色彩 Token', () => {
    const foundation = readProjectFile('miniprogram/styles/design-foundation.wxss')

    for (const [token, value] of Object.entries(COLOR_TOKENS)) {
      expect(foundation).toContain(`${token}: ${value};`)
    }
  })

  it('定義事件分類色 Token，且淺色籤文字對比至少 4.5:1', () => {
    const foundation = readProjectFile('miniprogram/styles/design-foundation.wxss')
    const spec = readProjectFile(SPEC_PATH)

    for (const [token, value] of Object.entries(EVENT_COLOR_TOKENS)) {
      expect(foundation).toContain(`${token}: ${value};`)
      expect(foundation.match(new RegExp(`${token}:`, 'g'))).toHaveLength(1)
      expect(spec).toContain(token)
      expect(contrastRatio('#f5efe0', value)).toBeGreaterThanOrEqual(4.5)
    }
  })

  it('定義遊戲時刻表事件綠與目前時段黃，深色文字對比至少 4.5:1', () => {
    const foundation = readProjectFile('miniprogram/styles/design-foundation.wxss')
    const spec = readProjectFile(SPEC_PATH)

    for (const [token, value] of Object.entries(GAME_SCHEDULE_COLOR_TOKENS)) {
      expect(foundation).toContain(`${token}: ${value};`)
      expect(foundation.match(new RegExp(`${token}:`, 'g'))).toHaveLength(1)
      expect(spec).toContain(token)
      expect(contrastRatio('#26332f', value)).toBeGreaterThanOrEqual(4.5)
    }
  })

  it('定義一致的字體、間距、圓角與陰影尺度', () => {
    const foundation = readProjectFile('miniprogram/styles/design-foundation.wxss')
    const declarations = [
      '--uwo-font-size-page-title: 40rpx;',
      '--uwo-font-size-section-title: 32rpx;',
      '--uwo-font-size-emphasis: 28rpx;',
      '--uwo-font-size-body: 26rpx;',
      '--uwo-font-size-supporting: 24rpx;',
      '--uwo-font-size-minimum-action: 22rpx;',
      '--uwo-space-1: 4rpx;',
      '--uwo-space-2: 8rpx;',
      '--uwo-space-3: 12rpx;',
      '--uwo-space-4: 16rpx;',
      '--uwo-space-6: 24rpx;',
      '--uwo-space-8: 32rpx;',
      '--uwo-space-12: 48rpx;',
      '--uwo-radius-control: 10rpx;',
      '--uwo-radius-card: 16rpx;',
      '--uwo-radius-sheet: 28rpx;',
      '--uwo-radius-pill: 999rpx;',
      '--uwo-shadow-elevated: 0 12rpx 32rpx rgba(38, 51, 47, 0.18);',
      '--uwo-shadow-sheet: 0 -12rpx 32rpx rgba(38, 51, 47, 0.16);',
    ]

    for (const declaration of declarations) {
      expect(foundation).toContain(declaration)
    }
  })

  it('正文使用無襯線字體，襯線字體只由展示類別 opt-in', () => {
    const foundation = readProjectFile('miniprogram/styles/design-foundation.wxss')

    expect(foundation).toContain('--uwo-font-family-body:')
    expect(foundation).toContain('--uwo-font-family-display:')
    expect(foundation).toMatch(/page\s*{[^}]*font-family:\s*var\(--uwo-font-family-body\)/s)
    expect(foundation).toMatch(
      /\.ui-display-title\s*{[^}]*font-family:\s*var\(--uwo-font-family-display\)/s,
    )
  })
})

describe('Design Foundation 基礎按鈕', () => {
  it('提供主要、次要、危險、禁用、按下和焦點狀態', () => {
    const foundation = readProjectFile('miniprogram/styles/design-foundation.wxss')
    const selectors = [
      '.ui-button--primary',
      '.ui-button--secondary',
      '.ui-button--danger',
      '.ui-button--disabled',
      '.ui-button--pressed',
      '.ui-button--focused',
      '.ui-button[disabled]',
      '.ui-button:active',
      '.ui-button:focus',
    ]

    expect(foundation).toMatch(/\.ui-button\s*{[^}]*min-height:\s*88rpx/s)
    expect(foundation).toMatch(/\.ui-button\s*{[^}]*font-size:\s*var\(--uwo-font-size-body\)/s)
    for (const selector of selectors) {
      expect(foundation).toContain(selector)
    }
  })

  it('全局原生 button 內容上下左右置中', () => {
    const foundation = readProjectFile('miniprogram/styles/design-foundation.wxss')

    expect(foundation).toMatch(/button\s*\{[^}]*display:\s*flex/s)
    expect(foundation).toMatch(/button\s*\{[^}]*align-items:\s*center/s)
    expect(foundation).toMatch(/button\s*\{[^}]*justify-content:\s*center/s)
    expect(foundation).toMatch(/button\s*\{[^}]*text-align:\s*center/s)
    expect(foundation).toContain('button::after')
  })
})

describe('Task 7 高频样式 Token 收敛', () => {
  it('受影响页面与共享浮层不新增局部色值', () => {
    for (const path of TASK_7_WXSS_PATHS) {
      const wxss = readProjectFile(path)
      expect(wxss).not.toMatch(/#[0-9a-f]{3,8}\b|(?:rgb|hsl)a?\s*\(/i)
      expect(wxss).toMatch(/var\(--uwo-color-[a-z-]+\)/)
    }
  })
})

describe('Design Foundation 狀態語義', () => {
  it('提供文字標籤結構與四種狀態類別', () => {
    const foundation = readProjectFile('miniprogram/styles/design-foundation.wxss')

    expect(foundation).toContain('.ui-status__label')
    for (const selector of [
      '.ui-status--achieved',
      '.ui-status--unmet',
      '.ui-status--review',
      '.ui-status--error',
    ]) {
      expect(foundation).toContain(selector)
    }
  })
})
