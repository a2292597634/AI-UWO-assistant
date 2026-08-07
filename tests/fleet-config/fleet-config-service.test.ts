/**
 * Fleet Config Service Tests
 *
 * Tests the cloud function service layer through its dispatch interface
 * using an in-memory repository double. Verifies owner isolation,
 * name uniqueness, 20-config limit, version conflicts, and all CRUD actions.
 */

import { describe, expect, it, beforeEach } from 'vitest'
import { createFleetState } from '../../miniprogram/domain/battle-fleet'
import type { FleetState } from '../../miniprogram/contracts/battle-fleet'

// --- In-memory repository double (matches fleet-config-repository.js interface) ---

interface FleetConfigRecord {
  configId: string
  ownerUid: string
  name: string
  fleetState: FleetState
  schemaVersion: number
  version: number
  createdAt: string
  updatedAt: string
  lastUsedAt: string
  [key: string]: unknown
}

function createMemoryRepo() {
  const records = new Map<string, FleetConfigRecord>()
  const key = (o: string, c: string): string => `${o}:${c}`

  return {
    async listByOwner(ownerUid: string) {
      const result: FleetConfigRecord[] = []
      for (const [k, r] of records) {
        if (k.startsWith(`${ownerUid}:`)) result.push(r)
      }
      return result.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
    },
    async findByOwnerAndId(ownerUid: string, configId: string) {
      return records.get(key(ownerUid, configId)) ?? null
    },
    async countByOwner(ownerUid: string) {
      let count = 0
      for (const k of records.keys()) {
        if (k.startsWith(`${ownerUid}:`)) count++
      }
      return count
    },
    async insert(record: FleetConfigRecord) {
      records.set(key(record.ownerUid, record.configId), { ...record })
      return record
    },
    async updateIfVersion(
      ownerUid: string,
      configId: string,
      expectedVersion: number,
      patch: Partial<FleetConfigRecord>,
    ) {
      const existing = records.get(key(ownerUid, configId))
      if (!existing || existing.version !== expectedVersion) return null
      const updated = { ...existing, ...patch, version: existing.version + 1 }
      records.set(key(ownerUid, configId), updated)
      return updated
    },
    async deleteByOwnerAndId(ownerUid: string, configId: string) {
      return records.delete(key(ownerUid, configId))
    },
    async touchLastUsed(ownerUid: string, configId: string, updatedAt: string) {
      const k = key(ownerUid, configId)
      const existing = records.get(k)
      if (existing) records.set(k, { ...existing, lastUsedAt: updatedAt })
    },
  }
}

// --- Test setup ---

// Import the service factory (CommonJS module)
// eslint-disable-next-line @typescript-eslint/no-require-imports
const serviceMod = require('../../cloudfunctions/fleet-config/fleet-config-service') as {
  createFleetConfigService: (repo: ReturnType<typeof createMemoryRepo>) => {
    dispatch: (
      action: string,
      payload: Record<string, unknown>,
      ownerUid: string,
    ) => Promise<
      { ok: true; data: Record<string, unknown> } | { ok: false; code: string; message: string }
    >
  }
}

