import { existsSync } from 'node:fs'
import { join, resolve } from 'node:path'

import type { DiagnosticItem, ReviewConfig, ReviewConfigArgs } from './types'

interface ResolveReviewConfigInput {
  cwd: string
  args: ReviewConfigArgs
  env: Record<string, string | undefined>
  existingPaths?: ReadonlySet<string>
}

const COMMON_WINDOWS_CLI_PATHS = [
  'C:/Program Files (x86)/Tencent/微信web开发者工具/cli.bat',
  'C:/Program Files/Tencent/微信web开发者工具/cli.bat',
]

const parsePort = (value: string | number | undefined, label: string): number | undefined => {
  if (value === undefined || value === '') return undefined
  const parsed = typeof value === 'number' ? value : Number(value)
  if (!Number.isInteger(parsed) || parsed < 1 || parsed > 65535) {
    throw new Error(`${label}必须是 1 至 65535 的整数`)
  }
  return parsed
}

const portFromEndpoint = (endpoint: string): number => {
  let url: URL
  try {
    url = new URL(endpoint)
  } catch {
    throw new Error('自动化 WebSocket 端点格式无效')
  }
  if (url.protocol !== 'ws:' || !['127.0.0.1', 'localhost', '[::1]'].includes(url.hostname)) {
    throw new Error('自动化 WebSocket 端点必须使用本机 ws 地址')
  }
  return parsePort(url.port || '80', '自动化端口') as number
}

export const resolveReviewConfig = (input: ResolveReviewConfigInput): ReviewConfig => {
  const endpoint = input.args.wsEndpoint ?? input.env.WECHAT_AUTOMATION_WS_ENDPOINT
  const configuredAutomationPort = parsePort(
    input.args.automationPort ?? input.env.WECHAT_AUTOMATION_PORT,
    '自动化端口',
  )
  const existingPaths = input.existingPaths
  const detectedCli = COMMON_WINDOWS_CLI_PATHS.find((path) => existingPaths?.has(path))

  return {
    projectPath: resolve(
      input.args.projectPath ?? input.env.WECHAT_MINIPROGRAM_PROJECT ?? input.cwd,
    ),
    cliPath: input.args.cliPath ?? input.env.WECHAT_DEVTOOLS_CLI ?? detectedCli,
    servicePort: parsePort(
      input.args.servicePort ?? input.env.WECHAT_DEVTOOLS_SERVICE_PORT,
      '服务端口',
    ),
    automationPort: endpoint ? portFromEndpoint(endpoint) : (configuredAutomationPort ?? 9420),
    wsEndpoint: endpoint,
  }
}

export const diagnoseReviewConfig = (
  config: ReviewConfig,
  pathExists: (path: string) => boolean = existsSync,
): DiagnosticItem[] => {
  const diagnostics: DiagnosticItem[] = []
  if (!pathExists(join(config.projectPath, 'project.config.json'))) {
    diagnostics.push({
      code: 'PROJECT_CONFIG_MISSING',
      level: 'error',
      message: `项目目录缺少 project.config.json：${config.projectPath}`,
    })
  }
  if (!config.cliPath || !pathExists(config.cliPath)) {
    diagnostics.push({
      code: 'CLI_MISSING',
      level: 'error',
      message: `找不到微信开发者工具 CLI：${config.cliPath ?? '请设置 WECHAT_DEVTOOLS_CLI'}`,
    })
  }
  if (diagnostics.length === 0) {
    diagnostics.push({ code: 'READY', level: 'info', message: '小程序自动化环境配置完整' })
  }
  return diagnostics
}
