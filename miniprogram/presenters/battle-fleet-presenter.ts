import type {
  BattleSkillFilter,
  BattleSkillOption,
  FleetOfficerMap,
  FleetOfficerStatus,
  FleetShipState,
  FleetShipStatus,
  FleetSkillMap,
  FleetState,
  ShipSkillSummary,
} from '../contracts/battle-fleet'
import type {
  RuntimeDictionaries,
  RuntimeFleetOfficer,
  RuntimeSkill,
} from '../contracts/runtime-data'
import type { SkillSheetView } from './skill-sheet'
import { buildOfficerVisuals } from './officer-visuals'
import type { OfficerVisualPaths } from './officer-visuals'
import {
  filterBattleSkills,
  getOfficerStatus,
  getShipStatus,
  summarizeShipSkills,
} from '../domain/battle-fleet'

export interface BattleFleetContributorView {
  officerId: string
  name: string
  portraitPath: string
}

export interface BattleFleetSkillSummaryView extends ShipSkillSummary {
  contributors: BattleFleetContributorView[]
}

export interface BattleFleetOfficerView {
  id: string
  name: string
  jobName: string
  rarityName: string
  portraitPath: string
  status: FleetOfficerStatus
  statusLabel: string
  ownerShipLabel: string
  canSelect: boolean
  visuals: OfficerVisualPaths
}

export interface BattleFleetSlotView {
  position: number
  officer: BattleFleetOfficerView | null
}

export interface BattleFleetTargetView {
  id: string
  skillId: string | null
  skillName: string
  skillIconPath: string
  targetLevel: number
  configured: boolean
}

export interface BattleFleetShipTabView {
  id: string
  label: string
  count: number
  status: FleetShipStatus
  statusLabel: string
  isCurrent: boolean
}

export interface BattleFleetOverviewView extends BattleFleetShipTabView {
  needsReview: boolean
}

export interface BattleFleetCurrentShipView extends BattleFleetShipTabView {
  mode: FleetShipState['mode']
  slots: BattleFleetSlotView[]
  targets: BattleFleetTargetView[]
}

export interface BattleFleetCategoryView {
  id: string
  name: string
}

export interface BattleFleetPageData {
  occupiedCount: number
  fleetCapacity: number
  shipTabs: BattleFleetShipTabView[]
  fleetOverview: BattleFleetOverviewView[]
  currentShip: BattleFleetCurrentShipView
  currentShipId: string
  mode: FleetShipState['mode']
  manualSkillId: string | null
  manualSkills: BattleSkillOption[]
  manualCandidates: BattleFleetOfficerView[]
  skillKinds: Array<{ id: BattleSkillFilter['kind']; name: string }>
  skillCategories: BattleFleetCategoryView[]
  targets: BattleFleetTargetView[]
  bannedOfficers: BattleFleetOfficerView[]
  skillSummary: BattleFleetSkillSummaryView[]
  sheetSkill: SkillSheetView | null
}

const STATUS_LABELS: Record<FleetShipStatus, string> = {
  empty: '未配置',
  editing: '編輯中',
  complete: '已完成',
  'incomplete-target': '未完全達成目標',
  'needs-review': '需要重新檢查',
}

const OFFICER_STATUS_LABELS: Record<FleetOfficerStatus, string> = {
  available: '可選擇',
  current: '目前船',
  locked: '已鎖定',
  occupied: '已占用',
  banned: '已排除',
}

const toOfficerMap = (officers: readonly RuntimeFleetOfficer[]): FleetOfficerMap =>
  Object.fromEntries(officers.map((officer) => [officer.id, officer]))

const toSkillMap = (skills: Readonly<Record<string, RuntimeSkill>>): FleetSkillMap => skills

const targetsToMap = (ship: FleetShipState): Record<string, number> =>
  Object.fromEntries(
    ship.targets.flatMap((target) =>
      target.skillId === null ? [] : [[target.skillId, target.targetLevel] as const],
    ),
  )

const buildSummaryViews = (
  summaries: readonly ShipSkillSummary[],
  officers: FleetOfficerMap,
): BattleFleetSkillSummaryView[] =>
  summaries.map((summary) => ({
    ...summary,
    contributors: summary.contributorOfficerIds.flatMap((officerId) => {
      const officer = officers[officerId]
      return officer ? [{ officerId, name: officer.name, portraitPath: officer.portraitPath }] : []
    }),
  }))

const ownerLabel = (state: FleetState, currentShipId: string, officerId: string): string => {
  const owner = state.ships.find((ship) => ship.officerIds.includes(officerId))
  if (!owner || owner.id === currentShipId) return ''
  return owner.label
}

