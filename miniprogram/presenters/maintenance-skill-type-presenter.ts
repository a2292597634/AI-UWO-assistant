import type { MaintenanceSkillRelation } from '../contracts/officer-maintenance'
import type { RuntimeDictionaryItem, RuntimeSkill } from '../contracts/runtime-data'

/** 正式資料使用的技能來源組；畫面不直接顯示這些內部代碼。 */
export type MaintenanceSkillSourceGroup = 'sk0' | 'sk1' | 'sk2' | 'sk3' | 'sk4' | 'sk5'

/** 技能分類的前端選項；categoryId 只供程式對應，不顯示給使用者。 */
export interface MaintenanceSkillTypeOption {
  readonly id: string
  readonly label: string
  readonly categoryId: string
  readonly kind: 'active' | 'passive'
  readonly sourceGroup: MaintenanceSkillSourceGroup
}

const ACTIVE_CATEGORY_PATTERN = /主動/
const PASSIVE_CATEGORY_PATTERN = /被動/

const classifyCategory = (category: RuntimeDictionaryItem): 'active' | 'passive' => {
  if (ACTIVE_CATEGORY_PATTERN.test(category.name) || category.id === 'skill_category_admiral')
    return 'active'
  if (PASSIVE_CATEGORY_PATTERN.test(category.name)) return 'passive'
  return 'passive'
}

/**
 * 依真實技能分類選定預設來源組。
 *
 * 來源組是 canonical 的儲存欄位，並非主動／被動的判斷依據；這裡只為新增關聯提供
 * 穩定的預設位置。既有工單會保留原 sourceGroup，管理員仍可在審核時修訂槽位。
 */
export const defaultSourceGroupForSkillType = (
  categoryId: string,
  kind: 'active' | 'passive',
): MaintenanceSkillSourceGroup => {
  if (kind === 'active' && categoryId === 'skill_category_admiral') return 'sk4'
  if (categoryId === 'skill_category_combat_other') return kind === 'active' ? 'sk3' : 'sk1'
  if (kind === 'active') return 'sk2'
  if (categoryId === 'skill_category_innate_buff' || categoryId === 'skill_category_innate_debuff')
    return 'sk1'
  return 'sk0'
}

const option = (
  category: RuntimeDictionaryItem,
  kind: 'active' | 'passive',
  label = category.name,
): MaintenanceSkillTypeOption => ({
  id: `${kind}:${category.id}`,
  label,
  categoryId: category.id,
  kind,
  sourceGroup: defaultSourceGroupForSkillType(category.id, kind),
})

/** 從維護字典產生真實分類選項，並把未標示主被動的「戰鬥-其他」拆成兩種。 */
export const buildMaintenanceSkillTypeOptions = (
  categories: readonly RuntimeDictionaryItem[],
): MaintenanceSkillTypeOption[] =>
  categories.flatMap((category) => {
    if (category.id === 'skill_category_combat_other')
      return [
        option(category, 'active', `${category.name}（主動）`),
        option(category, 'passive', `${category.name}（被動）`),
      ]
    return [option(category, classifyCategory(category))]
  })

/** 找到技能列目前應顯示的分類，優先保留既有關聯的 kind。 */
export const findMaintenanceSkillTypeOption = (
  skill: Pick<RuntimeSkill, 'cat'> | undefined,
  relation: Pick<MaintenanceSkillRelation, 'kind'>,
  options: readonly MaintenanceSkillTypeOption[],
): MaintenanceSkillTypeOption | undefined => {
  if (!skill) return undefined
  return (
    options.find((item) => item.categoryId === skill.cat && item.kind === relation.kind) ??
    options.find((item) => item.categoryId === skill.cat) ??
    options.find((item) => item.kind === relation.kind)
  )
}

/** 依來源組回傳下一個可用槽位，讓新增順序自動形成 0、1、2…；手動輸入仍可覆寫。 */
export const nextMaintenanceSkillSlot = (
  skills: readonly Pick<MaintenanceSkillRelation, 'sourceGroup' | 'slot'>[],
  sourceGroup: MaintenanceSkillSourceGroup,
): number =>
  Math.max(
    -1,
    ...skills.filter((item) => item.sourceGroup === sourceGroup).map((item) => item.slot),
  ) + 1
