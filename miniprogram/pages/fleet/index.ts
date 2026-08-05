import {
  addOfficerToShip,
  assignSkillToFirstOpenTarget,
  createFleetState,
  excludeOfficerFromShip,
  lockOfficer,
  moveOfficerToShip,
  recalculateShip,
  removeOfficerFromShip,
  setShipMode,
  unbanOfficer,
  unlockOfficer,
  updateShipTargets,
} from '../../domain/battle-fleet'
import { solveBattleTargets } from '../../domain/battle-fleet-solver'
import { getDictionaries, getFleetOfficers, getSkills } from '../../runtime/main-data-store'
import { buildBattleFleetPageData } from '../../presenters/battle-fleet-presenter'
import { buildSkillSheet } from '../../presenters/skill-sheet'
import type { BattleSkillFilter, FleetState } from '../../contracts/battle-fleet'
import type { BattleFleetPageData } from '../../presenters/battle-fleet-presenter'
import type { SkillSheetView } from '../../presenters/skill-sheet'
import type {
  RuntimeDictionaries,
  RuntimeFleetOfficer,
  RuntimeSkill,
} from '../../contracts/runtime-data'

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
}

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
}

interface FleetPageLike {
  data: FleetPageData
  setData(update: Record<string, unknown>): void
}

const pageStateByInstance = new WeakMap<object, FleetPageState>()
const MANUAL_SKILL_WINDOW_SIZE = 40

const eventDataset = (event: WechatMiniprogram.BaseEvent): Record<string, unknown> =>
  (event.currentTarget.dataset as unknown as Record<string, unknown>) ?? {}

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

const applyResult = (page: FleetPageLike, next: { state: FleetState; error?: string }): void => {
  if (next.error) {
    showError(resultMessage[next.error] ?? '操作未完成')
    return
  }
  const state = getState(page)
  state.fleet = next.state
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
    }
    pageStateByInstance.set(this, state)
    wx.setNavigationBarTitle({ title: '戰鬥模擬艦隊' })
    return render(this, false)
  },

  onReady() {
    return render(this)
  },

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
    })
    const recommendedIds =
      result.officerIds.length > 0 ? result.officerIds : current.lockedOfficerIds
    applyResult(this, recalculateShip(state.fleet, current.id, recommendedIds))
    render(this)
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
