import * as fs from 'node:fs'
import * as path from 'node:path'
import { describe, expect, it } from 'vitest'

const skillSheetWxml = fs.readFileSync(
  path.resolve(__dirname, '../../miniprogram/components/skill-sheet/index.wxml'),
  'utf8',
)
const skillSheetWxss = fs.readFileSync(
  path.resolve(__dirname, '../../miniprogram/components/skill-sheet/index.wxss'),
  'utf8',
)

describe('skill sheet layout contract', () => {
  it('uses a clear title hierarchy and keeps existing actions', () => {
    expect(skillSheetWxml).toContain('技能詳情')
    expect(skillSheetWxml).toContain('aria-label="關閉技能詳情"')
    expect(skillSheetWxml).toContain('bindtap="onReverseLookup"')
  })

  it('provides an accessible close target and bottom safe area', () => {
    expect(skillSheetWxss).toMatch(/\.skill-sheet__close\s*\{[\s\S]*min-width:\s*88rpx/)
    expect(skillSheetWxss).toMatch(/\.skill-sheet__close\s*\{[\s\S]*min-height:\s*88rpx/)
    expect(skillSheetWxss).toMatch(
      /\.skill-sheet__close\s*\{[\s\S]*font-size:\s*var\(--uwo-font-size-minimum-action\)/,
    )
    expect(skillSheetWxss).toContain('env(safe-area-inset-bottom)')
  })
})
