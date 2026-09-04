import { afterEach, describe, expect, it } from 'vitest'
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { buildOfficerReferenceData } from '../../tools/data-pipeline/build-officer-reference-data'

const fixture = <T>(name: string): T =>
  JSON.parse(readFileSync(`tests/fixtures/canonical/${name}.json`, 'utf8')) as T

const temporaryMasters: string[] = []

afterEach(() => {
  while (temporaryMasters.length > 0) {
    const directory = temporaryMasters.pop()
    if (directory) rmSync(directory, { recursive: true, force: true })
  }
})

describe('officer reference data snapshot', () => {
  it('輸出服務端所需 ID 集合，語言使用短格式且包含 custom officer', () => {
    const directory = mkdtempSync(join(tmpdir(), 'uwo-reference-master-'))
    temporaryMasters.push(directory)
    const officer = fixture<Record<string, unknown>[]>('officers')[0]!
    const custom = { ...officer, id: 'officer_custom_sub_a', sourceRefs: { submissionId: 'sub_a' } }
    writeFileSync(join(directory, 'officers.json'), JSON.stringify([officer]))
    writeFileSync(join(directory, 'custom-officers.json'), JSON.stringify([custom]))
    writeFileSync(join(directory, 'dictionaries.json'), JSON.stringify(fixture('dictionaries')))
    writeFileSync(join(directory, 'skills.json'), JSON.stringify(fixture('skills')))

    const result = buildOfficerReferenceData(directory)
    expect(result.rarityIds).toContain('rarity_5')
    expect(result.languageIds).toContain('lang70')
    expect(result.languageIds).not.toContain('language_lang70')
    expect(result.skillIds).toContain('skill_skill200681')
    expect(result.officerIds).toEqual(['officer_chast089', 'officer_custom_sub_a'])
  })

  it('相同 master 重複生成結果一致', () => {
    const directory = mkdtempSync(join(tmpdir(), 'uwo-reference-master-'))
    temporaryMasters.push(directory)
    writeFileSync(join(directory, 'officers.json'), JSON.stringify(fixture('officers')))
    writeFileSync(join(directory, 'dictionaries.json'), JSON.stringify(fixture('dictionaries')))
    writeFileSync(join(directory, 'skills.json'), JSON.stringify(fixture('skills')))
    expect(buildOfficerReferenceData(directory)).toEqual(buildOfficerReferenceData(directory))
  })
})
