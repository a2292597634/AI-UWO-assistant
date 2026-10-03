import type { OfficerErrorReport } from '../../miniprogram/contracts/officer-error-report'
import { runInNewContext } from 'node:vm'
import { describe, expect, it, vi } from 'vitest'
import {
  fixtureInstallSource,
  parseReviewFixtureName,
} from '../../tools/miniprogram-review/fixtures'
import { createAutomatorAdapter } from '../../tools/miniprogram-review/adapter'
import { createWechatIdeAdapter } from '../../tools/miniprogram-review/wechatide'

const runtime = () => {
  const realCloud = vi.fn(() => {
    throw new Error('禁止真雲')
  })
  const realWrite = vi.fn((_key: string, _value: unknown) => {
    throw new Error('禁止真儲存')
  })
  const wx = {
    cloud: { callFunction: realCloud, uploadFile: realCloud, getTempFileURL: realCloud },
    getStorageSync: vi.fn((_key: string) => '原值'),
    setStorageSync: realWrite,
  }
  return {
    wx,
    realCloud,
    realWrite,
    evaluate: async (source: string) => runInNewContext(`(${source})()`, { wx, Promise }),
  }
}

describe('固定 UI fixture 安全邊界', () => {
  it('名稱僅接受工具固定白名單', () => {
    expect(() => parseReviewFixtureName('evil.js')).toThrow('不支持')
    expect(() => fixtureInstallSource('evil.js' as never)).toThrow('不支持')
  })
  it('wechatide 的批次入口收到完整單行 fixture 腳本', async () => {
    const state = runtime()
    const adapter = await createWechatIdeAdapter(
      { projectPath: 'fixture-project', automationPort: 9420 },
      {
        openProject: false,
        runner: {
          async call(tool, args) {
            if (tool === 'automation_runtime_info')
              return { currentPage: { route: '/pages/catalog/index' } }
            if (tool === 'automation_evaluate') {
              const source = args[args.indexOf('--fn-source') + 1]!
              // Windows cmd 批次入口會把換行拆成獨立命令。
              expect(source).not.toMatch(/[\r\n]/)
              return state.evaluate(source)
            }
            return undefined
          },
        },
      },
    )
    await adapter.installFixture!('coupon-success')
    await adapter.disconnect()
    expect(state.realCloud).not.toHaveBeenCalled()
    expect(state.realWrite).not.toHaveBeenCalled()
  })
  it.each(['coupon-known-failure', 'coupon-unknown'] as const)(
    '%s 保留固定錯誤語義且不調用真兌換',
    async (name) => {
      const state = runtime()
      const adapter = createAutomatorAdapter({
        evaluate: state.evaluate,
        disconnect: () => undefined,
      } as never)
      await adapter.installFixture!(name)
      const cloud = state.wx.cloud.callFunction as unknown as (
        input: unknown,
      ) => Promise<{ result: { ok: boolean; code: string } }>
      expect((await cloud({ name: 'coupon-redemption', data: {} })).result).toMatchObject({
        ok: false,
        code: name === 'coupon-unknown' ? 'unknown' : 'coupon-used',
      })
      expect(
        (await cloud({ name: 'officer-maintenance', data: { action: 'acceptReport' } })).result.ok,
      ).toBe(false)
      await adapter.disconnect()
      expect(state.realCloud).not.toHaveBeenCalled()
      expect(state.realWrite).not.toHaveBeenCalled()
    },
  )
  it('marker 存儲只讀時不得替換任何 API', async () => {
    const state = runtime()
    Object.defineProperty(state.wx, '__uwoReviewFixture', { value: undefined, writable: false })
    const adapter = createAutomatorAdapter({
      evaluate: state.evaluate,
      disconnect: () => undefined,
    } as never)
    await expect(adapter.installFixture!('coupon-success')).rejects.toThrow('marker')
    expect(state.wx.cloud.callFunction).toBe(state.realCloud)
    expect(state.realCloud).not.toHaveBeenCalled()
  })
  it('marker 缺失或 API 只讀時安裝失敗且恢復已替換 API', async () => {
    const state = runtime()
    const adapter = createAutomatorAdapter({
      evaluate: async (source: string) => {
        const result = await state.evaluate(source)
        return source.includes('var name =') ? null : result
      },
      disconnect: () => undefined,
    } as never)
    await expect(adapter.installFixture!('coupon-success')).rejects.toThrow('marker')
    expect(state.wx.cloud.callFunction).toBe(state.realCloud)
    Object.defineProperty(state.wx.cloud, 'uploadFile', { writable: false })
    const readonlyAdapter = createAutomatorAdapter({
      evaluate: state.evaluate,
      disconnect: () => undefined,
    } as never)
    await expect(readonlyAdapter.installFixture!('error-report-review')).rejects.toThrow('安裝失敗')
    expect(state.wx.cloud.callFunction).toBe(state.realCloud)
    expect(state.realCloud).not.toHaveBeenCalled()
  })

  it.each(['automator', 'wechatide'])(
    '%s 安裝、記憶體更新與恢復均不觸及真 API',
    async (platform) => {
      const state = runtime()
      const disconnected = vi.fn()
      const adapter =
        platform === 'automator'
          ? createAutomatorAdapter({ evaluate: state.evaluate, disconnect: disconnected } as never)
          : await createWechatIdeAdapter(
              { projectPath: 'E:/fixture', automationPort: 9420 },
              {
                openProject: false,
                runner: {
                  async call(tool, args) {
                    if (tool === 'automation_runtime_info')
                      return { currentPage: { route: '/pages/catalog/index' } }
                    if (tool === 'automation_evaluate')
                      return state.evaluate(args[args.indexOf('--fn-source') + 1])
                    return undefined
                  },
                },
              },
            )
      await adapter.installFixture!('error-report-mine')
      const cloud = state.wx.cloud.callFunction as unknown as (
        input: unknown,
      ) => Promise<{ result: { ok: boolean; data: unknown } }>
      const list = await cloud({ name: 'officer-maintenance', data: { action: 'listMyReports' } })
      expect((list.result.data as OfficerErrorReport[])[0]).toMatchObject({
        status: 'needsInfo',
        revision: 2,
        supplements: expect.anything(),
        history: expect.anything(),
      })
      const report = (list.result.data as OfficerErrorReport[])[0]
      expect(report.screenshotFileIds).toEqual(['/assets/ui/share-action-icon.png'])
      expect(
        report.supplements.map(({ text, sourceUrl, screenshotFileIds }) => ({
          text,
          sourceUrl,
          screenshotFileIds,
        })),
      ).toEqual([
        {
          text: '第一次補充',
          sourceUrl: 'https://example.invalid/first',
          screenshotFileIds: ['/assets/ui/config-paper-texture.png'],
        },
        { text: '', sourceUrl: 'https://example.invalid/second', screenshotFileIds: [] },
        { text: '', sourceUrl: '', screenshotFileIds: ['/assets/ui/share-action-icon.png'] },
        { text: '', sourceUrl: '', screenshotFileIds: [] },
      ])
      const upload = state.wx.cloud.uploadFile as unknown as () => Promise<{ fileID: string }>
      expect(await upload()).toEqual({ fileID: '/assets/ui/share-action-icon.png' })

      const appended = await cloud({
        name: 'officer-maintenance',
        data: {
          action: 'appendReportSupplement',
          reportId: report.reportId,
          revision: report.revision,
          text: '新的補充',
          sourceUrl: '',
          screenshotFileIds: [],
        },
      })
      expect((appended.result.data as OfficerErrorReport).supplements.slice(-1)[0].text).toBe(
        '新的補充',
      )
      expect((await cloud({ name: 'danger', data: { action: 'delete' } })).result.ok).toBe(false)
      await adapter.disconnect()
      expect(state.wx.cloud.callFunction).toBe(state.realCloud)
      expect(state.realCloud).not.toHaveBeenCalled()
      expect(state.realWrite).not.toHaveBeenCalled()
      await adapter.installFixture!('coupon-success')
      expect(state.wx.getStorageSync('coupon_profiles_v1')).toMatchObject({
        activeProfileId: 'fixture-player-a',
      })
      state.wx.setStorageSync('coupon_profiles_v1', { profiles: [] } as never)
      const couponCloud = state.wx.cloud.callFunction as unknown as typeof cloud
      const redeemed = await couponCloud({ name: 'coupon-redemption', data: {} })
      expect(redeemed.result.data).toMatchObject({ code: 'success' })
      expect(state.realWrite).not.toHaveBeenCalled()
      await adapter.restoreFixture!()
      expect(state.wx.setStorageSync).toBe(state.realWrite)
    },
  )
})
