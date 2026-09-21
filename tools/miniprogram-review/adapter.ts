import { spawn } from 'node:child_process'
import { existsSync, rmSync } from 'node:fs'
import { cp, mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises'
import { createConnection } from 'node:net'
import { tmpdir } from 'node:os'
import { extname, join, relative } from 'node:path'

import automator from 'miniprogram-automator'
import Connection from 'miniprogram-automator/out/Connection'
import MiniProgram from 'miniprogram-automator/out/MiniProgram'
import { ModuleKind, ScriptTarget, transpileModule } from 'typescript'

import type { ReviewConfig } from './types'
import {
  createWechatIdeAdapter,
  resolveWechatIdeCliPath,
  restartWechatIdeSession,
} from './wechatide'

interface DevToolsProjectConfig {
  setting?: {
    useCompilerPlugins?: unknown
  }
}

const reviewProjectMirrors = new Map<string, Promise<string>>()
const reviewProjectMirrorPaths = new Set<string>()

const hasTypeScriptCompilerPlugin = (projectConfig: DevToolsProjectConfig): boolean =>
  Array.isArray(projectConfig.setting?.useCompilerPlugins) &&
  projectConfig.setting.useCompilerPlugins.includes('typescript')

const listFiles = async (directory: string): Promise<string[]> => {
  const entries = await readdir(directory, { withFileTypes: true })
  const files: string[] = []
  for (const entry of entries) {
    const path = join(directory, entry.name)
    if (entry.isDirectory()) files.push(...(await listFiles(path)))
    else files.push(path)
  }
  return files
}

const cleanupReviewProjectMirrors = (): void => {
  for (const path of reviewProjectMirrorPaths) {
    try {
      // 进程退出时同步清理临时镜像，避免每次恢复都在系统临时目录留下项目副本。
      rmSync(path, { recursive: true, force: true })
    } catch {
      // 退出阶段清理失败不应影响验收结果。
    }
  }
}

process.once('exit', cleanupReviewProjectMirrors)

const createTypeScriptProjectMirror = async (projectPath: string): Promise<string> => {
  const configPath = join(projectPath, 'project.config.json')
  if (!existsSync(configPath)) return projectPath
  const projectConfig = JSON.parse(await readFile(configPath, 'utf8')) as DevToolsProjectConfig
  const sourceRoot = join(projectPath, 'miniprogram')
  if (!hasTypeScriptCompilerPlugin(projectConfig) || !existsSync(sourceRoot)) return projectPath

  const sourceFiles = await listFiles(sourceRoot)
  const typeScriptFiles = sourceFiles.filter((path) => extname(path) === '.ts')
  if (typeScriptFiles.length === 0) return projectPath

  const mirrorPath = await mkdtemp(join(tmpdir(), 'uwo-miniprogram-review-'))
  reviewProjectMirrorPaths.add(mirrorPath)
  try {
    await cp(sourceRoot, join(mirrorPath, 'miniprogram'), { recursive: true })
    for (const sourceFile of typeScriptFiles) {
      const source = await readFile(sourceFile, 'utf8')
      const output = transpileModule(source, {
        compilerOptions: {
          target: ScriptTarget.ES2020,
          module: ModuleKind.CommonJS,
          sourceMap: false,
        },
      }).outputText
      const relativePath = relative(sourceRoot, sourceFile)
      const mirrorTypeScriptPath = join(mirrorPath, 'miniprogram', relativePath)
      const mirrorJavaScriptPath = mirrorTypeScriptPath.slice(0, -'.ts'.length) + '.js'
      await writeFile(mirrorJavaScriptPath, output, 'utf8')
      await rm(mirrorTypeScriptPath, { force: true })
    }

    const mirrorProjectConfig = {
      ...projectConfig,
      setting: {
        ...(projectConfig.setting ?? {}),
        useCompilerPlugins: [],
      },
    }
    await writeFile(
      join(mirrorPath, 'project.config.json'),
      `${JSON.stringify(mirrorProjectConfig, null, 2)}\n`,
      'utf8',
    )
    const privateConfigPath = join(projectPath, 'project.private.config.json')
    if (existsSync(privateConfigPath)) {
      await cp(privateConfigPath, join(mirrorPath, 'project.private.config.json'))
    }
    return mirrorPath
  } catch (error) {
    await rm(mirrorPath, { recursive: true, force: true })
    reviewProjectMirrorPaths.delete(mirrorPath)
    throw error
  }
}

export const prepareReviewProject = async (projectPath: string): Promise<string> => {
  const cached = reviewProjectMirrors.get(projectPath)
  if (cached) return cached
  const mirror = createTypeScriptProjectMirror(projectPath)
  reviewProjectMirrors.set(projectPath, mirror)
  try {
    return await mirror
  } catch (error) {
    reviewProjectMirrors.delete(projectPath)
    throw error
  }
}

export interface ReviewAdapter {
  navigate(path: string): Promise<void>
  reLaunch(path: string): Promise<void>
  switchTab(path: string): Promise<void>
  tap(selector: string): Promise<void>
  input(selector: string, value: string): Promise<void>
  clearInput(selector: string): Promise<void>
  scrollPage(distance: number): Promise<void>
  scrollElement(selector: string, distance: number): Promise<void>
  waitFor(selectorOrDuration: string | number, timeoutMs?: number): Promise<void>
  queryElement(selector: string): Promise<boolean>
  isVisible(selector: string): Promise<boolean>
  readText(selector: string): Promise<string>
  screenshot(path: string): Promise<void>
  currentPagePath(): Promise<string>
  disconnect(): Promise<void>
}

interface AutomatorElement {
  tap(): Promise<void>
  input?(value: string): Promise<void>
  scrollTo?(x: number, y: number): Promise<void>
  size(): Promise<{ width: number; height: number }>
  text(): Promise<string>
}

interface AutomatorPage {
  path: string
  $(selector: string): Promise<AutomatorElement | null>
  getElementByXpath?(selector: string): Promise<AutomatorElement | null>
  waitFor(condition: string | number): Promise<void>
}

export interface AutomatorAdapterOptions {
  screenshot?: (path: string) => Promise<void>
}

export interface ReviewConnectionRecoveryRuntime {
  closeSession(endpoint: string): Promise<void>
  launchSession(config: ReviewConfig): Promise<void>
  reconnectSession?(endpoint: string): Promise<void>
}

interface AutomatorMiniProgram {
  navigateTo(path: string): Promise<unknown>
  reLaunch(path: string): Promise<unknown>
  switchTab(path: string): Promise<unknown>
  callWxMethod?(method: string, ...args: unknown[]): Promise<unknown>
  currentPage(): Promise<AutomatorPage | undefined>
  pageScrollTo(scrollTop: number): Promise<void>
  screenshot(options: { path: string }): Promise<unknown>
  disconnect(): void
}

const currentPage = async (miniProgram: AutomatorMiniProgram): Promise<AutomatorPage> => {
  const page = await miniProgram.currentPage()
  if (!page) throw new Error('微信开发者工具没有当前小程序页面')
  return page
}

const route = async (
  miniProgram: AutomatorMiniProgram,
  method: 'navigateTo' | 'reLaunch' | 'switchTab',
  path: string,
): Promise<void> => {
  // 新版开发者工具在 auto 刚启动时还没有当前 webview 元数据；
  // miniprogram-automator 的 changeRoute 会先读取当前页面，导致首个 reLaunch 被提前阻断。
  if (miniProgram.callWxMethod) {
    await miniProgram.callWxMethod(method, { url: path })
    return
  }
  await miniProgram[method](path)
}

const findElement = async (
  page: AutomatorPage,
  selector: string,
): Promise<AutomatorElement | null> => {
  const xpath = selector.startsWith('xpath:')
    ? selector.slice('xpath:'.length)
    : selector.startsWith('//')
      ? selector
      : undefined
  if (xpath) return page.getElementByXpath ? page.getElementByXpath(xpath) : null
  return page.$(selector)
}

const element = async (
  miniProgram: AutomatorMiniProgram,
  selector: string,
): Promise<AutomatorElement> => {
  const target = await findElement(await currentPage(miniProgram), selector)
  if (!target) throw new Error(`找不到元素：${selector}`)
  return target
}

const withTimeout = async <T>(
  promise: Promise<T>,
  timeoutMs: number,
  message: string,
): Promise<T> => {
  let timer: ReturnType<typeof setTimeout> | undefined
  try {
    return await Promise.race([
      promise,
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new Error(message)), timeoutMs)
      }),
    ])
  } finally {
    if (timer) clearTimeout(timer)
  }
}

