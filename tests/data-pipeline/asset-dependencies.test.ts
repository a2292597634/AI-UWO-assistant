import { describe, expect, it } from 'vitest'
import type {
  CanonicalOfficer,
  CanonicalSkill,
  CanonicalSkillRelation,
} from '../../tools/import/types'
import {
  assertAssetDependencyIndex,
  buildAssetDependencyIndex,
} from '../../tools/data-pipeline/asset-dependencies'

const makeSkill = (id: string, categoryId = 'skill_category_trade_expertise'): CanonicalSkill => ({
  id,
  name: id,
  categoryId,
  description: '',
  iconId: null,
  sourceRefs: { voyageTw: id.replace(/^skill_/, '') },
  levelInfo: '',
})

const makeOfficer = (index: number, skills: CanonicalOfficer['skills']): CanonicalOfficer => ({
  id: `officer_test${String(index).padStart(3, '0')}`,
  name: `測試航海士${index}`,
  rarityId: 'rarity_5',
  typeId: 'type_class_2',
  genderId: 'gender_f',
  jobId: 'job_test',
  nationalityId: 'nationality_test',
  languages: [],
  skills,
  recruitment: { cityIds: [], requirementId: null, requiredOfficerIds: [], note: null },
  portraitId: null,
  displayOrder: index + 1,
  sourceRefs: { voyageTw: `test${index}` },
  visualGradeId: 'grade_5',
})

const relation = (
  skillId: string,
  kind: 'active' | 'passive',
  slot: number,
): CanonicalSkillRelation => ({
  skillId,
  kind,
  sourceGroup: kind === 'active' ? 'sk2' : 'sk0',
  slot,
  unlockLevel: 1,
  level: 1,
})

const navalActiveEnhancementSkillIds = [
  'skill_skill400591',
  'skill_skill400581',
  'skill_skill400711',
  'skill_skill400471',
  'skill_skill400631',
  'skill_skill400861',
  'skill_skill400082',
  'skill_skill400701',
  'skill_skill400521',
  'skill_skill400481',
  'skill_skill400641',
  'skill_skill400601',
  'skill_skill400611',
  'skill_skill400541',
  'skill_skill400621',
  'skill_skill400651',
  'skill_skill400661',
  'skill_skill400501',
  'skill_skill400491',
  'skill_skill400551',
  'skill_skill400531',
  'skill_skill400571',
  'skill_skill400561',
  'skill_skill400511',
]

