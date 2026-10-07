import type { BoardInputs } from '../../contracts/message-board'
import { GAME_SERVERS } from '../../contracts/coupon-redemption'
export interface BoardDraft {
  body: string
  gameServerId: string | null
  updatedAt: number
  pending?: { action: 'createMessage'; input: BoardInputs['createMessage'] }
}
export interface DraftStorage {
  get(key: string): unknown
  set(key: string, value: BoardDraft): void
  remove(key: string): void
}
const record = (value: unknown): value is Record<string, unknown> =>
  !!value && typeof value === 'object' && !Array.isArray(value)
const validServer = (id: unknown) => GAME_SERVERS.some((server) => server.id === id)
export function createBoardDraftStore(
  storage: DraftStorage,
  viewerKey: string,
  clock: () => number = Date.now,
) {
  if (!/^[a-f0-9]{64}$/.test(viewerKey)) throw new Error('尚未確認留言者身分。')
  const key = 'message_board_draft:' + viewerKey
  function read(): BoardDraft | null {
    const row = storage.get(key)
    if (
      !record(row) ||
      Object.keys(row).some(
        (key) => !['body', 'gameServerId', 'updatedAt', 'pending'].includes(key),
      ) ||
      typeof row.body !== 'string' ||
      row.body.length > 2000 ||
      typeof row.updatedAt !== 'number' ||
      clock() - row.updatedAt > 604800000 ||
      row.updatedAt > clock() + 120000 ||
      !(row.gameServerId === null || validServer(row.gameServerId))
    )
      return null
    if (row.pending !== undefined) {
      const pending = row.pending
      if (!record(pending) || pending.action !== 'createMessage' || !record(pending.input))
        return null
      const input = pending.input
      if (
        Object.keys(input).some(
          (key) =>
            !['operationId', 'profileRevision', 'gameServerId', 'catalogVersion', 'text'].includes(
              key,
            ),
        ) ||
        typeof input.operationId !== 'string' ||
        !/^\d{13}_[a-f0-9]{32}$/.test(input.operationId) ||
        typeof input.profileRevision !== 'number' ||
        !Number.isInteger(input.profileRevision) ||
        input.profileRevision < 1 ||
        !validServer(input.gameServerId) ||
        typeof input.catalogVersion !== 'string' ||
        input.catalogVersion.length > 32 ||
        typeof input.text !== 'string' ||
        input.text.length > 2000
      )
        return null
    }
    return row as unknown as BoardDraft
  }
  return {
    read,
    write: (value: BoardDraft) => {
      if (value.body.length <= 2000) storage.set(key, { ...value, updatedAt: clock() })
    },
    clear: () => storage.remove(key),
  }
}
