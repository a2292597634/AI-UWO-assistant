import { describe, expect, it } from 'vitest'

import { diagnoseReviewConfig, resolveReviewConfig } from '../../tools/miniprogram-review/config'

describe('小程序验收配置', () => {
  it('显式参数覆盖环境变量，自动化端口默认 9420', () => {
    const config = resolveReviewConfig({
      cwd: 'E:/project',
      args: { cliPath: 'D:/explicit/cli.bat' },
      env: { WECHAT_DEVTOOLS_CLI: 'D:/env/cli.bat' },
      existingPaths: new Set(['D:/explicit/cli.bat']),
    })

    expect(config.cliPath).toBe('D:/explicit/cli.bat')
    expect(config.automationPort).toBe(9420)
  })

  it('WebSocket 端点优先使用显式参数', () => {
    const config = resolveReviewConfig({
      cwd: 'E:/project',
      args: { wsEndpoint: 'ws://127.0.0.1:9527' },
      env: { WECHAT_AUTOMATION_WS_ENDPOINT: 'ws://127.0.0.1:9420' },
    })

    expect(config.wsEndpoint).toBe('ws://127.0.0.1:9527')
    expect(config.automationPort).toBe(9527)
  })

  it('生产模式会探测微信开发者工具常见安装路径', () => {
    const config = resolveReviewConfig({
      cwd: 'E:/project',
      args: {},
      env: {},
      pathExists: (path) => path.includes('Program Files (x86)'),
    })

    expect(config.cliPath).toBe('C:/Program Files (x86)/Tencent/微信web开发者工具/cli.bat')
  })

  it('支持本机使用的 D 盘独立安装路径', () => {
    const config = resolveReviewConfig({
      cwd: 'E:/project',
      args: {},
      env: {},
      pathExists: (path) => path === 'D:/微信web开发者工具/cli.bat',
    })

    expect(config.cliPath).toBe('D:/微信web开发者工具/cli.bat')
  })

  it('拒绝超出范围的端口', () => {
    expect(() =>
      resolveReviewConfig({
        cwd: 'E:/project',
        args: {},
        env: { WECHAT_AUTOMATION_PORT: '70000' },
      }),
    ).toThrow('自动化端口必须是 1 至 65535 的整数')
  })

  it('诊断缺失的项目配置和开发者工具 CLI', () => {
    const diagnostics = diagnoseReviewConfig(
      {
        projectPath: 'E:/project',
        cliPath: 'D:/missing/cli.bat',
        automationPort: 9420,
      },
      () => false,
    )

    expect(diagnostics).toEqual([
      {
        code: 'PROJECT_CONFIG_MISSING',
        level: 'error',
        message: '项目目录缺少 project.config.json：E:/project',
      },
      {
        code: 'CLI_MISSING',
        level: 'error',
        message: '找不到微信开发者工具 CLI：D:/missing/cli.bat',
      },
    ])
  })

  it('已有 WebSocket 自动化端点时不要求额外配置 CLI', () => {
    const diagnostics = diagnoseReviewConfig(
      {
        projectPath: 'E:/project',
        wsEndpoint: 'ws://127.0.0.1:9420',
        automationPort: 9420,
      },
      () => true,
    )

    expect(diagnostics).toEqual([
      { code: 'READY', level: 'info', message: '小程序自动化环境配置完整' },
    ])
  })
})
