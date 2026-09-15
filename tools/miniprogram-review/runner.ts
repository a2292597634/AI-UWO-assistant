import { join } from 'node:path'

import type { ReviewAdapter } from './adapter'
import type { ReviewScenario, ReviewStep } from './types'

export interface StepRunResult {
  action: ReviewStep['action']
  startedAt: string
  durationMs: number
  status: 'passed' | 'failed'
  error?: string
}

export interface ScenarioRunResult {
  scenario: string
  pagePath: string
  state: ReviewScenario['state']
  status: 'passed' | 'failed'
  steps: StepRunResult[]
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

const executeStep = async (
  adapter: ReviewAdapter,
  step: ReviewStep,
  outputDir: string,
): Promise<void> => {
  switch (step.action) {
    case 'navigate':
      await adapter.navigate(step.path)
      return
    case 'switchTab':
      await adapter.switchTab(step.path)
      return
    case 'tap':
      await requireElement(adapter, step.selector)
      await adapter.tap(step.selector)
      return
    case 'input':
      await requireElement(adapter, step.selector)
      await adapter.input(step.selector, step.value)
      return
    case 'clearInput':
      await requireElement(adapter, step.selector)
      await adapter.clearInput(step.selector)
      return
    case 'scrollPage':
      await adapter.scrollPage(step.distance)
      return
    case 'scrollElement':
      await requireElement(adapter, step.selector)
      await adapter.scrollElement(step.selector, step.distance)
      return
    case 'waitFor':
      if ('selector' in step) await adapter.waitFor(step.selector, step.timeoutMs)
      else await adapter.waitFor(step.durationMs, step.durationMs + 1000)
      return
    case 'assertExists': {
      const actual = await adapter.queryElement(step.selector)
      const expected = step.exists ?? true
      if (actual !== expected) {
        throw new Error(
          expected ? `找不到元素：${step.selector}` : `元素不应存在：${step.selector}`,
        )
      }
      return
    }
    case 'assertVisible':
      if (!(await adapter.isVisible(step.selector))) throw new Error(`元素不可见：${step.selector}`)
      return
    case 'assertText': {
      await requireElement(adapter, step.selector)
      const actual = await adapter.readText(step.selector)
      if ('equals' in step && actual !== step.equals) {
        throw new Error(`元素文字不相等：${step.selector}`)
      }
      if ('contains' in step && !actual.includes(step.contains)) {
        throw new Error(`元素文字未包含预期内容：${step.selector}`)
      }
      return
    }
    case 'screenshot':
      await adapter.screenshot(join(outputDir, `${step.name}.png`))
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
  }

  try {
    await adapter.navigate(scenario.entry)
    for (const [index, step] of scenario.steps.entries()) {
      const started = now()
      try {
        await executeStep(adapter, step, context.outputDir)
        result.steps.push({
          action: step.action,
          startedAt: started.toISOString(),
          durationMs: Math.max(0, now().getTime() - started.getTime()),
          status: 'passed',
        })
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error)
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
    result.error = error instanceof Error ? error.message : String(error)
  } finally {
    await adapter.disconnect()
  }

  return result
}
