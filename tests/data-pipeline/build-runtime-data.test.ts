import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import {
  buildCatalog,
  buildDictionaries,
  buildSkills,
  buildDetails,
  writeShardedDetails,
} from '../../tools/data-pipeline/build-runtime-data'
import type { CanonicalOfficer, CanonicalSkill, DictionaryItem } from '../../tools/import/types'

const readJson = <T>(p: string): T => JSON.parse(readFileSync(p, 'utf8')) as T

// Use Phase 2 canonical fixtures for testing
const officers = readJson<CanonicalOfficer[]>('tests/fixtures/canonical/officers.json')
const skills = readJson<CanonicalSkill[]>('tests/fixtures/canonical/skills.json')
const dictionaries = readJson<Record<string, DictionaryItem[]>>(
  'tests/fixtures/canonical/dictionaries.json',
)

describe('buildCatalog', () => {
  it('generates compact catalog with skill IDs only', () => {
    const catalog = buildCatalog(officers, skills, dictionaries)

    expect(catalog).toHaveLength(8)

    const first = catalog[0]!
    expect(first.id).toBe('officer_chast089')
    expect(first.name).toBe('達納·卡洛斯')
    expect(first.rarityId).toBeTruthy()
    expect(first.visualGradeId).toBe('grade_6')
    // Languages are string arrays (short IDs, no prefix)
    expect(typeof first.languages[0]).toBe('string')
    expect(first.languages[0]).not.toContain('language_')
    // Skills are string arrays (just IDs)
    expect(typeof first.activeSkills[0]).toBe('string')
    expect(first.activeSkills[0]).toMatch(/^skill_/)
    expect(first.passiveSkills.length).toBeGreaterThan(0)
  })

  it('converts rarity to grade letters', () => {
    const catalog = buildCatalog(officers, skills, dictionaries)
    const r5 = catalog.find((o) => o.rarityId === 'rarity_5')!
    expect(r5.rarityName).toBe('S')
    expect(r5.rarityClass).toBe('s')
  })
})

describe('buildSkills', () => {
  it('generates compact skill dict with short keys', () => {
    const runtime = buildSkills(skills, dictionaries)

    expect(Object.keys(runtime).length).toBeGreaterThan(0)
    const firstKey = Object.keys(runtime)[0]!
    const s = runtime[firstKey]!
    expect(s.id).toMatch(/^skill_/)
    expect(s.n).toBeTruthy() // name
    expect(s.ip).toMatch(/^\/subpkg-a\d\/imgs\//) // iconPath in shard
    expect(s.cat).toBeTruthy() // categoryId
  })

  it('projects the skill category display name into each runtime skill', () => {
    const namedDictionaries = {
      ...dictionaries,
      skillCategories: dictionaries.skillCategories!.map((category) =>
        category.id === 'skill_category_trade_price_adjustment'
          ? { ...category, name: '價格調整' }
          : category,
      ),
    }
    const runtime = buildSkills(skills, namedDictionaries)

    expect(runtime.skill_skill200681!.cn).toBe('價格調整')
  })
})

describe('buildDictionaries (runtime)', () => {
  it('generates dictionaries with short language IDs', () => {
    const dicts = buildDictionaries(officers, skills, dictionaries)

    expect(dicts.rarities.length).toBeGreaterThan(0)
    const r5 = dicts.rarities.find((r) => r.id === 'rarity_5')
    expect(r5!.name).toBe('S')
    // Language IDs should be short (no prefix) for runtime
    expect(dicts.languages[0]!.id).not.toContain('language_')
  })
})

describe('buildDetails', () => {
  it('generates compact detail entries with only WXML-used fields', () => {
    const details = buildDetails(officers, skills, dictionaries)

    expect(Object.keys(details)).toHaveLength(8)
    const officer = details.officer_chast089!
    // Compact fields: n=name, rn=rarityName, tn=typeName, etc.
    expect(officer.n).toBe('達納·卡洛斯')
    expect(officer.rn).toBeTruthy()
    expect(officer.vg).toBe('grade_6')
    expect(officer.ti).toBe('type_class_2')
    expect(officer.gi).toBe('gender_f')
    expect(officer.tn).toBeTruthy()
    expect(officer.gn).toBeTruthy()
    expect(officer.jn).toBeTruthy()
    expect(officer.nn).toBeTruthy()
    expect(officer.pp).toMatch(/^\/subpkg-a\d\/imgs\//)
    expect(officer.ss.length).toBeGreaterThan(0)
    // Skills have only essential fields: si, k, ul, lv, ip
    // n/d/li are optional — patched at runtime from shared skills.js
    const sk = officer.ss[0]!
    expect(sk.si).toBeTruthy()
    expect(sk.lv).toBeGreaterThanOrEqual(0)
    expect(sk.k).toMatch(/^(active|passive)$/)
    expect(sk.ip).toMatch(/^\/subpkg-a\d\/imgs\//)
    // Unused fields must NOT be present
    expect((sk as unknown as Record<string, unknown>).sg).toBeUndefined()
    expect((sk as unknown as Record<string, unknown>).sl).toBeUndefined()
    expect((sk as unknown as Record<string, unknown>).cn).toBeUndefined()
    expect((sk as unknown as Record<string, unknown>).ci).toBeUndefined()
    // Recruitment: cn=cityNames, rn=requirementName, nt=note
    expect(officer.rc).toBeDefined()
    expect(Array.isArray(officer.rc.cn)).toBe(true)
    // Unused rc fields must NOT be present
    expect((officer.rc as unknown as Record<string, unknown>).ci).toBeUndefined()
    expect((officer.rc as unknown as Record<string, unknown>).ri).toBeUndefined()
    expect((officer.rc as unknown as Record<string, unknown>).ro).toBeUndefined()
  })
})

describe('writeShardedDetails', () => {
  it('splits officers across 10 shard files', () => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const fs = require('node:fs')
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const path = require('node:path')
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const os = require('node:os')

    const tmpDir = path.join(os.tmpdir(), 'detail-shard-test-' + Date.now())
    fs.mkdirSync(tmpDir, { recursive: true })

    try {
      writeShardedDetails(officers, skills, dictionaries, tmpDir)

      // All 10 shard files should exist
      const allIds = new Set<string>()
      for (let s = 0; s < 10; s++) {
        const filePath = path.join(tmpDir, `details-${s}.js`)
        expect(fs.existsSync(filePath)).toBe(true)

        // eslint-disable-next-line @typescript-eslint/no-require-imports
        const chunk = require(filePath)
        for (const id of Object.keys(chunk)) {
          expect(allIds.has(id)).toBe(false) // no duplicates across shards
          allIds.add(id)
        }
      }

      expect(allIds.size).toBe(8) // all 8 officers distributed
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true })
    }
  })
})
