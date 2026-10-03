import { getCatalog, getSkills } from '../../miniprogram/runtime/main-data-store'
/**
 * Catalog Presenter Tests
 */

import { describe, it, expect } from 'vitest'
import {
  enrichCatalogWithIcons,
  buildViewMaps,
  preservePortraitFails,
  createCatalogPageData,
  buildCatalogFilterOptions,
  PAGE_SIZE,
  buildSkillCheckList,
  filterSkillCheckList,
  getOfficersForSkill,
} from '../../miniprogram/presenters/catalog-presenter'
import { buildOfficerVisuals } from '../../miniprogram/presenters/officer-visuals'
import type { RuntimeCatalogEntry, RuntimeSkill } from '../../miniprogram/contracts/runtime-data'
import { createEmptyFilterState } from '../../miniprogram/domain/filter-state'

// ── Fixtures ──

const makeEntry = (id: string, overrides?: Partial<RuntimeCatalogEntry>): RuntimeCatalogEntry => ({
  id,
  name: `Test ${id}`,
  rarityId: 'rarity_5',
  rarityName: 'S',
  rarityClass: 's',
  visualGradeId: 'grade_6',
  typeId: 'type_class_1',
  typeName: '冒險',
  genderId: 'gender_m',
  genderLabel: '男性',
  jobId: 'job_test',
  jobName: '測試',
  portraitPath: '/a.png',
  languages: [],
  activeSkills: ['skill_a'],
  passiveSkills: ['skill_p'],
  searchAliases: [],
  ...overrides,
})

const makeSkills = (): Record<string, RuntimeSkill> => ({
  skill_a: {
    id: 'skill_a',
    n: '攻擊',
    cat: 'cat_combat',
    cn: '戰鬥',
    ip: '/icons/a.png',
    d: '',
    li: '',
  },
  skill_p: {
    id: 'skill_p',
    n: '防禦',
    cat: 'cat_def',
    cn: '防禦',
    ip: '/icons/p.png',
    d: '',
    li: '',
  },
})

const makeRow = (id: string) => ({
  ...makeEntry(id),
  visuals: {
    framePath: '/assets/ui/uwo-bg-grade-6.png',
    rarityIconPath: '/assets/ui/uwo-icon-grade-6.png',
    typeIconPath: '/assets/ui/uwo-icon-class-1.png',
    genderIconPath: '/assets/ui/gender-m.png',
  },
  activeSkillIcons: {},
  passiveSkillIcons: {},
  activeSkillNames: {},
  passiveSkillNames: {},
  activeSkillCategories: {},
  passiveSkillCategories: {},
})

// ── Tests ──

describe('enrichCatalogWithIcons', () => {
  it('projects local officer visual paths onto each row', () => {
    const result = enrichCatalogWithIcons(
      [makeEntry('001', { typeId: 'type_class_2', genderId: 'gender_f' })],
      makeSkills(),
    )

    expect(result[0]!.visuals).toEqual({
      framePath: '/assets/ui/uwo-bg-grade-6.png',
      rarityIconPath: '/assets/ui/uwo-icon-grade-6.png',
      typeIconPath: '/assets/ui/uwo-icon-class-2.png',
      genderIconPath: '/assets/ui/gender-f.png',
    })
  })

  it('adds activeSkillIcons and passiveSkillIcons to each entry', () => {
    const catalog = [makeEntry('001')]
    const result = enrichCatalogWithIcons(catalog, makeSkills())

    expect(result[0]!.activeSkillIcons).toEqual({ skill_a: '/icons/a.png' })
    expect(result[0]!.passiveSkillIcons).toEqual({ skill_p: '/icons/p.png' })
  })

  it('adds skill names and categories for active and passive skills', () => {
    const result = enrichCatalogWithIcons([makeEntry('001')], makeSkills())

    expect(result[0]!.activeSkillNames).toEqual({ skill_a: '攻擊' })
    expect(result[0]!.passiveSkillNames).toEqual({ skill_p: '防禦' })
    expect(result[0]!.activeSkillCategories).toEqual({ skill_a: '戰鬥' })
    expect(result[0]!.passiveSkillCategories).toEqual({ skill_p: '防禦' })
  })

  it('handles missing skill references with empty string', () => {
    const catalog = [makeEntry('001', { activeSkills: ['skill_nonexistent'] })]
    const result = enrichCatalogWithIcons(catalog, makeSkills())

    expect(result[0]!.activeSkillIcons).toEqual({ skill_nonexistent: '' })
  })

  it('uses empty metadata for missing skill references', () => {
    const result = enrichCatalogWithIcons(
      [makeEntry('001', { activeSkills: ['skill_missing'], passiveSkills: ['skill_missing'] })],
      makeSkills(),
    )

    expect(result[0]!.activeSkillNames).toEqual({ skill_missing: '' })
    expect(result[0]!.activeSkillCategories).toEqual({ skill_missing: '' })
    expect(result[0]!.passiveSkillNames).toEqual({ skill_missing: '' })
    expect(result[0]!.passiveSkillCategories).toEqual({ skill_missing: '' })
  })

  it('handles empty skill arrays', () => {
    const catalog = [makeEntry('001', { activeSkills: [], passiveSkills: [] })]
    const result = enrichCatalogWithIcons(catalog, makeSkills())

    expect(result[0]!.activeSkillIcons).toEqual({})
    expect(result[0]!.passiveSkillIcons).toEqual({})
  })

  it('does not modify input entries', () => {
    const catalog = [makeEntry('001')]
    const snapshot = JSON.stringify(catalog)
    enrichCatalogWithIcons(catalog, makeSkills())
    expect(JSON.stringify(catalog)).toBe(snapshot)
  })

  it('returns same number of entries', () => {
    const catalog = [makeEntry('001'), makeEntry('002'), makeEntry('003')]
    const result = enrichCatalogWithIcons(catalog, makeSkills())
    expect(result).toHaveLength(3)
  })
})

