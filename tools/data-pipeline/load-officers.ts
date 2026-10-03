import { existsSync, readFileSync } from 'node:fs'
import type { CanonicalOfficer, CanonicalOfficerSourceRefs } from '../import/types'

const OFFICIAL_FILE = 'officers.json'
const CUSTOM_FILE = 'custom-officers.json'

const readJson = (path: string): unknown => JSON.parse(readFileSync(path, 'utf8')) as unknown

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

const parseSourceRefs = (value: unknown, index: number): CanonicalOfficerSourceRefs => {
  if (!isRecord(value)) {
    throw new Error(`Invalid sourceRefs at custom officer index ${index}`)
  }

  const keys = Object.keys(value)
  const hasVoyageTw = typeof value.voyageTw === 'string' && value.voyageTw.length > 0
  const hasSubmissionId = typeof value.submissionId === 'string' && value.submissionId.length > 0
  const hasWorkOrderId = typeof value.workOrderId === 'string' && value.workOrderId.length > 0
  const isValidShape =
    keys.length === 1 &&
    ((hasVoyageTw && keys[0] === 'voyageTw') ||
      (hasSubmissionId && keys[0] === 'submissionId') ||
      (hasWorkOrderId && keys[0] === 'workOrderId'))

  if (!isValidShape) {
    throw new Error(`Invalid sourceRefs at custom officer index ${index}`)
  }

  return hasVoyageTw
    ? { voyageTw: value.voyageTw as string }
    : hasSubmissionId
      ? { submissionId: value.submissionId as string }
      : { workOrderId: value.workOrderId as string }
}

const parseOfficerArray = (value: unknown, sourceName: string): CanonicalOfficer[] => {
  if (!Array.isArray(value)) throw new Error(`${sourceName} must contain an array`)

  return value.map((raw, index) => {
    if (!isRecord(raw) || typeof raw.id !== 'string' || raw.id.length === 0) {
      throw new Error(`Invalid officer at ${sourceName}[${index}]`)
    }
    if (typeof raw.name !== 'string' || raw.name.trim().length === 0) {
      throw new Error(`Invalid officer name at ${sourceName}[${index}]`)
    }

    return {
      ...raw,
      sourceRefs: parseSourceRefs(raw.sourceRefs, index),
    } as CanonicalOfficer
  })
}

export interface OfficerMasterCollections {
  official: CanonicalOfficer[]
  custom: CanonicalOfficer[]
  sourceFileById: ReadonlyMap<string, 'officers' | 'custom-officers'>
}

/** 載入合併集合並保留原 master 文件歸屬；不改 ID 或來源引用。 */
export const loadOfficerMasterCollections = (masterDir: string): OfficerMasterCollections => {
  const official = parseOfficerArray(readJson(`${masterDir}/${OFFICIAL_FILE}`), OFFICIAL_FILE)
  const customPath = `${masterDir}/${CUSTOM_FILE}`
  const custom = existsSync(customPath) ? parseOfficerArray(readJson(customPath), CUSTOM_FILE) : []
  const sourceFileById = new Map<string, 'officers' | 'custom-officers'>()
  for (const [source, rows] of [
    ['officers', official],
    ['custom-officers', custom],
  ] as const) {
    for (const officer of rows) {
      if (sourceFileById.has(officer.id)) throw new Error(`Duplicate officer ID: ${officer.id}`)
      sourceFileById.set(officer.id, source)
    }
  }
  return { official, custom, sourceFileById }
}

/** 官方接自訂，維持既有讀取介面及原文件順序。 */
export const loadCanonicalOfficers = (masterDir = 'data/master'): CanonicalOfficer[] => {
  const collections = loadOfficerMasterCollections(masterDir)
  return [...collections.official, ...collections.custom]
}
