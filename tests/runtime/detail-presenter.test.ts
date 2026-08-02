/**
 * Detail Presenter Tests
 *
 * Pure function tests — no wx, Page, or filesystem dependencies.
 */

import { describe, it, expect } from 'vitest'
import {
  presentDetail,
  emptyDetailState,
} from '../../miniprogram/subpkg-detail/runtime/detail-presenter'
import type { RuntimeDetailRecord } from '../../miniprogram/contracts/runtime-data'
import type { RuntimeSkill } from '../../miniprogram/contracts/runtime-data'

// ── Fixtures ──

const makeRecord = (overrides?: Partial<RuntimeDetailRecord>): RuntimeDetailRecord => ({
  n: '測試航海士',
  rn: 'S',
  vg: 'grade_6',
  ti: 'type_class_2',
  gi: 'gender_f',
  tn: '冒險',
  gn: '女性',
  jn: '探險家',
  nn: '葡萄牙',
  pp: '/subpkg-a0/imgs/officer_test.png',
  ls: [
    { li: 'lang10', lv: 5, n: '葡萄牙語' },
    { li: 'lang30', lv: 3, n: '英語' },
  ],
  ss: [
    {
      si: 'skill_active_1',
      k: 'active',
      ul: 1,
      lv: 10,
      n: '攻擊強化',
      ip: '/subpkg-a0/imgs/skill_active_1.png',
      d: '',
      li: '',
    },
    {
      si: 'skill_passive_1',
      k: 'passive',
      ul: 1,
      lv: 20,
      n: '防禦強化',
      ip: '/subpkg-a1/imgs/skill_passive_1.png',
      d: '',
      li: '',
    },
    {
      si: 'skill_active_2',
      k: 'active',
      ul: 2,
      lv: 50,
      n: '必殺攻擊',
      ip: '/subpkg-a2/imgs/skill_active_2.png',
      d: '',
      li: '',
    },
  ],
  rc: {
    cn: ['里斯本', '波爾圖'],
    rn: null,
    nt: null,
  },
  ...overrides,
})

const makeSkillsBridge = (): Record<string, RuntimeSkill> => ({
  skill_active_1: {
    id: 'skill_active_1',
    n: '攻擊強化',
    cat: 'skill_category_naval_active_enhancement',
    cn: '海戰主動-強化',
    ip: '/subpkg-a0/imgs/skill_active_1.png',
    d: '使砲擊攻擊力增加1％。',
    li: 'Lv1: 1% | Lv2: 2% | Lv3: 3% | Lv4: 4% | Lv5: 5% | Lv6: 6% | Lv7: 7% | Lv8: 8% | Lv9: 9% | Lv10: 10%',
  },
  skill_passive_1: {
    id: 'skill_passive_1',
    n: '防禦強化',
    cat: 'skill_category_naval_passive_defense',
    cn: '海戰被動-防禦',
    ip: '/subpkg-a1/imgs/skill_passive_1.png',
    d: '受到攻擊時，使防禦力增加1％。',
    li: 'Lv1: 1% | Lv2: 2% | Lv3: 3% | Lv4: 4% | Lv5: 5% | Lv6: 6% | Lv7: 7% | Lv8: 8% | Lv9: 9% | Lv10: 10%',
  },
})

// ── Tests ──

