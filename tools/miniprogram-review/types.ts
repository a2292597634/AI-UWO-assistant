import type { ReviewFixtureName } from './fixtures'
import type { ReviewLaunchRecord } from './evidence'
import type { ReviewWaitCondition } from './wait-condition'
export interface ReviewConfig {
  projectPath: string
  cliPath?: string
  servicePort?: number
  automationPort: number
  wsEndpoint?: string
  /** 場景包含技能元件內部元素時，使用原生 SDK 作用域查詢。 */
  requiresComponentScope?: boolean
  /** 僅本次工具成功啟動後填入；CLI 不接受使用者注入此欄位。 */
  launchRecord?: ReviewLaunchRecord
}

export interface DiagnosticItem {
  code: 'PROJECT_CONFIG_MISSING' | 'CLI_MISSING' | 'READY'
  level: 'error' | 'info'
  message: string
}

export interface ReviewConfigArgs {
  projectPath?: string
  cliPath?: string
  servicePort?: string | number
  automationPort?: string | number
  wsEndpoint?: string
}

export type ReviewState = 'normal' | 'empty' | 'loading' | 'error' | 'long-text'

export const REVIEW_STATES: ReviewState[] = ['normal', 'empty', 'loading', 'error', 'long-text']

export type ReviewDevice = 'iphone-small' | 'iphone-standard' | 'android-large'

export type ReviewStep =
  | { action: 'navigate'; path: string }
  | { action: 'switchTab'; path: string }
  | { action: 'tap'; selector: string }
  | { action: 'input'; selector: string; value: string }
  | { action: 'clearInput'; selector: string }
  | { action: 'scrollPage'; distance: number }
  | { action: 'scrollElement'; selector: string; distance: number }
  | { action: 'waitFor'; selector: string; timeoutMs?: number }
  | { action: 'waitFor'; durationMs: number }
  | { action: 'waitUntil'; condition: ReviewWaitCondition; timeoutMs?: number }
  | { action: 'assertExists'; selector: string; exists?: boolean }
  | { action: 'assertVisible'; selector: string }
  | { action: 'assertText'; selector: string; equals: string }
  | { action: 'assertText'; selector: string; contains: string }
  | { action: 'screenshot'; name: string }

export interface ReviewScenario {
  name: string
  entry: string
  watchPaths?: string[]
  fixture?: ReviewFixtureName
  state: ReviewState
  devices: ReviewDevice[]
  steps: ReviewStep[]
}
