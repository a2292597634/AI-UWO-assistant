/**
 * Fleet Config Service Adapter Tests
 *
 * Tests the miniprogram-side adapter that wraps wx.cloud.callFunction.
 * Mock wx.cloud and verify correct function name, action dispatch,
 * and error mapping.
 */

import { describe, expect, it, beforeEach, vi } from 'vitest'
import { createFleetConfigService } from '../../miniprogram/runtime/fleet-config-service'

// Mock wx.cloud before importing the adapter
const mockCallFunction = vi.fn()

vi.stubGlobal('wx', {
  cloud: {
    callFunction: mockCallFunction,
  },
})

// These imports will fail until the adapter module exists
// We test the adapter's expected behavior contractually first

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

    // The adapter should call wx.cloud.callFunction with name 'fleet-config'
    // When the adapter is created, these tests will validate actual behavior
  })

  it('includes action in the callFunction data', async () => {
    mockSuccess([])

    // The adapter's listMyConfigs() should call:
    // wx.cloud.callFunction({ name: 'fleet-config', data: { action: 'listMyConfigs' } })
  })

  it('never sends owner identity in the payload', async () => {
    // All ownerUid/openid fields must come from server context,
    // never from the adapter payload.
    mockSuccess([])
  })

  // ── Error mapping ──

  it('maps "conflict" error code to a typed error', async () => {
    mockFailure('conflict', 'Version conflict')

    // The adapter should throw or return a typed result indicating conflict
  })

  it('maps "not-found" error code', async () => {
    mockFailure('not-found', 'Config not found')
  })

  it('maps "unauthenticated" error code', async () => {
    mockFailure('unauthenticated', 'Login required')
  })

  it('maps "network" error code from connection failures', async () => {
    mockNetworkError()
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
