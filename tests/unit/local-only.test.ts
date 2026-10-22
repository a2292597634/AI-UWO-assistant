import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { findRuntimeNetworkReferences } from '../../tools/quality/find-runtime-network-references'

const fixtureRoots: string[] = []

const fixture = (content: string): string => {
  const root = mkdtempSync(join(tmpdir(), 'uwo-local-only-'))
  fixtureRoots.push(root)
  mkdirSync(join(root, 'pages'), { recursive: true })
  writeFileSync(join(root, 'pages', 'index.ts'), content, 'utf8')
  return root
}

afterEach(() => {
  for (const root of fixtureRoots.splice(0)) {
    rmSync(root, { recursive: true, force: true })
  }
})

describe('findRuntimeNetworkReferences', () => {
  it('留言板服務只放行 callFunction，database 與 uploadFile 仍被拒絕', () => {
    const root = mkdtempSync(join(tmpdir(), 'uwo-message-board-boundary-'))
    fixtureRoots.push(root)
    mkdirSync(join(root, 'runtime'), { recursive: true })
    writeFileSync(
      join(root, 'runtime/message-board-service.ts'),
      "wx.cloud.callFunction({ name: 'message-board' })\nwx.cloud.database()\nwx.cloud.uploadFile({})",
    )
    const findings = findRuntimeNetworkReferences(root, {
      allowedCloudFunctionFiles: ['runtime/message-board-service.ts'],
    })
    expect(findings.map((item) => item.line)).toEqual([2, 3])
    expect(findings.every((item) => item.reason === 'wx.cloud')).toBe(true)
  })
  it('accepts local mini-program assets', () => {
    expect(
      findRuntimeNetworkReferences(fixture("const portrait = '/assets/officers/1.png'")),
    ).toEqual([])
  })
  it('reports remote HTTP asset URLs with their source location', () => {
    expect(
      findRuntimeNetworkReferences(
        fixture("const portrait = 'https://example.com/officers/1.png'"),
      ),
    ).toEqual([
      {
        file: 'pages/index.ts',
        line: 1,
        reason: 'remote URL',
      },
    ])
  })
  it.each([
    'const endpoint = `https\\u003a\\u002f\\u002fcdn.example/assets/${name}.png`',
    'const endpoint = `${name}https\\u003a\\u002f\\u002fcdn.example/assets/${name}.png`',
    'const endpoint = `${name}https\\u003a\\u002f\\u002fcdn.example/assets/a.png`',
  ])('動態模板各固定片段的跳脫 URL 仍須拒絕：%s', (content) => {
    expect(findRuntimeNetworkReferences(fixture(content))).toEqual([
      { file: 'pages/index.ts', line: 1, reason: 'remote URL' },
    ])
  })
  it.each([
    ["wx.request({ url: '/api' })", 'wx.request'],
    ["wx.downloadFile({ url: '/asset' })", 'wx.downloadFile'],
    ['wx.cloud.init()', 'wx.cloud'],
  ] as const)('reports forbidden runtime API %s', (content, reason) => {
    expect(findRuntimeNetworkReferences(fixture(content))).toEqual([
      {
        file: 'pages/index.ts',
        line: 1,
        reason,
      },
    ])
  })

  it.each([
    ['wx["request"]', 'wx.request'],
    ['wx["downloadFile"]({})', 'wx.downloadFile'],
    ['wx["cloud"].database()', 'wx.cloud'],
    ['wx.cloud["database"]()', 'wx.cloud'],
  ] as const)('括號 API 存取也遵守網路邊界：%s', (content, reason) => {
    expect(findRuntimeNetworkReferences(fixture(content))).toEqual([
      { file: 'pages/index.ts', line: 1, reason },
    ])
  })

  it('括號形式只放行指定檔案的精確 callFunction 呼叫', () => {
    const root = fixture('wx["cloud"]["callFunction"]({});\nwx["cloud"].database()')
    expect(
      findRuntimeNetworkReferences(root, { allowedCloudFunctionFiles: ['pages/index.ts'] }),
    ).toEqual([{ file: 'pages/index.ts', line: 2, reason: 'wx.cloud' }])
  })

  it('不得透過獲取白名單 API 的函數引用繞過精確呼叫限制', () => {
    const root = fixture('const invoke = wx.cloud.callFunction')
    expect(
      findRuntimeNetworkReferences(root, { allowedCloudFunctionFiles: ['pages/index.ts'] }),
    ).toEqual([{ file: 'pages/index.ts', line: 1, reason: 'wx.cloud' }])
  })

  // ── CloudBase allowlist ──

  it('allows wx.cloud.callFunction in an allowed file', () => {
    const root = mkdtempSync(join(tmpdir(), 'uwo-local-allow-'))
    fixtureRoots.push(root)
    const runtimeDir = join(root, 'runtime')
    mkdirSync(runtimeDir, { recursive: true })
    writeFileSync(
      join(runtimeDir, 'fleet-config-service.ts'),
      "wx.cloud.callFunction({ name: 'fleet-config', data: { action: 'listMyConfigs' } })",
      'utf8',
    )

    expect(
      findRuntimeNetworkReferences(root, {
        allowedCloudFunctionFiles: ['runtime/fleet-config-service.ts'],
      }),
    ).toEqual([])
  })

  it('只允許指定附件服務使用 wx.cloud.uploadFile', () => {
    const root = mkdtempSync(join(tmpdir(), 'uwo-local-upload-allow-'))
    fixtureRoots.push(root)
    const runtimeDir = join(root, 'runtime')
    mkdirSync(runtimeDir, { recursive: true })
    writeFileSync(
      join(runtimeDir, 'error-report-service.ts'),
      "wx.cloud.uploadFile({ cloudPath: 'reports/1.jpg', filePath: '/tmp/1.jpg' })",
      'utf8',
    )

    expect(
      findRuntimeNetworkReferences(root, {
        allowedCloudUploadFiles: ['runtime/error-report-service.ts'],
      }),
    ).toEqual([])
  })

  it('allows coupon redemption CloudBase call only in its runtime adapter', () => {
    const root = mkdtempSync(join(tmpdir(), 'uwo-local-coupon-allow-'))
    fixtureRoots.push(root)
    const runtimeDir = join(root, 'runtime')
    mkdirSync(runtimeDir, { recursive: true })
    writeFileSync(
      join(runtimeDir, 'coupon-redemption-service.ts'),
      "wx.cloud.callFunction({ name: 'coupon-redemption', data: { couponNo: 'secret' } })",
      'utf8',
    )

    expect(
      findRuntimeNetworkReferences(root, {
        allowedCloudFunctionFiles: ['runtime/coupon-redemption-service.ts'],
      }),
    ).toEqual([])
  })

  it('rejects wx.cloud.callFunction in a non-allowed page', () => {
    const root = mkdtempSync(join(tmpdir(), 'uwo-local-reject-'))
    fixtureRoots.push(root)
    const pagesDir = join(root, 'subpkg-fleet', 'pages', 'index')
    mkdirSync(pagesDir, { recursive: true })
    writeFileSync(
      join(pagesDir, 'index.ts'),
      "wx.cloud.callFunction({ name: 'fleet-config' })",
      'utf8',
    )

    const findings = findRuntimeNetworkReferences(root, {
      allowedCloudFunctionFiles: ['runtime/fleet-config-service.ts'],
    })
    expect(findings).toHaveLength(1)
    expect(findings[0].reason).toBe('wx.cloud')
    expect(findings[0].file).toContain('subpkg-fleet/pages/index/index.ts')
  })

  it('allows wx.cloud.init only in app.ts', () => {
    const root = mkdtempSync(join(tmpdir(), 'uwo-local-init-'))
    fixtureRoots.push(root)
    writeFileSync(join(root, 'app.ts'), "wx.cloud.init({ env: 'test-env' })", 'utf8')

    expect(
      findRuntimeNetworkReferences(root, {
        allowedCloudInitFiles: ['app.ts'],
      }),
    ).toEqual([])
  })

  it('allows the exact wx.cloud availability guard in app.ts', () => {
    const root = mkdtempSync(join(tmpdir(), 'uwo-local-init-guard-'))
    fixtureRoots.push(root)
    writeFileSync(join(root, 'app.ts'), 'if (wx.cloud) {\n}', 'utf8')

    expect(
      findRuntimeNetworkReferences(root, {
        allowedCloudInitFiles: ['app.ts'],
      }),
    ).toEqual([])
  })

  it('ignores wx.cloud mentions in comments', () => {
    const root = mkdtempSync(join(tmpdir(), 'uwo-local-comment-'))
    fixtureRoots.push(root)
    writeFileSync(join(root, 'runtime.ts'), '/* wx.cloud.callFunction() */\n', 'utf8')

    expect(findRuntimeNetworkReferences(root)).toEqual([])
  })

  it('rejects wx.cloud.callFunction even when it appears in app.ts', () => {
    const root = mkdtempSync(join(tmpdir(), 'uwo-local-init-call-function-'))
    fixtureRoots.push(root)
    writeFileSync(
      join(root, 'app.ts'),
      "wx.cloud.init({ env: 'test-env' }); wx.cloud.callFunction({ name: 'fleet-config' })",
      'utf8',
    )

    expect(
      findRuntimeNetworkReferences(root, {
        allowedCloudInitFiles: ['app.ts'],
      }),
    ).toEqual([
      {
        file: 'app.ts',
        line: 1,
        reason: 'wx.cloud',
      },
    ])
  })

  it('rejects other wx.cloud APIs even when they appear in app.ts', () => {
    const root = mkdtempSync(join(tmpdir(), 'uwo-local-init-database-'))
    fixtureRoots.push(root)
    writeFileSync(join(root, 'app.ts'), 'wx.cloud.database()', 'utf8')

    expect(
      findRuntimeNetworkReferences(root, {
        allowedCloudInitFiles: ['app.ts'],
      }),
    ).toEqual([
      {
        file: 'app.ts',
        line: 1,
        reason: 'wx.cloud',
      },
    ])
  })

  it('rejects wx.cloud.init in non-allowed files', () => {
    const root = mkdtempSync(join(tmpdir(), 'uwo-local-init-reject-'))
    fixtureRoots.push(root)
    const pagesDir = join(root, 'pages', 'index')
    mkdirSync(pagesDir, { recursive: true })
    writeFileSync(join(pagesDir, 'index.ts'), "wx.cloud.init({ env: 'bad' })", 'utf8')

    const findings = findRuntimeNetworkReferences(root, {
      allowedCloudInitFiles: ['app.ts'],
    })
    expect(findings).toHaveLength(1)
    expect(findings[0].reason).toBe('wx.cloud')
  })
})
