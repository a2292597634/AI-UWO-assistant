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
  { name: 'empty-state', events: ['action'] },
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

describe('Task 2 基礎共享元件契約', () => {
  const readComponentFile = (component: string, file: (typeof COMPONENT_FILES)[number]): string => {
    const relativePath = `${COMPONENT_ROOT}/${component}/${file}`
    expect(projectFileExists(relativePath), `${relativePath} 應存在`).toBe(true)
    return projectFileExists(relativePath) ? readProjectFile(relativePath) : ''
  }

  it('ConfigBar 顯示配置狀態並提供完整配置操作入口', () => {
    const script = readComponentFile('config-bar', 'index.ts')
    const wxml = readComponentFile('config-bar', 'index.wxml')

    for (const property of [
      'configName',
      'configStatus',
      'authStatus',
      'activeConfigId',
      'showMenu',
    ]) {
      expect(script).toMatch(new RegExp(`\\b${property}\\s*:`))
    }
    expect(wxml).toContain('config-bar__status')
    expect(wxml).toMatch(/bindtap="onSave"/)
    expect(wxml).toContain('已保存')
    expect(wxml).toContain('尚未保存')
    expect(wxml).toContain('未命名配置')
  })

  it('ModeTabs 以選項值發出 change 並提供可見選中語義', () => {
    const script = readComponentFile('mode-tabs', 'index.ts')
    const wxml = readComponentFile('mode-tabs', 'index.wxml')

    expect(script).toMatch(/\bvalue\s*:/)
    expect(script).toMatch(/\boptions\s*:/)
    expect(script).toMatch(/triggerEvent\(\s*['"]change['"]\s*,\s*\{\s*value\s*\}/)
    expect(wxml).toContain('data-value="{{item.value}}"')
    expect(wxml).toContain('mode-tabs__item--active')
  })

  it('StatusBadge 以文字區分四種狀態', () => {
    const script = readComponentFile('status-badge', 'index.ts')
    const wxml = readComponentFile('status-badge', 'index.wxml')
    const wxss = readComponentFile('status-badge', 'index.wxss')

    for (const property of ['status', 'label', 'description']) {
      expect(script).toMatch(new RegExp(`\\b${property}\\s*:`))
    }
    expect(wxml).toContain('ui-status__label')
    for (const status of ['achieved', 'unmet', 'review', 'error']) {
      expect(wxss).toContain(`ui-status--${status}`)
    }
  })

  it('EmptyState 顯示標題與說明並以 action 交回操作', () => {
    const script = readComponentFile('empty-state', 'index.ts')
    const wxml = readComponentFile('empty-state', 'index.wxml')

    for (const property of ['title', 'description', 'actionLabel', 'showAction']) {
      expect(script).toMatch(new RegExp(`\\b${property}\\s*:`))
    }
    expect(wxml).toContain('empty-state__description')
    expect(wxml).toMatch(/bindtap="onAction"/)
    expect(script).toMatch(/triggerEvent\(\s*['"]action['"]\s*\)/)
  })

  it('本任務操作入口維持至少 88rpx 熱區', () => {
    for (const component of ['config-bar', 'mode-tabs', 'empty-state']) {
      const wxss = readComponentFile(component, 'index.wxss')
      expect(wxss).toMatch(/min-height\s*:\s*88rpx/)
    }
  })
})

describe('Task 3 航海士操作共享元件契約', () => {
  const readOfficerActionFile = (file: (typeof COMPONENT_FILES)[number]): string => {
    const relativePath = `${COMPONENT_ROOT}/officer-action-sheet/${file}`
    expect(projectFileExists(relativePath), `${relativePath} 應存在`).toBe(true)
    return projectFileExists(relativePath) ? readProjectFile(relativePath) : ''
  }

  it('依狀態與權限顯示鎖定、解鎖、移除和排除操作', () => {
    const script = readOfficerActionFile('index.ts')
    const wxml = readOfficerActionFile('index.wxml')

    for (const property of ['officerId', 'status', 'variant', 'allowBan', 'disabledActions']) {
      expect(script).toMatch(new RegExp(`\\b${property}\\s*:`))
    }
    expect(wxml).toContain("status === 'locked' ? '解鎖' : '鎖定'")
    expect(wxml).toContain('移除')
    expect(wxml).toMatch(/wx:if="\{\{allowBan\}\}"[\s\S]*?>[\s\S]*?排除/)
  })

  it('每個操作攜帶 action 與航海士 ID，並以一致 detail 轉發事件', () => {
    const script = readOfficerActionFile('index.ts')
    const wxml = readOfficerActionFile('index.wxml')

    for (const action of ['lock', 'remove', 'ban']) {
      expect(wxml).toContain(`data-action="${action}"`)
    }
    expect(wxml.match(/data-id="\{\{officerId\}\}"/g)).toHaveLength(3)
    expect(script).toMatch(/currentTarget\.dataset\.id/)
    for (const eventName of ['lock', 'remove', 'ban']) {
      expect(script).toMatch(
        new RegExp(`triggerEvent\\(\\s*['"]${eventName}['"]\\s*,\\s*\\{\\s*officerId\\s*\\}`),
      )
    }
  })

  it('禁用操作同時提供原生 disabled 與 aria-disabled 語義', () => {
    const script = readOfficerActionFile('index.ts')
    const wxml = readOfficerActionFile('index.wxml')

    for (const state of ['lockDisabled', 'removeDisabled', 'banDisabled']) {
      expect(script).toContain(state)
      expect(wxml).toContain(`disabled="{{${state}}}"`)
      expect(wxml).toContain(`aria-disabled="{{${state}}}"`)
    }
  })

  it('操作文字與熱區符合 Design Foundation 下限', () => {
    const wxss = readOfficerActionFile('index.wxss')

    expect(wxss).toMatch(/min-height\s*:\s*88rpx/)
    expect(wxss).toMatch(/font-size\s*:\s*var\(--uwo-font-size-(?:body|minimum-action)\)/)
  })
})

describe('Task 4 技能選擇共享元件契約', () => {
  const readSkillPickerFile = (file: (typeof COMPONENT_FILES)[number]): string => {
    const relativePath = `${COMPONENT_ROOT}/skill-picker-sheet/${file}`
    expect(projectFileExists(relativePath), `${relativePath} 應存在`).toBe(true)
    return projectFileExists(relativePath) ? readProjectFile(relativePath) : ''
  }

  it('提供兩種展示模式與完整技能篩選屬性', () => {
    const script = readSkillPickerFile('index.ts')
    const wxml = readSkillPickerFile('index.wxml')

    for (const property of [
      'presentation',
      'visible',
      'skillKinds',
      'skillCategories',
      'skills',
      'selectedSkillId',
      'searchText',
      'hasMore',
      'selectionLabel',
    ]) {
      expect(script).toMatch(new RegExp(`\\b${property}\\s*:`))
    }
    expect(wxml).toContain("presentation === 'inline'")
    expect(wxml).toContain("presentation === 'sheet'")
    expect(wxml).toContain('skill-picker-sheet__mask')
  })

  it('顯示類型、分類、搜尋、技能詳情、選擇與載入入口', () => {
    const wxml = readSkillPickerFile('index.wxml')

    expect(wxml).toContain('skill-picker-sheet__kind-tabs')
    expect(wxml).toContain('skill-picker-sheet__category-tabs')
    expect(wxml).toMatch(/<input[\s\S]*?bindinput="onSearchInput"/)
    expect(wxml).toMatch(/wx:for="\{\{skills\}\}"/)
    expect(wxml).toMatch(/bindtap="onSkillTap"/)
    expect(wxml).toMatch(/catchtap="onSelect"/)
    expect(wxml).toMatch(/bindscrolltolower="onReachEnd"/)
    expect(wxml).toMatch(/沒有符合|請先選擇/)
  })

  it('所有事件只攜帶必要識別值並交回頁面', () => {
    const script = readSkillPickerFile('index.ts')

    expect(script).toMatch(/triggerEvent\(\s*['"]dismiss['"]\s*\)/)
    expect(script).toMatch(/triggerEvent\(\s*['"]kind-change['"]\s*,\s*\{\s*value\s*\}\s*\)/)
    expect(script).toMatch(/triggerEvent\(\s*['"]category-change['"]\s*,\s*\{\s*value\s*\}\s*\)/)
    expect(script).toMatch(/triggerEvent\(\s*['"]search-input['"]\s*,\s*\{\s*value\s*\}\s*\)/)
    expect(script).toMatch(/triggerEvent\(\s*['"]skill-tap['"]\s*,\s*\{\s*skillId\s*\}\s*\)/)
    expect(script).toMatch(/triggerEvent\(\s*['"]select['"]\s*,\s*\{\s*skillId\s*\}\s*\)/)
    expect(script).toMatch(/triggerEvent\(\s*['"]reach-end['"]\s*\)/)
  })

  it('長文字、安全區與操作熱區符合 Design Foundation', () => {
    const wxss = readSkillPickerFile('index.wxss')

    for (const element of ['name', 'meta', 'description']) {
      expect(wxss).toMatch(
        new RegExp(
          `\\.skill-picker-sheet__${element}\\s*\\{[\\s\\S]*?overflow-wrap\\s*:\\s*anywhere`,
        ),
      )
    }
    expect(wxss).toMatch(/padding(?:-bottom)?\s*:\s*calc\([^;]*env\(safe-area-inset-bottom\)\)/)
    expect(wxss).toMatch(/min-height\s*:\s*88rpx/)
    expect(wxss).toMatch(/font-size\s*:\s*var\(--uwo-font-size-(?:body|minimum-action)\)/)
  })
})

describe('Task 5 方案預覽共享元件契約', () => {
  const readResultPreviewFile = (file: (typeof COMPONENT_FILES)[number]): string => {
    const relativePath = `${COMPONENT_ROOT}/result-preview-sheet/${file}`
    expect(projectFileExists(relativePath), `${relativePath} 應存在`).toBe(true)
    return projectFileExists(relativePath) ? readProjectFile(relativePath) : ''
  }

  it('接收預覽與撤銷狀態，且只將三種操作交回頁面', () => {
    const script = readResultPreviewFile('index.ts')

    for (const property of ['visible', 'preview', 'canUndo']) {
      expect(script).toMatch(new RegExp(`\\b${property}\\s*:`))
    }
    for (const eventName of ['cancel', 'apply', 'undo']) {
      expect(script).toMatch(new RegExp(`triggerEvent\\(\\s*['"]${eventName}['"]\\s*\\)`))
    }
    expect(script).not.toMatch(/buildFleetProposalPreview|FleetProposal|domain|solver/i)
  })

  it('顯示目標進度、成員差異、鎖定保留與約束語義', () => {
    const wxml = readResultPreviewFile('index.wxml')

    expect(wxml).toContain('目標達成')
    expect(wxml).toContain('目前 Lv.')
    expect(wxml).toContain('預期 Lv.')
    for (const label of ['保留', '新增', '移除']) {
      expect(wxml).toContain(label)
    }
    expect(wxml).toContain('鎖定成員')
    expect(wxml).toContain('有成員未保留')
    expect(wxml).toContain('約束與提示')
    expect(wxml).toContain("item.reached ? '已達成' : '差 Lv.' + item.difference")
  })

  it('不可應用時保留原生禁用、無障礙語義與可見原因', () => {
    const wxml = readResultPreviewFile('index.wxml')

    expect(wxml).toContain('取消')
    expect(wxml).toContain('應用方案')
    expect(wxml).toContain('disabled="{{!preview.canApply}}"')
    expect(wxml).toContain('aria-disabled="{{!preview.canApply}}"')
    expect(wxml).toContain('方案目前不可應用')
    expect(wxml).toMatch(/wx:if="\{\{!preview\.canApply\}\}"/)
  })

  it('canUndo 只顯示一次撤銷入口', () => {
    const wxml = readResultPreviewFile('index.wxml')

    expect(wxml).toContain('wx:if="{{canUndo}}"')
    expect(wxml.match(/bindtap="onUndo"/g)).toHaveLength(1)
    expect(wxml).toContain('撤銷本次配隊')
  })

  it('使用 P3 Sheet、按鈕、長文字與安全區規範', () => {
    const wxss = readResultPreviewFile('index.wxss')

    expect(wxss).toContain('var(--uwo-radius-sheet)')
    expect(wxss).toContain('var(--uwo-shadow-sheet)')
    expect(wxss).toMatch(/padding(?:-bottom)?\s*:\s*calc\([^;]*env\(safe-area-inset-bottom\)\)/)
    expect(wxss).toMatch(/min-height\s*:\s*88rpx/)
    expect(wxss).toMatch(/font-size\s*:\s*var\(--uwo-font-size-(?:body|minimum-action)\)/)
    expect(wxss).toMatch(/overflow-wrap\s*:\s*anywhere/)
  })
})
