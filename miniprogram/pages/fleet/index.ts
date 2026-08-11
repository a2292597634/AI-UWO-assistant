import {
  addOfficerToShip,
  assignSkillToFirstOpenTarget,
  createFleetState,
  excludeOfficerFromShip,
  lockOfficer,
  moveOfficerToShip,
  removeOfficerFromShip,
  setShipMode,
  unbanOfficer,
  unlockOfficer,
  updateShipTargets,
} from '../../domain/battle-fleet'
import { solveBattleTargets } from '../../domain/battle-fleet-solver'
import {
  applyBattleProposal,
  cloneFleetState,
  fleetStateFingerprint,
} from '../../domain/fleet-proposal'
import { getDictionaries, getFleetOfficers, getSkills } from '../../runtime/main-data-store'
import { buildBattleFleetPageData } from '../../presenters/battle-fleet-presenter'
import { buildFleetProposalPreview } from '../../presenters/fleet-proposal-presenter'
import { buildSkillSheet } from '../../presenters/skill-sheet'
import {
  buildConfigModalData,
  DEFAULT_CONFIG_NAME,
  deriveConfigStatus,
  resolveConfigAction,
  validateConfigName,
} from '../../presenters/config-management-presenter'
import type {
  ConfigModalAction,
  PendingConfigAction,
} from '../../presenters/config-management-presenter'
import { serializeFleetState } from '../../contracts/fleet-config'
import { getFleetConfigService, FleetConfigError } from '../../runtime/fleet-config-service'
import type { FleetConfigService } from '../../runtime/fleet-config-service'
import type { FleetConfigSummary } from '../../contracts/fleet-config'
import type { BattleSkillFilter, FleetState } from '../../contracts/battle-fleet'
import type { BattleFleetPageData } from '../../presenters/battle-fleet-presenter'
import type { FleetProposal } from '../../contracts/fleet-proposal'
import type { FleetProposalPreviewView } from '../../presenters/fleet-proposal-presenter'
import type { SkillSheetView } from '../../presenters/skill-sheet'
import type {
  RuntimeDictionaries,
  RuntimeFleetOfficer,
  RuntimeSkill,
} from '../../contracts/runtime-data'

// ── Page data ──

interface FleetPageData extends BattleFleetPageData {
  assetLoading: boolean
  assetLoadError: string | null
  assetReady: boolean
  failedPortraitImages: Record<string, boolean>
  failedSkillImages: Record<string, boolean>
  manualSkillHasMore: boolean
  manualKind: BattleSkillFilter['kind']
  manualCategoryId: string | null
  skillSearchText: string
  sheetSkill: SkillSheetView | null
  // Config management
  authStatus: 'guest' | 'authenticated' | 'loading'
  configName: string
  configStatus: 'saved' | 'unsaved' | 'new'
  activeConfigId: string | null
  configList: FleetConfigSummary[]
  showConfigMenu: boolean
  showConfigList: boolean
  showNameModal: boolean
  showUnsavedGuard: boolean
  modalAction: ConfigModalAction
  modalInputValue: string
  modalTitle: string
  pendingAction: PendingConfigAction | null
  configLimitReached: boolean
  showConflictDialog: boolean
  proposalPreview: FleetProposalPreviewView | null
  canUndoProposal: boolean
}

// ── Page state ──

interface FleetPageState {
  fleet: FleetState
  officers: readonly RuntimeFleetOfficer[]
  skills: Readonly<Record<string, RuntimeSkill>>
  dictionaries: RuntimeDictionaries
  currentShipId: string
  manualSkillId: string | null
  manualFilters: BattleSkillFilter
  assetRetryCount: number
  manualSkillLimit: number
  // Config tracking
  authStatus: 'guest' | 'authenticated' | 'loading'
  activeConfigId: string | null
  configName: string
  configVersion: number
  configList: FleetConfigSummary[]
  savedFleetState: string | null
  isDirty: boolean
  configService: FleetConfigService
  pendingAction: PendingConfigAction | null
  proposal: FleetProposal | null
  undoFleetState: FleetState | null
}

interface FleetPageLike {
  data: FleetPageData
  setData(update: Record<string, unknown>): void
}

const pageStateByInstance = new WeakMap<object, FleetPageState>()
const MANUAL_SKILL_WINDOW_SIZE = 40