describe('presentDetail', () => {
  it('converts a normal detail record to view model', () => {
    const state = presentDetail(makeRecord())

    expect(state.officer).not.toBeNull()
    expect(state.officer!.name).toBe('測試航海士')
    expect(state.officer!.rarityName).toBe('S')
    expect(state.officer!.typeName).toBe('冒險')
    expect(state.officer!.genderName).toBe('女性')
    expect(state.officer!.jobName).toBe('探險家')
    expect(state.officer!.nationalityName).toBe('葡萄牙')
    expect(state.officer!.portraitPath).toBe('/subpkg-a0/imgs/officer_test.png')
    expect(state.officer!.languageSummary).toBe('葡萄牙語 Lv.5、英語 Lv.3')
    expect(state.officer!.visuals).toEqual({
      framePath: '/assets/ui/uwo-bg-grade-6.png',
      rarityIconPath: '/assets/ui/uwo-icon-grade-6.png',
      typeIconPath: '/assets/ui/uwo-icon-class-2.png',
      genderIconPath: '/assets/ui/gender-f.png',
    })
  })

  it('groups active and passive skills correctly', () => {
    const state = presentDetail(makeRecord())

    expect(state.activeSkills).toHaveLength(2)
    expect(state.activeSkills[0]!.skillId).toBe('skill_active_1')
    expect(state.activeSkills[0]!.kind).toBe('active')
    expect(state.activeSkills[1]!.skillId).toBe('skill_active_2')

    expect(state.passiveSkills).toHaveLength(1)
    expect(state.passiveSkills[0]!.skillId).toBe('skill_passive_1')
    expect(state.passiveSkills[0]!.kind).toBe('passive')
  })

  it('builds the shared ten-level skill sheet from the skills bridge', () => {
    const state = presentDetail(makeRecord(), makeSkillsBridge())

    expect(state.activeSkills[0]!.sheet.category).toBe('海戰主動-強化')
    expect(state.activeSkills[0]!.sheet.description).toBe('使砲擊攻擊力增加1％。')
    expect(state.activeSkills[0]!.sheet.levels).toHaveLength(10)
    expect(state.activeSkills[0]!.sheet.levels[9]).toEqual({
      level: 10,
      label: 'Lv.10',
      description: '使砲擊攻擊力增加10％。',
      missing: false,
    })
    expect(state.passiveSkills[0]!.sheet.kindLabel).toBe('被動技能')
    expect(state.passiveSkills[0]!.sheet.category).toBe('海戰被動-防禦')
    expect(state.passiveSkills[0]!.sheet.levels).toHaveLength(10)
  })

  it('handles empty skills array', () => {
    const record = makeRecord({ ss: [] })
    const state = presentDetail(record)

    expect(state.activeSkills).toHaveLength(0)
    expect(state.passiveSkills).toHaveLength(0)
  })

  it('formats recruitment city text with Chinese delimiter', () => {
    const record = makeRecord({
      rc: { cn: ['威尼斯', '熱那亞', '比薩'], rn: null, nt: null },
    })
    const state = presentDetail(record)

    expect(state.officer!.recruitment.cityText).toBe('威尼斯、熱那亞、比薩')
  })

  it('returns "無" for empty recruitment cities', () => {
    const record = makeRecord({
      rc: { cn: [], rn: null, nt: null },
    })
    const state = presentDetail(record)

    expect(state.officer!.recruitment.cityText).toBe('無')
  })

  it('handles null recruitment fields', () => {
    const record = makeRecord({
      rc: { cn: ['里斯本'], rn: 'req_something', nt: 'some_note' },
    })
    const state = presentDetail(record)

    expect(state.officer!.recruitment.requirementName).toBe('req_something')
    expect(state.officer!.recruitment.note).toBe('some_note')
  })

  it('preserves language info correctly', () => {
    const state = presentDetail(makeRecord())

    expect(state.officer!.languages).toHaveLength(2)
    expect(state.officer!.languages[0]!.languageId).toBe('lang10')
    expect(state.officer!.languages[0]!.level).toBe(5)
    expect(state.officer!.languages[0]!.name).toBe('葡萄牙語')
    expect(state.officer!.languages[1]!.languageId).toBe('lang30')
    expect(state.officer!.languages[1]!.level).toBe(3)
  })

  it('sets portraitFail to false by default', () => {
    const state = presentDetail(makeRecord())
    expect(state.portraitFail).toBe(false)
  })

  it('preserves skill unlock levels and icon paths', () => {
    const state = presentDetail(makeRecord())

    const active1 = state.activeSkills.find((s) => s.skillId === 'skill_active_1')
    expect(active1).toBeDefined()
    expect(active1!.unlockLevel).toBe(1)
    expect(active1!.level).toBe(10)
    expect(active1!.iconPath).toBe('/subpkg-a0/imgs/skill_active_1.png')
  })

  it('handles record with empty portrait path', () => {
    const record = makeRecord({ pp: '' })
    const state = presentDetail(record)
    expect(state.officer!.portraitPath).toBe('')
  })
})

describe('emptyDetailState', () => {
  it('returns a safe empty state', () => {
    const state = emptyDetailState()
    expect(state.officer).toBeNull()
    expect(state.portraitFail).toBe(false)
    expect(state.activeSkills).toEqual([])
    expect(state.passiveSkills).toEqual([])
  })
})
