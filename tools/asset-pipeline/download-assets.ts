import { createHash } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'

// ── Types ──

interface AssetEntry {
  sourceId: string
  url: string
  localPath: string
  kind: 'portrait' | 'icon'
  ownerCanonicalId: string
}

interface DownloadResult {
  sourceId: string
  status: number
  byteSize: number | null
  sha256: string | null
  path: string | null
  error?: string
}

// ── Configuration ──

const VOYAGE_BASE = 'https://voyage.tw'
const ASSETS_DIR = 'miniprogram/assets'
const BATCH_SIZE = 8 // concurrent downloads
const BATCH_DELAY_MS = 100 // delay between batches

// ── URL construction ──

/** Construct a portrait URL from a source officer ID. */
const portraitUrl = (sourceId: string): string =>
  `${VOYAGE_BASE}/img/char/uwo_${sourceId}.png`

/** Construct a skill icon URL. Handles the 11-char truncation rule. */
const skillIconUrl = (sourceSkillId: string): string => {
  // Truncate IDs longer than 11 characters (voyage.tw rule)
  const truncated = sourceSkillId.length > 11 ? sourceSkillId.slice(0, 11) : sourceSkillId
  return `${VOYAGE_BASE}/img/skill/uwo_${truncated}.png`
}

/** Resolve the image source ID for a skill, considering icon overrides. */
const resolveSkillImageId = (
  skillId: string,
  skillMetadata: Record<string, { imageOverrideId: string | null }>,
): string => {
  const meta = skillMetadata[skillId]
  if (meta?.imageOverrideId) return meta.imageOverrideId
  return skillId
}

// ── Manifest ──

interface AssetManifestEntry {
  canonicalId: string
  kind: 'portrait' | 'icon'
  sourceId: string
  url: string
  status: number
  localPath: string | null
  byteSize: number | null
  sha256: string | null
}

// ── Download logic ──

const sha256Hex = (buffer: Buffer): string =>
  createHash('sha256').update(buffer).digest('hex')

const downloadOne = async (
  entry: AssetEntry,
): Promise<DownloadResult> => {
  try {
    const response = await fetch(entry.url)
    if (response.status !== 200) {
      return { sourceId: entry.sourceId, status: response.status, byteSize: null, sha256: null, path: null }
    }

    const buffer = Buffer.from(await response.arrayBuffer())
    writeFileSync(entry.localPath, buffer)

    return {
      sourceId: entry.sourceId,
      status: 200,
      byteSize: buffer.length,
      sha256: sha256Hex(buffer),
      path: entry.localPath,
    }
  } catch (err) {
    return {
      sourceId: entry.sourceId,
      status: 0,
      byteSize: null,
      sha256: null,
      path: null,
      error: String(err),
    }
  }
}

// ── Main download orchestrator ──

export const downloadAssets = async (
  entries: AssetEntry[],
  existingManifest?: AssetManifestEntry[],
): Promise<AssetManifestEntry[]> => {
  mkdirSync(ASSETS_DIR, { recursive: true })

  const existing = new Map((existingManifest ?? []).map((e) => [e.canonicalId, e]))
  const manifest: AssetManifestEntry[] = []
  const toDownload: AssetEntry[] = []

  // Filter out already-downloaded assets
  for (const entry of entries) {
    const prev = existing.get(entry.ownerCanonicalId)
    if (prev && prev.status === 200 && prev.sha256 && existsSync(prev.localPath!)) {
      manifest.push(prev)
      continue
    }
    toDownload.push(entry)
  }

  let downloaded = 0
  let skipped = manifest.length

  // Download in batches
  for (let i = 0; i < toDownload.length; i += BATCH_SIZE) {
    const batch = toDownload.slice(i, i + BATCH_SIZE)
    const results = await Promise.all(batch.map(downloadOne))

    for (let j = 0; j < batch.length; j++) {
      const entry = batch[j]!
      const result = results[j]!

      const manifestEntry: AssetManifestEntry = {
        canonicalId: entry.ownerCanonicalId,
        kind: entry.kind,
        sourceId: entry.sourceId,
        url: entry.url,
        status: result.status,
        localPath: result.path,
        byteSize: result.byteSize,
        sha256: result.sha256,
      }
      manifest.push(manifestEntry)

      if (result.status === 200) downloaded += 1
      else console.log(`  [${result.status}] ${entry.url}${result.error ? ' — ' + result.error : ''}`)
    }

    const pct = Math.round(((i + batch.length) / toDownload.length) * 100)
    process.stdout.write(`\r  Downloading... ${pct}% (${downloaded} ok, ${skipped} cached)`)
  }

  console.log(`\n  Done: ${downloaded} downloaded, ${skipped} cached, ${manifest.length - downloaded - skipped} failed`)
  return manifest
}

