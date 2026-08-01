import {
  existsSync,
  mkdirSync,
  readdirSync,
  unlinkSync,
  readFileSync,
  writeFileSync,
} from 'node:fs'
import { join } from 'node:path'
import sharp from 'sharp'

const SRC_DIRS = ['archive/voyage-tw-2026052501/raw-assets', 'miniprogram/assets']
const SUBPKG_BASE = 'miniprogram'

/** Deterministic shard index — must match build-runtime-data.ts shardFor exactly. */
const shardFor = (filename: string): number => {
  const id = filename.replace(/\.png$/, '').replace(/^(officer|skill)_/, '')
  let hash = 0
  for (let i = 0; i < id.length; i++) hash = (hash * 31 + id.charCodeAt(i)) >>> 0
  return hash % 10
}

// ── PNG compression ──

/** Compress a PNG buffer to 8-bit palette with max compression. */
async function compressPNG(input: Buffer): Promise<Buffer> {
  return sharp(input)
    .png({
      palette: true,
      compressionLevel: 9,
      quality: 100,
      effort: 10,
    })
    .toBuffer()
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

// 3. Copy & compress all assets from source dirs to correct shard dirs
async function main() {
  console.log('Copying & compressing assets to subpackages...')
  let copied = 0
  let compressed = 0
  for (const srcDir of SRC_DIRS) {
    if (!existsSync(srcDir)) {
      console.log(`  Source dir not found: ${srcDir} (skipping)`)
      continue
    }
    for (const f of readdirSync(srcDir)) {
      if (!f.endsWith('.png')) continue
      const normalizedName = f.toLowerCase()
      const shard = shardFor(normalizedName)
      const destDir = join(SUBPKG_BASE, `subpkg-a${shard}`, 'imgs')
      mkdirSync(destDir, { recursive: true })
      const dest = join(destDir, normalizedName)
      const raw = readFileSync(join(srcDir, f))
      const compressedBuf = await compressPNG(raw)
      writeFileSync(dest, compressedBuf)
      if (compressedBuf.length < raw.length) compressed++
      copied++
    }
  }
  console.log(`  ${copied} copied, ${compressed} compressed`)
  console.log('Done.')
}

main().catch((err) => {
  console.error('Asset setup failed:', err)
  process.exit(1)
})
