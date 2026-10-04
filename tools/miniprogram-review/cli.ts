import { installReviewFixture, parseReviewFixtureName, type ReviewFixtureName } from './fixtures'
import { execFileSync } from 'node:child_process'
import { existsSync, mkdirSync, readdirSync } from 'node:fs'
import { get } from 'node:http'
import { createConnection } from 'node:net'
import { basename, isAbsolute, join, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'

import {
  connectReviewAdapter,
  isDevToolsConnectionError,
  probeAutomationEndpoint,
  restartReviewConnection,
  type ReviewAdapter,
} from './adapter'
import { diagnoseReviewConfig, resolveReviewConfig, readRegisteredPagePaths } from './config'
import {
  buildReviewReport,
  writeReviewReport,
  overallReviewStatus,
  type ReviewIterationInput,
  type ReviewReport,
} from './report'
import { createIterationInput } from './iteration'
import { readGitChangedFiles } from './git'
import { runScenario, type ScenarioRunResult, type RunScenarioContext } from './runner'
import { captureReviewSource, type ReviewEvidence } from './evidence'
import { loadScenario } from './scenario'
import { createTriggerPlan, type ReviewTriggerMode } from './trigger'
import { resolveWechatIdeCliPath } from './wechatide'
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
  fixture?: ReviewFixtureName
  mode?: string
  summary?: string
  notes?: string[]
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
  restartDevTools(config: ReviewConfig): Promise<void>
  connect(config: ReviewConfig): Promise<ReviewAdapter>
  loadScenario(path: string): ReviewScenario
  runScenario(
    adapter: ReviewAdapter,
    scenario: ReviewScenario,
    context: RunScenarioContext,
  ): Promise<ScenarioRunResult>
  writeReport(
    outputDir: string,
    report: ReviewReport,
  ): {
    htmlPath: string
    jsonPath: string
    markdownPath: string
  }
  createRunDirectory(runId: string): string
  readGitState(): { commit: string; dirty: boolean }
  readGitChangedFiles(): string[]
  runQualityGate(): Promise<boolean>
  now(): Date
  randomId(): string
  readRegisteredPagePaths?(projectRoot: string): string[]
  listScenarioPaths?(): string[]
  listPreviousReportDirs?(): string[]
  captureSource?: typeof captureReviewSource
}

const MAX_DEVTOOLS_RECOVERY_ATTEMPTS = 2

interface DevToolsRecoveryState {
  attempts: number
  notes: string[]
}

const createRecoveryState = (): DevToolsRecoveryState => ({ attempts: 0, notes: [] })

class DevToolsBlockedError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'DevToolsBlockedError'
  }
}

const optionNames: Record<string, keyof ParsedArguments> = {
  '--fixture': 'fixture',
  '--scenario': 'scenario',
  '--page': 'page',
  '--project': 'projectPath',
  '--cli-path': 'cliPath',
  '--service-port': 'servicePort',
  '--automation-port': 'automationPort',
  '--ws-endpoint': 'wsEndpoint',
  '--mode': 'mode',
  '--summary': 'summary',
}

const parseArguments = (argv: string[]): ParsedArguments => {
  const [command = '', ...rest] = argv
  const parsed: ParsedArguments = { command }
  for (let index = 0; index < rest.length; index += 2) {
    const name = rest[index]
    const value = rest[index + 1]
    if (name === '--note') {
      if (value === undefined || value.startsWith('--')) {
        throw new Error(`未知或缺少值的参数：${name}`)
      }
      parsed.notes = [...(parsed.notes ?? []), value]
      continue
    }
    const key = optionNames[name]
    if (!key || value === undefined || value.startsWith('--')) {
      throw new Error(`未知或缺少值的参数：${name}`)
    }
    Object.assign(parsed, { [key]: value })
  }
  if (parsed.fixture) parsed.fixture = parseReviewFixtureName(parsed.fixture)
  return parsed
}

