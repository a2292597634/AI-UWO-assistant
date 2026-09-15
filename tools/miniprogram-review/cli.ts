import { execFileSync } from 'node:child_process'
import { mkdirSync, readdirSync } from 'node:fs'
import { basename, isAbsolute, join, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'

import { connectReviewAdapter, type ReviewAdapter } from './adapter'
import { diagnoseReviewConfig, resolveReviewConfig } from './config'
import { buildReviewReport, writeReviewReport, type ReviewReport } from './report'
import { runScenario, type ScenarioRunResult } from './runner'
import { loadScenario } from './scenario'
import type { DiagnosticItem, ReviewConfig, ReviewConfigArgs, ReviewScenario } from './types'

interface ParsedArguments extends ReviewConfigArgs {
  command: string
  scenario?: string
  page?: string
}

export interface CliDependencies {
  cwd: string
  env: Record<string, string | undefined>
  log(message: string): void
  resolveConfig(input: {
    cwd: string
    args: ReviewConfigArgs
    env: Record<string, string | undefined>
  }): ReviewConfig
  diagnose(config: ReviewConfig): DiagnosticItem[]
  connect(config: ReviewConfig): Promise<ReviewAdapter>
  loadScenario(path: string): ReviewScenario
  runScenario(
    adapter: ReviewAdapter,
    scenario: ReviewScenario,
    context: { outputDir: string },
  ): Promise<ScenarioRunResult>
  writeReport(
    outputDir: string,
    report: ReviewReport,
  ): {
    jsonPath: string
    markdownPath: string
  }
  createRunDirectory(runId: string): string
  readGitState(): { commit: string; dirty: boolean }
  now(): Date
  randomId(): string
  listScenarioPaths?(): string[]
}

const optionNames: Record<string, keyof ParsedArguments> = {
  '--scenario': 'scenario',
  '--page': 'page',
  '--project': 'projectPath',
  '--cli-path': 'cliPath',
  '--service-port': 'servicePort',
  '--automation-port': 'automationPort',
  '--ws-endpoint': 'wsEndpoint',
}

const parseArguments = (argv: string[]): ParsedArguments => {
  const [command = '', ...rest] = argv
  const parsed: ParsedArguments = { command }
  for (let index = 0; index < rest.length; index += 2) {
    const name = rest[index]
    const value = rest[index + 1]
    const key = optionNames[name]
    if (!key || value === undefined || value.startsWith('--')) {
      throw new Error(`未知或缺少值的参数：${name}`)
    }
    Object.assign(parsed, { [key]: value })
  }
  return parsed
}

const scenarioPath = (cwd: string, value: string): string => {
  if (isAbsolute(value)) return value
  if (value.endsWith('.json') || value.includes('/') || value.includes('\\')) {
    return resolve(cwd, value)
  }
  return join(cwd, 'tools', 'miniprogram-review', 'scenarios', `${value}.json`)
}

const createReport = (
  dependencies: CliDependencies,
  runId: string,
  results: ScenarioRunResult[],
  scenarios: ReviewScenario[],
): ReviewReport =>
  buildReviewReport({
    runId,
    generatedAt: dependencies.now(),
    git: dependencies.readGitState(),
    results,
    coverage: {
      covered: results
        .filter((result) => result.status === 'passed')
        .map((result) => `current-simulator/${result.state}`),
      exempted: [],
      manual: [...new Set(scenarios.flatMap((scenario) => scenario.devices))],
    },
  })

const runScenarios = async (
  dependencies: CliDependencies,
  config: ReviewConfig,
  scenarios: ReviewScenario[],
): Promise<number> => {
  const runId = `${dependencies.now().toISOString().replace(/[:.]/g, '')}-${dependencies.randomId()}`
  const outputDir = dependencies.createRunDirectory(runId)
  const results: ScenarioRunResult[] = []
  for (const scenario of scenarios) {
    const adapter = await dependencies.connect(config)
    const scenarioOutput = join(outputDir, scenario.devices[0] ?? 'current-simulator')
    mkdirSync(scenarioOutput, { recursive: true })
    results.push(await dependencies.runScenario(adapter, scenario, { outputDir: scenarioOutput }))
  }
  const report = createReport(dependencies, runId, results, scenarios)
  const paths = dependencies.writeReport(outputDir, report)
  dependencies.log(`JSON 报告：${resolve(paths.jsonPath)}`)
  dependencies.log(`Markdown 报告：${resolve(paths.markdownPath)}`)
  return report.status === 'passed' ? 0 : 1
}

export const runCli = async (argv: string[], dependencies: CliDependencies): Promise<number> => {
  let parsed: ParsedArguments
  try {
    parsed = parseArguments(argv)
  } catch (error) {
    dependencies.log(error instanceof Error ? error.message : String(error))
    return 2
  }

  if (!['doctor', 'start', 'inspect', 'run', 'review'].includes(parsed.command)) {
    dependencies.log(`未知命令：${parsed.command || '未提供'}`)
    return 2
  }

  try {
    const config = dependencies.resolveConfig({
      cwd: dependencies.cwd,
      args: parsed,
      env: dependencies.env,
    })
    if (parsed.command === 'doctor') {
      const diagnostics = dependencies.diagnose(config)
      for (const item of diagnostics) dependencies.log(item.message)
      return diagnostics.some((item) => item.level === 'error') ? 1 : 0
    }
    if (parsed.command === 'start') {
      const adapter = await dependencies.connect(config)
      dependencies.log(`自动化连接成功：${await adapter.currentPagePath()}`)
      await adapter.disconnect()
      return 0
    }
    if (parsed.command === 'inspect') {
      if (!parsed.page) throw new Error('inspect 必须提供 --page')
      return await runScenarios(dependencies, config, [
        {
          name: `检查 ${parsed.page}`,
          entry: parsed.page,
          state: 'normal',
          devices: ['iphone-standard'],
          steps: [{ action: 'screenshot', name: 'inspect' }],
        },
      ])
    }
    if (parsed.command === 'run') {
      if (!parsed.scenario) throw new Error('run 必须提供 --scenario')
      return await runScenarios(dependencies, config, [
        dependencies.loadScenario(scenarioPath(dependencies.cwd, parsed.scenario)),
      ])
    }
    if (!parsed.page) throw new Error('review 必须提供 --page')
    const paths = dependencies.listScenarioPaths?.() ?? []
    const scenarios = paths
      .map((path) => dependencies.loadScenario(path))
      .filter((scenario) => scenario.entry === parsed.page)
    if (scenarios.length === 0) throw new Error(`找不到页面验收场景：${parsed.page}`)
    return await runScenarios(dependencies, config, scenarios)
  } catch (error) {
    dependencies.log(error instanceof Error ? error.message : String(error))
    return 1
  }
}

const root = process.cwd()
const scenarioDirectory = join(root, 'tools', 'miniprogram-review', 'scenarios')
const defaultDependencies: CliDependencies = {
  cwd: root,
  env: process.env,
  log: console.log,
  resolveConfig: resolveReviewConfig,
  diagnose: diagnoseReviewConfig,
  connect: connectReviewAdapter,
  loadScenario,
  runScenario,
  writeReport: writeReviewReport,
  createRunDirectory: (runId) => join(root, 'artifacts', 'miniprogram-review', runId),
  readGitState: () => ({
    commit: execFileSync('git', ['rev-parse', '--short', 'HEAD'], { encoding: 'utf8' }).trim(),
    dirty: execFileSync('git', ['status', '--porcelain'], { encoding: 'utf8' }).trim().length > 0,
  }),
  now: () => new Date(),
  randomId: () => Math.random().toString(36).slice(2, 8),
  listScenarioPaths: () =>
    readdirSync(scenarioDirectory, { withFileTypes: true })
      .filter((entry) => entry.isFile() && entry.name.endsWith('.json'))
      .map((entry) => join(scenarioDirectory, entry.name)),
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  runCli(process.argv.slice(2), defaultDependencies)
    .then((code) => {
      process.exitCode = code
    })
    .catch((error: unknown) => {
      console.error(
        `验收工具发生未预期错误：${error instanceof Error ? error.message : String(error)}`,
      )
      process.exitCode = 1
    })
}

export const cliName = basename(process.argv[1] ?? 'miniprogram-review')
