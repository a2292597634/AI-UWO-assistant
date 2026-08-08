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

  it('rejects wx.cloud.callFunction in a non-allowed page', () => {
    const root = mkdtempSync(join(tmpdir(), 'uwo-local-reject-'))
    fixtureRoots.push(root)
    const pagesDir = join(root, 'pages', 'fleet')
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
    expect(findings[0].file).toContain('pages/fleet/index.ts')
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
