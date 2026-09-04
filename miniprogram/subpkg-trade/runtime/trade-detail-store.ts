/**
 * 貿易品詳情分包 Data Store。
 *
 * 詳情頁不直接計算分片或 require 生成檔，只經由這裡取得貿易品資料。
 */

import type { RuntimeTradeGoodDetail } from '../../contracts/runtime-data'

// eslint-disable-next-line @typescript-eslint/no-require-imports
const _index = require('../trade-detail-index') as Record<string, number>
// eslint-disable-next-line @typescript-eslint/no-require-imports
const _loadDetail = require('../trade-detail-loaders') as (
  id: string,
  index: Record<string, number>,
) => Record<string, unknown> | null

export function getTradeDetail(tradeId: string): RuntimeTradeGoodDetail | null {
  const raw = _loadDetail(tradeId, _index)
  if (!raw) return null
  return raw as unknown as RuntimeTradeGoodDetail
}
