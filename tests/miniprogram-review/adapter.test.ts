import { describe, expect, it } from 'vitest'

import {
  buildWindowsBatchLaunch,
  createAutomatorAdapter,
  shouldBypassLegacyVersionCheck,
  waitForPageReady,
} from '../../tools/miniprogram-review/adapter'

describe('miniprogram-automator 适配器', () => {
  it('将可重入场景入口映射为 reLaunch', async () => {
    const calls: string[] = []
    const miniProgram = {
      reLaunch: async (path: string) => void calls.push(`reLaunch:${path}`),
    }
    const adapter = createAutomatorAdapter(miniProgram as never)

    await adapter.reLaunch('/subpkg-fleet/pages/index/index')

    expect(calls).toEqual(['reLaunch:/subpkg-fleet/pages/index/index'])
  })

  it('新版开发者工具只有 version 时绕过旧 SDKVersion 检查', () => {
    expect(shouldBypassLegacyVersionCheck({ version: '2.01.2509150' })).toBe(true)
    expect(shouldBypassLegacyVersionCheck({ version: '2.01.2509150', SDKVersion: '3.7.0' })).toBe(
      false,
    )
    expect(shouldBypassLegacyVersionCheck({})).toBe(false)
  })

  it('Windows 批处理 CLI 使用完整 PowerShell 命令保留中文与空格路径', () => {
    expect(
      buildWindowsBatchLaunch({
        projectPath: 'E:/AI UWO assistant',
        cliPath: 'D:/微信web开发者工具/cli.bat',
        servicePort: 40870,
        automationPort: 9420,
      }),
    ).toEqual({
      executable: 'C:/Windows/System32/WindowsPowerShell/v1.0/powershell.exe',
      args: [
        '-NoProfile',
        '-NonInteractive',
        '-Command',
        "& 'D:/微信web开发者工具/cli.bat' auto --project 'E:/AI UWO assistant' --auto-port 9420 --trust-project --port 40870",
      ],
    })
  })

  it('把输入、点击、滚动、截图和页面路径映射到 SDK', async () => {
    const calls: string[] = []
    const elements = {
      '.input': {
        input: async (value: string) => void calls.push(`input:${value}`),
        tap: async () => undefined,
        size: async () => ({ width: 100, height: 40 }),
        text: async () => '',
      },
      '.row': {
        tap: async () => void calls.push('tap'),
        size: async () => ({ width: 100, height: 40 }),
        text: async () => '郑和',
      },
      '.list': {
        tap: async () => undefined,
        scrollTo: async (x: number, y: number) => void calls.push(`scrollTo:${x}:${y}`),
        size: async () => ({ width: 320, height: 500 }),
        text: async () => '',
      },
    }
    const miniProgram = {
      navigateTo: async (path: string) => void calls.push(`navigate:${path}`),
      switchTab: async (path: string) => void calls.push(`switchTab:${path}`),
      currentPage: async () => ({
        path: 'pages/catalog/index',
        $: async (selector: keyof typeof elements) => elements[selector] ?? null,
        waitFor: async () => undefined,
      }),
      pageScrollTo: async (distance: number) => void calls.push(`pageScrollTo:${distance}`),
      screenshot: async ({ path }: { path: string }) => void calls.push(`screenshot:${path}`),
      disconnect: () => void calls.push('disconnect'),
    }
    const adapter = createAutomatorAdapter(miniProgram as never)

    await adapter.navigate('/pages/catalog/index')
    await adapter.input('.input', '郑和')
    await adapter.tap('.row')
    await adapter.scrollElement('.list', 300)
    await adapter.scrollPage(600)
    await adapter.screenshot('C:/review/page.png')

    expect(await adapter.isVisible('.row')).toBe(true)
    expect(await adapter.readText('.row')).toBe('郑和')
    expect(await adapter.currentPagePath()).toBe('/pages/catalog/index')
    await adapter.disconnect()
    expect(calls).toEqual([
      'navigate:/pages/catalog/index',
      'input:郑和',
      'tap',
      'scrollTo:0:300',
      'pageScrollTo:600',
      'screenshot:C:/review/page.png',
      'disconnect',
    ])
  })

  it('使用 xpath: 选择器穿透 glass-easel 自定义组件边界', async () => {
    const calls: string[] = []
    const target = {
      tap: async () => void calls.push('tap'),
      size: async () => ({ width: 100, height: 40 }),
      text: async () => '分享',
    }
    const miniProgram = {
      currentPage: async () => ({
        path: 'pages/adventure-fleet/index',
        $: async () => null,
        getElementByXpath: async (selector: string) => {
          calls.push(`xpath:${selector}`)
          return target
        },
        waitFor: async () => undefined,
      }),
    }
    const adapter = createAutomatorAdapter(miniProgram as never)

    await adapter.tap('xpath://button[contains(@class, "config-bar__share")]')

    expect(calls).toEqual(['xpath://button[contains(@class, "config-bar__share")]', 'tap'])
  })

  it('截图响应暂时超时时自动重试一次', async () => {
    let attempts = 0
    const miniProgram = {
      screenshot: async () => {
        attempts += 1
        if (attempts === 1) throw new Error('timeout waiting for automator response')
      },
      currentPage: async () => ({
        path: 'pages/home/index',
        $: async () => null,
        waitFor: async () => undefined,
      }),
    }
    const adapter = createAutomatorAdapter(miniProgram as never)

    await adapter.screenshot('C:/review/page.png')

    expect(attempts).toBe(2)
  })

  it('支持使用独立会话执行截图，避免当前会话查询后截图超时', async () => {
    const calls: string[] = []
    const miniProgram = {
      screenshot: async () => void calls.push('inline-screenshot'),
      currentPage: async () => ({
        path: 'pages/home/index',
        $: async () => null,
        waitFor: async () => undefined,
      }),
    }
    const adapter = createAutomatorAdapter(miniProgram as never, {
      screenshot: async (path: string) => void calls.push(`fresh-screenshot:${path}`),
    })

    await adapter.screenshot('C:/review/page.png')

    expect(calls).toEqual(['fresh-screenshot:C:/review/page.png'])
  })

  it('页面首帧尚未完成时等待到可操作状态', async () => {
    let attempts = 0
    const path = await waitForPageReady(
      {
        currentPagePath: async () => {
          attempts += 1
          if (attempts < 2) throw new Error('页面尚未就绪')
          return '/pages/home/index'
        },
      },
      1000,
    )
    expect(path).toBe('/pages/home/index')
    expect(attempts).toBe(2)
  })

  it('元素不支持输入时给出明确错误', async () => {
    const miniProgram = {
      currentPage: async () => ({
        path: 'pages/catalog/index',
        $: async () => ({
          tap: async () => undefined,
          size: async () => ({ width: 10, height: 10 }),
          text: async () => '',
        }),
        waitFor: async () => undefined,
      }),
    }
    const adapter = createAutomatorAdapter(miniProgram as never)

    await expect(adapter.input('.plain-view', '文字')).rejects.toThrow(
      '元素不支持输入：.plain-view',
    )
  })

  it('页面切换过渡期重新获取顶层页面后继续等待', async () => {
    let currentPageCalls = 0
    const miniProgram = {
      currentPage: async () => {
        currentPageCalls += 1
        return {
          path: currentPageCalls === 1 ? 'pages/catalog/index' : 'subpkg-detail/pages/detail/index',
          $: async () => (currentPageCalls === 1 ? null : ({} as never)),
          waitFor: async () => undefined,
        }
      },
    }
    const adapter = createAutomatorAdapter(miniProgram as never)

    await adapter.waitFor('.detail-page', 1000)
    expect(currentPageCalls).toBe(2)
  })

  it('元素等待接近截止时间时仍使用正数轮询间隔', async () => {
    const adapter = createAutomatorAdapter({
      currentPage: async () => ({
        path: 'pages/catalog/index',
        $: async () => null,
        waitFor: async () => undefined,
      }),
    } as never)

    await expect(adapter.waitFor('.missing', 1)).rejects.toThrow('等待元素超时：.missing')
  })
})
