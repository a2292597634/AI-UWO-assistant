import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { describe, expect, it } from 'vitest'
import { findRuntimeNetworkReferences } from '../../tools/quality/find-runtime-network-references'

describe('CloudBase generated URL runtime boundary', () => {
  it.each([
    [
      '{"portraitPath":"https://cdn.example/assets/a.png","name":"https://cdn.example/assets/b.png"}',
      1,
    ],
    ['{"portraitPath":"https://cdn.example/assets/a.png?x=1"}', 1],
    ['{"portraitPath":"https://cdn.example/assets/a.png#x"}', 1],
    ['{"portraitPath":"https://evil.example/assets/a.png"}', 1],
    ['{"portraitPath":"https://cdn.example/assets-evil/a.png"}', 1],
    [
      '{"portraitPath":"https://cdn.example/assets/a.png","pp":"https://cdn.example/assets/b.png"}',
      0,
    ],
    ['{"portraitPath":`https://cdn.example/assets/${name}.png`}', 1],
    ['{"portraitPath":`https\\u003a\\u002f\\u002fcdn.example/assets/${name}.png`}', 1],
    ['{"portraitPath":`${name}https\\u003a\\u002f\\u002fcdn.example/assets/${name}.png`}', 1],
    ['{"portraitPath":`${name}https\\u003a\\u002f\\u002fcdn.example/assets/a.png`}', 1],
    ['{"portraitPath":`https\\u003a\\u002f\\u002fcdn.example/assets/a.png`}', 0],
  ])('逐一校驗圖片欄位值，不豁免同一行其他 URL：%s', (content, count) => {
    const root = mkdtempSync(join(tmpdir(), 'uwo-cdn-fields-'))
    try {
      mkdirSync(join(root, 'generated'))
      writeFileSync(join(root, 'generated/catalog.js'), `module.exports = [${content}]`)
      expect(
        findRuntimeNetworkReferences(root, {
          generatedCdnOrigin: 'https://cdn.example',
          generatedAssetPathPrefix: '/assets/',
        }),
      ).toHaveLength(count)
    } finally {
      rmSync(root, { recursive: true, force: true })
    }
  })

  it('非 JavaScript 檔案中的遠程 URL 仍會被掃描', () => {
    const root = mkdtempSync(join(tmpdir(), 'uwo-network-wxml-'))
    try {
      writeFileSync(join(root, 'index.wxml'), '<image src="https://cdn.example/assets/a.png" />')
      expect(findRuntimeNetworkReferences(root)).toEqual([
        { file: 'index.wxml', line: 1, reason: 'remote URL' },
      ])
    } finally {
      rmSync(root, { recursive: true, force: true })
    }
  })
  it('allows only generated asset fields on the configured origin', () => {
    const root = mkdtempSync(join(tmpdir(), 'uwo-runtime-network-'))
    try {
      mkdirSync(join(root, 'generated'), { recursive: true })
      mkdirSync(join(root, 'subpkg-trade'), { recursive: true })
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
        join(root, 'subpkg-trade', 'trade-goods.js'),
        'module.exports = [{"iconPath":"https://uwo-prod-123.tcb.qcloud.la/assets/1.0.0-release/trade_trade0101.png"}]\n',
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
