import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { loadCanonicalOfficers } from '../data-pipeline/load-officers'
import { createSchemaValidator } from './create-schema-validator'
import { validateMasterDataset, type MasterDatasetInput } from './validate-master-dataset'
import type { AuditFinding } from './types'
import { buildGameServerOutputs } from '../data-pipeline/build-game-servers'
import { validateTradeDataset } from '../import/validate-trades'
import { validateMajorEvents } from './validate-major-events'
import { buildWorldMapPlaces } from '../data-pipeline/build-world-map'
import { buildWorldMapIconLocations } from '../data-pipeline/build-world-map-icon-locations'
import {
  createWorldMapCalibrator,
  type WorldMapCalibration,
} from '../data-pipeline/world-map-calibration'
import {
  createWorldMapLandCheck,
  type WorldMapLandMask,
} from '../data-pipeline/world-map-land-mask'
import type { WorldMapData } from '../../miniprogram/subpkg-world-map/map-data'
import type { CanonicalTradeDataset, CanonicalMajorEventsDataset } from '../import/types'

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
    const gameServers = read('game-servers')
    const serverFindings = validator.validate('game-servers', gameServers)
    if (serverFindings.length) return serverFindings
    buildGameServerOutputs(gameServers)
    const findings = (['dataset', 'officers', 'skills', 'dictionaries', 'assets'] as const).flatMap(
      (name) => validator.validate(name, input[name]),
    )
    if (findings.some((finding) => finding.severity === 'error')) return findings
    const trade = read<CanonicalTradeDataset>('trade-goods')
    const events = read<CanonicalMajorEventsDataset>('major-events')
    findings.push(
      ...validator.validate('trade-goods', trade),
      ...validator.validate('major-events', events),
    )
    if (findings.some((finding) => finding.severity === 'error')) return findings
    try {
      const mapData = read<WorldMapData>('world-map')
      buildWorldMapPlaces(mapData, trade.ports, trade.tradeGoods)
      createWorldMapCalibrator(mapData.places, read<WorldMapCalibration>('world-map-calibration'))
      createWorldMapLandCheck(read<WorldMapLandMask>('ui-assets/world-map-land-mask'))
      buildWorldMapIconLocations(
        trade.tradeGoods,
        read<string[]>('ui-assets/world-map-trade-atlas'),
      )
    } catch (error) {
      findings.push({
        severity: 'error',
        code: 'WORLD_MAP_DATA_INVALID',
        entityType: 'dataset',
        entityId: 'world-map',
        path: join(masterDir, 'world-map.json'),
        observedValue: null,
        message: error instanceof Error ? error.message : String(error),
        suggestedAction: '核對海圖座標、圖層與交易品港口索引。',
      })
    }
    return [
      ...findings,
      ...validateMasterDataset(input),
      ...validateTradeDataset(trade),
      ...validateMajorEvents(events, trade),
    ]
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
