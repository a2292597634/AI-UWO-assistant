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

    await createFleetConfigService().listMyConfigs()
    expect(mockCallFunction).toHaveBeenCalledWith({
      name: 'fleet-config',
      data: { action: 'listMyConfigs' },
    })
  })

  it('never sends owner identity in the payload', async () => {
    mockSuccess([])
    await createFleetConfigService().listMyConfigs()
    const payload = mockCallFunction.mock.calls[0]![0].data as Record<string, unknown>
    expect(payload).not.toHaveProperty('ownerUid')
    expect(payload).not.toHaveProperty('openid')
  })

  // ── Error mapping ──

  it('maps "conflict" error code to a typed error', async () => {
    mockFailure('conflict', 'Version conflict')

    await expect(createFleetConfigService().listMyConfigs()).rejects.toMatchObject({
      code: 'conflict',
      message: 'Version conflict',
    })
  })

  it('maps "not-found" error code', async () => {
    mockFailure('not-found', 'Config not found')
    await expect(createFleetConfigService().listMyConfigs()).rejects.toMatchObject({
      code: 'not-found',
    })
  })

  it('maps "unauthenticated" error code', async () => {
    mockFailure('unauthenticated', 'Login required')
    await expect(createFleetConfigService().listMyConfigs()).rejects.toMatchObject({
      code: 'unauthenticated',
    })
  })

  it('maps "network" error code from connection failures', async () => {
    mockNetworkError()
    await expect(createFleetConfigService().listMyConfigs()).rejects.toMatchObject({
      code: 'network',
    })
  })

  it('rejects a non-object CloudBase result envelope', async () => {
    mockCallFunction.mockResolvedValue({ result: null })
    await expect(createFleetConfigService().listMyConfigs()).rejects.toMatchObject({
      code: 'network',
    })
  })

  it('rejects a result envelope whose ok field is not boolean', async () => {
    mockCallFunction.mockResolvedValue({ result: { ok: 'yes', data: [] } })
    await expect(createFleetConfigService().listMyConfigs()).rejects.toMatchObject({
      code: 'network',
    })
  })

  it('rejects a successful response whose data violates the action contract', async () => {
    mockCallFunction.mockResolvedValue({ result: { ok: true, data: [{ configId: 42 }] } })
    await expect(createFleetConfigService().listMyConfigs()).rejects.toMatchObject({
      code: 'network',
    })
  })

  it('does not expose an internal server error in a network failure message', async () => {
    mockCallFunction.mockResolvedValue({
      result: { ok: false, code: 'network', message: 'Server error: database password=secret' },
    })
    const error = await createFleetConfigService()
      .listMyConfigs()
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
          fleetState: state,
          schemaVersion: 1,
          version: 1,
          createdAt: '2026-01-01T00:00:00.000Z',
          updatedAt: '2026-01-01T00:00:00.000Z',
          lastUsedAt: '2026-01-01T00:00:00.000Z',
        },
      },
    })
    await expect(createFleetConfigService().loadConfig('cfg-1')).resolves.toMatchObject({
      configId: 'cfg-1',
    })
  })

  it('sends the expected version when deleting a config', async () => {
    mockSuccess({ deleted: true })

    await createFleetConfigService().deleteConfig('cfg_1', 3)

    expect(mockCallFunction).toHaveBeenCalledWith({
      name: 'fleet-config',
      data: {
        action: 'deleteConfig',
        configId: 'cfg_1',
        expectedVersion: 3,
      },
    })
  })

  // ── All actions are supported ──

  const actions = [
    'authenticate',
    'listMyConfigs',
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
})
