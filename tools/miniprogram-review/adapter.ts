import { spawn } from 'node:child_process'
import { createConnection } from 'node:net'

import automator from 'miniprogram-automator'
import Connection from 'miniprogram-automator/out/Connection'
import MiniProgram from 'miniprogram-automator/out/MiniProgram'

import type { ReviewConfig } from './types'

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

interface AutomatorMiniProgram {
  navigateTo(path: string): Promise<unknown>
  reLaunch(path: string): Promise<unknown>
  switchTab(path: string): Promise<unknown>
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

export const shouldBypassLegacyVersionCheck = (info: {
  version?: unknown
  SDKVersion?: unknown
}): boolean => Boolean(info.version && !info.SDKVersion)

export const buildWindowsBatchLaunch = (
  config: ReviewConfig,
): { executable: string; args: string[] } => {
  const servicePort = config.servicePort ? ` --port ${config.servicePort}` : ''
  return {
    executable: 'C:/Windows/System32/WindowsPowerShell/v1.0/powershell.exe',
    args: [
      '-NoProfile',
      '-NonInteractive',
      '-Command',
      `& ${quotePowerShellLiteral(config.cliPath ?? '')} auto --project ${quotePowerShellLiteral(config.projectPath)} --auto-port ${config.automationPort} --trust-project${servicePort}`,
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
      await withTimeout(
        connection.send('App.getCurrentPage'),
        5000,
        '读取微信开发者工具当前页面超时',
      )
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

const connectFreshWindowsSession = async (wsEndpoint: string): Promise<unknown> => {
  let lastError: unknown
  for (let attempt = 0; attempt < 30; attempt += 1) {
    let connection: Connection | undefined
    try {
      connection = await createConnectionWithTimeout(wsEndpoint, 1000, '连接新启动的自动化会话超时')
      await withTimeout(connection.send('Tool.getInfo'), 5000, '读取开发者工具版本超时')
      await withTimeout(
        connection.send('App.getCurrentPage'),
        5000,
        '读取微信开发者工具当前页面超时',
      )
      return new MiniProgram(connection)
    } catch (error) {
      connection?.dispose()
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

const launchWindowsBatchCli = async (config: ReviewConfig): Promise<unknown> => {
  if (await isTcpPortReachable(config.automationPort)) {
    throw new Error(
      `自动化端口已被占用：${config.automationPort}。请关闭旧会话或设置 WECHAT_AUTOMATION_PORT 后重试`,
    )
  }
  const launch = buildWindowsBatchLaunch(config)
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

export const createAutomatorAdapter = (
  miniProgram: AutomatorMiniProgram,
  options: AutomatorAdapterOptions = {},
): ReviewAdapter => ({
  async navigate(path) {
    await miniProgram.navigateTo(path)
  },
  async reLaunch(path) {
    await miniProgram.reLaunch(path)
  },
  async switchTab(path) {
    await miniProgram.switchTab(path)
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
  const miniProgram = config.wsEndpoint
    ? await connectVersionCompatible(config.wsEndpoint)
    : config.cliPath?.toLowerCase().endsWith('.bat')
      ? await launchWindowsBatchCli(config)
      : await automator.launch({
          cliPath: config.cliPath,
          projectPath: config.projectPath,
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
  await waitForPageReady(adapter)
  return adapter
}
