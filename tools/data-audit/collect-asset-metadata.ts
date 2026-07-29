import { createHash } from 'node:crypto'
import { mkdir, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import manifest from '../../data/audit/asset-sample-manifest.json'
import { sourceConfig } from './source-config'

export interface AssetSampleEntry {
  ownerType: 'officer' | 'skill'
  ownerSourceId: string
  url: string
}

export interface AssetObservation {
  ownerType: 'officer' | 'skill'
  ownerSourceId: string
  url: string
  status: number
  mimeType: string | null
  byteSize: number | null
  width: number | null
  height: number | null
  sha256: string | null
  duplicateOf: string | null
  localFixturePath: string | null
}

const pngSignature = Buffer.from('89504e470d0a1a0a', 'hex')
const assetsDirectory = 'tests/fixtures/source-audit/assets'

const assertApprovedUrl = (value: string) => {
  const url = new URL(value)
  if (url.origin !== sourceConfig.origin || url.protocol !== 'https:') {
    throw new Error(`AUDIT_ASSET_URL_NOT_APPROVED:${value}`)
  }
}

const assertWithinLimit = (actual: number, limit: number, label: string) => {
  if (actual > limit) throw new Error(`AUDIT_SOURCE_LIMIT_EXCEEDED:${label}`)
}

const readBoundedBody = async (response: Response): Promise<Buffer> => {
  const declaredLength = response.headers.get('content-length')
  if (declaredLength !== null) {
    const parsedLength = Number(declaredLength)
    if (!Number.isSafeInteger(parsedLength) || parsedLength < 0) {
      throw new Error('AUDIT_ASSET_CONTENT_LENGTH_INVALID')
    }
    assertWithinLimit(parsedLength, sourceConfig.limits.assetBytes, 'assetBytes')
  }

  if (response.body === null) throw new Error('AUDIT_ASSET_BODY_MISSING')
  const reader = response.body.getReader()
  const chunks: Uint8Array[] = []
  let byteSize = 0

  try {
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      byteSize += value.byteLength
      if (byteSize > sourceConfig.limits.assetBytes) {
        await reader.cancel()
        throw new Error('AUDIT_SOURCE_LIMIT_EXCEEDED:assetBytes')
      }
      chunks.push(value)
    }
  } finally {
    reader.releaseLock()
  }

  return Buffer.concat(chunks)
}

const parsePngDimensions = (body: Buffer): { width: number; height: number } => {
  if (body.byteLength < 24 || !body.subarray(0, 8).equals(pngSignature)) {
    throw new Error('AUDIT_ASSET_PNG_INVALID')
  }
  if (body.subarray(12, 16).toString('ascii') !== 'IHDR') {
    throw new Error('AUDIT_ASSET_PNG_IHDR_MISSING')
  }
  return { width: body.readUInt32BE(16), height: body.readUInt32BE(20) }
}

const fixturePathFor = (entry: AssetSampleEntry) => `${assetsDirectory}/${entry.ownerSourceId}.png`

type WriteFixture = (path: string, body: Buffer) => Promise<void>

const collect = async (
  entries: readonly AssetSampleEntry[],
  fetcher: typeof fetch,
  writeFixture?: WriteFixture,
  allowFallback = true,
): Promise<AssetObservation[]> => {
  assertWithinLimit(entries.length, sourceConfig.limits.assets, 'assets')
  for (const entry of entries) assertApprovedUrl(entry.url)

  const orderedEntries = [...entries].sort(
    (left, right) =>
      left.ownerType.localeCompare(right.ownerType) ||
      left.ownerSourceId.localeCompare(right.ownerSourceId) ||
      left.url.localeCompare(right.url),
  )
  const knownHashes = new Map<string, string>()
  const observations: AssetObservation[] = []

  for (const entry of orderedEntries) {
    const response = await fetcher(entry.url)
    if (response.status !== 200) {
      observations.push({
        ownerType: entry.ownerType,
        ownerSourceId: entry.ownerSourceId,
        url: entry.url,
        status: response.status,
        mimeType: null,
        byteSize: null,
        width: null,
        height: null,
        sha256: null,
        duplicateOf: null,
        localFixturePath: null,
      })
      continue
    }

    const mimeType = response.headers.get('content-type')?.split(';', 1)[0]?.toLowerCase() ?? null
    if (mimeType !== 'image/png') throw new Error(`AUDIT_ASSET_MIME_INVALID:${entry.url}`)

    const body = await readBoundedBody(response)
    const { width, height } = parsePngDimensions(body)
    const sha256 = createHash('sha256').update(body).digest('hex')
    const localFixturePath = fixturePathFor(entry)
    const duplicateOf = knownHashes.get(sha256) ?? null
    if (duplicateOf === null) knownHashes.set(sha256, entry.url)
    if (writeFixture !== undefined) await writeFixture(localFixturePath, body)

    observations.push({
      ownerType: entry.ownerType,
      ownerSourceId: entry.ownerSourceId,
      url: entry.url,
      status: response.status,
      mimeType,
      byteSize: body.byteLength,
      width,
      height,
      sha256,
      duplicateOf,
      localFixturePath,
    })
  }

  const fallbackEntries = allowFallback
    ? observations
        .filter(
          ({ ownerType, ownerSourceId, status }) =>
            ownerType === 'skill' && status === 404 && ownerSourceId.length > 11,
        )
        .map(({ ownerType, ownerSourceId }) => ({
          ownerType,
          ownerSourceId,
          url: new URL(
            `/img/skill/uwo_${ownerSourceId.slice(0, 11)}.png`,
            sourceConfig.origin,
          ).toString(),
        }))
    : []
  assertWithinLimit(entries.length + fallbackEntries.length, sourceConfig.limits.assets, 'assets')
  const fallbackObservations =
    fallbackEntries.length === 0 ? [] : await collect(fallbackEntries, fetcher, writeFixture, false)

  return [...observations, ...fallbackObservations].sort(
    (left, right) =>
      left.ownerType.localeCompare(right.ownerType) ||
      left.ownerSourceId.localeCompare(right.ownerSourceId) ||
      left.url.localeCompare(right.url),
  )
}

export const collectAssetMetadata = async (
  entries: AssetSampleEntry[],
  fetcher: typeof fetch = fetch,
): Promise<AssetObservation[]> => collect(entries, fetcher)

const writeSamples = async () => {
  const outputDirectory = resolve(assetsDirectory)
  await mkdir(outputDirectory, { recursive: true })
  const observations = await collect(
    manifest as unknown as AssetSampleEntry[],
    fetch,
    async (path, body) => {
      await writeFile(resolve(path), body)
    },
  )
  await writeFile(
    resolve('tests/fixtures/source-audit/asset-observations.json'),
    `${JSON.stringify(observations, null, 2)}\n`,
    'utf8',
  )
  console.log(`Source asset audit: ${observations.length} observations`)
}

if (process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href) {
  void writeSamples()
}
