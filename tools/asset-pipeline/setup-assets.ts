import { copyFileSync, existsSync, mkdirSync, readdirSync, unlinkSync } from 'node:fs'
import { join } from 'node:path'

const SRC_DIR = 'archive/voyage-tw-2026052501/raw-assets'
const SUBPKG_BASE = 'miniprogram'

/** Deterministic shard index — must match build-runtime-data.ts shardFor exactly. */
const shardFor = (filename: string): number => {
  const id = filename.replace(/\.png$/, '').replace(/^(officer|skill)_/, '')
  let hash = 0
  for (let i = 0; i < id.length; i++) hash = ((hash * 31 + id.charCodeAt(i)) >>> 0)
  return hash % 10
}

// 1. Remove all stale PNGs from all shard dirs
console.log('Cleaning stale assets...')
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
console.log(`  Removed ${cleaned} stale files`)

// 2. Copy all assets from raw-assets to correct shard dirs
console.log('Linking assets to subpackages...')
let copied = 0
let skipped = 0
for (const f of readdirSync(SRC_DIR)) {
  if (!f.endsWith('.png')) continue
  const shard = shardFor(f)
  const destDir = join(SUBPKG_BASE, `subpkg-a${shard}`, 'imgs')
  mkdirSync(destDir, { recursive: true })
  const dest = join(destDir, f)
  if (existsSync(dest)) {
    skipped++
  } else {
    copyFileSync(join(SRC_DIR, f), dest)
    copied++
  }
}
console.log(`  ${copied} copied, ${skipped} already in place`)
console.log('Done.')