const eventDataset = (event: WechatMiniprogram.BaseEvent): Record<string, unknown> => {
  const dataset = (event.currentTarget.dataset as unknown as Record<string, unknown>) ?? {}
  const rawDetail = (event as unknown as { detail?: unknown }).detail
  const detail =
    rawDetail && typeof rawDetail === 'object' ? (rawDetail as Record<string, unknown>) : {}
  const value = detail.value

  return {
    ...detail,
    ...dataset,
    mode: dataset.mode ?? detail.mode ?? value,
    kind: dataset.kind ?? detail.kind ?? value,
    id: dataset.id ?? detail.id ?? detail.skillId ?? detail.officerId ?? value,
    skillId: dataset.skillId ?? detail.skillId,
  }
}

const getState = (page: object): FleetPageState => {
  const state = pageStateByInstance.get(page)
  if (!state) throw new Error('fleet-page-not-loaded')
  return state
}

const emptyPageData: FleetPageData = {
  occupiedCount: 0,
  fleetCapacity: 77,
  shipTabs: [],
  fleetOverview: [],
  currentShip: {
    id: 'ship-1',
    label: '1號船',
    count: 0,
    status: 'empty',
    statusLabel: '未配置',
    isCurrent: true,
    mode: 'manual',
    slots: [],
    targets: [],
  },
  currentShipId: 'ship-1',
  mode: 'manual',
  manualSkillId: null,
  manualSkills: [],
  manualCandidates: [],
  skillKinds: [
    { id: 'all', name: '全部技能' },
    { id: 'active', name: '主動技能' },
    { id: 'passive', name: '戰鬥被動' },
  ],
  skillCategories: [],
  targets: [],
  canRecalculate: false,
  bannedOfficers: [],
  skillSummary: [],
  manualKind: 'all',
  manualCategoryId: null,
  skillSearchText: '',
  assetLoading: false,
  assetLoadError: null,
  assetReady: false,
  failedPortraitImages: {},
  failedSkillImages: {},
  manualSkillHasMore: false,
  sheetSkill: null,
  // Config management defaults
  authStatus: 'guest',
  configName: DEFAULT_CONFIG_NAME,
  configStatus: 'new',
  activeConfigId: null,
  configList: [],
  showConfigMenu: false,
  showConfigList: false,
  showNameModal: false,
  showUnsavedGuard: false,
  modalAction: 'none',
  modalInputValue: '',
  modalTitle: '',
  pendingAction: null,
  configLimitReached: false,
  showConflictDialog: false,
  proposalPreview: null,
  canUndoProposal: false,
}

const showError = (message: string): void => {
  wx.showToast({ title: message, icon: 'none' })
}

const resultMessage: Record<string, string> = {
  'ship-full': '船位已滿',
  'officer-occupied': '航海士已在其他船',
  'officer-banned': '航海士已排除',
  'officer-locked': '航海士已鎖定',
  'invalid-target-level': '目標等級必須是 Lv.1 至 Lv.10',
  'duplicate-target': '同一技能不可重複添加',
  'invalid-recommendation': '自動配隊結果無效',
}

// ── Dirty tracking ──

const computeDirty = (state: FleetPageState): boolean => {
  if (state.savedFleetState === null) {
    // No baseline — check if fleet is non-empty
    const empty = createFleetState()
    return serializeFleetState(state.fleet) !== serializeFleetState(empty)
  }
  return serializeFleetState(state.fleet) !== state.savedFleetState
}

const updateDirty = (page: FleetPageLike, state: FleetPageState): void => {
  const isDirty = computeDirty(state)
  state.isDirty = isDirty
  page.setData({ configStatus: deriveConfigStatus(isDirty, state.activeConfigId ?? '') })
}

const markClean = (page: FleetPageLike, state: FleetPageState): void => {
  state.savedFleetState = serializeFleetState(state.fleet)
  state.isDirty = false
  page.setData({ configStatus: 'saved' })
}

const applyResult = (page: FleetPageLike, next: { state: FleetState; error?: string }): void => {
  if (next.error) {
    showError(resultMessage[next.error] ?? '操作未完成')
    return
  }
  const state = getState(page)
  state.fleet = next.state
  state.proposal = null
  state.undoFleetState = null
  page.setData({ proposalPreview: null, canUndoProposal: false })
  updateDirty(page, state)
}

