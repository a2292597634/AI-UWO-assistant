import { join } from 'node:path'

import type { ReviewAdapter } from './adapter'
import type { ReviewResultStatus } from './report'
import type { ReviewScenario, ReviewStep } from './types'

export interface StepRunResult {
  action: ReviewStep['action']
  startedAt: string
  durationMs: number
  status: 'passed' | 'failed'
  error?: string
  screenshotPath?: string
}

export interface ScenarioRunResult {
  scenario: string
  pagePath: string
  state: ReviewScenario['state']
  status: ReviewResultStatus
  steps: StepRunResult[]
  screenshots: string[]
  failedStep?: number
  failureScreenshot?: string
  error?: string
}

export interface RunScenarioContext {
  outputDir: string
  now?: () => Date
}

const requireElement = async (adapter: ReviewAdapter, selector: string): Promise<void> => {
  if (!(await adapter.queryElement(selector))) throw new Error(`找不到元素：${selector}`)
}

const formatError = (error: unknown): string => {
  if (error instanceof Error) return error.message
  if (typeof error === 'string') return error
  try {
    const serialized = JSON.stringify(error)
    return serialized === undefined ? String(error) : serialized
  } catch {
    return String(error)
  }
}

const executeStep = async (
  adapter: ReviewAdapter,
  step: ReviewStep,
  outputDir: string,
): Promise<string | undefined> => {
  switch (step.action) {
    case 'navigate':
      await adapter.navigate(step.path)
      return undefined
    case 'switchTab':
      await adapter.switchTab(step.path)
      return undefined
    case 'tap':
      await requireElement(adapter, step.selector)
      await adapter.tap(step.selector)
      return undefined
    case 'input':
      await requireElement(adapter, step.selector)
      await adapter.input(step.selector, step.value)
      return undefined
    case 'clearInput':
      await requireElement(adapter, step.selector)
      await adapter.clearInput(step.selector)
      return undefined
    case 'scrollPage':
      await adapter.scrollPage(step.distance)
      return undefined
    case 'scrollElement':
      await requireElement(adapter, step.selector)
      await adapter.scrollElement(step.selector, step.distance)
      return undefined
    case 'waitFor':
      if ('selector' in step) await adapter.waitFor(step.selector, step.timeoutMs)
      else await adapter.waitFor(step.durationMs, step.durationMs + 1000)
      return undefined
    case 'assertExists': {
      const actual = await adapter.queryElement(step.selector)
      const expected = step.exists ?? true
      if (actual !== expected) {
        throw new Error(
          expected ? `找不到元素：${step.selector}` : `元素不应存在：${step.selector}`,
        )
      }
      return undefined
    }
    case 'assertVisible':
      if (!(await adapter.isVisible(step.selector))) throw new Error(`元素不可见：${step.selector}`)
      return undefined
    case 'assertText': {
      await requireElement(adapter, step.selector)
      const actual = await adapter.readText(step.selector)
      if ('equals' in step && actual !== step.equals) {
        throw new Error(`元素文字不相等：${step.selector}`)
      }
      if ('contains' in step && !actual.includes(step.contains)) {
        throw new Error(`元素文字未包含预期内容：${step.selector}`)
      }
      return undefined
    }
    case 'screenshot': {
      const screenshotPath = join(outputDir, `${step.name}.png`)
      await adapter.screenshot(screenshotPath)
      return screenshotPath
    }
  }
}

export const runScenario = async (
  adapter: ReviewAdapter,
  scenario: ReviewScenario,
  context: RunScenarioContext,
): Promise<ScenarioRunResult> => {
  const now = context.now ?? (() => new Date())
  const result: ScenarioRunResult = {
    scenario: scenario.name,
    pagePath: scenario.entry,
    state: scenario.state,
    status: 'passed',
    steps: [],
    screenshots: [],
  }

  try {
    await adapter.navigate(scenario.entry)
    for (const [index, step] of scenario.steps.entries()) {
      const started = now()
      try {
        const screenshotPath = await executeStep(adapter, step, context.outputDir)
        result.steps.push({
          action: step.action,
          startedAt: started.toISOString(),
          durationMs: Math.max(0, now().getTime() - started.getTime()),
          status: 'passed',
          ...(screenshotPath ? { screenshotPath } : {}),
        })
        if (screenshotPath) result.screenshots.push(screenshotPath)
      } catch (error) {
        const message = formatError(error)
        result.status = 'failed'
        result.failedStep = index
        result.error = message
        result.steps.push({
          action: step.action,
          startedAt: started.toISOString(),
          durationMs: Math.max(0, now().getTime() - started.getTime()),
          status: 'failed',
          error: message,
        })
        result.failureScreenshot = join(
          context.outputDir,
          `failure-step-${String(index + 1).padStart(3, '0')}.png`,
        )
        try {
          await adapter.screenshot(result.failureScreenshot)
        } catch {
          result.failureScreenshot = undefined
        }
        break
      }
    }
    result.pagePath = await adapter.currentPagePath()
  } catch (error) {
    result.status = 'failed'
    result.error = formatError(error)
  } finally {
    await adapter.disconnect()
  }

  return result
}
