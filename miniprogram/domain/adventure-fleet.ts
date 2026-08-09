import type {
  FleetSkillMap,
  FleetState,
  FleetTarget,
  ShipSkillSummary,
} from '../contracts/battle-fleet'
import { FLEET_SHIP_COUNT, SHIP_OFFICER_CAPACITY } from '../contracts/battle-fleet'
import type {
  RuntimeCatalogEntry,
  RuntimeFleetSkillRelation,
  RuntimeSkill,
} from '../contracts/runtime-data'

export { FLEET_SHIP_COUNT, SHIP_OFFICER_CAPACITY }

// ── 类型分区映射 ──

/** typeId → 区域标识和排序权重 */
export const TYPE_ZONE_MAP: Record<
  string,
  { zone: AdventureTypeZone; order: number; label: string }
> = {
  type_class_1: { zone: 'adventure', order: 0, label: '冒險航海士' },
  type_class_3: { zone: 'combat', order: 1, label: '戰鬥航海士' },
  type_class_2: { zone: 'trade', order: 2, label: '交易航海士' },
}

export type AdventureTypeZone = 'adventure' | 'combat' | 'trade'

export const ZONE_ORDER: AdventureTypeZone[] = ['adventure', 'combat', 'trade']

/** 获取 typeId 对应的区域标识，未知类型返回 null */
export const getOfficerZone = (typeId: string): AdventureTypeZone | null =>
  (TYPE_ZONE_MAP[typeId]?.zone as AdventureTypeZone) ?? null

/** 按区域标识获取展示用的中文标签 */
export const getZoneLabel = (zone: AdventureTypeZone): string =>
  TYPE_ZONE_MAP[getTypeIdByZone(zone)]?.label ?? zone

const getTypeIdByZone = (zone: AdventureTypeZone): string => {
  for (const [typeId, info] of Object.entries(TYPE_ZONE_MAP)) {
    if (info.zone === zone) return typeId
  }
  return 'type_class_1'
}

// ── 冒险航海士数据结构 ──

export interface AdventureSkillRelation {
  skillId: string
  unlockLevel: number
}

export interface AdventureFleetOfficer {
  id: string
  name: string
  jobName: string
  rarityName: string
  portraitPath: string
  visualGradeId: string
  typeId: string
  typeName: string
  genderId: string
  /** 仅包含冒险类被动技能 */
  adventureSkills: AdventureSkillRelation[]
  /** 该航海士属于哪个区域 */
  zone: AdventureTypeZone | null
}

export type AdventureOfficerMap = Readonly<Record<string, AdventureFleetOfficer>>

// ── 冒险技能判定 ──

/** 判断技能关系是否为冒险技能 */
export const isAdventureSkill = (relation: RuntimeFleetSkillRelation): boolean =>
  relation.categoryId === 'skill_category_adventure'

/** 从完整技能字典中提取冒险技能 ID 集合 */
export const getAdventureSkillIdSet = (
  skills: Readonly<Record<string, RuntimeSkill>>,
): Set<string> => {
  const ids = new Set<string>()
  for (const skill of Object.values(skills)) {
    if (skill.cat === 'skill_category_adventure') {
      ids.add(skill.id)
    }
  }
  return ids
}

// ── 从目录派生冒险航海士列表 ──

/**
 * 从目录数据中派生用于冒险舰队的航海士列表。
 * 每个航海士只保留归属于 skill_category_adventure 的被动技能。
 */
export const deriveAdventureOfficers = (
  catalog: readonly RuntimeCatalogEntry[],
  adventureSkillIds: ReadonlySet<string>,
): AdventureFleetOfficer[] =>
  catalog.map((entry) => ({
    id: entry.id,
    name: entry.name,
    jobName: entry.jobName,
    rarityName: entry.rarityName,
    portraitPath: entry.portraitPath,
    visualGradeId: entry.visualGradeId,
    typeId: entry.typeId,
    typeName: entry.typeName,
    genderId: entry.genderId,
    zone: getOfficerZone(entry.typeId),
    adventureSkills: entry.passiveSkills
      .filter((sid) => adventureSkillIds.has(sid))
      .map((sid) => ({
        skillId: sid,
        unlockLevel: entry.skillLevels?.[sid] ?? 1,
      })),
  }))

