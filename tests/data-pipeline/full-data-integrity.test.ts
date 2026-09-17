import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import {
  buildCatalog,
  buildSkills,
  buildDetails,
  buildFleetOfficers,
  writeShardedDetails,
} from '../../tools/data-pipeline/build-runtime-data'
import type { CanonicalOfficer, CanonicalSkill, DictionaryItem } from '../../tools/import/types'

const readJson = <T>(p: string): T => JSON.parse(readFileSync(p, 'utf8')) as T

// Use full canonical data for integration tests
const officers = readJson<CanonicalOfficer[]>('data/master/officers.json')
const skills = readJson<CanonicalSkill[]>('data/master/skills.json')
const dictionaries = readJson<Record<string, DictionaryItem[]>>('data/master/dictionaries.json')

describe('Full data integrity', () => {
  it('keeps every canonical skill level in the single-digit skill-level range', () => {
    for (const officer of officers) {
      for (const relation of officer.skills) {
        expect(Number.isInteger(relation.level)).toBe(true)
        expect(relation.level).toBeGreaterThanOrEqual(1)
        expect(relation.level).toBeLessThanOrEqual(9)
        expect(Number.isInteger(relation.unlockLevel)).toBe(true)
        expect(relation.unlockLevel).toBeGreaterThanOrEqual(1)
      }
    }
  })

  it('generates a complete fleet officer index with battle-only relations', () => {
    const fleet = buildFleetOfficers(officers, skills, dictionaries)

    expect(fleet).toHaveLength(officers.length)
    expect(new Set(fleet.map((item) => item.id)).size).toBe(officers.length)
    expect(
      fleet.flatMap((item) => item.skills).every((skill) => typeof skill.unlockLevel === 'number'),
    ).toBe(true)
    expect(
      fleet
        .flatMap((item) => item.skills)
        .every(
          (skill) =>
            skill.categoryId.startsWith('skill_category_naval_') ||
            skill.categoryId === 'skill_category_combat_other',
        ),
    ).toBe(true)
  })

  it('generates catalog for all officers', () => {
    const catalog = buildCatalog(officers, skills, dictionaries)
    expect(catalog).toHaveLength(officers.length)
  })

  it('keeps the maintenance-added officer active/passive skills and canonical levels', () => {
    const catalog = buildCatalog(officers, skills, dictionaries)
    const officer = catalog.find((item) => item.id === 'officer_wo_mtttzwza_ecnsvvum')

    expect(officer).toBeDefined()
    expect(officer!.activeSkills).toEqual([
      'skill_skill400591',
      'skill_skill400471',
      'skill_skill300004',
    ])
    expect(officer!.passiveSkills).toHaveLength(11)
    expect(officer!.skillLevels).toEqual({
      skill_skill400471: 2,
      skill_skill200921: 2,
    })
  })

  it('收錄阿爾坎·貝爾達德的截圖資料與天生效果等級', () => {
    const officer = officers.find((item) => item.name === '阿爾坎·貝爾達德')

    expect(officer).toMatchObject({
      id: 'officer_wo_offline_alkan_beldad',
      rarityId: 'rarity_5',
      visualGradeId: 'grade_5',
      typeId: 'type_class_2',
      genderId: 'gender_f',
      jobId: 'job_job21401012',
      nationalityId: 'nationality_ctn_eng',
      recruitment: {
        cityIds: [],
        requirementId: null,
        requiredOfficerIds: [],
        note: null,
      },
    })
    expect(officer?.languages).toEqual([
      { languageId: 'language_lang20', level: 5 },
      { languageId: 'language_lang120', level: 3 },
    ])
    expect(officer?.skills).toEqual([
      {
        skillId: 'skill_skill400581',
        kind: 'active',
        sourceGroup: 'sk2',
        slot: 0,
        unlockLevel: 1,
        level: 1,
      },
      {
        skillId: 'skill_skill400521',
        kind: 'active',
        sourceGroup: 'sk2',
        slot: 1,
        unlockLevel: 50,
        level: 2,
      },
      {
        skillId: 'skill_skill300004',
        kind: 'active',
        sourceGroup: 'sk3',
        slot: 0,
        unlockLevel: 1,
        level: 1,
      },
      {
        skillId: 'skill_skill500796',
        kind: 'passive',
        sourceGroup: 'sk0',
        slot: 0,
        unlockLevel: 10,
        level: 1,
      },
      {
        skillId: 'skill_skill203826',
        kind: 'passive',
        sourceGroup: 'sk0',
        slot: 1,
        unlockLevel: 10,
        level: 1,
      },
      {
        skillId: 'skill_skill200681',
        kind: 'passive',
        sourceGroup: 'sk0',
        slot: 2,
        unlockLevel: 50,
        level: 1,
      },
      {
        skillId: 'skill_skill201101',
        kind: 'passive',
        sourceGroup: 'sk0',
        slot: 3,
        unlockLevel: 50,
        level: 1,
      },
      {
        skillId: 'skill_skill200281',
        kind: 'passive',
        sourceGroup: 'sk0',
        slot: 4,
        unlockLevel: 30,
        level: 1,
      },
      {
        skillId: 'skill_skill210486',
        kind: 'passive',
        sourceGroup: 'sk0',
        slot: 5,
        unlockLevel: 30,
        level: 1,
      },
      {
        skillId: 'skill_skill202646',
        kind: 'passive',
        sourceGroup: 'sk0',
        slot: 6,
        unlockLevel: 70,
        level: 1,
      },
      {
        skillId: 'skill_skill203426',
        kind: 'passive',
        sourceGroup: 'sk0',
        slot: 7,
        unlockLevel: 70,
        level: 2,
      },
      {
        skillId: 'skill_skillT0053',
        kind: 'passive',
        sourceGroup: 'sk5',
        slot: 0,
        unlockLevel: 1,
        level: 1,
      },
      {
        skillId: 'skill_skillT0069',
        kind: 'passive',
        sourceGroup: 'sk5',
        slot: 1,
        unlockLevel: 1,
        level: 1,
      },
      {
        skillId: 'skill_wo_offline_alkan_beldad_secret_processing',
        kind: 'passive',
        sourceGroup: 'sk1',
        slot: 0,
        unlockLevel: 1,
        level: 1,
      },
    ])
  })

  it('收錄佛雷德烈的截圖資料、位置解鎖等級與新天生技能', () => {
    const officer = officers.find((item) => item.name === '佛雷德烈')
    const innateSkill = skills.find((item) => item.name === '有趣的酒鬼')

    expect(officer).toMatchObject({
      id: 'officer_wo_offline_frederick',
      name: '佛雷德烈',
      rarityId: 'rarity_5',
      visualGradeId: 'grade_5',
      typeId: 'type_class_2',
      genderId: 'gender_m',
      jobId: 'job_job21401001',
      nationalityId: 'nationality_ctn_ntc',
      displayOrder: 631,
      recruitment: {
        cityIds: [],
        requirementId: null,
        requiredOfficerIds: [],
        note: null,
      },
    })
    expect(officer?.languages).toEqual([
      { languageId: 'language_lang30', level: 5 },
      { languageId: 'language_lang90', level: 3 },
    ])
    expect(officer?.skills).toEqual([
      {
        skillId: 'skill_skill400591',
        kind: 'active',
        sourceGroup: 'sk2',
        slot: 0,
        unlockLevel: 1,
        level: 1,
      },
      {
        skillId: 'skill_skill400711',
        kind: 'active',
        sourceGroup: 'sk2',
        slot: 1,
        unlockLevel: 50,
        level: 1,
      },
      {
        skillId: 'skill_skill300001',
        kind: 'active',
        sourceGroup: 'sk3',
        slot: 0,
        unlockLevel: 1,
        level: 1,
      },
      {
        skillId: 'skill_skill501356',
        kind: 'passive',
        sourceGroup: 'sk0',
        slot: 0,
        unlockLevel: 10,
        level: 1,
      },
      {
        skillId: 'skill_skill203546',
        kind: 'passive',
        sourceGroup: 'sk0',
        slot: 1,
        unlockLevel: 10,
        level: 1,
      },
      {
        skillId: 'skill_skill200401',
        kind: 'passive',
        sourceGroup: 'sk0',
        slot: 2,
        unlockLevel: 50,
        level: 1,
      },
      {
        skillId: 'skill_skill203566',
        kind: 'passive',
        sourceGroup: 'sk0',
        slot: 3,
        unlockLevel: 50,
        level: 1,
      },
      {
        skillId: 'skill_skillT0207',
        kind: 'passive',
        sourceGroup: 'sk0',
        slot: 4,
        unlockLevel: 30,
        level: 1,
      },
      {
        skillId: 'skill_skill200411',
        kind: 'passive',
        sourceGroup: 'sk0',
        slot: 5,
        unlockLevel: 30,
        level: 1,
      },
      {
        skillId: 'skill_skillT0204',
        kind: 'passive',
        sourceGroup: 'sk0',
        slot: 6,
        unlockLevel: 70,
        level: 1,
      },
      {
        skillId: 'skill_skill203166',
        kind: 'passive',
        sourceGroup: 'sk0',
        slot: 7,
        unlockLevel: 70,
        level: 1,
      },
      {
        skillId: 'skill_skillT0041',
        kind: 'passive',
        sourceGroup: 'sk5',
        slot: 0,
        unlockLevel: 1,
        level: 1,
      },
      {
        skillId: 'skill_skillT0062',
        kind: 'passive',
        sourceGroup: 'sk5',
        slot: 1,
        unlockLevel: 1,
        level: 1,
      },
      {
        skillId: 'skill_wo_offline_frederick_funny_drunk',
        kind: 'passive',
        sourceGroup: 'sk1',
        slot: 0,
        unlockLevel: 1,
        level: 1,
      },
    ])
    expect(innateSkill).toMatchObject({
      id: 'skill_wo_offline_frederick_funny_drunk',
      name: '有趣的酒鬼',
      categoryId: 'skill_category_innate_buff',
      description: '酒類出售溢價增加0.2%。',
      iconId: null,
      sourceRefs: { workOrderId: 'wo_offline_frederick:funny_drunk' },
    })
  })

  it('收錄瑪格麗特·德·帕爾瑪的截圖資料、技能等級與位置解鎖等級', () => {
    const officer = officers.find((item) => item.name === '瑪格麗特·德·帕爾瑪')

    expect(officer).toMatchObject({
      id: 'officer_wo_offline_margareta_di_parma',
      name: '瑪格麗特·德·帕爾瑪',
      rarityId: 'rarity_5',
      visualGradeId: 'grade_5',
      typeId: 'type_class_2',
      genderId: 'gender_f',
      jobId: 'job_job21401012',
      nationalityId: 'nationality_ctn_esp',
      displayOrder: 632,
      recruitment: {
        cityIds: [],
        requirementId: null,
        requiredOfficerIds: [],
        note: null,
      },
      portraitId: null,
      sourceRefs: { workOrderId: 'wo_offline_margareta_di_parma' },
      maintenanceNote: '手動新增 — 2026-09-17',
    })
    expect(officer?.languages).toEqual([
      { languageId: 'language_lang20', level: 5 },
      { languageId: 'language_lang100', level: 3 },
    ])
    expect(officer?.skills).toEqual([
      {
        skillId: 'skill_skill400521',
        kind: 'active',
        sourceGroup: 'sk2',
        slot: 0,
        unlockLevel: 1,
        level: 1,
      },
      {
        skillId: 'skill_skill400581',
        kind: 'active',
        sourceGroup: 'sk2',
        slot: 1,
        unlockLevel: 50,
        level: 2,
      },
      {
        skillId: 'skill_skill300004',
        kind: 'active',
        sourceGroup: 'sk3',
        slot: 0,
        unlockLevel: 1,
        level: 1,
      },
      {
        skillId: 'skill_skill500796',
        kind: 'passive',
        sourceGroup: 'sk0',
        slot: 0,
        unlockLevel: 10,
        level: 1,
      },
      {
        skillId: 'skill_skill203826',
        kind: 'passive',
        sourceGroup: 'sk0',
        slot: 1,
        unlockLevel: 10,
        level: 1,
      },
      {
        skillId: 'skill_skill200681',
        kind: 'passive',
        sourceGroup: 'sk0',
        slot: 2,
        unlockLevel: 50,
        level: 1,
      },
      {
        skillId: 'skill_skill201101',
        kind: 'passive',
        sourceGroup: 'sk0',
        slot: 3,
        unlockLevel: 50,
        level: 1,
      },
      {
        skillId: 'skill_skill500436',
        kind: 'passive',
        sourceGroup: 'sk0',
        slot: 4,
        unlockLevel: 30,
        level: 1,
      },
      {
        skillId: 'skill_skill200281',
        kind: 'passive',
        sourceGroup: 'sk0',
        slot: 5,
        unlockLevel: 30,
        level: 1,
      },
      {
        skillId: 'skill_skill203406',
        kind: 'passive',
        sourceGroup: 'sk0',
        slot: 6,
        unlockLevel: 70,
        level: 2,
      },
      {
        skillId: 'skill_skillT0226',
        kind: 'passive',
        sourceGroup: 'sk0',
        slot: 7,
        unlockLevel: 70,
        level: 1,
      },
      {
        skillId: 'skill_skillT0068',
        kind: 'passive',
        sourceGroup: 'sk5',
        slot: 0,
        unlockLevel: 1,
        level: 1,
      },
      {
        skillId: 'skill_skillT0080',
        kind: 'passive',
        sourceGroup: 'sk5',
        slot: 1,
        unlockLevel: 1,
        level: 1,
      },
    ])
  })

  it('收錄努爾巴努·蘇丹的截圖資料、技能等級與位置解鎖等級', () => {
    const officer = officers.find((item) => item.name === '努爾巴努·蘇丹')

    expect(officer).toMatchObject({
      id: 'officer_wo_offline_nurbanu_sultan',
      name: '努爾巴努·蘇丹',
      rarityId: 'rarity_5',
      visualGradeId: 'grade_5',
      typeId: 'type_class_2',
      genderId: 'gender_f',
      jobId: 'job_job21401014',
      nationalityId: 'nationality_ctn_tur',
      displayOrder: 633,
      recruitment: {
        cityIds: [],
        requirementId: null,
        requiredOfficerIds: [],
        note: null,
      },
      portraitId: null,
      sourceRefs: { workOrderId: 'wo_offline_nurbanu_sultan' },
      maintenanceNote: '手動新增 — 2026-09-17',
    })
    expect(officer?.languages).toEqual([
      { languageId: 'language_lang60', level: 5 },
      { languageId: 'language_lang140', level: 3 },
    ])
    expect(officer?.skills).toEqual([
      {
        skillId: 'skill_skill400631',
        kind: 'active',
        sourceGroup: 'sk2',
        slot: 0,
        unlockLevel: 1,
        level: 1,
      },
      {
        skillId: 'skill_skill400591',
        kind: 'active',
        sourceGroup: 'sk2',
        slot: 1,
        unlockLevel: 50,
        level: 2,
      },
      {
        skillId: 'skill_skill300004',
        kind: 'active',
        sourceGroup: 'sk3',
        slot: 0,
        unlockLevel: 1,
        level: 1,
      },
      {
        skillId: 'skill_skill501046',
        kind: 'passive',
        sourceGroup: 'sk0',
        slot: 0,
        unlockLevel: 10,
        level: 1,
      },
      {
        skillId: 'skill_skill203786',
        kind: 'passive',
        sourceGroup: 'sk0',
        slot: 1,
        unlockLevel: 10,
        level: 1,
      },
      {
        skillId: 'skill_skill200641',
        kind: 'passive',
        sourceGroup: 'sk0',
        slot: 2,
        unlockLevel: 50,
        level: 1,
      },
      {
        skillId: 'skill_skill202586',
        kind: 'passive',
        sourceGroup: 'sk0',
        slot: 3,
        unlockLevel: 50,
        level: 1,
      },
      {
        skillId: 'skill_skill500816',
        kind: 'passive',
        sourceGroup: 'sk0',
        slot: 4,
        unlockLevel: 30,
        level: 1,
      },
      {
        skillId: 'skill_skill210486',
        kind: 'passive',
        sourceGroup: 'sk0',
        slot: 5,
        unlockLevel: 30,
        level: 1,
      },
      {
        skillId: 'skill_skill500776',
        kind: 'passive',
        sourceGroup: 'sk0',
        slot: 6,
        unlockLevel: 70,
        level: 1,
      },
      {
        skillId: 'skill_skill203386',
        kind: 'passive',
        sourceGroup: 'sk0',
        slot: 7,
        unlockLevel: 70,
        level: 2,
      },
      {
        skillId: 'skill_skillT0079',
        kind: 'passive',
        sourceGroup: 'sk5',
        slot: 0,
        unlockLevel: 1,
        level: 1,
      },
      {
        skillId: 'skill_skillT0019',
        kind: 'passive',
        sourceGroup: 'sk5',
        slot: 1,
        unlockLevel: 1,
        level: 1,
      },
    ])
  })

  it('classifies all sk2 medical and repair actions as active', () => {
    const actionCategoryIds = new Set(['skill_category_medicine', 'skill_category_repair'])
    const skillCategories = new Map(skills.map((skill) => [skill.id, skill.categoryId]))
    const misclassified = officers.flatMap((officer) =>
      officer.skills
        .filter(
          (relation) =>
            relation.sourceGroup === 'sk2' &&
            actionCategoryIds.has(skillCategories.get(relation.skillId) ?? '') &&
            relation.kind !== 'active',
        )
        .map((relation) => `${officer.id}/${relation.skillId}`),
    )

    expect(misclassified).toEqual([])
  })

  it('gives 札克·布魯姆 three active skills', () => {
    const catalog = buildCatalog(officers, skills, dictionaries)
    const officer = catalog.find((item) => item.id === 'officer_chacbb042')

    expect(officer).toBeDefined()
    expect(officer!.activeSkills).toHaveLength(3)
    expect(officer!.activeSkills).toContain('skill_skill400441')
  })

  it('all officers have Chinese gender labels (not f/m)', () => {
    const catalog = buildCatalog(officers, skills, dictionaries)
    for (const o of catalog) {
      expect(o.genderLabel).toMatch(/^(女性|男性)$/)
    }
  })

  it('all officer names are trimmed (no leading/trailing whitespace)', () => {
    const catalog = buildCatalog(officers, skills, dictionaries)
    for (const o of catalog) {
      expect(o.name).toBe(o.name.trim())
    }
  })

  it('portrait paths use lowercase canonical IDs', () => {
    const catalog = buildCatalog(officers, skills, dictionaries)
    for (const o of catalog) {
      expect(o.portraitPath).toMatch(/^\/subpkg-assets-\d\/imgs\/officer_[a-z0-9_]+\.png$/)
      // No uppercase in filename portion
      const filename = o.portraitPath.split('/').pop()!
      expect(filename).toBe(filename.toLowerCase())
    }
  })

  it('all skills have valid categoryId (no empty skill_category_ suffix)', () => {
    const runtimeSkills = buildSkills(skills, dictionaries)
    for (const [_id, s] of Object.entries(runtimeSkills)) {
      expect(s.cat).toBeTruthy()
      // Category must not end with bare "skill_category_" (no suffix)
      expect(s.cat).not.toBe('skill_category_')
    }
  })

  it('受影響的提督技能使用官方名稱', () => {
    const runtimeSkills = buildSkills(skills, dictionaries)
    const expectedNames = {
      skill_skillT0218: '高段數',
      skill_skillT0219: '眼光',
      skill_skillT0220: '運用',
      skill_skillT0221: '工匠精神',
      skill_skillT0222: '無痛縫合術',
      skill_skillT0223: '壓迫切除法',
      skill_skillT0224: '印象深刻的商品',
      skill_skillT0225: '急救處方術',
    }

    for (const [skillId, name] of Object.entries(expectedNames)) {
      expect(runtimeSkills[skillId]).toMatchObject({
        n: name,
        cat: 'skill_category_admiral',
        cn: '提督技能',
      })
    }
  })

  it('all active/passive skills exist in skills dictionary', () => {
    const catalog = buildCatalog(officers, skills, dictionaries)
    const runtimeSkills = buildSkills(skills, dictionaries)
    const skillIds = new Set(Object.keys(runtimeSkills))

    for (const o of catalog) {
      for (const sid of o.activeSkills) {
        expect(skillIds.has(sid)).toBe(true)
      }
      for (const sid of o.passiveSkills) {
        expect(skillIds.has(sid)).toBe(true)
      }
    }
  })

  it('active and passive skill arrays are disjoint per officer', () => {
    const catalog = buildCatalog(officers, skills, dictionaries)
    for (const o of catalog) {
      const activeSet = new Set(o.activeSkills)
      for (const sid of o.passiveSkills) {
        expect(activeSet.has(sid)).toBe(false)
      }
    }
  })
})

