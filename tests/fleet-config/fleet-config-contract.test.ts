import { describe, expect, it } from 'vitest'
import { createFleetState } from '../../miniprogram/domain/battle-fleet'
import type { FleetState } from '../../miniprogram/contracts/battle-fleet'

// These imports will fail until the module is created
import {
  serializeFleetState,
  parseFleetState,
  isValidFleetState,
  isValidSerializedFleetState,
  normalizeConfigName,
  isConfigNameAvailable,
  MAX_CONFIG_NAME_LENGTH,
  MAX_CONFIGS_PER_USER,
  SCHEMA_VERSION,
} from '../../miniprogram/contracts/fleet-config'
import type { FleetConfigSummary } from '../../miniprogram/contracts/fleet-config'

describe('FleetState serialization', () => {
  it('round-trips only the FleetState business fields', () => {
    const state = createFleetState()
    const encoded = serializeFleetState(state)
    const parsed = parseFleetState(encoded)!
    expect(parsed).toEqual(state)
    // UI transient state must not be serialized
    expect(encoded).not.toHaveProperty('currentShipId')
    expect(encoded).not.toHaveProperty('manualFilters')
    expect(encoded).not.toHaveProperty('manualSkillId')
  })

  it('preserves seven ships with all their fields', () => {
    const state = createFleetState()
    const encoded = serializeFleetState(state)
    const parsed = parseFleetState(encoded)!
    expect(parsed.ships).toHaveLength(7)
    for (const ship of parsed.ships) {
      expect(ship).toHaveProperty('id')
      expect(ship).toHaveProperty('label')
      expect(ship).toHaveProperty('mode')
      expect(ship).toHaveProperty('officerIds')
      expect(ship).toHaveProperty('targets')
      expect(ship).toHaveProperty('lockedOfficerIds')
      expect(ship).toHaveProperty('removedOfficerIds')
      expect(ship).toHaveProperty('needsReview')
    }
  })

  it('preserves bannedOfficerIds', () => {
    const state = createFleetState()
    const modified: FleetState = {
      ...state,
      bannedOfficerIds: ['officer_a', 'officer_b'],
    }
    const encoded = serializeFleetState(modified)
    const parsed = parseFleetState(encoded)!
    expect(parsed.bannedOfficerIds).toEqual(['officer_a', 'officer_b'])
  })

  it('preserves officer assignments across ships', () => {
    const state = createFleetState()
    const modified: FleetState = {
      ...state,
      ships: state.ships.map((ship, i) =>
        i === 0
          ? {
              ...ship,
              officerIds: ['officer_chast089', 'officer_chast090'],
              lockedOfficerIds: ['officer_chast089'],
              removedOfficerIds: ['officer_chast091'],
              needsReview: true,
            }
          : ship,
      ),
    }
    const encoded = serializeFleetState(modified)
    const parsed = parseFleetState(encoded)!
    expect(parsed.ships[0].officerIds).toEqual(['officer_chast089', 'officer_chast090'])
    expect(parsed.ships[0].lockedOfficerIds).toEqual(['officer_chast089'])
    expect(parsed.ships[0].removedOfficerIds).toEqual(['officer_chast091'])
    expect(parsed.ships[0].needsReview).toBe(true)
  })

  it('preserves auto targets with null skillId', () => {
    const state = createFleetState()
    const modified: FleetState = {
      ...state,
      ships: state.ships.map((ship, i) =>
        i === 0
          ? {
              ...ship,
              mode: 'auto' as const,
              targets: [
                { id: 'ship-1-target-1', skillId: 'skill_abc', targetLevel: 5 },
                { id: 'ship-1-target-2', skillId: null, targetLevel: 1 },
              ],
            }
          : ship,
      ),
    }
    const encoded = serializeFleetState(modified)
    const parsed = parseFleetState(encoded)!
    expect(parsed.ships[0].targets).toHaveLength(2)
    expect(parsed.ships[0].targets[0]).toEqual({
      id: 'ship-1-target-1',
      skillId: 'skill_abc',
      targetLevel: 5,
    })
    expect(parsed.ships[0].targets[1]).toEqual({
      id: 'ship-1-target-2',
      skillId: null,
      targetLevel: 1,
    })
  })

  it('rejects serialized data with unknown top-level fields', () => {
    const encoded = JSON.stringify({
      ships: [],
      bannedOfficerIds: [],
      currentShipId: 'ship-1',
      schemaVersion: 1,
    })
    expect(isValidSerializedFleetState(JSON.parse(encoded))).toBe(false)
  })
})

