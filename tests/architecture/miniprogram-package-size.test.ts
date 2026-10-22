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

  it('uses a default budget no greater than 1.9 MiB', () => {
    expect(() =>
      assertMiniProgramPackageBudget({
        mainPackageBytes: 1.95 * 1024 * 1024,
        mainPackageFiles: 1,
        disallowedMedia: [],
        largestFiles: [],
      }),
    ).toThrow(/budget/)
  })

  it('大常量 TS 的編譯 JS 會計入預算並攔截超限', () => {
    const root = createFixture()
    try {
      writeFileSync(
        join(root, 'miniprogram', 'pages', 'source-only.ts'),
        `export const payload = ${JSON.stringify('x'.repeat(2 * 1024 * 1024))}`,
      )
      const config = readMiniProgramConfig(root)
      const report = analyzeMiniProgramPackage({
        projectRoot: root,
        miniprogramRoot: config.miniprogramRoot,
        subpackageRoots: config.subpackageRoots,
      })

      expect(report.largestFiles).not.toContainEqual(
        expect.objectContaining({ path: 'pages/source-only.ts' }),
      )
      expect(report.largestFiles).toContainEqual(
        expect.objectContaining({ path: 'pages/source-only.js' }),
      )
      expect(() => assertMiniProgramPackageBudget({ ...report, disallowedMedia: [] })).toThrow(
        /budget/,
      )
    } finally {
      rmSync(root, { recursive: true, force: true })
    }
  })

  it('排除宣告檔並以編譯 JS 取代同名既有 JS，避免重複計數', () => {
    const root = createFixture()
    try {
      const analyze = () =>
        analyzeMiniProgramPackage({
          projectRoot: root,
          miniprogramRoot: 'miniprogram',
          subpackageRoots: ['subpkg-detail'],
        })
      writeFileSync(
        join(root, 'miniprogram/pages/source.ts'),
        'export const payload: string = "實際程式"',
      )
      const baseline = analyze()
      writeFileSync(join(root, 'miniprogram/pages/source.js'), 'x'.repeat(50000))
      writeFileSync(
        join(root, 'miniprogram/pages/types.d.ts'),
        'declare const value: string;'.repeat(5000),
      )
      const report = analyze()
      expect(report.mainPackageBytes).toBe(baseline.mainPackageBytes)
      expect(report.mainPackageFiles).toBe(baseline.mainPackageFiles)
      expect(report.largestFiles.filter((file) => file.path === 'pages/source.js')).toHaveLength(1)
    } finally {
      rmSync(root, { recursive: true, force: true })
    }
  })

  it('無效 TS 語法會使估算失敗，不能漏算後通過', () => {
    const root = createFixture()
    try {
      writeFileSync(join(root, 'miniprogram/pages/broken.ts'), 'export const value: = ;')
      expect(() =>
        analyzeMiniProgramPackage({
          projectRoot: root,
          miniprogramRoot: 'miniprogram',
          subpackageRoots: ['subpkg-detail'],
        }),
      ).toThrow(/broken.ts/)
    } finally {
      rmSync(root, { recursive: true, force: true })
    }
  })

  it('TS 型別診斷錯誤會使估算失敗', () => {
    const root = createFixture()
    try {
      writeFileSync(
        join(root, 'miniprogram/pages/invalid-type.ts'),
        'export const value: number = "不是數字"',
      )
      expect(() =>
        analyzeMiniProgramPackage({
          projectRoot: root,
          miniprogramRoot: 'miniprogram',
          subpackageRoots: ['subpkg-detail'],
        }),
      ).toThrow(/invalid-type.ts/)
    } finally {
      rmSync(root, { recursive: true, force: true })
    }
  })

  it('私有設定的 minified 會覆蓋共用設定，缺少覆蓋值時保留共用值', () => {
    const root = createFixture()
    try {
      const analyze = () =>
        analyzeMiniProgramPackage({
          projectRoot: root,
          miniprogramRoot: 'miniprogram',
          subpackageRoots: ['subpkg-detail'],
        })
      writeFileSync(join(root, 'miniprogram/pages/private.ts'), 'export const payload = "繁體內容"')
      writeFileSync(
        join(root, 'project.config.json'),
        JSON.stringify({ setting: { minified: true } }),
      )
      const minified = analyze()
      writeFileSync(
        join(root, 'project.private.config.json'),
        JSON.stringify({ setting: { minified: false } }),
      )
      expect(analyze().mainPackageBytes).toBeGreaterThan(minified.mainPackageBytes)
      writeFileSync(
        join(root, 'project.private.config.json'),
        JSON.stringify({ setting: { urlCheck: true } }),
      )
      expect(analyze().mainPackageBytes).toBe(minified.mainPackageBytes)
    } finally {
      rmSync(root, { recursive: true, force: true })
    }
  })

  it('按 project.config 的 minified 設定估算，保留字串／正則與巢狀模板', () => {
    const root = createFixture()
    try {
      writeFileSync(
        join(root, 'miniprogram/pages/complex.ts'),
        'export const value = { url: "https://local///*keep*/", pattern: /a\\/\\/b/, template: `外${`內${1}`}層` }; // 註釋\n'.repeat(
          1,
        ),
      )
      const analyze = () =>
        analyzeMiniProgramPackage({
          projectRoot: root,
          miniprogramRoot: 'miniprogram',
          subpackageRoots: ['subpkg-detail'],
        })
      const unminified = analyze()
      writeFileSync(
        join(root, 'project.config.json'),
        JSON.stringify({ setting: { minified: true } }),
      )
      const minified = analyze()
      expect(minified.mainPackageBytes).toBeLessThan(unminified.mainPackageBytes)
      const compiled = minified.largestFiles.find((file) => file.path === 'pages/complex.js')
      expect(compiled?.bytes).toBeGreaterThan(100)
    } finally {
      rmSync(root, { recursive: true, force: true })
    }
  })

  it('minified=false 計入未壓縮 TS 編譯輸出，不能偷偷刪除普通註釋', () => {
    const root = createFixture()
    try {
      writeFileSync(
        join(root, 'miniprogram/pages/comments.ts'),
        `/*${'註釋'.repeat(1000)}*/\nexport const value = 1`,
      )
      const report = analyzeMiniProgramPackage({
        projectRoot: root,
        miniprogramRoot: 'miniprogram',
        subpackageRoots: ['subpkg-detail'],
      })
      expect(report.compiledTsBytes).toBeGreaterThan(6000)
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
        assertMiniProgramPackageBudget(cleanReport, { maxMainPackageBytes: 64 * 1024 }),
      ).not.toThrow()
    } finally {
      rmSync(root, { recursive: true, force: true })
    }
  })
})
