import { describe, expect, it } from 'vitest'
import { getAdventureOptimizationTargets } from '../../miniprogram/domain/adventure-fleet'

describe('adventure fleet target semantics', () => {
  it('keeps only configured Lv.1+ adventure targets for optimization', () => {
    expect(
      getAdventureOptimizationTargets([
        { id: 'tracking', skillId: 'skill-track', targetLevel: 0 },
        { id: 'empty', skillId: null, targetLevel: 1 },
        { id: 'goal', skillId: 'skill-goal', targetLevel: 3 },
      ]),
    ).toEqual([{ skillId: 'skill-goal', targetLevel: 3 }])
  })
})
