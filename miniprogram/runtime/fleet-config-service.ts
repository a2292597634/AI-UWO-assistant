/**
 * Fleet Config Service Adapter
 *
 * The ONLY module in the miniprogram allowed to call wx.cloud.callFunction.
 * Pages receive only this typed service interface — never access CloudBase directly.
 * All ownerUid fields come from the server context; this adapter never sends them.
 */

import { FLEET_CONFIG_FUNCTION_NAME } from './cloudbase-config'
import type {
  FleetConfigRecord,
  FleetConfigSummary,
  FleetConfigErrorCode,
  FleetConfigAction,
} from '../contracts/fleet-config'
import {
  isValidFleetState,
  MAX_CONFIG_NAME_LENGTH,
  SCHEMA_VERSION,
} from '../contracts/fleet-config'
import type { FleetState } from '../contracts/battle-fleet'

// ── Error class ──

export class FleetConfigError extends Error {
  readonly code: FleetConfigErrorCode

  constructor(code: FleetConfigErrorCode, message: string) {
    super(message)
    this.code = code
  }
}

// ── Result types ──

interface FleetConfigFunctionFailure {
  ok: false
  code: FleetConfigErrorCode
  message: string
}

// ── Service interface ──

export interface UpdateConfigInput {
  configId: string
  expectedVersion: number
  fleetState: FleetState
  force: boolean
}

export interface FleetConfigService {
  authenticate(): Promise<void>
  listMyConfigs(): Promise<readonly FleetConfigSummary[]>
  loadConfig(configId: string): Promise<FleetConfigRecord>
  createConfig(name: string, fleetState: FleetState): Promise<FleetConfigRecord>
  updateConfig(input: UpdateConfigInput): Promise<FleetConfigRecord>
  saveAsConfig(name: string, fleetState: FleetState): Promise<FleetConfigRecord>
  renameConfig(configId: string, version: number, name: string): Promise<FleetConfigRecord>
  deleteConfig(configId: string, expectedVersion: number): Promise<void>
  setLastUsedConfig(configId: string): Promise<void>
}

// ── Internal: call the cloud function ──

const SAFE_NETWORK_ERROR_MESSAGE = '伺服器暫時無法處理請求，請稍後再試'
const INVALID_RESPONSE_MESSAGE = '伺服器回應格式無效，請稍後再試'
const ERROR_CODES = new Set<FleetConfigErrorCode>([
  'unauthenticated',
  'not-found',
  'forbidden',
  'name-required',
  'duplicate-name',
  'limit-reached',
  'invalid-state',
  'conflict',
  'network',
  'unknown-action',
])

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

const hasOnlyKeys = (value: Record<string, unknown>, allowed: readonly string[]): boolean =>
  Object.keys(value).every((key) => allowed.includes(key))

const isNonEmptyString = (value: unknown, maxLength = 100): value is string =>
  typeof value === 'string' && value.length > 0 && [...value].length <= maxLength

const isValidTimestamp = (value: unknown): value is string =>
  typeof value === 'string' && value.length > 0 && !Number.isNaN(Date.parse(value))

const isValidVersion = (value: unknown): value is number =>
  typeof value === 'number' && Number.isInteger(value) && value >= 1

const isValidFleetConfigSummary = (value: unknown): value is FleetConfigSummary => {
  if (!isRecord(value)) return false
  if (!hasOnlyKeys(value, ['configId', 'name', 'version', 'updatedAt', 'lastUsedAt'])) return false
  return (
    isNonEmptyString(value.configId) &&
    isNonEmptyString(value.name, MAX_CONFIG_NAME_LENGTH) &&
    isValidVersion(value.version) &&
    isValidTimestamp(value.updatedAt) &&
    isValidTimestamp(value.lastUsedAt)
  )
}

const isValidFleetConfigRecord = (value: unknown): value is FleetConfigRecord => {
  if (!isRecord(value)) return false
  if (
    !hasOnlyKeys(value, [
      'configId',
      'name',
      'fleetState',
      'schemaVersion',
      'version',
      'createdAt',
      'updatedAt',
      'lastUsedAt',
    ])
  ) {
    return false
  }
  return (
    isNonEmptyString(value.configId) &&
    isNonEmptyString(value.name, MAX_CONFIG_NAME_LENGTH) &&
    isValidFleetState(value.fleetState) &&
    value.schemaVersion === SCHEMA_VERSION &&
    isValidVersion(value.version) &&
    isValidTimestamp(value.createdAt) &&
    isValidTimestamp(value.updatedAt) &&
    isValidTimestamp(value.lastUsedAt)
  )
}