describe('Detail shard distribution', () => {
  it('distributes all officers across 10 shards with no duplicates', () => {
    const allDetails = buildDetails(officers, skills, dictionaries)
    const allIds = Object.keys(allDetails)
    expect(allIds).toHaveLength(officers.length)

    // Verify shard assignment is deterministic and covers all officers
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const fs = require('node:fs')
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const path = require('node:path')
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const os = require('node:os')

    const tmpDir = path.join(os.tmpdir(), 'full-shard-test-' + Date.now())
    fs.mkdirSync(tmpDir, { recursive: true })

    try {
      writeShardedDetails(officers, skills, dictionaries, tmpDir)

      const seen = new Set<string>()
      const shardCounts: number[] = []

      for (let s = 0; s < 10; s++) {
        const filePath = path.join(tmpDir, `details-${s}.js`)
        expect(fs.existsSync(filePath)).toBe(true)

        // eslint-disable-next-line @typescript-eslint/no-require-imports
        const chunk = require(filePath)
        const ids = Object.keys(chunk)
        shardCounts.push(ids.length)

        for (const id of ids) {
          expect(seen.has(id)).toBe(false)
          seen.add(id)
        }

        // Each shard file should be reasonable size
        const stat = fs.statSync(filePath)
        expect(stat.size).toBeLessThan(340 * 1024) // < 340 KB per shard
      }

      expect(seen.size).toBe(officers.length)

      // Distribution should be reasonably balanced (no shard has < 50 or > 80)
      const maxShard = Math.max(...shardCounts)
      const minShard = Math.min(...shardCounts)
      expect(maxShard - minShard).toBeLessThan(15)
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true })
    }
  })
})

