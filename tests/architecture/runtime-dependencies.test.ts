/**
 * Architecture Gate: Runtime Dependency Rules
 *
 * Enforce that pages and domain modules don't have forbidden dependencies:
 *  - Pages must not directly require generated data, data/master, archive, or tools
 *  - domain/ must not contain wx, Page, Component, or setData
 */

import { describe, it, expect } from 'vitest'
import * as fs from 'node:fs'
import { builtinModules } from 'node:module'
import * as path from 'node:path'
import { findRuntimeNetworkReferences } from '../../tools/quality/find-runtime-network-references'

const MINIPROGRAM = path.resolve(__dirname, '../../miniprogram')
const RUNTIME_SOURCE_EXTENSIONS = new Set(['.ts', '.js', '.json', '.wxml', '.wxss', '.wxs'])
const NODE_BUILTINS = new Set(builtinModules.map((name) => name.replace(/^node:/, '')))

// ── Helpers ──

const readTsFiles = (dir: string): string[] => {
  const results: string[] = []
  const entries = fs.readdirSync(dir, { withFileTypes: true })
  for (const entry of entries) {
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) {
      if (entry.name === 'node_modules' || entry.name === 'generated') continue
      results.push(...readTsFiles(full))
    } else if (entry.name.endsWith('.ts') && !entry.name.endsWith('.d.ts')) {
      results.push(full)
    }
  }
  return results
}

const readFileContent = (filePath: string): string => fs.readFileSync(filePath, 'utf8')

interface RuntimeSourceText {
  file: string
  source: string
}

