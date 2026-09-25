import { existsSync } from 'node:fs'
import { join } from 'node:path'
import type {
  RuntimeMajorEventReference,
  RuntimeMajorEventType,
  RuntimeMajorEventZone,
} from '../../miniprogram/contracts/runtime-data'
import type { CanonicalMajorEventsDataset } from '../import/types'

const RUNTIME_ASSET_ROOT = '/subpkg-trade/assets/major-events'

export const normalizeSourceTradeTypeId = (sourceId: string): string => {
  const match = /^tradetype(0[1-9]|1[0-9]|20)$/.exec(sourceId)
  const normalizedId = match?.[1]
  if (normalizedId === undefined) {
    throw new Error(`不支援的大流行交易品類 ID：${sourceId}`)
  }
  return normalizedId
}

const assetFilenameForZone = (regionIconId: string): string => {
  const match = /^zone_([0-9]+)$/.exec(regionIconId)
  const numericId = match?.[1]
  if (numericId === undefined) {
    throw new Error(`無效的大流行海域徽記 ID：${regionIconId}`)
  }
  return `region-zone-${numericId}.png`
}

export const buildMajorEventReference = (
  dataset: CanonicalMajorEventsDataset,
  pageAssetRoot: string,
): RuntimeMajorEventReference => {
  const eventTypes: RuntimeMajorEventType[] = dataset.eventTypes.map((event) => ({
    id: event.id,
    name: event.name,
    periodHours: event.periodHours,
    tradeTypeIds: event.tradeTypeIds.map(normalizeSourceTradeTypeId),
  }))

  const zones: RuntimeMajorEventZone[] = dataset.zones.map((zone) => {
    const filename = assetFilenameForZone(zone.regionIconId)
    if (!existsSync(join(pageAssetRoot, filename))) {
      throw new Error(`大流行海域徽記素材缺失：${zone.regionIconId} (${filename})`)
    }
    return {
      id: zone.id,
      name: zone.name,
      phaseHours: zone.phaseHours,
      delaySeconds: zone.delaySeconds,
      iconPath: `${RUNTIME_ASSET_ROOT}/${filename}`,
    }
  })

  return {
    sourceSnapshot: dataset.sourceSnapshot,
    sourceVersion: dataset.sourceVersion,
    sourceManifestSha256: dataset.sourceManifestSha256,
    sourceVerifiedOn: dataset.sourceVerifiedOn,
    anchorEpochSeconds: dataset.anchorEpochSeconds,
    eventTypes,
    zones,
  }
}
