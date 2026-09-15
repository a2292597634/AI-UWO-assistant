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