const createConnectionWithTimeout = async (
  wsEndpoint: string,
  timeoutMs: number,
  message: string,
): Promise<Connection> => {
  let expired = false
  let timer: ReturnType<typeof setTimeout> | undefined
  const pending = Connection.create(wsEndpoint).then((connection) => {
    if (expired) {
      connection.dispose()
      throw new Error(message)
    }
    return connection
  })
  try {
    return await Promise.race([
      pending,
      new Promise<Connection>((_, reject) => {
        timer = setTimeout(() => {
          expired = true
          reject(new Error(message))
        }, timeoutMs)
      }),
    ])
  } finally {
    if (timer) clearTimeout(timer)
    expired = true
    void pending.catch(() => undefined)
  }
}

const quotePowerShellLiteral = (value: string): string => `'${value.split("'").join("''")}'`

const errorText = (error: unknown): string => {
  if (error instanceof Error) return error.message
  if (typeof error === 'string') return error
  try {
    const serialized = JSON.stringify(error)
    return serialized === undefined ? String(error) : serialized
  } catch {
    return String(error)
  }
}

export const isDevToolsConnectionError = (error: unknown): boolean => {
  const message = errorText(error)
  return /Failed connecting|automation enabled|ECONNREFUSED|ECONNRESET|EPIPE|socket hang up|WebSocket(?:\s+(?:connection|transport|session))?\s+(?:closed|disconnected|failed)|Connection (?:is )?closed|automator response|wechatide.*(?:connect|session|closed|timeout)|项目窗口(?:未打开|已关闭)|开发者工具窗口(?:未打开|已关闭)|自动化(?:端口|端点|会话)|开发者工具(?: CLI 启动失败|版本|当前页面|自动化).*(?:超时|连接|关闭)|读取开发者工具版本超时|读取微信开发者工具当前页面超时|微信开发者工具没有当前小程序页面|页面首帧就绪超时/i.test(
    message,
  )
}

