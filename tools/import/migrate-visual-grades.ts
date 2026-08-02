import { readFileSync, writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { resolve } from 'node:path'
import { parseOfficers } from './parse-officers'
import type { CanonicalOfficer, SourceOfficer } from './types'
import { deriveVisualGradeId } from './visual-grade'

type CanonicalOfficerBeforeVisualGrade = Omit<CanonicalOfficer, 'visualGradeId'> & {
  visualGradeId?: CanonicalOfficer['visualGradeId']
}

const ARCHIVE_SOURCE_PATH = 'archive/voyage-tw-2026052501/raw-data/json_char.js'
const MASTER_OUTPUT_PATH = 'data/master/officers.json'

export const migrateVisualGrades = (
  canonical: CanonicalOfficerBeforeVisualGrade[],
  source: Record<string, SourceOfficer>,
): CanonicalOfficer[] =>
  canonical.map((officer) => {
    const sourceId = officer.sourceRefs.voyageTw
    const sourceOfficer = source[sourceId]
    if (!sourceOfficer) throw new Error(`VISUAL_GRADE_SOURCE_MISSING: ${sourceId}`)

    return {
      ...officer,
      visualGradeId: deriveVisualGradeId(sourceOfficer),
    }
  })

const migrateMasterOfficers = (): void => {
  const source = parseOfficers(readFileSync(ARCHIVE_SOURCE_PATH, 'utf8'))
  const canonical = JSON.parse(
    readFileSync(MASTER_OUTPUT_PATH, 'utf8'),
  ) as CanonicalOfficerBeforeVisualGrade[]
  const migrated = migrateVisualGrades(canonical, source)

  writeFileSync(MASTER_OUTPUT_PATH, `${JSON.stringify(migrated, null, 2)}\n`)
}

const entryFile = process.argv[1]
if (entryFile && resolve(entryFile) === fileURLToPath(import.meta.url)) {
  migrateMasterOfficers()
}
