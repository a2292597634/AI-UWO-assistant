import { createHash } from 'node:crypto'
import { mkdir, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { extractJsString, extractJsValue } from './extract-js-value'
import { sourceConfig } from './source-config'

export interface SourceSelection {
  officerIds: readonly string[]
  skillIds: readonly string[]
}

export interface CapturedSkillSample {
  name: string
  description: string
  sourceCategoryId: string
  imageOverrideId: string | null
  metadataSourceRange: string
  sourceCategoryName: string
}

export interface OfficerNameEvidence {
  ownerSourceId: string
  name: string
  sourceUrl: string
  metadataSourceRange: string
  contentRange: string
  lastModified: string | null
  sha256: string
  rule: string
}

export interface CapturedSourceSamples {
  officers: Record<string, Record<string, unknown>>
  skills: Record<string, CapturedSkillSample>
  metadata: Array<{
    url: string
    range: string
    contentRange: string
    lastModified: string | null
    sha256: string
  }>
}

type Range = readonly [number, number]

const rangeHeader = ([start, end]: Range) => `bytes=${start}-${end}`

const totalRangeBytes = (ranges: readonly Range[]) =>
  ranges.reduce((total, [start, end]) => total + end - start + 1, 0)

const assertWithinLimit = (actual: number, limit: number, label: string) => {
  if (actual > limit) throw new Error(`AUDIT_SOURCE_LIMIT_EXCEEDED:${label}`)
}

const assertBelowLimit = (actual: number, limit: number, label: string) => {
  if (actual >= limit) throw new Error(`AUDIT_SOURCE_LIMIT_EXCEEDED:${label}`)
}

const assertApprovedIds = (
  ids: readonly string[],
  approvedIds: readonly string[],
  label: string,
) => {
  const approved = new Set<string>(approvedIds)
  for (const id of ids) {
    if (!approved.has(id)) throw new Error(`AUDIT_SOURCE_ID_NOT_APPROVED:${label}:${id}`)
  }
}

const validateSelection = (selection: SourceSelection) => {
  assertApprovedIds(selection.officerIds, sourceConfig.officerIds, 'officer')
  assertApprovedIds(selection.skillIds, sourceConfig.skillIds, 'skill')
  assertWithinLimit(selection.officerIds.length, sourceConfig.limits.officers, 'officers')
  assertWithinLimit(selection.skillIds.length, sourceConfig.limits.skills, 'skills')
  assertWithinLimit(0, sourceConfig.limits.assets, 'assets')
  assertWithinLimit(0, sourceConfig.limits.assetBytes, 'assetBytes')
  assertWithinLimit(
    totalRangeBytes([...sourceConfig.officerRanges, ...sourceConfig.skillMetadataRanges]),
    sourceConfig.limits.bytesPerFile,
    'officerBytes',
  )
  assertWithinLimit(
    totalRangeBytes(sourceConfig.languageRanges),
    sourceConfig.limits.languageBytesPerFile,
    'languageBytes',
  )
}

const readBoundedRange = async (
  fetcher: typeof fetch,
  url: string,
  range: Range,
): Promise<{
  source: string
  byteLength: number
  metadata: CapturedSourceSamples['metadata'][number]
}> => {
  const rangeValue = rangeHeader(range)
  const response = await fetcher(url, { headers: { Range: rangeValue } })
  if (response.status !== 206) throw new Error(`AUDIT_RANGE_REQUIRED:${url}`)

  const contentRange = response.headers.get('content-range')
  const expected = `bytes ${range[0]}-${range[1]}/`
  if (contentRange === null || !contentRange.startsWith(expected)) {
    throw new Error(`AUDIT_CONTENT_RANGE_MISMATCH:${rangeValue}`)
  }

  const payload = Buffer.from(await response.arrayBuffer())
  const expectedLength = range[1] - range[0] + 1
  if (payload.byteLength !== expectedLength) {
    throw new Error(`AUDIT_RANGE_LENGTH_MISMATCH:${rangeValue}`)
  }

  return {
    source: payload.toString('utf8'),
    byteLength: payload.byteLength,
    metadata: {
      url,
      range: rangeValue,
      contentRange,
      lastModified: response.headers.get('last-modified'),
      sha256: createHash('sha256').update(payload).digest('hex'),
    },
  }
}

const extractOptionalString = (source: string, key: string): string | undefined => {
  try {
    return extractJsString(source, key)
  } catch (error) {
    if (error instanceof Error && error.message === `AUDIT_SOURCE_KEY_MISSING:${key}`)
      return undefined
    throw error
  }
}

export const captureOfficerNameEvidence = async (
  officerId: string,
  fetcher: typeof fetch = fetch,
): Promise<OfficerNameEvidence> => {
  assertApprovedIds([officerId], sourceConfig.officerIds, 'officer')
  assertWithinLimit(
    totalRangeBytes(sourceConfig.languageRanges),
    sourceConfig.limits.languageBytesPerFile,
    'languageBytes',
  )
  const sourceUrl = new URL(sourceConfig.languageScript, sourceConfig.origin).toString()

  for (const range of sourceConfig.languageRanges) {
    const captured = await readBoundedRange(fetcher, sourceUrl, range)
    let name: string
    try {
      name = extractJsString(captured.source, officerId)
    } catch (error) {
      if (error instanceof Error && error.message === `AUDIT_SOURCE_KEY_MISSING:${officerId}`) {
        continue
      }
      throw error
    }

    return {
      ownerSourceId: officerId,
      name,
      sourceUrl,
      metadataSourceRange: rangeHeader(range),
      contentRange: captured.metadata.contentRange,
      lastModified: captured.metadata.lastModified,
      sha256: captured.metadata.sha256,
      rule:
        'Use the exact lang_js[1][officerId] value from the first approved bounded range containing the key.',
    }
  }

  throw new Error(`AUDIT_SOURCE_KEY_MISSING:${officerId}`)
}

export const captureSourceSamples = async (
  fetcher: typeof fetch = fetch,
  selection: Partial<SourceSelection> = {},
): Promise<CapturedSourceSamples> => {
  const selected: SourceSelection = {
    officerIds: selection.officerIds ?? sourceConfig.officerIds,
    skillIds: selection.skillIds ?? sourceConfig.skillIds,
  }
  validateSelection(selected)

  const metadata: CapturedSourceSamples['metadata'] = []
  const officerUrl = new URL(sourceConfig.officerScript, sourceConfig.origin).toString()
  const languageUrl = new URL(sourceConfig.languageScript, sourceConfig.origin).toString()
  const officers: Record<string, Record<string, unknown>> = {}
  const skills: Record<string, CapturedSkillSample> = {}
  const skillNames: Partial<Record<string, string>> = {}
  const skillDescriptions: Partial<Record<string, string>> = {}
  const skillCategoryNames: Partial<Record<string, string>> = {}
  const skillMetadata: Partial<
    Record<
      string,
      Pick<CapturedSkillSample, 'sourceCategoryId' | 'imageOverrideId' | 'metadataSourceRange'>
    >
  > = {}
  let officerBytes = 0
  let languageBytes = 0

  for (const range of sourceConfig.officerRanges) {
    const captured = await readBoundedRange(fetcher, officerUrl, range)
    officerBytes += captured.byteLength
    assertBelowLimit(officerBytes, sourceConfig.limits.bytesPerFile, 'officerBytes')
    metadata.push(captured.metadata)
    for (const officerId of selected.officerIds) {
      if (officerId in officers) continue
      try {
        officers[officerId] = extractJsValue<Record<string, unknown>>(captured.source, officerId)
      } catch (error) {
        if (error instanceof Error && error.message === `AUDIT_SOURCE_KEY_MISSING:${officerId}`)
          continue
        throw error
      }
    }
  }

  for (const officerId of selected.officerIds) {
    if (!(officerId in officers)) throw new Error(`AUDIT_SOURCE_KEY_MISSING:${officerId}`)
  }

  const metadataChunks: Array<{ range: Range; source: string }> = []
  for (const range of sourceConfig.skillMetadataRanges) {
    const captured = await readBoundedRange(fetcher, officerUrl, range)
    officerBytes += captured.byteLength
    assertBelowLimit(officerBytes, sourceConfig.limits.bytesPerFile, 'officerBytes')
    metadata.push(captured.metadata)
    metadataChunks.push({ range, source: captured.source })
  }
  const metadataSource = metadataChunks.map((chunk) => chunk.source).join('')
  for (const skillId of selected.skillIds) {
    const sourceMetadata = extractJsValue<Record<string, unknown>>(metadataSource, skillId)
    if (typeof sourceMetadata.t !== 'string' || sourceMetadata.t.trim() === '') {
      throw new Error(`AUDIT_SKILL_CATEGORY_MISSING:${skillId}`)
    }
    const sourceChunk = metadataChunks.find((chunk) => chunk.source.includes(`"${skillId}"`))
    if (sourceChunk === undefined) throw new Error(`AUDIT_SKILL_METADATA_RANGE_MISSING:${skillId}`)
    if (sourceMetadata.i !== undefined && typeof sourceMetadata.i !== 'string') {
      throw new Error(`AUDIT_SKILL_IMAGE_OVERRIDE_INVALID:${skillId}`)
    }
    skillMetadata[skillId] = {
      sourceCategoryId: sourceMetadata.t,
      imageOverrideId: sourceMetadata.i ?? null,
      metadataSourceRange: rangeHeader(sourceChunk.range),
    }
  }
  for (const range of sourceConfig.languageRanges) {
    const captured = await readBoundedRange(fetcher, languageUrl, range)
    languageBytes += captured.byteLength
    assertBelowLimit(languageBytes, sourceConfig.limits.languageBytesPerFile, 'languageBytes')
    metadata.push(captured.metadata)
    for (const skillId of selected.skillIds) {
      if (skillNames[skillId] === undefined) {
        const name = extractOptionalString(captured.source, skillId)
        if (name !== undefined) skillNames[skillId] = name
      }
      if (skillDescriptions[skillId] === undefined) {
        const description = extractOptionalString(captured.source, `${skillId}des`)
        if (description !== undefined) skillDescriptions[skillId] = description
      }
      const sourceCategoryId = skillMetadata[skillId]?.sourceCategoryId
      if (sourceCategoryId !== undefined && skillCategoryNames[sourceCategoryId] === undefined) {
        const categoryName = extractOptionalString(captured.source, sourceCategoryId)
        if (categoryName !== undefined) skillCategoryNames[sourceCategoryId] = categoryName
      }
    }
    if (
      selected.skillIds.every(
        (skillId) =>
          skillNames[skillId] !== undefined &&
          skillDescriptions[skillId] !== undefined &&
          skillCategoryNames[skillMetadata[skillId]?.sourceCategoryId ?? ''] !== undefined,
      )
    ) {
      break
    }
  }

  for (const skillId of selected.skillIds) {
    const name = skillNames[skillId]
    const description = skillDescriptions[skillId]
    if (name === undefined || description === undefined) {
      throw new Error(`AUDIT_SOURCE_KEY_MISSING:${skillId}`)
    }
    const capturedMetadata = skillMetadata[skillId]
    if (capturedMetadata === undefined) throw new Error(`AUDIT_SOURCE_KEY_MISSING:${skillId}`)
    const sourceCategoryName = skillCategoryNames[capturedMetadata.sourceCategoryId]
    if (sourceCategoryName === undefined) {
      throw new Error(`AUDIT_SOURCE_KEY_MISSING:${capturedMetadata.sourceCategoryId}`)
    }
    skills[skillId] = { name, description, sourceCategoryName, ...capturedMetadata }
  }

  return { officers, skills, metadata }
}

const sortJson = (value: unknown): unknown => {
  if (Array.isArray(value)) return value.map(sortJson)
  if (value !== null && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, item]) => [key, sortJson(item)]),
    )
  }
  return value
}

const writeSamples = async () => {
  const samples = await captureSourceSamples()
  const outputDirectory = resolve('tests/fixtures/source-audit')
  await mkdir(outputDirectory, { recursive: true })
  await Promise.all([
    writeFile(
      resolve(outputDirectory, 'source-samples.json'),
      `${JSON.stringify(sortJson(samples), null, 2)}\n`,
      'utf8',
    ),
    writeFile(
      resolve(outputDirectory, 'skills.json'),
      `${JSON.stringify(sortJson(samples.skills), null, 2)}\n`,
      'utf8',
    ),
    writeFile(
      resolve(outputDirectory, 'source-metadata.json'),
      `${JSON.stringify(sortJson(samples.metadata), null, 2)}\n`,
      'utf8',
    ),
  ])

  console.log(
    `Source audit capture: ${Object.keys(samples.officers).length} officers, ${Object.keys(samples.skills).length} skills`,
  )
}

if (process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href) {
  void writeSamples()
}
