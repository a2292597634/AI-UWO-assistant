import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'

import {
  getQualityGateCommand,
  runCli,
  type CliDependencies,
} from '../../tools/miniprogram-review/cli'
import type { ReviewReport } from '../../tools/miniprogram-review/report'

const temporaryDirectories: string[] = []

afterEach(() => {
  while (temporaryDirectories.length > 0) {
    const directory = temporaryDirectories.pop()
    if (directory) rmSync(directory, { recursive: true, force: true })
  }
})

const createRunDirectory = (): string => {
  const directory = mkdtempSync(join(tmpdir(), 'uwo-review-cli-'))
  temporaryDirectories.push(directory)
  return directory
}

const dependencies = (overrides: Partial<CliDependencies> = {}): CliDependencies => ({
  cwd: 'E:/project',
  env: {},
  log: vi.fn(),
  resolveConfig: () => ({
    projectPath: 'E:/project',
    cliPath: 'D:/wechat/cli.bat',
    automationPort: 9420,
  }),
  diagnose: () => [{ code: 'READY', level: 'info', message: '配置完整' }],
  checkCliCapability: async () => ({ ok: true, message: 'CLI 调用与登录状态正常' }),
  connect: async () => ({ disconnect: async () => undefined }) as never,
  loadScenario: () => ({
    name: '目录搜寻',
    entry: '/pages/catalog/index',
    state: 'normal',
    devices: ['iphone-standard'],
    steps: [{ action: 'screenshot', name: 'catalog' }],
  }),
  runScenario: async () => ({
    scenario: '目录搜寻',
    pagePath: '/pages/catalog/index',
    state: 'normal',
    status: 'passed',
    steps: [],
    screenshots: [],
  }),
  readGitChangedFiles: () => [],
  runQualityGate: async () => true,
  writeReport: () => ({
    htmlPath: 'C:/review/report.html',
    jsonPath: 'C:/review/report.json',
    markdownPath: 'C:/review/report.md',
  }),
  createRunDirectory,
  readGitState: () => ({ commit: 'abc1234', dirty: false }),
  now: () => new Date('2026-09-15T12:00:00.000Z'),
  randomId: () => 'fixed',
  ...overrides,
})

