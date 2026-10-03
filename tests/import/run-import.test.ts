import { createHash } from 'node:crypto'
import { runImport } from '../../tools/import/run-import'
import { mkdtempSync, writeFileSync, rmSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
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

describe('完整離線匯入編排', () => {
  const raw = (city: string[] = []) =>
    `var json_char=${JSON.stringify({ chasT089: { cht: '達納', rank: '5', type: 'class_2', job: 'jobchasT089', country: 'ctn_swe', gender: 'f', lang: { lang70: '1' }, skill: { sk2: { skill400581: '50' } }, city, req: '' } })}; var skill_arr=${JSON.stringify({ skill400581: { t: 'menuskt11', d: [['1%'], ['2%']] } })};`
  const langRanges = [
    'lang_js[1]={"skill400581":"測試技能","skill400581des":"技能說明","menuskt11":"海戰強化"};',
  ]
  it.each([
    'archive',
    'archive/forbidden-candidate',
    'data/master',
    'data/master/forbidden-candidate',
    'data',
    '.',
  ])('拒絕受保護的候選輸出 %s', async (outputDir) => {
    await expect(
      runImport({ rawSource: { jsonCharSource: '', langRanges }, outputDir }),
    ).rejects.toThrow('候選輸出禁止寫入')
  })
  const protectedPaths = [
    'archive/voyage-tw-2026052501/raw-data/json_char.js',
    'data/master/officers.json',
    'data/master/custom-officers.json',
    'data/master/skills.json',
    'data/master/dataset.json',
  ]
  const protectedBytes = () =>
    protectedPaths.map((path) => createHash('sha256').update(readFileSync(path)).digest('hex'))
  it('parse→transform→嚴格Schema→引用→write 零錯誤並保留levelInfo', async () => {
    const before = protectedBytes()
    const dir = mkdtempSync(join(tmpdir(), 'uwo-offline-import-'))
    try {
      const result = await runImport({
        rawSource: { jsonCharSource: raw(), langRanges },
        outputDir: join(dir, 'candidate'),
      })
      expect(result.report.findings.filter((item) => item.severity === 'error')).toEqual([])
      expect(result.output.skills[0].levelInfo).toBe('Lv1: 1% | Lv2: 2%')
      expect(readJson<CanonicalSkill[]>(join(dir, 'candidate/skills.json'))[0].levelInfo).toBe(
        result.output.skills[0].levelInfo,
      )
      expect(readdirSync(dir)).toEqual(['candidate'])
      expect(protectedBytes()).toEqual(before)
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })
  it('未決來源值在寫入前失敗，舊候選完整保留', async () => {
    const before = protectedBytes()
    const dir = mkdtempSync(join(tmpdir(), 'uwo-offline-import-failed-'))
    try {
      writeFileSync(join(dir, 'skills.json'), '既有候選')
      await expect(
        runImport({ rawSource: { jsonCharSource: raw(['chasT051']), langRanges }, outputDir: dir }),
      ).rejects.toThrow('IMPORT_VALIDATION_FAILED')
      expect(readFileSync(join(dir, 'skills.json'), 'utf8')).toBe('既有候選')
      expect(readdirSync(dir)).toEqual(['skills.json'])
      expect(protectedBytes()).toEqual(before)
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })
})