export const shouldBypassLegacyVersionCheck = (info: {
  version?: unknown
  SDKVersion?: unknown
}): boolean => Boolean(info.version && !info.SDKVersion)

export const buildWindowsBatchLaunch = (
  config: ReviewConfig,
): { executable: string; args: string[] } => {
  const servicePort = config.servicePort ? ` --port ${config.servicePort}` : ''
  const cliPath = quotePowerShellLiteral(config.cliPath ?? '')
  const projectPath = quotePowerShellLiteral(config.projectPath)
  return {
    executable: 'C:/Windows/System32/WindowsPowerShell/v1.0/powershell.exe',
    args: [
      '-NoProfile',
      '-NonInteractive',
      '-Command',
      // 旧版 Windows CLI 的 auto 会原子地打开项目并启动自动化端点；先 open 再 auto 会互相抢占项目窗口。
      `& ${cliPath} auto --project ${projectPath} --auto-port ${config.automationPort} --trust-project${servicePort}`,
    ],
  }
}

interface AutomationInfo {
  version?: unknown
  SDKVersion?: unknown
}

const connectWithInfo = async (
  wsEndpoint: string,
): Promise<{ connection: Connection; info: AutomationInfo }> => {
  const connection = await createConnectionWithTimeout(
    wsEndpoint,
    5000,
    '连接微信开发者工具自动化端点超时',
  )
  try {
    const info = (await withTimeout(
      connection.send('Tool.getInfo'),
      5000,
      '读取开发者工具版本超时',
    )) as AutomationInfo
    if (!info.version && !info.SDKVersion) throw new Error('开发者工具未返回可识别版本信息')
    return { connection, info }
  } catch (error) {
    connection.dispose()
    throw error
  }
}

export const disposeFailedAutomationConnection = (
  connection: Pick<Connection, 'dispose'>,
): void => {
  // 握手失败可能只是小程序仍在编译；不能发送 Tool.close 关闭正在恢复的项目窗口。
  connection.dispose()
}

