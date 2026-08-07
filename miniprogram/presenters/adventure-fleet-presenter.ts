import type { FleetState } from '../contracts/battle-fleet'
import type { RuntimeSkill } from '../contracts/runtime-data'
import type { SkillSheetView } from './skill-sheet'
import { buildOfficerVisuals } from './officer-visuals'
import type { OfficerVisualPaths } from './officer-visuals'
import {
  collectAllOfficerIds,
  collectAllLockedIds,
  filterAdventureSkills,
  getZoneLabel,
  groupOfficersByType,
  summarizeFleetAdventureSkills,
  ZONE_ORDER,
  type AdventureFleetOfficer,
  type AdventureOfficerMap,
  type AdventureSkillOption,
  type AdventureTypeZone,
} from '../domain/adventure-fleet'

// ── 视图类型 ──

export interface AdventureFleetContributorView {
  officerId: string
  name: string
  portraitPath: string
}

export interface AdventureFleetSkillSummaryView {
  skillId: string
  skillName: string
  skillIconPath: string
  totalLevel: number
  targetLevel: number | null
  isReached: boolean | null
  difference: number | null
  contributors: AdventureFleetContributorView[]
}

export interface AdventureFleetOfficerView {
  id: string
  name: string
  jobName: string
  rarityName: string
  portraitPath: string
  status: 'locked' | 'current' | 'available' | 'banned'
  statusLabel: string
  shipLabel: string
  canSelect: boolean
  visuals: OfficerVisualPaths
  zone: AdventureTypeZone | null
}

export interface AdventureFleetTargetView {
  id: string
  skillId: string | null
  skillName: string
  skillIconPath: string
  skillDescription: string
  targetLevel: number
  configured: boolean
}

export interface AdventureTypeZoneView {
  zone: AdventureTypeZone
  zoneLabel: string
  lockedCount: number
  totalCount: number
  officers: AdventureFleetOfficerView[]
}

export interface AdventureFleetPageData {
  occupiedCount: number
  fleetCapacity: number
  mode: 'manual' | 'auto'
  // 类型分区
  typeZones: AdventureTypeZoneView[]
  // 技能选择器
  manualSkills: AdventureSkillOption[]
  selectedSkillId: string | null
  skillSearchText: string
  // 候选航海士（选择技能后显示）
  manualCandidates: AdventureFleetOfficerView[]
  // 自动模式目标
  targets: AdventureFleetTargetView[]
  // 舰队技能累计
  skillSummary: AdventureFleetSkillSummaryView[]
  // 排除名单（从 bannedOfficerIds + removedOfficerIds 收集）
  bannedOfficers: AdventureFleetOfficerView[]
  // 技能详情弹窗
  sheetSkill: SkillSheetView | null
}

// ── 常量 ──

const STATUS_LABELS: Record<string, string> = {
  locked: '已鎖定',
  current: '已配置',
  available: '可選擇',
  banned: '已排除',
}

// ── 辅助函数 ──

const toAdventureOfficerMap = (officers: readonly AdventureFleetOfficer[]): AdventureOfficerMap =>
  Object.fromEntries(officers.map((o) => [o.id, o]))

const targetsToMap = (
  targets: readonly { skillId: string | null; targetLevel: number }[],
): Record<string, number> =>
  Object.fromEntries(
    targets.flatMap((t) => (t.skillId === null ? [] : [[t.skillId, t.targetLevel] as const])),
  )

const shipLabelForOfficer = (state: FleetState, officerId: string): string => {
  const ship = state.ships.find((s) => s.officerIds.includes(officerId))
  return ship ? ship.label : ''
}

const buildOfficerView = (
  state: FleetState,
  officer: AdventureFleetOfficer,
  lockedIds: ReadonlySet<string>,
  bannedIds: ReadonlySet<string>,
): AdventureFleetOfficerView => {
  let status: AdventureFleetOfficerView['status']
  if (bannedIds.has(officer.id)) {
    status = 'banned'
  } else if (lockedIds.has(officer.id)) {
    status = 'locked'
  } else if (state.ships.some((s) => s.officerIds.includes(officer.id))) {
    status = 'current'
  } else {
    status = 'available'
  }

  return {
    id: officer.id,
    name: officer.name,
    jobName: officer.jobName,
    rarityName: officer.rarityName,
    portraitPath: officer.portraitPath,
    status,
    statusLabel: STATUS_LABELS[status] ?? status,
    shipLabel: shipLabelForOfficer(state, officer.id),
    canSelect: status === 'available',
    visuals: buildOfficerVisuals({
      visualGradeId: officer.visualGradeId,
      typeId: officer.typeId,
      genderId: officer.genderId,
    }),
    zone: officer.zone,
  }
}

