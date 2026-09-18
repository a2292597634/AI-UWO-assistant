import { createHash } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import {
  isVoyageTwOfficerSourceRefs,
  type CanonicalOfficer,
  type CanonicalTradeDataset,
  type CanonicalTradeGood,
} from '../import/types'
import { loadCanonicalOfficers } from '../data-pipeline/load-officers'
import { loadSkillIconOverrides } from './source-skill-icons'
import { buildTradeIconSources, tradeIconUrl } from './trade-icons'

// ── Types ──

export interface AssetEntry {
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
export const ASSET_STAGING_DIR = 'data/assets/staging'
const ASSETS_DIR = ASSET_STAGING_DIR
const SOURCE_MANIFEST_PATH = 'data/assets/source-asset-manifest.json'
const BATCH_SIZE = 8 // concurrent downloads
const BATCH_DELAY_MS = 100
const BATCH_DELAY_JITTER_MS = 50
export const ASSET_DOWNLOAD_USER_AGENT = 'uwo-assistant-asset-pipeline/1.0'

export interface DownloadAssetsOptions {
  fetcher?: typeof fetch
  sleep?: (milliseconds: number) => Promise<void>
  random?: () => number
  batchDelayMs?: number
  batchDelayJitterMs?: number
  userAgent?: string
}

// ── URL construction ──

/** Construct a portrait URL from a source officer ID. */
const portraitUrl = (sourceId: string): string => `${VOYAGE_BASE}/img/char/uwo_${sourceId}.png`

/** Construct a skill icon URL. Handles the 11-char truncation rule. */
const skillIconUrl = (sourceSkillId: string): string => {
  // Truncate IDs longer than 11 characters (voyage.tw rule)
  const truncated = sourceSkillId.length > 11 ? sourceSkillId.slice(0, 11) : sourceSkillId
  return `${VOYAGE_BASE}/img/skill/uwo_${truncated}.png`
}

/** Resolve the image source ID for a skill, considering icon overrides. */
const _resolveSkillImageId = (
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

const sha256Hex = (buffer: Buffer): string => createHash('sha256').update(buffer).digest('hex')

const isValidCachedAsset = (entry: AssetManifestEntry | undefined): entry is AssetManifestEntry => {
  if (
    !entry ||
    entry.status !== 200 ||
    !entry.sha256 ||
    !entry.localPath ||
    !existsSync(entry.localPath)
  ) {
    return false
  }

  try {
    const buffer = readFileSync(entry.localPath)
    if (entry.byteSize !== null && entry.byteSize !== buffer.length) return false
    return sha256Hex(buffer) === entry.sha256
  } catch {
    return false
  }
}

const downloadOne = async (
  entry: AssetEntry,
  fetcher: typeof fetch,
  userAgent: string,
): Promise<DownloadResult> => {
  try {
    const response = await fetcher(entry.url, {
      headers: { 'user-agent': userAgent },
    })
    if (response.status !== 200) {
      return {
        sourceId: entry.sourceId,
        status: response.status,
        byteSize: null,
        sha256: null,
        path: null,
      }
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
  options: DownloadAssetsOptions = {},
): Promise<AssetManifestEntry[]> => {
  const fetcher = options.fetcher ?? fetch
  const sleep =
    options.sleep ??
    ((milliseconds: number) =>
      new Promise<void>((resolve) => {
        setTimeout(resolve, milliseconds)
      }))
  const random = options.random ?? Math.random
  const batchDelayMs = Math.max(0, Math.floor(options.batchDelayMs ?? BATCH_DELAY_MS))
  const batchDelayJitterMs = Math.max(
    0,
    Math.floor(options.batchDelayJitterMs ?? BATCH_DELAY_JITTER_MS),
  )
  const userAgent = options.userAgent ?? ASSET_DOWNLOAD_USER_AGENT

  mkdirSync(ASSETS_DIR, { recursive: true })

  const existing = new Map((existingManifest ?? []).map((e) => [e.canonicalId, e]))
  const manifest: AssetManifestEntry[] = []
  const toDownload: AssetEntry[] = []

  // Filter out already-downloaded assets
  for (const entry of entries) {
    const prev = existing.get(entry.ownerCanonicalId)
    if (isValidCachedAsset(prev)) {
      manifest.push(prev)
      continue
    }
    toDownload.push(entry)
  }

  let downloaded = 0
  const skipped = manifest.length

  // Download in batches
  for (let i = 0; i < toDownload.length; i += BATCH_SIZE) {
    const batch = toDownload.slice(i, i + BATCH_SIZE)
    const results = await Promise.all(batch.map((entry) => downloadOne(entry, fetcher, userAgent)))

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
      else
        console.log(`  [${result.status}] ${entry.url}${result.error ? ' — ' + result.error : ''}`)
    }

    const pct = Math.round(((i + batch.length) / toDownload.length) * 100)
    process.stdout.write(`\r  Downloading... ${pct}% (${downloaded} ok, ${skipped} cached)`)

    if (i + batch.length < toDownload.length) {
      const randomValue = Math.min(Math.max(random(), 0), 1)
      const jitter = Math.floor(randomValue * (batchDelayJitterMs + 1))
      await sleep(batchDelayMs + jitter)
    }
  }

  console.log(
    `\n  Done: ${downloaded} downloaded, ${skipped} cached, ${manifest.length - downloaded - skipped} failed`,
  )
  return manifest
}

// ── Build entry list from canonical data ──

export const buildAssetEntries = (
  officers: Array<{ canonicalId: string; sourceId: string }>,
  skillData: Array<{ id: string; imageOverrideId?: string | null }>,
  limit?: number,
): AssetEntry[] => {
  const entries: AssetEntry[] = []

  // Officer portraits (up to limit)
  const officerSlice = limit ? officers.slice(0, limit) : officers
  for (const officer of officerSlice) {
    entries.push({
      sourceId: officer.sourceId,
      url: portraitUrl(officer.sourceId),
      localPath: `${ASSETS_DIR}/${officer.canonicalId}.png`,
      kind: 'portrait',
      ownerCanonicalId: officer.canonicalId,
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

export const buildTradeAssetEntries = (trades: readonly CanonicalTradeGood[]): AssetEntry[] =>
  buildTradeIconSources(trades).map(({ imageId, filename }) => ({
    ownerCanonicalId: `trade-icon_${imageId}`,
    kind: 'icon',
    sourceId: imageId,
    url: tradeIconUrl(imageId),
    localPath: `${ASSETS_DIR}/${filename}`,
  }))

// ── CLI ──

if (process.argv[1]?.replace(/\\/g, '/').endsWith('tools/asset-pipeline/download-assets.ts')) {
  const limit = parseInt(process.argv[2] ?? '20', 10)

  // Read canonical data to build asset list
  const officers = loadCanonicalOfficers('data/master')
  const skills = JSON.parse(readFileSync('data/master/skills.json', 'utf8'))
  const tradeDataset = JSON.parse(
    readFileSync('data/master/trade-goods.json', 'utf8'),
  ) as CanonicalTradeDataset
  const skillIconOverrides = loadSkillIconOverrides()

  console.log(`=== Asset Downloader (batch size: ${BATCH_SIZE}, limit: ${limit ?? 'all'}) ===\n`)
  console.log(`Building asset list...`)

  const officerData: Array<{ canonicalId: string; sourceId: string }> = officers
    .filter((o): o is CanonicalOfficer & { sourceRefs: { voyageTw: string } } =>
      isVoyageTwOfficerSourceRefs(o.sourceRefs),
    )
    .map((o) => ({
      canonicalId: o.id,
      sourceId: o.sourceRefs.voyageTw,
    }))
  const skillList: Array<{ id: string; imageOverrideId: string | null }> = skills.map(
    (s: { sourceRefs: { voyageTw: string }; iconId: string | null }) => ({
      id: s.sourceRefs.voyageTw,
      imageOverrideId:
        skillIconOverrides
          .get(`skill_${s.sourceRefs.voyageTw}`)
          ?.replace(/^skill_/, '')
          .replace(/\.png$/, '') ?? null,
    }),
  )

  const entries = [
    ...buildAssetEntries(officerData, skillList, limit ? limit * 2 : undefined),
    ...buildTradeAssetEntries(tradeDataset.tradeGoods),
  ]
  console.log(
    `  ${entries.length} assets to check (${entries.filter((e) => e.kind === 'portrait').length} portraits, ${entries.filter((e) => e.kind === 'icon').length} icons)\n`,
  )

  // Load existing manifest
  let existingManifest: AssetManifestEntry[] = []
  try {
    existingManifest = JSON.parse(readFileSync(SOURCE_MANIFEST_PATH, 'utf8'))
    console.log(`Loaded existing manifest: ${existingManifest.length} entries\n`)
  } catch {
    /* no existing manifest */
  }

  downloadAssets(entries, existingManifest).then((manifest) => {
    mkdirSync('data/assets', { recursive: true })
    writeFileSync(SOURCE_MANIFEST_PATH, JSON.stringify(manifest, null, 2) + '\n')
    console.log(`Manifest saved to ${SOURCE_MANIFEST_PATH}`)

    const ok = manifest.filter((e) => e.status === 200).length
    const fail = manifest.filter((e) => e.status !== 200).length
    console.log(`\nSummary: ${ok} ok, ${fail} failed, ${manifest.length} total`)

    if (fail > 0) {
      console.error(`\nAsset download incomplete: ${fail} asset(s) failed.`)
      process.exitCode = 1
    }
  })
}
