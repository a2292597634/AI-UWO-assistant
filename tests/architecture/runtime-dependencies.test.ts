/**
 * Architecture Gate: Runtime Dependency Rules
 *
 * Enforce that pages and domain modules don't have forbidden dependencies:
 *  - Pages must not directly require generated data, data/master, archive, or tools
 *  - domain/ must not contain wx, Page, Component, or setData
 */

import { describe, it, expect } from 'vitest'
import * as fs from 'node:fs'
import * as path from 'node:path'

const MINIPROGRAM = path.resolve(__dirname, '../../miniprogram')

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

const readFileContent = (filePath: string): string =>
  fs.readFileSync(filePath, 'utf8')

// ── Tests ──

describe('Page files must not import forbidden paths', () => {
  const pageFiles = [
    path.join(MINIPROGRAM, 'pages/home/index.ts'),
    path.join(MINIPROGRAM, 'pages/catalog/index.ts'),
    path.join(MINIPROGRAM, 'subpkg-detail/pages/detail/index.ts'),
  ].filter((f) => fs.existsSync(f))

  const forbiddenPatterns = [
    { pattern: /['"]\.\.\/.*generated\//, desc: 'direct require of generated/' },
    { pattern: /['"][^'"]*data\/master/, desc: 'import of data/master' },
    { pattern: /['"][^'"]*archive\//, desc: 'import of archive/' },
    { pattern: /['"][^'"]*tools\//, desc: 'import of tools/' },
  ]

  for (const file of pageFiles) {
    const rel = path.relative(MINIPROGRAM, file)

    for (const { pattern, desc } of forbiddenPatterns) {
      it(`${rel} does not contain ${desc}`, () => {
        const content = readFileContent(file)
        expect(content).not.toMatch(pattern)
      })
    }
  }
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
