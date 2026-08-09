import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const ROOT = resolve(__dirname, '../..')
const COMPONENT_ROOT = 'miniprogram/components'
const COMPONENT_FILES = ['index.ts', 'index.wxml', 'index.wxss', 'index.json'] as const

const P3_COLOR_TOKENS = [
  '--uwo-color-canvas',
  '--uwo-color-surface',
  '--uwo-color-surface-muted',
  '--uwo-color-ink',
  '--uwo-color-text-primary',
  '--uwo-color-text-secondary',
  '--uwo-color-accent-brass',
  '--uwo-color-accent-text',
  '--uwo-color-success',
  '--uwo-color-warning',
  '--uwo-color-danger',
  '--uwo-color-border-subtle',
  '--uwo-color-border-strong',
] as const

const P3_FONT_TOKENS = [
  '--uwo-font-family-body',
  '--uwo-font-family-display',
  '--uwo-font-size-page-title',
  '--uwo-font-size-section-title',
  '--uwo-font-size-emphasis',
  '--uwo-font-size-body',
  '--uwo-font-size-supporting',
  '--uwo-font-size-minimum-action',
] as const

const P3_SPACE_TOKENS = [
  '--uwo-space-1',
  '--uwo-space-2',
  '--uwo-space-3',
  '--uwo-space-4',
  '--uwo-space-6',
  '--uwo-space-8',
  '--uwo-space-12',
] as const

const P3_RADIUS_TOKENS = [
  '--uwo-radius-control',
  '--uwo-radius-card',
  '--uwo-radius-sheet',
  '--uwo-radius-pill',
] as const

const P3_SHADOW_TOKENS = ['--uwo-shadow-elevated', '--uwo-shadow-sheet'] as const

const P3_TOKENS = new Set<string>([
  ...P3_COLOR_TOKENS,
  ...P3_FONT_TOKENS,
  ...P3_SPACE_TOKENS,
  ...P3_RADIUS_TOKENS,
  ...P3_SHADOW_TOKENS,
])

const COLOR_PROPERTIES =
  /^(?:color|background(?:-color)?|border(?:-(?:top|right|bottom|left))?|border(?:-[a-z]+)?-color|outline|outline-color|fill|stroke)$/
const IMAGE_PROPERTIES = /^(?:background-image|mask-image|-webkit-mask-image)$/
const SPACE_PROPERTIES =
  /^(?:margin|padding|gap|row-gap|column-gap)(?:-(?:top|right|bottom|left|inline|block)(?:-(?:start|end))?)?$/
const RADIUS_PROPERTIES =
  /^border-(?:radius|(?:top|bottom)-(?:left|right)-radius|(?:start|end)-(?:start|end)-radius)$/