const isValidActionData = (action: FleetConfigAction, value: unknown): boolean => {
  switch (action) {
    case 'authenticate':
      return (
        isRecord(value) &&
        hasOnlyKeys(value, ['authenticated']) &&
        typeof value.authenticated === 'boolean'
      )
    case 'listMyConfigs':
      return Array.isArray(value) && value.every(isValidFleetConfigSummary)
    case 'loadConfig':
    case 'createConfig':
    case 'updateConfig':
    case 'saveAsConfig':
    case 'renameConfig':
      return isValidFleetConfigRecord(value)
    case 'deleteConfig':
      return isRecord(value) && hasOnlyKeys(value, ['deleted']) && value.deleted === true
    case 'setLastUsedConfig':
      return isRecord(value) && hasOnlyKeys(value, ['updated']) && value.updated === true
  }
}

const isValidFailureResult = (
  value: Record<string, unknown>,
): value is Record<string, unknown> & FleetConfigFunctionFailure =>
  hasOnlyKeys(value, ['ok', 'code', 'message']) &&
  value.ok === false &&
  typeof value.code === 'string' &&
  ERROR_CODES.has(value.code as FleetConfigErrorCode) &&
  typeof value.message === 'string' &&
  value.message.length > 0 &&
  value.message.length <= 200

const createInvalidResponseError = (): FleetConfigError =>
  new FleetConfigError('network', INVALID_RESPONSE_MESSAGE)

async function callFunction<T>(
  action: FleetConfigAction,
  payload: Record<string, unknown> = {},
): Promise<T> {
  let rawResponse: unknown
  try {
    rawResponse = await wx.cloud.callFunction({
      name: FLEET_CONFIG_FUNCTION_NAME,
      data: { action, ...payload },
    })
  } catch {
    throw new FleetConfigError('network', SAFE_NETWORK_ERROR_MESSAGE)
  }

  if (!isRecord(rawResponse) || !isRecord(rawResponse.result)) {
    throw createInvalidResponseError()
  }

  const result = rawResponse.result
  if (result.ok === false) {
    if (!isValidFailureResult(result)) throw createInvalidResponseError()
    throw new FleetConfigError(
      result.code,
      result.code === 'network' ? SAFE_NETWORK_ERROR_MESSAGE : result.message,
    )
  }

  if (result.ok !== true || !hasOnlyKeys(result, ['ok', 'data'])) {
    throw createInvalidResponseError()
  }
  if (!isValidActionData(action, result.data)) throw createInvalidResponseError()

  return result.data as T
}

// ── Adapter implementation ──

export function createFleetConfigService(): FleetConfigService {
  return {
    async authenticate(): Promise<void> {
      const result = await callFunction<{ authenticated: boolean }>('authenticate')
      if (!result.authenticated) {
        throw new FleetConfigError(
          'unauthenticated',
          'CloudBase 微信認證未啟用，請在雲端控制台開啟',
        )
      }
    },

    async listMyConfigs(): Promise<readonly FleetConfigSummary[]> {
      return callFunction<FleetConfigSummary[]>('listMyConfigs')
    },

    async loadConfig(configId: string): Promise<FleetConfigRecord> {
      return callFunction<FleetConfigRecord>('loadConfig', { configId })
    },

    async createConfig(name: string, fleetState: FleetState): Promise<FleetConfigRecord> {
      return callFunction<FleetConfigRecord>('createConfig', { name, fleetState })
    },

    async updateConfig(input: UpdateConfigInput): Promise<FleetConfigRecord> {
      return callFunction<FleetConfigRecord>('updateConfig', {
        configId: input.configId,
        expectedVersion: input.expectedVersion,
        fleetState: input.fleetState,
        force: input.force,
      })
    },

    async saveAsConfig(name: string, fleetState: FleetState): Promise<FleetConfigRecord> {
      return callFunction<FleetConfigRecord>('saveAsConfig', { name, fleetState })
    },

    async renameConfig(
      configId: string,
      version: number,
      name: string,
    ): Promise<FleetConfigRecord> {
      return callFunction<FleetConfigRecord>('renameConfig', {
        configId,
        expectedVersion: version,
        name,
      })
    },

    async deleteConfig(configId: string, expectedVersion: number): Promise<void> {
      await callFunction<{ deleted: boolean }>('deleteConfig', { configId, expectedVersion })
    },

    async setLastUsedConfig(configId: string): Promise<void> {
      await callFunction<{ updated: boolean }>('setLastUsedConfig', { configId })
    },
  }
}

// Singleton instance
let serviceInstance: FleetConfigService | null = null

export function getFleetConfigService(): FleetConfigService {
  if (!serviceInstance) {
    serviceInstance = createFleetConfigService()
  }
  return serviceInstance
}
