import { createFixtureLifecycle } from './fixtures'
import { existsSync } from 'node:fs'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { dirname, join } from 'node:path'

import type { ReviewAdapter } from './adapter'
import type { ReviewConfig } from './types'
import { runtimeInfoSource, normalizeRuntimeMeasurement, type ReviewLaunchRecord } from './evidence'

const execFileAsync = promisify(execFile)
const DEFAULT_CLIENT_NAME = 'Codex'

interface WechatIdeResponse {
  ok?: boolean
  message?: string
  result?: unknown
}

export interface WechatIdeRunner {
  call(tool: string, args: string[], options?: { timeoutMs: number }): Promise<unknown>
}

export interface WechatIdeAdapterOptions {
  runner?: WechatIdeRunner
  openProject?: boolean
}

export const resolveWechatIdeCliPath = (cliPath?: string): string | undefined => {
  if (!cliPath) return undefined
  const candidate = join(dirname(cliPath), 'wechatide.cmd')
  return existsSync(candidate) ? candidate : undefined
}

const commandOutput = (stdout: unknown, stderr: unknown): string =>
  [stdout, stderr]
    .filter((value): value is string => typeof value === 'string' && value.length > 0)
    .join('\n')

const quoteWindowsCommandArgument = (value: string): string => `"${value.split('"').join('""')}"`

const errorWithCause = (message: string, cause: unknown): Error => {
  const wrapped = new Error(message) as Error & { cause?: unknown }
  wrapped.cause = cause
  return wrapped
}

const extractFirstJsonObject = (output: string): string => {
  const start = output.indexOf('{')
  if (start < 0) throw new Error(`wechatide 未返回 JSON：${output.trim() || '空输出'}`)
  let depth = 0
  let inString = false
  let escaped = false
  for (let index = start; index < output.length; index += 1) {
    const character = output[index]
    if (inString) {
      if (escaped) escaped = false
      else if (character === '\\') escaped = true
      else if (character === '"') inString = false
      continue
    }
    if (character === '"') {
      inString = true
      continue
    }
    if (character === '{') depth += 1
    if (character === '}') {
      depth -= 1
      if (depth === 0) return output.slice(start, index + 1)
    }
  }
  throw new Error(`wechatide 返回了不完整的 JSON：${output.slice(start).trim()}`)
}

export const parseWechatIdeResponse = (output: string): WechatIdeResponse => {
  try {
    return JSON.parse(extractFirstJsonObject(output)) as WechatIdeResponse
  } catch (error) {
    throw errorWithCause(
      `wechatide 返回 JSON 无法解析：${error instanceof Error ? error.message : String(error)}`,
      error,
    )
  }
}

class WechatIdeToolError extends Error {
  constructor(
    message: string,
    readonly tool: string,
  ) {
    super(message)
    this.name = 'WechatIdeToolError'
  }
}

const createDefaultRunner = (cliPath: string): WechatIdeRunner => ({
  async call(tool, args, options) {
    let output: string
    try {
      const result = await execFileAsync(
        process.env.ComSpec ?? 'cmd.exe',
        [
          '/d',
          '/s',
          '/c',
          `"${[
            cliPath,
            '-c',
            process.env.WECHATIDE_CLIENT_NAME ?? DEFAULT_CLIENT_NAME,
            tool,
            ...args,
          ]
            .map(quoteWindowsCommandArgument)
            .join(' ')}"`,
        ],
        {
          encoding: 'utf8',
          maxBuffer: 16 * 1024 * 1024,
          windowsVerbatimArguments: true,
          windowsHide: true,
          timeout: options?.timeoutMs ?? 30000,
        },
      )
      output = commandOutput(result.stdout, result.stderr)
    } catch (error) {
      const commandError = error as {
        stdout?: unknown
        stderr?: unknown
        message?: unknown
        killed?: boolean
      }
      if (commandError.killed) {
        throw new WechatIdeToolError(`wechatide command timeout：${tool}`, tool)
      }
      output = commandOutput(commandError.stdout, commandError.stderr)
      if (!output) {
        throw new WechatIdeToolError(
          commandError.message ? String(commandError.message) : `wechatide 调用失败：${tool}`,
          tool,
        )
      }
    }

    const response = parseWechatIdeResponse(output)
    if (response.ok === false) {
      throw new WechatIdeToolError(response.message ?? `wechatide 工具失败：${tool}`, tool)
    }
    return response.result
  },
})

const projectArgs = (projectPath: string): string[] => ['--project', projectPath]

const callOpenProject = async (runner: WechatIdeRunner, projectPath: string): Promise<void> => {
  await runner.call('open_project_window', [
    ...projectArgs(projectPath),
    '--window-mode',
    'liteMode',
  ])
}

