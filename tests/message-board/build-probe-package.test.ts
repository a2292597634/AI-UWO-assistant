import { cpSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { createRequire } from 'node:module'
import vm from 'node:vm'
import { afterEach, describe, expect, it } from 'vitest'
import { buildProbePackages } from '../../tools/message-board/build-probe-package'

const roots: string[] = []
const fresh = () => {
  const root = mkdtempSync(join(tmpdir(), 'uwo-board-package-'))
  roots.push(root)
  return root
}
const options = () => ({
  sourceRoot: resolve('.'),
  outputRoot: join(fresh(), 'packages'),
  candidateSha: 'a'.repeat(40),
})
afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true })
})

describe('自包含 G0 探測包', () => {
  it('私有集合／回調範圍固化到包，只授權 RPC 圖片安全 API，HTTP 包自包含', () => {
    const sharedEnvironment = {
      environmentId: 'cloud1-d7gxfuxfe813b4eaa',
      runId: 'g0-shared-private-build',
      expiresAt: new Date(Date.now() + 7200000).toISOString(),
      scope: 'private-avatar-callback' as const,
    }
    const built = buildProbePackages({ ...options(), sharedEnvironment })
    for (const item of built.packages) {
      const pkg = JSON.parse(readFileSync(join(item.path, 'config.json'), 'utf8'))
      expect(pkg.permissions.openapi).toEqual(
        item.name.endsWith('-rpc') ? ['security.mediaCheckAsync'] : [],
      )
      const require = createRequire(join(item.path, 'index.js'))
      expect(require('./private-avatar.js').invoke).toBeTypeOf('function')
    }
    const manifest = JSON.parse(
      readFileSync(join(built.packages[0].path, '../manifest.json'), 'utf8'),
    )
    expect(manifest.sharedEnvironmentAuthorization).toEqual(sharedEnvironment)
  })
  it('傳輸測試範圍必須固化到包身份，沒有內容安全 API 權限', () => {
    const sharedEnvironment = {
      environmentId: 'cloud1-d7gxfuxfe813b4eaa',
      runId: 'g0-shared-transport',
      expiresAt: new Date(Date.now() + 3600000).toISOString(),
      scope: 'transport-only' as const,
    }
    const built = buildProbePackages({ ...options(), sharedEnvironment })
    const baseline = buildProbePackages({
      ...options(),
      sharedEnvironment: { ...sharedEnvironment, scope: 'identity-text' as const },
    })
    expect(built.buildSha).not.toBe(baseline.buildSha)
    const manifest = JSON.parse(
      readFileSync(join(built.packages[0].path, '../manifest.json'), 'utf8'),
    )
    expect(manifest.sharedEnvironmentAuthorization.scope).toBe('transport-only')
    expect(
      JSON.parse(readFileSync(join(built.packages[0].path, 'config.json'), 'utf8')).permissions
        .openapi,
    ).toEqual([])
  })
  it('共享環境授權固化到真正生成入口，環境變量不能改為另一批次', async () => {
    const sharedEnvironment = {
      environmentId: 'cloud1-d7gxfuxfe813b4eaa',
      runId: 'g0-shared-build',
      expiresAt: new Date(Date.now() + 3600000).toISOString(),
    }
    const built = buildProbePackages({ ...options(), sharedEnvironment })
    const packageRoot = built.packages[0].path
    const cloud = {
      DYNAMIC_CURRENT_ENV: 'dynamic',
      init() {},
      getWXContext: () => ({
        ENV: sharedEnvironment.environmentId,
        APPID: 'wx0000000000000001',
        OPENID: 'author-a',
        SOURCE: 'wx_client',
      }),
    }
    const exports: Record<string, unknown> = {}
    const localRequire = createRequire(join(packageRoot, 'index.js'))
    const env = {
      MESSAGE_BOARD_PROBE_ENABLED: 'true',
      MESSAGE_BOARD_PROBE_TEST_ENV: sharedEnvironment.environmentId,
      MESSAGE_BOARD_PROBE_RUN_ID: sharedEnvironment.runId,
      MESSAGE_BOARD_PROBE_APP_ID: 'wx0000000000000001',
    }
    vm.runInNewContext(readFileSync(join(packageRoot, 'index.js'), 'utf8'), {
      exports,
      require: (name: string) => (name === 'wx-server-sdk' ? cloud : localRequire(name)),
      process: { env },
    })
    const main = exports.main as (event: object, context: object) => Promise<unknown>
    expect(await main({ action: 'getIdentity' }, {})).toMatchObject({
      ok: true,
      data: { runId: sharedEnvironment.runId },
    })
    env.MESSAGE_BOARD_PROBE_RUN_ID = 'g0-shared-other'
    expect(await main({ action: 'getIdentity' }, {})).toMatchObject({
      ok: false,
      code: 'environment-forbidden',
    })
    const manifest = JSON.parse(
      readFileSync(join(built.packages[0].path, '../manifest.json'), 'utf8'),
    )
    expect(manifest.sharedEnvironmentAuthorization).toEqual({
      ...sharedEnvironment,
      scope: 'identity-text',
    })
    expect(JSON.parse(readFileSync(join(packageRoot, 'config.json'), 'utf8'))).toEqual({
      permissions: { openapi: ['security.msgSecCheck'] },
    })
  })
  it.each(['environment', 'run', 'expiry', 'too-long'])(
    '拒絕不符合共享環境邊界的 %s 組包參數',
    (invalid) => {
      const sharedEnvironment = {
        environmentId: 'cloud1-d7gxfuxfe813b4eaa',
        runId: 'g0-shared-build',
        expiresAt: new Date(Date.now() + 3600000).toISOString(),
      }
      if (invalid === 'environment') sharedEnvironment.environmentId = 'other-env'
      if (invalid === 'run') sharedEnvironment.runId = 'ordinary-run'
      if (invalid === 'expiry') sharedEnvironment.expiresAt = 'invalid'
      if (invalid === 'too-long')
        sharedEnvironment.expiresAt = new Date(Date.now() + 172800000).toISOString()
      expect(() => buildProbePackages({ ...options(), sharedEnvironment })).toThrow(
        'PROBE_SHARED_AUTHORIZATION_INVALID',
      )
    },
  )
  it('每個包都含本包所需共享程式，沒有跨函數 require', () => {
    const result = buildProbePackages(options())
    expect(result.packages).toHaveLength(3)
    for (const item of result.packages) {
      expect(readFileSync(join(item.path, 'shared.js'), 'utf8')).not.toHaveLength(0)
      const pkg = JSON.parse(readFileSync(join(item.path, 'package.json'), 'utf8'))
      expect(pkg.dependencies).toEqual({ 'wx-server-sdk': '4.0.2' })
      const require = createRequire(join(item.path, 'index.js'))
      expect(require('./probe.js').createProbe).toBeTypeOf('function')
    }
  })
  it('相同來源在不同輸出根的包 hash 完全一致', () => {
    const first = buildProbePackages(options())
    const second = buildProbePackages(options())
    expect(first.packages.map((x) => [x.name, x.sha256])).toEqual(
      second.packages.map((x) => [x.name, x.sha256]),
    )
    expect(first.buildSha).toBe(second.buildSha)
  })
  it('執行實際生成入口時預設停用，沒有呼叫雲端寫入', async () => {
    const built = buildProbePackages(options())
    const packageRoot = built.packages[0].path
    let contextReads = 0
    const cloud = {
      DYNAMIC_CURRENT_ENV: 'dynamic',
      init() {},
      getWXContext() {
        contextReads++
        throw new Error('unexpected context')
      },
    }
    const exports: Record<string, unknown> = {}
    const localRequire = createRequire(join(packageRoot, 'index.js'))
    const sandbox = {
      exports,
      require: (name: string) => (name === 'wx-server-sdk' ? cloud : localRequire(name)),
      process: { env: {} },
    }
    vm.runInNewContext(readFileSync(join(packageRoot, 'index.js'), 'utf8'), sandbox)
    const main = exports.main as (event: object, context: object) => Promise<unknown>
    expect(await main({ action: 'stageAvatar' }, {})).toMatchObject({
      ok: false,
      code: 'probe-disabled',
    })
    expect(contextReads).toBe(0)
  })
  it('已有輸出資料不可被組包器覆寫', () => {
    const data = options()
    buildProbePackages(data)
    writeFileSync(join(data.outputRoot, 'keep.txt'), '保留原資料')
    expect(() => buildProbePackages(data)).toThrow('PROBE_OUTPUT_NOT_EMPTY')
    expect(readFileSync(join(data.outputRoot, 'keep.txt'), 'utf8')).toBe('保留原資料')
  })
  it('來源缺失時不產生可部署的不完整包', () => {
    const sourceRoot = fresh()
    const data = { ...options(), sourceRoot }
    expect(() => buildProbePackages(data)).toThrow('PROBE_SOURCE_MISSING')
  })
  it('來源程式改動必須改變 build 身份', () => {
    const sourceRoot = fresh()
    cpSync(resolve('tools'), join(sourceRoot, 'tools'), { recursive: true })
    cpSync(resolve('cloudfunctions'), join(sourceRoot, 'cloudfunctions'), { recursive: true })
    const first = buildProbePackages({ ...options(), sourceRoot })
    const source = join(sourceRoot, 'tools/message-board/probe-sources/rpc.js')
    writeFileSync(source, readFileSync(source, 'utf8') + '\n// 合成的來源變更\n')
    const second = buildProbePackages({ ...options(), sourceRoot })
    expect(second.buildSha).not.toBe(first.buildSha)
  })
  it('全新多層輸出路徑不需要先手工建立父目錄', () => {
    const built = buildProbePackages({
      ...options(),
      outputRoot: join(fresh(), 'new-parent', 'nested', 'packages'),
    })
    expect(built.packages).toHaveLength(3)
    expect(readFileSync(join(built.packages[0].path, 'index.js'), 'utf8')).not.toHaveLength(0)
  })
})
