import { readFileSync } from 'node:fs'

import type { ReviewDevice, ReviewScenario, ReviewState, ReviewStep } from './types'

type JsonRecord = Record<string, unknown>

const STATES = new Set<ReviewState>(['normal', 'empty', 'loading', 'error', 'long-text'])
const DEVICES = new Set<ReviewDevice>(['iphone-small', 'iphone-standard', 'android-large'])
const ACTIONS = new Set<ReviewStep['action']>([
  'navigate',
  'switchTab',
  'tap',
  'input',
  'clearInput',
  'scrollPage',
  'scrollElement',
  'waitFor',
  'assertExists',
  'assertVisible',
  'assertText',
  'screenshot',
])

const expectRecord = (value: unknown, label: string): JsonRecord => {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new Error(`${label}必须是对象`)
  }
  return value as JsonRecord
}

const expectString = (value: unknown, label: string): string => {
  if (typeof value !== 'string' || value.trim() === '') throw new Error(`${label}必须是非空字符串`)
  return value
}

const expectText = (value: unknown): string => {
  if (typeof value !== 'string') throw new Error('文字断言值必须是字符串')
  return value
}

const expectNumber = (value: unknown, label: string): number => {
  if (typeof value !== 'number' || !Number.isFinite(value)) throw new Error(`${label}必须是数字`)
  return value
}

const rejectUnknownKeys = (record: JsonRecord, allowed: string[], label: string): void => {
  const unknown = Object.keys(record).find((key) => !allowed.includes(key))
  if (unknown) throw new Error(`${label}包含未知字段：${unknown}`)
}

const expectPagePath = (value: unknown, label: string): string => {
  const path = expectString(value, label)
  if (!path.startsWith('/') || path.includes('..') || path.includes('\\')) {
    throw new Error(`${label}必须是安全的小程序绝对页面路径`)
  }
  return path
}

const expectSelector = (value: unknown): string => expectString(value, '选择器')

const expectWatchPath = (value: unknown): string => {
  const path = expectString(value, 'watchPaths 路径').replace(/\\/g, '/')
  const segments = path.split('/')
  const pathSegments = path.endsWith('/') ? segments.slice(0, -1) : segments
  if (
    path.startsWith('/') ||
    path.includes('\0') ||
    pathSegments.some((segment) => segment === '.' || segment === '..' || segment === '')
  ) {
    throw new Error('watchPaths 路径必须是安全的仓库相对路径')
  }
  return path
}

const expectWatchPaths = (value: unknown): string[] | undefined => {
  if (value === undefined) return undefined
  if (!Array.isArray(value) || value.length === 0) {
    throw new Error('watchPaths 必须是非空数组')
  }
  const paths = value.map(expectWatchPath)
  if (new Set(paths).size !== paths.length) throw new Error('watchPaths 不能包含重复路径')
  return paths
}

const expectDistance = (value: unknown): number => {
  const distance = expectNumber(value, '滚动距离')
  if (!Number.isInteger(distance) || distance === 0 || Math.abs(distance) > 100_000) {
    throw new Error('滚动距离必须是绝对值不超过 100000 的非零整数')
  }
  return distance
}

const expectDuration = (value: unknown, label: string): number => {
  const duration = expectNumber(value, label)
  if (!Number.isInteger(duration) || duration < 1 || duration > 30_000) {
    throw new Error(`${label}必须是 1 至 30000 的整数`)
  }
  return duration
}

