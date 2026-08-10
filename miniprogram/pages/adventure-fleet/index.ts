import {
  addOfficerToShip,
  banOfficer,
  collectAllLockedIds,
  createFleetState,
  deriveAdventureOfficers,
  excludeOfficerFromShip,
  getAdventureOptimizationTargets,
  getAdventureSkillIdSet,
  getDefaultAdventureTargetSkillIds,
  lockOfficer,
  moveOfficerToShip,
  removeOfficerFromShip,
  setShipMode,
  unbanOfficer,
  unlockOfficer,
  updateShipTargets,
  type AdventureFleetOfficer,
} from '../../domain/adventure-fleet'
import { solveAdventureTargets } from '../../domain/adventure-fleet-solver'
import {
  applyAdventureProposal,
  cloneFleetState,
  fleetStateFingerprint,
} from '../../domain/fleet-proposal'
import { getCatalog, getSkills } from '../../runtime/main-data-store'
import { buildAdventureFleetPageData } from '../../presenters/adventure-fleet-presenter'
import { buildFleetProposalPreview } from '../../presenters/fleet-proposal-presenter'
import { buildSkillSheet } from '../../presenters/skill-sheet'
import { serializeFleetState } from '../../contracts/fleet-config'
import { getFleetConfigService, FleetConfigError } from '../../runtime/fleet-config-service'
import type { FleetConfigService } from '../../runtime/fleet-config-service'
import type { FleetConfigSummary } from '../../contracts/fleet-config'
import type { FleetState, FleetShipState } from '../../contracts/battle-fleet'
import type { RuntimeSkill } from '../../contracts/runtime-data'
import type { AdventureFleetPageData } from '../../presenters/adventure-fleet-presenter'
import type { FleetProposal } from '../../contracts/fleet-proposal'
import type { FleetProposalPreviewView } from '../../presenters/fleet-proposal-presenter'
import type { SkillSheetView } from '../../presenters/skill-sheet'

// ── 配置操作类型 ──

type ConfigModalAction = 'save' | 'saveAs' | 'rename' | 'none'

interface OfficerActionSheetData {
  visible: boolean
  officerId: string
  officerName: string
  status: string
  statusLabel: string
  allowBan: boolean
  disabledActions: string[]
  lockDisabledReason: string
  removeDisabledReason: string
  banDisabledReason: string
}

interface PendingConfigAction {
  type: 'load' | 'new' | 'saveAs' | 'rename' | 'delete' | 'exit'
  targetConfigId?: string
  targetName?: string
}

// ── 页面数据 ──

interface FleetPageData extends AdventureFleetPageData {
  // 素材加载
  assetLoading: boolean
  assetLoadError: string | null
  assetReady: boolean
  failedPortraitImages: Record<string, boolean>
  failedSkillImages: Record<string, boolean>
  // 技能选择器
  manualSkillHasMore: boolean
  skillSearchText: string
  showTargetPicker: boolean
  sheetSkill: SkillSheetView | null
  // 配置管理
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
  officerActionSheet: OfficerActionSheetData
}

// ── 页面状态 ──

interface FleetPageState {
  fleet: FleetState
  adventureOfficers: readonly AdventureFleetOfficer[]
  skills: Readonly<Record<string, RuntimeSkill>>
  manualSkillId: string | null
  manualSearchText: string
  manualSkillLimit: number
  assetRetryCount: number
  // 配置追踪
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

const emptyOfficerActionSheet: OfficerActionSheetData = {
  visible: false,
  officerId: '',
  officerName: '',
  status: '',
  statusLabel: '',
  allowBan: true,
  disabledActions: [],
  lockDisabledReason: '',
  removeDisabledReason: '',
  banDisabledReason: '',
}

const buildOfficerActionSheet = (officer: {
  id: string
  name: string
  status: string
  statusLabel: string
}): OfficerActionSheetData => {
  const isLocked = officer.status === 'locked'
  return {
    visible: true,
    officerId: officer.id,
    officerName: officer.name,
    status: officer.status,
    statusLabel: officer.statusLabel,
    allowBan: true,
    disabledActions: isLocked ? ['remove', 'ban'] : [],
    lockDisabledReason: '',
    removeDisabledReason: isLocked ? '鎖定成員不可移除，請先解鎖' : '',
    banDisabledReason: isLocked ? '鎖定成員不可排除，請先解鎖' : '',
  }
}

const closeOfficerActionSheet = (page: FleetPageLike): void => {
  page.setData({ officerActionSheet: { ...emptyOfficerActionSheet, disabledActions: [] } })
}

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
  if (!state) throw new Error('adventure-fleet-page-not-loaded')
  return state
}

