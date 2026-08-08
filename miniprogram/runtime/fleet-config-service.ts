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

interface FleetConfigFunctionResult<T> {
  ok: boolean
  data?: T
  code?: string
  message?: string
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

async function callFunction<T>(action: string, payload: Record<string, unknown> = {}): Promise<T> {
  let result: FleetConfigFunctionResult<T>
  try {
    const response = await wx.cloud.callFunction({
      name: FLEET_CONFIG_FUNCTION_NAME,
      data: { action, ...payload },
    })
    result = response.result as FleetConfigFunctionResult<T>
  } catch {
    throw new FleetConfigError('network', 'Network error — unable to reach the server')
  }

  if (result.ok === false) {
    throw new FleetConfigError(
      (result.code as FleetConfigErrorCode) ?? 'network',
      result.message ?? 'Unknown server error',
    )
  }

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
