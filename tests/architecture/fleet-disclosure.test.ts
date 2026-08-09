import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const ROOT = resolve(__dirname, '../..')
const componentPath = 'miniprogram/components/disclosure-section'

const readComponentFile = (file: 'index.ts' | 'index.wxml' | 'index.wxss' | 'index.json'): string =>
  readFileSync(resolve(ROOT, componentPath, file), 'utf8')

describe('DisclosureSection 元件契約', () => {
  it('提供微信原生 Component 的四件文件', () => {
    expect(
      ['index.ts', 'index.wxml', 'index.wxss', 'index.json'].every((file) =>
        existsSync(resolve(ROOT, componentPath, file)),
      ),
    ).toBe(true)
  })

  it('只維護展示展開狀態並保留 slot', () => {
    const script = readComponentFile('index.ts')
    const wxml = readComponentFile('index.wxml')

    for (const property of ['title', 'hint', 'countLabel', 'defaultExpanded']) {
      expect(script).toMatch(new RegExp(`\\b${property}\\s*:`))
    }
    expect(script).toContain('expanded')
    expect(script).toContain('onToggle')
    expect(script).not.toMatch(/wx\.|Domain|Presenter|solver|runtime/i)
    expect(wxml).toContain('<slot')
    expect(wxml).toContain('bindtap="onToggle"')
    expect(wxml).toContain('aria-expanded="{{expanded}}"')
    expect(wxml).toContain('wx:if="{{expanded}}"')
  })

  it('只使用 P3 Token 且標題列熱區至少 88rpx', () => {
    const json = JSON.parse(readComponentFile('index.json')) as { component?: boolean }
    const wxss = readComponentFile('index.wxss')

    expect(json.component).toBe(true)
    expect(wxss).toContain('var(--uwo-')
    expect(wxss).not.toMatch(/#[0-9a-f]{3,8}\b|(?:rgb|hsl)a?\s*\(/i)
    expect(wxss).toMatch(/min-height\s*:\s*88rpx/)
    expect(wxss).toMatch(/font-size\s*:\s*var\(--uwo-font-size-(?:body|minimum-action)\)/)
  })
})
