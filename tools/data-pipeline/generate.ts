import { readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import type { CanonicalOfficer, CanonicalSkill, DictionaryItem } from '../import/types'
import { writeRuntimeData, buildDetails } from './build-runtime-data'

const CANONICAL_DIR = 'archive/voyage-tw-2026052501/canonical-candidates'
const OUTPUT_DIR = 'miniprogram/generated'
const SUBPKG_DIR = 'miniprogram/subpkg-detail'

const readJson = <T>(path: string): T => JSON.parse(readFileSync(path, 'utf8')) as T

const generate = (): void => {
  console.log('=== Runtime Data Generator ===\n')

  console.log(`Reading canonical data from ${CANONICAL_DIR}/...`)
  const officers = readJson<CanonicalOfficer[]>(`${CANONICAL_DIR}/officers.json`)
  const skills = readJson<CanonicalSkill[]>(`${CANONICAL_DIR}/skills.json`)
  const dictionaries = readJson<Record<string, DictionaryItem[]>>(
    `${CANONICAL_DIR}/dictionaries.json`,
  )

  console.log(`  Officers: ${officers.length}`)
  console.log(`  Skills: ${skills.length}`)
  console.log(`  Dictionary groups: ${Object.keys(dictionaries).length}`)

  mkdirSync(OUTPUT_DIR, { recursive: true })
  mkdirSync(SUBPKG_DIR, { recursive: true })

  // Generate main package data (catalog, skills, dictionaries)
  writeRuntimeData(officers, skills, dictionaries, OUTPUT_DIR)

  // Write details separately to subpackage (lazy loaded on detail page)
  const details = buildDetails(officers, skills, dictionaries)
  writeFileSync(
    `${SUBPKG_DIR}/details.js`,
    `module.exports = ${JSON.stringify(details)}\n`,
  )
  console.log(`  subpkg-detail/details.js: ${Object.keys(details).length} entries`)

  console.log('\nDone. Mini program loads details from subpkg-detail/ on demand.')
}

if (process.argv[1]?.replace(/\\/g, '/').endsWith('tools/data-pipeline/generate.ts')) {
  try {
    generate()
  } catch (err) {
    console.error('Generation failed:', err)
    process.exit(1)
  }
}
