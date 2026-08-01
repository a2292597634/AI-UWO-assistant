/**
 * Architecture Gate: TypeScript Project Configuration
 *
 * Verify that the WeChat Mini Program TypeScript compiler plugin is enabled
 * and the project configuration matches the architecture requirements.
 */

import { describe, it, expect } from 'vitest'
import * as fs from 'node:fs'
import * as path from 'node:path'

const ROOT = path.resolve(__dirname, '../..')
const MINIPROGRAM_DIR = path.join(ROOT, 'miniprogram')

const readJson = (filePath: string): Record<string, unknown> => {
  return JSON.parse(fs.readFileSync(filePath, 'utf8')) as Record<string, unknown>
}

describe('TypeScript compiler plugin', () => {
  it('project.config.json enables typescript compiler plugin', () => {
    const config = readJson(path.join(ROOT, 'project.config.json'))
    const plugins = config.setting
      ? ((config.setting as Record<string, unknown>).useCompilerPlugins as string[] | undefined)
      : undefined
    expect(Array.isArray(plugins)).toBe(true)
    expect(plugins).toContain('typescript')
  })
})

describe('tsconfig.json', () => {
  it('has allowJs set to false', () => {
    const tsconfig = readJson(path.join(ROOT, 'tsconfig.json'))
    const opts = tsconfig.compilerOptions as Record<string, unknown>
    expect(opts.allowJs).toBe(false)
  })

  it('has noEmit set to false (IDE needs emitted JS files)', () => {
    const tsconfig = readJson(path.join(ROOT, 'tsconfig.json'))
    const opts = tsconfig.compilerOptions as Record<string, unknown>
    expect(opts.noEmit).toBe(false)
  })

  it('has strict set to true', () => {
    const tsconfig = readJson(path.join(ROOT, 'tsconfig.json'))
    const opts = tsconfig.compilerOptions as Record<string, unknown>
    expect(opts.strict).toBe(true)
  })

  it('excludes generated files and archive', () => {
    const tsconfig = readJson(path.join(ROOT, 'tsconfig.json'))
    const exclude = tsconfig.exclude as string[]
    expect(Array.isArray(exclude)).toBe(true)
    // Must exclude generated JS
    expect(exclude.some((e) => e.includes('generated'))).toBe(true)
    // Must exclude archive
    expect(exclude.some((e) => e.includes('archive'))).toBe(true)
  })
})

describe('App entry', () => {
  it('app.ts exists', () => {
    const tsPath = path.join(MINIPROGRAM_DIR, 'app.ts')
    expect(fs.existsSync(tsPath)).toBe(true)
  })

  it('app.js exists (compiled from app.ts by tsc)', () => {
    const jsPath = path.join(MINIPROGRAM_DIR, 'app.js')
    expect(fs.existsSync(jsPath)).toBe(true)
  })
})

describe('Home page', () => {
  it('pages/home/index.ts exists', () => {
    const tsPath = path.join(MINIPROGRAM_DIR, 'pages', 'home', 'index.ts')
    expect(fs.existsSync(tsPath)).toBe(true)
  })

  it('pages/home/index.js exists (compiled from index.ts by tsc)', () => {
    const jsPath = path.join(MINIPROGRAM_DIR, 'pages', 'home', 'index.js')
    expect(fs.existsSync(jsPath)).toBe(true)
  })
})
