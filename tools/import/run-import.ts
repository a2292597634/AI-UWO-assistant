import {
  readFileSync,
  writeFileSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  renameSync,
  rmSync,
} from 'node:fs'
import { dirname, join, resolve, relative, isAbsolute } from 'node:path'
import type { SourceEnumValue, SkillMappingRecord, SourceFieldRecord } from '../data-audit/types'
import { createSchemaValidator } from '../data-audit/create-schema-validator'
import type { CanonicalOutput, ImportReport, SourceCorrection } from './types'
import { parseOfficers } from './parse-officers'
import { parseLanguageMap } from './parse-languages'
import { parseSkills } from './parse-skills'
import { transformOfficers } from './transform-officers'
import { transformSkills } from './transform-skills'
import { buildDictionaries } from './build-dictionaries'
import { validateCandidates } from './validate-candidates'

const RAW_DIR = 'archive/voyage-tw-2026052501/raw-data'
const readJson = <T>(path: string): T => JSON.parse(readFileSync(path, 'utf8')) as T
export interface ImportOptions {
  rawSource?: { jsonCharSource: string; langRanges: string[] }
  outputDir?: string
}

/** 離線來源先完整驗證；只有合法候選才原子替換專用輸出目錄。 */
export const runImport = async (
  options: ImportOptions = {},
): Promise<{ output: CanonicalOutput; report: ImportReport }> => {
  const outputDir = resolve(options.outputDir ?? 'artifacts/import-candidates/officers')
  const contains = (parent: string, target: string): boolean => {
    const child = relative(resolve(parent), resolve(target))
    return (
      !child ||
      (!isAbsolute(child) &&
        child !== '..' &&
        !child.startsWith('..\\') &&
        !child.startsWith('../'))
    )
  }
  for (const protectedDir of ['archive', 'data/master']) {
    if (contains(protectedDir, outputDir) || contains(outputDir, protectedDir))
      throw new Error('候選輸出禁止寫入 archive 或 master 及其祖先')
  }
  const raw = options.rawSource ?? {
    jsonCharSource: readFileSync(join(RAW_DIR, 'json_char.js'), 'utf8'),
    langRanges: Array.from({ length: 4 }, (_, i) => join(RAW_DIR, `lang_1_ranges/r${i}.txt`))
      .filter(existsSync)
      .map((path) => readFileSync(path, 'utf8')),
  }
  if (!raw.langRanges.length) throw new Error('IMPORT_LANGUAGE_SOURCE_MISSING')
  const languageMap = parseLanguageMap(raw.langRanges)
  const sourceOfficers = parseOfficers(raw.jsonCharSource)
  const skillMetadata = parseSkills(raw.jsonCharSource)
  const { officers, anomalies: officerAnomalies } = transformOfficers(
    sourceOfficers,
    languageMap,
    skillMetadata,
    readJson<SourceFieldRecord[]>('data/audit/source-field-inventory.json'),
    readJson<SourceEnumValue[]>('data/audit/source-enum-inventory.json'),
    readJson<SkillMappingRecord[]>('data/audit/skill-group-mapping.json'),
    readJson<SourceCorrection[]>('data/corrections/source-corrections.json'),
  )
  const skillIds = [
    ...new Set(
      officers.flatMap((officer) =>
        officer.skills.map((skill) => skill.skillId.replace(/^skill_/, '')),
      ),
    ),
  ]
  const { skills, anomalies: skillAnomalies } = transformSkills(
    skillIds,
    skillMetadata,
    languageMap,
    readJson<SkillMappingRecord[]>('data/audit/skill-group-mapping.json'),
  )
  const { dictionaries } = buildDictionaries(officers, skills, languageMap)
  const dataset = {
    schemaVersion: '1.0.0',
    contentVersion: '1.0.0',
    updatedAt: new Date().toISOString(),
    sourceSnapshot: 'voyage-tw-2026052501',
    counts: {
      officers: officers.length,
      skills: skills.length,
      assets: 0,
      dictionaryItems: Object.values(dictionaries).reduce((sum, rows) => sum + rows.length, 0),
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
  const validator = createSchemaValidator()
  const findings = [
    ...(['dataset', 'officers', 'skills', 'dictionaries', 'assets'] as const).flatMap((name) =>
      validator.validate(name, output[name]),
    ),
    ...validateCandidates(officers, skills, dictionaries),
  ]
  const anomalies = [...officerAnomalies, ...skillAnomalies]
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
    anomalies,
    findings,
  }
  const errors = findings.filter((item) => item.severity === 'error')
  const unresolved = anomalies.filter(
    (item) =>
      item.disposition === 'rejected' ||
      item.reason.startsWith('Unknown enum value') ||
      item.field === 'skill.category',
  )
  if (errors.length || unresolved.length)
    throw new Error(
      `IMPORT_VALIDATION_FAILED:${JSON.stringify({ findings: errors, anomalies: unresolved })}`,
    )
  mkdirSync(dirname(outputDir), { recursive: true })
  const stage = mkdtempSync(join(dirname(outputDir), '.import-candidate-'))
  const backup = `${stage}.backup`
  let oldMoved = false
  let installed = false
  try {
    for (const name of ['dataset', 'officers', 'skills', 'dictionaries', 'assets'] as const)
      writeFileSync(join(stage, `${name}.json`), JSON.stringify(output[name], null, 2) + '\n')
    writeFileSync(join(stage, 'import-report.json'), JSON.stringify(report, null, 2) + '\n')
    if (existsSync(outputDir)) {
      renameSync(outputDir, backup)
      oldMoved = true
    }
    renameSync(stage, outputDir)
    installed = true
  } catch (error) {
    if (oldMoved) renameSync(backup, outputDir)
    throw error
  } finally {
    rmSync(stage, { recursive: true, force: true })
    if (installed) rmSync(backup, { recursive: true, force: true })
  }
  console.log(`離線候選匯入成功：${officers.length} 航海士、${skills.length} 技能；${outputDir}`)
  return { output, report }
}

if (process.argv[1]?.replace(/\\/g, '/').endsWith('tools/import/run-import.ts')) {
  runImport().catch((error) => {
    console.error('匯入失敗：', error)
    process.exitCode = 1
  })
}