describe('buildOfficerVisuals', () => {
  it('builds known officer visual paths from compact IDs', () => {
    expect(
      buildOfficerVisuals({
        visualGradeId: 'grade_6',
        typeId: 'type_class_2',
        genderId: 'gender_f',
      }),
    ).toEqual({
      framePath: '/assets/ui/uwo-bg-grade-6.png',
      rarityIconPath: '/assets/ui/uwo-icon-grade-6.png',
      typeIconPath: '/assets/ui/uwo-icon-class-2.png',
      genderIconPath: '/assets/ui/gender-f.png',
    })
  })

  it('returns blank icon paths for unknown type and gender IDs', () => {
    const visuals = buildOfficerVisuals({
      visualGradeId: 'grade_5',
      typeId: 'type_unknown',
      genderId: 'gender_unknown',
    })

    expect(visuals.typeIconPath).toBe('')
    expect(visuals.genderIconPath).toBe('')
  })
})

describe('buildCatalogFilterOptions', () => {
  it('projects rarity dictionaries to cropped local filter icons and accessible labels', () => {
    const options = buildCatalogFilterOptions(
      [
        { id: 'rarity_5', name: 'S' },
        { id: 'rarity_2', name: 'C' },
      ],
      'rarity',
    )

    expect(options).toEqual([
      {
        id: 'rarity_5',
        name: 'S',
        iconPath: '/assets/ui/uwo-icon-grade-5-filter.png',
        accessibilityLabel: '稀有度 S',
      },
      {
        id: 'rarity_2',
        name: 'C',
        iconPath: '/assets/ui/uwo-icon-grade-2-filter.png',
        accessibilityLabel: '稀有度 C',
      },
    ])
  })

  it('projects type and gender dictionaries to local icons without losing accessible names', () => {
    expect(buildCatalogFilterOptions([{ id: 'type_class_2', name: '交易' }], 'type')).toEqual([
      {
        id: 'type_class_2',
        name: '交易',
        iconPath: '/assets/ui/uwo-icon-class-2.png',
        accessibilityLabel: '類型 交易',
      },
    ])
    expect(buildCatalogFilterOptions([{ id: 'gender_f', name: '女性' }], 'gender')).toEqual([
      {
        id: 'gender_f',
        name: '女性',
        iconPath: '/assets/ui/gender-f.png',
        accessibilityLabel: '性別 女性',
      },
    ])
  })
})

describe('buildViewMaps', () => {
  it('creates boolean maps for all selected filters', () => {
    const state = {
      ...createEmptyFilterState(),
      selectedRarities: ['rarity_5'],
      selectedTypes: ['type_class_1'],
    }
    const maps = buildViewMaps(state)

    expect(maps.selectedRarityMap).toEqual({ rarity_5: true })
    expect(maps.selectedTypeMap).toEqual({ type_class_1: true })
    expect(maps.selectedGenderMap).toEqual({})
    expect(maps.selectedLanguageMap).toEqual({})
    expect(maps).not.toHaveProperty('selectedJobMap')
    expect(maps.selectedSkillCategoryMap).toEqual({})
  })

  it('handles multiple selected values', () => {
    const state = {
      ...createEmptyFilterState(),
      selectedGenders: ['gender_m', 'gender_f'],
    }
    const maps = buildViewMaps(state)
    expect(maps.selectedGenderMap).toEqual({ gender_m: true, gender_f: true })
  })

  it('returns empty maps for empty filter state', () => {
    const maps = buildViewMaps(createEmptyFilterState())
    expect(maps.selectedRarityMap).toEqual({})
    expect(maps.selectedTypeMap).toEqual({})
  })
})

