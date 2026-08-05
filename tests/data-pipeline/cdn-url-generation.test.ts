import { describe, expect, it } from 'vitest'
import {
  buildCatalog,
  buildDetails,
  buildSkills,
  type RuntimeAssetUrlManifest,
} from '../../tools/data-pipeline/build-runtime-data'
import { buildAssetDependencyIndex } from '../../tools/data-pipeline/asset-dependencies'
import type { CanonicalOfficer, CanonicalSkill, DictionaryItem } from '../../tools/import/types'

const officer = (id: string): CanonicalOfficer => ({
  id,
  name: '測試航海士',
  rarityId: 'rarity_5',
  visualGradeId: 'grade_5',
  typeId: 'type_class_1',
  genderId: 'gender_m',
  jobId: 'job_1',
  nationalityId: 'nationality_1',
  languages: [],
  skills: [
    {
      skillId: 'skill_active',
      kind: 'active',
      sourceGroup: 'sk0',
      slot: 0,
      unlockLevel: 1,
      level: 1,
    },
    {
      skillId: 'skill_passive',
      kind: 'passive',
      sourceGroup: 'sk1',
      slot: 0,
      unlockLevel: 1,
      level: 1,
    },
  ],
  recruitment: { cityIds: [], requirementId: null, requiredOfficerIds: [], note: null },
  portraitId: null,
  displayOrder: 0,
  sourceRefs: { voyageTw: 'fixture' },
})

const skill = (id: string): CanonicalSkill => ({
  id,
  name: id,
  categoryId: 'skill_category_naval_active_cannon',
  description: '',
  levelInfo: '',
  iconId: null,
  sourceRefs: { voyageTw: 'fixture' },
})

const dictionaries: Record<string, DictionaryItem[]> = {
  types: [
    { id: 'type_class_1', name: '冒險', displayOrder: 0, sourceRefs: { voyageTw: 'fixture' } },
  ],
  genders: [{ id: 'gender_m', name: '男性', displayOrder: 0, sourceRefs: { voyageTw: 'fixture' } }],
  jobs: [{ id: 'job_1', name: '測試職業', displayOrder: 0, sourceRefs: { voyageTw: 'fixture' } }],
  nationalities: [
    { id: 'nationality_1', name: '測試國籍', displayOrder: 0, sourceRefs: { voyageTw: 'fixture' } },
  ],
  skillCategories: [
    {
      id: 'skill_category_naval_active_cannon',
      name: '炮術',
      displayOrder: 0,
      sourceRefs: { voyageTw: 'fixture' },
    },
  ],
}

const manifest: RuntimeAssetUrlManifest = {
  releaseId: '1.0.0-aaaaaaaaaaaa',
  cdnOrigin: 'https://uwo-prod-123.tcb.qcloud.la',
  assets: ['officer_test.png', 'skill_active.png', 'skill_passive.png'].map((filename) => ({
    filename,
    publicUrl: `https://uwo-prod-123.tcb.qcloud.la/assets/1.0.0-aaaaaaaaaaaa/${filename}`,
  })),
}

const dependencies = () =>
  buildAssetDependencyIndex(
    [officer('officer_test')],
    [skill('skill_active'), skill('skill_passive')],
    {
      assetFilenames: new Set(['skill_active.png', 'skill_passive.png']),
    },
  )

describe('generated CDN image URLs', () => {
  it('uses the current release public URL for catalog, skills and detail output', () => {
    const index = dependencies()
    const catalog = buildCatalog(
      [officer('officer_test')],
      [skill('skill_active'), skill('skill_passive')],
      dictionaries,
      index,
      manifest,
    )
    const skills = buildSkills(
      [skill('skill_active'), skill('skill_passive')],
      dictionaries,
      undefined,
      undefined,
      undefined,
      index,
      manifest,
    )
    const details = buildDetails(
      [officer('officer_test')],
      [skill('skill_active'), skill('skill_passive')],
      dictionaries,
      undefined,
      undefined,
      undefined,
      index,
      manifest,
    )

    expect(catalog[0]!.portraitPath).toBe(manifest.assets[0]!.publicUrl)
    expect(skills.skill_active!.ip).toBe(manifest.assets[1]!.publicUrl)
    expect(details.officer_test!.pp).toBe(manifest.assets[0]!.publicUrl)
    expect(details.officer_test!.ss.every((entry) => entry.ip.startsWith(manifest.cdnOrigin))).toBe(
      true,
    )
    expect(JSON.stringify({ catalog, skills, details })).not.toContain('/subpkg-assets-')
  })

  it('rejects a generated asset manifest from a non-CloudBase origin', () => {
    expect(() =>
      buildCatalog(
        [officer('officer_test')],
        [skill('skill_active'), skill('skill_passive')],
        dictionaries,
        dependencies(),
        {
          ...manifest,
          cdnOrigin: 'https://cdn.example.com',
          assets: manifest.assets.map((asset) => ({
            ...asset,
            publicUrl: asset.publicUrl.replace(manifest.cdnOrigin, 'https://cdn.example.com'),
          })),
        },
      ),
    ).toThrow(/CloudBase CDN origin/)
  })

  it('leaves an unavailable skill icon empty so the page fallback can render', () => {
    const missingSkill = skill('skill_missing')
    const missingOfficer = officer('officer_missing')
    missingOfficer.skills = [
      {
        skillId: missingSkill.id,
        kind: 'active',
        sourceGroup: 'sk0',
        slot: 0,
        unlockLevel: 1,
        level: 1,
      },
    ]
    const index = buildAssetDependencyIndex([missingOfficer], [missingSkill], {
      assetFilenames: new Set(['officer_missing.png']),
    })
    const missingManifest: RuntimeAssetUrlManifest = {
      ...manifest,
      assets: [
        {
          filename: 'officer_missing.png',
          publicUrl: `${manifest.cdnOrigin}/assets/${manifest.releaseId}/officer_missing.png`,
        },
      ],
    }

    const runtime = buildSkills(
      [missingSkill],
      dictionaries,
      undefined,
      undefined,
      undefined,
      index,
      missingManifest,
    )
    const details = buildDetails(
      [missingOfficer],
      [missingSkill],
      dictionaries,
      undefined,
      undefined,
      undefined,
      index,
      missingManifest,
    )

    expect(runtime.skill_missing!.ip).toBe('')
    expect(details.officer_missing!.ss[0]!.ip).toBe('')
  })
})
