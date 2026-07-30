import { copyFileSync, existsSync, mkdirSync, readdirSync, unlinkSync } from 'node:fs'
import { join } from 'node:path'

const SRC_DIRS = [
  'archive/voyage-tw-2026052501/raw-assets',
  'miniprogram/assets',
]
const SUBPKG_BASE = 'miniprogram'

/** Deterministic shard index — must match build-runtime-data.ts shardFor exactly. */
const shardFor = (filename: string): number => {
  const id = filename.replace(/\.png$/, '').replace(/^(officer|skill)_/, '')
  let hash = 0
  for (let i = 0; i < id.length; i++) hash = ((hash * 31 + id.charCodeAt(i)) >>> 0)
  return hash % 10
}

// 1. Remove mixed-case stale files (canonical IDs are always lowercase)
console.log('Cleaning mixed-case stale assets...')
let caseCleaned = 0
for (let s = 0; s <= 9; s++) {
  const dir = join(SUBPKG_BASE, `subpkg-a${s}`, 'imgs')
  if (!existsSync(dir)) continue
  for (const f of readdirSync(dir)) {
    if (!f.endsWith('.png')) continue
    // Remove files with uppercase letters in the ID portion (after prefix)
    const idPart = f.replace(/\.png$/, '').replace(/^(officer|skill)_/, '')
    if (/[A-Z]/.test(idPart)) {
      unlinkSync(join(dir, f))
      caseCleaned++
    }
  }
}
console.log(`  Removed ${caseCleaned} mixed-case stale files`)

// 2. Remove all stale PNGs from wrong shard dirs
console.log('Cleaning mis-sharded assets...')
let cleaned = 0
for (let s = 0; s <= 9; s++) {
  const dir = join(SUBPKG_BASE, `subpkg-a${s}`, 'imgs')
  if (!existsSync(dir)) continue
  for (const f of readdirSync(dir)) {
    if (!f.endsWith('.png')) continue
    const correctShard = shardFor(f)
    if (correctShard !== s) {
      unlinkSync(join(dir, f))
      cleaned++
    }
  }
}
console.log(`  Removed ${cleaned} mis-sharded files`)

// 3. Copy all assets from source dirs to correct shard dirs
console.log('Linking assets to subpackages...')
let copied = 0
let skipped = 0
for (const srcDir of SRC_DIRS) {
  if (!existsSync(srcDir)) {
    console.log(`  Source dir not found: ${srcDir} (skipping)`)
    continue
  }
  for (const f of readdirSync(srcDir)) {
    if (!f.endsWith('.png')) continue
    // Normalize filename to lowercase (belt & suspenders for case-sensitive filesystems)
    const normalizedName = f.toLowerCase()
    const shard = shardFor(normalizedName)
    const destDir = join(SUBPKG_BASE, `subpkg-a${shard}`, 'imgs')
    mkdirSync(destDir, { recursive: true })
    const dest = join(destDir, normalizedName)
    if (existsSync(dest)) {
      skipped++
    } else {
      copyFileSync(join(srcDir, f), dest)
      copied++
    }
  }
}
console.log(`  ${copied} copied, ${skipped} already in place`)
console.log('Done.')
