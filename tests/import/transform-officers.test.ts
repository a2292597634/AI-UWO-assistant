import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import type {
  SourceFieldRecord,
  SourceEnumValue,
  SkillMappingRecord,
} from '../../tools/data-audit/types'
import type { SourceOfficer, SourceSkillMetadata } from '../../tools/import/types'
import { transformOfficers } from '../../tools/import/transform-officers'

const readJson = <T>(path: string): T => JSON.parse(readFileSync(path, 'utf8')) as T

// Load Phase 2 inventories
const fieldInventory = readJson<SourceFieldRecord[]>('data/audit/source-field-inventory.json')
const enumInventory = readJson<SourceEnumValue[]>('data/audit/source-enum-inventory.json')
const mappingTable = readJson<SkillMappingRecord[]>('data/audit/skill-group-mapping.json')

// A minimal display name map for testing
const languageMap: Record<string, string> = {
  chasT089: '達納·卡洛斯',
  chasT096: '維托里奧·薩托里',
  chasT098: '穆拉特·雷斯',
  chasT099: '賽莉梅',
  chasT100: '碧安卡·卡佩羅',
  chasT101: '斯佩蘭扎·摩里亞',
  chasab001: '格蕾絲·奧馬利',
  chasab012: '伊歐琳·潘德萊肯',
  skill100043: '神之手腕',
  skill100051: '冷靜的協商',
  skill200681: '工藝品購買折扣',
  skill200921: '探索基礎',
  skill203306: '工業製品出售溢價',
  skill203426: '工藝品出售溢價',
  skill203826: '工藝品交易專業',
  skill500436: '抓住機會',
  skill400581: '額外機動力減少',
  skill400591: '行動封鎖',
  skill300001: '必死攻擊',
  skillT0053: '工藝品購買達人',
  skillT0073: '工藝品出售達人',
  skill400861: '淨化：戰鬥姿勢',
  skill509998139: '愛爾蘭的海盜',
  skill300004: '絕對反擊',
  skill400973: '艦隊突襲',
  skill400974: '深化艦隊衝破',
  skill100063: '報仇的決心',
  skill100064: '嚴寒的風暴',
}

// Minimal skill metadata for the 20 Phase 2 skills
const skillMetadata: Record<string, SourceSkillMetadata> = {
  // sk0 skills
  skill203826: { sourceCategoryId: 'menuskt1', imageOverrideId: null, levelValues: [] },
  skill500436: { sourceCategoryId: 'menuskt13', imageOverrideId: null, levelValues: [] },
  skill200921: { sourceCategoryId: 'menuskt16', imageOverrideId: null, levelValues: [] },
  skill200681: { sourceCategoryId: 'menuskt2', imageOverrideId: null, levelValues: [] },
  skill203306: { sourceCategoryId: 'menuskt2', imageOverrideId: null, levelValues: [] },
  skill203426: { sourceCategoryId: 'menuskt2', imageOverrideId: null, levelValues: [] },
  skill100043: { sourceCategoryId: 'menuskt3', imageOverrideId: null, levelValues: [] },
  skill100051: { sourceCategoryId: 'menuskt3', imageOverrideId: null, levelValues: [] },
  // sk1
  skill509998139: { sourceCategoryId: 'menuskt19', imageOverrideId: null, levelValues: [] },
  // sk2
  skill400581: { sourceCategoryId: 'menuskt11', imageOverrideId: null, levelValues: [] },
  skill400591: { sourceCategoryId: 'menuskt11', imageOverrideId: null, levelValues: [] },
  skill400861: { sourceCategoryId: 'menuskt11', imageOverrideId: null, levelValues: [] },
  // sk3
  skill300001: { sourceCategoryId: 'menuskt22', imageOverrideId: null, levelValues: [] },
  skill300004: { sourceCategoryId: 'menuskt22', imageOverrideId: null, levelValues: [] },
  // sk4
  skill400973: { sourceCategoryId: 'menuskt18', imageOverrideId: null, levelValues: [] },
  skill400974: { sourceCategoryId: 'menuskt18', imageOverrideId: null, levelValues: [] },
  skill100063: { sourceCategoryId: 'menuskt18', imageOverrideId: null, levelValues: [] },
  skill100064: { sourceCategoryId: 'menuskt18', imageOverrideId: null, levelValues: [] },
  // sk5
  skillT0053: { sourceCategoryId: 'menuskt2', imageOverrideId: 'skill200681', levelValues: [] },
  skillT0073: { sourceCategoryId: 'menuskt2', imageOverrideId: 'skill200681', levelValues: [] },
}