describe('FleetState validation', () => {
  it('accepts empty seven-ship state', () => {
    const state = createFleetState()
    const encoded = serializeFleetState(state)
    expect(isValidFleetState(state)).toBe(true)
    expect(isValidSerializedFleetState(JSON.parse(encoded))).toBe(true)
    expect(isValidFleetState(JSON.parse(encoded))).toBe(false)
  })

  it('rejects state without exactly seven ships', () => {
    const state = createFleetState()
    expect(isValidFleetState({ ...state, ships: state.ships.slice(0, 3) })).toBe(false)
    expect(isValidFleetState({ ...state, ships: [] })).toBe(false)
    expect(isValidFleetState({ ...state, ships: [...state.ships, ...state.ships] })).toBe(false)
  })

  it('rejects invalid target levels', () => {
    // 用序列化的原始数据作为测试输入（包含 schemaVersion）
    const raw = JSON.parse(serializeFleetState(createFleetState())) as Record<string, unknown>

    // 儲存契約中的目標等級必須是 1 至 10。
    ;(raw.ships as Array<Record<string, unknown>>)[0]!.targets = [
      { id: 't0', skillId: 'skill_abc', targetLevel: 0 },
    ]
    expect(isValidSerializedFleetState(raw)).toBe(false)

    // 等级 -1 非法
    ;(raw.ships as Array<Record<string, unknown>>)[0]!.targets = [
      { id: 't1', skillId: 'skill_abc', targetLevel: -1 },
    ]
    expect(isValidSerializedFleetState(raw)).toBe(false)

    // 等级 11 非法
    ;(raw.ships as Array<Record<string, unknown>>)[0]!.targets = [
      { id: 't2', skillId: 'skill_abc', targetLevel: 11 },
    ]
    expect(isValidSerializedFleetState(raw)).toBe(false)
  })

  it('rejects duplicate non-null target skills per ship', () => {
    const state = createFleetState()
    const dupe: FleetState = {
      ...state,
      ships: state.ships.map((ship, i) =>
        i === 0
          ? {
              ...ship,
              targets: [
                { id: 't1', skillId: 'skill_abc', targetLevel: 1 },
                { id: 't2', skillId: 'skill_abc', targetLevel: 2 },
              ],
            }
          : ship,
      ),
    }
    expect(isValidFleetState(dupe)).toBe(false)
  })

  it('rejects more than 11 officers per ship', () => {
    const state = createFleetState()
    const twelveIds = Array.from({ length: 12 }, (_, i) => `officer_${i}`)
    const overfilled: FleetState = {
      ...state,
      ships: state.ships.map((ship, i) => (i === 0 ? { ...ship, officerIds: twelveIds } : ship)),
    }
    expect(isValidFleetState(overfilled)).toBe(false)
  })

  it('rejects duplicate officers across ships', () => {
    const state = createFleetState()
    const dupe: FleetState = {
      ...state,
      ships: state.ships.map((ship, i) => {
        if (i === 0) return { ...ship, officerIds: ['officer_shared'] }
        if (i === 1) return { ...ship, officerIds: ['officer_shared'] }
        return ship
      }),
    }
    expect(isValidFleetState(dupe)).toBe(false)
  })

  it('accepts null skillIds in auto targets', () => {
    const state = createFleetState()
    const valid: FleetState = {
      ...state,
      ships: state.ships.map((ship, i) =>
        i === 0
          ? {
              ...ship,
              mode: 'auto' as const,
              targets: [
                { id: 't1', skillId: null, targetLevel: 1 },
                { id: 't2', skillId: null, targetLevel: 1 },
              ],
            }
          : ship,
      ),
    }
    const encoded = serializeFleetState(valid)
    expect(isValidSerializedFleetState(JSON.parse(encoded))).toBe(true)
  })

  it('rejects ships with invalid mode', () => {
    const state = createFleetState()
    const invalid = serializeFleetState(state)
    const parsed = JSON.parse(invalid) as Record<string, unknown>
    const ships = parsed.ships as Array<Record<string, unknown>>
    ships[0].mode = 'invalid-mode'
    expect(isValidFleetState(parsed as unknown as FleetState)).toBe(false)
  })

  it('rejects non-integer target levels', () => {
    const state = createFleetState()
    const invalid: FleetState = {
      ...state,
      ships: state.ships.map((ship, i) =>
        i === 0
          ? {
              ...ship,
              targets: [{ id: 't1', skillId: 'skill_abc', targetLevel: 1.5 }],
            }
          : ship,
      ),
    }
    expect(isValidFleetState(invalid)).toBe(false)
  })
})

describe('Config name helpers', () => {
  it('normalizes names by trimming whitespace', () => {
    expect(normalizeConfigName('  我的配隊  ')).toBe('我的配隊')
    expect(normalizeConfigName('  測試')).toBe('測試')
    expect(normalizeConfigName('無空白')).toBe('無空白')
  })

  it('rejects empty names after trim', () => {
    const existing: readonly FleetConfigSummary[] = []
    expect(isConfigNameAvailable(existing, '   ')).toBe(false)
    expect(isConfigNameAvailable(existing, '')).toBe(false)
  })

  it('rejects names longer than MAX_CONFIG_NAME_LENGTH', () => {
    const existing: readonly FleetConfigSummary[] = []
    const longName = 'a'.repeat(MAX_CONFIG_NAME_LENGTH + 1)
    expect(isConfigNameAvailable(existing, longName)).toBe(false)
  })

  it('accepts valid unique names', () => {
    const existing: readonly FleetConfigSummary[] = [
      {
        configId: 'cfg_1',
        name: '我的主力艦隊',
        version: 1,
        updatedAt: '2026-01-01T00:00:00Z',
        lastUsedAt: '2026-01-02T00:00:00Z',
      },
    ]
    expect(isConfigNameAvailable(existing, '  我的主力艦隊  ')).toBe(false)
    expect(isConfigNameAvailable(existing, '新配置')).toBe(true)
  })

  it('ignores a specified configId for rename self-check', () => {
    const existing: readonly FleetConfigSummary[] = [
      {
        configId: 'cfg_1',
        name: '我的主力艦隊',
        version: 1,
        updatedAt: '2026-01-01T00:00:00Z',
        lastUsedAt: '2026-01-02T00:00:00Z',
      },
    ]
    expect(isConfigNameAvailable(existing, '我的主力艦隊', 'cfg_1')).toBe(true)
    expect(isConfigNameAvailable(existing, '我的主力艦隊', 'cfg_2')).toBe(false)
  })
})

describe('Constants', () => {
  it('MAX_CONFIG_NAME_LENGTH is 30', () => {
    expect(MAX_CONFIG_NAME_LENGTH).toBe(30)
  })

  it('MAX_CONFIGS_PER_USER is 20', () => {
    expect(MAX_CONFIGS_PER_USER).toBe(20)
  })

  it('SCHEMA_VERSION is 1', () => {
    expect(SCHEMA_VERSION).toBe(1)
  })
})
