import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { describe, expect, it } from 'vitest'
import { findRuntimeNetworkReferences } from '../../tools/quality/find-runtime-network-references'

describe('CloudBase generated URL runtime boundary', () => {
  it.each([
    '(new wx.cloud.Cloud({})).database()',
    'const { database } = new wx.cloud.Cloud({}); database()',
    'const db = new wx.cloud.Cloud({}).database()',
  ])('共享建構結果不能以鏈式或解構繞過 API 邊界：%s', (content) => {
    const root = mkdtempSync(join(tmpdir(), 'uwo-shared-constructor-'))
    try {
      mkdirSync(join(root, 'runtime'))
      writeFileSync(join(root, 'runtime/shared-cloud-client.ts'), content)
      expect(
        findRuntimeNetworkReferences(root, {
          allowedSharedCloudConstructorFile: 'runtime/shared-cloud-client.ts',
        }),
      ).toEqual([{ file: 'runtime/shared-cloud-client.ts', line: 1, reason: 'wx.cloud' }])
    } finally {
      rmSync(root, { recursive: true, force: true })
    }
  })
  it('共享實例只允許直接呼叫三個批准的 API，不允許資料庫或實例外洩', () => {
    const root = mkdtempSync(join(tmpdir(), 'uwo-shared-instance-'))
    try {
      mkdirSync(join(root, 'runtime'))
      writeFileSync(
        join(root, 'runtime/shared-cloud-client.ts'),
        [
          'const shared = new wx.cloud.Cloud({})',
          'shared.init()',
          'shared.callFunction({name: "fleet-config"})',
          'shared.uploadFile({})',
          'shared.database()',
          'const leaked = shared',
        ].join('\n'),
      )
      expect(
        findRuntimeNetworkReferences(root, {
          allowedSharedCloudConstructorFile: 'runtime/shared-cloud-client.ts',
        }),
      ).toEqual([
        { file: 'runtime/shared-cloud-client.ts', line: 5, reason: 'wx.cloud' },
        { file: 'runtime/shared-cloud-client.ts', line: 6, reason: 'wx.cloud' },
      ])
    } finally {
      rmSync(root, { recursive: true, force: true })
    }
  })
  it('共享建構器只允許精確入口與 new 呼叫，不豁免資料庫或其他檔案', () => {
    const root = mkdtempSync(join(tmpdir(), 'uwo-shared-boundary-'))
    try {
      mkdirSync(join(root, 'runtime'))
      mkdirSync(join(root, 'pages'))
      writeFileSync(
        join(root, 'runtime/shared-cloud-client.ts'),
        [
          'const shared = new wx.cloud.Cloud({ resourceAppid: "old", resourceEnv: "env" })',
          'wx.cloud.database()',
          'const leaked = wx.cloud.Cloud',
        ].join('\n'),
      )
      writeFileSync(join(root, 'pages/index.ts'), 'new wx.cloud.Cloud({})')
      expect(
        findRuntimeNetworkReferences(root, {
          allowedSharedCloudConstructorFile: 'runtime/shared-cloud-client.ts',
        }),
      ).toEqual([
        { file: 'pages/index.ts', line: 1, reason: 'wx.cloud' },
        { file: 'runtime/shared-cloud-client.ts', line: 2, reason: 'wx.cloud' },
        { file: 'runtime/shared-cloud-client.ts', line: 3, reason: 'wx.cloud' },
      ])
    } finally {
      rmSync(root, { recursive: true, force: true })
    }
  })
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
