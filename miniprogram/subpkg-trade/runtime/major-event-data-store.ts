/**
 * 大流行頁的本機參照資料入口。
 *
 * 頁面、Domain 和 Presenter 只透過此 Store 讀取生成資料。
 */

import type { RuntimeMajorEventReference } from '../../contracts/runtime-data'

// eslint-disable-next-line @typescript-eslint/no-require-imports
const _majorEventReference = require('../major-event-reference') as RuntimeMajorEventReference

export function getMajorEventReference(): RuntimeMajorEventReference {
  return _majorEventReference
}
