/**
 * Detail Store
 *
 * The ONLY module in the detail subpackage allowed to require() generated
 * detail-index and detail-loaders. Pages must go through this store —
 * never directly compute shard hashes or hardcode shard counts.
 */

import type { RuntimeDetailRecord } from '../../contracts/runtime-data'

// eslint-disable-next-line @typescript-eslint/no-require-imports
const _index = require('../../detail-index') as Record<string, number>
// eslint-disable-next-line @typescript-eslint/no-require-imports
const _loadDetail = require('../../detail-loaders') as (
  id: string,
  index: Record<string, number>,
) => Record<string, unknown> | null

export function getOfficerDetail(
  officerId: string,
): RuntimeDetailRecord | null {
  const raw = _loadDetail(officerId, _index)
  if (!raw) return null
  // Cast through unknown — the generated module types don't know the
  // concrete shape, but the runtime contract tests guarantee it matches.
  return raw as unknown as RuntimeDetailRecord
}