const retryAutomationConnection = async <T>(
  connect: () => Promise<T>,
  attempts: number,
): Promise<T> => {
  let lastError: unknown
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    try {
      return await connect()
    } catch (error) {
      lastError = error
      if (attempt + 1 < attempts) await new Promise((resolveDelay) => setTimeout(resolveDelay, 500))
    }
  }
  throw lastError instanceof Error ? lastError : new Error('无法连接微信开发者工具自动化端点')
}

const connectVersionCompatible = async (wsEndpoint: string): Promise<unknown> =>
  retryAutomationConnection(async () => {
    const { connection, info } = await connectWithInfo(wsEndpoint)
    try {
      // 新版开发者工具返回 version 与 SDKVersion；旧版仅返回 version 时直接使用原始连接，
      // 避免 miniprogram-automator 0.12.1 对缺失 SDKVersion 的旧检查误判。
      if (!shouldBypassLegacyVersionCheck(info) && !info.SDKVersion) {
        throw new Error('开发者工具未返回 SDKVersion，无法确认自动化兼容性')
      }
      return new MiniProgram(connection)
    } catch (error) {
      connection.dispose()
      throw error
    }
  }, 5)

export const probeAutomationEndpoint = async (wsEndpoint: string): Promise<AutomationInfo> =>
  retryAutomationConnection(async () => {
    const { connection, info } = await connectWithInfo(wsEndpoint)
    connection.dispose()
    return info
  }, 3)

export const waitForPageReady = async (
  adapter: Pick<ReviewAdapter, 'currentPagePath'>,
  timeoutMs = 30000,
): Promise<string> => {
  const deadline = Date.now() + timeoutMs
  let lastError: unknown
  while (Date.now() < deadline) {
    try {
      const path = await withTimeout(
        adapter.currentPagePath(),
        Math.min(5000, Math.max(1, deadline - Date.now())),
        '读取微信开发者工具当前页面超时',
      )
      if (path) return path
    } catch (error) {
      lastError = error
    }
    await new Promise((resolveDelay) => setTimeout(resolveDelay, 500))
  }
  throw lastError instanceof Error ? lastError : new Error('等待小程序页面首帧就绪超时')
}

export const waitForPageReadyWithCleanup = async (
  adapter: Pick<ReviewAdapter, 'currentPagePath'>,
  cleanup: () => Promise<void>,
  timeoutMs = 30000,
): Promise<string> => {
  try {
    return await waitForPageReady(adapter, timeoutMs)
  } catch (error) {
    try {
      await cleanup()
    } catch {
      // 保留首帧错误作为验收失败原因，避免清理失败覆盖原始诊断。
    }
    throw error
  }
}

const connectFreshWindowsSession = async (wsEndpoint: string): Promise<unknown> => {
  let lastError: unknown
  for (let attempt = 0; attempt < 30; attempt += 1) {
    let connection: Connection | undefined
    try {
      connection = await createConnectionWithTimeout(wsEndpoint, 1000, '连接新启动的自动化会话超时')
      await withTimeout(connection.send('Tool.getInfo'), 5000, '读取开发者工具版本超时')
      return new MiniProgram(connection)
    } catch (error) {
      if (connection) disposeFailedAutomationConnection(connection)
      lastError = error
      await new Promise((resolveDelay) => setTimeout(resolveDelay, 500))
    }
  }
  throw lastError instanceof Error ? lastError : new Error(`无法连接自动化端点：${wsEndpoint}`)
}

const isTcpPortReachable = async (port: number, timeoutMs = 300): Promise<boolean> =>
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

const waitForTcpPortState = async (
  port: number,
  expectedReachable: boolean,
  timeoutMs = 8000,
): Promise<void> => {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    if ((await isTcpPortReachable(port)) === expectedReachable) return
    await new Promise((resolveDelay) => setTimeout(resolveDelay, 250))
  }
}

