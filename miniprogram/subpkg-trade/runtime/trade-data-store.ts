/**
 * 貿易品分包 Data Store。
 *
 * 搜尋頁與詳情頁共用這個入口，不直接從頁面 require 生成資料。
 */

import type {
  RuntimeTradeGoodIndexEntry,
  RuntimeTradeReference,
} from '../../contracts/runtime-data'

// eslint-disable-next-line @typescript-eslint/no-require-imports
const _tradeGoods = require('../trade-goods') as RuntimeTradeGoodIndexEntry[]
// eslint-disable-next-line @typescript-eslint/no-require-imports
const _tradeReference = require('../trade-reference') as RuntimeTradeReference

export function getTradeGoods(): readonly RuntimeTradeGoodIndexEntry[] {
  return _tradeGoods
}

export function getTradeReference(): RuntimeTradeReference {
  return _tradeReference
}