describe('preservePortraitFails', () => {
  it('preserves portraitFail flags from old rows', () => {
    const newRows = [makeRow('001'), makeRow('002')]
    const oldRows = [{ ...makeRow('001'), portraitFail: true }]

    const result = preservePortraitFails(newRows, oldRows)
    expect(result[0]!.portraitFail).toBe(true)
    expect(result[1]!.portraitFail).toBeUndefined()
  })

  it('handles empty old rows', () => {
    const newRows = [makeRow('001')]
    const result = preservePortraitFails(newRows, [])
    expect(result[0]!.portraitFail).toBeUndefined()
  })

  it('preserves independent decoration failure flags', () => {
    const newRows = [makeRow('001')]
    const oldRows = [
      {
        ...makeRow('001'),
        frameFail: true,
        rarityIconFail: true,
        typeIconFail: true,
      },
    ]

    expect(preservePortraitFails(newRows, oldRows)[0]).toMatchObject({
      frameFail: true,
      rarityIconFail: true,
      typeIconFail: true,
    })
  })
})

describe('createCatalogPageData', () => {
  it('creates page data with correct structure', () => {
    const rows = [makeRow('001')]
    const state = createEmptyFilterState()
    const data = createCatalogPageData(rows, 1, state, false)

    expect(data.visibleRows).toBe(rows)
    expect(data.filterCount).toBe(1)
    expect(data.hasMore).toBe(false)
    expect(data.activeFilter).toBe('all')
    expect(data.searchText).toBe('')
  })
})

describe('PAGE_SIZE', () => {
  it('is 30', () => {
    expect(PAGE_SIZE).toBe(30)
  })
})

describe('技能關係 kind 完整投影', () => {
  const mixedFixture = () => {
    const base = getCatalog()[0]!
    const skills = getSkills()
    const sid = Object.keys(skills)[0]!
    const catalog: RuntimeCatalogEntry[] = [
      { ...base, id: 'officer_a', activeSkills: [sid], passiveSkills: [] },
      { ...base, id: 'officer_b', activeSkills: [], passiveSkills: [sid] },
    ]
    return { sid, skills, catalog }
  }
  it('同技能主被動各一位：all 只列一次且 union 計數；kind 篩選與展開均獨立', () => {
    const { sid, skills, catalog } = mixedFixture()
    const rows = buildSkillCheckList(catalog, skills)
    expect(rows).toHaveLength(1)
    expect(rows[0]).toMatchObject({
      kind: 'mixed',
      kindLabel: '主及被',
      officerCount: 2,
      officerCountByKind: { active: 1, passive: 1 },
    })
    for (const [kind, label, owner] of [
      ['active', '主', 'officer_a'],
      ['passive', '被', 'officer_b'],
    ] as const) {
      expect(filterSkillCheckList(rows, kind, [], '')[0]).toMatchObject({
        kind,
        kindLabel: label,
        officerCount: 1,
      })
      expect(getOfficersForSkill(sid, catalog, kind).map(({ officerId }) => officerId)).toEqual([
        owner,
      ])
    }
    expect(
      getOfficersForSkill(sid, catalog)
        .map(({ officerId }) => officerId)
        .sort(),
    ).toEqual(['officer_a', 'officer_b'])
  })
  it('同 owner 兩種kind與重複關係各自去重，union 不能加總', () => {
    const { sid, skills, catalog } = mixedFixture()
    catalog.push({
      ...catalog[0]!,
      id: 'officer_c',
      activeSkills: [sid, sid],
      passiveSkills: [sid, sid],
    })
    const rows = buildSkillCheckList(catalog, skills)
    expect(rows[0]).toMatchObject({
      kind: 'mixed',
      officerCount: 3,
      officerCountByKind: { active: 2, passive: 2 },
    })
    expect(filterSkillCheckList(rows, 'active', [], '')[0]!.officerCount).toBe(2)
    expect(filterSkillCheckList(rows, 'passive', [], '')[0]!.officerCount).toBe(2)
    expect(getOfficersForSkill(sid, catalog).map(({ officerId }) => officerId)).toHaveLength(3)
  })
  it('篩選回傳投影副本且保留category/text AND；all→passive→active 不改完整清單', () => {
    const { skills, catalog } = mixedFixture()
    const rows = buildSkillCheckList(catalog, skills)
    const before = structuredClone(rows)
    const all = filterSkillCheckList(rows, 'all', [], '')
    const passive = filterSkillCheckList(rows, 'passive', [rows[0]!.categoryId], rows[0]!.name)
    const active = filterSkillCheckList(rows, 'active', [], '')
    expect(all).not.toBe(rows)
    expect(all[0]).not.toBe(rows[0])
    expect(passive[0]).not.toBe(rows[0])
    expect(active[0]).not.toBe(rows[0])
    passive[0]!.officerCountByKind.passive = 99
    expect(rows).toEqual(before)
    expect(filterSkillCheckList(rows, 'passive', ['不存在分類'], '')).toEqual([])
    expect(filterSkillCheckList(rows, 'passive', [], '不存在技能文字')).toEqual([])
    expect(filterSkillCheckList(rows, 'all', [], '')[0]!.kind).toBe('mixed')
  })
})
