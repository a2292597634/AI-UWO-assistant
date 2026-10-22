import catalog from '../generated/game-servers'
import { GAME_SERVERS } from '../contracts/coupon-redemption'
import type { GameServerId } from '../contracts/coupon-redemption'
import type {
  BoardInputs,
  BoardOutputs,
  BoardProfile,
  MessageBoardService,
  MyMessage,
} from '../contracts/message-board'
import { normalizeText } from '../domain/message-board/text-policy'
import type { BoardDraft } from '../domain/message-board/draft-store'
import { MessageBoardError } from '../runtime/message-board-service'
type Phase = 'idle' | 'busy' | 'unconfirmed' | 'accepted' | 'profile-saved' | 'error'
type PendingAction = 'uploadAvatar' | 'saveProfile' | 'createMessage'
type PendingRequest = {
  [A in PendingAction]: { action: A; input: BoardInputs[A] }
}[PendingAction]
interface Frozen {
  nickname: string
  body: string
  server: GameServerId | null
  avatarPath: string
  avatarAssetId: string | null
  profileRevision: number
  generation: number
  profileOnly: boolean
}
export function createComposeController(ports: {
  service: MessageBoardService
  operationId: () => Promise<string>
  prepareAvatar: (path: string) => Promise<string>
  draft: { read(): BoardDraft | null; write(value: BoardDraft): void; clear(): void }
  profile: BoardProfile | null
  now?: () => number
}) {
  const initial = ports.draft.read()
  let profile = ports.profile,
    body = initial?.body || '',
    server = initial?.gameServerId || profile?.lastServerId || null,
    nicknameValue = profile?.nickName || ''
  let avatarPath = '',
    avatarAssetId = profile?.avatarAssetId || null,
    phase: Phase = initial?.pending ? 'unconfirmed' : 'idle',
    error = ''
  // 重開後只把仍與原投稿相同的正文及伺服器視為可清除草稿。
  let generation =
      initial?.pending &&
      (initial.body !== initial.pending.input.text ||
        initial.gameServerId !== initial.pending.input.gameServerId)
        ? 1
        : 0,
    frozen: Frozen | null = null,
    pendingAction: PendingAction | null = initial?.pending ? 'createMessage' : null,
    pendingId = initial?.pending?.input.operationId || null
  let pendingCreate = initial?.pending?.input || null,
    received: MyMessage | null = null,
    disposed = false
  let pendingRequest: PendingRequest | null = pendingCreate
    ? { action: 'createMessage', input: { ...pendingCreate } }
    : null
  // 已收件但接續準備失敗時，只重試接續；不可重送已接受的原操作。
  let confirmedPending: {
    action: PendingAction
    operationId: string
    result: BoardOutputs[PendingAction]
  } | null = null
  let recoveryReviewed = false,
    operationExpired = false
  const now = ports.now || Date.now
  const pendingExpired = () =>
    !!pendingId &&
    (operationExpired ||
      now() - Number(pendingId.split('_')[0]) >= 86400000 ||
      Number(pendingId.split('_')[0]) > now() + 120000)
  if (pendingCreate)
    frozen = {
      nickname: profile?.nickName || '',
      body: pendingCreate.text,
      server: pendingCreate.gameServerId,
      avatarPath: '',
      avatarAssetId,
      profileRevision: pendingCreate.profileRevision,
      generation: 0,
      profileOnly: false,
    }
  const saveDraft = () =>
    ports.draft.write({
      body,
      gameServerId: server,
      updatedAt: Date.now(),
      ...(pendingCreate
        ? { pending: { action: 'createMessage' as const, input: pendingCreate } }
        : {}),
    })
  async function attempt<A extends PendingAction>(
    action: A,
    input: BoardInputs[A],
  ): Promise<BoardOutputs[A] | null> {
    confirmedPending = null
    if (pendingId !== input.operationId) operationExpired = false
    pendingAction = action
    pendingRequest = { action, input: { ...input } } as PendingRequest
    recoveryReviewed = false
    pendingId = (input as { operationId: string }).operationId
    try {
      const result = await ports.service.invoke(action, input)
      return disposed ? null : result
    } catch (caught) {
      if (disposed) return null
      error = caught instanceof Error ? caught.message : '無法完成操作，請稍後再試。'
      if (
        caught instanceof MessageBoardError &&
        ['unconfirmed', 'protocol', 'network', 'operation-expired'].includes(caught.code)
      ) {
        if (caught.code === 'operation-expired') operationExpired = true
        phase = 'unconfirmed'
        saveDraft()
      } else {
        phase = 'error'
        pendingAction = null
        pendingId = null
        pendingCreate = null
        pendingRequest = null
        saveDraft()
      }
      return null
    }
  }
  function accepted(message: MyMessage) {
    received = message
    phase = 'accepted'
    error = ''
    pendingAction = null
    pendingId = null
    pendingCreate = null
    pendingRequest = null
    confirmedPending = null
    const clearSubmittedDraft = frozen?.generation === generation
    frozen = null
    try {
      if (clearSubmittedDraft) {
        ports.draft.clear()
        body = ''
      } else saveDraft()
    } catch (caught) {
      const operation = clearSubmittedDraft ? '清除' : '儲存'
      error = `留言已提交，但本機草稿${operation}失敗：${caught instanceof Error ? caught.message : '請稍後再試。'}`
    }
  }
  async function sendMessage() {
    if (!frozen || disposed || !frozen.server) return
    const input = {
      operationId: await ports.operationId(),
      profileRevision: frozen.profileRevision,
      gameServerId: frozen.server,
      catalogVersion: catalog.version,
      text: frozen.body,
    }
    pendingCreate = input
    saveDraft()
    const result = await attempt('createMessage', input)
    if (result) accepted(result)
  }
  async function continueAfterProfile() {
    if (frozen?.profileOnly) {
      phase = 'profile-saved'
      error = ''
      pendingAction = null
      pendingId = null
      pendingRequest = null
      confirmedPending = null
      frozen = null
      try {
        saveDraft()
      } catch (caught) {
        error = `留言資料已更新，但本機草稿儲存失敗：${caught instanceof Error ? caught.message : '請稍後再試。'}`
      }
    } else await sendMessage()
  }
  async function sendProfile() {
    if (!frozen || disposed) return
    if (profile?.nickName === frozen.nickname && profile.avatarAssetId === frozen.avatarAssetId) {
      frozen.profileRevision = profile.profileRevision
      await continueAfterProfile()
      return
    }
    const result = await attempt('saveProfile', {
      operationId: await ports.operationId(),
      profileRevision: profile?.profileRevision || 0,
      nickName: frozen.nickname,
      avatarAssetId: frozen.avatarAssetId,
    })
    if (result) {
      profile = result
      frozen.profileRevision = result.profileRevision
      await continueAfterProfile()
    }
  }
  async function submitForm(values: { nickname: string }) {
    if (phase === 'busy' || phase === 'unconfirmed' || disposed) return
    const nickname = normalizeText(values.nickname, 'nickname'),
      text = normalizeText(body, 'body'),
      selected = GAME_SERVERS.find((item) => item.id === server)
    if (!selected || !nickname.ok || !text.ok) {
      phase = 'error'
      error = !selected
        ? '請先選擇伺服器。'
        : !nickname.ok
          ? '請填寫 1–32 字的暱稱。'
          : '請填寫 1–500 字的留言。'
      return
    }
    frozen = {
      nickname: nickname.data,
      body: text.data,
      server: selected.id,
      avatarPath,
      avatarAssetId,
      profileRevision: profile?.profileRevision || 0,
      generation,
      profileOnly: false,
    }
    phase = 'busy'
    error = ''
    try {
      if (frozen.avatarPath) {
        const base64 = await ports.prepareAvatar(frozen.avatarPath),
          uploaded = await attempt('uploadAvatar', {
            operationId: await ports.operationId(),
            base64,
          })
        if (!uploaded) return
        frozen.avatarAssetId = uploaded.assetId
        avatarAssetId = uploaded.assetId
        avatarPath = ''
      }
      await sendProfile()
    } catch (caught) {
      phase = 'error'
      error = caught instanceof Error ? caught.message : '無法處理留言資料，請重新確認。'
    }
  }
  async function saveProfileOnly(values: { nickname: string }) {
    if (phase === 'busy' || phase === 'unconfirmed' || disposed) return
    const nickname = normalizeText(values.nickname, 'nickname')
    if (!nickname.ok) {
      phase = 'error'
      error = '請填寫 1–32 字的暱稱。'
      return
    }
    frozen = {
      nickname: nickname.data,
      body,
      server: GAME_SERVERS.find((item) => item.id === server)?.id || null,
      avatarPath,
      avatarAssetId,
      profileRevision: profile?.profileRevision || 0,
      generation,
      profileOnly: true,
    }
    phase = 'busy'
    error = ''
    try {
      if (avatarPath) {
        const base64 = await ports.prepareAvatar(avatarPath),
          uploaded = await attempt('uploadAvatar', {
            operationId: await ports.operationId(),
            base64,
          })
        if (!uploaded) return
        frozen.avatarAssetId = uploaded.assetId
        avatarAssetId = uploaded.assetId
        avatarPath = ''
      }
      await sendProfile()
    } catch (caught) {
      phase = 'error'
      error = caught instanceof Error ? caught.message : '無法儲存留言資料。'
    }
  }
  function pauseExpiredContinuation() {
    if (!pendingExpired()) return false
    phase = 'unconfirmed'
    error =
      '原操作結果已確認，但已超過 24 小時。請核對我的留言及留言資料，再明確恢復草稿；不會自動接續投稿。'
    saveDraft()
    return true
  }
  async function receivePendingResult(action: PendingAction, result: BoardOutputs[PendingAction]) {
    if (action === 'createMessage' && 'messageId' in result) accepted(result)
    else if (action === 'saveProfile' && 'profileRevision' in result && frozen) {
      if (pendingId) confirmedPending = { action, operationId: pendingId, result }
      profile = result
      frozen.profileRevision = profile.profileRevision
      if (!pauseExpiredContinuation()) await continueAfterProfile()
    } else if (action === 'uploadAvatar' && 'assetId' in result && frozen) {
      if (pendingId) confirmedPending = { action, operationId: pendingId, result }
      frozen.avatarAssetId = result.assetId
      avatarAssetId = result.assetId
      // 等待時另選的頭像仍是下一次的編輯，不清除它。
      if (avatarPath === frozen.avatarPath) avatarPath = ''
      if (!pauseExpiredContinuation()) await sendProfile()
    } else {
      phase = 'unconfirmed'
      error = '提交結果仍需確認，請稍後再試。'
    }
  }
  async function confirmPendingOperation() {
    if (!pendingAction || !pendingId || disposed || phase === 'busy') return
    const action = pendingAction,
      id = pendingId
    phase = 'busy'
    try {
      if (confirmedPending?.action === action && confirmedPending.operationId === id) {
        await receivePendingResult(action, confirmedPending.result)
        return
      }
      const response = await ports.service.invoke('getOperationResult', { action, operationId: id })
      if (disposed) return
      if (!response.confirmed || !response.result) {
        phase = 'unconfirmed'
        error = pendingExpired()
          ? '原操作已超過 24 小時，請核對我的留言及留言資料，再明確恢復草稿。'
          : '提交結果仍未確認，可稍後查詢或重試原操作。'
        return
      }
      await receivePendingResult(action, response.result as BoardOutputs[PendingAction])
    } catch (caught) {
      phase = 'unconfirmed'
      error = caught instanceof Error ? caught.message : '尚未確認提交結果。'
    }
  }
  async function retryPendingOperation() {
    if (disposed || phase === 'busy' || !pendingRequest) return
    const request = pendingRequest
    await confirmPendingOperation()
    if (
      disposed ||
      phase !== 'unconfirmed' ||
      pendingRequest !== request ||
      pendingExpired() ||
      (confirmedPending?.action === request.action &&
        confirmedPending.operationId === request.input.operationId)
    )
      return
    // 只重送已保存的正規化輸入；不讀目前表單，也不產生新 ID。
    phase = 'busy'
    try {
      const result = await attempt(request.action, request.input)
      if (result) await receivePendingResult(request.action, result)
    } catch (caught) {
      if (disposed) return
      if (pendingAction && pendingId && pendingRequest) phase = 'unconfirmed'
      error = caught instanceof Error ? caught.message : '原操作已完成，但後續處理失敗，請重試。'
    }
  }
  async function reviewExpiredOperation() {
    if (disposed || phase === 'busy' || !pendingExpired()) return false
    await confirmPendingOperation()
    if (phase !== 'unconfirmed') return false
    phase = 'busy'
    try {
      await ports.service.invoke('listMine', { limit: 20 })
      const latestProfile = await ports.service.invoke('getProfile', {})
      if (disposed) return false
      profile = latestProfile
      recoveryReviewed = true
      phase = 'unconfirmed'
      error = '請在我的留言核對原投稿及留言資料；確認後可放棄原操作並恢復草稿。'
      return true
    } catch (caught) {
      phase = 'unconfirmed'
      error = caught instanceof Error ? caught.message : '無法讀取本人留言，請稍後核對。'
      return false
    }
  }
  function restoreExpiredDraft() {
    if (disposed || phase !== 'unconfirmed' || !pendingExpired() || !recoveryReviewed) return false
    pendingAction = null
    pendingId = null
    pendingRequest = null
    confirmedPending = null
    pendingCreate = null
    frozen = null
    recoveryReviewed = false
    operationExpired = false
    phase = 'idle'
    error = '草稿已恢復。請核對內容後自行提交；系統不會自動重新投稿。'
    saveDraft()
    return true
  }
  return {
    currentProfile: () => profile,
    view: () => ({
      body,
      server,
      avatarPath,
      avatarAssetId,
      nickname: nicknameValue,
      phase,
      error,
      received,
      characterCount: Array.from(body).length,
      pendingExpired: pendingExpired(),
      recoveryReviewed,
    }),
    setNickname: (value: string) => {
      nicknameValue = value
      generation++
    },
    setBody: (value: string) => {
      body = value
      generation++
      if (phase === 'accepted') phase = 'idle'
      saveDraft()
    },
    selectServer: (value: string) => {
      if (GAME_SERVERS.some((item) => item.id === value)) {
        server = value
        generation++
        saveDraft()
      }
    },
    selectAvatar: (value: string) => {
      avatarPath = value
      generation++
    },
    useDefaultAvatar: () => {
      avatarPath = ''
      avatarAssetId = null
      generation++
    },
    submitForm,
    saveProfileOnly,
    confirmPendingOperation,
    retryPendingOperation,
    reviewExpiredOperation,
    restoreExpiredDraft,
    pendingOperationId: () => pendingId,
    dispose: () => {
      disposed = true
      saveDraft()
    },
  }
}