const emptyPageData: FleetPageData = {
  occupiedCount: 0,
  fleetCapacity: 77,
  mode: 'manual',
  typeZones: [],
  manualSkills: [],
  selectedSkillId: null,
  skillSearchText: '',
  manualCandidates: [],
  targets: [],
  skillSummary: [],
  bannedOfficers: [],
  optimizationTargetCount: 0,
  canRecalculate: false,
  sheetSkill: null,
  assetLoading: false,
  assetLoadError: null,
  assetReady: false,
  failedPortraitImages: {},
  failedSkillImages: {},
  manualSkillHasMore: false,
  showTargetPicker: false,
  authStatus: 'guest',
  configName: '未命名配置',
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
  officerActionSheet: { ...emptyOfficerActionSheet, disabledActions: [] },
}

const showError = (message: string): void => {
  wx.showToast({ title: message, icon: 'none' })
}

const resultMessage: Record<string, string> = {
  'ship-full': '艦隊已滿 (77人)',
  'officer-occupied': '航海士已配置',
  'officer-banned': '航海士已排除',
  'officer-locked': '航海士已鎖定',
  'invalid-target-level': '目標等級必須是 Lv.0 至 Lv.10',
  'duplicate-target': '該技能已在目標列表中',
  'invalid-recommendation': '自動配隊結果無效',
  'ship-slot-full': '目前船已滿 (11人)',
  'no-optimization-target': '請先設定至少一個 Lv.1 以上的優化目標',
}

// ── 脏数据追踪 ──

const computeDirty = (state: FleetPageState): boolean => {
  if (state.savedFleetState === null) {
    const empty = createFleetState()
    return serializeFleetState(state.fleet) !== serializeFleetState(empty)
  }
  return serializeFleetState(state.fleet) !== state.savedFleetState
}

const updateDirty = (page: FleetPageLike, state: FleetPageState): void => {
  const isDirty = computeDirty(state)
  state.isDirty = isDirty
  if (isDirty) {
    page.setData({ configStatus: 'unsaved' })
  } else if (state.activeConfigId) {
    page.setData({ configStatus: 'saved' })
  } else {
    page.setData({ configStatus: 'new' })
  }
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

// ── 渲染 ──

const render = (page: FleetPageLike): void => {
  const state = getState(page)
  const view = buildAdventureFleetPageData(
    state.fleet,
    state.adventureOfficers,
    state.skills,
    state.manualSearchText,
    state.manualSkillId,
  )
  page.setData({
    ...view,
    manualSkills: view.manualSkills.slice(0, state.manualSkillLimit),
    manualSkillHasMore: view.manualSkills.length > state.manualSkillLimit,
    skillSearchText: state.manualSearchText,
    sheetSkill: view.sheetSkill,
    assetLoading: false,
    assetLoadError: null,
    assetReady: true,
    failedPortraitImages: page.data.failedPortraitImages ?? {},
    failedSkillImages: page.data.failedSkillImages ?? {},
    proposalPreview: state.proposal
      ? buildFleetProposalPreview(
          state.fleet,
          state.proposal,
          state.adventureOfficers,
          state.skills,
        )
      : null,
    canUndoProposal: state.undoFleetState !== null,
    configStatus: state.isDirty ? 'unsaved' : state.activeConfigId ? 'saved' : 'new',
  })
}

// ── 全队模式同步 ──

const syncAllShipsMode = (state: FleetPageState, mode: FleetShipState['mode']): void => {
  let fleet = state.fleet
  for (const ship of fleet.ships) {
    const result = setShipMode(fleet, ship.id, mode)
    if (!result.error) fleet = result.state
  }
  state.fleet = fleet
}

const clearEmptyTargets = (state: FleetPageState): void => {
  let fleet = state.fleet
  for (const ship of fleet.ships) {
    const result = updateShipTargets(
      fleet,
      ship.id,
      ship.targets.filter((target) => target.skillId !== null),
    )
    if (!result.error) fleet = result.state
  }
  state.fleet = fleet
}

const nextAdventureTargetId = (ship: FleetShipState): string => {
  const existingIds = new Set(ship.targets.map((target) => target.id))
  let index = ship.targets.length + 1
  while (existingIds.has(`adventure-target-${index}`)) index += 1
  return `adventure-target-${index}`
}

// ── 查找有空位的船 ──

const findOpenShip = (fleet: FleetState): string | null => {
  for (const ship of fleet.ships) {
    if (ship.officerIds.length < 11) return ship.id
  }
  return null
}

// ── 未保存守卫 ──

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
  if (!state.isDirty) {
    state.pendingAction = action
    resolvePendingAction(page)
    return
  }

  state.pendingAction = action
  page.setData({
    pendingAction: action,
    showUnsavedGuard: true,
  })
}