const parseStep = (value: unknown, index: number): ReviewStep => {
  const record = expectRecord(value, `步骤 ${index + 1}`)
  const action = expectString(record.action, '动作')
  if (!ACTIONS.has(action as ReviewStep['action'])) throw new Error(`不支持的场景动作：${action}`)

  switch (action) {
    case 'navigate':
    case 'switchTab':
      rejectUnknownKeys(record, ['action', 'path'], `步骤 ${index + 1}`)
      return { action, path: expectPagePath(record.path, '页面路径') }
    case 'tap':
    case 'clearInput':
    case 'assertVisible':
      rejectUnknownKeys(record, ['action', 'selector'], `步骤 ${index + 1}`)
      return { action, selector: expectSelector(record.selector) }
    case 'input':
      rejectUnknownKeys(record, ['action', 'selector', 'value'], `步骤 ${index + 1}`)
      return {
        action,
        selector: expectSelector(record.selector),
        value: expectString(record.value, '输入文字'),
      }
    case 'scrollPage':
      rejectUnknownKeys(record, ['action', 'distance'], `步骤 ${index + 1}`)
      return { action, distance: expectDistance(record.distance) }
    case 'scrollElement':
      rejectUnknownKeys(record, ['action', 'selector', 'distance'], `步骤 ${index + 1}`)
      return {
        action,
        selector: expectSelector(record.selector),
        distance: expectDistance(record.distance),
      }
    case 'waitFor': {
      const hasSelector = record.selector !== undefined
      const hasDuration = record.durationMs !== undefined
      if (hasSelector === hasDuration)
        throw new Error('waitFor 必须且只能设置 selector 或 durationMs')
      if (hasSelector) {
        rejectUnknownKeys(record, ['action', 'selector', 'timeoutMs'], `步骤 ${index + 1}`)
        return {
          action,
          selector: expectSelector(record.selector),
          timeoutMs:
            record.timeoutMs === undefined
              ? undefined
              : expectDuration(record.timeoutMs, '等待超时'),
        }
      }
      rejectUnknownKeys(record, ['action', 'durationMs'], `步骤 ${index + 1}`)
      return { action, durationMs: expectDuration(record.durationMs, '等待时长') }
    }
    case 'assertExists':
      rejectUnknownKeys(record, ['action', 'selector', 'exists'], `步骤 ${index + 1}`)
      if (record.exists !== undefined && typeof record.exists !== 'boolean') {
        throw new Error('exists 必须是布尔值')
      }
      return {
        action,
        selector: expectSelector(record.selector),
        exists: record.exists as boolean | undefined,
      }
    case 'assertText': {
      rejectUnknownKeys(record, ['action', 'selector', 'equals', 'contains'], `步骤 ${index + 1}`)
      const hasEquals = record.equals !== undefined
      const hasContains = record.contains !== undefined
      if (hasEquals === hasContains) throw new Error('assertText 必须且只能设置 equals 或 contains')
      return hasEquals
        ? { action, selector: expectSelector(record.selector), equals: expectText(record.equals) }
        : {
            action,
            selector: expectSelector(record.selector),
            contains: expectText(record.contains),
          }
    }
    case 'screenshot': {
      rejectUnknownKeys(record, ['action', 'name'], `步骤 ${index + 1}`)
      const name = expectString(record.name, '截图名称')
      if (!/^[A-Za-z0-9_-]+$/.test(name)) {
        throw new Error('截图名称只能包含英文字母、数字、连字号和下划线')
      }
      return { action, name }
    }
    default:
      throw new Error(`不支持的场景动作：${action}`)
  }
}

export const parseScenario = (value: unknown): ReviewScenario => {
  const record = expectRecord(value, '场景')
  rejectUnknownKeys(record, ['name', 'entry', 'watchPaths', 'state', 'devices', 'steps'], '场景')
  const state = expectString(record.state, '数据状态')
  if (!STATES.has(state as ReviewState)) throw new Error(`不支持的数据状态：${state}`)
  if (!Array.isArray(record.devices) || record.devices.length === 0) {
    throw new Error('设备列表必须是非空数组')
  }
  const devices = record.devices.map((value) => {
    const device = expectString(value, '设备')
    if (!DEVICES.has(device as ReviewDevice)) throw new Error(`不支持的设备：${device}`)
    return device as ReviewDevice
  })
  if (!Array.isArray(record.steps) || record.steps.length === 0) {
    throw new Error('场景步骤必须是非空数组')
  }

  return {
    name: expectString(record.name, '场景名称'),
    entry: expectPagePath(record.entry, '入口页面'),
    ...(record.watchPaths === undefined ? {} : { watchPaths: expectWatchPaths(record.watchPaths) }),
    state: state as ReviewState,
    devices,
    steps: record.steps.map(parseStep),
  }
}

export const loadScenario = (path: string): ReviewScenario =>
  parseScenario(JSON.parse(readFileSync(path, 'utf8')) as unknown)