// ── Build entry list from canonical data ──

export const buildAssetEntries = (
  officerIds: string[],
  skillData: Array<{ id: string; imageOverrideId?: string | null }>,
  limit?: number,
): AssetEntry[] => {
  const entries: AssetEntry[] = []

  // Officer portraits (up to limit)
  const officerSlice = limit ? officerIds.slice(0, limit) : officerIds
  for (const sourceId of officerSlice) {
    entries.push({
      sourceId,
      url: portraitUrl(sourceId),
      localPath: `${ASSETS_DIR}/officer_${sourceId}.png`,
      kind: 'portrait',
      ownerCanonicalId: `officer_${sourceId}`,
    })
  }

  // Skill icons (up to limit)
  const skillSlice = limit ? skillData.slice(0, limit) : skillData
  for (const skill of skillSlice) {
    const imageId = skill.imageOverrideId ?? skill.id
    entries.push({
      sourceId: imageId,
      url: skillIconUrl(imageId),
      localPath: `${ASSETS_DIR}/skill_${skill.id}.png`,
      kind: 'icon',
      ownerCanonicalId: `skill_${skill.id}`,
    })
  }

  return entries
}

// ── CLI ──

if (process.argv[1]?.replace(/\\/g, '/').endsWith('tools/asset-pipeline/download-assets.ts')) {
  const limit = parseInt(process.argv[2] ?? '20', 10)

  // Read canonical data to build asset list
  const officers = JSON.parse(readFileSync('archive/voyage-tw-2026052501/canonical-candidates/officers.json', 'utf8'))
  const skills = JSON.parse(readFileSync('archive/voyage-tw-2026052501/canonical-candidates/skills.json', 'utf8'))
  const rawJsonChar = readFileSync('archive/voyage-tw-2026052501/raw-data/json_char.js', 'utf8')

  // Extract skill metadata (image overrides from skill_arr)
  const { parseSkills } = require('../import/parse-skills')
  const skillArr = parseSkills(rawJsonChar) as Record<string, { sourceCategoryId: string; imageOverrideId: string | null }>

  console.log(`=== Asset Downloader (batch size: ${BATCH_SIZE}, limit: ${limit ?? 'all'}) ===\n`)
  console.log(`Building asset list...`)

  const officerIds: string[] = officers.map((o: any) => o.sourceRefs.voyageTw)
  const skillList: Array<{ id: string; imageOverrideId: string | null }> = skills.map((s: any) => ({
    id: s.sourceRefs.voyageTw,
    imageOverrideId: skillArr[s.sourceRefs.voyageTw]?.imageOverrideId ?? null,
  }))

  const entries = buildAssetEntries(officerIds, skillList, limit ? limit * 2 : undefined)
  console.log(`  ${entries.length} assets to check (${entries.filter(e => e.kind === 'portrait').length} portraits, ${entries.filter(e => e.kind === 'icon').length} icons)\n`)

  // Load existing manifest
  let existingManifest: AssetManifestEntry[] = []
  try {
    existingManifest = JSON.parse(readFileSync(`${ASSETS_DIR}/asset-manifest.json`, 'utf8'))
    console.log(`Loaded existing manifest: ${existingManifest.length} entries\n`)
  } catch { /* no existing manifest */ }

  downloadAssets(entries, existingManifest).then((manifest) => {
    writeFileSync(`${ASSETS_DIR}/asset-manifest.json`, JSON.stringify(manifest, null, 2) + '\n')
    console.log(`Manifest saved to ${ASSETS_DIR}/asset-manifest.json`)

    const ok = manifest.filter((e) => e.status === 200).length
    const fail = manifest.filter((e) => e.status !== 200).length
    console.log(`\nSummary: ${ok} ok, ${fail} failed, ${manifest.length} total`)
  })
}
