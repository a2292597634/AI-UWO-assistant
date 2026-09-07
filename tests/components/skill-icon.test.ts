import * as fs from 'node:fs'
import * as path from 'node:path'
import { beforeAll, describe, expect, it, vi } from 'vitest'

interface SkillIconData {
  imageFailed: boolean
  fallbackLabel: string
  iconPath: string
  assetReady: boolean
}

interface SkillIconContext {
  data: SkillIconData
  setData(update: Partial<SkillIconData>): void
}

interface SkillIconComponent {
  data: Pick<SkillIconData, 'imageFailed' | 'fallbackLabel'>
  observers: {
    categoryName(this: SkillIconContext, categoryName: string): void
    'iconPath, assetReady'(this: SkillIconContext): void
  }
  methods: {
    onImageError(this: SkillIconContext): void
  }
}

let skillIconComponent: SkillIconComponent

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

const createSkillIconContext = (): SkillIconContext => {
  const context: SkillIconContext = {
    data: {
      ...structuredClone(skillIconComponent.data),
      iconPath: '',
      assetReady: false,
    },
    setData(update) {
      Object.assign(context.data, update)
    },
  }
  return context
}

beforeAll(async () => {
  vi.stubGlobal('Component', (config: SkillIconComponent) => {
    skillIconComponent = config
  })

  // 元件入口是沒有 export 的微信腳本，需以副作用載入來捕獲 Component 配置。
  // @ts-expect-error 這個微信元件入口刻意不是 TypeScript module。
  await import('../../miniprogram/components/skill-icon/index')
})

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

  it('only marks the instance that received the image error as failed', () => {
    const failedContext = createSkillIconContext()
    const untouchedContext = createSkillIconContext()

    skillIconComponent.methods.onImageError.call(failedContext)

    expect(failedContext.data.imageFailed).toBe(true)
    expect(untouchedContext.data.imageFailed).toBe(false)
  })

  it('clears imageFailed when iconPath or assetReady changes', () => {
    const iconPathContext = createSkillIconContext()
    iconPathContext.data.imageFailed = true
    iconPathContext.data.iconPath = '/assets/skill.png'
    skillIconComponent.observers['iconPath, assetReady'].call(iconPathContext)

    const assetReadyContext = createSkillIconContext()
    assetReadyContext.data.imageFailed = true
    assetReadyContext.data.assetReady = true
    skillIconComponent.observers['iconPath, assetReady'].call(assetReadyContext)

    expect(iconPathContext.data.imageFailed).toBe(false)
    expect(assetReadyContext.data.imageFailed).toBe(false)
  })

  it('uses 技 for an empty categoryName and the first character otherwise', () => {
    const emptyCategoryContext = createSkillIconContext()
    skillIconComponent.observers.categoryName.call(emptyCategoryContext, '')

    const namedCategoryContext = createSkillIconContext()
    skillIconComponent.observers.categoryName.call(namedCategoryContext, '冒險')

    expect(emptyCategoryContext.data.fallbackLabel).toBe('技')
    expect(namedCategoryContext.data.fallbackLabel).toBe('冒')
  })
})
