import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { describe, expect, it } from 'vitest'
import { findRuntimeNetworkReferences } from '../../tools/quality/find-runtime-network-references'

describe('CloudBase generated URL runtime boundary', () => {
  it('allows only generated asset fields on the configured origin', () => {
    const root = mkdtempSync(join(tmpdir(), 'uwo-runtime-network-'))
    try {
      mkdirSync(join(root, 'generated'), { recursive: true })
      mkdirSync(join(root, 'pages'), { recursive: true })
      writeFileSync(
        join(root, 'generated', 'catalog.js'),
        'module.exports = [{"portraitPath":"https://uwo-prod-123.tcb.qcloud.la/assets/1.0.0-release/officer.png"}]\n',
      )
      writeFileSync(
        join(root, 'generated', 'unexpected.js'),
        'module.exports = {"url":"https://uwo-prod-123.tcb.qcloud.la/assets/1.0.0-release/rogue.png"}\n',
      )
      writeFileSync(
        join(root, 'pages', 'index.ts'),
        'const endpoint = "https://uwo-prod-123.tcb.qcloud.la/api"\n',
      )

      const findings = findRuntimeNetworkReferences(root, {
        generatedCdnOrigin: 'https://uwo-prod-123.tcb.qcloud.la',
        generatedAssetPathPrefix: '/assets/',
      })

      expect(findings).toEqual([
        expect.objectContaining({ file: 'generated/unexpected.js', reason: 'remote URL' }),
        expect.objectContaining({ file: 'pages/index.ts', reason: 'remote URL' }),
      ])
    } finally {
      rmSync(root, { recursive: true, force: true })
    }
  })
})
