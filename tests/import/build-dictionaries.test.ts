import { describe, expect, it } from 'vitest'
import type { CanonicalOfficer, CanonicalSkill } from '../../tools/import/types'
import { buildDictionaries } from '../../tools/import/build-dictionaries'

// Minimal sample data matching Phase 2 fixtures
const sampleOfficers: CanonicalOfficer[] = [
  {
    id: 'officer_chast089',
    name: '達納·卡洛斯',
    rarityId: 'rarity_5',
    typeId: 'type_class_2',
    genderId: 'gender_f',
    jobId: 'job_jobchasT089',
    nationalityId: 'nationality_ctn_swe',
    languages: [
      { languageId: 'language_lang70', level: 5 },
      { languageId: 'language_lang80', level: 3 },
    ],
    skills: [
      {
        skillId: 'skill_skill100043',
        kind: 'passive',
        sourceGroup: 'sk0',
        slot: 0,
        unlockLevel: 50,
        level: 1,
      },
    ],
    recruitment: {
      cityIds: ['city_town4105'],
      requirementId: 'requirement_reqchasT089',
      requiredOfficerIds: [],
      note: null,
    },
    portraitId: null,
    displayOrder: 1,
    sourceRefs: { voyageTw: 'chasT089' },
  },
]

const sampleSkills: CanonicalSkill[] = [
  {
    id: 'skill_skill100043',
    name: '神之手腕',
    categoryId: 'skill_category_barter',
    description: '以物易物時，可進行更有利的協商。',
    iconId: null,
    sourceRefs: { voyageTw: 'skill100043' },
  },
]

// Mock lang_js[1] entries
const languageMap: Record<string, string> = {
  rank_5: 'rarity_5', // fallback
  '5': 'S',
  class_2: '冒險',
  f: '女性',
  gender_f: '女性',
  jobchasT089: '大商人',
  ctn_swe: '瑞典',
  lang70: '義大利語',
  lang80: '英語',
  town4105: '倫敦',
  reqchasT089: '5000紅鑽購買提督',
  menuskt3: '以物易物相關技能',
}

describe('buildDictionaries', () => {
  it('builds all dictionary groups from officer and skill data', () => {
    const { dictionaries, anomalies } = buildDictionaries(sampleOfficers, sampleSkills, languageMap)

    // Should have all 9 required groups
    expect(dictionaries.rarities).toBeDefined()
    expect(dictionaries.types).toBeDefined()
    expect(dictionaries.genders).toBeDefined()
    expect(dictionaries.jobs).toBeDefined()
    expect(dictionaries.nationalities).toBeDefined()
    expect(dictionaries.languages).toBeDefined()
    expect(dictionaries.cities).toBeDefined()
    expect(dictionaries.requirements).toBeDefined()
    expect(dictionaries.skillCategories).toBeDefined()

    // Verify specific entries
    const rarity5 = dictionaries.rarities!.find((r) => r.id === 'rarity_5')
    expect(rarity5).toBeDefined()
    expect(rarity5!.name).toBe('S')
    expect(rarity5!.sourceRefs.voyageTw).toBe('5')

    const city = dictionaries.cities!.find((c) => c.id === 'city_town4105')
    expect(city).toBeDefined()
    expect(city!.name).toBe('倫敦')

    const lang = dictionaries.languages!.find((l) => l.id === 'language_lang80')
    expect(lang).toBeDefined()
    expect(lang!.name).toBe('英語')

    // No anomalies for clean data
    expect(anomalies).toEqual([])
  })

  it('falls back to grade letters for rarity names', () => {
    const officers: CanonicalOfficer[] = [
      {
        ...sampleOfficers[0]!,
        rarityId: 'rarity_3',
      },
    ]

    const { dictionaries } = buildDictionaries(officers, sampleSkills, {})

    const rarity3 = dictionaries.rarities!.find((r) => r.id === 'rarity_3')
    expect(rarity3!.name).toBe('B')
  })

  it('falls back to canonical ID when no name is found', () => {
    const { dictionaries } = buildDictionaries(sampleOfficers, sampleSkills, {})

    const job = dictionaries.jobs!.find((j) => j.id === 'job_jobchasT089')
    expect(job).toBeDefined()
    // Falls back to the id (or a derived display form)
    expect(job!.name.length).toBeGreaterThan(0)
  })

  it('includes all unique IDs without duplicates', () => {
    // Two officers share the same rarity
    const officers: CanonicalOfficer[] = [
      sampleOfficers[0]!,
      { ...sampleOfficers[0]!, id: 'officer_test2' },
    ]

    const { dictionaries } = buildDictionaries(officers, sampleSkills, languageMap)

    const rarities = dictionaries.rarities!
    expect(rarities.filter((r) => r.id === 'rarity_5')).toHaveLength(1)
  })
})
