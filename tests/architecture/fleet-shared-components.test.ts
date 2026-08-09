import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const ROOT = resolve(__dirname, '../..')
const COMPONENT_ROOT = 'miniprogram/components'
const COMPONENT_FILES = ['index.ts', 'index.wxml', 'index.wxss', 'index.json'] as const

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
      expect(wxss).toMatch(/var\(--uwo-(?:color|font|space|radius|shadow)-[a-z-]+\)/)
      expect(wxss).not.toMatch(/#[0-9a-f]{3,8}\b/i)
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
