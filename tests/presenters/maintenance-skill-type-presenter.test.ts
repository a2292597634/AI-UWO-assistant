import { describe, expect, it } from 'vitest'

import type { MaintenanceSkillRelation } from '../../miniprogram/contracts/officer-maintenance'
import type { RuntimeDictionaryItem, RuntimeSkill } from '../../miniprogram/contracts/runtime-data'
import {
  buildMaintenanceSkillTypeOptions,
  findMaintenanceSkillTypeOption,
  nextMaintenanceSkillSlot,
} from '../../miniprogram/presenters/maintenance-skill-type-presenter'

const categories: RuntimeDictionaryItem[] = [
  { id: 'skill_category_naval_active_cannon', name: '海戰主動-砲擊' },
  { id: 'skill_category_naval_passive_cannon', name: '海戰被動-砲擊' },
  { id: 'skill_category_combat_other', name: '戰鬥-其他' },
  { id: 'skill_category_admiral', name: '提督技能' },
  { id: 'skill_category_adventure', name: '冒險' },
]

describe('維護工單技能分類展示模型', () => {
  it('按字典中的真實分類產生可選類型，並補足未標示主被動的戰鬥其他', () => {
    const options = buildMaintenanceSkillTypeOptions(categories)

    expect(options).toEqual([
      expect.objectContaining({
        id: 'active:skill_category_naval_active_cannon',
        label: '海戰主動-砲擊',
        kind: 'active',
        sourceGroup: 'sk2',
      }),
      expect.objectContaining({
        id: 'passive:skill_category_naval_passive_cannon',
        label: '海戰被動-砲擊',
        kind: 'passive',
        sourceGroup: 'sk0',
      }),
      expect.objectContaining({
        id: 'active:skill_category_combat_other',
        label: '戰鬥-其他（主動）',
        kind: 'active',
      }),
      expect.objectContaining({
        id: 'passive:skill_category_combat_other',
        label: '戰鬥-其他（被動）',
        kind: 'passive',
        sourceGroup: 'sk1',
      }),
      expect.objectContaining({
        id: 'active:skill_category_admiral',
        label: '提督技能',
        kind: 'active',
        sourceGroup: 'sk4',
      }),
      expect.objectContaining({
        id: 'passive:skill_category_adventure',
        label: '冒險',
        kind: 'passive',
        sourceGroup: 'sk0',
      }),
    ])
  })

  it('優先依現有關聯的主被動與技能分類呈現，不把 sourceGroup 當成主被動判斷', () => {
    const options = buildMaintenanceSkillTypeOptions(categories)
    const skill: RuntimeSkill = {
      id: 'skill-1',
      n: '特殊技能',
      cat: 'skill_category_combat_other',
      cn: '戰鬥-其他',
      ip: '',
      d: '',
      li: '',
    }
    const relation: MaintenanceSkillRelation = {
      skillId: skill.id,
      kind: 'passive',
      sourceGroup: 'sk2',
      slot: 0,
      unlockLevel: 1,
      level: 1,
    }

    expect(findMaintenanceSkillTypeOption(skill, relation, options)).toEqual(
      expect.objectContaining({
        id: 'passive:skill_category_combat_other',
        kind: 'passive',
      }),
    )
  })

  it('同一來源組的新增技能依序配置下一個槽位，其他來源組重新從零開始', () => {
    const skills: MaintenanceSkillRelation[] = [
      {
        skillId: 'a',
        kind: 'active',
        sourceGroup: 'sk2',
        slot: 0,
        unlockLevel: 1,
        level: 1,
      },
      {
        skillId: 'b',
        kind: 'active',
        sourceGroup: 'sk2',
        slot: 2,
        unlockLevel: 1,
        level: 1,
      },
    ]

    expect(nextMaintenanceSkillSlot(skills, 'sk2')).toBe(3)
    expect(nextMaintenanceSkillSlot(skills, 'sk0')).toBe(0)
  })
})