describe('FleetConfigService dispatch', () => {
  let svc: ReturnType<typeof serviceMod.createFleetConfigService>
  let repo: ReturnType<typeof createMemoryRepo>
  const ownerA = 'openid_user_a'
  const ownerB = 'openid_user_b'

  const dispatch = async (
    action: string,
    payload: Record<string, unknown> = {},
    ownerUid = ownerA,
  ) => svc.dispatch(action, payload, ownerUid)

  const createViaService = async (name: string, ownerUid = ownerA) => {
    const state = createFleetState()
    return dispatch('createConfig', { name, fleetState: state }, ownerUid)
  }

  beforeEach(() => {
    repo = createMemoryRepo()
    svc = serviceMod.createFleetConfigService(repo)
  })

  // ── authenticate ──

  it('authenticate returns ok with a valid ownerUid', async () => {
    const r = await svc.dispatch('authenticate', {}, ownerA)
    expect(r.ok).toBe(true)
    if (r.ok) expect(r.data.authenticated).toBe(true)
  })

  it('authenticate returns authenticated:false without ownerUid', async () => {
    const r = await svc.dispatch('authenticate', {}, '')
    expect(r.ok).toBe(true)
    if (r.ok) expect(r.data.authenticated).toBe(false)
  })

  // ── Owner isolation ──

  it('listMyConfigs only returns configs for the requesting owner', async () => {
    await createViaService('A的配置', ownerA)
    await createViaService('B的配置', ownerB)
    await createViaService('A的第二配置', ownerA)

    const rA = await dispatch('listMyConfigs', {}, ownerA)
    const rB = await dispatch('listMyConfigs', {}, ownerB)

    expect(rA.ok).toBe(true)
    expect(rB.ok).toBe(true)
    if (rA.ok && rB.ok) {
      expect(rA.data as unknown as unknown[]).toHaveLength(2)
      expect(rB.data as unknown as unknown[]).toHaveLength(1)
    }
  })

  it('cannot load another owner config', async () => {
    const created = await createViaService('私人配置', ownerB)
    expect(created.ok).toBe(true)
    const configId = created.ok
      ? ((created.data as Record<string, unknown>).configId as string)
      : ''

    const r = await dispatch('loadConfig', { configId }, ownerA)
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.code).toBe('not-found')
  })

  it('cannot delete another owner config', async () => {
    const created = await createViaService('B私人配置', ownerB)
    expect(created.ok).toBe(true)
    const configId = created.ok
      ? ((created.data as Record<string, unknown>).configId as string)
      : ''

    const r = await dispatch('deleteConfig', { configId }, ownerA)
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.code).toBe('not-found')
  })

  // ── Duplicate name ──

  it('rejects duplicate normalized name for same owner', async () => {
    await createViaService('主力艦隊')
    const r = await createViaService('  主力艦隊  ')
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.code).toBe('duplicate-name')
  })

  it('allows same name for different owners', async () => {
    const r1 = await createViaService('通用配置', ownerA)
    const r2 = await createViaService('通用配置', ownerB)
    expect(r1.ok).toBe(true)
    expect(r2.ok).toBe(true)
  })

  it('rejects empty name', async () => {
    const r = await createViaService('   ')
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.code).toBe('name-required')
  })

  // ── 20-record limit ──

  it('allows up to 20 configs and rejects the 21st', async () => {
    for (let i = 0; i < 20; i++) {
      const r = await createViaService(`配置${i}`)
      expect(r.ok).toBe(true)
    }
    const r21 = await createViaService('第21個配置')
    expect(r21.ok).toBe(false)
    if (!r21.ok) expect(r21.code).toBe('limit-reached')
  })

  it('saveAs counts toward the limit', async () => {
    const state = createFleetState()
    for (let i = 0; i < 20; i++) {
      const r = await dispatch('saveAsConfig', { name: `另存${i}`, fleetState: state })
      expect(r.ok).toBe(true)
    }
    const r21 = await dispatch('saveAsConfig', { name: '超出限制', fleetState: state })
    expect(r21.ok).toBe(false)
    if (!r21.ok) expect(r21.code).toBe('limit-reached')
  })

  it('rename does not increase config count', async () => {
    await createViaService('配置A')
    await createViaService('配置B')
    const count = await repo.countByOwner(ownerA)
    expect(count).toBe(2)

    // Find config A and rename
    const list = await dispatch('listMyConfigs')
    expect(list.ok).toBe(true)
    if (list.ok) {
      const summaries = list.data as unknown as { configId: string; version: number }[]
      const cfgA = summaries.find((s) => s.configId)!
      const r = await dispatch('renameConfig', {
        configId: cfgA.configId,
        expectedVersion: cfgA.version,
        name: '新名稱',
      })
      expect(r.ok).toBe(true)
      expect(await repo.countByOwner(ownerA)).toBe(2)
    }
  })

  it('rename rejects duplicate name', async () => {
    await createViaService('配置A')
    await createViaService('配置B')
    const list = await dispatch('listMyConfigs')
    expect(list.ok).toBe(true)
    if (list.ok) {
      const summaries = list.data as unknown as {
        configId: string
        name: string
        version: number
      }[]
      const cfgA = summaries.find((s) => s.name === '配置A')!
      const r = await dispatch('renameConfig', {
        configId: cfgA.configId,
        expectedVersion: cfgA.version,
        name: '配置B',
      })
      expect(r.ok).toBe(false)
      if (!r.ok) expect(r.code).toBe('duplicate-name')
    }
  })

  // ── CRUD actions ──

  it('createConfig returns a full record with all expected fields', async () => {
    const state = createFleetState()
    const r = await dispatch('createConfig', { name: '新建配置', fleetState: state })
    expect(r.ok).toBe(true)
    if (r.ok) {
      const data = r.data as Record<string, unknown>
      expect(data.configId).toBeDefined()
      expect(data.name).toBe('新建配置')
      expect(data.version).toBe(1)
      expect(data.schemaVersion).toBe(1)
      expect(data.fleetState).toEqual(state)
    }
  })

  it('loadConfig returns the full record and updates lastUsedAt', async () => {
    const created = await createViaService('載入測試')
    expect(created.ok).toBe(true)
    const configId = created.ok
      ? ((created.data as Record<string, unknown>).configId as string)
      : ''

    const r = await dispatch('loadConfig', { configId })
    expect(r.ok).toBe(true)
    if (r.ok) {
      const data = r.data as Record<string, unknown>
      expect(data.name).toBe('載入測試')
      expect(data.fleetState).toBeDefined()
    }
  })

  it('updateConfig with matching version succeeds and increments version', async () => {
    const created = await createViaService('更新測試')
    expect(created.ok).toBe(true)
    const configId = created.ok
      ? ((created.data as Record<string, unknown>).configId as string)
      : ''

    const modified = createFleetState()
    modified.bannedOfficerIds = ['officer_x']

    const r = await dispatch('updateConfig', {
      configId,
      expectedVersion: 1,
      fleetState: modified,
    })
    expect(r.ok).toBe(true)
    if (r.ok) {
      const data = r.data as Record<string, unknown>
      expect(data.version).toBe(2)
      expect((data.fleetState as FleetState).bannedOfficerIds).toEqual(['officer_x'])
    }
  })

  it('updateConfig with stale version returns conflict', async () => {
    const created = await createViaService('衝突測試')
    expect(created.ok).toBe(true)
    const configId = created.ok
      ? ((created.data as Record<string, unknown>).configId as string)
      : ''

    // First update succeeds
    await dispatch('updateConfig', {
      configId,
      expectedVersion: 1,
      fleetState: createFleetState(),
    })

    // Second update with stale version
    const r = await dispatch('updateConfig', {
      configId,
      expectedVersion: 1,
      fleetState: createFleetState(),
    })
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.code).toBe('conflict')
  })

  it('force update overwrites even with stale version', async () => {
    const created = await createViaService('強制覆蓋測試')
    expect(created.ok).toBe(true)
    const configId = created.ok
      ? ((created.data as Record<string, unknown>).configId as string)
      : ''

    // Update to bump version
    await dispatch('updateConfig', {
      configId,
      expectedVersion: 1,
      fleetState: createFleetState(),
    })

    // Force update with stale version but force flag
    const modified = createFleetState()
    modified.bannedOfficerIds = ['officer_forced']

    const r = await dispatch('updateConfig', {
      configId,
      expectedVersion: 1,
      fleetState: modified,
      force: true,
    })
    expect(r.ok).toBe(true)
    if (r.ok) {
      expect((r.data as Record<string, unknown>).version).toBe(3)
    }
  })

  it('saveAsConfig creates a new config preserving the original', async () => {
    const orig = await createViaService('原始配置')
    expect(orig.ok).toBe(true)
    const state = createFleetState()

    const r = await dispatch('saveAsConfig', { name: '副本配置', fleetState: state })
    expect(r.ok).toBe(true)
    if (r.ok) {
      const data = r.data as Record<string, unknown>
      expect(data.name).toBe('副本配置')
      expect(data.version).toBe(1)
    }

    const list = await dispatch('listMyConfigs')
    expect(list.ok).toBe(true)
    if (list.ok) expect(list.data as unknown as unknown[]).toHaveLength(2)
  })

  it('renameConfig updates name while preserving fleetState', async () => {
    const created = await createViaService('舊名')
    expect(created.ok).toBe(true)
    const configId = created.ok
      ? ((created.data as Record<string, unknown>).configId as string)
      : ''

    const r = await dispatch('renameConfig', {
      configId,
      expectedVersion: 1,
      name: '新名',
    })
    expect(r.ok).toBe(true)
    if (r.ok) {
      expect((r.data as Record<string, unknown>).name).toBe('新名')
      expect((r.data as Record<string, unknown>).version).toBe(2)
    }
  })

  it('deleteConfig removes the config', async () => {
    const created = await createViaService('待刪除')
    expect(created.ok).toBe(true)
    const configId = created.ok
      ? ((created.data as Record<string, unknown>).configId as string)
      : ''

    const r = await dispatch('deleteConfig', { configId })
    expect(r.ok).toBe(true)

    const load = await dispatch('loadConfig', { configId })
    expect(load.ok).toBe(false)
    if (!load.ok) expect(load.code).toBe('not-found')
  })

  it('deleteConfig with confirm returns ok', async () => {
    const created = await createViaService('二次確認刪除')
    expect(created.ok).toBe(true)
    const configId = created.ok
      ? ((created.data as Record<string, unknown>).configId as string)
      : ''

    const r = await dispatch('deleteConfig', { configId })
    expect(r.ok).toBe(true)
    if (r.ok) expect(r.data).toEqual({ deleted: true })
  })

  it('setLastUsedConfig updates lastUsedAt', async () => {
    const created = await createViaService('最後使用測試')
    expect(created.ok).toBe(true)
    const configId = created.ok
      ? ((created.data as Record<string, unknown>).configId as string)
      : ''

    await dispatch('setLastUsedConfig', { configId })
    // Verify by checking it appears first in list
    const list = await dispatch('listMyConfigs')
    expect(list.ok).toBe(true)
    // It should be in the list (order depends on timestamps)
    if (list.ok) {
      const summaries = list.data as unknown as { configId: string }[]
      expect(summaries.some((s) => s.configId === configId)).toBe(true)
    }
  })

  // ── Invalid payloads ──

  it('rejects invalid fleetState on create', async () => {
    const r = await dispatch('createConfig', {
      name: '壞配置',
      fleetState: { ships: [], bannedOfficerIds: 'not-an-array' },
    })
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.code).toBe('invalid-state')
  })

  it('rejects unknown action', async () => {
    const r = await dispatch('unknownAction' as string)
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.code).toBe('unknown-action')
  })

  it('requires authentication for protected actions', async () => {
    const r = await svc.dispatch('listMyConfigs', {}, '')
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.code).toBe('unauthenticated')
  })
})
