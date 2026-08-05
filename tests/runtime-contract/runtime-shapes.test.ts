/**
 * Runtime Contract Shape Tests
 *
 * Read the ACTUAL generated runtime files and verify they conform to the
 * shared contract in miniprogram/contracts/runtime-data.ts.
 *
 * These tests protect against:
 *  - Generated output drifting from the contract
 *  - Missing or extra fields in catalog / skills / dictionaries / details
 *  - Broken skill references
 *  - Orphaned detail records
 *  - Invalid skill kinds
 */

import { describe, it, expect } from 'vitest'
import * as fs from 'node:fs'
import * as path from 'node:path'

const GENERATED_DIR = path.resolve(__dirname, '../../miniprogram/generated')
const DETAIL_DIR = path.resolve(__dirname, '../../miniprogram/subpkg-detail')
const ASSET_MANIFEST = JSON.parse(
  fs.readFileSync(path.resolve(__dirname, '../../data/assets/cloudbase-manifest.json'), 'utf8'),
) as { cdnOrigin: string; cloudPathPrefix: string; releaseId: string }
const ASSET_URL_PREFIX = `${ASSET_MANIFEST.cdnOrigin}/${ASSET_MANIFEST.cloudPathPrefix}/${ASSET_MANIFEST.releaseId}/`

// ── Helpers ──

const readGenerated = (name: string): Record<string, unknown> => {
  const filePath = path.join(GENERATED_DIR, `${name}.js`)
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  return require(filePath) as Record<string, unknown>
}

const readDetailShard = (shard: number): Record<string, unknown> => {
  const filePath = path.join(DETAIL_DIR, `details-${shard}.js`)
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  return require(filePath) as Record<string, unknown>
}

/** List all officer IDs in all detail shards. */
const allDetailIds = (): Set<string> => {
  const ids = new Set<string>()
  for (let s = 0; s < 10; s++) {
    const shard = readDetailShard(s)
    for (const id of Object.keys(shard)) {
      ids.add(id)
    }
  }
  return ids
}

const DETAIL_SHARD_COUNT = 10

const isPublishedAssetUrl = (value: string, filenamePrefix: string): boolean => {
  try {
    const url = new URL(value)
    return (
      url.protocol === 'https:' &&
      url.origin === ASSET_MANIFEST.cdnOrigin &&
      !url.search &&
      !url.hash &&
      url.href.startsWith(ASSET_URL_PREFIX) &&
      url.pathname.endsWith('.png') &&
      url.pathname.split('/').pop()!.startsWith(filenamePrefix)
    )
  } catch {
    return false
  }
}

const expectPublishedAssetUrl = (
  value: string,
  filenamePrefix: string,
  allowMissing = false,
): void => {
  if (allowMissing && value === '') return
  expect(isPublishedAssetUrl(value, filenamePrefix)).toBe(true)
}

// ── Catalog tests ──

