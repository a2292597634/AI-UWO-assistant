import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { buildCatalog, buildDictionaries, buildSkills, buildDetails } from '../../tools/data-pipeline/build-runtime-data'
import type { CanonicalOfficer, CanonicalSkill, DictionaryItem } from '../../tools/import/types'

const readJson = <T>(p: string): T => JSON.parse(readFileSync(p, 'utf8')) as T

// Use Phase 2 canonical fixtures for testing
const officers = readJson<CanonicalOfficer[]>('tests/fixtures/canonical/officers.json')
const skills = readJson<CanonicalSkill[]>('tests/fixtures/canonical/skills.json')
const dictionaries = readJson<Record<string, DictionaryItem[]>>('tests/fixtures/canonical/dictionaries.json')

describe('buildCatalog', () => {
  it('generates compact catalog with skill IDs only', () => {
    const catalog = buildCatalog(officers, skills, dictionaries)

    expect(catalog).toHaveLength(8)

    const first = catalog[0]!
    expect(first.id).toBe('officer_chast089')
    expect(first.name).toBe('達納·卡洛斯')
    expect(first.rarityId).toBeTruthy()
    // Languages are string arrays (short IDs, no prefix)
    expect(typeof first.languages[0]).toBe('string')
    expect(first.languages[0]).not.toContain('language_')
    // Skills are string arrays (just IDs)
    expect(typeof first.activeSkills[0]).toBe('string')
    expect(first.activeSkills[0]).toMatch(/^skill_/)
    expect(first.passiveSkills.length).toBeGreaterThan(0)
  })

  it('converts rarity to star characters', () => {
    const catalog = buildCatalog(officers, skills, dictionaries)
    const r5 = catalog.find((o) => o.rarityId === 'rarity_5')!
    expect(r5.rarityName).toBe('★★★★★')
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
})

describe('buildDictionaries (runtime)', () => {
  it('generates dictionaries with short language IDs', () => {
    const dicts = buildDictionaries(officers, skills, dictionaries)

    expect(dicts.rarities.length).toBeGreaterThan(0)
    const r5 = dicts.rarities.find((r) => r.id === 'rarity_5')
    expect(r5!.name).toBe('★★★★★')
    // Language IDs should be short (no prefix) for runtime
    expect(dicts.languages[0]!.id).not.toContain('language_')
  })
})

describe('buildDetails', () => {
  it('generates compact detail entries with short field names', () => {
    const details = buildDetails(officers, skills, dictionaries)

    expect(Object.keys(details)).toHaveLength(8)
    const officer = details.officer_chast089!
    // Compact fields: n=name, ri=rarityId, ss=skills, rc=recruitment
    expect(officer.n).toBe('達納·卡洛斯')
    expect(officer.ss.length).toBeGreaterThan(0)
    // Skills have compact fields: si=skillId, lv=level, k=kind
    const sk = officer.ss[0]!
    expect(sk.si).toBeTruthy()
    expect(sk.lv).toBeGreaterThanOrEqual(0)
    expect(sk.k).toMatch(/^(active|passive)$/)
    // Recruitment: rc.ci=cityIds, rc.nt=note
    expect(officer.rc).toBeDefined()
    expect(Array.isArray(officer.rc.ci)).toBe(true)
  })
})
