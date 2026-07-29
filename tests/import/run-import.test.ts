import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { validateCandidates } from '../../tools/import/validate-candidates'
import type { CanonicalOfficer, CanonicalSkill, DictionaryItem } from '../../tools/import/types'

const readJson = <T>(path: string): T => JSON.parse(readFileSync(path, 'utf8')) as T

describe('validateCandidates', () => {
  // Load Phase 2 canonical fixtures for integration testing
  const officers = readJson<CanonicalOfficer[]>('tests/fixtures/canonical/officers.json')
  const skills = readJson<CanonicalSkill[]>('tests/fixtures/canonical/skills.json')
  const dictionaries = readJson<Record<string, DictionaryItem[]>>(
    'tests/fixtures/canonical/dictionaries.json',
  )

  it('accepts Phase 2 canonical fixtures', () => {
    const findings = validateCandidates(officers, skills, dictionaries)
    // Phase 2 fixtures should have no structural issues (reference integrity, uniqueness)
    expect(findings.length).toBeGreaterThanOrEqual(0)
    // No DATA_REFERENCE_MISSING errors
    const refErrors = findings.filter((f) => f.code === 'DATA_REFERENCE_MISSING')
    expect(refErrors).toEqual([])
  })

  it('detects missing skill references', () => {
    const badOfficers: CanonicalOfficer[] = [
      {
        ...officers[0]!,
        skills: [
          {
            skillId: 'skill_nonexistent',
            kind: 'active',
            sourceGroup: 'sk0',
            slot: 0,
            unlockLevel: 1,
            level: 1,
          },
        ],
      },
    ]

    const findings = validateCandidates(badOfficers, skills, dictionaries)
    expect(findings.map((f) => f.code)).toContain('DATA_REFERENCE_MISSING')
  })

  it('detects duplicate languages', () => {
    const badOfficers: CanonicalOfficer[] = [
      {
        ...officers[0]!,
        languages: [
          { languageId: 'language_lang70', level: 5 },
          { languageId: 'language_lang70', level: 3 },
        ],
      },
    ]

    const findings = validateCandidates(badOfficers, skills, dictionaries)
    expect(findings.map((f) => f.code)).toContain('DATA_LANGUAGE_DUPLICATE')
  })

  it('detects officer-shaped city IDs', () => {
    const badOfficers: CanonicalOfficer[] = [
      {
        ...officers[0]!,
        recruitment: { ...officers[0]!.recruitment, cityIds: ['officer_chasT051'] },
      },
    ]

    const findings = validateCandidates(badOfficers, skills, dictionaries)
    expect(findings.map((f) => f.code)).toContain('DATA_CITY_VALUE_REJECTED')
  })

  it('detects duplicate skill slots', () => {
    const badOfficers: CanonicalOfficer[] = [
      {
        ...officers[0]!,
        skills: [
          {
            skillId: 'skill_skill100043',
            kind: 'passive',
            sourceGroup: 'sk0',
            slot: 0,
            unlockLevel: 50,
            level: 1,
          },
          {
            skillId: 'skill_skill100051',
            kind: 'passive',
            sourceGroup: 'sk0',
            slot: 0,
            unlockLevel: 70,
            level: 1,
          },
        ],
      },
    ]

    const findings = validateCandidates(badOfficers, skills, dictionaries)
    expect(findings.map((f) => f.code)).toContain('DATA_SKILL_SLOT_DUPLICATE')
  })

  it('detects missing dictionary references', () => {
    const badOfficers: CanonicalOfficer[] = [
      {
        ...officers[0]!,
        rarityId: 'rarity_999',
      },
    ]

    const findings = validateCandidates(badOfficers, skills, dictionaries)
    expect(findings.map((f) => f.code)).toContain('DATA_REFERENCE_MISSING')
  })
})
