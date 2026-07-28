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
})
