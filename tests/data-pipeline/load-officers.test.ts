import { afterEach, describe, expect, it } from 'vitest'
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { loadCanonicalOfficers } from '../../tools/data-pipeline/load-officers'

const readJson = <T>(path: string): T => JSON.parse(readFileSync(path, 'utf8')) as T

const officialFixture = readJson<Record<string, unknown>[]>(
  'tests/fixtures/canonical/officers.json',
)

const createMaster = (custom?: Record<string, unknown>): string => {
  const directory = mkdtempSync(join(tmpdir(), 'uwo-officer-master-'))
  writeFileSync(join(directory, 'officers.json'), JSON.stringify(officialFixture.slice(0, 1)))
  if (custom) writeFileSync(join(directory, 'custom-officers.json'), JSON.stringify([custom]))
  return directory
}

const customOfficer = (submissionId: string): Record<string, unknown> => ({
  ...officialFixture[0],
  id: `officer_custom_${submissionId}`,
  name: `投稿${submissionId}`,
  sourceRefs: { submissionId },
})

const temporaryMasters: string[] = []

afterEach(() => {
  while (temporaryMasters.length > 0) {
    const directory = temporaryMasters.pop()
    if (directory) rmSync(directory, { recursive: true, force: true })
  }
})

describe('canonical officer source loader', () => {
  it('沒有 custom-officers.json 時只載入官方航海士', () => {
    const directory = createMaster()
    temporaryMasters.push(directory)
    expect(loadCanonicalOfficers(directory)).toHaveLength(1)
    expect(loadCanonicalOfficers(directory)[0]?.sourceRefs).toEqual({ voyageTw: 'chasT089' })
  })

  it('custom 航海士接在官方資料之後並保持穩定順序', () => {
    const directory = createMaster(customOfficer('sub_a'))
    temporaryMasters.push(directory)
    const first = loadCanonicalOfficers(directory)
    const second = loadCanonicalOfficers(directory)
    expect(first).toEqual(second)
    expect(first).toHaveLength(2)
    expect(first[1]?.sourceRefs).toEqual({ submissionId: 'sub_a' })
  })

  it('拒絕重複 ID、無效投稿來源與非陣列 custom 資料', () => {
    const duplicateDirectory = createMaster({
      ...customOfficer('sub_a'),
      id: officialFixture[0]!.id,
    })
    temporaryMasters.push(duplicateDirectory)
    expect(() => loadCanonicalOfficers(duplicateDirectory)).toThrow(/duplicate officer ID/i)

    const invalidDirectory = createMaster({
      ...customOfficer('sub_b'),
      sourceRefs: { manual: true },
    })
    temporaryMasters.push(invalidDirectory)
    expect(() => loadCanonicalOfficers(invalidDirectory)).toThrow(/sourceRefs/i)
  })
})
