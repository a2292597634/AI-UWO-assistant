import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { sourceConfig } from '../../tools/data-audit/source-config'
import {
  type CanonicalDataset,
  validateCanonicalDataset,
} from '../../tools/data-audit/validate-canonical-dataset'

const readJson = <T>(path: string): T => JSON.parse(readFileSync(path, 'utf8')) as T

const readCanonicalDataset = (): CanonicalDataset => ({
  dataset: readJson('tests/fixtures/canonical/dataset.json'),
  officers: readJson('tests/fixtures/canonical/officers.json'),
  skills: readJson('tests/fixtures/canonical/skills.json'),
  dictionaries: readJson('tests/fixtures/canonical/dictionaries.json'),
  assets: readJson('tests/fixtures/canonical/assets.json'),
  skillIconResolutions: readJson('tests/fixtures/source-audit/skill-icon-resolutions.json'),
  portraitResolutions: readJson('tests/fixtures/source-audit/portrait-resolutions.json'),
})

const clone = <T>(value: T): T => structuredClone(value)

describe('canonical data relationships', () => {
  it('accepts the representative canonical dataset', () => {
    expect(validateCanonicalDataset(readCanonicalDataset())).toEqual([])
  })

  it('preserves the approved representative transformations and exact selection', () => {
    const canonical = readCanonicalDataset()
    const bySourceId = new Map(
      canonical.officers.map((officer) => [officer.sourceRefs.voyageTw, officer]),
    )

    expect(canonical.officers).toHaveLength(8)
    expect(canonical.skills).toHaveLength(20)
    expect(bySourceId.get('chasT096')?.name).toBe('維托里奧·薩托里')
    expect(bySourceId.get('chasab001')?.name).toBe('格蕾絲·奧馬利')
    expect(bySourceId.get('chasT101')).toMatchObject({
      recruitment: {
        cityIds: expect.not.arrayContaining(['officer_chast051']),
        requiredOfficerIds: [],
      },
      maintenanceNote:
        'Rejected source city value chasT051 because it is an officer-shaped ID; it is neither a city nor an inferred prerequisite.',
    })
  })

  it.each([
    ['broken-skill-reference.json', 'DATA_REFERENCE_MISSING'],
    ['duplicate-language.json', 'DATA_LANGUAGE_DUPLICATE'],
    ['duplicate-skill-slot.json', 'DATA_SKILL_SLOT_DUPLICATE'],
    ['count-mismatch.json', 'DATA_COUNT_MISMATCH'],
  ])('rejects only the intended defect in %s', (fixture, code) => {
    const invalid = readJson<CanonicalDataset>(`tests/fixtures/invalid/${fixture}`)

    expect(validateCanonicalDataset(invalid).map((finding) => finding.code)).toEqual([code])
  })

  it('blocks coordinated count changes and source substitutions from the approved selection', () => {
    const countChanged = clone(readCanonicalDataset())
    countChanged.officers.pop()
    countChanged.dataset.counts.officers--

    const substituted = clone(readCanonicalDataset())
    substituted.skills[0]!.sourceRefs.voyageTw = 'skill_unapproved'

    expect(validateCanonicalDataset(countChanged).map((finding) => finding.code)).toContain(
      'DATA_SELECTION_MISMATCH',
    )
    expect(validateCanonicalDataset(substituted).map((finding) => finding.code)).toContain(
      'DATA_SELECTION_MISMATCH',
    )
    expect(sourceConfig.officerIds).toHaveLength(8)
    expect(sourceConfig.skillIds).toHaveLength(20)
  })

  it('requires deterministic resolution evidence for every nullable asset ID', () => {
    const missingSkillResolution = clone(readCanonicalDataset())
    const nullIconSkill = missingSkillResolution.skills.find((skill) => skill.iconId === null)
    if (nullIconSkill === undefined) throw new Error('fixture requires a nullable skill icon')
    missingSkillResolution.skillIconResolutions =
      missingSkillResolution.skillIconResolutions.filter(
        (resolution) => resolution.ownerSourceId !== nullIconSkill.sourceRefs.voyageTw,
      )

    const missingPortraitResolution = clone(readCanonicalDataset())
    const nullPortraitOfficer = missingPortraitResolution.officers.find(
      (officer) => officer.portraitId === null,
    )
    if (nullPortraitOfficer === undefined) throw new Error('fixture requires a nullable portrait')
    missingPortraitResolution.portraitResolutions =
      missingPortraitResolution.portraitResolutions.filter(
        (resolution) => resolution.ownerSourceId !== nullPortraitOfficer.sourceRefs.voyageTw,
      )

    expect(
      validateCanonicalDataset(missingSkillResolution).map((finding) => finding.code),
    ).toContain('DATA_ASSET_RESOLUTION_MISSING')
    expect(
      validateCanonicalDataset(missingPortraitResolution).map((finding) => finding.code),
    ).toContain('DATA_ASSET_RESOLUTION_MISSING')
  })

  it('blocks broken non-null asset references and unapproved officer-shaped cities', () => {
    const brokenAsset = clone(readCanonicalDataset())
    const observedSkill = brokenAsset.skills.find((skill) => skill.iconId !== null)
    if (observedSkill === undefined) throw new Error('fixture requires an observed skill icon')
    observedSkill.iconId = 'asset_missing'

    const invalidCity = clone(readCanonicalDataset())
    invalidCity.officers[0]?.recruitment.cityIds.push('officer_chast051')

    expect(validateCanonicalDataset(brokenAsset).map((finding) => finding.code)).toContain(
      'DATA_REFERENCE_MISSING',
    )
    expect(validateCanonicalDataset(invalidCity).map((finding) => finding.code)).toContain(
      'DATA_CITY_VALUE_REJECTED',
    )
  })

  it('blocks duplicate or unknown resolution records and aliases at any depth', () => {
    const duplicateResolution = clone(readCanonicalDataset())
    const firstResolution = duplicateResolution.skillIconResolutions[0]
    if (firstResolution === undefined) throw new Error('fixture requires skill resolutions')
    duplicateResolution.skillIconResolutions.push(firstResolution)

    const unknownResolution = clone(readCanonicalDataset())
    unknownResolution.portraitResolutions.push({
      ownerSourceId: 'unknown-officer',
      resolvedImageId: 'unknown-officer',
      url: 'https://voyage.tw/img/char/uwo_unknown-officer.png',
      sourceRef: 'data/audit/sample-selection.json#officerIds',
      rule: 'Use the selected officer source ID as the voyage.tw portrait image ID.',
    })

    const alias = clone(readCanonicalDataset()) as CanonicalDataset & {
      extra?: { aliases: string[] }
    }
    alias.extra = { aliases: [] }

    expect(
      validateCanonicalDataset(duplicateResolution).map((finding) => finding.code),
    ).toContain('DATA_ASSET_RESOLUTION_DUPLICATE')
    expect(validateCanonicalDataset(unknownResolution).map((finding) => finding.code)).toContain(
      'DATA_ASSET_RESOLUTION_UNKNOWN',
    )
    expect(validateCanonicalDataset(alias).map((finding) => finding.code)).toContain(
      'DATA_ALIAS_FORBIDDEN',
    )
  })
})
