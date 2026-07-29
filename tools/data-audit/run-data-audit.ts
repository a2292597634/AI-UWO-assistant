import { readFileSync, mkdirSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import type { AuditFinding, SkillMappingRecord, SourceEnumValue, SourceFieldRecord } from './types'
import type { AssetObservation } from './collect-asset-metadata'
import type { CanonicalDataset } from './validate-canonical-dataset'
import { validateAuditInventory } from './validate-audit-inventory'
import { validateSkillMappings } from './validate-skill-mappings'
import { validateCanonicalDataset } from './validate-canonical-dataset'
import { createSchemaValidator } from './create-schema-validator'
import { renderAuditDocs } from './render-audit-docs'

const outputDir = 'docs/data-audit'

const loadOptionalJson = <T>(path: string, fallback: T): T => {
  try {
    return JSON.parse(readFileSync(path, 'utf8')) as T
  } catch {
    return fallback
  }
}

const readJson = <T>(path: string): T => JSON.parse(readFileSync(path, 'utf8')) as T

const readCanonicalDataset = (): CanonicalDataset => ({
  dataset: readJson('tests/fixtures/canonical/dataset.json'),
  officers: readJson('tests/fixtures/canonical/officers.json'),
  skills: readJson('tests/fixtures/canonical/skills.json'),
  dictionaries: readJson('tests/fixtures/canonical/dictionaries.json'),
  assets: readJson('tests/fixtures/canonical/assets.json'),
  skillIconResolutions: readJson('tests/fixtures/source-audit/skill-icon-resolutions.json'),
  portraitResolutions: readJson('tests/fixtures/source-audit/portrait-resolutions.json'),
})

const audit = (): {
  findings: AuditFinding[]
  reportData: Parameters<typeof renderAuditDocs>[0]
} => {
  const sourceSamples = readJson<{
    officers: Record<string, unknown>
    skills: Record<string, unknown>
  }>('tests/fixtures/source-audit/source-samples.json')
  const boundedOfficers = sourceSamples.officers
  const boundedSkills = sourceSamples.skills
  const fields = readJson<SourceFieldRecord[]>('data/audit/source-field-inventory.json')
  const enums = readJson<SourceEnumValue[]>('data/audit/source-enum-inventory.json')
  const mappings = readJson<SkillMappingRecord[]>('data/audit/skill-group-mapping.json')
  const canonicalDataset = readCanonicalDataset()
  const allFindings: AuditFinding[] = []

  const inventoryFindings = validateAuditInventory({
    officers: boundedOfficers,
    fields,
    skills: boundedSkills,
    enums,
  })
  allFindings.push(...inventoryFindings)

  const mappingFindings = validateSkillMappings({
    officers: boundedOfficers,
    skills: boundedSkills,
    mappings,
    selectedSkillIds: Object.keys(boundedSkills) as readonly string[],
  })
  allFindings.push(...mappingFindings)

  const schemaValidator = createSchemaValidator()
  for (const name of ['dataset', 'officers', 'skills', 'dictionaries', 'assets'] as const) {
    const payloads: Record<string, unknown> = {
      dataset: canonicalDataset.dataset,
      officers: canonicalDataset.officers,
      skills: canonicalDataset.skills,
      dictionaries: canonicalDataset.dictionaries,
      assets: canonicalDataset.assets,
    }
    allFindings.push(...schemaValidator.validate(name, payloads[name]))
  }

  const canonicalFindings = validateCanonicalDataset(canonicalDataset)
  allFindings.push(...canonicalFindings)

  const assets = loadOptionalJson<AssetObservation[]>(
    'tests/fixtures/source-audit/asset-observations.json',
    [],
  )

  const reportData = { fields, enums, mappings, assets, findings: allFindings }
  return { findings: allFindings, reportData }
}

const runCli = async () => {
  const mode = process.argv.includes('--write')
    ? 'write'
    : process.argv.includes('--check')
      ? 'check'
      : 'check'

  const { findings, reportData } = audit()

  if (mode === 'write') {
    mkdirSync(outputDir, { recursive: true })
    const docs = renderAuditDocs(reportData)
    for (const [filename, content] of Object.entries(docs)) {
      writeFileSync(resolve(outputDir, filename), content, 'utf8')
      console.log(`Wrote ${outputDir}/${filename}`)
    }
  }

  const errors = findings.filter((f) => f.severity === 'error')
  const warnings = findings.filter((f) => f.severity === 'warning')

  if (errors.length > 0) {
    console.error(`Phase 2 data audit: ${errors.length} errors, ${warnings.length} warnings`)
    for (const f of errors) {
      console.error(`  [${f.code}] ${f.entityType}:${f.entityId}:${f.path} - ${f.message}`)
    }
    process.exitCode = 1
  } else if (warnings.length > 0) {
    console.log(`Phase 2 data audit: PASS (${warnings.length} warnings)`)
  } else {
    console.log('Phase 2 data audit: PASS')
  }
}

if (process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href) {
  void runCli()
}
