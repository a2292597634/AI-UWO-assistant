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
  const isValidShape =
    keys.length === 1 &&
    ((hasVoyageTw && keys[0] === 'voyageTw') || (hasSubmissionId && keys[0] === 'submissionId'))

  if (!isValidShape) {
    throw new Error(`Invalid sourceRefs at custom officer index ${index}`)
  }

  return hasVoyageTw
    ? { voyageTw: value.voyageTw as string }
    : { submissionId: value.submissionId as string }
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

/** Load official officers followed by approved custom officers in master-file order. */
export const loadCanonicalOfficers = (masterDir = 'data/master'): CanonicalOfficer[] => {
  const officialPath = `${masterDir}/${OFFICIAL_FILE}`
  const official = parseOfficerArray(readJson(officialPath), OFFICIAL_FILE)
  const customPath = `${masterDir}/${CUSTOM_FILE}`
  const custom = existsSync(customPath) ? parseOfficerArray(readJson(customPath), CUSTOM_FILE) : []

  const all = [...official, ...custom]
  const seenIds = new Set<string>()
  for (const officer of all) {
    if (seenIds.has(officer.id)) throw new Error(`Duplicate officer ID: ${officer.id}`)
    seenIds.add(officer.id)
  }

  return all
}
