import type { FleetState, FleetShipState } from '../contracts/battle-fleet'
import type {
  AdventureFleetShareGroup,
  AdventureFleetShareViewModel,
  BattleFleetShareShipView,
  BattleFleetShareViewModel,
  FleetShareOfficerView,
  FleetShareRarity,
  FleetShareSkillView,
} from '../contracts/fleet-share'
import type {
  RuntimeFleetOfficer,
  RuntimeFleetSkillRelation,
  RuntimeSkill,
} from '../contracts/runtime-data'
import { collectAllOfficerIds, type AdventureFleetOfficer } from '../domain/adventure-fleet'
import { isBattleFleetSkill } from '../domain/battle-fleet'
import { buildOfficerVisuals } from './officer-visuals'

const ENTRANCE_PATH = 'pages/home/index' as const
const OFFICER_SLOT_COUNT = 11
const RARITY_ORDER: readonly FleetShareRarity[] = ['S', 'A', 'B', 'C']

const compareShareSkills = (a: FleetShareSkillView, b: FleetShareSkillView): number =>
  b.totalLevel - a.totalLevel ||
  a.skillName.localeCompare(b.skillName) ||
  a.skillId.localeCompare(b.skillId)

const addLevel = (totals: Map<string, number>, skillId: string, level: number): void => {
  if (!Number.isFinite(level) || level < 0) return
  totals.set(skillId, (totals.get(skillId) ?? 0) + level)
}

const buildSkillView = (
  skillId: string,
  kind: 'active' | 'passive',
  categoryId: string,
  totalLevel: number,
  skills: Readonly<Record<string, RuntimeSkill>>,
): FleetShareSkillView => {
  const skill = skills[skillId]
  return {
    skillId,
    skillName: skill?.n ?? skillId,
    skillIconPath: skill?.ip ?? '',
    kind,
    categoryId: skill?.cat ?? categoryId,
    totalLevel,
  }
}

const buildOfficerView = (
  officer: RuntimeFleetOfficer | AdventureFleetOfficer,
  shipId: string,
  slotIndex: number,
): FleetShareOfficerView => ({
  id: officer.id,
  name: officer.name,
  portraitPath: officer.portraitPath,
  rarityName: officer.rarityName,
  visuals: buildOfficerVisuals({
    visualGradeId: officer.visualGradeId,
    typeId: officer.typeId,
    genderId: officer.genderId,
  }),
  shipId,
  slotIndex,
})

const toOfficerMap = <T extends { id: string }>(
  officers: readonly T[],
): Readonly<Record<string, T>> =>
  Object.fromEntries(officers.map((officer) => [officer.id, officer]))

const summarizeRelations = (
  relations: readonly RuntimeFleetSkillRelation[],
  skills: Readonly<Record<string, RuntimeSkill>>,
  predicate: (relation: RuntimeFleetSkillRelation) => boolean,
): FleetShareSkillView[] => {
  const totals = new Map<string, number>()
  const metas = new Map<string, RuntimeFleetSkillRelation>()
  for (const relation of relations) {
    if (!predicate(relation)) continue
    addLevel(totals, relation.skillId, relation.level)
    if (!metas.has(relation.skillId)) metas.set(relation.skillId, relation)
  }

  return [...totals.keys()]
    .map((skillId) => {
      const meta = metas.get(skillId)!
      return buildSkillView(skillId, meta.kind, meta.categoryId, totals.get(skillId) ?? 0, skills)
    })
    .sort(compareShareSkills)
}

