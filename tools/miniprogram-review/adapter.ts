import automator from 'miniprogram-automator'

import type { ReviewConfig } from './types'

export interface ReviewAdapter {
  navigate(path: string): Promise<void>
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
  waitFor(condition: string | number): Promise<void>
}

interface AutomatorMiniProgram {
  navigateTo(path: string): Promise<unknown>
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

const element = async (
  miniProgram: AutomatorMiniProgram,
  selector: string,
): Promise<AutomatorElement> => {
  const target = await (await currentPage(miniProgram)).$(selector)
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

export const createAutomatorAdapter = (miniProgram: AutomatorMiniProgram): ReviewAdapter => ({
  async navigate(path) {
    await miniProgram.navigateTo(path)
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
    const page = await currentPage(miniProgram)
    await withTimeout(
      page.waitFor(selectorOrDuration),
      timeoutMs,
      typeof selectorOrDuration === 'string'
        ? `等待元素超时：${selectorOrDuration}`
        : `等待 ${selectorOrDuration} 毫秒超时`,
    )
  },
  async queryElement(selector) {
    return Boolean(await (await currentPage(miniProgram)).$(selector))
  },
  async isVisible(selector) {
    const target = await (await currentPage(miniProgram)).$(selector)
    if (!target) return false
    const size = await target.size()
    return size.width > 0 && size.height > 0
  },
  async readText(selector) {
    return await (await element(miniProgram, selector)).text()
  },
  async screenshot(path) {
    await miniProgram.screenshot({ path })
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
    ? await automator.connect({ wsEndpoint: config.wsEndpoint })
    : await automator.launch({
        cliPath: config.cliPath,
        projectPath: config.projectPath,
        port: config.automationPort,
        trustProject: true,
      })
  return createAutomatorAdapter(miniProgram as unknown as AutomatorMiniProgram)
}