const buildOfficerView = (
  state: FleetState,
  currentShipId: string,
  officer: RuntimeFleetOfficer,
): BattleFleetOfficerView => {
  const status = getOfficerStatus(state, currentShipId, officer.id)
  return {
    id: officer.id,
    name: officer.name,
    jobName: officer.jobName,
    rarityName: officer.rarityName,
    portraitPath: officer.portraitPath,
    status,
    statusLabel: OFFICER_STATUS_LABELS[status],
    ownerShipLabel: ownerLabel(state, currentShipId, officer.id),
    canSelect: status === 'available',
    visuals: buildOfficerVisuals({
      visualGradeId: officer.visualGradeId,
      typeId: officer.typeId,
      genderId: officer.genderId,
    }),
  }
}

const buildTargetViews = (ship: FleetShipState, skills: FleetSkillMap): BattleFleetTargetView[] =>
  ship.targets.map((target) => {
    const skill = target.skillId === null ? undefined : skills[target.skillId]
    return {
      id: target.id,
      skillId: target.skillId,
      skillName: skill?.n ?? '尚未選擇技能',
      skillIconPath: skill?.ip ?? '',
      targetLevel: target.targetLevel,
      configured: target.skillId !== null,
    }
  })

const statusForShip = (
  ship: FleetShipState,
  officers: FleetOfficerMap,
  skills: FleetSkillMap,
): FleetShipStatus =>
  getShipStatus(ship, summarizeShipSkills(ship.officerIds, officers, skills, targetsToMap(ship)))

export const buildBattleFleetPageData = (
  state: FleetState,
  officerList: readonly RuntimeFleetOfficer[],
  skillRecord: Readonly<Record<string, RuntimeSkill>>,
  dictionaries: RuntimeDictionaries,
  currentShipId: string,
  manualFilters: BattleSkillFilter,
  manualSkillId: string | null = null,
): BattleFleetPageData => {
  void dictionaries
  const officers = toOfficerMap(officerList)
  const skills = toSkillMap(skillRecord)
  const currentShip = state.ships.find((ship) => ship.id === currentShipId) ?? state.ships[0]!
  const currentSummary = summarizeShipSkills(
    currentShip.officerIds,
    officers,
    skills,
    targetsToMap(currentShip),
  )
  const statuses = new Map(
    state.ships.map((ship) => [ship.id, statusForShip(ship, officers, skills)] as const),
  )
  const shipTabs = state.ships.map((ship) => ({
    id: ship.id,
    label: ship.label,
    count: ship.officerIds.length,
    status: statuses.get(ship.id)!,
    statusLabel: STATUS_LABELS[statuses.get(ship.id)!],
    isCurrent: ship.id === currentShip.id,
  }))
  const fleetOverview = state.ships.map((ship) => ({
    ...shipTabs.find((tab) => tab.id === ship.id)!,
    needsReview: ship.needsReview,
  }))
  const allSkillOptions = filterBattleSkills(officers, skills, {
    kind: manualFilters.kind,
    categoryId: null,
    searchText: '',
  })
  const categoryMap = new Map<string, string>()
  for (const option of allSkillOptions) categoryMap.set(option.categoryId, option.categoryName)
  const manualSkills = filterBattleSkills(officers, skills, manualFilters)
  const manualCandidates = manualSkillId
    ? officerList
        .filter((officer) => officer.skills.some((relation) => relation.skillId === manualSkillId))
        .map((officer) => buildOfficerView(state, currentShip.id, officer))
    : []
  const bannedOfficers = officerList
    .filter((officer) => state.bannedOfficerIds.includes(officer.id))
    .map((officer) => buildOfficerView(state, currentShip.id, officer))
  const targetViews = buildTargetViews(currentShip, skills)

  return {
    occupiedCount: state.ships.reduce((count, ship) => count + ship.officerIds.length, 0),
    fleetCapacity: 77,
    shipTabs,
    fleetOverview,
    currentShip: {
      ...shipTabs.find((tab) => tab.id === currentShip.id)!,
      mode: currentShip.mode,
      slots: Array.from({ length: 11 }, (_, index) => {
        const officerId = currentShip.officerIds[index]
        return {
          position: index + 1,
          officer:
            officerId && officers[officerId]
              ? buildOfficerView(state, currentShip.id, officers[officerId]!)
              : null,
        }
      }),
      targets: targetViews,
    },
    currentShipId: currentShip.id,
    mode: currentShip.mode,
    manualSkillId,
    manualSkills,
    manualCandidates,
    skillKinds: [
      { id: 'all', name: '全部技能' },
      { id: 'active', name: '主動技能' },
      { id: 'passive', name: '戰鬥被動' },
    ],
    skillCategories: [...categoryMap.entries()]
      .map(([id, name]) => ({ id, name }))
      .sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0)),
    targets: targetViews,
    bannedOfficers,
    skillSummary: buildSummaryViews(currentSummary, officers),
    sheetSkill: null,
  }
}