const launchWindowsBatchCli = async (config: ReviewConfig): Promise<unknown> => {
  if (await isTcpPortReachable(config.automationPort)) {
    throw new Error(
      `自动化端口已被占用：${config.automationPort}。请关闭旧会话或设置 WECHAT_AUTOMATION_PORT 后重试`,
    )
  }
  const projectPath = await prepareReviewProject(config.projectPath)
  const launch = buildWindowsBatchLaunch({ ...config, projectPath })
  const child = spawn(launch.executable, launch.args, {
    stdio: 'inherit',
    windowsHide: true,
  })
  let spawnError: Error | undefined
  let launchExitError: Error | undefined
  let connected = false
  child.once('error', (error) => {
    spawnError = error
  })
  child.once('exit', (code, signal) => {
    if (!connected && code !== null && code !== 0) {
      launchExitError = new Error(
        `微信开发者工具 CLI 启动失败（退出码 ${code}${signal ? `，信号 ${signal}` : ''}）`,
      )
    }
  })
  const wsEndpoint = `ws://127.0.0.1:${config.automationPort}`
  try {
    // 新启动的 CLI 会话必须让首个 WebSocket 直接成为完整 automator 客户端。
    const session = await connectFreshWindowsSession(wsEndpoint)
    connected = true
    if (launchExitError) {
      ;(session as MiniProgram).disconnect()
      throw launchExitError
    }
    return session
  } catch (error) {
    if (spawnError) throw spawnError
    throw error
  }
}

const closeAutomationSession = async (wsEndpoint: string): Promise<void> => {
  let connection: Connection | undefined
  try {
    connection = await createConnectionWithTimeout(
      wsEndpoint,
      1500,
      '连接现有微信开发者工具自动化会话超时',
    )
    try {
      await withTimeout(connection.send('App.exit'), 3000, '结束小程序页面超时')
    } catch {
      // 页面已经关闭或会话不再响应时，继续尝试关闭开发者工具。
    }
    await new Promise((resolveDelay) => setTimeout(resolveDelay, 500))
    try {
      await withTimeout(connection.send('Tool.close'), 3000, '关闭开发者工具自动化会话超时')
    } catch {
      // Tool.close 失败时仍释放本地连接，并让后续启动阶段给出最终错误。
    }
  } catch {
    // 没有旧会话是可恢复流程的正常情况，后续直接启动新会话。
  } finally {
    connection?.dispose()
  }

  const url = new URL(wsEndpoint)
  const port = Number(url.port)
  if (Number.isInteger(port) && port > 0) await waitForTcpPortState(port, false)
}

const launchFreshSession = async (config: ReviewConfig): Promise<void> => {
  if (!config.cliPath) throw new Error('无法自动重启微信开发者工具：找不到 CLI')
  const session = config.cliPath.toLowerCase().endsWith('.bat')
    ? await launchWindowsBatchCli(config)
    : await automator.launch({
        cliPath: config.cliPath,
        projectPath: await prepareReviewProject(config.projectPath),
        port: config.automationPort,
        trustProject: true,
      })
  ;(session as MiniProgram).disconnect()
}

export const restartReviewConnection = async (
  config: ReviewConfig,
  runtime?: ReviewConnectionRecoveryRuntime,
): Promise<void> => {
  const useWechatIde = !config.wsEndpoint && Boolean(resolveWechatIdeCliPath(config.cliPath))
  const recoveryRuntime: ReviewConnectionRecoveryRuntime =
    runtime ??
    (useWechatIde
      ? {
          // wechatide 的重启函数会先关闭目标项目窗口，再重新打开并等待页面就绪。
          closeSession: async () => undefined,
          launchSession: restartWechatIdeSession,
        }
      : {
          closeSession: closeAutomationSession,
          launchSession: launchFreshSession,
          reconnectSession: async (endpoint) => {
            const { connection } = await connectWithInfo(endpoint)
            connection.dispose()
          },
        })
  const wsEndpoint = config.wsEndpoint ?? `ws://127.0.0.1:${config.automationPort}`
  if (!config.cliPath && config.wsEndpoint) {
    if (!recoveryRuntime.reconnectSession) {
      throw new Error('无法自动恢复：只有 WebSocket 端点可用，但未提供重新连接能力')
    }
    await recoveryRuntime.reconnectSession(wsEndpoint)
    return
  }
  await recoveryRuntime.closeSession(wsEndpoint)
  await recoveryRuntime.launchSession(config)
}