describe('Runtime Contract: catalog.js', () => {
  const catalog = readGenerated('catalog') as unknown as Array<Record<string, unknown>>

  it('is an array', () => {
    expect(Array.isArray(catalog)).toBe(true)
    expect(catalog.length).toBeGreaterThan(0)
  })

  it('each entry has all required fields', () => {
    const requiredFields = [
      'id',
      'name',
      'rarityId',
      'rarityName',
      'rarityClass',
      'visualGradeId',
      'typeId',
      'typeName',
      'genderId',
      'genderLabel',
      'jobId',
      'jobName',
      'portraitPath',
      'languages',
      'activeSkills',
      'passiveSkills',
      'searchAliases',
    ]
    for (const entry of catalog) {
      for (const field of requiredFields) {
        expect(entry).toHaveProperty(field)
      }
    }
  })

  it('each entry has no unexpected fields', () => {
    const knownFields = new Set([
      'id',
      'name',
      'rarityId',
      'rarityName',
      'rarityClass',
      'visualGradeId',
      'typeId',
      'typeName',
      'genderId',
      'genderLabel',
      'jobId',
      'jobName',
      'portraitPath',
      'languages',
      'activeSkills',
      'passiveSkills',
      'searchAliases',
    ])
    for (const entry of catalog) {
      for (const key of Object.keys(entry)) {
        expect(knownFields.has(key)).toBe(true)
      }
    }
  })

  it('portraitPath has expected format', () => {
    for (const entry of catalog) {
      const pp = entry.portraitPath as string
      expectPublishedAssetUrl(pp, 'officer_')
    }
  })

  it('languages are valid short-form IDs', () => {
    for (const entry of catalog) {
      const langs = entry.languages as string[]
      expect(Array.isArray(langs)).toBe(true)
      for (const lid of langs) {
        // Short form: "lang70" (no language_ prefix)
        expect(lid).toMatch(/^lang\d+$/)
      }
    }
  })

  it('activeSkills and passiveSkills are string arrays', () => {
    for (const entry of catalog) {
      expect(Array.isArray(entry.activeSkills)).toBe(true)
      expect(Array.isArray(entry.passiveSkills)).toBe(true)
      for (const sid of entry.activeSkills as string[]) {
        expect(typeof sid).toBe('string')
      }
      for (const sid of entry.passiveSkills as string[]) {
        expect(typeof sid).toBe('string')
      }
    }
  })

  it('IDs are unique', () => {
    const ids = catalog.map((e) => e.id as string)
    expect(new Set(ids).size).toBe(ids.length)
  })
})

// ── Skills tests ──

describe('Runtime Contract: skills.js', () => {
  const skills = readGenerated('skills') as Record<string, Record<string, unknown>>

  it('is an object (dictionary format)', () => {
    expect(typeof skills).toBe('object')
    expect(skills).not.toBeNull()
    expect(Object.keys(skills).length).toBeGreaterThan(0)
  })

  it('each skill entry has required fields: id, n, cat, cn, ip, d, li', () => {
    for (const [skillId, skill] of Object.entries(skills)) {
      expect(skill.id).toBe(skillId)
      expect(typeof skill.n).toBe('string')
      expect(typeof skill.cat).toBe('string')
      expect(typeof skill.cn).toBe('string')
      expect(typeof skill.ip).toBe('string')
      expect(typeof skill.d).toBe('string')
      expect(typeof skill.li).toBe('string')
    }
  })

  it('each skill has no unexpected fields', () => {
    const knownFields = new Set(['id', 'n', 'cat', 'cn', 'ip', 'd', 'li'])
    for (const [, skill] of Object.entries(skills)) {
      for (const key of Object.keys(skill)) {
        expect(knownFields.has(key)).toBe(true)
      }
    }
  })

  it('icon paths have expected format', () => {
    for (const [, skill] of Object.entries(skills)) {
      const ip = skill.ip as string
      expectPublishedAssetUrl(ip, 'skill_', true)
    }
  })

  it('all catalog skill references resolve in skills', () => {
    const catalog = readGenerated('catalog') as unknown as Array<Record<string, unknown>>
    const skillIds = new Set(Object.keys(skills))
    for (const entry of catalog) {
      for (const sid of (entry.activeSkills as string[]).concat(entry.passiveSkills as string[])) {
        expect(skillIds.has(sid)).toBe(true)
      }
    }
  })
})

// ── Fleet officer index tests ──