const readCurrentPage = async (runner: WechatIdeRunner, projectPath: string): Promise<string> => {
  const result = (await runner.call('automation_runtime_info', [
    ...projectArgs(projectPath),
    '--action',
    'currentPage',
  ])) as { currentPage?: { route?: unknown; path?: unknown } }
  const current = result.currentPage
  const route = current?.route ?? current?.path
  if (typeof route !== 'string' || !route) throw new Error('微信开发者工具没有当前小程序页面')
  return route.startsWith('/') ? route : `/${route}`
}

const unwrapEvaluateResult = (result: unknown): unknown => {
  if (!result || typeof result !== 'object') return result
  const envelope = result as { success?: unknown; result?: unknown }
  if (envelope.success !== true || !('result' in envelope)) return result
  const toolResult = envelope.result
  if (toolResult && typeof toolResult === 'object' && 'result' in toolResult) {
    return (toolResult as { result?: unknown }).result
  }
  return toolResult
}

const evaluateRuntime = async <T>(
  runner: WechatIdeRunner,
  projectPath: string,
  functionSource: string,
): Promise<T> => {
  const result = await runner.call('automation_evaluate', [
    ...projectArgs(projectPath),
    '--fn-source',
    // cmd 批次入口不能攜帶多行命令；固定 evaluate 腳本不含多行字串。
    functionSource.replace(/\r?\n\s*/g, ' '),
  ])
  return unwrapEvaluateResult(result) as T
}

const waitForCurrentPage = async (
  runner: WechatIdeRunner,
  projectPath: string,
  timeoutMs = 30000,
): Promise<string> => {
  const deadline = Date.now() + timeoutMs
  let lastError: unknown
  while (Date.now() < deadline) {
    try {
      return await readCurrentPage(runner, projectPath)
    } catch (error) {
      lastError = error
    }
    await new Promise((resolveDelay) => setTimeout(resolveDelay, 500))
  }
  throw lastError instanceof Error ? lastError : new Error('等待微信开发者工具当前页面超时')
}

