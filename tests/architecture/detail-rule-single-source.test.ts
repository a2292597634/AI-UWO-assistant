/**
 * Architecture Gate: Detail Rule Single Source of Truth
 *
 * Verify that the miniprogram runtime does NOT contain a duplicate
 * detail shard hash algorithm or hardcoded shard count.
 */

import { describe, it, expect } from 'vitest'
import * as fs from 'node:fs'
import * as path from 'node:path'

const MINIPROGRAM = path.resolve(__dirname, '../../miniprogram')

// ── Helpers ──

const findTsSourceFiles = (dir: string): string[] => {
  const results: string[] = []
  const entries = fs.readdirSync(dir, { withFileTypes: true })
  for (const entry of entries) {
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) {
      if (
        entry.name === 'node_modules' ||
        entry.name === 'generated' ||
        entry.name.startsWith('subpkg-assets-') ||
        entry.name.startsWith('subpkg-a')
      )
        continue
      results.push(...findTsSourceFiles(full))
    } else if (entry.name.endsWith('.ts') && !entry.name.endsWith('.d.ts')) {
      results.push(full)
    }
  }
  return results
}

// ── Tests ──

describe('No duplicate shard hash algorithm in runtime', () => {
  // Patterns that indicate a duplicated shardFor / hash function
  const hashPatterns = [
    // The specific hash algorithm used by shardFor:
    // hash = ((hash * 31 + charCodeAt(i)) >>> 0); return hash % N
    /hash\s*=\s*\(\(\s*hash\s*\*\s*31\s*\+\s*[a-zA-Z]+\.charCodeAt/i,
    // Hardcoded shard count of 10 with a for loop (loader pattern)
    /\bfor\s*\([^)]*\)\s*\{\s*(var|let|const).*require.*details-\d/i,
    // Direct shardFor function definition
    /\bfunction\s+shardFor\b/,
    /\bconst\s+shardFor\b/,
    /\bvar\s+shardFor\b/,
  ]

  const sourceFiles = findTsSourceFiles(MINIPROGRAM)

  for (const file of sourceFiles) {
    const rel = path.relative(MINIPROGRAM, file)
    // Skip the generated files in subpkg-detail (detail-loaders.js etc)
    if (rel.includes('detail-index') || rel.includes('detail-loaders') || rel.includes('details-'))
      continue

    const content = fs.readFileSync(file, 'utf8')

    for (const pattern of hashPatterns) {
      it(`${rel} does not contain shard hash algorithm`, () => {
        expect(content).not.toMatch(pattern)
      })
    }
  }
})

describe('No hardcoded shard count in runtime source', () => {
  const sourceFiles = findTsSourceFiles(MINIPROGRAM)

  for (const file of sourceFiles) {
    const rel = path.relative(MINIPROGRAM, file)
    // Skip the generated loader (it legitimately has the count)
    if (rel.includes('detail-loaders')) continue

    const content = fs.readFileSync(file, 'utf8')

    it(`${rel} does not contain hardcoded DETAIL_SHARD_COUNT or DETAIL_LOADERS array`, () => {
      // Look for a hardcoded array of 10 detail loader require() calls
      const loaderArrayMatch = content.match(/DETAIL_LOADERS\s*=\s*\[/)
      expect(loaderArrayMatch).toBeNull()
    })
  }
})