describe('Runtime Contract: fleet-officers.js', () => {
  const fleet = readGenerated('fleet-officers') as unknown as Array<Record<string, unknown>>

  it('is a complete officer array', () => {
    expect(Array.isArray(fleet)).toBe(true)
    expect(fleet).toHaveLength(627)
    expect(new Set(fleet.map((entry) => entry.id)).size).toBe(627)
  })

  it('contains only battle relations with unlockLevel contributions', () => {
    for (const entry of fleet) {
      expect(entry).toMatchObject({
        id: expect.any(String),
        name: expect.any(String),
        jobName: expect.any(String),
        rarityName: expect.any(String),
        portraitPath: expect.any(String),
        skills: expect.any(Array),
      })
      expectPublishedAssetUrl(entry.portraitPath as string, 'officer_')
      for (const relation of entry.skills as Array<Record<string, unknown>>) {
        expect(relation.skillId).toEqual(expect.any(String))
        expect(['active', 'passive']).toContain(relation.kind)
        expect(
          (relation.categoryId as string).startsWith('skill_category_naval_') ||
            relation.categoryId === 'skill_category_combat_other',
        ).toBe(true)
        expect(relation.unlockLevel).toEqual(expect.any(Number))
      }
    }
  })
})

// ── Dictionaries tests ──

describe('Runtime Contract: dictionaries.js', () => {
  const dicts = readGenerated('dictionaries') as Record<string, unknown>

  const dictGroups = ['rarities', 'types', 'genders', 'jobs', 'languages', 'skillCategories']

  for (const group of dictGroups) {
    it(`has "${group}" group`, () => {
      expect(dicts).toHaveProperty(group)
      const items = dicts[group] as Array<Record<string, unknown>>
      expect(Array.isArray(items)).toBe(true)
      expect(items.length).toBeGreaterThan(0)
    })

    it(`"${group}" items have id and name`, () => {
      const items = dicts[group] as Array<Record<string, unknown>>
      for (const item of items) {
        expect(item).toHaveProperty('id')
        expect(item).toHaveProperty('name')
        expect(typeof item.id).toBe('string')
        expect(typeof item.name).toBe('string')
      }
    })

    it(`"${group}" items have no unexpected fields`, () => {
      const items = dicts[group] as Array<Record<string, unknown>>
      for (const item of items) {
        for (const key of Object.keys(item)) {
          expect(['id', 'name']).toContain(key)
        }
      }
    })
  }
})

// ── Dataset meta tests ──

describe('Runtime Contract: dataset-meta.js', () => {
  const meta = readGenerated('dataset-meta') as Record<string, unknown>

  it('has officerCount, skillCount, contentVersion', () => {
    expect(typeof meta.officerCount).toBe('number')
    expect(typeof meta.skillCount).toBe('number')
    expect(typeof meta.contentVersion).toBe('string')
  })

  it('officerCount matches catalog length', () => {
    const catalog = readGenerated('catalog') as unknown as Array<Record<string, unknown>>
    expect(meta.officerCount).toBe(catalog.length)
  })

  it('skillCount matches skills dictionary size', () => {
    const skills = readGenerated('skills') as Record<string, unknown>
    expect(meta.skillCount).toBe(Object.keys(skills).length)
  })
})

// ── Detail shard tests ──

