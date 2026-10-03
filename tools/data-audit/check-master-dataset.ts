import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { loadCanonicalOfficers } from '../data-pipeline/load-officers'
import { createSchemaValidator } from './create-schema-validator'
import { validateMasterDataset, type MasterDatasetInput } from './validate-master-dataset'
import type { AuditFinding } from './types'

export function checkMasterDataset(masterDir = 'data/master'): AuditFinding[] {
  const read = <T>(name: string): T =>
    JSON.parse(readFileSync(join(masterDir, `${name}.json`), 'utf8')) as T
  try {
    const input: MasterDatasetInput = {
      dataset: read('dataset'),
      officers: loadCanonicalOfficers(masterDir),
      skills: read('skills'),
      dictionaries: read('dictionaries'),
      assets: read('assets'),
    }
    const validator = createSchemaValidator()
    const findings = (['dataset', 'officers', 'skills', 'dictionaries', 'assets'] as const).flatMap(
      (name) => validator.validate(name, input[name]),
    )
    if (findings.some((finding) => finding.severity === 'error')) return findings
    return [...findings, ...validateMasterDataset(input)]
  } catch (error) {
    return [
      {
        severity: 'error',
        code: 'MASTER_READ_FAILED',
        entityType: 'dataset',
        entityId: 'dataset',
        path: masterDir,
        observedValue: null,
        message: error instanceof Error ? error.message : String(error),
        suggestedAction: '修正正式主資料檔案後重新校驗。',
      },
    ]
  }
}

if (process.argv[1]?.replace(/\\/g, '/').endsWith('/check-master-dataset.ts')) {
  const findings = checkMasterDataset(process.argv[2])
  for (const finding of findings.filter((f) => f.severity === 'error'))
    console.log(
      `${finding.severity}: ${finding.code} ${finding.entityId} ${finding.path} ${JSON.stringify(finding.observedValue)}`,
    )
  console.log(
    `正式 master 校驗：${findings.filter((f) => f.severity === 'error').length} 個錯誤，${findings.filter((f) => f.severity === 'warning').length} 個待複核項目`,
  )
  process.exitCode = findings.some((f) => f.severity === 'error') ? 1 : 0
}