// ── 配置操作 ──

const handleConfigError = (page: FleetPageLike, error: unknown): void => {
  console.error('adventure-fleet-config error:', error)
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
    state.fleet = record.fleetState
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
  state.configName = '未命名配置'
  state.configVersion = 0
  state.savedFleetState = null
  state.isDirty = false
  state.manualSkillId = null
  state.manualSearchText = ''
  state.manualSkillLimit = MANUAL_SKILL_WINDOW_SIZE
  page.setData({
    activeConfigId: null,
    configName: '未命名配置',
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
  action: ConfigModalAction,
  prefillName?: string,
): void => {
  page.setData({
    showNameModal: true,
    modalAction: action,
    modalInputValue: prefillName ?? page.data.configName,
    modalTitle: action === 'saveAs' ? '另存為' : action === 'rename' ? '重命名' : '保存配置',
  })
}

// ── 认证 ──

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

  if (state.isDirty) {
    openNameModal(page, 'saveAs')
    return
  }

  await refreshConfigList(state, page)
  const list = state.configList
  if (list.length === 0) {
    doNewConfig(page)
    return
  }

  const latest = list.reduce((a, b) => (a.lastUsedAt > b.lastUsedAt ? a : b))
  await doLoadConfig(page, latest.configId)
}

// ── 冲突处理 ──

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

/** 为新舰队自动加入默认冒险技能目标（排除钓鱼/回报资源/回报发现物/村庄相关） */
const initDefaultTargets = (state: FleetPageState): void => {
  const defaultSkillIds = getDefaultAdventureTargetSkillIds(state.adventureOfficers)
  if (defaultSkillIds.length === 0) return
  const targets = defaultSkillIds.map((skillId, index) => ({
    id: `adventure-target-${index + 1}`,
    skillId,
    targetLevel: 0,
  }))
  const result = updateShipTargets(state.fleet, 'ship-1', targets)
  if (!result.error) state.fleet = result.state
}

// ── 页面定义 ──

Page({
  data: {
    ...emptyPageData,
    skillSearchText: '',
  } as FleetPageData,

  onLoad() {
    const catalog = getCatalog()
    const skills = getSkills()
    const adventureSkillIds = getAdventureSkillIdSet(skills)
    const adventureOfficers = deriveAdventureOfficers(catalog, adventureSkillIds)

    const state: FleetPageState = {
      fleet: createFleetState(),
      adventureOfficers,
      skills,
      manualSkillId: null,
      manualSearchText: '',
      manualSkillLimit: MANUAL_SKILL_WINDOW_SIZE,
      assetRetryCount: 0,
      authStatus: 'guest',
      activeConfigId: null,
      configName: '未命名配置',
      configVersion: 0,
      configList: [],
      savedFleetState: null,
      isDirty: false,
      configService: getFleetConfigService(),
      pendingAction: null,
      proposal: null,
      undoFleetState: null,
    }
    // 所有船设为自动模式 + 自动填充默认冒险技能目标
    syncAllShipsMode(state, 'auto')
    clearEmptyTargets(state)
    initDefaultTargets(state)
    pageStateByInstance.set(this, state)
    wx.setNavigationBarTitle({ title: '冒險模擬艦隊' })
    render(this)
  },

  onReady() {
    render(this)
  },

  // ── 素材 ──

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

  retryAssetLoading() {
    const state = getState(this)
    if (state.assetRetryCount >= 1) return
    state.assetRetryCount += 1
    this.setData({ failedPortraitImages: {}, failedSkillImages: {} })
    render(this)
  },

  // ── 模式切换 ──

  onModeTap(event: WechatMiniprogram.BaseEvent) {
    const mode = eventDataset(event).mode
    if (mode !== 'manual' && mode !== 'auto') return
    const state = getState(this)
    closeOfficerActionSheet(this)
    syncAllShipsMode(state, mode)
    clearEmptyTargets(state)
    state.manualSkillId = null
    updateDirty(this, state)
    render(this)
  },

  // ── 技能选择器 ──

  onSkillSearchInput(event: WechatMiniprogram.Input) {
    const state = getState(this)
    state.manualSearchText = event.detail.value ?? ''
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
    const sheet = buildSkillSheet(skill, 'passive')
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
    const ship = state.fleet.ships[0]!

    // 手动模式：设置选中技能以筛选候选人
    if (ship.mode === 'manual') {
      state.manualSkillId = skillId
      render(this)
      return
    }

    // 自动模式：将技能加入舰队目标；默认 Lv.0 目标直接提升为 Lv.1
    const configuredTargets = ship.targets.filter((target) => target.skillId !== null)
    const existingTarget = configuredTargets.find((target) => target.skillId === skillId)
    if (existingTarget && existingTarget.targetLevel > 0) {
      showError(resultMessage['duplicate-target'])
      return
    }

    const targets = existingTarget
      ? configuredTargets.map((target) =>
          target.id === existingTarget.id ? { ...target, targetLevel: 1 } : { ...target },
        )
      : [...configuredTargets, { id: nextAdventureTargetId(ship), skillId, targetLevel: 1 }]
    const result = updateShipTargets(state.fleet, ship.id, targets)
    if (result.error) {
      applyResult(this, result)
      return
    }
    applyResult(this, result)
    this.setData({ showTargetPicker: false })
    render(this)
  },

  // ── 配队目标 ──

  onTargetSkillTap(event: WechatMiniprogram.BaseEvent) {
    const skillId = eventDataset(event).skillId
    if (typeof skillId !== 'string' || !skillId) return
    const state = getState(this)
    const skill = state.skills[skillId]
    if (!skill) return
    const sheet = buildSkillSheet(skill, 'passive')
    this.setData({ sheetSkill: sheet })
  },

  onTargetLevelBlur(event: WechatMiniprogram.Input) {
    const targetId = eventDataset(event).id
    if (typeof targetId !== 'string') return
    const level = Number(event.detail.value?.trim())
    if (!Number.isInteger(level) || level < 0 || level > 10) {
      showError(resultMessage['invalid-target-level'])
      render(this)
      return
    }
    const state = getState(this)
    const ship = state.fleet.ships[0]!
    const targets = ship.targets.map((t) =>
      t.id === targetId ? { ...t, targetLevel: level } : { ...t },
    )
    const result = updateShipTargets(state.fleet, ship.id, targets)
    applyResult(this, result)
    render(this)
  },

  onAddTarget() {
    this.setData({ showTargetPicker: true })
  },

  onTargetPickerClose() {
    this.setData({ showTargetPicker: false })
  },

  onRemoveTarget(event: WechatMiniprogram.BaseEvent) {
    const targetId = eventDataset(event).id
    if (typeof targetId !== 'string') return
    const state = getState(this)
    const ship = state.fleet.ships[0]!
    const result = updateShipTargets(
      state.fleet,
      ship.id,
      ship.targets.filter((t) => t.id !== targetId),
    )
    applyResult(this, result)
    render(this)
  },

  onRecalculate() {
    const state = getState(this)
    const ship = state.fleet.ships[0]!
    const allLockedIds = collectAllLockedIds(state.fleet)
    const excludedIds = new Set([
      ...state.fleet.bannedOfficerIds,
      ...state.fleet.ships.flatMap((s) => s.removedOfficerIds),
    ])

    const activeTargets = getAdventureOptimizationTargets(ship.targets)
    if (activeTargets.length === 0) {
      showError(resultMessage['no-optimization-target'])
      return
    }

    const result = solveAdventureTargets({
      officers: state.adventureOfficers,
      targets: activeTargets,
      lockedOfficerIds: allLockedIds,
      excludedOfficerIds: [...excludedIds],
      currentOfficerIds: state.fleet.ships.flatMap((s) => s.officerIds),
      capacity: 77,
      shipId: null,
      baseStateFingerprint: fleetStateFingerprint(state.fleet),
    })

    state.proposal = result
    this.setData({
      proposalPreview: buildFleetProposalPreview(
        state.fleet,
        result,
        state.adventureOfficers,
        state.skills,
      ),
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
    const result = applyAdventureProposal(state.fleet, proposal)
    if (result.error) {
      showError(
        result.error === 'invalid-recommendation'
          ? '目前艦隊已變更或方案無法套用，請重新計算方案'
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

  // ── 航海士操作 ──

  onOfficerActionOpen(event: WechatMiniprogram.BaseEvent) {
    const officerId = eventDataset(event).id
    if (typeof officerId !== 'string') return
    const officer = this.data.typeZones
      .flatMap((zone) => zone.officers)
      .find((item) => item.id === officerId)
    if (!officer) return

    this.setData({ officerActionSheet: buildOfficerActionSheet(officer) })
  },

  onOfficerActionDismiss() {
    closeOfficerActionSheet(this)
  },

  onOfficerSelect(event: WechatMiniprogram.BaseEvent) {
    const officerId = eventDataset(event).id
    if (typeof officerId !== 'string') return
    const state = getState(this)

    // 找有空位的船
    const shipId = findOpenShip(state.fleet)

    if (!shipId) {
      showError(resultMessage['ship-full'])
      return
    }

    const result = addOfficerToShip(state.fleet, shipId, officerId)
    if (result.error === 'officer-occupied' && result.fromShipId) {
      wx.showModal({
        title: '確認移動航海士',
        content: `此航海士目前在${result.fromShipId.replace('ship-', '')}號船，移動後原船需要重新檢查。`,
        confirmText: '確認移動',
        success: (modalResult) => {
          if (!modalResult.confirm) return
          const next = moveOfficerToShip(
            getState(this).fleet,
            result.fromShipId!,
            shipId,
            officerId,
          )
          applyResult(this, next)
          render(this)
        },
      })
      return
    }
    applyResult(this, result)
    render(this)
  },

  onOfficerRemove(event: WechatMiniprogram.BaseEvent) {
    const officerId = eventDataset(event).id
    if (typeof officerId !== 'string') return
    closeOfficerActionSheet(this)
    const state = getState(this)
    // 找到该航海士所在的船
    const ship = state.fleet.ships.find((s) => s.officerIds.includes(officerId))
    if (!ship) return
    applyResult(this, removeOfficerFromShip(state.fleet, ship.id, officerId))
    render(this)
  },

  onOfficerLock(event: WechatMiniprogram.BaseEvent) {
    const officerId = eventDataset(event).id
    if (typeof officerId !== 'string') return
    closeOfficerActionSheet(this)
    const state = getState(this)
    const ship = state.fleet.ships.find((s) => s.officerIds.includes(officerId))
    if (!ship) {
      showError('請先將航海士加入艦隊')
      return
    }
    const result = ship.lockedOfficerIds.includes(officerId)
      ? unlockOfficer(state.fleet, ship.id, officerId)
      : lockOfficer(state.fleet, ship.id, officerId)
    applyResult(this, result)
    render(this)
  },

  onBanOfficer(event: WechatMiniprogram.BaseEvent) {
    const officerId = eventDataset(event).id
    if (typeof officerId !== 'string') return
    closeOfficerActionSheet(this)
    const state = getState(this)
    const ship = state.fleet.ships.find((s) => s.officerIds.includes(officerId))
    if (ship) {
      applyResult(this, excludeOfficerFromShip(state.fleet, ship.id, officerId))
    } else {
      applyResult(this, banOfficer(state.fleet, officerId))
    }
    render(this)
  },

  onUnbanOfficer(event: WechatMiniprogram.BaseEvent) {
    const officerId = eventDataset(event).id
    if (typeof officerId !== 'string') return
    const state = getState(this)
    applyResult(this, unbanOfficer(state.fleet, officerId))
    render(this)
  },

  // ── 配置：登入 ──

  async onConfigLogin() {
    const state = getState(this)
    if (state.authStatus === 'loading') return

    const ok = await performLogin(this)
    if (ok) {
      await onAfterLogin(this)
    }
  },

  // ── 配置：菜单 ──

  onConfigMenuTap() {
    const show = !this.data.showConfigMenu
    this.setData({ showConfigMenu: show })
  },

  async onConfigListOpen() {
    const state = getState(this)
    if (state.authStatus !== 'authenticated') {
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

  onConfigSelect(event: WechatMiniprogram.BaseEvent) {
    const configId = eventDataset(event).id
    if (typeof configId !== 'string') return
    this.setData({ showConfigMenu: false })
    checkUnsavedAndProceed(this, { type: 'load', targetConfigId: configId })
  },

  onConfigNew() {
    this.setData({ showConfigMenu: false })
    checkUnsavedAndProceed(this, { type: 'new' })
  },

  async onConfigSave() {
    this.setData({ showConfigMenu: false })
    const state = getState(this)

    if (state.authStatus === 'guest') {
      const ok = await performLogin(this)
      if (!ok) return
      if (state.isDirty) {
        openNameModal(this, 'saveAs')
        return
      }
      await onAfterLogin(this)
      return
    }

    if (!state.activeConfigId) {
      openNameModal(this, 'saveAs')
      return
    }

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
      this.setData({ configName: record.name, configStatus: 'saved' })
      showError('已保存')
    } catch (e) {
      handleConfigError(this, e)
    }
  },

  onConfigSaveAs() {
    this.setData({ showConfigMenu: false })
    const state = getState(this)
    if (state.authStatus === 'guest') {
      void (async () => {
        const ok = await performLogin(this)
        if (!ok) return
        if (state.isDirty) {
          openNameModal(this, 'saveAs')
        }
      })()
      return
    }
    openNameModal(this, 'saveAs')
  },

  onConfigRename() {
    this.setData({ showConfigMenu: false })
    const state = getState(this)
    if (!state.activeConfigId) {
      showError('請先保存配置')
      return
    }
    openNameModal(this, 'rename', state.configName)
  },

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
        if (state.isDirty) {
          checkUnsavedAndProceed(this, { type: 'delete' })
        } else {
          doDeleteConfig(this).catch(() => {})
        }
      },
    })
  },

  // ── 名称弹窗 ──

  onConfigNameInput(event: WechatMiniprogram.Input) {
    this.setData({ modalInputValue: event.detail.value ?? '' })
  },

  async onConfigModalConfirm() {
    const state = getState(this)
    const action = this.data.modalAction
    const name = (this.data.modalInputValue ?? '').trim()

    if (!name || name.length === 0) {
      showError('請輸入配置名稱')
      return
    }

    if ([...name].length > 30) {
      showError('配置名稱不可超過 30 個字元')
      return
    }

    this.setData({ showNameModal: false })

    try {
      if (action === 'saveAs') {
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
        this.setData({ configName: record.name })
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

  // ── 未保存守卫 ──

  onUnsavedGuardSave() {
    const state = getState(this)
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
    this.setData({ pendingAction: null, showUnsavedGuard: false })
  },

  // ── 冲突弹窗 ──

  onConflictReload() {
    handleConflictReload(this).catch(() => {})
  },

  onConflictForceOverwrite() {
    handleConflictForceOverwrite(this).catch(() => {})
  },

  onConflictCancel() {
    this.setData({ showConflictDialog: false })
  },

  // ── 阻止穿透 ──

  onNoop() {
    // 空函数，阻止事件冒泡
  },
})
