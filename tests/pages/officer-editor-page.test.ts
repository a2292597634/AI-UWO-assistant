import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const ROOT = resolve(__dirname, '../..')
const readPageFile = (file: string): string =>
  readFileSync(resolve(ROOT, 'miniprogram/pages/officer-editor', file), 'utf8')

describe('OfficerEditor page disclosure contract', () => {
  it('註冊共享 Disclosure 元件並保留五個表單分段', () => {
    const pageJson = JSON.parse(readPageFile('index.json')) as {
      usingComponents?: Record<string, string>
    }
    const wxml = readPageFile('index.wxml')

    expect(pageJson.usingComponents?.['disclosure-section']).toBe(
      '../../components/disclosure-section/index',
    )
    expect(wxml.match(/<disclosure-section/g) ?? []).toHaveLength(5)
    for (const title of ['基本資料', '能力與語言', '技能', '招募資訊', '其他與確認']) {
      expect(wxml).toContain(`title="${title}"`)
    }
  })

  it('只預設展開基本資料區段', () => {
    const wxml = readPageFile('index.wxml')

    expect(wxml).toMatch(/title="基本資料"[\s\S]*?default-expanded="\{\{true\}\}"/)
    expect(wxml.match(/default-expanded="\{\{false\}\}"/g) ?? []).toHaveLength(4)
  })

  it('保留既有欄位、操作和提交事件', () => {
    const wxml = readPageFile('index.wxml')

    for (const [event, handler] of [
      ['bindinput', 'onNameInput'],
      ['bindchange', 'onRarityChange'],
      ['bindtap', 'onPortraitTap'],
      ['bindtap', 'onLanguageAdd'],
      ['bindtap', 'onLanguageRemove'],
      ['bindtap', 'onSkillAdd'],
      ['bindtap', 'onSkillRemove'],
      ['bindtap', 'onCityAdd'],
      ['bindtap', 'onRequiredOfficerAdd'],
      ['bindtap', 'onSubmit'],
    ]) {
      expect(wxml).toContain(`${event}="${handler}"`)
    }
    expect(wxml).not.toContain('📷')
    expect(wxml).not.toContain('✕')
  })

  it('使用 Design Foundation、操作熱區、安全區與長文本規則', () => {
    const wxss = readPageFile('index.wxss')

    expect(wxss).toContain('var(--uwo-color-canvas)')
    expect(wxss).toContain('var(--uwo-color-surface)')
    expect(wxss).toMatch(/min-height\s*:\s*88rpx/)
    expect(wxss).toContain('env(safe-area-inset-bottom)')
    expect(wxss).toMatch(/overflow-wrap\s*:\s*anywhere/)
    expect(wxss).not.toMatch(/#[0-9a-f]{3,8}\b|(?:rgb|hsl)a?\s*\(/i)
  })
})
