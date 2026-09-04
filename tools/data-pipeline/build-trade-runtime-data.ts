import { existsSync, mkdirSync, unlinkSync, writeFileSync } from 'node:fs'
import type {
  RuntimeTradeGoodDetail,
  RuntimeTradeGoodIndexEntry,
  RuntimeTradePortReference,
  RuntimeTradeReference,
  RuntimeTradeSeasonProfile,
  RuntimeTradeType,
} from '../../miniprogram/contracts/runtime-data'
import type { CanonicalTradeDataset, CanonicalTradeGood, CanonicalTradePort } from '../import/types'

const compareText = (left: string, right: string): number =>
  Buffer.compare(Buffer.from(left, 'utf8'), Buffer.from(right, 'utf8'))

const sortedGoods = (dataset: CanonicalTradeDataset): CanonicalTradeGood[] =>
  [...dataset.tradeGoods].sort((left, right) => compareText(left.id, right.id))

const sortedPorts = (dataset: CanonicalTradeDataset): CanonicalTradePort[] =>
  [...dataset.ports].sort((left, right) => compareText(left.id, right.id))

export const buildTradeGoodsIndex = (
  dataset: CanonicalTradeDataset,
): RuntimeTradeGoodIndexEntry[] =>
  sortedGoods(dataset).map((trade) => ({
    id: trade.id,
    name: trade.name,
    categoryId: trade.categoryId,
    categoryName: trade.categoryName,
    rank: trade.rank,
    salesMode: trade.salesMode,
    salesPortCount: trade.salesPortIds.length,
    peakSeasonIds: [...trade.peakSeasonIds],
    lowSeasonIds: [...trade.lowSeasonIds],
    searchAliases: [...new Set([trade.name, ...(trade.searchAliases ?? [])])],
  }))

export const buildTradeReference = (dataset: CanonicalTradeDataset): RuntimeTradeReference => {
  const tradeTypes: RuntimeTradeType[] = [...dataset.tradeTypes]
    .sort((left, right) => compareText(left.id, right.id))
    .map((type) => ({
      id: type.id,
      name: type.name,
      peakSeasonIds: [...type.peakSeasonIds],
      lowSeasonIds: [...type.lowSeasonIds],
    }))
  const ports: RuntimeTradePortReference[] = sortedPorts(dataset).map((port) => ({
    id: port.id,
    name: port.name,
    regionName: port.regionName,
    seasonProfileId: port.seasonProfileId,
  }))
  const seasonProfiles: RuntimeTradeSeasonProfile[] = [...dataset.seasonProfiles]
    .sort((left, right) => compareText(left.id, right.id))
    .map((profile) => ({
      id: profile.id,
      monthSeasonIds: [...profile.monthSeasonIds],
    }))

  return {
    tradeTypes,
    ports,
    seasonProfiles,
    seasonNames: { ...dataset.seasonNames },
    glyphs: {
      season: { ...dataset.glyphs.season },
      status: { ...dataset.glyphs.status },
    },
  }
}

export const buildTradeGoodDetails = (
  dataset: CanonicalTradeDataset,
): Record<string, RuntimeTradeGoodDetail> => {
  const details: Record<string, RuntimeTradeGoodDetail> = {}
  for (const trade of sortedGoods(dataset)) {
    details[trade.id] = {
      id: trade.id,
      name: trade.name,
      categoryId: trade.categoryId,
      categoryName: trade.categoryName,
      rank: trade.rank,
      salesMode: trade.salesMode,
      salesPortIds: [...trade.salesPortIds],
      peakSeasonIds: [...trade.peakSeasonIds],
      lowSeasonIds: [...trade.lowSeasonIds],
      iconId: trade.iconId,
    }
  }
  return details
}

export const tradeDetailShard = (tradeId: string): number => {
  let hash = 0
  for (let index = 0; index < tradeId.length; index += 1) {
    hash = (hash * 31 + tradeId.charCodeAt(index)) >>> 0
  }
  return hash % 10
}

const writeModule = (path: string, value: unknown): void => {
  writeFileSync(path, 'module.exports = ' + JSON.stringify(value) + '\n', 'utf8')
}

export const writeTradeRuntimeData = (
  dataset: CanonicalTradeDataset,
  legacyOutputDir: string,
  subpackageDir: string,
): void => {
  mkdirSync(legacyOutputDir, { recursive: true })
  mkdirSync(subpackageDir, { recursive: true })

  // 貿易品搜尋與詳情同屬貿易品分包；清除早期版本曾寫入主包的舊輸出，
  // 避免生成檢查或微信打包時把完整索引意外帶入主包。
  for (const filename of ['trade-goods.js', 'trade-reference.js']) {
    const legacyPath = legacyOutputDir + '/' + filename
    if (existsSync(legacyPath)) unlinkSync(legacyPath)
  }

  const index = buildTradeGoodsIndex(dataset)
  const reference = buildTradeReference(dataset)
  const details = buildTradeGoodDetails(dataset)
  writeModule(subpackageDir + '/trade-goods.js', index)
  writeModule(subpackageDir + '/trade-reference.js', reference)

  const shards: Record<string, RuntimeTradeGoodDetail>[] = Array.from({ length: 10 }, () => ({}))
  const detailIndex: Record<string, number> = {}
  for (const trade of sortedGoods(dataset)) {
    const shard = tradeDetailShard(trade.id)
    shards[shard]![trade.id] = details[trade.id]!
    detailIndex[trade.id] = shard
  }
  for (let shard = 0; shard < 10; shard += 1) {
    writeModule(subpackageDir + '/trade-details-' + shard + '.js', shards[shard])
  }
  writeModule(subpackageDir + '/trade-detail-index.js', detailIndex)

  const loaderLines = [
    'var loaders = [',
    ...Array.from(
      { length: 10 },
      (_, shard) => "  function () { return require('./trade-details-" + shard + ".js') },",
    ),
    ']',
    '',
    'module.exports = function loadTradeDetail(id, index) {',
    '  var shard = index[id]',
    '  if (typeof shard !== "number" || !loaders[shard]) return null',
    '  return loaders[shard]()[id] || null',
    '}',
    '',
  ]
  writeFileSync(subpackageDir + '/trade-detail-loaders.js', loaderLines.join('\n'), 'utf8')
}