// ── 排除的冒险技能 ──

/**
 * 默认排除的冒险技能 ID。
 * 与核心探索三围（战斗力/採集力/觀察力）及战利品无关的技能一律排除。
 */
export const EXCLUDED_ADVENTURE_SKILL_IDS = new Set([
  // 钓鱼
  'skill_skill202041',
  'skill_skill201781',
  'skill_skill202021',
  // 回报资源
  'skill_skill202324',
  'skill_skill202304',
  // 回报发现物
  'skill_skill201841',
  'skill_skill201821',
  // 村庄
  'skill_skill202184',
  'skill_skill202164',
  // 消耗物资
  'skill_skill201921',
  'skill_skillT0098',
  // 死亡率
  'skill_skill201501',
  'skill_skillT0094',
  // 水粮获得量
  'skill_skillT0095',
  'skill_skill202141',
  // 受伤率
  'skill_skill100031',
  // 发现物
  'skill_skill202346',
])

/** 判断冒险技能 ID 是否应在默认筛选中排除 */
export const isAdventureSkillExcluded = (skillId: string): boolean =>
  EXCLUDED_ADVENTURE_SKILL_IDS.has(skillId)

// ── 默认配队目标 ──

/**
 * 获取默认应加入配队目标的冒险技能 ID 列表（排除指定技能后按 ID 排序）。
 * 仅在舰队无目标时使用，作为初始默认值。
 */
export const getDefaultAdventureTargetSkillIds = (
  adventureOfficers: readonly AdventureFleetOfficer[],
): string[] => {
  const skillIds = new Set<string>()
  for (const officer of adventureOfficers) {
    for (const rel of officer.adventureSkills) {
      if (!EXCLUDED_ADVENTURE_SKILL_IDS.has(rel.skillId)) {
        skillIds.add(rel.skillId)
      }
    }
  }
  return [...skillIds].sort()
}

// ── 冒险技能筛选（技能选择器用） ──

export interface AdventureSkillOption {
  id: string
  name: string
  categoryName: string
  iconPath: string
  description: string
  /** 拥有该冒险技能的航海士数量 */
  officerCount: number
}

/** 筛选可供选择的冒险技能列表（默认排除钓鱼/回报资源/回报发现物/村庄相关技能） */
export const filterAdventureSkills = (
  adventureOfficers: readonly AdventureFleetOfficer[],
  skills: FleetSkillMap,
  searchText: string,
): AdventureSkillOption[] => {
  const officerCountBySkill = new Map<string, number>()
  for (const officer of adventureOfficers) {
    for (const rel of officer.adventureSkills) {
      if (EXCLUDED_ADVENTURE_SKILL_IDS.has(rel.skillId)) continue
      officerCountBySkill.set(rel.skillId, (officerCountBySkill.get(rel.skillId) ?? 0) + 1)
    }
  }

  const search = searchText.trim().toLocaleLowerCase()
  const options: AdventureSkillOption[] = []
  for (const [skillId, count] of officerCountBySkill) {
    const skill = skills[skillId]
    if (!skill) continue
    if (search && !skill.n.toLocaleLowerCase().includes(search)) continue
    options.push({
      id: skillId,
      name: skill.n,
      categoryName: skill.cn,
      iconPath: skill.ip,
      description: skill.d,
      officerCount: count,
    })
  }

  return options.sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0))
}

// ── 舰队级技能汇总（聚合全部 77 人的冒险技能） ──

/**
 * 对全部已配置航海士的冒险技能做舰队级累加汇总。
 * 与战斗舰队不同：这里聚合的是全部 7 艘船的所有人，而非单船。
 */
