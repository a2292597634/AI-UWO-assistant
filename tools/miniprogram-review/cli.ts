import { execFileSync } from 'node:child_process'
import { mkdirSync, readdirSync } from 'node:fs'
import { get } from 'node:http'
import { createConnection } from 'node:net'
import { basename, isAbsolute, join, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'

import { connectReviewAdapter, probeAutomationEndpoint, type ReviewAdapter } from './adapter'
import { diagnoseReviewConfig, resolveReviewConfig } from './config'
import { buildReviewReport, writeReviewReport, type ReviewReport } from './report'
import { runScenario, type ScenarioRunResult } from './runner'
import { loadScenario } from './scenario'
import {
  REVIEW_STATES,
  type DiagnosticItem,
  type ReviewConfig,
  type ReviewConfigArgs,
  type ReviewScenario,
} from './types'

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
  checkCliCapability(config: ReviewConfig): Promise<{ ok: boolean; message: string }>
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

const formatError = (error: unknown): string => {
  if (error instanceof Error) {
    if (/Failed connecting|ECONNREFUSED|automation enabled|自动化端点/i.test(error.message)) {
      return `无法连接微信开发者工具自动化会话：${error.message}。请确认开发者工具已登录、项目已打开且已开启自动化接口。`
    }
    return error.message
  }
  if (typeof error === 'string') return error
  try {
    const serialized = JSON.stringify(error)
    return serialized === undefined ? String(error) : serialized
  } catch {
    return String(error)
  }
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
      manualStates: REVIEW_STATES.filter(
        (state) => !scenarios.some((scenario) => scenario.state === state),
      ),
    },
  })

const safeScenarioDirectoryName = (name: string, index: number): string => {
  const safeName = name
    .replace(/[<>:"/\\|?*]/g, '-')
    .trim()
    .slice(0, 60)
  return `${String(index + 1).padStart(3, '0')}-${safeName || 'scenario'}`
}

const runScenarios = async (
  dependencies: CliDependencies,
  config: ReviewConfig,
  scenarios: ReviewScenario[],
): Promise<number> => {
  const runId = `${dependencies.now().toISOString().replace(/[:.]/g, '')}-${dependencies.randomId()}`
  const outputDir = dependencies.createRunDirectory(runId)
  const results: ScenarioRunResult[] = []
  for (const [index, scenario] of scenarios.entries()) {
    const adapter = await dependencies.connect(config)
    const scenarioOutput = join(
      outputDir,
      'current-simulator',
      safeScenarioDirectoryName(scenario.name, index),
    )
    mkdirSync(scenarioOutput, { recursive: true })
    results.push(await dependencies.runScenario(adapter, scenario, { outputDir: scenarioOutput }))
  }
  const report = createReport(dependencies, runId, results, scenarios)
  const paths = dependencies.writeReport(outputDir, report)
  dependencies.log(`JSON 报告：${resolve(paths.jsonPath)}`)
  dependencies.log(`Markdown 报告：${resolve(paths.markdownPath)}`)
  for (const screenshot of results.flatMap((result) => [
    ...result.screenshots,
    ...(result.failureScreenshot ? [result.failureScreenshot] : []),
  ])) {
    dependencies.log(`截图证据：${resolve(screenshot)}`)
  }
  return report.status === 'passed' ? 0 : 1
}

export const runCli = async (argv: string[], dependencies: CliDependencies): Promise<number> => {
  let parsed: ParsedArguments
  try {
    parsed = parseArguments(argv)
  } catch (error) {
    dependencies.log(formatError(error))
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
      if (diagnostics.some((item) => item.level === 'error')) return 1
      const capability = await dependencies.checkCliCapability(config)
      dependencies.log(capability.message)
      return capability.ok ? 0 : 1
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
    dependencies.log(formatError(error))
    return 1
  }
}

const root = process.cwd()
const scenarioDirectory = join(root, 'tools', 'miniprogram-review', 'scenarios')

const checkTcpPort = async (port: number, timeoutMs = 3000): Promise<boolean> =>
  await new Promise<boolean>((resolveReachability) => {
    const socket = createConnection({ host: '127.0.0.1', port })
    const finish = (value: boolean) => {
      socket.destroy()
      resolveReachability(value)
    }
    socket.setTimeout(timeoutMs)
    socket.once('connect', () => finish(true))
    socket.once('timeout', () => finish(false))
    socket.once('error', () => finish(false))
  })

const readServiceJson = async (port: number, path: string): Promise<unknown> =>
  await new Promise<unknown>((resolveResponse, rejectResponse) => {
    const request = get({ host: '127.0.0.1', port, path }, (response) => {
      const chunks: Buffer[] = []
      response.on('data', (chunk: Buffer) => chunks.push(chunk))
      response.on('end', () => {
        const body = Buffer.concat(chunks).toString('utf8')
        if ((response.statusCode ?? 500) < 200 || (response.statusCode ?? 500) >= 300) {
          rejectResponse(new Error(`服务 API ${path} 返回 HTTP ${response.statusCode ?? '未知'}`))
          return
        }
        try {
          resolveResponse(JSON.parse(body))
        } catch {
          rejectResponse(new Error(`服务 API ${path} 返回了无法解析的 JSON`))
        }
      })
    })
    request.setTimeout(3000, () => {
      request.destroy(new Error(`服务 API ${path} 请求超时`))
    })
    request.once('error', rejectResponse)
  })

const checkCliCapability = async (
  config: ReviewConfig,
): Promise<{ ok: boolean; message: string }> => {
  if (!config.cliPath) return { ok: false, message: '找不到微信开发者工具 CLI' }
  if (!config.servicePort) {
    if (!config.wsEndpoint) {
      return {
        ok: false,
        message:
          '请设置 WECHAT_DEVTOOLS_SERVICE_PORT 或 WECHAT_AUTOMATION_WS_ENDPOINT 后检查开发者工具',
      }
    }
    try {
      const info = await probeAutomationEndpoint(config.wsEndpoint)
      return {
        ok: true,
        message: `自动化 WebSocket 可用：${config.wsEndpoint}（开发者工具 ${String(info.version ?? '未知版本')}）`,
      }
    } catch (error) {
      return { ok: false, message: `自动化 WebSocket 不可用：${formatError(error)}` }
    }
  }
  const servicePort = config.servicePort
  if (!(await checkTcpPort(servicePort))) {
    return { ok: false, message: `开发者工具服务端口不可访问：${servicePort}` }
  }
  let login: unknown
  try {
    login = await readServiceJson(servicePort, '/v2/islogin')
  } catch (error) {
    return { ok: false, message: `开发者工具登录状态接口不可用：${formatError(error)}` }
  }
  if (!login || typeof login !== 'object' || !('login' in login) || login.login !== true) {
    return { ok: false, message: '微信开发者工具未登录，请先在开发者工具完成登录' }
  }
  if (config.wsEndpoint) {
    try {
      await probeAutomationEndpoint(config.wsEndpoint)
    } catch (error) {
      return { ok: false, message: `自动化 WebSocket 不可用：${formatError(error)}` }
    }
  }
  return { ok: true, message: `CLI 可执行、登录状态正常，服务端口可访问：${servicePort}` }
}

const defaultDependencies: CliDependencies = {
  cwd: root,
  env: process.env,
  log: console.log,
  resolveConfig: resolveReviewConfig,
  diagnose: diagnoseReviewConfig,
  checkCliCapability,
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
      console.error(`验收工具发生未预期错误：${formatError(error)}`)
      process.exitCode = 1
    })
}

export const cliName = basename(process.argv[1] ?? 'miniprogram-review')
