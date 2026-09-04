import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { createSchemaValidator } from '../data-audit/create-schema-validator'
import { parseTradeSource } from './parse-trades'
import { transformTrades } from './transform-trades'
import { validateTradeDataset } from './validate-trades'
import type { CanonicalTradeDataset } from './types'

const RAW_DIR = 'archive/voyage-tw-2026052501-trade-20260904/raw-data'
const CANDIDATE_PATH =
  'archive/voyage-tw-2026052501-trade-20260904/canonical-candidates/trade-goods.json'
const MASTER_PATH = 'data/master/trade-goods.json'

const readRequired = (path: string): string => {
  if (!existsSync(path)) {
    throw new Error('TRADE_SOURCE_MISSING:' + path)
  }
  return readFileSync(path, 'utf8')
}

const writeDataset = (path: string, dataset: CanonicalTradeDataset): void => {
  mkdirSync(path.replace(/[/\\][^/\\]+$/, ''), { recursive: true })
  writeFileSync(path, JSON.stringify(dataset, null, 2) + '\n', 'utf8')
}

export const runTradeImport = (
  options: { promoteToMaster?: boolean } = {},
): CanonicalTradeDataset => {
  const bundle = parseTradeSource(
    readRequired(RAW_DIR + '/json.js'),
    readRequired(RAW_DIR + '/lang_1.js'),
  )
  const transformed = transformTrades(bundle)
  const schemaFindings = createSchemaValidator().validate('trade-goods', transformed.dataset)
  const relationFindings = validateTradeDataset(transformed.dataset)
  const findings = [...schemaFindings, ...relationFindings]
  const errors = findings.filter((item) => item.severity === 'error')

  console.log('Trade source counts:')
  console.log('  trades: ' + Object.keys(bundle.trades).length)
  console.log('  ports: ' + Object.keys(bundle.cities).length)
  console.log('  trade types: ' + Object.keys(bundle.tradeTypes).length)
  console.log('  season profiles: ' + Object.keys(bundle.seasonProfiles).length)
  console.log('Canonical counts:')
  console.log('  trade goods: ' + transformed.dataset.tradeGoods.length)
  console.log('  ports: ' + transformed.dataset.ports.length)
  console.log('  trade types: ' + transformed.dataset.tradeTypes.length)
  console.log('  season profiles: ' + transformed.dataset.seasonProfiles.length)
  console.log(
    'Findings: ' + errors.length + ' errors, ' + (findings.length - errors.length) + ' warnings',
  )
  if (transformed.anomalies.length > 0) {
    console.log('Transform anomalies: ' + transformed.anomalies.length)
  }

  if (errors.length > 0) {
    for (const item of errors.slice(0, 20)) {
      console.error(
        '  [' + item.code + '] ' + item.entityType + ':' + item.entityId + ' - ' + item.message,
      )
    }
    throw new Error('TRADE_IMPORT_VALIDATION_FAILED:' + errors.length)
  }

  writeDataset(CANDIDATE_PATH, transformed.dataset)
  console.log('Candidate: ' + CANDIDATE_PATH)
  if (options.promoteToMaster) {
    writeDataset(MASTER_PATH, transformed.dataset)
    console.log('Master: ' + MASTER_PATH)
  }
  return transformed.dataset
}

if (process.argv[1]?.replace(/\\/g, '/').endsWith('tools/import/run-trade-import.ts')) {
  try {
    runTradeImport({ promoteToMaster: process.argv.includes('--promote') })
  } catch (error) {
    console.error('Trade import failed:', error instanceof Error ? error.message : error)
    process.exit(1)
  }
}