describe('asset dependency index', () => {
  it('uses directory order, keeps only the first 3+3 catalog skills, and groups every 100 officers', () => {
    const skills = Array.from({ length: 8 }, (_, index) =>
      makeSkill(`skill_test${index}`, index === 0 ? 'skill_category_trade_expertise' : undefined),
    )
    const relations = [
      ...Array.from({ length: 4 }, (_, index) => relation(`skill_test${index}`, 'active', index)),
      ...Array.from({ length: 4 }, (_, index) =>
        relation(`skill_test${index + 4}`, 'passive', index),
      ),
    ]
    const officers = Array.from({ length: 205 }, (_, index) => makeOfficer(index, relations))
    const filenames = new Set([
      ...officers.map((officer) => `${officer.id}.png`),
      ...skills.map((skill) => `${skill.id}.png`),
    ])

    const index = buildAssetDependencyIndex(officers, skills, { assetFilenames: filenames })

    expect(index.roots.map((root) => root.root)).toEqual([
      'subpkg-assets-0',
      'subpkg-assets-1',
      'subpkg-assets-2',
    ])
    expect(index.roots.map((root) => root.officerIds.length)).toEqual([100, 100, 5])
    expect(index.officerCatalogRoots.officer_test000).toEqual(['subpkg-assets-0'])
    expect(index.officerDetailRoots.officer_test000).toEqual(['subpkg-assets-0'])
    expect(index.officerCatalogRoots.officer_test100).toEqual(
      expect.arrayContaining(['subpkg-assets-1', 'subpkg-assets-0']),
    )
    expect(index.officerCatalogRoots.officer_test100).toHaveLength(2)
    expect(index.roots.flatMap((root) => root.files)).toHaveLength(
      new Set(index.roots.flatMap((root) => root.files)).size,
    )
    expect(index.roots.flatMap((root) => root.files)).toContain('officer_test000.png')
  })

  it('maps every skill icon and every generated image path to exactly one root', () => {
    const skills = [makeSkill('skill_shared')]
    const officerSkills = [relation('skill_shared', 'active', 0)]
    const officers = Array.from({ length: 101 }, (_, index) => makeOfficer(index, officerSkills))
    const index = buildAssetDependencyIndex(officers, skills, {
      assetFilenames: new Set([
        ...officers.map((officer) => `${officer.id}.png`),
        'skill_shared.png',
      ]),
    })

    const skillIcon = index.skillIcons.skill_shared!
    expect(skillIcon.root).toBe('subpkg-assets-0')
    expect(index.pathToRoot[skillIcon.path]).toBe(skillIcon.root)
    expect(index.pathToRoot[index.officerPortraits.officer_test000!.path]).toBe(
      index.officerPortraits.officer_test000!.root,
    )
    expect(index.officerDetailRoots.officer_test100).toEqual(['subpkg-assets-1', 'subpkg-assets-0'])
  })

  it('validates generated paths, root ownership, and duplicate file output', () => {
    const index = buildAssetDependencyIndex([makeOfficer(0, [])], [], {
      assetFilenames: new Set(['officer_test000.png']),
    })
    expect(() => assertAssetDependencyIndex(index)).not.toThrow()

    const broken = structuredClone(index)
    broken.roots[0]!.files.push('officer_test000.png')
    expect(() => assertAssetDependencyIndex(broken)).toThrow('duplicate asset file')
  })

  it('rejects a missing regular skill icon instead of borrowing a category icon', () => {
    const skills = [
      makeSkill('skill_skill400591', 'skill_category_naval_active_enhancement'),
      makeSkill('skill_skill400581', 'skill_category_naval_active_enhancement'),
    ]

    expect(() =>
      buildAssetDependencyIndex([], skills, {
        assetFilenames: new Set(['skill_skill400591.png']),
      }),
    ).toThrow('skill_skill400581.png')
  })

  it('keeps category fallback only for skillT variant icons', () => {
    const skills = [
      makeSkill('skill_skill400591', 'skill_category_naval_active_enhancement'),
      makeSkill('skill_skillT0001', 'skill_category_naval_active_enhancement'),
    ]

    const index = buildAssetDependencyIndex([], skills, {
      assetFilenames: new Set(['skill_skill400591.png']),
    })

    expect(index.skillIcons.skill_skillT0001?.path).toContain('skill_skill400591.png')
  })

  it('uses a skill icon override before variant fallback', () => {
    const skills = [makeSkill('skill_skillT0092', 'skill_category_adventure')]

    const index = buildAssetDependencyIndex([], skills, {
      assetFilenames: new Set(['skill_skill200921.png', 'skill_skill202001.png']),
      skillIconOverrides: new Map([['skill_skillT0092', 'skill_skill202001.png']]),
    })

    expect(index.skillIcons.skill_skillT0092?.path).toContain('skill_skill202001.png')
  })

  it('uses a deterministic global fallback when a variant category has no icon', () => {
    const skills = [
      makeSkill('skill_skillT0226', 'skill_category_certificate'),
      makeSkill('skill_skill400591', 'skill_category_naval_active_enhancement'),
    ]

    const index = buildAssetDependencyIndex([], skills, {
      assetFilenames: new Set(['skill_skill400591.png']),
    })

    expect(index.skillIcons.skill_skillT0226?.path).toContain('skill_skill400591.png')
  })

  it('keeps every enhancement skill on its own icon filename when all assets exist', () => {
    const skills = navalActiveEnhancementSkillIds.map((id) =>
      makeSkill(id, 'skill_category_naval_active_enhancement'),
    )
    const filenames = new Set(skills.map((skill) => `${skill.id}.png`))

    const index = buildAssetDependencyIndex([], skills, { assetFilenames: filenames })
    const paths = skills.map((skill) => index.skillIcons[skill.id]?.path)

    expect(new Set(paths)).toHaveLength(skills.length)
    expect(paths.every((path, index) => path?.endsWith(`${skills[index]!.id}.png`))).toBe(true)
  })
})
