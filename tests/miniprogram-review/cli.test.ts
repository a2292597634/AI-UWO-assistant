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
import { evidence } from './evidence-fixture'

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
  restartDevTools: async () => undefined,
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
    screenshots: ['C:/review/current-simulator/catalog.png'],
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
  it('final 未匹配頁面的阻塞報告保留 final 範圍與必需未跑門禁', async () => {
    const writeReport = vi.fn(dependencies().writeReport)
    const deps = dependencies({
      writeReport,
      readGitChangedFiles: () => ['miniprogram/pages/missing/index.wxml'],
      listScenarioPaths: () => ['catalog.json'],
    })
    expect(await runCli(['changed', '--mode', 'final'], deps)).toBe(1)
    expect(writeReport.mock.calls[0][1].checks).toMatchObject({
      mode: 'final',
      repository: { required: true, status: 'not-run' },
    })
  })
  it.each([2, 3])('來源擷取第 %s 次失敗仍清理並留下本 run 阻塞報告', async (failAt) => {
    const disconnect = vi.fn(async () => undefined),
      restoreFixture = vi.fn(async () => undefined)
    const writeReport = vi.fn(dependencies().writeReport)
    let reads = 0
    const deps = dependencies({
      writeReport,
      connect: async () => ({ disconnect, restoreFixture }) as never,
      captureSource: () => {
        if (++reads === failAt) throw new Error('來源檔案讀取失敗')
        return evidence().source
      },
    })
    expect(await runCli(['run', '--scenario', 'catalog'], deps)).toBe(1)
    expect(disconnect).toHaveBeenCalledTimes(1)
    expect(restoreFixture).toHaveBeenCalledTimes(1)
    expect(writeReport).toHaveBeenCalledTimes(1)
    expect(writeReport.mock.calls[0][1].status).toBe('blocked')
    expect(writeReport.mock.calls[0][1].results[0].error).toContain('來源檔案讀取失敗')
  })
  it('同批 SDK 下一場景沿用本次成功啟動紀錄，來源變動拒絕通過', async () => {
    const connections: unknown[] = []
    const writeReport = vi.fn(dependencies().writeReport)
    let sourceReads = 0
    const deps = dependencies({
      listScenarioPaths: () => ['a.json', 'b.json'],
      writeReport,
      loadScenario: () => ({
        name: '技能',
        entry: '/pages/adventure-fleet/index',
        state: 'normal',
        devices: ['iphone-standard'],
        steps: [
          {
            action: 'waitUntil',
            condition: { kind: 'exists', selector: '.skill-sheet', exists: false },
          },
        ],
      }),
      captureSource: () => ({
        ...evidence().source,
        candidateSha256: ++sourceReads < 7 ? 'fixed' : 'changed',
      }),
      connect: async (config) => {
        if (!config.wsEndpoint)
          config.launchRecord = {
            projectRoot: config.projectPath,
            executionRoot: config.projectPath,
            endpoint: 'ws://127.0.0.1:9420',
          }
        connections.push(config.launchRecord)
        return {
          disconnect: async () => undefined,
          getReviewLaunchRecord: () => config.launchRecord,
        } as never
      },
    })
    expect(await runCli(['review', '--page', '/pages/adventure-fleet/index'], deps)).toBe(1)
    expect(connections).toHaveLength(2)
    expect(connections.every(Boolean)).toBe(true)
    expect(writeReport.mock.calls[0][1].results[1].error).toContain('來源')
  })
  it.each([false, 'throw'])('final 倉庫門禁 %s 必須写入同 run 最終報告', async (outcome) => {
    const writeReport = vi.fn(dependencies().writeReport)
    const deps = dependencies({
      readGitChangedFiles: () => ['miniprogram/pages/catalog/index.wxml'],
      listScenarioPaths: () => ['catalog.json'],
      writeReport,
      runQualityGate: async () => {
        if (outcome === 'throw') throw new Error('gate unavailable')
        return false
      },
    })
    expect(await runCli(['changed', '--mode', 'final'], deps)).toBe(1)
    const report = writeReport.mock.calls[writeReport.mock.calls.length - 1]?.[1]
    expect(report?.checks.page.status).toBe('passed')
    expect(report?.checks.repository.status).toBe(outcome === 'throw' ? 'blocked' : 'failed')
    expect(report?.status).toBe(outcome === 'throw' ? 'blocked' : 'failed')
  })
  it('iterate 未執行的倉庫門禁不冒充通過', async () => {
    const writeReport = vi.fn(dependencies().writeReport)
    const deps = dependencies({
      readGitChangedFiles: () => ['miniprogram/pages/catalog/index.wxml'],
      listScenarioPaths: () => ['catalog.json'],
      writeReport,
    })
    expect(await runCli(['changed', '--mode', 'iterate'], deps)).toBe(0)
    expect(
      writeReport.mock.calls[writeReport.mock.calls.length - 1]?.[1].checks.repository.status,
    ).toBe('not-run')
  })
  it('混合技能場景整批沿用元件作用域通道，不切換 nativeCLI 與 SDK 窗口', async () => {
    const connections: Array<Record<string, unknown>> = []
    const deps = dependencies({
      listScenarioPaths: () => ['share.json', 'picker.json'],
      loadScenario: (path) => ({
        name: path,
        entry: '/pages/adventure-fleet/index',
        state: 'normal',
        devices: ['iphone-standard'],
        steps: path.includes('picker')
          ? [{ action: 'waitFor', selector: '.skill-picker-sheet--sheet' }]
          : [{ action: 'screenshot', name: 'share' }],
      }),
      connect: async (config) => {
        connections.push({ ...config })
        return { disconnect: async () => undefined } as never
      },
    })
    expect(await runCli(['review', '--page', '/pages/adventure-fleet/index'], deps)).toBe(0)
    expect(connections).toHaveLength(2)
    expect(connections.every((config) => config.requiresComponentScope === true)).toBe(true)
    expect(connections[1]?.wsEndpoint).toBe('ws://127.0.0.1:9420')
  })

  it.each([false, true])('中途恢復後下一場景重用新端點，explicitWS=%s', async (explicitWS) => {
    const connections: Array<Record<string, unknown>> = []
    const restartDevTools = vi.fn(async (config) => {
      config.automationPort = 9447
      if (config.wsEndpoint) config.wsEndpoint = 'ws://127.0.0.1:9447'
    })
    let runs = 0
    const deps = dependencies({
      resolveConfig: () => ({
        projectPath: 'E:/project',
        cliPath: 'D:/微信web开发者工具/cli.bat',
        automationPort: 9420,
        ...(explicitWS ? { wsEndpoint: 'ws://127.0.0.1:9420' } : {}),
      }),
      restartDevTools,
      listScenarioPaths: () => ['picker.json', 'detail.json'],
      loadScenario: () => ({
        name: '技能元件',
        entry: '/pages/adventure-fleet/index',
        state: 'normal',
        devices: ['iphone-standard'],
        steps: [{ action: 'waitFor', selector: '.skill-sheet' }],
      }),
      connect: async (config) => {
        connections.push({ ...config })
        return { disconnect: async () => undefined } as never
      },
      runScenario: async (_adapter, scenario) => ({
        scenario: scenario.name,
        pagePath: scenario.entry,
        state: scenario.state,
        status: runs++ === 0 ? 'failed' : 'passed',
        steps: [],
        screenshots: ['C:/review/current-simulator/skill.png'],
        ...(runs === 1 ? { error: 'Connection closed' } : {}),
      }),
    })
    expect(await runCli(['review', '--page', '/pages/adventure-fleet/index'], deps)).toBe(0)
    expect(connections).toHaveLength(3)
    expect(connections[2]?.wsEndpoint).toBe('ws://127.0.0.1:9447')
    expect(restartDevTools).toHaveBeenCalledTimes(1)
  })

  it('正式 CLI 在 fixture 還原失敗時仍 disconnect，報告保留原始恢復錯誤', async () => {
    const events: string[] = []
    const failure = new Error('fixture 恢復失敗：原始原因')
    const writeReport = vi.fn(dependencies().writeReport)
    const deps = dependencies({
      writeReport,
      connect: async () =>
        ({
          restoreFixture: async () => {
            events.push('restore')
            throw failure
          },
          disconnect: async () => {
            events.push('disconnect')
          },
        }) as never,
    })
    expect(await runCli(['run', '--scenario', 'catalog'], deps)).toBe(1)
    expect(events).toEqual(['restore', 'disconnect'])
    const report = writeReport.mock.calls[0]?.[1]
    expect(report?.results[0]?.error).toContain(failure.message)
  })
  it.each([9420, 9447])('多個技能場景重用實際端口 %i，不反覆重啟', async (actualPort) => {
    const connections: Array<Record<string, unknown>> = []
    const restartDevTools = vi.fn()
    const deps = dependencies({
      restartDevTools,
      readRegisteredPagePaths: () => ['/pages/adventure-fleet/index'],
      listScenarioPaths: () => ['picker.json', 'detail.json'],
      loadScenario: () => ({
        name: '技能元件',
        entry: '/pages/adventure-fleet/index',
        state: 'normal',
        devices: ['iphone-standard'],
        steps: [{ action: 'waitFor', selector: '.skill-sheet' }],
      }),
      connect: async (config) => {
        connections.push({ ...config })
        if (connections.length === 1) config.automationPort = actualPort
        if (connections.length > 1 && !config.wsEndpoint) throw new Error('自动化端口已被占用')
        return { disconnect: async () => undefined } as never
      },
    })
    expect(await runCli(['review', '--page', '/pages/adventure-fleet/index'], deps)).toBe(0)
    expect(connections).toHaveLength(2)
    expect(connections[1]).toMatchObject({
      requiresComponentScope: true,
      wsEndpoint: `ws://127.0.0.1:${actualPort}`,
    })
    expect(restartDevTools).not.toHaveBeenCalled()
  })
  it('技能彈窗場景選用能查詢元件內部的正式適配器，恢復時保留能力需求', async () => {
    const connections: Array<Record<string, unknown>> = []
    const recoveries: Array<Record<string, unknown>> = []
    let attempts = 0
    const deps = dependencies({
      loadScenario: () => ({
        name: '技能彈窗',
        entry: '/pages/adventure-fleet/index',
        state: 'normal',
        devices: ['iphone-standard'],
        steps: [{ action: 'waitFor', selector: '.skill-picker-sheet--sheet' }],
      }),
      connect: async (config) => {
        connections.push({ ...config })
        if (attempts++ === 0) throw new Error('Connection closed')
        return { disconnect: async () => undefined } as never
      },
      restartDevTools: async (config) => {
        recoveries.push({ ...config })
      },
    })
    expect(await runCli(['run', '--scenario', 'adventure-skill-picker-detail'], deps)).toBe(0)
    expect(connections).toHaveLength(2)
    expect(connections.every((config) => config.requiresComponentScope === true)).toBe(true)
    expect(recoveries[0]).toMatchObject({ requiresComponentScope: true })
    expect(connections[1]).toMatchObject({ wsEndpoint: 'ws://127.0.0.1:9420' })
  })
  it('斷言失敗也先恢復 fixture 再 disconnect，且不重啟', async () => {
    const events: string[] = []
    const restartDevTools = vi.fn()
    const deps = dependencies({
      restartDevTools,
      connect: async () =>
        ({
          installFixture: async () => {
            events.push('install')
          },
          restoreFixture: async () => {
            events.push('restore')
          },
          disconnect: async () => {
            events.push('disconnect')
          },
        }) as never,
      runScenario: async () => {
        events.push('run')
        throw new Error('文字斷言失敗')
      },
    })
    expect(
      await runCli(['run', '--scenario', 'catalog', '--fixture', 'coupon-success'], deps),
    ).toBe(1)
    expect(events).toEqual(['install', 'run', 'restore', 'disconnect'])
    expect(restartDevTools).not.toHaveBeenCalled()
  })
  it('恢復重跑前還原，每次新連接重新安裝 fixture', async () => {
    const events: string[] = []
    let runs = 0
    const deps = dependencies({
      restartDevTools: async () => {
        events.push('restart')
      },
      connect: async () =>
        ({
          installFixture: async () => {
            events.push('install')
          },
          restoreFixture: async () => {
            events.push('restore')
          },
          disconnect: async () => {
            events.push('disconnect')
          },
        }) as never,
      runScenario: async () => ({
        scenario: 'fixture',
        pagePath: '/pages/catalog/index',
        state: 'normal',
        status: runs++ === 0 ? 'failed' : 'passed',
        error: runs === 1 ? 'Connection closed' : undefined,
        steps: [],
        screenshots: ['C:/review/fixture.png'],
      }),
    })
    expect(
      await runCli(['run', '--scenario', 'catalog', '--fixture', 'coupon-success'], deps),
    ).toBe(0)
    expect(events).toEqual([
      'install',
      'restore',
      'disconnect',
      'restart',
      'install',
      'restore',
      'disconnect',
    ])
  })

  it('混合缺口保存於報告，且不连接環境或執行門禁', async () => {
    const writeReport = vi.fn((..._args: Parameters<CliDependencies['writeReport']>) => ({
      htmlPath: 'C:/review/report.html',
      jsonPath: 'C:/review/report.json',
      markdownPath: 'C:/review/report.md',
    }))
    const connect = vi.fn()
    const deps = dependencies({
      writeReport,
      connect,
      readGitChangedFiles: () => [
        'miniprogram/pages/catalog/index.wxml',
        'miniprogram/pages/missing/index.json',
      ],
      listScenarioPaths: () => ['catalog'],
    })
    expect(await runCli(['changed', '--mode', 'final'], deps)).toBe(1)
    expect(connect).not.toHaveBeenCalled()
    expect(writeReport.mock.calls[0]?.[1]?.coverage.unmatchedPageFiles).toEqual([
      'miniprogram/pages/missing/index.json',
    ])
  })
  it('fixture 安裝失敗時不得開目標頁，先還原再 disconnect', async () => {
    const events: string[] = []
    const runScenario = vi.fn()
    const deps = dependencies({
      runScenario,
      connect: async () =>
        ({
          installFixture: async () => {
            events.push('install')
            throw new Error('mock 不可用')
          },
          restoreFixture: async () => {
            events.push('restore')
          },
          disconnect: async () => {
            events.push('disconnect')
          },
        }) as never,
    })
    expect(
      await runCli(['run', '--scenario', 'catalog', '--fixture', 'coupon-success'], deps),
    ).toBe(1)
    expect(runScenario).not.toHaveBeenCalled()
    expect(events).toEqual(['install', 'restore', 'restore', 'disconnect'])
  })
  it('fixture 拒绝任意脚本名稱', async () => {
    const connect = vi.fn()
    expect(
      await runCli(
        ['run', '--scenario', 'catalog', '--fixture', 'evil.js'],
        dependencies({ connect }),
      ),
    ).toBe(2)
    expect(connect).not.toHaveBeenCalled()
  })

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

  it('changed 可以把修改摘要和补充说明写入迭代报告', async () => {
    let capturedReport: ReviewReport | undefined
    const code = await runCli(
      [
        'changed',
        '--mode',
        'final',
        '--summary',
        '为贸易品页面补齐真实图示',
        '--note',
        '已检查列表页和详情页的小屏布局',
        '--note',
        '保留数据页的现有查询流程',
      ],
      dependencies({
        listScenarioPaths: () => ['catalog-search.json'],
        readGitChangedFiles: () => ['miniprogram/pages/catalog/index.wxss'],
        writeReport: (_outputDir, report) => {
          capturedReport = report
          return {
            htmlPath: 'C:/review/report.html',
            jsonPath: 'C:/review/report.json',
            markdownPath: 'C:/review/report.md',
          }
        },
      }),
    )

    expect(code).toBe(0)
    expect(capturedReport?.iterations[0]).toMatchObject({
      summary: '为贸易品页面补齐真实图示',
      notes: ['已检查列表页和详情页的小屏布局', '保留数据页的现有查询流程'],
    })
  })

  it('changed 遇到环境阻塞时重启并重新检查后继续场景', async () => {
    let capabilityChecks = 0
    const restartDevTools = vi.fn(async () => undefined)
    let firstConnectionConfig: { wsEndpoint?: string } | undefined
    const code = await runCli(
      ['changed', '--mode', 'iterate'],
      dependencies({
        listScenarioPaths: () => ['catalog-search.json'],
        readGitChangedFiles: () => ['miniprogram/pages/catalog/index.wxss'],
        checkCliCapability: async () => {
          capabilityChecks += 1
          return capabilityChecks === 1
            ? { ok: false, message: '开发者工具服务端口不可访问' }
            : { ok: true, message: '重新连接成功' }
        },
        restartDevTools: restartDevTools as never,
        connect: async (config) => {
          firstConnectionConfig = config
          return { disconnect: async () => undefined } as never
        },
      }),
    )

    expect(code).toBe(0)
    expect(restartDevTools).toHaveBeenCalledOnce()
    expect(capabilityChecks).toBe(2)
    expect(firstConnectionConfig?.wsEndpoint).toBe('ws://127.0.0.1:9420')
  })

  it('changed 預檢恢復也保留整批元件能力及工具返回的實際端口', async () => {
    let capabilityChecks = 0
    const recoveries: Array<Record<string, unknown>> = []
    const connections: Array<Record<string, unknown>> = []
    const code = await runCli(
      ['changed', '--mode', 'iterate'],
      dependencies({
        listScenarioPaths: () => ['picker.json'],
        readGitChangedFiles: () => ['miniprogram/pages/adventure-fleet/index.wxml'],
        loadScenario: () => ({
          name: '技能彈窗',
          entry: '/pages/adventure-fleet/index',
          state: 'normal',
          devices: [],
          steps: [{ action: 'waitFor', selector: '.skill-picker-sheet--sheet' }],
        }),
        checkCliCapability: async () => ({
          ok: capabilityChecks++ > 0,
          message: '开发者工具服务端口不可访问',
        }),
        restartDevTools: async (config) => {
          recoveries.push({ ...config })
          config.automationPort = 9447
        },
        connect: async (config) => {
          connections.push({ ...config })
          return { disconnect: async () => undefined } as never
        },
      }),
    )
    expect(code).toBe(0)
    expect(recoveries[0]).toMatchObject({ requiresComponentScope: true })
    expect(connections[0]).toMatchObject({
      requiresComponentScope: true,
      automationPort: 9447,
      wsEndpoint: 'ws://127.0.0.1:9447',
    })
  })

  it('初次连接阻塞恢复后使用现有自动化端点重连', async () => {
    const restartDevTools = vi.fn(async () => undefined)
    let connectCalls = 0
    const connect = vi.fn(async (config) => {
      connectCalls += 1
      if (connectCalls === 1) throw new Error('Failed connecting to ws://127.0.0.1:9420')
      expect(config.wsEndpoint).toBe('ws://127.0.0.1:9420')
      return {
        currentPagePath: async () => '/pages/catalog/index',
        disconnect: async () => undefined,
      }
    })

    const code = await runCli(
      ['start'],
      dependencies({
        connect: connect as never,
        restartDevTools: restartDevTools as never,
      }),
    )

    expect(code).toBe(0)
    expect(connect).toHaveBeenCalledTimes(2)
    expect(restartDevTools).toHaveBeenCalledOnce()
  })

  it('run 连接阻塞时把每次恢复明细写入 blocked 报告', async () => {
    const restartDevTools = vi.fn(async () => undefined)
    let capturedReport: ReviewReport | undefined
    const code = await runCli(
      ['run', '--scenario', 'catalog-search'],
      dependencies({
        connect: async () => {
          throw new Error('Failed connecting to ws://127.0.0.1:9420')
        },
        checkCliCapability: async () => ({ ok: false, message: '自动化端点仍不可用' }),
        restartDevTools: restartDevTools as never,
        writeReport: (_outputDir, report) => {
          capturedReport = report
          return {
            htmlPath: 'C:/review/report.html',
            jsonPath: 'C:/review/report.json',
            markdownPath: 'C:/review/report.md',
          }
        },
      }),
    )

    expect(code).not.toBe(0)
    expect(restartDevTools).toHaveBeenCalledTimes(2)
    expect(capturedReport?.iterations[0]?.notes.join('\n')).toContain('第 1 次恢复开始')
    expect(capturedReport?.iterations[0]?.notes.join('\n')).toContain('第 2 次恢复后仍不可用')
  })

  it('环境阻塞恢复两次仍失败时写入 blocked 报告', async () => {
    const restartDevTools = vi.fn(async () => undefined)
    let capturedReport: ReviewReport | undefined
    const code = await runCli(
      ['changed', '--mode', 'final'],
      dependencies({
        listScenarioPaths: () => ['catalog-search.json'],
        readGitChangedFiles: () => ['miniprogram/pages/catalog/index.wxss'],
        checkCliCapability: async () => ({ ok: false, message: '开发者工具登录状态不可用' }),
        restartDevTools: restartDevTools as never,
        writeReport: (_outputDir, report) => {
          capturedReport = report
          return {
            htmlPath: 'C:/review/report.html',
            jsonPath: 'C:/review/report.json',
            markdownPath: 'C:/review/report.md',
          }
        },
      }),
    )

    expect(code).not.toBe(0)
    expect(restartDevTools).toHaveBeenCalledTimes(2)
    expect(capturedReport?.status).toBe('blocked')
    expect(capturedReport?.iterations[0]?.notes.join('\n')).toContain('第 1 次恢复')
    expect(capturedReport?.iterations[0]?.notes.join('\n')).toContain('第 2 次恢复')
  })

  it('场景执行期间发生连接阻塞时恢复后只重跑当前场景', async () => {
    const restartDevTools = vi.fn(async () => undefined)
    const runScenario = vi
      .fn()
      .mockResolvedValueOnce({
        scenario: '目录搜寻',
        pagePath: '/pages/catalog/index',
        state: 'normal' as const,
        status: 'failed' as const,
        steps: [],
        screenshots: [],
        error: '连接微信开发者工具自动化端点超时',
      })
      .mockResolvedValueOnce({
        scenario: '目录搜寻',
        pagePath: '/pages/catalog/index',
        state: 'normal' as const,
        status: 'passed' as const,
        steps: [],
        screenshots: ['C:/review/catalog-after-reconnect.png'],
      })

    const code = await runCli(
      ['changed', '--mode', 'iterate'],
      dependencies({
        listScenarioPaths: () => ['catalog-search.json'],
        readGitChangedFiles: () => ['miniprogram/pages/catalog/index.wxss'],
        runScenario,
        restartDevTools: restartDevTools as never,
      }),
    )

    expect(code).toBe(0)
    expect(restartDevTools).toHaveBeenCalledOnce()
    expect(runScenario).toHaveBeenCalledTimes(2)
  })

  it('页面断言失败时不触发开发者工具重启', async () => {
    const restartDevTools = vi.fn(async () => undefined)
    const code = await runCli(
      ['changed', '--mode', 'iterate'],
      dependencies({
        listScenarioPaths: () => ['catalog-search.json'],
        readGitChangedFiles: () => ['miniprogram/pages/catalog/index.wxss'],
        runScenario: async () => ({
          scenario: '目录搜寻',
          pagePath: '/pages/catalog/index',
          state: 'normal' as const,
          status: 'failed' as const,
          steps: [],
          screenshots: [],
          error: '找不到元素：.catalog-row',
        }),
        restartDevTools: restartDevTools as never,
      }),
    )

    expect(code).not.toBe(0)
    expect(restartDevTools).not.toHaveBeenCalled()
  })

  it('同一次验收的多个场景共享最多两次恢复预算', async () => {
    const restartDevTools = vi.fn(async () => undefined)
    const runScenario = vi.fn(async () => ({
      scenario: '目录搜寻',
      pagePath: '/pages/catalog/index',
      state: 'normal' as const,
      status: 'failed' as const,
      steps: [],
      screenshots: [],
      error: '连接微信开发者工具自动化端点超时',
    }))

    const code = await runCli(
      ['changed', '--mode', 'final'],
      dependencies({
        listScenarioPaths: () => ['one.json', 'two.json', 'three.json'],
        readGitChangedFiles: () => ['miniprogram/pages/catalog/index.wxss'],
        runScenario,
        restartDevTools: restartDevTools as never,
      }),
    )

    expect(code).not.toBe(0)
    expect(restartDevTools).toHaveBeenCalledTimes(2)
    expect(runScenario).toHaveBeenCalledTimes(3)
  })
})