describe('WXML field contract', () => {
  it('detail entries do NOT expose unused fields', () => {
    const details = buildDetails(officers, skills, dictionaries)
    const firstId = Object.keys(details)[0]!
    const d = details[firstId]!

    // These fields should NOT exist (WXML uses activeSkills/passiveSkills arrays, not officer.skills)
    expect((d as unknown as Record<string, unknown>).categoryId).toBeUndefined()
    expect((d as unknown as Record<string, unknown>).slot).toBeUndefined()
    expect((d as unknown as Record<string, unknown>).sourceGroup).toBeUndefined()

    // Recruitment must have cityNames (cn) but NOT old cityIds field
    expect(Array.isArray(d.rc.cn)).toBe(true)
    expect((d.rc as unknown as Record<string, unknown>).ci).toBeUndefined()
    expect((d.rc as unknown as Record<string, unknown>).ri).toBeUndefined()
  })

  it('all detail languages have required fields', () => {
    const details = buildDetails(officers, skills, dictionaries)
    for (const [_id, d] of Object.entries(details)) {
      for (const l of d.ls) {
        expect(l.li).toBeTruthy()
        expect(typeof l.lv).toBe('number')
        expect(l.n).toBeTruthy()
      }
    }
  })

  it('all detail skills have kind field', () => {
    const details = buildDetails(officers, skills, dictionaries)
    for (const [_id, d] of Object.entries(details)) {
      for (const s of d.ss) {
        expect(s.k).toMatch(/^(active|passive)$/)
        expect(s.si).toBeTruthy()
        expect(typeof s.lv).toBe('number')
        expect(Object.prototype.hasOwnProperty.call(s, 'ip')).toBe(false)
      }
    }
  })
})

describe('Catalog-to-details consistency', () => {
  it('catalog and details agree on active/passive classification', () => {
    const catalog = buildCatalog(officers, skills, dictionaries)
    const details = buildDetails(officers, skills, dictionaries)

    for (const o of catalog) {
      const detail = details[o.id]
      expect(detail).toBeDefined()

      // Count active/passive skills from detail (ss has kind field)
      const detailActive = detail.ss
        .filter((s) => s.k === 'active')
        .map((s) => s.si)
        .sort()
      const detailPassive = detail.ss
        .filter((s) => s.k === 'passive')
        .map((s) => s.si)
        .sort()

      // Should match catalog
      expect(o.activeSkills.sort()).toEqual(detailActive)
      expect(o.passiveSkills.sort()).toEqual(detailPassive)
    }
  })
})
