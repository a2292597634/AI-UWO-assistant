import catalog from '../generated/game-servers'
import { GAME_SERVERS } from '../contracts/coupon-redemption'
import type { GameServerId } from '../contracts/coupon-redemption'
import type {
  BoardAction,
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
  let generation = 0,
    frozen: Frozen | null = null,
    pendingAction: PendingAction | null = initial?.pending ? 'createMessage' : null,
    pendingId = initial?.pending?.input.operationId || null
  let pendingCreate = initial?.pending?.input || null,
    received: MyMessage | null = null,
    disposed = false
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
  async function attempt<A extends BoardAction>(
    action: A,
    input: BoardInputs[A],
  ): Promise<BoardOutputs[A] | null> {
    pendingAction = action as PendingAction
    pendingId = (input as { operationId: string }).operationId
    try {
      const result = await ports.service.invoke(action, input)
      return disposed ? null : result
    } catch (caught) {
      if (disposed) return null
      error = caught instanceof Error ? caught.message : '無法完成操作，請稍後再試。'
      if (
        caught instanceof MessageBoardError &&
        ['unconfirmed', 'protocol', 'network'].includes(caught.code)
      ) {
        phase = 'unconfirmed'
        saveDraft()
      } else {
        phase = 'error'
        pendingAction = null
        pendingId = null
        pendingCreate = null
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
    if (frozen?.generation === generation) {
      body = ''
      ports.draft.clear()
    } else saveDraft()
    frozen = null
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
      frozen = null
      saveDraft()
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
  async function confirmPendingOperation() {
    if (!pendingAction || !pendingId || disposed) return
    const action = pendingAction,
      id = pendingId
    phase = 'busy'
    try {
      const response = await ports.service.invoke('getOperationResult', { action, operationId: id })
      if (disposed) return
      if (!response.confirmed || !response.result) {
        phase = 'unconfirmed'
        error = '提交結果仍未確認，請稍後再確認。'
        return
      }
      if (action === 'createMessage' && 'messageId' in response.result) accepted(response.result)
      else if (action === 'saveProfile' && 'profileRevision' in response.result && frozen) {
        profile = response.result
        frozen.profileRevision = profile.profileRevision
        await continueAfterProfile()
      } else if (action === 'uploadAvatar' && 'assetId' in response.result && frozen) {
        frozen.avatarAssetId = response.result.assetId
        avatarAssetId = response.result.assetId
        avatarPath = ''
        await sendProfile()
      } else {
        phase = 'unconfirmed'
        error = '提交結果仍需確認，請稍後再試。'
      }
    } catch (caught) {
      phase = 'unconfirmed'
      error = caught instanceof Error ? caught.message : '尚未確認提交結果。'
    }
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
    pendingOperationId: () => pendingId,
    dispose: () => {
      disposed = true
      saveDraft()
    },
  }
}
