import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { describe, expect, it } from 'vitest'
import {
  readMiniProgramConfig,
  analyzeMiniProgramPackage,
  assertMiniProgramPackageBudget,
} from '../../tools/quality/check-miniprogram-package-size'

function createFixture(): string {
  const root = mkdtempSync(join(tmpdir(), 'uwo-pkg-size-'))
  const mp = join(root, 'miniprogram')
  mkdirSync(join(mp, 'assets', 'ui'), { recursive: true })
  mkdirSync(join(mp, 'subpkg-a0', 'imgs'), { recursive: true })
  mkdirSync(join(mp, 'subpkg-detail', 'pages'), { recursive: true })
  mkdirSync(join(mp, 'pages'), { recursive: true })

  // project.config.json
  writeFileSync(
    join(root, 'project.config.json'),
    JSON.stringify({ miniprogramRoot: 'miniprogram/' }),
  )

  // app.json with only subpkg-detail declared as a real subpackage
  writeFileSync(
    join(mp, 'app.json'),
    JSON.stringify({
      pages: ['pages/index'],
      subpackages: [{ root: 'subpkg-detail', name: 'detail', pages: ['pages/detail/index'] }],
    }),
  )

  // Allowed media
  writeFileSync(join(mp, 'assets', 'ui', 'keep.png'), Buffer.alloc(100, 0))
  // Disallowed media — root-level business PNG
  writeFileSync(join(mp, 'assets', 'business.png'), Buffer.alloc(50, 0))
  // Disallowed media — undeclared subpackage in main package
  writeFileSync(join(mp, 'subpkg-a0', 'imgs', 'legacy.png'), Buffer.alloc(75, 0))
  // Declared subpackage file (should be excluded from main package)
  writeFileSync(join(mp, 'subpkg-detail', 'pages', 'detail.js'), Buffer.alloc(200, 'x'))

  // Non-media main-package source to contribute to total size
  writeFileSync(join(mp, 'pages', 'index.js'), Buffer.alloc(1024, 'x'))

  return root
}

describe('miniprogram package size scanner', () => {
  it('reads miniprogramRoot from project.config.json and subpackages from app.json', () => {
    const root = createFixture()
    try {
      const config = readMiniProgramConfig(root)
      expect(config.miniprogramRoot).toBe('miniprogram')
      expect(config.subpackageRoots).toEqual(['subpkg-detail'])
    } finally {
      rmSync(root, { recursive: true, force: true })
    }
  })

  it('excludes declared subpackage files from main package stats', () => {
    const root = createFixture()
    try {
      const config = readMiniProgramConfig(root)
      const report = analyzeMiniProgramPackage({
        projectRoot: root,
        miniprogramRoot: config.miniprogramRoot,
        subpackageRoots: config.subpackageRoots,
      })

      // subpkg-detail should NOT be in main package
      const detailFiles = report.largestFiles.filter((f) => f.path.startsWith('subpkg-detail'))
      expect(detailFiles).toHaveLength(0)

      // subpkg-a0 (undeclared) IS in main package
      const a0Files = report.largestFiles.filter((f) => f.path.startsWith('subpkg-a0'))
      expect(a0Files.length).toBeGreaterThan(0)
    } finally {
      rmSync(root, { recursive: true, force: true })
    }
  })

  it('allows assets/ui/ media and flags other media as disallowed', () => {
    const root = createFixture()
    try {
      const config = readMiniProgramConfig(root)
      const report = analyzeMiniProgramPackage({
        projectRoot: root,
        miniprogramRoot: config.miniprogramRoot,
        subpackageRoots: config.subpackageRoots,
      })

      // assets/ui/keep.png should NOT be in disallowedMedia
      expect(report.disallowedMedia).not.toContain('assets/ui/keep.png')

      // assets/business.png should be disallowed
      expect(report.disallowedMedia).toContain('assets/business.png')

      // subpkg-a0/imgs/legacy.png should be disallowed
      expect(report.disallowedMedia).toContain('subpkg-a0/imgs/legacy.png')
    } finally {
      rmSync(root, { recursive: true, force: true })
    }
  })

  it('throws with main package KB when budget is exceeded', () => {
    const root = createFixture()
    try {
      const config = readMiniProgramConfig(root)
      const report = analyzeMiniProgramPackage({
        projectRoot: root,
        miniprogramRoot: config.miniprogramRoot,
        subpackageRoots: config.subpackageRoots,
      })

      // Set budget very low to trigger failure
      expect(() => assertMiniProgramPackageBudget(report, { maxMainPackageBytes: 10 })).toThrow(
        /Main package.*KB/,
      )
    } finally {
      rmSync(root, { recursive: true, force: true })
    }
  })

  it('returns largestFiles sorted by bytes descending', () => {
    const root = createFixture()
    try {
      const config = readMiniProgramConfig(root)
      const report = analyzeMiniProgramPackage({
        projectRoot: root,
        miniprogramRoot: config.miniprogramRoot,
        subpackageRoots: config.subpackageRoots,
      })

      expect(report.largestFiles.length).toBeGreaterThan(0)
      for (let i = 1; i < report.largestFiles.length; i++) {
        expect(report.largestFiles[i - 1].bytes).toBeGreaterThanOrEqual(
          report.largestFiles[i].bytes,
        )
      }
    } finally {
      rmSync(root, { recursive: true, force: true })
    }
  })

  it('passes budget check when main package is below threshold and no disallowed media', () => {
    const root = createFixture()
    try {
      const config = readMiniProgramConfig(root)
      const report = analyzeMiniProgramPackage({
        projectRoot: root,
        miniprogramRoot: config.miniprogramRoot,
        subpackageRoots: config.subpackageRoots,
      })

      // Remove disallowed media from report to test pure size check pass
      const cleanReport = { ...report, disallowedMedia: [] }
      // Budget high enough to pass (~1.4KB of source in fixture)
      expect(() =>
        assertMiniProgramPackageBudget(cleanReport, { maxMainPackageBytes: 10 * 1024 }),
      ).not.toThrow()
    } finally {
      rmSync(root, { recursive: true, force: true })
    }
  })
})
