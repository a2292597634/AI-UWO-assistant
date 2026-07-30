import { readFileSync, writeFileSync, existsSync } from 'node:fs'
import { mkdir } from 'node:fs/promises'
import type { SourceEnumValue, SkillMappingRecord, SourceFieldRecord } from '../data-audit/types'
import { createSchemaValidator } from '../data-audit/create-schema-validator'
import type { CanonicalOutput, ImportReport } from './types'
import { parseOfficers } from './parse-officers'
import { parseLanguageMap } from './parse-languages'
import { parseSkills } from './parse-skills'
import { transformOfficers } from './transform-officers'
import { transformSkills } from './transform-skills'
import { buildDictionaries } from './build-dictionaries'
import { validateCandidates } from './validate-candidates'

const ARCHIVE_DIR = 'archive/voyage-tw-2026052501'
const RAW_DIR = `${ARCHIVE_DIR}/raw-data`
const OUTPUT_DIR = `${ARCHIVE_DIR}/canonical-candidates`

/**
 * Main import orchestrator.
 *
 * Flow: read source → parse → transform → validate → write output.
 */
const runImport = async (): Promise<void> => {
  console.log('=== Phase 3: voyage.tw Importer ===\n')

  // ── 1. Read source files ──
  console.log('[1/6] Reading source files...')

  const jsonCharPath = `${RAW_DIR}/json_char.js`
  if (!existsSync(jsonCharPath)) {
    console.error(`ERROR: ${jsonCharPath} not found. Run "npm run import:download" first.`)
    process.exit(1)
  }

  const jsonCharSource = readFileSync(jsonCharPath, 'utf8')

  // Read lang_1.js range files
  const langRanges: string[] = []
  for (let i = 0; i < 4; i++) {
    const path = `${RAW_DIR}/lang_1_ranges/r${i}.txt`
    if (existsSync(path)) {
      langRanges.push(readFileSync(path, 'utf8'))
    }
  }
  if (langRanges.length === 0) {
    console.error('ERROR: No lang_1.js range files found. Run "npm run import:download" first.')
    process.exit(1)
  }
  console.log(`  json_char.js: ${jsonCharSource.length} chars`)
  console.log(`  lang_1.js ranges: ${langRanges.length} files`)

  // ── 2. Parse ──
  console.log('\n[2/6] Parsing source data...')

  const languageMap = parseLanguageMap(langRanges)
  console.log(`  Display name map: ${Object.keys(languageMap).length} keys`)

  const sourceOfficers = parseOfficers(jsonCharSource)
  console.log(`  Source officers: ${Object.keys(sourceOfficers).length}`)

  const skillMetadata = parseSkills(jsonCharSource)
  console.log(`  Skill metadata: ${Object.keys(skillMetadata).length}`)

  // ── 3. Transform ──
  console.log('\n[3/6] Transforming to canonical format...')

  const fieldInventory = JSON.parse(
    readFileSync('data/audit/source-field-inventory.json', 'utf8'),
  ) as SourceFieldRecord[]
  const enumInventory = JSON.parse(
    readFileSync('data/audit/source-enum-inventory.json', 'utf8'),
  ) as SourceEnumValue[]
  const mappingTable = JSON.parse(
    readFileSync('data/audit/skill-group-mapping.json', 'utf8'),
  ) as SkillMappingRecord[]

  const { officers, anomalies: officerAnomalies } = transformOfficers(
    sourceOfficers,
    languageMap,
    skillMetadata,
    fieldInventory,
    enumInventory,
    mappingTable,
  )
  console.log(`  Canonical officers: ${officers.length}`)
  if (officerAnomalies.length > 0) {
    console.log(`  Officer anomalies: ${officerAnomalies.length}`)
  }

  // Collect all unique skill IDs from transformed officers
  const skillIds = new Set<string>()
  for (const officer of officers) {
    for (const rel of officer.skills) {
      skillIds.add(rel.skillId.replace(/^skill_/, ''))
    }
  }

  const { skills, anomalies: skillAnomalies } = transformSkills(
    [...skillIds],
    skillMetadata,
    languageMap,
    mappingTable,
  )
  console.log(`  Canonical skills: ${skills.length}`)
  if (skillAnomalies.length > 0) {
    console.log(`  Skill anomalies: ${skillAnomalies.length}`)
  }

  // ── 4. Build dictionaries ──
  console.log('\n[4/6] Building dictionaries...')

  const { dictionaries } = buildDictionaries(officers, skills, languageMap)

  const dictItemCount = Object.values(dictionaries).reduce((sum, items) => sum + items.length, 0)
  console.log(`  Dictionary groups: ${Object.keys(dictionaries).length}`)
  console.log(`  Dictionary items: ${dictItemCount}`)

  // ── 5. Validate ──
  console.log('\n[5/6] Validating canonical data...')

  // JSON Schema validation
  const schemaValidator = createSchemaValidator()
  const schemaFindings = [
    ...schemaValidator.validate('officers', officers),
    ...schemaValidator.validate('skills', skills),
    ...schemaValidator.validate('dictionaries', dictionaries),
  ]

  // Cross-file relationship validation
  const relationFindings = validateCandidates(officers, skills, dictionaries)

  const allFindings = [...schemaFindings, ...relationFindings]
  const errors = allFindings.filter((f) => f.severity === 'error')
  const warnings = allFindings.filter((f) => f.severity === 'warning')

  // Combine officer + skill anomalies
  const allAnomalies = [...officerAnomalies, ...skillAnomalies]

  // Blocking anomalies: rejected disposition or critical data issues
  const blockingAnomalies = allAnomalies.filter(
    (a) =>
      a.disposition === 'rejected' ||
      a.field === 'skill.category' ||
      a.reason.includes('Unmapped sourceGroup/sourceCategoryId') ||
      a.reason.includes('has no metadata in skill_arr') ||
      a.reason.includes('empty sourceCategoryId') ||
      a.reason.includes('Unmapped sourceCategoryId'),
  )

  if (errors.length > 0) {
    console.log(`  ERRORS: ${errors.length}`)
    for (const e of errors.slice(0, 20)) {
      console.log(`    [${e.code}] ${e.entityType}/${e.entityId}: ${e.message} (${e.path})`)
    }
    if (errors.length > 20) console.log(`    ... and ${errors.length - 20} more`)
  }
  if (warnings.length > 0) {
    console.log(`  Warnings: ${warnings.length}`)
  }
  if (blockingAnomalies.length > 0) {
    console.log(`  BLOCKING ANOMALIES: ${blockingAnomalies.length}`)
    for (const a of blockingAnomalies.slice(0, 20)) {
      console.log(`    [${a.disposition}] ${a.officerId}/${a.field}: ${a.reason}`)
    }
    if (blockingAnomalies.length > 20)
      console.log(`    ... and ${blockingAnomalies.length - 20} more`)
  }
  console.log('  Schema + cross-file validation complete')

  // ── 6. Write output ──
  console.log('\n[6/6] Writing output...')

  await mkdir(OUTPUT_DIR, { recursive: true })

  const dataset = {
    schemaVersion: '1.0.0',
    contentVersion: '1.0.0',
    updatedAt: new Date().toISOString(),
    sourceSnapshot: 'voyage-tw-2026052501',
    counts: {
      officers: officers.length,
      skills: skills.length,
      assets: 0, // Phase 4
      dictionaryItems: dictItemCount,
    },
  }

  const output: CanonicalOutput = {
    dataset,
    officers,
    skills,
    dictionaries,
    assets: [],
    skillIconResolutions: [],
    portraitResolutions: [],
  }

  // Write each file
  const writeJson = (name: string, data: unknown) => {
    writeFileSync(`${OUTPUT_DIR}/${name}.json`, JSON.stringify(data, null, 2) + '\n')
  }

  writeJson('dataset', output.dataset)
  writeJson('officers', output.officers)
  writeJson('skills', output.skills)
  writeJson('dictionaries', output.dictionaries)
  writeJson('assets', output.assets)

  // Import report
  const report: ImportReport = {
    sourceCounts: {
      officers: Object.keys(sourceOfficers).length,
      skills: Object.keys(skillMetadata).length,
    },
    transformResults: {
      officersSuccess: officers.length,
      officersFailed: 0,
      skillsSuccess: skills.length,
      skillsFailed: 0,
    },
    unknownFields: [],
    unknownEnums: [],
    anomalies: allAnomalies,
    findings: allFindings,
  }
  writeJson('import-report', report)

  // ── Summary ──
  console.log('\n=== Import Complete ===')
  console.log(`Officers: ${officers.length}`)
  console.log(`Skills: ${skills.length}`)
  console.log(
    `Dictionaries: ${dictItemCount} items across ${Object.keys(dictionaries).length} groups`,
  )
  console.log(`Validation: ${errors.length} errors, ${warnings.length} warnings`)
  console.log(`Anomalies: ${allAnomalies.length} (${blockingAnomalies.length} blocking)`)
  console.log(`Output: ${OUTPUT_DIR}/`)

  if (errors.length > 0) {
    console.log('\nIMPORT FAILED with validation errors.')
    process.exit(1)
  }

  if (blockingAnomalies.length > 0) {
    console.log('\nIMPORT BLOCKED by anomalies.')
    process.exit(1)
  }

  console.log('\nIMPORT SUCCESS.')
}

// ── CLI entry ──

if (process.argv[1]?.replace(/\\/g, '/').endsWith('tools/import/run-import.ts')) {
  runImport().catch((error) => {
    console.error('Import failed:', error)
    process.exit(1)
  })
}
