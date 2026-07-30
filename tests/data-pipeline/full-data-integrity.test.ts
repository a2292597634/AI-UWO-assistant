import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { buildCatalog, buildSkills, buildDictionaries, buildDetails, writeShardedDetails } from '../../tools/data-pipeline/build-runtime-data'
import type { CanonicalOfficer, CanonicalSkill, DictionaryItem } from '../../tools/import/types'

const readJson = <T>(p: string): T => JSON.parse(readFileSync(p, 'utf8')) as T

// Use full canonical data for integration tests
const officers = readJson<CanonicalOfficer[]>('data/master/officers.json')
const skills = readJson<CanonicalSkill[]>('data/master/skills.json')
const dictionaries = readJson<Record<string, DictionaryItem[]>>('data/master/dictionaries.json')

describe('Full data integrity (627 officers)', () => {
  it('generates catalog for all 627 officers', () => {
    const catalog = buildCatalog(officers, skills, dictionaries)
    expect(catalog).toHaveLength(627)
  })

  it('all officers have Chinese gender labels (not f/m)', () => {
    const catalog = buildCatalog(officers, skills, dictionaries)
    for (const o of catalog) {
      expect(o.genderLabel).toMatch(/^(女性|男性)$/)
    }
  })

  it('all officer names are trimmed (no leading/trailing whitespace)', () => {
    const catalog = buildCatalog(officers, skills, dictionaries)
    for (const o of catalog) {
      expect(o.name).toBe(o.name.trim())
    }
  })

  it('portrait paths use lowercase canonical IDs', () => {
    const catalog = buildCatalog(officers, skills, dictionaries)
    for (const o of catalog) {
      expect(o.portraitPath).toMatch(/^\/subpkg-a\d\/imgs\/officer_[a-z0-9]+\.png$/)
      // No uppercase in filename portion
      const filename = o.portraitPath.split('/').pop()!
      expect(filename).toBe(filename.toLowerCase())
    }
  })

  it('all skills have valid categoryId (no empty skill_category_ suffix)', () => {
    const runtimeSkills = buildSkills(skills, dictionaries)
    for (const [id, s] of Object.entries(runtimeSkills)) {
      expect(s.cat).toBeTruthy()
      // Category must not end with bare "skill_category_" (no suffix)
      expect(s.cat).not.toBe('skill_category_')
    }
  })

  it('all active/passive skills exist in skills dictionary', () => {
    const catalog = buildCatalog(officers, skills, dictionaries)
    const runtimeSkills = buildSkills(skills, dictionaries)
    const skillIds = new Set(Object.keys(runtimeSkills))

    for (const o of catalog) {
      for (const sid of o.activeSkills) {
        expect(skillIds.has(sid)).toBe(true)
      }
      for (const sid of o.passiveSkills) {
        expect(skillIds.has(sid)).toBe(true)
      }
    }
  })

  it('active and passive skill arrays are disjoint per officer', () => {
    const catalog = buildCatalog(officers, skills, dictionaries)
    for (const o of catalog) {
      const activeSet = new Set(o.activeSkills)
      for (const sid of o.passiveSkills) {
        expect(activeSet.has(sid)).toBe(false)
      }
    }
  })
})

describe('Detail shard distribution', () => {
  it('distributes 627 officers across 10 shards with no duplicates', () => {
    const allDetails = buildDetails(officers, skills, dictionaries)
    const allIds = Object.keys(allDetails)
    expect(allIds).toHaveLength(627)

    // Verify shard assignment is deterministic and covers all officers
    const fs = require('node:fs')
    const path = require('node:path')
    const os = require('node:os')

    const tmpDir = path.join(os.tmpdir(), 'full-shard-test-' + Date.now())
    fs.mkdirSync(tmpDir, { recursive: true })

    try {
      writeShardedDetails(officers, skills, dictionaries, tmpDir)

      const seen = new Set<string>()
      const shardCounts: number[] = []

      for (let s = 0; s < 10; s++) {
        const filePath = path.join(tmpDir, `details-${s}.js`)
        expect(fs.existsSync(filePath)).toBe(true)

        const chunk = require(filePath)
        const ids = Object.keys(chunk)
        shardCounts.push(ids.length)

        for (const id of ids) {
          expect(seen.has(id)).toBe(false)
          seen.add(id)
        }

        // Each shard file should be reasonable size
        const stat = fs.statSync(filePath)
        expect(stat.size).toBeLessThan(200 * 1024) // < 200 KB per shard
      }

      expect(seen.size).toBe(627)

      // Distribution should be reasonably balanced (no shard has < 50 or > 80)
      const maxShard = Math.max(...shardCounts)
      const minShard = Math.min(...shardCounts)
      expect(maxShard - minShard).toBeLessThan(15)
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true })
    }
  })
})

describe('WXML field contract', () => {
  it('detail entries do NOT expose unused fields', () => {
    const details = buildDetails(officers, skills, dictionaries)
    const firstId = Object.keys(details)[0]!
    const d = details[firstId]!

    // These fields should NOT exist (WXML uses activeSkills/passiveSkills arrays, not officer.skills)
    expect((d as any).categoryId).toBeUndefined()
    expect((d as any).slot).toBeUndefined()
    expect((d as any).sourceGroup).toBeUndefined()

    // Recruitment must have cityNames (cn) but NOT old cityIds field
    expect(Array.isArray(d.rc.cn)).toBe(true)
    expect((d.rc as any).ci).toBeUndefined()
    expect((d.rc as any).ri).toBeUndefined()
  })

  it('all detail languages have required fields', () => {
    const details = buildDetails(officers, skills, dictionaries)
    for (const [id, d] of Object.entries(details)) {
      for (const l of d.ls) {
        expect(l.li).toBeTruthy()
        expect(typeof l.lv).toBe('number')
        expect(l.n).toBeTruthy()
      }
    }
  })

  it('all detail skills have kind field', () => {
    const details = buildDetails(officers, skills, dictionaries)
    for (const [id, d] of Object.entries(details)) {
      for (const s of d.ss) {
        expect(s.k).toMatch(/^(active|passive)$/)
        expect(s.si).toBeTruthy()
        expect(typeof s.lv).toBe('number')
        expect(s.ip).toMatch(/^\/subpkg-a\d\/imgs\//)
      }
    }
  })
})

describe('Catalog-to-details consistency', () => {
  it('catalog and details agree on active/passive classification', () => {
    const catalog = buildCatalog(officers, skills, dictionaries)
    const details = buildDetails(officers, skills, dictionaries)

    for (const o of catalog) {
      const detail = details[o.id]
      expect(detail).toBeDefined()

      // Count active/passive skills from detail (ss has kind field)
      const detailActive = detail.ss.filter((s) => s.k === 'active').map((s) => s.si).sort()
      const detailPassive = detail.ss.filter((s) => s.k === 'passive').map((s) => s.si).sort()

      // Should match catalog
      expect(o.activeSkills.sort()).toEqual(detailActive)
      expect(o.passiveSkills.sort()).toEqual(detailPassive)
    }
  })
})
