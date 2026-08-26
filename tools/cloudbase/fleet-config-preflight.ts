/** CloudBase 艦隊配置唯讀 preflight 的可測試摘要邏輯。 */

export interface FleetConfigPreflightRaw {
  collectionNames: readonly string[]
  fleetConfigIndexes: readonly string[]
  fleetConfigAcl: string | null
  fleetConfigDocuments: readonly Record<string, unknown>[]
  deployedFunctions: readonly {
    name: string
    runtime: string
    modifyTime: string
  }[]
}

export interface FleetConfigPreflightSummary {
  fleetConfigCollectionExists: boolean
  ownerLocksCollectionExists: boolean
  fleetConfigIndexes: string[]
  fleetConfigAcl: string | null
  invalidDocumentCount: number
  deployedFunctions: { name: string; runtime: string; modifyTime: string }[]
}

const isValidFleetConfigDocument = (document: Record<string, unknown>): boolean =>
  typeof document.ownerUid === 'string' &&
  typeof document.configId === 'string' &&
  typeof document.name === 'string' &&
  typeof document.normalizedName === 'string' &&
  typeof document.fleetState === 'object' &&
  document.fleetState !== null

/**
 * 將已由唯讀 CLI／Console 查得的資料縮減為不含 owner UID、名稱或配置內容的摘要。
 */
export const summarizeFleetConfigPreflight = (
  raw: FleetConfigPreflightRaw,
): FleetConfigPreflightSummary => ({
  fleetConfigCollectionExists: raw.collectionNames.includes('fleet_configs'),
  ownerLocksCollectionExists: raw.collectionNames.includes('fleet_config_owner_locks'),
  fleetConfigIndexes: [...raw.fleetConfigIndexes].sort(),
  fleetConfigAcl: raw.fleetConfigAcl,
  invalidDocumentCount: raw.fleetConfigDocuments.filter(
    (document) => !isValidFleetConfigDocument(document),
  ).length,
  deployedFunctions: raw.deployedFunctions.map(({ name, runtime, modifyTime }) => ({
    name,
    runtime,
    modifyTime,
  })),
})
