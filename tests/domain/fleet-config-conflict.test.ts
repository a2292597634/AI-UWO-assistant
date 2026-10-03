import { describe, expect, it } from 'vitest'
import {
  canForceOverwrite,
  type FleetConfigConflict,
} from '../../miniprogram/domain/fleet-config-conflict'

describe('配置衝突覆蓋授權', () => {
  const conflict: FleetConfigConflict = {
    action: 'update',
    configId: 'A',
    configName: '目前配置',
    expectedVersion: 1,
    fleetSnapshot: '原快照',
  }
  it('相同配置及快照的更新衝突可以覆蓋', () => {
    expect(canForceOverwrite(conflict, { configId: 'A', fleetSnapshot: '原快照' })).toBe(true)
  })
  it.each(['classify', 'rename', 'delete'] as const)(
    '即使 ID 相同，%s 衝突仍不可覆蓋',
    (action) => {
      expect(
        canForceOverwrite({ ...conflict, action }, { configId: 'A', fleetSnapshot: '原快照' }),
      ).toBe(false)
    },
  )
  it.each([
    { configId: 'B', fleetSnapshot: '原快照' },
    { configId: null, fleetSnapshot: '原快照' },
    { configId: 'A', fleetSnapshot: '新草稿' },
  ])('切換配置或編輯使舊更新授權失效：%j', (current) => {
    expect(canForceOverwrite(conflict, current)).toBe(false)
  })
})