const AUTHORITY_BOUNDARY_PATTERNS = [
  { pattern: /(?:^|[\\/'"])data[\\/]master(?:[\\/'"]|$)/, desc: 'reference to data/master' },
  { pattern: /(?:^|[\\/'"])archive[\\/]/, desc: 'reference to archive/' },
]

const findAuthorityBoundaryViolations = (files: RuntimeSourceText[]): string[] =>
  files.flatMap(({ file, source }) =>
    AUTHORITY_BOUNDARY_PATTERNS.filter(({ pattern }) => pattern.test(source)).map(
      ({ desc }) => `${file}: ${desc}`,
    ),
  )

describe('Canonical source boundary scanner', () => {
  it.each([
    [
      'components/officer-card/index.ts',
      "import officers from '../../../data/master/officers.json'",
      'components/officer-card/index.ts: reference to data/master',
    ],
    [
      'presenters/catalog-presenter.ts',
      "const snapshot = require('../../archive/voyage/raw-data.json')",
      'presenters/catalog-presenter.ts: reference to archive/',
    ],
  ])('reports a forbidden reference from non-page runtime source %s', (file, source, expected) => {
    expect(findAuthorityBoundaryViolations([{ file, source }])).toContain(expected)
  })

  it('includes the root app.ts entry in the runtime boundary', () => {
    expect(isAuthorityBoundaryRuntimeSource(path.join(MINIPROGRAM, 'app.ts'))).toBe(true)
    expect(
      findAuthorityBoundaryViolations([
        { file: 'app.ts', source: "import data from '../data/master/officers.json'" },
      ]),
    ).toContain('app.ts: reference to data/master')
  })
})

const readRuntimeFiles = (dir: string): string[] => {
  const results: string[] = []
  const entries = fs.readdirSync(dir, { withFileTypes: true })

  for (const entry of entries) {
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) {
      if (entry.name === 'node_modules') continue
      results.push(...readRuntimeFiles(full))
    } else if (RUNTIME_SOURCE_EXTENSIONS.has(path.extname(entry.name))) {
      results.push(full)
    }
  }

  return results
}

const readPageFiles = (): string[] =>
  [path.join(MINIPROGRAM, 'pages'), path.join(MINIPROGRAM, 'subpkg-detail', 'pages')]
    .filter((dir) => fs.existsSync(dir))
    .flatMap(readRuntimeFiles)

const GENERATED_RUNTIME_OUTPUT_PATTERNS = [
  /^generated\//,
  /^data\//,
  /^subpkg-detail\/(?:details-\d+|detail-index|detail-loaders)\.js$/,
]

const NON_RUNTIME_SOURCE_PATTERNS = [
  /^typings\//,
  /^pages\/test\//,
  /(?:^|\/)__tests__(?:\/|$)/,
  /(?:^|\/)[^/]+\.(?:test|spec)\.[^.]+$/,
  /^project\.private\.config\.json$/,
]

const relativeRuntimePath = (file: string): string =>
  (path.isAbsolute(file) ? path.relative(MINIPROGRAM, file) : file).replace(/\\/g, '/')

const isAuthorityBoundaryRuntimeSource = (file: string): boolean => {
  const relative = relativeRuntimePath(file)

  if (!RUNTIME_SOURCE_EXTENSIONS.has(path.extname(relative))) return false
  if (relative.endsWith('.d.ts')) return false
  if (GENERATED_RUNTIME_OUTPUT_PATTERNS.some((pattern) => pattern.test(relative))) return false
  if (NON_RUNTIME_SOURCE_PATTERNS.some((pattern) => pattern.test(relative))) return false
  return true
}

const readAuthorityBoundarySources = (): RuntimeSourceText[] =>
  readRuntimeFiles(MINIPROGRAM)
    .filter(isAuthorityBoundaryRuntimeSource)
    .map((file) => ({
      file: relativeRuntimePath(file),
      source: readFileContent(file),
    }))

const moduleSpecifiers = (source: string): string[] => {
  const patterns = [
    /\b(?:import|export)\s+(?:[^'"\r\n]*?\s+from\s+)?['"]([^'"]+)['"]/g,
    /\brequire\s*\(\s*['"]([^'"]+)['"]/g,
    /\bimport\s*\(\s*['"]([^'"]+)['"]/g,
  ]

  return patterns.flatMap((pattern) => [...source.matchAll(pattern)].map((match) => match[1]))
}

const isNodeBuiltin = (specifier: string): boolean => {
  if (specifier.startsWith('node:')) return true
  return NODE_BUILTINS.has(specifier) || NODE_BUILTINS.has(specifier.split('/')[0])
}

const analyzeRuntimeSource = (source: string): string[] => {
  const reasons = new Set<string>()

  if (/https?:\/\//.test(source)) reasons.add('remote URL')
  if (/\bwx\s*\.\s*request\b/.test(source)) reasons.add('wx.request')
  if (/\bwx\s*\.\s*cloud\b/.test(source)) reasons.add('wx.cloud')

  for (const specifier of moduleSpecifiers(source)) {
    if (isNodeBuiltin(specifier)) reasons.add(`Node built-in ${specifier}`)
  }

  return [...reasons]
}

describe('Runtime source dependency scanner', () => {
  it.each([
    ["import data from 'node:fs'", 'Node built-in node:fs'],
    ["const data = require('path')", 'Node built-in path'],
    ["import('fs/promises')", 'Node built-in fs/promises'],
    ["const endpoint = 'https://example.com/data.json'", 'remote URL'],
    ['wx.request({})', 'wx.request'],
    ['wx.cloud.init()', 'wx.cloud'],
  ])('reports %s as %s', (source, expectedReason) => {
    expect(analyzeRuntimeSource(source)).toContain(expectedReason)
  })

  it('accepts local mini program imports and wx navigation', () => {
    const source = [
      "import { queryCatalog } from '../../domain/catalog-query'",
      "wx.navigateTo({ url: '/subpkg-detail/pages/detail/index?id=1' })",
    ].join('\n')

    expect(analyzeRuntimeSource(source)).toEqual([])
  })
})

// ── Tests ──

describe('Runtime source directories must not reference canonical or archived data', () => {
  it('covers every declared runtime source directory', () => {
    expect(findAuthorityBoundaryViolations(readAuthorityBoundarySources())).toEqual([])
  })
})

describe('Page files must not bypass runtime modules', () => {
  const forbiddenPatterns = [
    { pattern: /['"]\.\.[\\/].*generated[\\/]/, desc: 'direct require of generated/' },
    { pattern: /['"][^'"]*tools[\\/]/, desc: 'reference to tools/' },
  ]

  it('all page runtime sources stay behind the runtime data boundary', () => {
    const violations = readPageFiles().flatMap((file) => {
      const content = readFileContent(file)
      const rel = path.relative(MINIPROGRAM, file)
      return forbiddenPatterns
        .filter(({ pattern }) => pattern.test(content))
        .map(({ desc }) => `${rel}: ${desc}`)
    })

    expect(violations).toEqual([])
  })
})

describe('Runtime files must remain offline and mini program compatible', () => {
  it('contains no network APIs, non-asset URLs, or Node built-ins', () => {
    const manifest = JSON.parse(
      fs.readFileSync(path.resolve(__dirname, '../../data/assets/cloudbase-manifest.json'), 'utf8'),
    ) as { cdnOrigin: string; cloudPathPrefix: string }

    expect(
      findRuntimeNetworkReferences(MINIPROGRAM, {
        generatedCdnOrigin: manifest.cdnOrigin,
        generatedAssetPathPrefix: `/${manifest.cloudPathPrefix}/`,
      }),
    ).toEqual([])
  })
})

describe('domain/ modules must be pure TypeScript', () => {
  const domainDir = path.join(MINIPROGRAM, 'domain')
  if (!fs.existsSync(domainDir)) return

  const domainFiles = readTsFiles(domainDir)

  const wxPatterns = [
    { pattern: /\bwx\./, desc: 'wx global' },
    { pattern: /\bPage\s*\(/, desc: 'Page() call' },
    { pattern: /\bComponent\s*\(/, desc: 'Component() call' },
    { pattern: /\bsetData\b/, desc: 'setData' },
    { pattern: /require\s*\(/, desc: 'require() call' },
  ]

  for (const file of domainFiles) {
    const rel = path.relative(MINIPROGRAM, file)
    const content = readFileContent(file)

    for (const { pattern, desc } of wxPatterns) {
      it(`${rel} does not use ${desc}`, () => {
        expect(content).not.toMatch(pattern)
      })
    }
  }
})

describe('Presenters must not call Page or Component', () => {
  const presentersDir = path.join(MINIPROGRAM, 'presenters')
  if (!fs.existsSync(presentersDir)) return

  const files = readTsFiles(presentersDir)
  for (const file of files) {
    const rel = path.relative(MINIPROGRAM, file)
    const content = readFileContent(file)

    it(`${rel} does not call Page()`, () => {
      expect(content).not.toMatch(/\bPage\s*\(/)
    })

    it(`${rel} does not call Component()`, () => {
      expect(content).not.toMatch(/\bComponent\s*\(/)
    })

    it(`${rel} does not use wx.`, () => {
      expect(content).not.toMatch(/\bwx\./)
    })
  }
})