const buildSummaryViews = (
  fleetState: FleetState,
  adventureOfficers: AdventureOfficerMap,
  skills: Readonly<Record<string, RuntimeSkill>>,
  targetMap: Record<string, number>,
): AdventureFleetSkillSummaryView[] => {
  const allIds = collectAllOfficerIds(fleetState)
  const summaries = summarizeFleetAdventureSkills(allIds, adventureOfficers, skills, targetMap)
  return summaries.map((s) => ({
    skillId: s.skillId,
    skillName: s.skillName,
    skillIconPath: s.skillIconPath,
    totalLevel: s.totalLevel,
    targetLevel: s.targetLevel,
    isReached: s.isReached,
    difference: s.difference,
    contributors: s.contributorOfficerIds.flatMap((oid) => {
      const officer = adventureOfficers[oid]
      return officer
        ? [{ officerId: oid, name: officer.name, portraitPath: officer.portraitPath }]
        : []
    }),
  }))
}

// ── 主入口 ──

export const buildAdventureFleetPageData = (
  state: FleetState,
  adventureOfficerList: readonly AdventureFleetOfficer[],
  skillRecord: Readonly<Record<string, RuntimeSkill>>,
  manualSearchText: string,
  manualSkillId: string | null = null,
): AdventureFleetPageData => {
  const adventureOfficers = toAdventureOfficerMap(adventureOfficerList)
  const lockedIds = new Set(collectAllLockedIds(state))
  const bannedIds = new Set(state.bannedOfficerIds)

  // 收集全部已配置 + 排除的航海士 ID
  const allConfiguredIds = collectAllOfficerIds(state)

  // 从第一艘船取目标（舰队级目标）
  const fleetTargets = state.ships[0]?.targets ?? []
  const targetMap = targetsToMap(fleetTargets)

  // ── 类型分区 ──
  const typeGroups = groupOfficersByType(allConfiguredIds, adventureOfficers)
  const typeZones: AdventureTypeZoneView[] = ZONE_ORDER.filter((zone) => {
    // 检查该区域是否有人（包括未配置但属于该类型的航海士也在数据中，这里只看已配置的）
    const group = typeGroups.find((g) => g.zone === zone)
    return group && group.officerIds.length > 0
  }).map((zone) => {
    const group = typeGroups.find((g) => g.zone === zone)!
    const officers = group.officerIds
      .map((id) => {
        const officer = adventureOfficers[id]
        if (!officer) return null
        return buildOfficerView(state, officer, lockedIds, bannedIds)
      })
      .filter((v): v is AdventureFleetOfficerView => v !== null)
    // 锁定排前
    const locked = officers.filter((o) => o.status === 'locked')
    const others = officers.filter((o) => o.status !== 'locked')
    return {
      zone,
      zoneLabel: getZoneLabel(zone),
      lockedCount: locked.length,
      totalCount: officers.length,
      officers: [...locked, ...others],
    }
  })

  // ── 技能选择器 ──
  const manualSkills = filterAdventureSkills(adventureOfficerList, skillRecord, manualSearchText)

  // ── 手动模式候选 ──
  const manualCandidates = manualSkillId
    ? adventureOfficerList
        .filter((o) => o.adventureSkills.some((rel) => rel.skillId === manualSkillId))
        .map((o) => buildOfficerView(state, o, lockedIds, bannedIds))
    : []

  // ── 排除名单 ──
  const bannedOfficers = adventureOfficerList
    .filter((o) => state.bannedOfficerIds.includes(o.id))
    .map((o) => buildOfficerView(state, o, lockedIds, bannedIds))

  // ── 自动模式目标视图 ──
  const targetViews: AdventureFleetTargetView[] = fleetTargets.map((t) => {
    const skill = t.skillId ? skillRecord[t.skillId] : undefined
    return {
      id: t.id,
      skillId: t.skillId,
      skillName: skill?.n ?? '尚未選擇技能',
      skillIconPath: skill?.ip ?? '',
      skillDescription: skill?.d ?? '',
      targetLevel: t.targetLevel,
      configured: t.skillId !== null,
    }
  })

  // ── 舰队技能累计 ──
  const skillSummary = buildSummaryViews(state, adventureOfficers, skillRecord, targetMap)

  // 取全局模式：所有船的模式应一致（页面保证），取第一艘
  const globalMode = state.ships[0]?.mode ?? 'manual'

  return {
    occupiedCount: allConfiguredIds.length,
    fleetCapacity: 77,
    mode: globalMode,
    typeZones,
    manualSkills,
    selectedSkillId: manualSkillId,
    skillSearchText: manualSearchText,
    manualCandidates,
    targets: targetViews,
    skillSummary,
    bannedOfficers,
    sheetSkill: null,
  }
}
