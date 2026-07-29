import { createHash } from 'node:crypto'
import { mkdir, writeFile } from 'node:fs/promises'
import { dirname } from 'node:path'
import { sourceConfig } from '../data-audit/source-config'

// ── Types ──

export interface DownloadResult {
  byteCount: number
  sha256: string
  lastModified: string | null
  contentRange?: string
}

interface RangeSpec {
  start: number
  end: number
}

// ── Helpers ──

export const rangeHeader = (start: number, end: number): string => `bytes=${start}-${end}`

const sha256Hex = (buffer: Buffer): string =>
  createHash('sha256').update(buffer).digest('hex')

// ── Full-file download ──

export const downloadFullFile = async (
  url: string,
  destPath: string,
  fetcher: typeof fetch = globalThis.fetch,
): Promise<DownloadResult> => {
  const response = await fetcher(url, { headers: {} })
  if (response.status !== 200) {
    throw new Error(`IMPORT_DOWNLOAD_STATUS:${url}:${response.status}`)
  }

  const buffer = Buffer.from(await response.arrayBuffer())
  await mkdir(dirname(destPath), { recursive: true })
  await writeFile(destPath, buffer)

  return {
    byteCount: buffer.length,
    sha256: sha256Hex(buffer),
    lastModified: response.headers.get('last-modified'),
  }
}

// ── Range download ──

export const downloadWithRanges = async (
  url: string,
  ranges: ReadonlyArray<readonly [number, number]>,
  destDir: string,
  fetcher: typeof fetch = globalThis.fetch,
): Promise<{ results: DownloadResult[]; combinedByteCount: number }> => {
  await mkdir(destDir, { recursive: true })

  const results: DownloadResult[] = []
  let combinedByteCount = 0

  for (let i = 0; i < ranges.length; i++) {
    const range = ranges[i]!
    const header = rangeHeader(range[0], range[1])
    const response = await fetcher(url, { headers: { Range: header } })

    if (response.status !== 206) {
      throw new Error(`IMPORT_RANGE_REQUIRED:${url}:${header}:${response.status}`)
    }

    const buffer = Buffer.from(await response.arrayBuffer())
    const filename = `r${i}.txt`
    await writeFile(`${destDir}/${filename}`, buffer)

    const result: DownloadResult = {
      byteCount: buffer.length,
      sha256: sha256Hex(buffer),
      lastModified: response.headers.get('last-modified'),
      contentRange: response.headers.get('content-range') ?? undefined,
    }
    results.push(result)
    combinedByteCount += buffer.length
  }

  return { results, combinedByteCount }
}

// ── Manifests ──

export interface SourceManifestFile {
  path: string
  url: string
  byteSize: number
  sha256: string
  downloadedAt: string
  contentRange?: string
  lastModified?: string | null
}

export interface SourceManifest {
  snapshotDate: string
  sourceOrigin: string
  dataVersion: string
  languageVersion: string
  files: SourceManifestFile[]
}

// ── Main download orchestrator ──

export const downloadAll = async (
  outputDir: string,
  fetcher: typeof fetch = globalThis.fetch,
): Promise<SourceManifest> => {
  const now = new Date().toISOString()
  const dataUrl = `${sourceConfig.origin}${sourceConfig.officerScript}`
  const langUrl = `${sourceConfig.origin}${sourceConfig.languageScript}`
  const langRangesDir = `${outputDir}/lang_1_ranges`

  // Download json_char.js (full)
  const dataFile = await downloadFullFile(dataUrl, `${outputDir}/json_char.js`, fetcher)

  // Download lang_1.js (4 ranges)
  const langRanges = sourceConfig.languageRanges.map((r) => [r[0], r[1]] as readonly [number, number])
  const langResult = await downloadWithRanges(langUrl, langRanges, langRangesDir, fetcher)

  const manifest: SourceManifest = {
    snapshotDate: now,
    sourceOrigin: sourceConfig.origin,
    dataVersion: sourceConfig.dataVersion,
    languageVersion: sourceConfig.languageVersion,
    files: [
      {
        path: 'json_char.js',
        url: dataUrl,
        byteSize: dataFile.byteCount,
        sha256: dataFile.sha256,
        downloadedAt: now,
        lastModified: dataFile.lastModified,
      },
      ...langResult.results.map((r, i) => ({
        path: `lang_1_ranges/r${i}.txt`,
        url: langUrl,
        byteSize: r.byteCount,
        sha256: r.sha256,
        downloadedAt: now,
        contentRange: r.contentRange,
        lastModified: r.lastModified,
      })),
    ],
  }

  // Write manifest
  await writeFile(`${outputDir}/source-manifest.json`, JSON.stringify(manifest, null, 2) + '\n')

  return manifest
}

// ── CLI entry ──

if (process.argv[1]?.replace(/\\/g, '/').endsWith('tools/import/download-source.ts')) {
  const archiveDir = 'archive/voyage-tw-2026052501/raw-data'
  downloadAll(archiveDir)
    .then((manifest) => {
      console.log(
        `Downloaded ${manifest.files.length} files (${manifest.files.reduce((sum, f) => sum + f.byteSize, 0)} bytes total)`,
      )
      console.log(`Source manifest: ${archiveDir}/source-manifest.json`)
    })
    .catch((error) => {
      console.error('Download failed:', error.message)
      process.exit(1)
    })
}
