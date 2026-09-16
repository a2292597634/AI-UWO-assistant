export interface ReviewConfig {
  projectPath: string
  cliPath?: string
  servicePort?: number
  automationPort: number
  wsEndpoint?: string
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
  | { action: 'assertExists'; selector: string; exists?: boolean }
  | { action: 'assertVisible'; selector: string }
  | { action: 'assertText'; selector: string; equals: string }
  | { action: 'assertText'; selector: string; contains: string }
  | { action: 'screenshot'; name: string }

export interface ReviewScenario {
  name: string
  entry: string
  watchPaths?: string[]
  state: ReviewState
  devices: ReviewDevice[]
  steps: ReviewStep[]
}