describe('Runtime Contract: details-N.js', () => {
  const requiredFields = [
    'n',
    'rn',
    'vg',
    'ti',
    'gi',
    'tn',
    'gn',
    'jn',
    'nn',
    'pp',
    'ls',
    'ss',
    'rc',
  ]

  it('has exactly 10 shard files', () => {
    for (let s = 0; s < DETAIL_SHARD_COUNT; s++) {
      const f = path.join(DETAIL_DIR, `details-${s}.js`)
      expect(fs.existsSync(f)).toBe(true)
    }
  })

  it('each shard is a non-empty object', () => {
    for (let s = 0; s < DETAIL_SHARD_COUNT; s++) {
      const shard = readDetailShard(s)
      expect(typeof shard).toBe('object')
      expect(shard).not.toBeNull()
      expect(Object.keys(shard).length).toBeGreaterThan(0)
    }
  })

  it('each detail record has all required fields', () => {
    for (let s = 0; s < DETAIL_SHARD_COUNT; s++) {
      const shard = readDetailShard(s)
      for (const [, rec] of Object.entries(shard)) {
        for (const field of requiredFields) {
          expect(rec).toHaveProperty(field)
        }
      }
    }
  })

  it('each detail record has no unexpected top-level fields', () => {
    const knownFields = new Set(requiredFields)
    for (let s = 0; s < DETAIL_SHARD_COUNT; s++) {
      const shard = readDetailShard(s)
      for (const [, rec] of Object.entries(shard)) {
        for (const key of Object.keys(rec as Record<string, unknown>)) {
          expect(knownFields.has(key)).toBe(true)
        }
      }
    }
  })

  it('skill kinds are only active or passive', () => {
    for (let s = 0; s < DETAIL_SHARD_COUNT; s++) {
      const shard = readDetailShard(s)
      for (const [, rec] of Object.entries(shard)) {
        const ss = (rec as Record<string, unknown>).ss as Array<Record<string, unknown>>
        for (const skill of ss) {
          expect(['active', 'passive']).toContain(skill.k)
        }
      }
    }
  })

  it('every catalog officer has exactly one detail record', () => {
    const catalog = readGenerated('catalog') as unknown as Array<Record<string, unknown>>
    const detailIds = allDetailIds()

    for (const entry of catalog) {
      expect(detailIds.has(entry.id as string)).toBe(true)
    }

    // Verify no extra detail records
    const catalogIds = new Set(catalog.map((e) => e.id as string))
    for (const did of detailIds) {
      expect(catalogIds.has(did)).toBe(true)
    }
  })

  it('each detail ID belongs to exactly one shard', () => {
    const seen = new Map<string, number>()
    for (let s = 0; s < DETAIL_SHARD_COUNT; s++) {
      const shard = readDetailShard(s)
      for (const id of Object.keys(shard)) {
        if (seen.has(id)) {
          throw new Error(`Duplicate detail ID "${id}" in shards ${seen.get(id)} and ${s}`)
        }
        seen.set(id, s)
      }
    }
    expect(seen.size).toBeGreaterThan(0)
  })

  it('portrait paths have expected format', () => {
    for (let s = 0; s < DETAIL_SHARD_COUNT; s++) {
      const shard = readDetailShard(s)
      for (const [, rec] of Object.entries(shard)) {
        const pp = (rec as Record<string, unknown>).pp as string
        expectPublishedAssetUrl(pp, 'officer_')
      }
    }
  })

  it('skill icon paths have expected format', () => {
    for (let s = 0; s < DETAIL_SHARD_COUNT; s++) {
      const shard = readDetailShard(s)
      for (const [, rec] of Object.entries(shard)) {
        const ss = (rec as Record<string, unknown>).ss as Array<Record<string, unknown>>
        for (const skill of ss) {
          const ip = skill.ip as string
          expectPublishedAssetUrl(ip, 'skill_', true)
        }
      }
    }
  })
})

// ── Cross-file consistency ──

describe('Runtime Contract: cross-file consistency', () => {
  it('catalog references only valid language IDs', () => {
    const dicts = readGenerated('dictionaries') as Record<string, unknown>
    const catalog = readGenerated('catalog') as unknown as Array<Record<string, unknown>>
    const validLanguageIds = new Set(
      (dicts.languages as Array<Record<string, unknown>>).map((l) => l.id as string),
    )

    for (const entry of catalog) {
      for (const lid of entry.languages as string[]) {
        expect(validLanguageIds.has(lid)).toBe(true)
      }
    }
  })

  it('catalog rarityId values are valid', () => {
    const dicts = readGenerated('dictionaries') as Record<string, unknown>
    const catalog = readGenerated('catalog') as unknown as Array<Record<string, unknown>>
    const validRarityIds = new Set(
      (dicts.rarities as Array<Record<string, unknown>>).map((r) => r.id as string),
    )

    for (const entry of catalog) {
      expect(validRarityIds.has(entry.rarityId as string)).toBe(true)
    }
  })
})
