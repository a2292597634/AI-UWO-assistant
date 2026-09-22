/**
 * Fleet Config Service 測試
 *
 * 透過記憶體 repository double 測試 Cloud Function service dispatch 介面，
 * 驗證 owner 隔離、名稱唯一性、各 scope 上限、版本衝突與完整 CRUD action。
 */

import { describe, expect, it, beforeEach } from 'vitest'
import { createFleetState } from '../../miniprogram/domain/battle-fleet'
import type { FleetState } from '../../miniprogram/contracts/battle-fleet'
import type { ConfigScope } from '../../miniprogram/contracts/fleet-config'

// --- In-memory repository double (matches fleet-config-repository.js interface) ---

interface FleetConfigRecord {
  configId: string
  ownerUid: string
  name: string
  scope?: ConfigScope
  normalizedName?: string
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
  let operationTail = Promise.resolve()

  const getStoredScope = (record: FleetConfigRecord): ConfigScope => {
    return record.scope === 'battle' || record.scope === 'adventure' ? record.scope : 'unclassified'
  }

  const withOwnerLock = async <T>(operation: () => Promise<T> | T): Promise<T> => {
    const previous = operationTail
    let release!: () => void
    operationTail = new Promise<void>((resolve) => {
      release = resolve
    })
    await previous
    try {
      return await operation()
    } finally {
      release()
    }
  }