const FILTER_PROPERTIES = /^(?:-webkit-)?(?:backdrop-)?filter$/
const NON_ZERO_CSS_LENGTH = /(?:^|[\s(,+-])[1-9]\d*(?:\.\d+)?(?:rpx|px|em|rem|vw|vh|%)\b/i
const CSS_WIDE_VALUE = /^(?:inherit|initial|revert|revert-layer|unset)$/i
const NO_VISUAL_VALUE = /^(?:none|inherit|initial|revert|revert-layer|unset)$/i

const COMPONENT_CONTRACTS = [
  {
    name: 'config-bar',
    events: ['info-tap', 'login-tap', 'menu-tap', 'save', 'save-as', 'rename', 'delete', 'new'],
  },
  { name: 'mode-tabs', events: ['change'] },
  { name: 'officer-action-sheet', events: ['lock', 'remove', 'ban'] },
  {
    name: 'skill-picker-sheet',
    events: [
      'dismiss',
      'kind-change',
      'category-change',
      'search-input',
      'skill-tap',
      'select',
      'reach-end',
    ],
  },
  { name: 'result-preview-sheet', events: ['cancel', 'apply', 'undo'] },
  { name: 'status-badge', events: [] },
  { name: 'empty-state', events: [] },
] as const

const PAGE_PATHS = ['miniprogram/pages/fleet', 'miniprogram/pages/adventure-fleet'] as const

const readProjectFile = (relativePath: string): string =>
  readFileSync(resolve(ROOT, relativePath), 'utf8')

const projectFileExists = (relativePath: string): boolean => existsSync(resolve(ROOT, relativePath))

const escapeRegExp = (value: string): string => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

const readDeclarations = (wxss: string): Array<{ property: string; value: string }> =>
  [
    ...wxss.replace(/\/\*[\s\S]*?\*\//g, '').matchAll(/(?:^|[;{])\s*([a-z-]+)\s*:\s*([^;{}]+)/gim),
  ].map(([, property, value]) => ({ property: property.toLowerCase(), value: value.trim() }))

const readTokenReferences = (value: string): string[] =>
  [...value.matchAll(/var\(\s*(--[a-z0-9-]+)/gi)].map((match) => match[1])

const isLocalUrlValue = (value: string): boolean => {
  const match = /^url\(\s*(?:(['"])(.*?)\1|([^'"]+?))\s*\)$/i.exec(value)
  const path = (match?.[2] ?? match?.[3])?.trim()
  return (
    path !== undefined &&
    path !== '' &&
    !/^[a-z][a-z0-9+.-]*:/i.test(path) &&
    !path.startsWith('//') &&
    !path.startsWith('#') &&
    !path.includes('\\')
  )
}

const removeTokenReferences = (value: string, tokens: readonly string[]): string =>
  tokens.reduce(
    (remaining, token) => remaining.replace(new RegExp(`var\\(\\s*${token}\\s*\\)`, 'gi'), ' '),
    value,
  )

describe('配隊共享元件文件架構', () => {
  it('七個共享元件均提供微信原生 Component 的四件必要文件', () => {
    const missingFiles = COMPONENT_CONTRACTS.flatMap(({ name }) =>
      COMPONENT_FILES.map((file) => `${COMPONENT_ROOT}/${name}/${file}`),
    ).filter((relativePath) => !projectFileExists(relativePath))

    expect(missingFiles).toEqual([])
  })

  describe.each(COMPONENT_CONTRACTS)('$name 契約', ({ name, events }) => {
    const componentPath = `${COMPONENT_ROOT}/${name}`

    it('index.json 宣告為微信原生 Component', () => {
      const jsonPath = `${componentPath}/index.json`
      if (!projectFileExists(jsonPath)) return

      expect(JSON.parse(readProjectFile(jsonPath))).toMatchObject({ component: true })
    })

    it('只使用 P3 Design Foundation Token 建立元件視覺', () => {
      const wxssPath = `${componentPath}/index.wxss`
      if (!projectFileExists(wxssPath)) return

      const wxss = readProjectFile(wxssPath)
      const tokenReferences = readTokenReferences(wxss)
      const unsupportedTokens = tokenReferences.filter((token) => !P3_TOKENS.has(token))
      const declarations = readDeclarations(wxss)

      expect(tokenReferences.length).toBeGreaterThan(0)
      expect(unsupportedTokens).toEqual([])
      expect(wxss).not.toMatch(/#[0-9a-f]{3,8}\b|(?:rgb|hsl)a?\s*\(/i)
      expect(wxss).not.toMatch(/(?:repeating-)?(?:linear|radial|conic)-gradient\s*\(/i)

      for (const { property, value } of declarations) {
        if (COLOR_PROPERTIES.test(property)) {
          const declarationTokens = readTokenReferences(value)
          const usesColorToken = declarationTokens.some((token) =>
            P3_COLOR_TOKENS.includes(token as (typeof P3_COLOR_TOKENS)[number]),
          )
          expect(
            usesColorToken ||
              /^(?:0|none|transparent|currentcolor|inherit|initial|unset)$/i.test(value),
          ).toBe(true)
        }

        if (IMAGE_PROPERTIES.test(property)) {
          expect(NO_VISUAL_VALUE.test(value) || isLocalUrlValue(value)).toBe(true)
        }

        if (SPACE_PROPERTIES.test(property)) {
          expect(value).not.toMatch(NON_ZERO_CSS_LENGTH)
        }

        if (property === 'font') {
          const declarationTokens = readTokenReferences(value)
          const fontFamilyTokens = declarationTokens.filter((token) =>
            P3_FONT_TOKENS.slice(0, 2).includes(token as (typeof P3_FONT_TOKENS)[number]),
          )
          const fontSizeTokens = declarationTokens.filter((token) =>
            P3_FONT_TOKENS.slice(2).includes(token as (typeof P3_FONT_TOKENS)[number]),
          )
          const unsupportedShorthand = removeTokenReferences(value, P3_FONT_TOKENS)
            .replace(/\b(?:normal|italic|oblique|small-caps|bold|bolder|lighter|[1-9]00)\b/gi, ' ')
            .replace(/(?:^|\s|\/)\d+(?:\.\d+)?(?=\s|\/|$)/g, ' ')
            .replace(/[\s/]+/g, '')

          expect(
            CSS_WIDE_VALUE.test(value) ||
              (fontFamilyTokens.length === 1 &&
                fontSizeTokens.length === 1 &&
                unsupportedShorthand === '' &&
                /var\(\s*--uwo-font-family-(?:body|display)\s*\)\s*$/i.test(value)),
          ).toBe(true)
        }

        if (property === 'font-family') {
          const declarationTokens = readTokenReferences(value)
          expect(
            declarationTokens.some((token) =>
              P3_FONT_TOKENS.slice(0, 2).includes(token as (typeof P3_FONT_TOKENS)[number]),
            ) || /^(?:inherit|initial|unset)$/i.test(value),
          ).toBe(true)
        }

        if (property === 'font-size') {
          const declarationTokens = readTokenReferences(value)
          expect(
            declarationTokens.some((token) =>
              P3_FONT_TOKENS.slice(2).includes(token as (typeof P3_FONT_TOKENS)[number]),
            ),
          ).toBe(true)
        }

        if (RADIUS_PROPERTIES.test(property)) {
          const declarationTokens = readTokenReferences(value)
          const unsupportedRadiusValue = removeTokenReferences(value, P3_RADIUS_TOKENS)
            .replace(/\b0\b/g, ' ')
            .replace(/[\s/]+/g, '')
          expect(
            declarationTokens.every((token) =>
              P3_RADIUS_TOKENS.includes(token as (typeof P3_RADIUS_TOKENS)[number]),
            ) && unsupportedRadiusValue === '',
          ).toBe(true)
        }

        if (property === 'box-shadow' || property === 'text-shadow') {
          const declarationTokens = readTokenReferences(value)
          expect(
            declarationTokens.some((token) =>
              P3_SHADOW_TOKENS.includes(token as (typeof P3_SHADOW_TOKENS)[number]),
            ) || /^none$/i.test(value),
          ).toBe(true)
        }

        if (FILTER_PROPERTIES.test(property)) {
          expect(NO_VISUAL_VALUE.test(value)).toBe(true)
        }
      }
    })

    it.each(events)('以 %s 發出規格指定事件', (eventName) => {
      const scriptPath = `${componentPath}/index.ts`
      if (!projectFileExists(scriptPath)) return

      const script = readProjectFile(scriptPath)
      expect(script).toMatch(new RegExp(`\\.triggerEvent\\(\\s*['"]${escapeRegExp(eventName)}['"]`))
    })
  })
})

describe.each(PAGE_PATHS)('%s 共享元件接線', (pagePath) => {
  it('以固定路徑註冊七個共享元件', () => {
    const pageConfig = JSON.parse(readProjectFile(`${pagePath}/index.json`)) as {
      usingComponents?: Record<string, string>
    }

    const expectedRegistrations = Object.fromEntries(
      COMPONENT_CONTRACTS.map(({ name }) => [name, `../../components/${name}/index`]),
    )

    expect(pageConfig.usingComponents).toMatchObject(expectedRegistrations)
  })

  it('WXML 使用七個共享元件標籤', () => {
    const wxml = readProjectFile(`${pagePath}/index.wxml`)

    for (const { name } of COMPONENT_CONTRACTS) {
      expect(wxml).toMatch(new RegExp(`<${escapeRegExp(name)}(?:\\s|/?>)`))
    }
  })
})