describe('transformOfficers', () => {
  it('transforms chasT089 to match the canonical fixture', () => {
    const source: Record<string, SourceOfficer> = {
      chasT089: {
        cht: '達納·卡洛斯',
        rank: '5',
        type: 'class_2',
        job: 'jobchasT089',
        country: 'ctn_swe',
        gender: 'f',
        lang: { lang70: '5', lang80: '3' },
        skill: {
          sk0: {
            skill100043: '50',
            skill100051: '70',
            skill200681: '10',
            skill200921: '30',
            skill203306: '30',
            skill203426: '70',
            skill203826: '10',
            skill500436: '50',
          },
          sk2: { skill400581: '50', skill400591: '1' },
          sk3: { skill300001: '1' },
          sk5: { skillT0053: 1, skillT0073: 1 },
        },
        slv: { skill203426: '2' },
        city: ['town4105', 'town10105', 'town5303', 'town6301', 'town14205'],
        req: 'reqchasT089',
        req_char: 'chasT096',
        note: '5000紅鑽購買提督',
      },
    }

    const { officers, anomalies } = transformOfficers(
      source,
      languageMap,
      skillMetadata,
      fieldInventory,
      enumInventory,
      mappingTable,
    )

    expect(officers).toHaveLength(1)
    const officer = officers[0]!

    // ID and name
    expect(officer.id).toBe('officer_chast089')
    expect(officer.name).toBe('達納·卡洛斯')

    // Dictionary references
    expect(officer.rarityId).toBe('rarity_5')
    expect(officer.typeId).toBe('type_class_2')
    expect(officer.genderId).toBe('gender_f')
    expect(officer.jobId).toBe('job_jobchasT089')
    expect(officer.nationalityId).toBe('nationality_ctn_swe')

    // Languages
    expect(officer.languages).toEqual([
      { languageId: 'language_lang70', level: 5 },
      { languageId: 'language_lang80', level: 3 },
    ])

    // Recruitment
    expect(officer.recruitment.cityIds).toEqual([
      'city_town4105',
      'city_town10105',
      'city_town5303',
      'city_town6301',
      'city_town14205',
    ])
    expect(officer.recruitment.requirementId).toBe('requirement_reqchasT089')
    expect(officer.recruitment.requiredOfficerIds).toEqual(['officer_chast096'])
    expect(officer.recruitment.note).toBe('5000紅鑽購買提督')

    // Skills
    expect(officer.skills.length).toBeGreaterThan(0)
    // Check a specific skill relationship
    const sk0Skill = officer.skills.find((s) => s.skillId === 'skill_skill100043')
    expect(sk0Skill).toBeDefined()
    expect(sk0Skill!.kind).toBe('passive')
    expect(sk0Skill!.sourceGroup).toBe('sk0')
    expect(sk0Skill!.slot).toBeGreaterThanOrEqual(0)

    // Source refs
    expect(officer.sourceRefs.voyageTw).toBe('chasT089')
    expect(officer.displayOrder).toBe(1)

    // No anomalies for this officer
    expect(anomalies).toEqual([])
  })

  it('rejects chasT051 from city IDs', () => {
    const source: Record<string, SourceOfficer> = {
      chasT101: {
        rank: '5',
        type: 'class_3',
        job: 'job21400002',
        country: '',
        gender: 'f',
        lang: { lang140: '3', lang80: '5' },
        skill: { sk3: { skill300004: '1' } },
        city: ['town6301', 'town6201', 'chasT051', 'town8301', 'town7201', 'town7202'],
        req: '',
      },
    }

    const { officers, anomalies } = transformOfficers(
      source,
      languageMap,
      skillMetadata,
      fieldInventory,
      enumInventory,
      mappingTable,
    )

    expect(officers).toHaveLength(1)
    const officer = officers[0]!

    // chasT051 should NOT be in cityIds
    expect(officer.recruitment.cityIds).not.toContain('officer_chast051')
    expect(officer.recruitment.cityIds).not.toContain('city_chast051')
    // But other cities should be present
    expect(officer.recruitment.cityIds).toContain('city_town6301')

    // Anomaly should be recorded
    expect(anomalies.length).toBeGreaterThan(0)
    expect(anomalies[0]!.officerId).toBe('chasT101')
    expect(anomalies[0]!.field).toBe('city')
    expect(anomalies[0]!.value).toBe('chasT051')
  })

  it('handles empty country as nationality_unknown', () => {
    const source: Record<string, SourceOfficer> = {
      chasT100: {
        cht: '碧安卡·卡佩羅',
        rank: '5',
        type: 'class_2',
        job: 'job21401015',
        country: '',
        gender: 'f',
        lang: { lang40: '3', lang80: '5' },
        skill: { sk2: { skill400591: '50' }, sk3: { skill300001: '1' } },
        city: ['town6301'],
        req: '',
      },
    }

    const { officers } = transformOfficers(
      source,
      languageMap,
      skillMetadata,
      fieldInventory,
      enumInventory,
      mappingTable,
    )

    expect(officers[0]!.nationalityId).toBe('nationality_unknown')
  })

  it('falls back to lang_js[1] when cht is missing', () => {
    const source: Record<string, SourceOfficer> = {
      chasab012: {
        rank: '5',
        type: 'class_3',
        job: 'jobchasab012',
        country: 'ctn_pdg',
        gender: 'f',
        lang: { lang20: '3' },
        skill: { sk3: { skill300001: null }, sk4: { skill100063: '1', skill100064: '60' } },
        city: [],
        req: '',
        slv: { skill100064: '60' },
      },
    }

    const { officers } = transformOfficers(
      source,
      languageMap,
      skillMetadata,
      fieldInventory,
      enumInventory,
      mappingTable,
    )

    expect(officers[0]!.name).toBe('伊歐琳·潘德萊肯')
  })

  it('flags unknown enum values as warnings', () => {
    const source: Record<string, SourceOfficer> = {
      chasX001: {
        cht: '測試',
        rank: '99',
        type: 'class_99',
        job: 'unknown_job',
        country: 'unknown',
        gender: 'x',
        lang: {},
        skill: {},
        city: [],
        req: '',
      },
    }

    const { anomalies } = transformOfficers(
      source,
      languageMap,
      skillMetadata,
      fieldInventory,
      enumInventory,
      mappingTable,
    )

    // Should have warnings for unknown enum values
    const unknownAnomalies = anomalies.filter((a) => a.disposition === 'warning')
    expect(unknownAnomalies.length).toBeGreaterThan(0)
  })
})