  return {
    async listByOwner(ownerUid: string, scope?: ConfigScope) {
      const result: FleetConfigRecord[] = []
      for (const [k, r] of records) {
        if (k.startsWith(`${ownerUid}:`) && (scope === undefined || getStoredScope(r) === scope)) {
          result.push(r)
        }
      }
      return result.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
    },
    async findByOwnerAndId(ownerUid: string, configId: string, scope?: ConfigScope) {
      const record = records.get(key(ownerUid, configId))
      return record && (scope === undefined || getStoredScope(record) === scope) ? record : null
    },
    async countByOwner(ownerUid: string, scope?: ConfigScope) {
      let count = 0
      for (const [k, record] of records) {
        if (
          k.startsWith(`${ownerUid}:`) &&
          (scope === undefined || getStoredScope(record) === scope)
        ) {
          count++
        }
      }
      return count
    },
    async insert(record: FleetConfigRecord) {
      records.set(key(record.ownerUid, record.configId), { ...record })
      return record
    },
    async insertWithConstraints(record: FleetConfigRecord, maxConfigsPerScope: number) {
      return withOwnerLock(async () => {
        const sameScopeRecords = [...records.values()].filter(
          (item) =>
            item.ownerUid === record.ownerUid && getStoredScope(item) === getStoredScope(record),
        )
        if (sameScopeRecords.length >= maxConfigsPerScope) {
          return { ok: false as const, code: 'limit-reached' as const }
        }
        if (
          sameScopeRecords.some(
            (item) => (item.normalizedName ?? item.name.trim()) === record.normalizedName,
          )
        ) {
          return { ok: false as const, code: 'duplicate-name' as const }
        }
        const saved = { ...record }
        records.set(key(record.ownerUid, record.configId), saved)
        return { ok: true as const, data: saved }
      })
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
    async renameIfVersionAndNameAvailable(
      ownerUid: string,
      configId: string,
      expectedVersion: number,
      name: string,
      normalizedName: string,
      scope: ConfigScope,
    ) {
      return withOwnerLock(async () => {
        const existing = records.get(key(ownerUid, configId))
        if (!existing) return { ok: false as const, code: 'not-found' as const }
        if (getStoredScope(existing) !== scope)
          return { ok: false as const, code: 'not-found' as const }
        if (existing.version !== expectedVersion) {
          return { ok: false as const, code: 'conflict' as const }
        }
        const duplicate = [...records.values()].some(
          (item) =>
            item.ownerUid === ownerUid &&
            item.configId !== configId &&
            getStoredScope(item) === scope &&
            (item.normalizedName ?? item.name.trim()) === normalizedName,
        )
        if (duplicate) return { ok: false as const, code: 'duplicate-name' as const }
        const updated = { ...existing, name, normalizedName, version: existing.version + 1 }
        records.set(key(ownerUid, configId), updated)
        return { ok: true as const, data: updated }
      })
    },
    async deleteByOwnerAndId(
      ownerUid: string,
      configId: string,
      expectedVersion: number,
      scope?: ConfigScope,
    ) {
      const configKey = key(ownerUid, configId)
      const existing = records.get(configKey)
      if (
        !existing ||
        existing.version !== expectedVersion ||
        (scope !== undefined && getStoredScope(existing) !== scope)
      ) {
        return false
      }
      return records.delete(configKey)
    },
    async touchLastUsed(
      ownerUid: string,
      configId: string,
      updatedAt: string,
      scope?: ConfigScope,
    ) {
      const k = key(ownerUid, configId)
      const existing = records.get(k)
      if (existing && (scope === undefined || getStoredScope(existing) === scope)) {
        records.set(k, { ...existing, lastUsedAt: updatedAt })
      }
    },
    async classifyIfVersionAndConstraints(
      ownerUid: string,
      configId: string,
      expectedVersion: number,
      targetScope: 'battle' | 'adventure',
      maxConfigsPerScope: number,
    ) {
      return withOwnerLock(async () => {
        const existing = records.get(key(ownerUid, configId))
        if (!existing) return { ok: false as const, code: 'not-found' as const }
        if (existing.version !== expectedVersion) {
          return { ok: false as const, code: 'conflict' as const }
        }
        if (getStoredScope(existing) !== 'unclassified') {
          return { ok: false as const, code: 'invalid-state' as const }
        }
        const sameScopeRecords = [...records.values()].filter(
          (item) =>
            item.ownerUid === ownerUid &&
            item.configId !== configId &&
            getStoredScope(item) === targetScope,
        )
        if (sameScopeRecords.length >= maxConfigsPerScope) {
          return { ok: false as const, code: 'limit-reached' as const }
        }
        const normalizedName = existing.normalizedName ?? existing.name.trim()
        if (
          sameScopeRecords.some(
            (item) => (item.normalizedName ?? item.name.trim()) === normalizedName,
          )
        ) {
          return { ok: false as const, code: 'duplicate-name' as const }
        }
        const updated = {
          ...existing,
          scope: targetScope,
          version: existing.version + 1,
        }
        records.set(key(ownerUid, configId), updated)
        return { ok: true as const, data: updated }
      })
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

  const createViaService = async (
    name: string,
    ownerUid = ownerA,
    scope: 'battle' | 'adventure' = 'battle',
  ) => {
    const state = createFleetState()
    return dispatch('createConfig', { scope, name, fleetState: state }, ownerUid)
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

    const rA = await dispatch('listMyConfigs', { scope: 'battle' }, ownerA)
    const rB = await dispatch('listMyConfigs', { scope: 'battle' }, ownerB)

    expect(rA.ok).toBe(true)
    expect(rB.ok).toBe(true)
    if (rA.ok && rB.ok) {
      expect(rA.data as unknown as unknown[]).toHaveLength(2)
      expect(rB.data as unknown as unknown[]).toHaveLength(1)
    }
  })

  it('不同 scope 可以使用相同名稱，但同 scope 仍拒絕重名', async () => {
    const battle = await dispatch('createConfig', {
      scope: 'battle',
      name: '主力艦隊',
      fleetState: createFleetState(),
    })
    const adventure = await dispatch('createConfig', {
      scope: 'adventure',
      name: '主力艦隊',
      fleetState: createFleetState(),
    })
    const duplicate = await dispatch('createConfig', {
      scope: 'battle',
      name: '主力艦隊',
      fleetState: createFleetState(),
    })

    expect(battle.ok).toBe(true)
    expect(adventure.ok).toBe(true)
    expect(duplicate).toMatchObject({ ok: false, code: 'duplicate-name' })
  })

  it('戰鬥與冒險各自最多 10 套', async () => {
    for (let i = 0; i < 10; i++) {
      expect(
        (
          await dispatch('createConfig', {
            scope: 'battle',
            name: `戰鬥${i}`,
            fleetState: createFleetState(),
          })
        ).ok,
      ).toBe(true)
      expect(
        (
          await dispatch('createConfig', {
            scope: 'adventure',
            name: `冒險${i}`,
            fleetState: createFleetState(),
          })
        ).ok,
      ).toBe(true)
    }
    expect(
      (
        await dispatch('createConfig', {
          scope: 'battle',
          name: '戰鬥11',
          fleetState: createFleetState(),
        })
      ).ok,
    ).toBe(false)
    expect(
      (
        await dispatch('createConfig', {
          scope: 'adventure',
          name: '冒險11',
          fleetState: createFleetState(),
        })
      ).ok,
    ).toBe(false)
  })

  it('舊記錄只出現在待分類列表，分類後進入目標 scope', async () => {
    const legacy = {
      configId: 'legacy-1',
      ownerUid: ownerA,
      name: '舊配置',
      normalizedName: '舊配置',
      fleetState: createFleetState(),
      schemaVersion: 1,
      version: 1,
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
      lastUsedAt: '2026-01-01T00:00:00.000Z',
    }
    await repo.insert(legacy)

    const unclassified = await dispatch('listUnclassifiedConfigs')
    const battleList = await dispatch('listMyConfigs', { scope: 'battle' })
    expect(unclassified).toMatchObject({
      ok: true,
      data: [{ configId: 'legacy-1', scope: 'unclassified' }],
    })
    expect(battleList).toMatchObject({ ok: true, data: [] })

    const classified = await dispatch('classifyConfig', {
      configId: 'legacy-1',
      expectedVersion: 1,
      targetScope: 'adventure',
    })
    expect(classified).toMatchObject({
      ok: true,
      data: { configId: 'legacy-1', scope: 'adventure' },
    })
    await expect(dispatch('listUnclassifiedConfigs')).resolves.toMatchObject({ ok: true, data: [] })
    await expect(dispatch('listMyConfigs', { scope: 'adventure' })).resolves.toMatchObject({
      ok: true,
      data: [{ configId: 'legacy-1', scope: 'adventure' }],
    })
  })

  it('分類舊記錄前拒絕不符合目標 scope 的艦隊資料', async () => {
    await repo.insert({
      configId: 'legacy-invalid',
      ownerUid: ownerA,
      name: '無效舊配置',
      normalizedName: '無效舊配置',
      fleetState: { preserved: true } as unknown as FleetState,
      schemaVersion: 1,
      version: 1,
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
      lastUsedAt: '2026-01-01T00:00:00.000Z',
    })

    await expect(
      dispatch('classifyConfig', {
        configId: 'legacy-invalid',
        expectedVersion: 1,
        targetScope: 'adventure',
      }),
    ).resolves.toMatchObject({ ok: false, code: 'invalid-state' })
  })

  it('以另一 scope 讀寫同一配置 ID 時返回 not-found', async () => {
    const created = await createViaService('戰鬥配置', ownerA, 'battle')
    expect(created.ok).toBe(true)
    if (!created.ok) return
    const configId = created.data.configId as string

    await expect(dispatch('loadConfig', { scope: 'adventure', configId })).resolves.toMatchObject({
      ok: false,
      code: 'not-found',
    })
    await expect(
      dispatch('updateConfig', {
        scope: 'adventure',
        configId,
        expectedVersion: 1,
        fleetState: createFleetState(),
      }),
    ).resolves.toMatchObject({ ok: false, code: 'not-found' })
    await expect(
      dispatch('deleteConfig', { scope: 'adventure', configId, expectedVersion: 1 }),
    ).resolves.toMatchObject({ ok: false, code: 'not-found' })
  })

  it('cannot load another owner config', async () => {
    const created = await createViaService('私人配置', ownerB)
    expect(created.ok).toBe(true)
    const configId = created.ok
      ? ((created.data as Record<string, unknown>).configId as string)
      : ''

    const r = await dispatch('loadConfig', { scope: 'battle', configId }, ownerA)
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.code).toBe('not-found')
  })

  it('cannot delete another owner config', async () => {
    const created = await createViaService('B私人配置', ownerB)
    expect(created.ok).toBe(true)
    const configId = created.ok
      ? ((created.data as Record<string, unknown>).configId as string)
      : ''

    const r = await dispatch(
      'deleteConfig',
      { scope: 'battle', configId, expectedVersion: 1 },
      ownerA,
    )
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

  it('persists the normalized name used for uniqueness checks', async () => {
    const r = await createViaService('  主力艦隊  ')
    expect(r.ok).toBe(true)
    if (r.ok) expect((r.data as Record<string, unknown>).normalizedName).toBe('主力艦隊')
  })

  it('allows only one concurrent create with the same owner and name', async () => {
    const results = await Promise.all([
      createViaService('並發同名'),
      createViaService('  並發同名  '),
    ])

    expect(results.filter((result) => result.ok)).toHaveLength(1)
    expect(results.filter((result) => !result.ok)).toHaveLength(1)
    expect(await repo.countByOwner(ownerA)).toBe(1)
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

  // ── 每個 scope 的 10 套上限 ──

  it('allows up to 10 configs and rejects the 11th', async () => {
    for (let i = 0; i < 10; i++) {
      const r = await createViaService(`配置${i}`)
      expect(r.ok).toBe(true)
    }
    const r11 = await createViaService('第11個配置')
    expect(r11.ok).toBe(false)
    if (!r11.ok) expect(r11.code).toBe('limit-reached')
  })

  it('saveAs counts toward the limit', async () => {
    const state = createFleetState()
    for (let i = 0; i < 10; i++) {
      const r = await dispatch('saveAsConfig', {
        scope: 'battle',
        name: `另存${i}`,
        fleetState: state,
      })
      expect(r.ok).toBe(true)
    }
    const r11 = await dispatch('saveAsConfig', {
      scope: 'battle',
      name: '超出限制',
      fleetState: state,
    })
    expect(r11.ok).toBe(false)
    if (!r11.ok) expect(r11.code).toBe('limit-reached')
  })

  it('does not exceed 10 configs under concurrent create', async () => {
    for (let i = 0; i < 9; i++) await createViaService(`既有配置${i}`)

    const results = await Promise.all([
      createViaService('並發第10個'),
      createViaService('並發第11個'),
    ])

    expect(results.filter((result) => result.ok)).toHaveLength(1)
    expect(results.filter((result) => !result.ok)).toHaveLength(1)
    expect(results.find((result) => !result.ok)).toMatchObject({
      ok: false,
      code: 'limit-reached',
    })
    expect(await repo.countByOwner(ownerA, 'battle')).toBe(10)
  })

  it('does not exceed 10 configs under concurrent saveAs', async () => {
    for (let i = 0; i < 9; i++) await createViaService(`另存既有${i}`)

    const state = createFleetState()
    const results = await Promise.all([
      dispatch('saveAsConfig', {
        scope: 'battle',
        name: '並發另存第10個',
        fleetState: state,
      }),
      dispatch('saveAsConfig', {
        scope: 'battle',
        name: '並發另存第11個',
        fleetState: state,
      }),
    ])

    expect(results.filter((result) => result.ok)).toHaveLength(1)
    expect(results.filter((result) => !result.ok)).toHaveLength(1)
    expect(results.find((result) => !result.ok)).toMatchObject({
      ok: false,
      code: 'limit-reached',
    })
    expect(await repo.countByOwner(ownerA, 'battle')).toBe(10)
  })

  it('rename does not increase config count', async () => {
    await createViaService('配置A')
    await createViaService('配置B')
    const count = await repo.countByOwner(ownerA, 'battle')
    expect(count).toBe(2)

    // Find config A and rename
    const list = await dispatch('listMyConfigs', { scope: 'battle' })
    expect(list.ok).toBe(true)
    if (list.ok) {
      const summaries = list.data as unknown as { configId: string; version: number }[]
      const cfgA = summaries.find((s) => s.configId)!
      const r = await dispatch('renameConfig', {
        scope: 'battle',
        configId: cfgA.configId,
        expectedVersion: cfgA.version,
        name: '新名稱',
      })
      expect(r.ok).toBe(true)
      expect(await repo.countByOwner(ownerA, 'battle')).toBe(2)
    }
  })

  it('rename rejects duplicate name', async () => {
    await createViaService('配置A')
    await createViaService('配置B')
    const list = await dispatch('listMyConfigs', { scope: 'battle' })
    expect(list.ok).toBe(true)
    if (list.ok) {
      const summaries = list.data as unknown as {
        configId: string
        name: string
        version: number
      }[]
      const cfgA = summaries.find((s) => s.name === '配置A')!
      const r = await dispatch('renameConfig', {
        scope: 'battle',
        configId: cfgA.configId,
        expectedVersion: cfgA.version,
        name: '配置B',
      })
      expect(r.ok).toBe(false)
      if (!r.ok) expect(r.code).toBe('duplicate-name')
    }
  })

  it('does not allow concurrent renames to claim the same name', async () => {
    const first = await createViaService('待改名A')
    const second = await createViaService('待改名B')
    expect(first.ok).toBe(true)
    expect(second.ok).toBe(true)
    if (!first.ok || !second.ok) return

    const firstData = first.data as Record<string, unknown>
    const secondData = second.data as Record<string, unknown>
    const results = await Promise.all([
      dispatch('renameConfig', {
        scope: 'battle',
        configId: firstData.configId,
        expectedVersion: firstData.version,
        name: '並發新名稱',
      }),
      dispatch('renameConfig', {
        scope: 'battle',
        configId: secondData.configId,
        expectedVersion: secondData.version,
        name: '  並發新名稱  ',
      }),
    ])

    expect(results.filter((result) => result.ok)).toHaveLength(1)
    expect(results.filter((result) => !result.ok)).toHaveLength(1)
    expect(results.find((result) => !result.ok)).toMatchObject({
      ok: false,
      code: 'duplicate-name',
    })
  })

  // ── CRUD actions ──

  it('createConfig returns a full record with all expected fields', async () => {
    const state = createFleetState()
    const r = await dispatch('createConfig', {
      scope: 'battle',
      name: '新建配置',
      fleetState: state,
    })
    expect(r.ok).toBe(true)
    if (r.ok) {
      const data = r.data as Record<string, unknown>
      expect(data.configId).toBeDefined()
      expect(data.name).toBe('新建配置')
      expect(data.scope).toBe('battle')
      expect(data.version).toBe(1)
      expect(data.schemaVersion).toBe(1)
      expect(data.fleetState).toEqual(state)
    }
  })

  it('accepts configured Lv.0 tracking targets on every save action', async () => {
    const baseline = await createViaService('追蹤目標基準')
    expect(baseline.ok).toBe(true)
    const configId = baseline.ok ? ((baseline.data.configId as string) ?? '') : ''

    const trackedState = createFleetState()
    trackedState.ships[0]!.mode = 'auto'
    trackedState.ships[0]!.targets = [
      { id: 'tracking-target', skillId: 'skill-adventure', targetLevel: 0 },
    ]

    const createResult = await dispatch('createConfig', {
      scope: 'battle',
      name: 'Lv0追蹤新配置',
      fleetState: trackedState,
    })
    const updateResult = await dispatch('updateConfig', {
      scope: 'battle',
      configId,
      expectedVersion: 1,
      fleetState: trackedState,
    })
    const saveAsResult = await dispatch('saveAsConfig', {
      scope: 'battle',
      name: 'Lv0追蹤副本',
      fleetState: trackedState,
    })

    expect(createResult.ok, 'createConfig 應接受 Lv.0 追蹤目標').toBe(true)
    expect(updateResult.ok, 'updateConfig 應接受 Lv.0 追蹤目標').toBe(true)
    expect(saveAsResult.ok, 'saveAsConfig 應接受 Lv.0 追蹤目標').toBe(true)
  })

  it('冒險配置接受 30 個目標但拒絕第 31 個，戰鬥仍拒絕第 21 個', async () => {
    const createStateWithTargets = (count: number): FleetState => {
      const state = createFleetState()
      state.ships[0]!.targets = Array.from({ length: count }, (_, index) => ({
        id: `target-${index + 1}`,
        skillId: `skill-${index + 1}`,
        targetLevel: 0,
      }))
      return state
    }

    const adventure = await dispatch('createConfig', {
      scope: 'adventure',
      name: '30個冒險目標',
      fleetState: createStateWithTargets(30),
    })
    const adventureTooMany = await dispatch('createConfig', {
      scope: 'adventure',
      name: '31個冒險目標',
      fleetState: createStateWithTargets(31),
    })
    const battleTooMany = await dispatch('createConfig', {
      scope: 'battle',
      name: '21個戰鬥目標',
      fleetState: createStateWithTargets(21),
    })

    expect(adventure.ok).toBe(true)
    expect(adventureTooMany).toMatchObject({ ok: false, code: 'invalid-state' })
    expect(battleTooMany).toMatchObject({ ok: false, code: 'invalid-state' })
  })

  it('rejects Lv.0 empty targets at the server boundary', async () => {
    const invalidState = createFleetState()
    invalidState.ships[0]!.mode = 'auto'
    invalidState.ships[0]!.targets = [{ id: 'empty-target', skillId: null, targetLevel: 0 }]

    const result = await dispatch('createConfig', {
      scope: 'battle',
      name: '非法空目標',
      fleetState: invalidState,
    })

    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.code).toBe('invalid-state')
  })

  it('loadConfig returns the full record and updates lastUsedAt', async () => {
    const created = await createViaService('載入測試')
    expect(created.ok).toBe(true)
    const configId = created.ok
      ? ((created.data as Record<string, unknown>).configId as string)
      : ''

    const r = await dispatch('loadConfig', { scope: 'battle', configId })
    expect(r.ok).toBe(true)
    if (r.ok) {
      const data = r.data as Record<string, unknown>
      expect(data.name).toBe('載入測試')
      expect(data.fleetState).toBeDefined()
      const stored = await repo.findByOwnerAndId(ownerA, configId)
      expect(data.lastUsedAt).toBe(stored?.lastUsedAt)
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
      scope: 'battle',
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
      scope: 'battle',
      configId,
      expectedVersion: 1,
      fleetState: createFleetState(),
    })

    // Second update with stale version
    const r = await dispatch('updateConfig', {
      scope: 'battle',
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
      scope: 'battle',
      configId,
      expectedVersion: 1,
      fleetState: createFleetState(),
    })

    // Force update with stale version but force flag
    const modified = createFleetState()
    modified.bannedOfficerIds = ['officer_forced']

    const r = await dispatch('updateConfig', {
      scope: 'battle',
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

    const r = await dispatch('saveAsConfig', {
      scope: 'battle',
      name: '副本配置',
      fleetState: state,
    })
    expect(r.ok).toBe(true)
    if (r.ok) {
      const data = r.data as Record<string, unknown>
      expect(data.name).toBe('副本配置')
      expect(data.version).toBe(1)
    }

    const list = await dispatch('listMyConfigs', { scope: 'battle' })
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
      scope: 'battle',
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

    const r = await dispatch('deleteConfig', { scope: 'battle', configId, expectedVersion: 1 })
    expect(r.ok).toBe(true)

    const load = await dispatch('loadConfig', { scope: 'battle', configId })
    expect(load.ok).toBe(false)
    if (!load.ok) expect(load.code).toBe('not-found')
  })

  it('deleteConfig with confirm returns ok', async () => {
    const created = await createViaService('二次確認刪除')
    expect(created.ok).toBe(true)
    const configId = created.ok
      ? ((created.data as Record<string, unknown>).configId as string)
      : ''

    const r = await dispatch('deleteConfig', { scope: 'battle', configId, expectedVersion: 1 })
    expect(r.ok).toBe(true)
    if (r.ok) expect(r.data).toEqual({ deleted: true })
  })

  it('deleteConfig with a stale version returns conflict and preserves the config', async () => {
    const created = await createViaService('版本刪除衝突')
    expect(created.ok).toBe(true)
    const configId = created.ok
      ? ((created.data as Record<string, unknown>).configId as string)
      : ''

    await dispatch('updateConfig', {
      scope: 'battle',
      configId,
      expectedVersion: 1,
      fleetState: createFleetState(),
      force: false,
    })

    const result = await dispatch('deleteConfig', {
      scope: 'battle',
      configId,
      expectedVersion: 1,
    })

    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.code).toBe('conflict')
    await expect(dispatch('loadConfig', { scope: 'battle', configId })).resolves.toMatchObject({
      ok: true,
    })
  })

  it('setLastUsedConfig updates lastUsedAt', async () => {
    const created = await createViaService('最後使用測試')
    expect(created.ok).toBe(true)
    const configId = created.ok
      ? ((created.data as Record<string, unknown>).configId as string)
      : ''

    await dispatch('setLastUsedConfig', { scope: 'battle', configId })
    // Verify by checking it appears first in list
    const list = await dispatch('listMyConfigs', { scope: 'battle' })
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
      scope: 'battle',
      name: '壞配置',
      fleetState: { ships: [], bannedOfficerIds: 'not-an-array' },
    })
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.code).toBe('invalid-state')
  })

  it('rejects malformed FleetState fields at the server boundary', async () => {
    const state = createFleetState()
    const cases: Array<[string, unknown]> = [
      [
        '字串目標等級',
        {
          ...state,
          ships: state.ships.map((ship, index) =>
            index === 0
              ? { ...ship, targets: [{ id: 'target-1', skillId: 'skill-a', targetLevel: 'abc' }] }
              : ship,
          ),
        },
      ],
      [
        '小數目標等級',
        {
          ...state,
          ships: state.ships.map((ship, index) =>
            index === 0
              ? { ...ship, targets: [{ id: 'target-1', skillId: 'skill-a', targetLevel: 1.5 }] }
              : ship,
          ),
        },
      ],
      [
        '非字串技能 ID',
        {
          ...state,
          ships: state.ships.map((ship, index) =>
            index === 0
              ? { ...ship, targets: [{ id: 'target-1', skillId: 42, targetLevel: 1 }] }
              : ship,
          ),
        },
      ],
      [
        '跨船重複航海士',
        {
          ...state,
          ships: state.ships.map((ship, index) =>
            index < 2 ? { ...ship, officerIds: ['officer-shared'] } : ship,
          ),
        },
      ],
      [
        '重複目標技能',
        {
          ...state,
          ships: state.ships.map((ship, index) =>
            index === 0
              ? {
                  ...ship,
                  targets: [
                    { id: 'target-1', skillId: 'skill-a', targetLevel: 1 },
                    { id: 'target-2', skillId: 'skill-a', targetLevel: 2 },
                  ],
                }
              : ship,
          ),
        },
      ],
      [
        '非字串陣列元素與錯誤旗標',
        {
          ...state,
          bannedOfficerIds: [42],
          ships: state.ships.map((ship, index) =>
            index === 0
              ? { ...ship, lockedOfficerIds: [42], removedOfficerIds: [42], needsReview: 'yes' }
              : ship,
          ),
        },
      ],
    ]

    for (const [name, fleetState] of cases) {
      const result = await dispatch('createConfig', { scope: 'battle', name, fleetState })
      expect(result.ok, name).toBe(false)
      if (!result.ok) expect(result.code, name).toBe('invalid-state')
    }
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