const render = (page: FleetPageLike, startAssetLoading = true): Promise<void> => {
  const state = getState(page)
  const view = buildBattleFleetPageData(
    state.fleet,
    state.officers,
    state.skills,
    state.dictionaries,
    state.currentShipId,
    state.manualFilters,
    state.manualSkillId,
  )
  page.setData({
    ...view,
    manualSkills: view.manualSkills.slice(0, state.manualSkillLimit),
    manualSkillHasMore: view.manualSkills.length > state.manualSkillLimit,
    manualKind: state.manualFilters.kind,
    manualCategoryId: state.manualFilters.categoryId,
    skillSearchText: state.manualFilters.searchText,
    sheetSkill: view.sheetSkill,
    assetLoading: false,
    assetLoadError: null,
    assetReady: true,
    failedPortraitImages: page.data.failedPortraitImages ?? {},
    failedSkillImages: page.data.failedSkillImages ?? {},
    proposalPreview: state.proposal
      ? buildFleetProposalPreview(state.fleet, state.proposal, state.officers, state.skills)
      : null,
    canUndoProposal: state.undoFleetState !== null,
    configStatus: deriveConfigStatus(state.isDirty, state.activeConfigId ?? ''),
  })

  void startAssetLoading
  return Promise.resolve()
}

const updateTargets = (
  page: FleetPageLike,
  targets: FleetState['ships'][number]['targets'],
): void => {
  const state = getState(page)
  const next = updateShipTargets(state.fleet, state.currentShipId, targets)
  applyResult(page, next)
  render(page)
}

// ── Unsaved changes guard ──

const resolvePendingAction = (page: FleetPageLike): void => {
  const state = getState(page)
  const pending = state.pendingAction
  if (!pending) return
  state.pendingAction = null
  state.proposal = null
  state.undoFleetState = null
  page.setData({ pendingAction: null, showUnsavedGuard: false })

  switch (pending.type) {
    case 'load':
      doLoadConfig(page, pending.targetConfigId!)
      break
    case 'new':
      doNewConfig(page)
      break
    case 'saveAs':
      openNameModal(page, 'saveAs')
      break
    case 'rename':
      openNameModal(page, 'rename')
      break
    case 'delete':
      doDeleteConfig(page)
      break
    case 'exit':
      wx.navigateBack({})
      break
  }
}

const checkUnsavedAndProceed = (page: FleetPageLike, action: PendingConfigAction): void => {
  const state = getState(page)
  const decision = resolveConfigAction(action, state.isDirty)
  state.pendingAction = decision.pendingAction
  page.setData({
    pendingAction: decision.pendingAction,
    showUnsavedGuard: decision.showUnsavedGuard,
  })
  if (!decision.showUnsavedGuard) resolvePendingAction(page)
}

// ── Config operations ──

const handleConfigError = (page: FleetPageLike, error: unknown): void => {
  console.error('fleet-config error:', error)
  if (error instanceof FleetConfigError) {
    if (error.code === 'conflict') {
      page.setData({ showConflictDialog: true })
      return
    }
    showError(error.message)
  } else if (error instanceof Error) {
    showError(`操作失敗：${error.message}`)
  } else {
    showError(`操作失敗：${String(error)}`)
  }
}

const doLoadConfig = async (page: FleetPageLike, configId: string): Promise<void> => {
  const state = getState(page)
  try {
    const record = await state.configService.loadConfig(configId)
    const fleetState = record.fleetState
    state.fleet = fleetState
    state.proposal = null
    state.undoFleetState = null
    state.activeConfigId = record.configId
    state.configName = record.name
    state.configVersion = record.version
    markClean(page, state)
    page.setData({
      activeConfigId: record.configId,
      configName: record.name,
      configStatus: 'saved',
      showConfigList: false,
    })
    render(page)
  } catch (e) {
    handleConfigError(page, e)
  }
}

const doNewConfig = (page: FleetPageLike): void => {
  const state = getState(page)
  state.fleet = createFleetState()
  state.proposal = null
  state.undoFleetState = null
  state.activeConfigId = null
  state.configName = DEFAULT_CONFIG_NAME
  state.configVersion = 0
  state.savedFleetState = null
  state.isDirty = false
  state.currentShipId = 'ship-1'
  state.manualSkillId = null
  state.manualFilters = { kind: 'all', categoryId: null, searchText: '' }
  state.manualSkillLimit = MANUAL_SKILL_WINDOW_SIZE
  page.setData({
    activeConfigId: null,
    configName: DEFAULT_CONFIG_NAME,
    configStatus: 'new',
    showConfigList: false,
    showConfigMenu: false,
  })
  render(page)
}

const doDeleteConfig = async (page: FleetPageLike): Promise<void> => {
  const state = getState(page)
  const configId = state.activeConfigId
  if (!configId) return
  try {
    await state.configService.deleteConfig(configId, state.configVersion)
    showError('配置已刪除')
    doNewConfig(page)
    await refreshConfigList(state, page)
  } catch (e) {
    handleConfigError(page, e)
  }
}

