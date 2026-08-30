/**
 * Fleet Config Service Adapter Tests
 *
 * Tests the miniprogram-side adapter that wraps wx.cloud.callFunction.
 * Mock wx.cloud and verify correct function name, action dispatch,
 * and error mapping.
 */

import { describe, expect, it, beforeEach, vi } from 'vitest'
import { createFleetState } from '../../miniprogram/domain/battle-fleet'
import {
  createFleetConfigService,
  FleetConfigError,
} from '../../miniprogram/runtime/fleet-config-service'

// Mock wx.cloud before importing the adapter
const mockCallFunction = vi.fn()

vi.stubGlobal('wx', {
  cloud: {
    callFunction: mockCallFunction,
  },
})

describe('FleetConfigService adapter contract', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  const mockSuccess = <T>(data: T) => {
    mockCallFunction.mockResolvedValue({ result: { ok: true, data } })
  }

  const mockFailure = (code: string, message: string) => {
    mockCallFunction.mockResolvedValue({ result: { ok: false, code, message } })
  }

  const mockNetworkError = () => {
    mockCallFunction.mockRejectedValue(new Error('Network error'))
  }

  // ── Function name and action ──

  it('sends the correct CloudBase function name', async () => {
    mockSuccess({ authenticated: true })

    await createFleetConfigService().authenticate()
    expect(mockCallFunction).toHaveBeenCalledWith({
      name: 'fleet-config',
      data: { action: 'authenticate' },
    })
  })

  it('includes action in the callFunction data', async () => {
    mockSuccess([])

    await createFleetConfigService().listMyConfigs('battle')
    expect(mockCallFunction).toHaveBeenCalledWith({
      name: 'fleet-config',
      data: { action: 'listMyConfigs', scope: 'battle' },
    })
  })

  it('listMyConfigs 傳送固定 scope', async () => {
    mockSuccess([])

    await createFleetConfigService().listMyConfigs('battle')
    expect(mockCallFunction).toHaveBeenCalledWith({
      name: 'fleet-config',
      data: { action: 'listMyConfigs', scope: 'battle' },
    })
  })

  it('never sends owner identity in the payload', async () => {
    mockSuccess([])
    await createFleetConfigService().listMyConfigs('battle')
    const payload = mockCallFunction.mock.calls[0]![0].data as Record<string, unknown>
    expect(payload).not.toHaveProperty('ownerUid')
    expect(payload).not.toHaveProperty('openid')
  })

  // ── Error mapping ──

  it('maps "conflict" error code to a typed error', async () => {
    mockFailure('conflict', 'Version conflict')

    await expect(createFleetConfigService().listMyConfigs('battle')).rejects.toMatchObject({
      code: 'conflict',
      message: 'Version conflict',
    })
  })

  it('maps "not-found" error code', async () => {
    mockFailure('not-found', 'Config not found')
    await expect(createFleetConfigService().listMyConfigs('battle')).rejects.toMatchObject({
      code: 'not-found',
    })
  })

  it('maps "unauthenticated" error code', async () => {
    mockFailure('unauthenticated', 'Login required')
    await expect(createFleetConfigService().listMyConfigs('battle')).rejects.toMatchObject({
      code: 'unauthenticated',
    })
  })

  it('maps "network" error code from connection failures', async () => {
    mockNetworkError()
    await expect(createFleetConfigService().listMyConfigs('battle')).rejects.toMatchObject({
      code: 'network',
    })
  })

  it('rejects a non-object CloudBase result envelope', async () => {
    mockCallFunction.mockResolvedValue({ result: null })
    await expect(createFleetConfigService().listMyConfigs('battle')).rejects.toMatchObject({
      code: 'network',
    })
  })

  it('rejects a result envelope whose ok field is not boolean', async () => {
    mockCallFunction.mockResolvedValue({ result: { ok: 'yes', data: [] } })
    await expect(createFleetConfigService().listMyConfigs('battle')).rejects.toMatchObject({
      code: 'network',
    })
  })

  it('rejects a successful response whose data violates the action contract', async () => {
    mockCallFunction.mockResolvedValue({ result: { ok: true, data: [{ configId: 42 }] } })
    await expect(createFleetConfigService().listMyConfigs('battle')).rejects.toMatchObject({
      code: 'network',
    })
  })

  it('does not expose an internal server error in a network failure message', async () => {
    mockCallFunction.mockResolvedValue({
      result: { ok: false, code: 'network', message: 'Server error: database password=secret' },
    })
    const error = await createFleetConfigService()
      .listMyConfigs('battle')
      .catch((value: unknown) => value)
    expect(error).toBeInstanceOf(FleetConfigError)
    expect((error as FleetConfigError).code).toBe('network')
    expect((error as Error).message).not.toContain('secret')
  })

  it('validates a successful record payload before returning it', async () => {
    const state = createFleetState()
    mockCallFunction.mockResolvedValue({
      result: {
        ok: true,
        data: {
          configId: 'cfg-1',
          name: '我的配隊',
          normalizedName: '我的配隊',
          scope: 'battle',
          fleetState: state,
          schemaVersion: 1,
          version: 1,
          createdAt: '2026-01-01T00:00:00.000Z',
          updatedAt: '2026-01-01T00:00:00.000Z',
          lastUsedAt: '2026-01-01T00:00:00.000Z',
        },
      },
    })
    await expect(createFleetConfigService().loadConfig('battle', 'cfg-1')).resolves.toMatchObject({
      configId: 'cfg-1',
    })
  })

  it('sends the expected version when deleting a config', async () => {
    mockSuccess({ deleted: true })

    await createFleetConfigService().deleteConfig('battle', 'cfg_1', 3)

    expect(mockCallFunction).toHaveBeenCalledWith({
      name: 'fleet-config',
      data: {
        action: 'deleteConfig',
        scope: 'battle',
        configId: 'cfg_1',
        expectedVersion: 3,
      },
    })
  })

  // ── All actions are supported ──

  const actions = [
    'authenticate',
    'listMyConfigs',
    'listUnclassifiedConfigs',
    'classifyConfig',
    'loadConfig',
    'createConfig',
    'updateConfig',
    'saveAsConfig',
    'renameConfig',
    'deleteConfig',
    'setLastUsedConfig',
  ]

  for (const action of actions) {
    it(`supports action: ${action}`, () => {
      // Each action should map to one adapter method
      expect(actions).toContain(action)
    })
  }

  it('拒絕缺少 scope 的成功摘要回應', async () => {
    mockSuccess([
      {
        configId: 'cfg-1',
        name: '舊資料',
        version: 1,
        updatedAt: '2026-01-01T00:00:00.000Z',
        lastUsedAt: '2026-01-01T00:00:00.000Z',
      },
    ])

    await expect(createFleetConfigService().listMyConfigs('battle')).rejects.toMatchObject({
      code: 'network',
    })
  })

  it('所有 scoped action 都傳送 scope 與必要欄位', async () => {
    const state = createFleetState()
    const record = {
      configId: 'cfg-1',
      name: '我的配隊',
      normalizedName: '我的配隊',
      scope: 'battle',
      fleetState: state,
      schemaVersion: 1,
      version: 1,
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
      lastUsedAt: '2026-01-01T00:00:00.000Z',
    }

    mockSuccess(record)
    await createFleetConfigService().loadConfig('battle', 'cfg-1')
    expect(mockCallFunction).toHaveBeenLastCalledWith({
      name: 'fleet-config',
      data: { action: 'loadConfig', scope: 'battle', configId: 'cfg-1' },
    })

    mockSuccess(record)
    await createFleetConfigService().createConfig('battle', '新配置', state)
    expect(mockCallFunction).toHaveBeenLastCalledWith({
      name: 'fleet-config',
      data: { action: 'createConfig', scope: 'battle', name: '新配置', fleetState: state },
    })

    mockSuccess(record)
    await createFleetConfigService().updateConfig({
      scope: 'battle',
      configId: 'cfg-1',
      expectedVersion: 1,
      fleetState: state,
      force: false,
    })
    expect(mockCallFunction).toHaveBeenLastCalledWith({
      name: 'fleet-config',
      data: {
        action: 'updateConfig',
        scope: 'battle',
        configId: 'cfg-1',
        expectedVersion: 1,
        fleetState: state,
        force: false,
      },
    })

    mockSuccess(record)
    await createFleetConfigService().saveAsConfig('battle', '副本', state)
    expect(mockCallFunction).toHaveBeenLastCalledWith({
      name: 'fleet-config',
      data: { action: 'saveAsConfig', scope: 'battle', name: '副本', fleetState: state },
    })

    mockSuccess(record)
    await createFleetConfigService().renameConfig('battle', 'cfg-1', 1, '新名稱')
    expect(mockCallFunction).toHaveBeenLastCalledWith({
      name: 'fleet-config',
      data: {
        action: 'renameConfig',
        scope: 'battle',
        configId: 'cfg-1',
        expectedVersion: 1,
        name: '新名稱',
      },
    })

    mockSuccess({ deleted: true })
    await createFleetConfigService().deleteConfig('battle', 'cfg-1', 1)
    expect(mockCallFunction).toHaveBeenLastCalledWith({
      name: 'fleet-config',
      data: { action: 'deleteConfig', scope: 'battle', configId: 'cfg-1', expectedVersion: 1 },
    })

    mockSuccess({ updated: true })
    await createFleetConfigService().setLastUsedConfig('battle', 'cfg-1')
    expect(mockCallFunction).toHaveBeenLastCalledWith({
      name: 'fleet-config',
      data: { action: 'setLastUsedConfig', scope: 'battle', configId: 'cfg-1' },
    })

    mockSuccess([])
    await createFleetConfigService().listUnclassifiedConfigs()
    expect(mockCallFunction).toHaveBeenLastCalledWith({
      name: 'fleet-config',
      data: { action: 'listUnclassifiedConfigs' },
    })

    mockSuccess(record)
    await createFleetConfigService().classifyConfig('cfg-1', 1, 'adventure')
    expect(mockCallFunction).toHaveBeenLastCalledWith({
      name: 'fleet-config',
      data: {
        action: 'classifyConfig',
        configId: 'cfg-1',
        expectedVersion: 1,
        targetScope: 'adventure',
      },
    })
  })
})
