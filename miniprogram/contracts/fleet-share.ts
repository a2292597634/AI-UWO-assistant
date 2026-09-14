import type { FleetState } from './battle-fleet'
import type { OfficerVisualPaths } from '../presenters/officer-visuals'

/** 分享圖中一名航海士的完整視圖資料。 */
export interface FleetShareOfficerView {
  id: string
  name: string
  portraitPath: string
  rarityName: string
  visuals: OfficerVisualPaths
  shipId: string
  slotIndex: number
}

/** 分享圖中的技能條目，totalLevel 使用 canonical level 累計。 */
export interface FleetShareSkillView {
  skillId: string
  skillName: string
  skillIconPath: string
  kind: 'active' | 'passive'
  categoryId: string
  totalLevel: number
}

export interface BattleFleetShareShipView {
  shipId: string
  shipLabel: string
  officerSlots: Array<FleetShareOfficerView | null>
  activeSkills: FleetShareSkillView[]
  passiveSkills: FleetShareSkillView[]
}

export interface BattleFleetShareViewModel {
  mode: 'battle'
  configName: string
  ships: BattleFleetShareShipView[]
  qrPath: string
  entrancePath: 'pages/home/index'
}

export type FleetShareRarity = 'S' | 'A' | 'B' | 'C'

export interface AdventureFleetShareGroup {
  rarityName: FleetShareRarity
  officers: FleetShareOfficerView[]
}

export interface AdventureFleetShareViewModel {
  mode: 'adventure'
  configName: string
  groups: AdventureFleetShareGroup[]
  skills: FleetShareSkillView[]
  presetRangeEmpty: boolean
  qrPath: string
  entrancePath: 'pages/home/index'
}

export type FleetShareViewModel = BattleFleetShareViewModel | AdventureFleetShareViewModel

/** 讓跨頁協調層可用同一個窄型別取得 FleetState。 */
export type FleetShareState = FleetState