const refreshConfigList = async (state: FleetPageState, page: FleetPageLike): Promise<void> => {
  try {
    const list = await state.configService.listMyConfigs()
    state.configList = [...list]
    page.setData({ configList: [...list] })
  } catch (e) {
    console.error('listMyConfigs failed:', e)
    showError('載入配置列表失敗')
  }
}

const openNameModal = (
  page: FleetPageLike,
  action: Exclude<ConfigModalAction, 'none'>,
  prefillName?: string,
): void => {
  page.setData({ ...buildConfigModalData(action, prefillName ?? page.data.configName) })
}

// ── Auth ──

const performLogin = async (page: FleetPageLike): Promise<boolean> => {
  const state = getState(page)
  state.authStatus = 'loading'
  page.setData({ authStatus: 'loading' })
  try {
    await state.configService.authenticate()
    state.authStatus = 'authenticated'
    page.setData({ authStatus: 'authenticated' })
    return true
  } catch (e) {
    state.authStatus = 'guest'
    page.setData({ authStatus: 'guest' })
    if (e instanceof FleetConfigError) {
      showError(`登入失敗 [${e.code}]：${e.message}`)
    } else {
      showError('登入失敗，請重試')
    }
    return false
  }
}

const onAfterLogin = async (page: FleetPageLike): Promise<void> => {
  const state = getState(page)

  // If user has a dirty guest draft, go straight to save-as flow
  if (state.isDirty) {
    openNameModal(page, 'saveAs')
    return
  }

  // Otherwise load the last-used config
  await refreshConfigList(state, page)
  const list = state.configList
  if (list.length === 0) {
    // No saved configs
    doNewConfig(page)
    return
  }

  // Load the one with newest lastUsedAt
  const latest = list.reduce((a, b) => (a.lastUsedAt > b.lastUsedAt ? a : b))
  await doLoadConfig(page, latest.configId)
}

// ── Conflict handling ──

const handleConflictReload = async (page: FleetPageLike): Promise<void> => {
  const state = getState(page)
  const configId = state.activeConfigId
  if (!configId) return
  page.setData({ showConflictDialog: false })
  try {
    const record = await state.configService.loadConfig(configId)
    state.fleet = record.fleetState
    state.proposal = null
    state.undoFleetState = null
    state.configVersion = record.version
    markClean(page, state)
    page.setData({ configName: record.name })
    showError('已重新載入雲端版本（本地修改已放棄）')
    render(page)
  } catch (e) {
    handleConfigError(page, e)
  }
}

const handleConflictForceOverwrite = async (page: FleetPageLike): Promise<void> => {
  const state = getState(page)
  const configId = state.activeConfigId
  if (!configId) return
  page.setData({ showConflictDialog: false })
  // Second confirmation via wx.showModal
  wx.showModal({
    title: '確認強制覆蓋',
    content: '將以本地配置覆蓋雲端最新版本，無法復原。確定要繼續？',
    confirmText: '強制覆蓋',
    success: async (res) => {
      if (!res.confirm) return
      try {
        const record = await state.configService.updateConfig({
          configId,
          expectedVersion: state.configVersion,
          fleetState: state.fleet,
          force: true,
        })
        state.activeConfigId = record.configId
        state.configName = record.name
        state.configVersion = record.version
        markClean(page, state)
        page.setData({
          activeConfigId: record.configId,
          configName: record.name,
          configStatus: 'saved',
        })
        showError('已強制覆蓋保存')
      } catch (e) {
        handleConfigError(page, e)
      }
    },
  })
}

// ── Page definition ──