const buildBattleShip = (
  ship: FleetShipState,
  officers: Readonly<Record<string, RuntimeFleetOfficer>>,
  skills: Readonly<Record<string, RuntimeSkill>>,
): BattleFleetShareShipView => {
  const officerSlots = Array.from({ length: OFFICER_SLOT_COUNT }, (_, slotIndex) => {
    const officerId = ship.officerIds[slotIndex]
    const officer = officerId ? officers[officerId] : undefined
    return officer ? buildOfficerView(officer, ship.id, slotIndex) : null
  })
  const relations = ship.officerIds.flatMap((officerId) => officers[officerId]?.skills ?? [])
  const activeSkills = summarizeRelations(
    relations,
    skills,
    (relation) => relation.kind === 'active' && isBattleFleetSkill(relation),
  ).slice(0, 5)
  const passiveSkills = summarizeRelations(
    relations,
    skills,
    (relation) => relation.kind === 'passive' && isBattleFleetSkill(relation),
  ).filter((skill) => skill.totalLevel >= 2)

  return {
    shipId: ship.id,
    shipLabel: ship.label,
    officerSlots,
    activeSkills,
    passiveSkills,
  }
}

export const buildBattleFleetShareViewModel = (
  fleet: FleetState,
  officerList: readonly RuntimeFleetOfficer[],
  skills: Readonly<Record<string, RuntimeSkill>>,
  configName: string,
  qrPath: string,
): BattleFleetShareViewModel => ({
  mode: 'battle',
  configName,
  ships: fleet.ships.map((ship) => buildBattleShip(ship, toOfficerMap(officerList), skills)),
  qrPath,
  entrancePath: ENTRANCE_PATH,
})

const adventureRelations = (
  officers: readonly AdventureFleetOfficer[],
): Readonly<Record<string, AdventureFleetOfficer>> => toOfficerMap(officers)

const buildAdventureGroups = (
  fleet: FleetState,
  officers: Readonly<Record<string, AdventureFleetOfficer>>,
): AdventureFleetShareGroup[] => {
  const grouped = new Map<FleetShareRarity, FleetShareOfficerView[]>()
  for (const [shipIndex, ship] of fleet.ships.entries()) {
    for (const [slotIndex, officerId] of ship.officerIds.entries()) {
      const officer = officers[officerId]
      if (!officer || !RARITY_ORDER.includes(officer.rarityName as FleetShareRarity)) continue
      const rarityName = officer.rarityName as FleetShareRarity
      const group = grouped.get(rarityName) ?? []
      group.push(buildOfficerView(officer, ship.id || `ship-${shipIndex + 1}`, slotIndex))
      grouped.set(rarityName, group)
    }
  }
  return RARITY_ORDER.flatMap((rarityName) => {
    const group = grouped.get(rarityName)
    return group && group.length > 0 ? [{ rarityName, officers: group }] : []
  })
}

export const buildAdventureFleetShareViewModel = (
  fleet: FleetState,
  officerList: readonly AdventureFleetOfficer[],
  skills: Readonly<Record<string, RuntimeSkill>>,
  configName: string,
  qrPath: string,
): AdventureFleetShareViewModel => {
  const officers = adventureRelations(officerList)
  const targetIds = [
    ...new Set(
      (fleet.ships[0]?.targets ?? []).flatMap((target) =>
        target.skillId === null ? [] : [target.skillId],
      ),
    ),
  ]
  const totals = new Map<string, number>(targetIds.map((skillId) => [skillId, 0]))

  for (const officerId of collectAllOfficerIds(fleet)) {
    const officer = officers[officerId]
    if (!officer) continue
    for (const relation of officer.adventureSkills) {
      if (!targetIds.includes(relation.skillId)) continue
      addLevel(totals, relation.skillId, relation.level)
    }
  }

  const shareSkills = targetIds
    .filter((skillId) => Boolean(skills[skillId]))
    .map((skillId) =>
      buildSkillView(
        skillId,
        'passive',
        skills[skillId]?.cat ?? 'skill_category_adventure',
        totals.get(skillId) ?? 0,
        skills,
      ),
    )
    .sort(compareShareSkills)

  return {
    mode: 'adventure',
    configName,
    groups: buildAdventureGroups(fleet, officers),
    skills: shareSkills,
    presetRangeEmpty: shareSkills.length === 0,
    qrPath,
    entrancePath: ENTRANCE_PATH,
  }
}
