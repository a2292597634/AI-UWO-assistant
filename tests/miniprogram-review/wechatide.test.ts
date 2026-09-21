import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'

import { describe, expect, it } from 'vitest'

import {
  createWechatIdeAdapter,
  parseWechatIdeResponse,
  resolveWechatIdeCliPath,
  type WechatIdeRunner,
} from '../../tools/miniprogram-review/wechatide'

const projectPath = 'E:/AI UWO assistant'

describe('微信开发者工具 wechatide 适配器', () => {
  it('把自定义组件动作映射为页面方法、数据状态与视口截图', async () => {
    const calls: Array<{ tool: string; args: string[] }> = []
    const runner: WechatIdeRunner = {
      async call(tool, args) {
        calls.push({ tool, args })
        if (tool === 'automation_runtime_info') {
          return { currentPage: { route: '/pages/adventure-fleet/index' } }
        }
        if (tool === 'automation_page_action' && args.includes('getData')) {
          const dataPath = args[args.indexOf('--data-path') + 1]
          if (dataPath === 'configName') return { data: '冒險配隊' }
          if (dataPath === 'shareStatus') return { data: 'ready' }
          if (dataPath === 'shareImagePath') return { data: 'https://example.test/share.png' }
        }
        if (tool === 'automation_evaluate') {
          const functionSource = args[args.indexOf('--fn-source') + 1]
          if (functionSource.includes('component.data.title')) {
            return { success: true, result: { result: '分享圖預覽' } }
          }
          if (functionSource.includes('fleet-share-preview__bottom-anchor')) {
            return { success: true, result: { result: 1200 } }
          }
        }
        if (tool === 'automation_element_action' && args.includes('text')) {
          return '郑和'
        }
        if (tool === 'automation_element_action') return { width: 320, height: 240 }
        return undefined
      },
    }
    const adapter = await createWechatIdeAdapter(
      { projectPath, cliPath: 'D:/wechat/cli.bat', automationPort: 9420 },
      { runner, openProject: false },
    )

    await adapter.reLaunch('/pages/adventure-fleet/index')
    await adapter.waitFor('.fleet-page', 1000)
    await adapter.waitFor('xpath://view[contains(@class, "config-bar")]', 1000)
    await adapter.tap('xpath://button[contains(@class, "config-bar__share--prominent")]')
    await adapter.waitFor('xpath://image[contains(@class, "fleet-share-preview__image")]', 1000)
    expect(
      await adapter.isVisible('xpath://image[contains(@class, "fleet-share-preview__image")]'),
    ).toBe(true)
    expect(
      await adapter.readText('xpath://text[contains(@class, "fleet-share-preview__title")]'),
    ).toBe('分享圖預覽')
    await adapter.scrollElement(
      'xpath://scroll-view[contains(@class, "fleet-share-preview__content")]',
      1600,
    )
    await adapter.screenshot('C:/review/share.png')

    expect(await adapter.currentPagePath()).toBe('/pages/adventure-fleet/index')
    expect(
      calls.some(
        ({ tool, args }) => tool === 'automation_evaluate' && args.includes('--fn-source'),
      ),
    ).toBe(true)
    expect(
      calls.some(({ tool, args }) => tool === 'automation_element_action' && args.includes('text')),
    ).toBe(false)
    expect(
      calls.some(
        ({ tool, args }) =>
          tool === 'automation_evaluate' &&
          args.some((argument) => argument.includes('fleet-share-preview__bottom-anchor')),
      ),
    ).toBe(true)
    expect(calls).toEqual(
      expect.arrayContaining([
        {
          tool: 'automation_navigate',
          args: expect.arrayContaining([
            '--action',
            'reLaunch',
            '--url',
            '/pages/adventure-fleet/index',
          ]),
        },
        {
          tool: 'automation_page_action',
          args: expect.arrayContaining(['--action', 'callMethod', '--method', 'onShareFleet']),
        },
        {
          tool: 'automation_viewport_action',
          args: expect.arrayContaining(['--action', 'screenshot', '--path', 'C:/review/share.png']),
        },
      ]),
    )
  })

  it('解析与 cli.bat 同目录的 wechatide 命令', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'uwo-wechatide-test-'))
    const cliPath = join(directory, 'cli.bat')
    const wechatIdePath = join(directory, 'wechatide.cmd')
    try {
      await mkdir(dirname(cliPath), { recursive: true })
      await writeFile(cliPath, '', 'utf8')
      await writeFile(wechatIdePath, '', 'utf8')

      expect(resolveWechatIdeCliPath(cliPath)).toBe(wechatIdePath)
      expect(resolveWechatIdeCliPath(join(directory, 'missing', 'cli.bat'))).toBeUndefined()
    } finally {
      await rm(directory, { recursive: true, force: true })
    }
  })

  it('从前后夹杂日志的命令输出中提取首个完整 JSON 响应', () => {
    expect(
      parseWechatIdeResponse(
        '[wechatide] skill-call\n{"ok":true,"result":{"success":true}}\n[wechatide] done',
      ),
    ).toEqual({ ok: true, result: { success: true } })
  })
})