Page({
  data: {
    ...emptyPageData,
    manualKind: 'all',
    manualCategoryId: null,
    skillSearchText: '',
  } as FleetPageData,

  onLoad() {
    const state: FleetPageState = {
      fleet: createFleetState(),
      officers: getFleetOfficers(),
      skills: getSkills(),
      dictionaries: getDictionaries(),
      currentShipId: 'ship-1',
      manualSkillId: null,
      manualFilters: { kind: 'all', categoryId: null, searchText: '' },
      assetRetryCount: 0,
      manualSkillLimit: MANUAL_SKILL_WINDOW_SIZE,
      // Config
      authStatus: 'guest',
      activeConfigId: null,
      configName: DEFAULT_CONFIG_NAME,
      configVersion: 0,
      configList: [],
      savedFleetState: null,
      isDirty: false,
      configService: getFleetConfigService(),
      pendingAction: null,
      proposal: null,
      undoFleetState: null,
    }
    pageStateByInstance.set(this, state)
    wx.setNavigationBarTitle({ title: '戰鬥模擬艦隊' })
    return render(this, false)
  },

  onReady() {
    return render(this)
  },

  // ── Config: Login ──

  async onConfigLogin() {
    const state = getState(this)
    if (state.authStatus === 'loading') return

    const ok = await performLogin(this)
    if (ok) {
      await onAfterLogin(this)
    }
  },

  // ── Config: Menu toggle ──

  onConfigMenuTap() {
    const show = !this.data.showConfigMenu
    this.setData({ showConfigMenu: show })
  },

  onConfigExit() {
    this.setData({ showConfigMenu: false })
    checkUnsavedAndProceed(this, { type: 'exit' })
  },

  // ── Config: List open/close ──

  async onConfigListOpen() {
    const state = getState(this)
    if (state.authStatus !== 'authenticated') {
      // Trigger login first
      const ok = await performLogin(this)
      if (!ok) return
      await onAfterLogin(this)
    }
    await refreshConfigList(state, this)
    this.setData({ showConfigList: true, showConfigMenu: false })
  },

  onConfigListClose() {
    this.setData({ showConfigList: false })
  },

  // ── Config: Select/load ──

  onConfigSelect(event: WechatMiniprogram.BaseEvent) {
    const configId = eventDataset(event).id
    if (typeof configId !== 'string') return
    this.setData({ showConfigMenu: false })
    checkUnsavedAndProceed(this, { type: 'load', targetConfigId: configId })
  },

  // ── Config: New ──

  onConfigNew() {
    this.setData({ showConfigMenu: false })
    checkUnsavedAndProceed(this, { type: 'new' })
  },

  // ── Config: Save ──

  async onConfigSave() {
    this.setData({ showConfigMenu: false })
    const state = getState(this)

    // If guest, login first
    if (state.authStatus === 'guest') {
      const ok = await performLogin(this)
      if (!ok) return
      // After login with dirty state, save-as flow
      if (state.isDirty) {
        openNameModal(this, 'saveAs')
        return
      }
      await onAfterLogin(this)
      return
    }

    // If new config, go to save-as
    if (!state.activeConfigId) {
      openNameModal(this, 'saveAs')
      return
    }

    // Overwrite existing
    try {
      const record = await state.configService.updateConfig({
        configId: state.activeConfigId,
        expectedVersion: state.configVersion,
        fleetState: state.fleet,
        force: false,
      })
      state.activeConfigId = record.configId
      state.configName = record.name
      state.configVersion = record.version
      markClean(this, state)
      this.setData({
        configName: record.name,
        configStatus: 'saved',
      })
      showError('已保存')
    } catch (e) {
      handleConfigError(this, e)
    }
  },

  // ── Config: Save As ──

  onConfigSaveAs() {
    this.setData({ showConfigMenu: false })
    const state = getState(this)
    if (state.authStatus === 'guest') {
      // Prompt login first
      void (async () => {
        const ok = await performLogin(this)
        if (!ok) return
        if (state.isDirty) {
          openNameModal(this, 'saveAs')
        }
      })()
      return
    }
    if (state.isDirty) {
      openNameModal(this, 'saveAs')
    } else {
      // No changes, just save-as the current state
      openNameModal(this, 'saveAs')
    }
  },

  // ── Config: Rename ──

  onConfigRename() {
    this.setData({ showConfigMenu: false })
    const state = getState(this)
    if (!state.activeConfigId) {
      showError('請先保存配置')
      return
    }
    openNameModal(this, 'rename', state.configName)
  },

  // ── Config: Delete ──

  onConfigDelete() {
    this.setData({ showConfigMenu: false })
    const state = getState(this)
    if (!state.activeConfigId) {
      showError('沒有可刪除的配置')
      return
    }
    wx.showModal({
      title: '確認刪除',
      content: `確定要刪除「${state.configName}」嗎？此操作無法復原。`,
      confirmText: '刪除',
      confirmColor: '#e74c3c',
      success: (res) => {
        if (!res.confirm) return
        // If dirty, show unsaved guard
        if (state.isDirty) {
          checkUnsavedAndProceed(this, { type: 'delete' })
        } else {
          doDeleteConfig(this).catch(() => {})
        }
      },
    })
  },

  // ── Name modal ──

  onConfigNameInput(event: WechatMiniprogram.Input) {
    this.setData({ modalInputValue: event.detail.value ?? '' })
  },

  async onConfigModalConfirm(event?: WechatMiniprogram.BaseEvent) {
    const state = getState(this)
    const action = this.data.modalAction
    const inputValue = event ? eventDataset(event).value : this.data.modalInputValue
    const nameResult = validateConfigName(typeof inputValue === 'string' ? inputValue : '')
    if (!nameResult.ok || !nameResult.name) {
      showError(nameResult.message ?? '請輸入配置名稱')
      return
    }
    const name = nameResult.name

    this.setData({ showNameModal: false })

    try {
      if (action === 'saveAs') {
        // Check limit
        if (state.configList.length >= 20) {
          showError('已達 20 套配置上限')
          return
        }
        const record = await state.configService.saveAsConfig(name, state.fleet)
        state.activeConfigId = record.configId
        state.configName = record.name
        state.configVersion = record.version
        markClean(this, state)
        this.setData({
          activeConfigId: record.configId,
          configName: record.name,
          configStatus: 'saved',
        })
        await refreshConfigList(state, this)
        resolvePendingAction(this)
        showError('已保存為新配置')
      } else if (action === 'rename') {
        if (!state.activeConfigId) return
        const record = await state.configService.renameConfig(
          state.activeConfigId,
          state.configVersion,
          name,
        )
        state.configName = record.name
        state.configVersion = record.version
        this.setData({
          configName: record.name,
        })
        await refreshConfigList(state, this)
        showError('已重命名')
      }
    } catch (e) {
      handleConfigError(this, e)
    }
  },

  onConfigModalCancel() {
    const state = getState(this)
    state.pendingAction = null
    this.setData({
      showNameModal: false,
      pendingAction: null,
      showUnsavedGuard: false,
    })
  },

  // ── Unsaved guard ──

  onUnsavedGuardSave() {
    const state = getState(this)
    // Save first, then resolve pending
    void (async () => {
      try {
        if (state.activeConfigId) {
          await state.configService.updateConfig({
            configId: state.activeConfigId,
            expectedVersion: state.configVersion,
            fleetState: state.fleet,
            force: false,
          })
          state.configVersion = (state.configVersion || 0) + 1
        } else {
          // Need a name — can't auto-save without name
          // Defer to save-as
          this.setData({ showUnsavedGuard: false })
          openNameModal(this, 'saveAs')
          return
        }
        markClean(this, state)
        showError('已保存')
        resolvePendingAction(this)
      } catch (e) {
        handleConfigError(this, e)
      }
    })()
  },

  onUnsavedGuardDiscard() {
    const state = getState(this)
    state.isDirty = false
    resolvePendingAction(this)
  },

  onUnsavedGuardCancel() {
    const state = getState(this)
    state.pendingAction = null
    this.setData({
      pendingAction: null,
      showUnsavedGuard: false,
    })
  },

  // ── Conflict dialog ──

  onConflictReload() {
    handleConflictReload(this).catch(() => {})
  },

  onConflictForceOverwrite() {
    handleConflictForceOverwrite(this).catch(() => {})
  },

  onConflictCancel() {
    this.setData({ showConflictDialog: false })
  },

  // ── Prevent tap-through for native input inside modals ──

  onNoop() {
    // Intentionally empty — stops event bubbling for catchtap
  },

  // ── Existing fleet operations ──

  retryAssetLoading() {
    const state = getState(this)
    if (state.assetRetryCount >= 1) return Promise.resolve()
    state.assetRetryCount += 1
    this.setData({ failedPortraitImages: {}, failedSkillImages: {} })
    return render(this)
  },

  onImageError(event: WechatMiniprogram.BaseEvent) {
    const dataset = eventDataset(event)
    const kind = dataset.kind
    const id = dataset.id
    if ((kind !== 'portrait' && kind !== 'skill') || typeof id !== 'string' || !id) return

    if (kind === 'portrait') {
      this.setData({
        assetReady: true,
        assetLoadError: null,
        failedPortraitImages: { ...this.data.failedPortraitImages, [id]: true },
      })
      return
    }

    this.setData({
      assetReady: true,
      assetLoadError: null,
      failedSkillImages: { ...this.data.failedSkillImages, [id]: true },
    })
  },

  onShipTabTap(event: WechatMiniprogram.BaseEvent) {
    const shipId = eventDataset(event).id
    if (typeof shipId !== 'string') return
    const state = getState(this)
    if (!state.fleet.ships.some((ship) => ship.id === shipId)) return
    state.currentShipId = shipId
    state.manualSkillId = null
    render(this)
  },

  onModeTap(event: WechatMiniprogram.BaseEvent) {
    const mode = eventDataset(event).mode
    if (mode !== 'manual' && mode !== 'auto') return
    const state = getState(this)
    applyResult(this, setShipMode(state.fleet, state.currentShipId, mode))
    render(this)
  },

  onSkillKindTap(event: WechatMiniprogram.BaseEvent) {
    const kind = eventDataset(event).kind
    if (kind !== 'all' && kind !== 'active' && kind !== 'passive') return
    const state = getState(this)
    state.manualFilters = { ...state.manualFilters, kind, categoryId: null }
    state.manualSkillLimit = MANUAL_SKILL_WINDOW_SIZE
    render(this)
  },

  onSkillCategoryTap(event: WechatMiniprogram.BaseEvent) {
    const categoryId = eventDataset(event).id
    if (typeof categoryId !== 'string') return
    const state = getState(this)
    state.manualFilters = { ...state.manualFilters, categoryId }
    state.manualSkillLimit = MANUAL_SKILL_WINDOW_SIZE
    render(this)
  },

  onSkillSearchInput(event: WechatMiniprogram.Input) {
    const state = getState(this)
    state.manualFilters = { ...state.manualFilters, searchText: event.detail.value ?? '' }
    state.manualSkillLimit = MANUAL_SKILL_WINDOW_SIZE
    render(this)
  },

  onSkillListReachEnd() {
    const state = getState(this)
    if (!this.data.manualSkillHasMore) return
    state.manualSkillLimit += MANUAL_SKILL_WINDOW_SIZE
    render(this)
  },

  onSkillTap(event: WechatMiniprogram.BaseEvent) {
    const skillId = eventDataset(event).id
    if (typeof skillId !== 'string') return
    const state = getState(this)
    const skill = state.skills[skillId]
    if (!skill) return
    const fleetSkill = state.officers.flatMap((o) => o.skills).find((r) => r.skillId === skillId)
    const kind: 'active' | 'passive' = fleetSkill?.kind === 'active' ? 'active' : 'passive'
    const sheet = buildSkillSheet(skill, kind)
    this.setData({ sheetSkill: sheet })
  },

  onSheetDismiss() {
    this.setData({ sheetSkill: null })
  },

  onReverseLookup() {
    const skillId = this.data.sheetSkill?.id
    if (!skillId) return
    this.setData({ sheetSkill: null })
    wx.navigateTo({ url: `/pages/catalog/index?skillId=${skillId}` })
  },

  onSkillSelect(event: WechatMiniprogram.BaseEvent) {
    const skillId = eventDataset(event).id
    if (typeof skillId !== 'string') return
    const state = getState(this)
    const current = state.fleet.ships.find((ship) => ship.id === state.currentShipId)!
    if (current.mode === 'manual') {
      state.manualSkillId = skillId
      render(this)
      return
    }
    applyResult(this, assignSkillToFirstOpenTarget(state.fleet, current.id, skillId))
    render(this)
  },

  onTargetLevelBlur(event: WechatMiniprogram.Input) {
    const targetId = eventDataset(event).id
    if (typeof targetId !== 'string') return
    const level = Number(event.detail.value?.trim())
    if (!Number.isInteger(level) || level < 1 || level > 10) {
      showError(resultMessage['invalid-target-level'])
      render(this)
      return
    }
    const state = getState(this)
    const current = state.fleet.ships.find((ship) => ship.id === state.currentShipId)!
    const targets = current.targets.map((target) =>
      target.id === targetId ? { ...target, targetLevel: level } : target,
    )
    updateTargets(this, targets)
  },

  onAddTarget() {
    const state = getState(this)
    const current = state.fleet.ships.find((ship) => ship.id === state.currentShipId)!
    updateTargets(this, [
      ...current.targets,
      { id: `${current.id}-target-${current.targets.length + 1}`, skillId: null, targetLevel: 1 },
    ])
  },

  onRemoveTarget(event: WechatMiniprogram.BaseEvent) {
    const targetId = eventDataset(event).id
    if (typeof targetId !== 'string') return
    const state = getState(this)
    const current = state.fleet.ships.find((ship) => ship.id === state.currentShipId)!
    updateTargets(
      this,
      current.targets.filter((target) => target.id !== targetId),
    )
  },

  onRecalculate() {
    const state = getState(this)
    const current = state.fleet.ships.find((ship) => ship.id === state.currentShipId)!
    if (!current.targets.some((target) => target.skillId !== null)) {
      showError('請先設定至少一個有效的戰鬥技能目標')
      return
    }
    const otherShipOfficerIds = state.fleet.ships
      .filter((ship) => ship.id !== current.id)
      .flatMap((ship) => ship.officerIds)
    const result = solveBattleTargets({
      officers: state.officers,
      targets: current.targets.flatMap((target) =>
        target.skillId === null
          ? []
          : [{ skillId: target.skillId, targetLevel: target.targetLevel }],
      ),
      lockedOfficerIds: current.lockedOfficerIds,
      excludedOfficerIds: [...state.fleet.bannedOfficerIds, ...current.removedOfficerIds],
      occupiedByOtherShips: otherShipOfficerIds,
      currentOfficerIds: current.officerIds,
      capacity: 11,
      shipId: current.id,
      baseStateFingerprint: fleetStateFingerprint(state.fleet),
    })
    state.proposal = result
    this.setData({
      proposalPreview: buildFleetProposalPreview(state.fleet, result, state.officers, state.skills),
    })
  },

  onProposalCancel() {
    const state = getState(this)
    state.proposal = null
    this.setData({ proposalPreview: null })
  },

  onProposalApply() {
    const state = getState(this)
    const proposal = state.proposal
    if (!proposal) return

    const snapshot = cloneFleetState(state.fleet)
    const result = applyBattleProposal(state.fleet, proposal)
    if (result.error) {
      showError(
        result.error === 'invalid-recommendation'
          ? '目前編隊已變更或方案無法套用，請重新計算方案'
          : (resultMessage[result.error] ?? '方案套用失敗'),
      )
      return
    }

    state.fleet = result.state
    state.undoFleetState = snapshot
    state.proposal = null
    updateDirty(this, state)
    render(this)
  },

  onUndoProposal() {
    const state = getState(this)
    if (!state.undoFleetState) return
    state.fleet = cloneFleetState(state.undoFleetState)
    state.undoFleetState = null
    state.proposal = null
    updateDirty(this, state)
    render(this)
  },

  onUndoDismiss() {
    const state = getState(this)
    state.undoFleetState = null
    this.setData({ canUndoProposal: false })
  },

  onOfficerSelect(event: WechatMiniprogram.BaseEvent) {
    const officerId = eventDataset(event).id
    if (typeof officerId !== 'string') return
    const state = getState(this)
    const result = addOfficerToShip(state.fleet, state.currentShipId, officerId)
    if (result.error !== 'officer-occupied' || !result.fromShipId) {
      applyResult(this, result)
      render(this)
      return
    }
    wx.showModal({
      title: '確認移動航海士',
      content: `此航海士目前在${result.fromShipId.replace('ship-', '')}號船，移動後原船需要重新檢查。`,
      confirmText: '確認移動',
      success: (modalResult) => {
        if (!modalResult.confirm) return
        const next = moveOfficerToShip(
          getState(this).fleet,
          result.fromShipId!,
          getState(this).currentShipId,
          officerId,
        )
        applyResult(this, next)
        render(this)
      },
    })
  },

  onOfficerRemove(event: WechatMiniprogram.BaseEvent) {
    const officerId = eventDataset(event).id
    if (typeof officerId !== 'string') return
    const state = getState(this)
    applyResult(this, removeOfficerFromShip(state.fleet, state.currentShipId, officerId))
    render(this)
  },

  onOfficerLock(event: WechatMiniprogram.BaseEvent) {
    const officerId = eventDataset(event).id
    if (typeof officerId !== 'string') return
    const state = getState(this)
    const ship = state.fleet.ships.find((item) => item.id === state.currentShipId)!
    const result = ship.lockedOfficerIds.includes(officerId)
      ? unlockOfficer(state.fleet, state.currentShipId, officerId)
      : lockOfficer(state.fleet, state.currentShipId, officerId)
    applyResult(this, result)
    render(this)
  },

  onBanOfficer(event: WechatMiniprogram.BaseEvent) {
    const officerId = eventDataset(event).id
    if (typeof officerId !== 'string') return
    const state = getState(this)
    applyResult(this, excludeOfficerFromShip(state.fleet, state.currentShipId, officerId))
    render(this)
  },

  onUnbanOfficer(event: WechatMiniprogram.BaseEvent) {
    const officerId = eventDataset(event).id
    if (typeof officerId !== 'string') return
    const state = getState(this)
    applyResult(this, unbanOfficer(state.fleet, officerId))
    render(this)
  },
})