describe('小程序验收 CLI', () => {
  it('Windows 质量门禁使用 npm.cmd，避免原生 Node 找不到 npm', () => {
    expect(getQualityGateCommand('win32')).toEqual({
      command: 'cmd.exe',
      args: ['/d', '/s', '/c', 'npm.cmd run verify'],
    })
    expect(getQualityGateCommand('linux')).toEqual({ command: 'npm', args: ['run', 'verify'] })
  })

  it('doctor 有错误诊断时返回 1', async () => {
    const log = vi.fn()
    const code = await runCli(
      ['doctor'],
      dependencies({
        log,
        diagnose: () => [{ code: 'CLI_MISSING', level: 'error', message: '找不到 CLI' }],
      }),
    )

    expect(code).toBe(1)
    expect(log).toHaveBeenCalledWith('找不到 CLI')
  })

  it('doctor 在服务端口关闭或未登录时返回 1', async () => {
    const log = vi.fn()
    const code = await runCli(
      ['doctor'],
      dependencies({
        log,
        checkCliCapability: async () => ({ ok: false, message: '开发者工具服务端口未开启' }),
      }),
    )

    expect(code).toBe(1)
    expect(log).toHaveBeenCalledWith('开发者工具服务端口未开启')
  })

  it('run 场景失败时写入报告并返回 1', async () => {
    const writeReport = vi.fn((..._args: Parameters<CliDependencies['writeReport']>) => ({
      htmlPath: 'C:/review/report.html',
      jsonPath: 'C:/review/report.json',
      markdownPath: 'C:/review/report.md',
    }))
    const code = await runCli(
      ['run', '--scenario', 'catalog-search'],
      dependencies({
        writeReport,
        runScenario: async () => ({
          scenario: '目录搜寻',
          pagePath: '/pages/catalog/index',
          state: 'normal',
          status: 'failed',
          steps: [],
          screenshots: [],
          error: '找不到元素',
        }),
      }),
    )

    expect(code).toBe(1)
    expect(writeReport).toHaveBeenCalledOnce()
  })

  it('未知命令返回 2', async () => {
    await expect(runCli(['unknown'], dependencies())).resolves.toBe(2)
  })

  it('非 Error 异常以 JSON 形式输出，避免 object Object 丢失诊断', async () => {
    const log = vi.fn()
    const code = await runCli(
      ['run', '--scenario', 'catalog-search'],
      dependencies({
        log,
        loadScenario: () => {
          throw { code: 'DEVTOOLS_PROTOCOL_TIMEOUT', method: 'App.getCurrentPage' }
        },
      }),
    )

    expect(code).toBe(1)
    expect(log).toHaveBeenCalledWith(
      '{"code":"DEVTOOLS_PROTOCOL_TIMEOUT","method":"App.getCurrentPage"}',
    )
  })

  it('报告列出成功截图、未覆盖状态并把截图放在 current-simulator 目录', async () => {
    const log = vi.fn()
    let capturedReport: ReviewReport | undefined
    const writeReport = vi.fn((_outputDir: string, report: ReviewReport) => {
      capturedReport = report
      return {
        htmlPath: 'C:/review/report.html',
        jsonPath: 'C:/review/report.json',
        markdownPath: 'C:/review/report.md',
      }
    })
    const runScenario = vi.fn(async (_adapter, _scenario, context: { outputDir: string }) => ({
      scenario: '目录搜寻',
      pagePath: '/pages/catalog/index',
      state: 'normal' as const,
      status: 'passed' as const,
      steps: [],
      screenshots: [`${context.outputDir}/catalog.png`],
    }))
    const code = await runCli(
      ['run', '--scenario', 'catalog-search'],
      dependencies({ log, writeReport, runScenario }),
    )

    expect(code).toBe(0)
    expect(capturedReport).toBeDefined()
    const report = capturedReport as ReviewReport
    expect(report.coverage).toMatchObject({
      covered: ['current-simulator/normal'],
      manual: ['iphone-standard'],
      manualStates: ['empty', 'error', 'loading', 'long-text'],
    })
    expect(runScenario.mock.calls[0]?.[2].outputDir).toContain('current-simulator')
    expect(log).toHaveBeenCalledWith(`HTML 报告：${resolve('C:/review/report.html')}`)
    expect(log).toHaveBeenCalledWith(expect.stringContaining('截图证据：'))
  })

  it('iterate 没有页面变更时不连接开发者工具', async () => {
    const connect = vi.fn()
    const log = vi.fn()
    const code = await runCli(
      ['changed', '--mode', 'iterate'],
      dependencies({
        log,
        connect,
        readGitChangedFiles: () => ['docs/miniprogram-review.md'],
      }),
    )

    expect(code).toBe(0)
    expect(connect).not.toHaveBeenCalled()
    expect(log).toHaveBeenCalledWith('未发现页面相关变更，已跳过自动验收')
  })

  it('changed 缺少或传入未知模式时返回参数错误码 2', async () => {
    const log = vi.fn()
    const missingModeCode = await runCli(['changed'], dependencies({ log }))
    const unknownModeCode = await runCli(['changed', '--mode', 'fast'], dependencies({ log }))

    expect(missingModeCode).toBe(2)
    expect(unknownModeCode).toBe(2)
    expect(log).toHaveBeenCalledWith('changed 必须提供 --mode iterate 或 --mode final')
  })

  it('final 没有可匹配场景时生成阻塞报告并返回非零', async () => {
    const writeReport = vi.fn((..._args: Parameters<CliDependencies['writeReport']>) => ({
      htmlPath: 'C:/review/report.html',
      jsonPath: 'C:/review/report.json',
      markdownPath: 'C:/review/report.md',
    }))
    const code = await runCli(
      ['changed', '--mode', 'final'],
      dependencies({
        listScenarioPaths: () => [],
        readGitChangedFiles: () => ['miniprogram/pages/new/index.wxml'],
        writeReport,
      }),
    )

    expect(code).not.toBe(0)
    expect(writeReport).toHaveBeenCalledOnce()
    expect(writeReport.mock.calls[0]?.[1].status).toBe('blocked')
  })

  it('final 场景通过后仍执行 npm run verify，质量门禁失败则返回非零', async () => {
    const runQualityGate = vi.fn(async () => false)
    const code = await runCli(
      ['changed', '--mode', 'final'],
      dependencies({
        listScenarioPaths: () => ['catalog-search.json'],
        readGitChangedFiles: () => ['miniprogram/pages/catalog/index.wxss'],
        runQualityGate,
      }),
    )

    expect(runQualityGate).toHaveBeenCalledOnce()
    expect(code).not.toBe(0)
  })
})