const parseTriggerMode = (value: string | undefined): ReviewTriggerMode => {
  if (value === 'iterate' || value === 'final') return value
  throw new Error('changed 必须提供 --mode iterate 或 --mode final')
}

const formatError = (error: unknown): string => {
  if (error instanceof Error) {
    if (/开发者工具(?:自动恢复失败|恢复后)/.test(error.message)) return error.message
    if (isDevToolsConnectionError(error)) {
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

interface RecoveryResult {
  ok: boolean
  message: string
}

const recoverDevTools = async (
  dependencies: CliDependencies,
  config: ReviewConfig,
  initialReason: string,
  state: DevToolsRecoveryState,
): Promise<RecoveryResult> => {
  if (state.attempts >= MAX_DEVTOOLS_RECOVERY_ATTEMPTS) {
    const message = `开发者工具自动恢复失败，已达到 ${MAX_DEVTOOLS_RECOVERY_ATTEMPTS} 次恢复上限。原始阻塞：${initialReason}`
    state.notes.push(message)
    return { ok: false, message }
  }

  let lastReason = initialReason
  while (state.attempts < MAX_DEVTOOLS_RECOVERY_ATTEMPTS) {
    state.attempts += 1
    const attempt = state.attempts
    state.notes.push(`第 ${attempt} 次恢复开始：${initialReason}`)
    dependencies.log(
      `开发者工具环境阻塞，尝试重启微信开发者工具并重新连接（${attempt}/${MAX_DEVTOOLS_RECOVERY_ATTEMPTS}）`,
    )
    try {
      await dependencies.restartDevTools(config)
      const capability = await dependencies.checkCliCapability(config)
      if (capability.ok) {
        state.notes.push(`第 ${attempt} 次恢复成功：${capability.message}`)
        dependencies.log(`开发者工具自动恢复成功（第 ${attempt} 次）`)
        return capability
      }
      lastReason = capability.message
      state.notes.push(`第 ${attempt} 次恢复后仍不可用：${capability.message}`)
      dependencies.log(`第 ${attempt} 次自动恢复后仍不可用：${capability.message}`)
    } catch (error) {
      lastReason = error instanceof Error ? error.message : formatError(error)
      state.notes.push(`第 ${attempt} 次恢复失败：${lastReason}`)
      dependencies.log(`第 ${attempt} 次自动恢复失败：${lastReason}`)
    }
  }
  const message = `开发者工具自动恢复失败，已尝试 ${state.attempts} 次。原始阻塞：${initialReason}；最终原因：${lastReason}`
  state.notes.push(message)
  return {
    ok: false,
    message,
  }
}

const existingAutomationConfig = (config: ReviewConfig): ReviewConfig =>
  config.wsEndpoint || (!config.requiresComponentScope && resolveWechatIdeCliPath(config.cliPath))
    ? config
    : { ...config, wsEndpoint: `ws://127.0.0.1:${config.automationPort}` }

const connectWithRecovery = async (
  dependencies: CliDependencies,
  config: ReviewConfig,
  state: DevToolsRecoveryState,
  initialConfig: ReviewConfig = config,
): Promise<ReviewAdapter> => {
  let connectionConfig = initialConfig
  while (true) {
    try {
      try {
        return await dependencies.connect(connectionConfig)
      } finally {
        // 啟動器可能返回其他端口；失敗恢复也不得回到原請求端口。
        config.automationPort = connectionConfig.automationPort
        config.launchRecord = connectionConfig.launchRecord
        if (connectionConfig.wsEndpoint) config.wsEndpoint = connectionConfig.wsEndpoint
      }
    } catch (error) {
      if (!isDevToolsConnectionError(error)) throw error
      const recovery = await recoverDevTools(dependencies, config, formatError(error), state)
      if (!recovery.ok) throw new DevToolsBlockedError(recovery.message)
      connectionConfig = existingAutomationConfig(config)
    }
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
  iterations: ReviewIterationInput[] = [],
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
    iterations,
  })

const safeScenarioDirectoryName = (name: string, index: number): string => {
  const safeName = name
    .replace(/[<>:"/\\|?*]/g, '-')
    .trim()
    .slice(0, 60)
  return `${String(index + 1).padStart(3, '0')}-${safeName || 'scenario'}`
}

interface RunScenarioOptions {
  changedFiles?: string[]
  mode?: ReviewTriggerMode
  summary?: string
  notes?: string[]
  fixture?: ReviewFixtureName
  unmatchedPageFiles?: string[]
  unmatchedPagePaths?: string[]
  recoveryState?: DevToolsRecoveryState
  initialConfig?: ReviewConfig
}

const logReportPaths = (
  dependencies: CliDependencies,
  paths: { htmlPath: string; jsonPath: string; markdownPath: string },
  results: ScenarioRunResult[],
): void => {
  dependencies.log(`HTML 报告：${resolve(paths.htmlPath)}`)
  dependencies.log(`JSON 报告：${resolve(paths.jsonPath)}`)
  dependencies.log(`Markdown 报告：${resolve(paths.markdownPath)}`)
  for (const screenshot of results.flatMap((result) => [
    ...result.screenshots,
    ...(result.failureScreenshot ? [result.failureScreenshot] : []),
  ])) {
    dependencies.log(`截图证据：${resolve(screenshot)}`)
  }
}

const writeBlockedReport = (
  dependencies: CliDependencies,
  reason: string,
  changedFiles: string[],
  scenarios: ReviewScenario[] = [],
  options: Pick<
    RunScenarioOptions,
    'summary' | 'notes' | 'mode' | 'recoveryState' | 'unmatchedPageFiles' | 'unmatchedPagePaths'
  > = {},
): number => {
  const startedAt = dependencies.now()
  const runId = `${startedAt.toISOString().replace(/[:.]/g, '')}-${dependencies.randomId()}`
  const outputDir = dependencies.createRunDirectory(runId)
  const result: ScenarioRunResult = {
    scenario: '页面自动验收环境',
    pagePath: scenarios[0]?.entry ?? '/',
    state: 'normal',
    status: 'blocked',
    steps: [],
    screenshots: [],
    error: reason,
  }
  const iteration = createIterationInput({
    id: runId,
    startedAt,
    finishedAt: dependencies.now(),
    changedFiles,
    results: [result],
    previousReportDirs: [],
    outputDir,
    summary: options.summary ?? '页面自动验收被环境阻塞',
    notes: [reason, ...(options.recoveryState?.notes ?? []), ...(options.notes ?? [])],
  })
  const report = createReport(dependencies, runId, [result], scenarios, [iteration])
  report.checks.mode = options.mode ?? 'iterate'
  report.checks.repository.required = options.mode === 'final'
  report.status = overallReviewStatus(report.checks)
  report.coverage.unmatchedPageFiles = options.unmatchedPageFiles ?? []
  report.coverage.unmatchedPagePaths = options.unmatchedPagePaths ?? []
  for (const file of report.coverage.unmatchedPageFiles) dependencies.log(`未覆蓋文件：${file}`)
  for (const page of report.coverage.unmatchedPagePaths) dependencies.log(`未覆蓋路由：${page}`)
  const paths = dependencies.writeReport(outputDir, report)
  dependencies.log(reason)
  logReportPaths(dependencies, paths, [result])
  return 1
}

const executeScenario = async (
  dependencies: CliDependencies,
  adapter: ReviewAdapter,
  scenario: ReviewScenario,
  outputDir: string,
  fixture?: ReviewFixtureName,
  config?: ReviewConfig,
  beforeConnection?: ReturnType<typeof captureReviewSource>,
): Promise<ScenarioRunResult> => {
  const name = fixture ?? scenario.fixture
  let disconnected = false
  const disconnect = adapter.disconnect.bind(adapter)
  // runner、例外與恢復都經同一還原邊界，避免重跑前留下 mock。
  adapter.disconnect = async () => {
    if (!disconnected) {
      disconnected = true
      try {
        await adapter.restoreFixture?.()
      } catch (error) {
        // 還原失敗仍須釋放連接，並保留最初的還原錯誤。
        try {
          await disconnect()
        } catch {
          // 斷線錯誤不得覆蓋還原失敗的原因。
        }
        throw error
      }
      await disconnect()
    }
  }
  let result: ScenarioRunResult
  const root = config?.projectPath ?? dependencies.cwd
  let source: ReturnType<typeof captureReviewSource> | undefined
  let sourcePhase = true
  try {
    const launch = adapter.getReviewLaunchRecord?.()
    source = dependencies.captureSource?.(root, launch?.executionRoot ?? root)
    const evidenceSource: ReviewEvidence['source'] | undefined = source
      ? {
          ...source,
          unchangedDuringRun: true,
          binding: launch?.projectRoot === root ? 'launch-recorded' : 'unverified',
        }
      : undefined
    sourcePhase = false
    if (name) await installReviewFixture(adapter, name)
    result = await dependencies.runScenario(
      adapter,
      name ? { ...scenario, fixture: name } : scenario,
      { outputDir, evidenceSource },
    )
  } catch (error) {
    result = {
      scenario: scenario.name,
      pagePath: scenario.entry,
      state: scenario.state,
      status: sourcePhase || name ? 'blocked' : 'failed',
      steps: [],
      screenshots: [],
      error: formatError(error),
    }
  }
  try {
    await adapter.disconnect()
  } catch (error) {
    result = {
      ...result,
      status: 'blocked',
      error: `fixture 或連接恢復失敗：${formatError(error)}`,
    }
  }
  if (source && dependencies.captureSource) {
    try {
      const end = dependencies.captureSource(root, source.executionRoot)
      const originalEnd = dependencies.captureSource(root, root)
      const unchanged =
        source.candidateSha256 === end.candidateSha256 &&
        (!beforeConnection || beforeConnection.candidateSha256 === originalEnd.candidateSha256)
      for (const entry of result.screenshotEvidence ?? [])
        entry.evidence.source.unchangedDuringRun = unchanged
      if (!unchanged) {
        result.status = 'failed'
        result.error =
          (result.error ? result.error + '；' : '') + '來源在頁面執行期間變動，證據不能判定通過。'
      }
    } catch (error) {
      for (const entry of result.screenshotEvidence ?? [])
        entry.evidence.source.unchangedDuringRun = false
      result.status = 'blocked'
      result.error =
        (result.error ? result.error + '；' : '') + '來源身份核對失敗：' + formatError(error)
    }
  }
  return result
}

const needsComponentScope = (scenarios: ReviewScenario[]): boolean =>
  scenarios.some((scenario) =>
    scenario.steps.some(
      (step) =>
        ('selector' in step && /skill-picker-sheet|skill-sheet/.test(step.selector)) ||
        (step.action === 'waitUntil' &&
          'selector' in step.condition &&
          /skill-picker-sheet|skill-sheet/.test(step.condition.selector)),
    ),
  )

const runScenarios = async (
  dependencies: CliDependencies,
  config: ReviewConfig,
  scenarios: ReviewScenario[],
  options: RunScenarioOptions = {},
): Promise<number> => {
  const recoveryState = options.recoveryState ?? createRecoveryState()
  const startedAt = dependencies.now()
  const runId = `${startedAt.toISOString().replace(/[:.]/g, '')}-${dependencies.randomId()}`
  const outputDir = dependencies.createRunDirectory(runId)
  const results: ScenarioRunResult[] = []
  const requiresComponentScope = needsComponentScope(scenarios)
  let componentSessionStarted = false
  for (const [index, scenario] of scenarios.entries()) {
    const scenarioConfig: ReviewConfig = requiresComponentScope
      ? { ...config, requiresComponentScope: true }
      : config
    const scenarioOutput = join(
      outputDir,
      'current-simulator',
      safeScenarioDirectoryName(scenario.name, index),
    )
    mkdirSync(scenarioOutput, { recursive: true })
    let adapter: ReviewAdapter
    const beforeConnection = dependencies.captureSource?.(config.projectPath, config.projectPath)
    try {
      adapter = await connectWithRecovery(
        dependencies,
        scenarioConfig,
        recoveryState,
        scenarioConfig.requiresComponentScope && componentSessionStarted
          ? existingAutomationConfig(scenarioConfig)
          : scenarioConfig === config
            ? (options.initialConfig ?? config)
            : { ...(options.initialConfig ?? config), requiresComponentScope: true },
      )
      if (scenarioConfig.requiresComponentScope) {
        componentSessionStarted = true
        config.launchRecord = scenarioConfig.launchRecord
        config.automationPort = scenarioConfig.automationPort
        if (config.wsEndpoint && scenarioConfig.wsEndpoint)
          config.wsEndpoint = scenarioConfig.wsEndpoint
      }
    } catch (error) {
      if (error instanceof DevToolsBlockedError) {
        return writeBlockedReport(
          dependencies,
          error.message,
          options.changedFiles ?? [],
          scenarios,
          { ...options, recoveryState },
        )
      }
      throw error
    }
    let result = await executeScenario(
      dependencies,
      adapter,
      scenario,
      scenarioOutput,
      options.fixture,
      scenarioConfig,
      beforeConnection,
    )
    while (result.status === 'failed' && isDevToolsConnectionError(result.error)) {
      const recovery = await recoverDevTools(
        dependencies,
        scenarioConfig,
        result.error ?? '场景执行期间自动化连接失败',
        recoveryState,
      )
      if (!recovery.ok) {
        result = {
          ...result,
          status: 'blocked',
          error: recovery.message,
        }
      } else {
        try {
          const retryAdapter = await connectWithRecovery(
            dependencies,
            scenarioConfig,
            recoveryState,
            existingAutomationConfig(scenarioConfig),
          )
          const retriedResult = await executeScenario(
            dependencies,
            retryAdapter,
            scenario,
            scenarioOutput,
            options.fixture,
            scenarioConfig,
            beforeConnection,
          )
          result = retriedResult
        } catch (error) {
          result = {
            ...result,
            status: 'blocked',
            error: `开发者工具恢复后场景重连失败：${formatError(error)}`,
          }
        }
      }
    }
    if (scenarioConfig.requiresComponentScope) {
      config.launchRecord = scenarioConfig.launchRecord
      config.automationPort = scenarioConfig.automationPort
      if (config.wsEndpoint && scenarioConfig.wsEndpoint)
        config.wsEndpoint = scenarioConfig.wsEndpoint
    }
    results.push(result)
    if (result.status === 'blocked') break
  }
  const iterations = options.changedFiles
    ? [
        createIterationInput({
          id: runId,
          startedAt,
          finishedAt: dependencies.now(),
          changedFiles: options.changedFiles,
          results,
          previousReportDirs: dependencies.listPreviousReportDirs?.() ?? [],
          outputDir,
          summary:
            options.summary ?? (options.mode === 'final' ? '本轮页面修改与最终验收' : undefined),
          notes: [...recoveryState.notes, ...(options.notes ?? [])],
        }),
      ]
    : []
  const report = createReport(dependencies, runId, results, scenarios, iterations)
  report.checks.mode = options.mode ?? 'iterate'
  report.checks.repository.required = options.mode === 'final'
  if (options.mode === 'final' && report.checks.page.status === 'passed') {
    try {
      report.checks.repository.status = (await dependencies.runQualityGate()) ? 'passed' : 'failed'
    } catch (error) {
      report.checks.repository.status = 'blocked'
      report.checks.repository.evidence = formatError(error)
    }
  }
  report.status = overallReviewStatus(report.checks)
  dependencies.log(
    '本輪要求的檢查：頁面 ' +
      report.checks.page.status +
      '；倉庫 ' +
      report.checks.repository.status +
      '；外部驗收未執行；整體 ' +
      report.status,
  )
  const paths = dependencies.writeReport(outputDir, report)
  logReportPaths(dependencies, paths, results)
  return report.status === 'passed' ? 0 : 1
}

const loadAllScenarios = (dependencies: CliDependencies): ReviewScenario[] =>
  (dependencies.listScenarioPaths?.() ?? []).map((path) => dependencies.loadScenario(path))

const runChanged = async (
  dependencies: CliDependencies,
  config: ReviewConfig,
  mode: ReviewTriggerMode,
  options: Pick<RunScenarioOptions, 'summary' | 'notes' | 'fixture'> = {},
): Promise<number> => {
  const recoveryState = createRecoveryState()
  const changedFiles = dependencies.readGitChangedFiles()
  let registeredPagePaths: string[] | undefined
  if (changedFiles.some((file) => file.replace(/\\/g, '/') === 'miniprogram/app.json')) {
    try {
      registeredPagePaths = (dependencies.readRegisteredPagePaths ?? readRegisteredPagePaths)(
        config.projectPath,
      )
    } catch (error) {
      return writeBlockedReport(
        dependencies,
        `無法讀取註冊路由：${formatError(error)}`,
        changedFiles,
        [],
        { ...options, mode },
      )
    }
  }
  const plan = createTriggerPlan({
    mode,
    changedFiles,
    scenarios: loadAllScenarios(dependencies),
    registeredPagePaths,
  })
  if (plan.outcome === 'skipped') {
    dependencies.log(plan.reason ?? '未发现页面相关变更，已跳过自动验收')
    return 0
  }
  if (plan.outcome === 'blocked') {
    return writeBlockedReport(
      dependencies,
      plan.reason ?? '页面自动验收被阻塞',
      plan.changedFiles,
      plan.scenarios,
      {
        ...options,
        mode,
        unmatchedPageFiles: plan.unmatchedPageFiles,
        unmatchedPagePaths: plan.unmatchedPagePaths,
      },
    )
  }

  // 預檢恢復也必須使用整批所需通道，不能先啟動 nativeCLI 再切換 SDK。
  if (needsComponentScope(plan.scenarios)) config = { ...config, requiresComponentScope: true }
  const capability = await dependencies.checkCliCapability(config)
  let initialConfig = config
  if (!capability.ok) {
    const recovery = await recoverDevTools(dependencies, config, capability.message, recoveryState)
    if (!recovery.ok) {
      return writeBlockedReport(dependencies, recovery.message, plan.changedFiles, plan.scenarios, {
        ...options,
        mode,
        recoveryState,
      })
    }
    initialConfig = existingAutomationConfig(config)
  }

  return await runScenarios(dependencies, config, plan.scenarios, {
    changedFiles: plan.changedFiles,
    mode,
    recoveryState,
    initialConfig,
    ...options,
  })
}

export const runCli = async (argv: string[], dependencies: CliDependencies): Promise<number> => {
  let parsed: ParsedArguments
  let triggerMode: ReviewTriggerMode | undefined
  try {
    parsed = parseArguments(argv)
    if (parsed.command === 'changed') triggerMode = parseTriggerMode(parsed.mode)
  } catch (error) {
    dependencies.log(formatError(error))
    return 2
  }

  if (!['doctor', 'start', 'inspect', 'run', 'review', 'changed'].includes(parsed.command)) {
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
      const adapter = await connectWithRecovery(dependencies, config, createRecoveryState())
      dependencies.log(`自动化连接成功：${await adapter.currentPagePath()}`)
      await adapter.disconnect()
      return 0
    }
    if (parsed.command === 'inspect') {
      if (!parsed.page) throw new Error('inspect 必须提供 --page')
      return await runScenarios(
        dependencies,
        config,
        [
          {
            name: `检查 ${parsed.page}`,
            entry: parsed.page,
            state: 'normal',
            devices: ['iphone-standard'],
            steps: [{ action: 'screenshot', name: 'inspect' }],
          },
        ],
        { fixture: parsed.fixture },
      )
    }
    if (parsed.command === 'run') {
      if (!parsed.scenario) throw new Error('run 必须提供 --scenario')
      return await runScenarios(
        dependencies,
        config,
        [dependencies.loadScenario(scenarioPath(dependencies.cwd, parsed.scenario))],
        { fixture: parsed.fixture },
      )
    }
    if (parsed.command === 'changed') {
      if (!triggerMode) throw new Error('changed 必须提供 --mode iterate 或 --mode final')
      return await runChanged(dependencies, config, triggerMode, {
        summary: parsed.summary,
        notes: parsed.notes,
        fixture: parsed.fixture,
      })
    }
    if (!parsed.page) throw new Error('review 必须提供 --page')
    const paths = dependencies.listScenarioPaths?.() ?? []
    const scenarios = paths
      .map((path) => dependencies.loadScenario(path))
      .filter((scenario) => scenario.entry === parsed.page)
    if (scenarios.length === 0) throw new Error(`找不到页面验收场景：${parsed.page}`)
    return await runScenarios(dependencies, config, scenarios, { fixture: parsed.fixture })
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
  if (!config.cliPath && !config.wsEndpoint) {
    return { ok: false, message: '找不到微信开发者工具 CLI 或自动化 WebSocket 端点' }
  }
  if (!config.servicePort) {
    if (!config.wsEndpoint) {
      return {
        ok: true,
        message: '微信开发者工具 CLI 可用，验收时将自动启动自动化会话',
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

export const getQualityGateCommand = (
  platform: NodeJS.Platform = process.platform,
): { command: string; args: string[] } =>
  platform === 'win32'
    ? { command: 'cmd.exe', args: ['/d', '/s', '/c', 'npm.cmd run verify'] }
    : { command: 'npm', args: ['run', 'verify'] }

const defaultDependencies: CliDependencies = {
  cwd: root,
  env: process.env,
  log: console.log,
  resolveConfig: resolveReviewConfig,
  diagnose: diagnoseReviewConfig,
  checkCliCapability,
  restartDevTools: restartReviewConnection,
  connect: connectReviewAdapter,
  loadScenario,
  runScenario,
  writeReport: writeReviewReport,
  captureSource: captureReviewSource,
  createRunDirectory: (runId) => join(root, 'artifacts', 'miniprogram-review', runId),
  readGitState: () => ({
    commit: execFileSync('git', ['rev-parse', '--short', 'HEAD'], { encoding: 'utf8' }).trim(),
    dirty: execFileSync('git', ['status', '--porcelain'], { encoding: 'utf8' }).trim().length > 0,
  }),
  readGitChangedFiles: () => readGitChangedFiles(root),
  runQualityGate: async () => {
    try {
      const { command, args } = getQualityGateCommand()
      execFileSync(command, args, { cwd: root, stdio: 'inherit' })
      return true
    } catch {
      return false
    }
  },
  now: () => new Date(),
  randomId: () => Math.random().toString(36).slice(2, 8),
  listScenarioPaths: () =>
    readdirSync(scenarioDirectory, { withFileTypes: true })
      .filter((entry) => entry.isFile() && entry.name.endsWith('.json'))
      .map((entry) => join(scenarioDirectory, entry.name)),
  listPreviousReportDirs: () => {
    const reportsRoot = join(root, 'artifacts', 'miniprogram-review')
    if (!existsSync(reportsRoot)) return []
    return readdirSync(reportsRoot, { withFileTypes: true })
      .filter((entry) => entry.isDirectory())
      .map((entry) => join(reportsRoot, entry.name))
      .sort((left, right) => right.localeCompare(left))
  },
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
