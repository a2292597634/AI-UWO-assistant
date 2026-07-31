/**
 * Detail Loader Contract Tests
 *
 * Verify that the generated detail-index.js and detail-loaders.js:
 *  - Provide a unique shard index for every officer
 *  - Can load every officer's detail record
 *  - Return null for unknown IDs
 *  - Cover all detail records without gaps
 */

import { describe, it, expect } from 'vitest'
import * as path from 'node:path'
import * as fs from 'node:fs'

const DETAIL_DIR = path.resolve(__dirname, '../../miniprogram/subpkg-detail')

// ── Helpers ──

/** Read and parse a generated detail shard. */
const readShard = (shard: number): Record<string, unknown> => {
  const filePath = path.join(DETAIL_DIR, `details-${shard}.js`)
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  return require(filePath) as Record<string, unknown>
}

/** Read generated detail-index.js if it exists. */
const readIndex = (): Record<string, number> | null => {
  const filePath = path.join(DETAIL_DIR, 'detail-index.js')
  if (!fs.existsSync(filePath)) return null
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  return require(filePath) as Record<string, number>
}

/** Read generated detail-loaders.js if it exists. */
const readLoaders = ():
  null | ((id: string, index: Record<string, number>) => Record<string, unknown> | null) => {
  const filePath = path.join(DETAIL_DIR, 'detail-loaders.js')
  if (!fs.existsSync(filePath)) return null
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  return require(filePath) as (
    id: string,
    index: Record<string, number>,
  ) => Record<string, unknown> | null
}

/** List all officer IDs across all detail shards. */
const allDetailIds = (): string[] => {
  const ids: string[] = []
  for (let s = 0; s < 10; s++) {
    const shard = readShard(s)
    for (const id of Object.keys(shard)) {
      ids.push(id)
    }
  }
  return ids
}

// ── Tests ──

describe('detail-index.js (generated)', () => {
  const index = readIndex()

  it('exists as a generated file', () => {
    // This test will FAIL until the generator is updated to produce detail-index.js
    expect(index).not.toBeNull()
    expect(typeof index).toBe('object')
  })

  it('maps every detail ID to a valid shard number', () => {
    expect(index).not.toBeNull()
    const detailIds = allDetailIds()
    for (const id of detailIds) {
      const shard = index![id]
      expect(typeof shard).toBe('number')
      expect(shard).toBeGreaterThanOrEqual(0)
      expect(shard).toBeLessThan(10)
    }
  })

  it('has no extra IDs beyond actual detail records', () => {
    expect(index).not.toBeNull()
    const detailIds = new Set(allDetailIds())
    for (const id of Object.keys(index!)) {
      expect(detailIds.has(id)).toBe(true)
    }
  })

  it('every shard number in index references a shard that contains the ID', () => {
    expect(index).not.toBeNull()
    for (const [id, shard] of Object.entries(index!)) {
      const shardData = readShard(shard)
      expect(shardData).toHaveProperty(id)
    }
  })
})

describe('detail-loaders.js (generated)', () => {
  const loadFn = readLoaders()
  const index = readIndex()
  const detailIds = allDetailIds()

  it('exists as a generated file', () => {
    // This test will FAIL until the generator is updated to produce detail-loaders.js
    expect(loadFn).not.toBeNull()
    expect(typeof loadFn).toBe('function')
  })

  it('loads a valid officer by ID', () => {
    expect(loadFn).not.toBeNull()
    expect(index).not.toBeNull()
    if (!loadFn || !index) return

    // Test the first 3 IDs from different shards
    const byShard = new Map<number, string>()
    for (const id of detailIds) {
      const s = index[id]!
      if (!byShard.has(s)) byShard.set(s, id)
      if (byShard.size >= 3) break
    }

    for (const [_shard, id] of byShard) {
      const record = loadFn(id, index)
      expect(record).not.toBeNull()
      expect(typeof record).toBe('object')
      // Verify a known compact field
      expect(record).toHaveProperty('n')
      expect(typeof (record as Record<string, unknown>).n).toBe('string')
    }
  })

  it('returns null for unknown ID', () => {
    expect(loadFn).not.toBeNull()
    expect(index).not.toBeNull()
    if (!loadFn || !index) return

    const result = loadFn('officer_nonexistent_99999', index)
    expect(result).toBeNull()
  })

  it('returns null for empty string ID', () => {
    expect(loadFn).not.toBeNull()
    expect(index).not.toBeNull()
    if (!loadFn || !index) return

    const result = loadFn('', index)
    expect(result).toBeNull()
  })

  it('can load every single officer detail', () => {
    expect(loadFn).not.toBeNull()
    expect(index).not.toBeNull()
    if (!loadFn || !index) return

    for (const id of detailIds) {
      const record = loadFn(id, index)
      expect(record).not.toBeNull()
      expect(record).toHaveProperty('n')
    }
  })

  it('loaded records match the actual shard content', () => {
    expect(loadFn).not.toBeNull()
    expect(index).not.toBeNull()
    if (!loadFn || !index) return

    // Spot-check: compare loader output with direct shard read
    const sampleId = detailIds[0]!
    const loadedRecord = loadFn(sampleId, index)
    const shard = readShard(index[sampleId]!)
    expect(loadedRecord).toEqual(shard[sampleId])
  })
})
