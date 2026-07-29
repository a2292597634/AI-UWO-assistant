import { createHash } from 'node:crypto'
import { mkdir, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import manifest from '../../data/audit/asset-sample-manifest.json'
import boundedSkills from '../../tests/fixtures/source-audit/skills.json'
import { sourceConfig } from './source-config'

export interface AssetSampleEntry {
  ownerType: 'officer' | 'skill'
  ownerSourceId: string
  url: string
  resolution?: AssetObservation['resolution']
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
  resolution?: {
    imageOverrideId: string | null
    metadataSourceRange: string | null
    rule: string
  }
}

export interface SkillImageMetadata {
  imageOverrideId: string | null
  metadataSourceRange: string
}

export interface SkillIconResolution {
  ownerSourceId: string
  imageOverrideId: string | null
  resolvedImageId: string
  url: string
  metadataSourceRange: string
  rule: string
}

export const skillIconResolutionRule =
  'Use skill_arr[skillId].i when present, then truncate image IDs longer than 11 characters.'

const pngSignature = Buffer.from('89504e470d0a1a0a', 'hex')
const assetsDirectory = 'tests/fixtures/source-audit/assets'

const compareUtf8Bytes = (left: string, right: string) =>
  Buffer.compare(Buffer.from(left, 'utf8'), Buffer.from(right, 'utf8'))

const boundedSkillMetadata = Object.fromEntries(
  Object.entries(boundedSkills).map(([skillId, skill]) => [
    skillId,
    { imageOverrideId: skill.imageOverrideId, metadataSourceRange: skill.metadataSourceRange },
  ]),
) as Record<string, SkillImageMetadata>

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

export const resolveSkillIconResolutions = (
  selectedSkillIds: readonly string[],
  skillMetadata: Record<string, SkillImageMetadata>,
): SkillIconResolution[] => {
  if (selectedSkillIds.length !== 20) {
    throw new Error(`AUDIT_SKILL_ICON_SELECTION_COUNT:${selectedSkillIds.length}`)
  }
  const seen = new Set<string>()
  for (const skillId of selectedSkillIds) {
    if (seen.has(skillId)) throw new Error(`AUDIT_SKILL_ICON_SELECTION_DUPLICATE:${skillId}`)
    seen.add(skillId)
  }

  return selectedSkillIds
    .map((ownerSourceId) => {
      const metadata = skillMetadata[ownerSourceId]
      if (
        metadata === undefined ||
        typeof metadata.metadataSourceRange !== 'string' ||
        metadata.metadataSourceRange.trim() === ''
      ) {
        throw new Error(`AUDIT_SKILL_ICON_METADATA_MISSING:${ownerSourceId}`)
      }
      if (
        metadata.imageOverrideId !== null &&
        (typeof metadata.imageOverrideId !== 'string' || metadata.imageOverrideId.trim() === '')
      ) {
        throw new Error(`AUDIT_SKILL_ICON_OVERRIDE_UNKNOWN:${ownerSourceId}`)
      }
      const requestedImageId = metadata.imageOverrideId ?? ownerSourceId
      const resolvedImageId =
        requestedImageId.length > 11 ? requestedImageId.slice(0, 11) : requestedImageId
      if (resolvedImageId === '') {
        throw new Error(`AUDIT_SKILL_ICON_RESOLUTION_UNRESOLVED:${ownerSourceId}`)
      }
      return {
        ownerSourceId,
        imageOverrideId: metadata.imageOverrideId,
        resolvedImageId,
        url: new URL(`/img/skill/uwo_${resolvedImageId}.png`, sourceConfig.origin).toString(),
        metadataSourceRange: metadata.metadataSourceRange,
        rule: skillIconResolutionRule,
      }
    })
    .sort((left, right) => compareUtf8Bytes(left.ownerSourceId, right.ownerSourceId))
}

export const validateSkillIconResolutions = (
  selectedSkillIds: readonly string[],
  skillMetadata: Record<string, SkillImageMetadata>,
  records: readonly SkillIconResolution[],
): void => {
  const expected = resolveSkillIconResolutions(selectedSkillIds, skillMetadata)
  if (records.length !== 20) {
    throw new Error(`AUDIT_SKILL_ICON_RESOLUTION_COUNT:${records.length}`)
  }

  const byOwnerSourceId = new Map<string, SkillIconResolution>()
  for (const record of records) {
    if (byOwnerSourceId.has(record.ownerSourceId)) {
      throw new Error(`AUDIT_SKILL_ICON_RESOLUTION_DUPLICATE:${record.ownerSourceId}`)
    }
    byOwnerSourceId.set(record.ownerSourceId, record)
  }

  for (const expectedRecord of expected) {
    const record = byOwnerSourceId.get(expectedRecord.ownerSourceId)
    if (record === undefined) {
      throw new Error(`AUDIT_SKILL_ICON_RESOLUTION_MISSING:${expectedRecord.ownerSourceId}`)
    }
    if (record.imageOverrideId !== expectedRecord.imageOverrideId) {
      throw new Error(`AUDIT_SKILL_ICON_OVERRIDE_UNKNOWN:${record.ownerSourceId}`)
    }
    if (record.rule !== expectedRecord.rule) {
      throw new Error(`AUDIT_SKILL_ICON_RULE_UNKNOWN:${record.ownerSourceId}`)
    }
    if (
      record.resolvedImageId !== expectedRecord.resolvedImageId ||
      record.url !== expectedRecord.url ||
      record.resolvedImageId === '' ||
      record.url === ''
    ) {
      throw new Error(`AUDIT_SKILL_ICON_RESOLUTION_UNRESOLVED:${record.ownerSourceId}`)
    }
    if (record.metadataSourceRange !== expectedRecord.metadataSourceRange) {
      throw new Error(`AUDIT_SKILL_ICON_METADATA_RANGE_UNKNOWN:${record.ownerSourceId}`)
    }
  }
}

type WriteFixture = (path: string, body: Buffer) => Promise<void>

const collect = async (
  entries: readonly AssetSampleEntry[],
  fetcher: typeof fetch,
  writeFixture?: WriteFixture,
  skillMetadata: Record<string, SkillImageMetadata> = {},
  knownHashes = new Map<string, string>(),
  allowFallback = true,
): Promise<AssetObservation[]> => {
  assertWithinLimit(entries.length, sourceConfig.limits.assets, 'assets')
  for (const entry of entries) assertApprovedUrl(entry.url)

  const orderedEntries = [...entries].sort(
    (left, right) =>
      compareUtf8Bytes(left.ownerType, right.ownerType) ||
      compareUtf8Bytes(left.ownerSourceId, right.ownerSourceId) ||
      compareUtf8Bytes(left.url, right.url),
  )
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
      resolution: entry.resolution,
    })
  }

  const fallbackEntries = allowFallback
    ? observations
        .filter(({ ownerType, status }) => ownerType === 'skill' && status === 404)
        .map(({ ownerType, ownerSourceId, url: directUrl }) => {
          const metadata = skillMetadata[ownerSourceId]
          const requestedImageId = metadata?.imageOverrideId ?? ownerSourceId
          const imageId =
            requestedImageId.length > 11 ? requestedImageId.slice(0, 11) : requestedImageId
          return {
            ownerType,
            ownerSourceId,
            directUrl,
            url: new URL(`/img/skill/uwo_${imageId}.png`, sourceConfig.origin).toString(),
            resolution: {
              imageOverrideId: metadata?.imageOverrideId ?? null,
              metadataSourceRange: metadata?.metadataSourceRange ?? null,
              rule: skillIconResolutionRule,
            },
          }
        })
        .filter(({ directUrl, url }) => directUrl !== url)
    : []
  assertWithinLimit(entries.length + fallbackEntries.length, sourceConfig.limits.assets, 'assets')
  const fallbackObservations =
    fallbackEntries.length === 0
      ? []
      : await collect(fallbackEntries, fetcher, writeFixture, skillMetadata, knownHashes, false)

  return [...observations, ...fallbackObservations].sort(
    (left, right) =>
      compareUtf8Bytes(left.ownerType, right.ownerType) ||
      compareUtf8Bytes(left.ownerSourceId, right.ownerSourceId) ||
      compareUtf8Bytes(left.url, right.url),
  )
}