export const summarizeFleetAdventureSkills = (
  allOfficerIds: readonly string[],
  adventureOfficers: AdventureOfficerMap,
  skills: FleetSkillMap,
  targets: Readonly<Record<string, number>>,
): ShipSkillSummary[] => {
  const totals = new Map<string, number>()
  const contributors = new Map<string, string[]>()

  for (const officerId of allOfficerIds) {
    const officer = adventureOfficers[officerId]
    if (!officer) continue
    for (const relation of officer.adventureSkills) {
      totals.set(relation.skillId, (totals.get(relation.skillId) ?? 0) + relation.unlockLevel)
      const current = contributors.get(relation.skillId) ?? []
      current.push(officerId)
      contributors.set(relation.skillId, current)
    }
  }

  // 确保目标技能也出现在汇总中（即使目前尚无贡献者）
  for (const skillId of Object.keys(targets)) {
    if (!contributors.has(skillId) && skills[skillId]) {
      totals.set(skillId, 0)
      contributors.set(skillId, [])
    }
  }

  const allSkillIds = new Set([...totals.keys(), ...Object.keys(targets)])

  return [...allSkillIds]
    .map((skillId) => {
      const skill = skills[skillId]
      const totalLevel = totals.get(skillId) ?? 0
      const rawTarget = targets[skillId] ?? null
      // Lv.0 视为未设目标，仅追踪
      const targetLevel = rawTarget !== null && rawTarget > 0 ? rawTarget : null
      return {
        skillId,
        skillName: skill?.n ?? skillId,
        skillIconPath: skill?.ip ?? '',
        kind: 'passive' as const,
        categoryId: skill?.cat ?? 'skill_category_adventure',
        totalLevel,
        targetLevel,
        isReached: targetLevel === null ? null : totalLevel >= targetLevel,
        difference: targetLevel === null ? null : Math.max(targetLevel - totalLevel, 0),
        contributorOfficerIds: contributors.get(skillId) ?? [],
      }
    })
    .sort((a, b) => {
      // 有目标的排前
      const aHas = a.targetLevel !== null
      const bHas = b.targetLevel !== null
      if (aHas !== bHas) return aHas ? -1 : 1
      // 同组内按总等级降序
      if (a.totalLevel !== b.totalLevel) return b.totalLevel - a.totalLevel
      return a.skillId < b.skillId ? -1 : a.skillId > b.skillId ? 1 : 0
    })
}

// ── 按类型分区 ──

export interface OfficerTypeGroup {
  zone: AdventureTypeZone | null
  officerIds: string[]
}

/** 将航海士 ID 列表按 typeId 分区 */
export const groupOfficersByType = (
  officerIds: readonly string[],
  adventureOfficers: AdventureOfficerMap,
): OfficerTypeGroup[] => {
  const groups = new Map<AdventureTypeZone | null, string[]>()

  for (const id of officerIds) {
    const officer = adventureOfficers[id]
    const zone = officer?.zone ?? null
    const list = groups.get(zone) ?? []
    list.push(id)
    groups.set(zone, list)
  }

  return ZONE_ORDER.map((zone) => ({
    zone,
    officerIds: groups.get(zone) ?? [],
  })).filter((g) => g.officerIds.length > 0)
}

// ── 从 FleetState 收集全部已配置航海士 ──

/** 从 FleetState 中提取全部 7 艘船的所有 officerIds（平铺） */
export const collectAllOfficerIds = (state: FleetState): string[] =>
  state.ships.flatMap((ship) => ship.officerIds)

/** 从 FleetState 中收集全部锁定航海士 */
export const collectAllLockedIds = (state: FleetState): string[] =>
  state.ships.flatMap((ship) => ship.lockedOfficerIds)

// ── 冒險最佳化目標 ──

export interface AdventureOptimizationTarget {
  skillId: string
  targetLevel: number
}

/** 只提取參與 Solver 的 Lv.1 以上目標，保留 Lv.0 追蹤目標在配置中。 */
export const getAdventureOptimizationTargets = (
  targets: readonly FleetTarget[],
): AdventureOptimizationTarget[] =>
  targets.flatMap((target) =>
    target.skillId !== null && target.targetLevel > 0
      ? [{ skillId: target.skillId, targetLevel: target.targetLevel }]
      : [],
  )

// ── 重新导出 battle-fleet 的状态操作函数 ──

export {
  addOfficerToShip,
  banOfficer,
  createFleetState,
  excludeOfficerFromShip,
  getOfficerStatus,
  lockOfficer,
  moveOfficerToShip,
  recalculateShip,
  removeOfficerFromShip,
  setShipMode,
  unbanOfficer,
  unlockOfficer,
  updateShipTargets,
} from './battle-fleet'
