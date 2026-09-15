import { describe, expect, it } from 'vitest'

import { createAutomatorAdapter } from '../../tools/miniprogram-review/adapter'

describe('miniprogram-automator 适配器', () => {
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
})