export const collectAssetMetadata = async (
  entries: AssetSampleEntry[],
  fetcher: typeof fetch = fetch,
  skillMetadata: Record<string, SkillImageMetadata> = {},
): Promise<AssetObservation[]> => collect(entries, fetcher, undefined, skillMetadata)

const observationsPath = 'tests/fixtures/source-audit/asset-observations.json'

export const writeAssetSamples = async (
  entries: readonly AssetSampleEntry[],
  outputRoot: string,
  fetcher: typeof fetch = fetch,
  skillMetadata: Record<string, SkillImageMetadata> = {},
): Promise<AssetObservation[]> => {
  await mkdir(resolve(outputRoot, assetsDirectory), { recursive: true })
  const observations = await collect(
    entries,
    fetcher,
    async (path, body) => {
      await writeFile(resolve(outputRoot, path), body)
    },
    skillMetadata,
  )
  await writeFile(
    resolve(outputRoot, observationsPath),
    `${JSON.stringify(observations, null, 2)}\n`,
    'utf8',
  )
  return observations
}

const runCli = async () => {
  const observations = await writeAssetSamples(
    manifest as unknown as AssetSampleEntry[],
    process.cwd(),
    fetch,
    boundedSkillMetadata,
  )
  console.log(`Source asset audit: ${observations.length} observations`)
}

if (process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href) {
  void runCli()
}
