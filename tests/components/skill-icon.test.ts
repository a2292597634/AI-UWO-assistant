import * as fs from 'node:fs'
import * as path from 'node:path'
import { describe, expect, it } from 'vitest'

const componentPath = (file: string) =>
  path.resolve(__dirname, '../../miniprogram/components/skill-icon', file)

const readComponentFile = (file: string) => {
  const filePath = componentPath(file)
  return fs.existsSync(filePath) ? fs.readFileSync(filePath, 'utf8') : ''
}

const skillIconJson = readComponentFile('index.json')
const skillIconTs = readComponentFile('index.ts')
const skillIconWxml = readComponentFile('index.wxml')
const skillIconWxss = readComponentFile('index.wxss')

describe('skill icon component contract', () => {
  it('declares a shared custom component', () => {
    expect(skillIconJson).toContain('"component": true')
    expect(skillIconTs).toContain("styleIsolation: 'apply-shared'")
  })

  it('exposes image fallback and accessibility behavior', () => {
    expect(skillIconTs).toContain('imageFailed')
    expect(skillIconTs).toContain('onImageError')
    expect(skillIconTs).toContain('fallbackLabel')
    expect(skillIconTs).toContain('iconPath')
    expect(skillIconTs).toContain('skillName')
    expect(skillIconTs).toContain('categoryName')
    expect(skillIconTs).toContain('level')
    expect(skillIconTs).toContain('assetReady')
    expect(skillIconWxml).toContain('assetReady && iconPath && !imageFailed')
    expect(skillIconWxml).toContain('binderror="onImageError"')
    expect(skillIconWxml).toContain('role="img"')
    expect(skillIconWxml).toContain('aria-label="{{skillName ||')
    expect(skillIconWxml).toContain("'技能'")
    expect(skillIconWxml).toContain('{{fallbackLabel}}')
  })

  it('renders positive levels and uses the existing visual tokens', () => {
    expect(skillIconWxml).toContain('wx:if="{{level > 0}}"')
    expect(skillIconWxml).toContain('Lv.{{level}}')
    expect(skillIconWxss).toContain('width: 44rpx;')
    expect(skillIconWxss).toContain('height: 44rpx;')
    expect(skillIconWxss).toContain('var(--uwo-color-border-subtle)')
    expect(skillIconWxss).toContain('var(--uwo-radius-control)')
    expect(skillIconWxss).toContain('var(--uwo-radius-pill)')
    expect(skillIconWxss).toContain('var(--uwo-font-size-minimum-action)')
  })
})
