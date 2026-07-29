import { describe, expect, it } from 'vitest'
import manifest from '../../data/audit/asset-sample-manifest.json'
import selection from '../../data/audit/sample-selection.json'
import observations from '../fixtures/source-audit/asset-observations.json'
import resolutions from '../fixtures/source-audit/skill-icon-resolutions.json'
import boundedSkills from '../fixtures/source-audit/skills.json'
import {
  validateSkillIconResolutions,
  type SkillIconResolution,
  type SkillImageMetadata,
} from '../../tools/data-audit/collect-asset-metadata'

describe('committed skill icon resolution evidence', () => {
  it('validates all 20 selected skills without fabricating HTTP observations', () => {
    validateSkillIconResolutions(
      selection.skillIds,
      boundedSkills as Record<string, SkillImageMetadata>,
      resolutions as SkillIconResolution[],
    )

    expect(resolutions).toHaveLength(20)
    expect(resolutions.every((record) => !('status' in record))).toBe(true)

    const requestedSkillOwners = new Set(
      manifest
        .filter(({ ownerType }) => ownerType === 'skill')
        .map(({ ownerSourceId }) => ownerSourceId),
    )
    const successfulObservedSkillOwners = observations
      .filter(({ ownerType, status }) => ownerType === 'skill' && status === 200)
      .map(({ ownerSourceId }) => ownerSourceId)
    expect(
      successfulObservedSkillOwners.every((skillId) => requestedSkillOwners.has(skillId)),
    ).toBe(true)
  })
})
