import { existsSync } from 'node:fs'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { dirname, join } from 'node:path'

import type { ReviewAdapter } from './adapter'
import type { ReviewConfig } from './types'

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

const isWechatIdeConnectionError = (error: unknown): boolean =>
  error instanceof WechatIdeToolError &&
  /connect|session|closed|timeout|current page|项目窗口|开发者工具窗口|自动化端点|自动化会话|当前页面/i.test(
    error.message,
  )

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

const readPageData = async (
  runner: WechatIdeRunner,
  projectPath: string,
  dataPath: string,
): Promise<unknown> => {
  const result = (await runner.call('automation_page_action', [
    ...projectArgs(projectPath),
    '--action',
    'getData',
    '--data-path',
    dataPath,
  ])) as { data?: unknown }
  return result.data
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
    functionSource,
  ])
  return unwrapEvaluateResult(result) as T
}

const readSharePreviewTitleFunction = [
  'function () {',
  'var pages = getCurrentPages();',
  'var page = pages[0] ? pages[0] : null;',
  "var component = page ? page.selectComponent('#fleet-share-preview') : null;",
  "if (!component) throw new Error('找不到分享圖預覽元件');",
  'return component.data ? component.data.title : null;',
  '}',
].join(' ')

const scrollSharePreviewFunction = [
  'function () {',
  'var pages = getCurrentPages();',
  'var page = pages[0] ? pages[0] : null;',
  "var component = page ? page.selectComponent('#fleet-share-preview') : null;",
  "if (!component) throw new Error('找不到分享圖預覽元件');",
  'return new Promise(function (resolve, reject) {',
  "component.setData({ automationScrollIntoView: 'fleet-share-preview__bottom-anchor' }, function () {",
  'var query = wx.createSelectorQuery().in(component);',
  "query.select('.fleet-share-preview__content').scrollOffset().exec(function (result) {",
  'var offset;',
  'var firstResult = result ? result[0] : null;',
  'if (firstResult) offset = firstResult.scrollTop;',
  "if (typeof offset !== 'number') { reject(new Error('无法读取分享圖預覽實際滾動位置')); return; }",
  'resolve(offset);',
  '});',
  '});',
  '});',
  '}',
].join(' ')

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

const componentSelectorKind = (
  selector: string,
): 'config-bar' | 'config-bar-share' | 'share-preview' | 'share-preview-content' | undefined => {
  if (/config-bar__share/.test(selector)) return 'config-bar-share'
  if (/fleet-share-preview__content/.test(selector)) return 'share-preview-content'
  if (/fleet-share-preview/.test(selector)) return 'share-preview'
  if (/config-bar/.test(selector)) return 'config-bar'
  return undefined
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

const componentReady = async (
  runner: WechatIdeRunner,
  projectPath: string,
  selector: string,
): Promise<boolean> => {
  const kind = componentSelectorKind(selector)
  if (kind === 'config-bar' || kind === 'config-bar-share') {
    await readPageData(runner, projectPath, 'configName')
    return kind === 'config-bar' || Boolean(await readPageData(runner, projectPath, 'configName'))
  }
  if (kind === 'share-preview-content' || kind === 'share-preview') {
    const status = await readPageData(runner, projectPath, 'shareStatus')
    if (status !== 'ready' && status !== 'error') return false
    if (/image/.test(selector))
      return Boolean(await readPageData(runner, projectPath, 'shareImagePath'))
    return true
  }
  return false
}

const waitForComponent = async (
  runner: WechatIdeRunner,
  projectPath: string,
  selector: string,
  timeoutMs: number,
): Promise<void> => {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    try {
      if (await componentReady(runner, projectPath, selector)) return
    } catch (error) {
      if (isWechatIdeConnectionError(error)) throw error
      // 组件数据可能仍在首帧初始化，下一轮继续读取。
    }
    await new Promise((resolveDelay) => setTimeout(resolveDelay, 250))
  }
  throw new Error(`等待元素超时：${selector}`)
}

const createAdapter = (projectPath: string, runner: WechatIdeRunner): ReviewAdapter => ({
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
    if (componentSelectorKind(selector) === 'config-bar-share') {
      await runner.call('automation_page_action', [
        ...projectArgs(projectPath),
        '--action',
        'callMethod',
        '--method',
        'onShareFleet',
      ])
      return
    }
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
    if (componentSelectorKind(selector) === 'share-preview-content') {
      const scrollTop = await evaluateRuntime<number>(
        runner,
        projectPath,
        scrollSharePreviewFunction,
      )
      if (!Number.isFinite(scrollTop) || scrollTop <= 0) {
        throw new Error(`分享圖預覽內容未發生滾動：期望 ${distance}px，實際 ${String(scrollTop)}`)
      }
      return
    }
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
    if (componentSelectorKind(selectorOrDuration)) {
      await waitForComponent(runner, projectPath, selectorOrDuration, timeoutMs)
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
    if (componentSelectorKind(selector)) return await componentReady(runner, projectPath, selector)
    try {
      await runner.call('automation_element_action', elementArgs(projectPath, selector, 'size'))
      return true
    } catch (error) {
      if (isMissingElementError(error)) return false
      throw error
    }
  },
  async isVisible(selector) {
    if (componentSelectorKind(selector)) return await componentReady(runner, projectPath, selector)
    const result = (await runner.call(
      'automation_element_action',
      elementArgs(projectPath, selector, 'size'),
    )) as { width?: unknown; height?: unknown }
    return Number(result.width) > 0 && Number(result.height) > 0
  },
  async readText(selector) {
    if (/fleet-share-preview__title/.test(selector)) {
      const title = await evaluateRuntime<unknown>(
        runner,
        projectPath,
        readSharePreviewTitleFunction,
      )
      if (typeof title !== 'string') throw new Error('无法读取分享圖預覽標題')
      return title
    }
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
    // 新版 skill API 复用已经打开的项目窗口，不在每个场景结束时关闭用户窗口。
  },
})

export const createWechatIdeAdapter = async (
  config: ReviewConfig,
  options: WechatIdeAdapterOptions = {},
): Promise<ReviewAdapter> => {
  const cliPath = resolveWechatIdeCliPath(config.cliPath)
  if (!cliPath && !options.runner) throw new Error('找不到微信开发者工具 wechatide CLI')
  const runner = options.runner ?? createDefaultRunner(cliPath as string)
  if (options.openProject !== false) await callOpenProject(runner, config.projectPath)
  await waitForCurrentPage(runner, config.projectPath)
  return createAdapter(config.projectPath, runner)
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