export const createAutomatorAdapter = (
  miniProgram: AutomatorMiniProgram,
  options: AutomatorAdapterOptions = {},
): ReviewAdapter => ({
  async navigate(path) {
    await route(miniProgram, 'navigateTo', path)
  },
  async reLaunch(path) {
    await route(miniProgram, 'reLaunch', path)
  },
  async switchTab(path) {
    await route(miniProgram, 'switchTab', path)
  },
  async tap(selector) {
    await (await element(miniProgram, selector)).tap()
  },
  async input(selector, value) {
    const target = await element(miniProgram, selector)
    if (!target.input) throw new Error(`元素不支持输入：${selector}`)
    await target.input(value)
  },
  async clearInput(selector) {
    const target = await element(miniProgram, selector)
    if (!target.input) throw new Error(`元素不支持输入：${selector}`)
    await target.input('')
  },
  async scrollPage(distance) {
    await miniProgram.pageScrollTo(distance)
  },
  async scrollElement(selector, distance) {
    const target = await element(miniProgram, selector)
    if (!target.scrollTo) throw new Error(`元素不支持滚动：${selector}`)
    await target.scrollTo(0, distance)
  },
  async waitFor(selectorOrDuration, timeoutMs = 5000) {
    if (typeof selectorOrDuration === 'number') {
      await withTimeout(
        new Promise((resolveDelay) => setTimeout(resolveDelay, selectorOrDuration)),
        timeoutMs,
        `等待 ${selectorOrDuration} 毫秒超时`,
      )
      return
    }
    const deadline = Date.now() + timeoutMs
    while (Date.now() < deadline) {
      try {
        const page = await currentPage(miniProgram)
        if (await findElement(page, selectorOrDuration)) return
      } catch (error) {
        if (isDevToolsConnectionError(error)) throw error
        // 页面转场期间 currentPage 或元素查询可能暂时失败；下一轮重新获取顶层页面。
        void error
      }
      await new Promise((resolveDelay) =>
        setTimeout(resolveDelay, Math.min(100, Math.max(1, deadline - Date.now()))),
      )
    }
    throw new Error(`等待元素超时：${selectorOrDuration}`)
  },
  async queryElement(selector) {
    return Boolean(await findElement(await currentPage(miniProgram), selector))
  },
  async isVisible(selector) {
    const target = await findElement(await currentPage(miniProgram), selector)
    if (!target) return false
    const size = await target.size()
    return size.width > 0 && size.height > 0
  },
  async readText(selector) {
    return await (await element(miniProgram, selector)).text()
  },
  async screenshot(path) {
    const captureScreenshot =
      options.screenshot ??
      (async (targetPath: string) => miniProgram.screenshot({ path: targetPath }))
    let lastError: unknown
    for (let attempt = 0; attempt < 2; attempt += 1) {
      try {
        await captureScreenshot(path)
        return
      } catch (error) {
        lastError = error
        if (attempt === 0) await new Promise((resolveDelay) => setTimeout(resolveDelay, 3000))
      }
    }
    throw lastError instanceof Error ? lastError : new Error('截图失败')
  },
  async currentPagePath() {
    const path = (await currentPage(miniProgram)).path
    return path.startsWith('/') ? path : `/${path}`
  },
  async disconnect() {
    miniProgram.disconnect()
  },
})

export const connectReviewAdapter = async (config: ReviewConfig): Promise<ReviewAdapter> => {
  if (!config.wsEndpoint && resolveWechatIdeCliPath(config.cliPath)) {
    return await createWechatIdeAdapter(config)
  }
  const miniProgram = config.wsEndpoint
    ? await connectVersionCompatible(config.wsEndpoint)
    : config.cliPath?.toLowerCase().endsWith('.bat')
      ? await launchWindowsBatchCli(config)
      : await automator.launch({
          cliPath: config.cliPath,
          projectPath: await prepareReviewProject(config.projectPath),
          port: config.automationPort,
          trustProject: true,
        })
  const screenshotEndpoint = config.wsEndpoint ?? `ws://127.0.0.1:${config.automationPort}`
  const adapter = createAutomatorAdapter(miniProgram as unknown as AutomatorMiniProgram, {
    screenshot: async (path) => {
      const { connection } = await connectWithInfo(screenshotEndpoint)
      const screenshotMiniProgram = new MiniProgram(connection)
      try {
        await screenshotMiniProgram.screenshot({ path })
      } finally {
        screenshotMiniProgram.disconnect()
      }
    },
  })
  return adapter
}
