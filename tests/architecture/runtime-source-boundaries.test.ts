/**
 * Architecture Gate: Runtime Source Boundaries
 *
 * Enforce that hand-written mini program source is TypeScript,
 * and that JS files only exist in generated/auto-generated locations.
 */

import { describe, it, expect } from 'vitest'
import * as fs from 'node:fs'
import * as path from 'node:path'

const MINIPROGRAM = path.resolve(__dirname, '../../miniprogram')

// ── Whitelist: directories/files where JS is allowed ──

const JS_ALLOWED_PATTERNS = [
  /[\\/]miniprogram[\\/]generated[\\/]/, // generated data files
  /[\\/]miniprogram[\\/]subpkg-detail[\\/]details-\d+\.js$/, // detail shards
  /[\\/]miniprogram[\\/]subpkg-detail[\\/]detail-index\.js$/, // generated index
  /[\\/]miniprogram[\\/]subpkg-detail[\\/]detail-loaders\.js$/, // generated loader
  /[\\/]miniprogram[\\/]subpkg-a\d[\\/]/, // asset subpackages
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
