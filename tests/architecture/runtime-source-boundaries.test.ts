/**
 * Architecture Gate: Runtime Source Boundaries
 *
 * Enforce that hand-written mini program source is TypeScript,
 * and that JS files only exist in generated/auto-generated locations.
 */

import { describe, it, expect } from 'vitest'
import * as fs from 'node:fs'
import * as path from 'node:path'
import { UI_ASSET_RECIPES } from '../../tools/ui-assets/config'

const MINIPROGRAM = path.resolve(__dirname, '../../miniprogram')

const uiAssetOutputDifferences = (declared: string[], actual: string[]): string[] => {
  const declaredSet = new Set(declared)
  const actualSet = new Set(actual)

  return [
    ...declared
      .filter((name) => !actualSet.has(name))
      .map((name) => `missing config output: ${name}`),
    ...actual
      .filter((name) => !declaredSet.has(name))
      .map((name) => `unexpected runtime entry: ${name}`),
  ].sort()
}

describe('UI asset output boundary helper', () => {
  it('reports missing outputs and entries not declared by the config', () => {
    expect(
      uiAssetOutputDifferences(['known.png', 'missing.png'], ['known.png', 'rogue.png', 'source']),
    ).toEqual([
      'missing config output: missing.png',
      'unexpected runtime entry: rogue.png',
      'unexpected runtime entry: source',
    ])
  })

  it('accepts the exact declared output set regardless of directory order', () => {
    expect(uiAssetOutputDifferences(['b.png', 'a.png'], ['a.png', 'b.png'])).toEqual([])
  })
})

// ── Whitelist: directories/files where JS is allowed ──

const JS_ALLOWED_PATTERNS = [
  /[\\/]miniprogram[\\/]generated[\\/]/, // generated data files
  /[\\/]miniprogram[\\/]subpkg-detail[\\/]details-\d+\.js$/, // detail shards
  /[\\/]miniprogram[\\/]subpkg-detail[\\/]detail-index\.js$/, // generated index
  /[\\/]miniprogram[\\/]subpkg-detail[\\/]detail-loaders\.js$/, // generated loader
  /[\\/]miniprogram[\\/]data[\\/]/, // legacy data directory
  /[\\/]miniprogram[\\/]typings[\\/]/, // type declarations
  /[\\/]miniprogram[\\/]pages[\\/]test[\\/]/, // dev-only test page (pending removal)
]

const isJsAllowed = (filePath: string): boolean =>
  JS_ALLOWED_PATTERNS.some((p) => p.test(filePath.replace(/\\/g, '/')))

// ── Find all JS files in miniprogram ──

const findJsFiles = (dir: string): string[] => {
  const results: string[] = []
  const entries = fs.readdirSync(dir, { withFileTypes: true })
  for (const entry of entries) {
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) {
      // Skip node_modules
      if (entry.name === 'node_modules') continue
      results.push(...findJsFiles(full))
    } else if (entry.name.endsWith('.js') && !entry.name.endsWith('.d.ts')) {
      results.push(full)
    }
  }
  return results
}

// ── Tests ──

describe('JS source file whitelist', () => {
  const jsFiles = findJsFiles(MINIPROGRAM)

  it('every .js file in miniprogram/ must be in the allowed whitelist', () => {
    const violations = jsFiles.filter((f) => !isJsAllowed(f))
    // Convert to relative paths for readable output
    const rel = violations.map((f) => path.relative(MINIPROGRAM, f))
    expect(rel).toEqual([])
  })
})

describe('Generated UI asset whitelist', () => {
  it('contains exactly the outputs declared by the UI asset config', () => {
    const assetsDir = path.join(MINIPROGRAM, 'assets', 'ui')
    const declared = UI_ASSET_RECIPES.map(({ output }) => output)
    const actual = fs.readdirSync(assetsDir)

    expect(uiAssetOutputDifferences(declared, actual)).toEqual([])
  })
})

describe('Hand-written pages must be TypeScript', () => {
  const pagesDir = path.join(MINIPROGRAM, 'pages')

  it('pages/home/index.ts exists', () => {
    expect(fs.existsSync(path.join(pagesDir, 'home', 'index.ts'))).toBe(true)
  })

  it('pages/home/index.js does NOT exist', () => {
    expect(fs.existsSync(path.join(pagesDir, 'home', 'index.js'))).toBe(false)
  })

  it('pages/catalog/index.ts exists', () => {
    expect(fs.existsSync(path.join(pagesDir, 'catalog', 'index.ts'))).toBe(true)
  })

  it('pages/catalog/index.js does NOT exist', () => {
    expect(fs.existsSync(path.join(pagesDir, 'catalog', 'index.js'))).toBe(false)
  })
})

describe('Detail page must be TypeScript', () => {
  const detailPage = path.join(MINIPROGRAM, 'subpkg-detail', 'pages', 'detail')

  it('detail/index.ts exists', () => {
    expect(fs.existsSync(path.join(detailPage, 'index.ts'))).toBe(true)
  })

  it('detail/index.js does NOT exist', () => {
    expect(fs.existsSync(path.join(detailPage, 'index.js'))).toBe(false)
  })
})

describe('App entry must be TypeScript', () => {
  it('app.ts exists', () => {
    expect(fs.existsSync(path.join(MINIPROGRAM, 'app.ts'))).toBe(true)
  })

  it('app.js does NOT exist', () => {
    expect(fs.existsSync(path.join(MINIPROGRAM, 'app.js'))).toBe(false)
  })
})

describe('Business image delivery must not depend on local subpackages', () => {
  it('does not keep the asset package loader or dependency store in runtime code', () => {
    expect(fs.existsSync(path.join(MINIPROGRAM, 'runtime', 'asset-package-loader.ts'))).toBe(false)
    expect(fs.existsSync(path.join(MINIPROGRAM, 'runtime', 'asset-dependency-store.ts'))).toBe(
      false,
    )
  })

  it('does not declare business asset subpackages', () => {
    const app = JSON.parse(fs.readFileSync(path.join(MINIPROGRAM, 'app.json'), 'utf8')) as {
      subpackages?: Array<{ root: string }>
    }
    expect(app.subpackages?.some(({ root }) => root.startsWith('subpkg-assets-'))).toBe(false)
  })
})
