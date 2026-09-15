import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { runCli, type CliDependencies } from '../../tools/miniprogram-review/cli'

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
  }),
  writeReport: () => ({ jsonPath: 'C:/review/report.json', markdownPath: 'C:/review/report.md' }),
  createRunDirectory,
  readGitState: () => ({ commit: 'abc1234', dirty: false }),
  now: () => new Date('2026-09-15T12:00:00.000Z'),
  randomId: () => 'fixed',
  ...overrides,
})

describe('小程序验收 CLI', () => {
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

  it('run 场景失败时写入报告并返回 1', async () => {
    const writeReport = vi.fn(() => ({
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
})
