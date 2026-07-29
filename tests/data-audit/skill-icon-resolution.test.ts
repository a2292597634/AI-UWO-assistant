import { describe, expect, it } from 'vitest'
import selection from '../../data/audit/sample-selection.json'
import boundedSkills from '../fixtures/source-audit/skills.json'
import {
  resolveSkillIconResolutions,
  skillIconResolutionRule,
  validateSkillIconResolutions,
  type SkillIconResolution,
  type SkillImageMetadata,
} from '../../tools/data-audit/collect-asset-metadata'

const metadata = boundedSkills as Record<string, SkillImageMetadata>

describe('selected skill icon resolution', () => {
  it('derives exactly 20 deterministic URLs from bounded selected-skill metadata', () => {
    const resolutions = resolveSkillIconResolutions(selection.skillIds, metadata)

    expect(resolutions).toHaveLength(20)
    expect(resolutions.find(({ ownerSourceId }) => ownerSourceId === 'skill509998139')).toEqual({
      ownerSourceId: 'skill509998139',
      imageOverrideId: null,
      resolvedImageId: 'skill509998',
      url: 'https://voyage.tw/img/skill/uwo_skill509998.png',
      metadataSourceRange: 'bytes=520192-524287',
      rule: skillIconResolutionRule,
    })
    expect(resolutions.find(({ ownerSourceId }) => ownerSourceId === 'skillT0053')).toEqual({
      ownerSourceId: 'skillT0053',
      imageOverrideId: 'skill200681',
      resolvedImageId: 'skill200681',
      url: 'https://voyage.tw/img/skill/uwo_skill200681.png',
      metadataSourceRange: 'bytes=532480-536575',
      rule: skillIconResolutionRule,
    })
    expect(new Set(resolutions.map(({ ownerSourceId }) => ownerSourceId))).toEqual(
      new Set(selection.skillIds),
    )
  })

  it('blocks missing metadata and selections that are not exactly 20 unique skills', () => {
    const missingMetadata = { ...metadata }
    delete missingMetadata.skill200681
    const missingRange = {
      ...metadata,
      skill200681: { imageOverrideId: null } as SkillImageMetadata,
    }

    expect(() => resolveSkillIconResolutions(selection.skillIds, missingMetadata)).toThrow(
      'AUDIT_SKILL_ICON_METADATA_MISSING:skill200681',
    )
    expect(() => resolveSkillIconResolutions(selection.skillIds, missingRange)).toThrow(
      'AUDIT_SKILL_ICON_METADATA_MISSING:skill200681',
    )
    expect(() => resolveSkillIconResolutions(selection.skillIds.slice(0, 19), metadata)).toThrow(
      'AUDIT_SKILL_ICON_SELECTION_COUNT:19',
    )
    expect(() =>
      resolveSkillIconResolutions(
        [...selection.skillIds.slice(0, 19), selection.skillIds[0]],
        metadata,
      ),
    ).toThrow('AUDIT_SKILL_ICON_SELECTION_DUPLICATE:skill200681')
  })

  it('blocks duplicate, missing, unknown-rule, unknown-override, and unresolved evidence', () => {
    const resolved = resolveSkillIconResolutions(selection.skillIds, metadata)
    const validate = (records: SkillIconResolution[]) =>
      validateSkillIconResolutions(selection.skillIds, metadata, records)

    expect(() => validate([...resolved.slice(0, 19), resolved[0]])).toThrow(
      'AUDIT_SKILL_ICON_RESOLUTION_DUPLICATE:skill100043',
    )
    expect(() => validate(resolved.slice(0, 19))).toThrow('AUDIT_SKILL_ICON_RESOLUTION_COUNT:19')
    expect(() =>
      validate(
        resolved.map((record) =>
          record.ownerSourceId === 'skillT0053'
            ? { ...record, rule: 'Use an undocumented fallback.' }
            : record,
        ),
      ),
    ).toThrow('AUDIT_SKILL_ICON_RULE_UNKNOWN:skillT0053')
    expect(() =>
      validate(
        resolved.map((record) =>
          record.ownerSourceId === 'skillT0053'
            ? { ...record, imageOverrideId: 'skill999999' }
            : record,
        ),
      ),
    ).toThrow('AUDIT_SKILL_ICON_OVERRIDE_UNKNOWN:skillT0053')
    expect(() =>
      validate(
        resolved.map((record) =>
          record.ownerSourceId === 'skill509998139'
            ? { ...record, resolvedImageId: '', url: '' }
            : record,
        ),
      ),
    ).toThrow('AUDIT_SKILL_ICON_RESOLUTION_UNRESOLVED:skill509998139')
  })
})