const normalizeSelector = (selector: string): string => {
  if (!selector.startsWith('xpath:')) return selector
  const match = selector.match(/^xpath:\/\/[^[]+\[contains\(@class,\s*["']([^"']+)["']\)\]$/)
  if (!match) return selector.slice('xpath:'.length)
  return `.${match[1].trim().split(/\s+/).join('.')}`
}

const isMissingElementError = (error: unknown): boolean =>
  error instanceof Error &&
  /no such element|Element not found:|找不到元素|waitForSelector timeout/i.test(error.message)

const isStalePageError = (error: unknown): boolean =>
  error instanceof Error && /page is not on top of page stack/i.test(error.message)

const elementArgs = (
  projectPath: string,
  selector: string,
  action: string,
  options: Record<string, string | number | undefined> = {},
): string[] => {
  const args = [
    ...projectArgs(projectPath),
    '--selector',
    normalizeSelector(selector),
    '--action',
    action,
  ]
  for (const [name, value] of Object.entries(options)) {
    if (value === undefined) continue
    args.push(`--${name}`, String(value))
  }
  return args
}

const createAdapter = (
  projectPath: string,
  runner: WechatIdeRunner,
  launchRecord?: ReviewLaunchRecord,
): ReviewAdapter => {
  const lifecycle = createFixtureLifecycle((source) => evaluateRuntime(runner, projectPath, source))
  return {
    ...lifecycle,
    getReviewLaunchRecord: () => launchRecord,
    async getReviewRuntimeInfo() {
      const measured = await evaluateRuntime(runner, projectPath, runtimeInfoSource)
      return {
        adapter: 'wechatide',
        endpoint: null,
        devToolsVersion: null,
        ...normalizeRuntimeMeasurement(measured),
        pagePath: await readCurrentPage(runner, projectPath),
      }
    },
    async navigate(path) {
      await runner.call('automation_navigate', [
        ...projectArgs(projectPath),
        '--action',
        'navigateTo',
        '--url',
        path,
      ])
    },
    async reLaunch(path) {
      await runner.call('automation_navigate', [
        ...projectArgs(projectPath),
        '--action',
        'reLaunch',
        '--url',
        path,
      ])
    },
    async switchTab(path) {
      await runner.call('automation_navigate', [
        ...projectArgs(projectPath),
        '--action',
        'switchTab',
        '--url',
        path,
      ])
    },
    async tap(selector) {
      await runner.call('automation_element_action', elementArgs(projectPath, selector, 'tap'))
    },
    async input(selector, value) {
      await runner.call(
        'automation_element_action',
        elementArgs(projectPath, selector, 'input', { value }),
      )
    },
    async clearInput(selector) {
      await runner.call(
        'automation_element_action',
        elementArgs(projectPath, selector, 'input', { value: '' }),
      )
    },
    async scrollPage(distance) {
      await runner.call('automation_viewport_action', [
        ...projectArgs(projectPath),
        '--action',
        'pageScrollTo',
        '--scroll-top',
        String(distance),
      ])
    },
    async scrollElement(selector, distance) {
      await runner.call(
        'automation_element_action',
        elementArgs(projectPath, selector, 'scrollTo', { x: 0, y: distance }),
      )
    },
    async waitFor(selectorOrDuration, timeoutMs = 5000) {
      if (typeof selectorOrDuration === 'number') {
        await new Promise((resolveDelay) => setTimeout(resolveDelay, selectorOrDuration))
        return
      }
      const deadline = Date.now() + timeoutMs
      let lastError: unknown
      while (Date.now() < deadline) {
        let queryTimer: ReturnType<typeof setTimeout> | undefined
        try {
          // 转场期间工具内部的等待可能持有旧页面；每轮独立调用以重新获取当前页。
          const remainingMs = Math.max(1, deadline - Date.now())
          await Promise.race([
            runner.call(
              'automation_element_action',
              elementArgs(projectPath, selectorOrDuration, 'size'),
              { timeoutMs: remainingMs },
            ),
            new Promise<never>((_, reject) => {
              queryTimer = setTimeout(
                () =>
                  reject(
                    new WechatIdeToolError(
                      'wechatide element query timeout',
                      'automation_element_action',
                    ),
                  ),
                remainingMs,
              )
            }),
          ])
          return
        } catch (error) {
          if (!isMissingElementError(error) && !isStalePageError(error)) throw error
          lastError = error
        } finally {
          if (queryTimer) clearTimeout(queryTimer)
        }
        await new Promise((resolveDelay) =>
          setTimeout(resolveDelay, Math.min(250, Math.max(0, deadline - Date.now()))),
        )
      }
      throw errorWithCause(`等待元素超时：${selectorOrDuration}`, lastError)
    },
    async queryElement(selector) {
      try {
        await runner.call('automation_element_action', elementArgs(projectPath, selector, 'size'))
        return true
      } catch (error) {
        if (isMissingElementError(error)) return false
        throw error
      }
    },
    async isVisible(selector) {
      try {
        const result = (await runner.call(
          'automation_element_action',
          elementArgs(projectPath, selector, 'size'),
        )) as { width?: unknown; height?: unknown }
        return Number(result.width) > 0 && Number(result.height) > 0
      } catch (error) {
        if (isMissingElementError(error)) return false
        throw error
      }
    },
    async readText(selector) {
      const result = await runner.call(
        'automation_element_action',
        elementArgs(projectPath, selector, 'text'),
      )
      return typeof result === 'string' ? result : String(result ?? '')
    },
    async screenshot(path) {
      await runner.call('automation_viewport_action', [
        ...projectArgs(projectPath),
        '--action',
        'screenshot',
        '--path',
        path,
      ])
    },
    async currentPagePath() {
      return await readCurrentPage(runner, projectPath)
    },
    async disconnect() {
      await lifecycle.restoreFixture()
      // 新版 skill API 复用已经打开的项目窗口，不在每个场景结束时关闭用户窗口。
    },
  }
}

export const createWechatIdeAdapter = async (
  config: ReviewConfig,
  options: WechatIdeAdapterOptions = {},
): Promise<ReviewAdapter> => {
  const cliPath = resolveWechatIdeCliPath(config.cliPath)
  if (!cliPath && !options.runner) throw new Error('找不到微信开发者工具 wechatide CLI')
  const runner = options.runner ?? createDefaultRunner(cliPath as string)
  if (options.openProject !== false) await callOpenProject(runner, config.projectPath)
  await waitForCurrentPage(runner, config.projectPath)
  return createAdapter(
    config.projectPath,
    runner,
    options.openProject === false
      ? undefined
      : {
          projectRoot: config.projectPath,
          executionRoot: config.projectPath,
          endpoint: null,
        },
  )
}

export const restartWechatIdeSession = async (config: ReviewConfig): Promise<void> => {
  const cliPath = resolveWechatIdeCliPath(config.cliPath)
  if (!cliPath) throw new Error('无法自动重启微信开发者工具：找不到 wechatide CLI')
  const runner = createDefaultRunner(cliPath)
  try {
    await runner.call('close_project_window', projectArgs(config.projectPath))
  } catch {
    // 项目窗口已经关闭时，继续重新打开目标工程。
  }
  await callOpenProject(runner, config.projectPath)
  await waitForCurrentPage(runner, config.projectPath)
}
