import type {
  AdventureFleetShareViewModel,
  BattleFleetShareViewModel,
} from '../contracts/fleet-share'

export interface ShareRect {
  x: number
  y: number
  width: number
  height: number
}

export interface ShareLayoutOptions {
  width?: number
  padding?: number
}

export interface FleetShareShipLayout {
  shipId: string
  y: number
  height: number
  heading: ShareRect
  /** 只為已配置航海士建立繪製座標，分享圖不渲染空位卡片。 */
  officerSlots: ShareRect[]
  officerRow: ShareRect
  activeSection: ShareRect
  passiveSection: ShareRect
  activeCards: ShareRect[]
  passiveCards: ShareRect[]
  activeRows: number
  passiveRows: number
}

export interface FleetShareGroupLayout {
  rarityName: 'S' | 'A' | 'B' | 'C'
  y: number
  height: number
  heading: ShareRect
  officerSlots: ShareRect[]
}

export interface FleetShareSkillSectionLayout {
  y: number
  height: number
  rect: ShareRect
  skillRows: number
  skillCards: ShareRect[]
}

export interface FleetShareLayout {
  width: number
  height: number
  padding: number
  header: ShareRect
  shipSections: FleetShareShipLayout[]
  groupSections: FleetShareGroupLayout[]
  skillSection: FleetShareSkillSectionLayout
  emptyState: ShareRect | null
  footer: ShareRect
  qr: ShareRect
  contentBottom: number
}

const DEFAULT_WIDTH = 750
const DEFAULT_PADDING = 32
const OFFICER_COLUMNS = 6
const GROUP_OFFICER_COLUMNS = 4
const OFFICER_ROW_GAP = 6
const OFFICER_SLOT_HEIGHT = 120
const SKILL_COLUMNS = 5
const SKILL_GAP = 6
const SKILL_SECTION_PADDING = 8
const SKILL_ROW_HEIGHT = 84
const SKILL_ROW_GAP = 6
const EMPTY_STATE_HEIGHT = 96
const SECTION_GAP = 16
const HEADER_HEIGHT = 100
const FOOTER_HEIGHT = 160
const QR_SIZE = 144
const OFFICER_GAP = 6
const HEADING_HEIGHT = 36
const HEADING_CONTENT_GAP = 6
const SKILL_HEADING_HEIGHT = 56
const EMPTY_SKILL_SECTION_HEIGHT = 56

const makeGridRects = (
  x: number,
  y: number,
  count: number,
  width: number,
  columns: number,
  columnGap: number,
  rowHeight: number,
  rowGap: number,
  centerLastRow = false,
): ShareRect[] => {
  const columnWidth = (width - (columns - 1) * columnGap) / columns
  return Array.from({ length: count }, (_, index) => ({
    x:
      x +
      ((index % columns) +
        (centerLastRow && count - Math.floor(index / columns) * columns < columns
          ? (columns - (count - Math.floor(index / columns) * columns)) / 2
          : 0)) *
        (columnWidth + columnGap),
    y: y + Math.floor(index / columns) * (rowHeight + rowGap),
    width: columnWidth,
    height: rowHeight,
  }))
}

const gridHeight = (count: number, columns: number, rowHeight: number, rowGap: number): number => {
  const rows = Math.ceil(count / columns)
  return rows === 0 ? 0 : rows * rowHeight + (rows - 1) * rowGap
}

const skillRows = (count: number): number => Math.ceil(count / SKILL_COLUMNS)

const skillSectionHeight = (count: number): number => {
  const rows = skillRows(count)
  return rows === 0 ? 0 : rows * SKILL_ROW_HEIGHT + (rows - 1) * SKILL_ROW_GAP
}

const resolveOptions = (options?: ShareLayoutOptions): { width: number; padding: number } => ({
  width: options?.width ?? DEFAULT_WIDTH,
  padding: options?.padding ?? DEFAULT_PADDING,
})

const makeSkillSection = (
  y: number,
  count: number,
  width: number,
  padding: number,
): FleetShareSkillSectionLayout => {
  const rows = skillRows(count)
  const contentHeight = skillSectionHeight(count)
  const height = contentHeight > 0 ? contentHeight + SKILL_SECTION_PADDING * 2 : 0
  const contentWidth = width - padding * 2
  const cards = makeGridRects(
    padding + SKILL_SECTION_PADDING,
    y + SKILL_SECTION_PADDING,
    count,
    contentWidth - SKILL_SECTION_PADDING * 2,
    SKILL_COLUMNS,
    SKILL_GAP,
    SKILL_ROW_HEIGHT,
    SKILL_ROW_GAP,
    true,
  )
  return {
    y,
    height,
    rect: { x: padding, y, width: contentWidth, height },
    skillRows: rows,
    skillCards: cards,
  }
}

const makeEmptySkillSection = (
  y: number,
  width: number,
  padding: number,
): FleetShareSkillSectionLayout => {
  const contentWidth = width - padding * 2
  return {
    y,
    height: EMPTY_SKILL_SECTION_HEIGHT,
    rect: { x: padding, y, width: contentWidth, height: EMPTY_SKILL_SECTION_HEIGHT },
    skillRows: 0,
    skillCards: [],
  }
}

const makeFooter = (
  y: number,
  width: number,
  padding: number,
): { footer: ShareRect; qr: ShareRect } => ({
  footer: { x: 0, y, width, height: FOOTER_HEIGHT },
  qr: {
    x: width - padding - QR_SIZE,
    y: y + (FOOTER_HEIGHT - QR_SIZE) / 2,
    width: QR_SIZE,
    height: QR_SIZE,
  },
})

export const measureBattleFleetShare = (
  view: BattleFleetShareViewModel,
  options?: ShareLayoutOptions,
): FleetShareLayout => {
  const { width, padding } = resolveOptions(options)
  const contentWidth = width - padding * 2
  const header = { x: 0, y: 0, width, height: HEADER_HEIGHT }
  let cursor = HEADER_HEIGHT
  const shipSections: FleetShareShipLayout[] = view.ships.map((ship) => {
    const y = cursor
    const heading = { x: padding, y: cursor, width: contentWidth, height: HEADING_HEIGHT }
    cursor += heading.height + HEADING_CONTENT_GAP
    const visibleOfficerCount = ship.officerSlots.filter(Boolean).length
    const officerRowHeight = gridHeight(
      visibleOfficerCount,
      OFFICER_COLUMNS,
      OFFICER_SLOT_HEIGHT,
      OFFICER_ROW_GAP,
    )
    const officerRow = { x: padding, y: cursor, width: contentWidth, height: officerRowHeight }
    const officerSlots = makeGridRects(
      padding,
      cursor,
      visibleOfficerCount,
      contentWidth,
      OFFICER_COLUMNS,
      OFFICER_GAP,
      OFFICER_SLOT_HEIGHT,
      OFFICER_ROW_GAP,
      true,
    )
    cursor += officerRowHeight
    cursor += SECTION_GAP
    const activeSection = makeSkillSection(cursor, ship.activeSkills.length, width, padding)
    cursor += activeSection.height
    cursor += activeSection.height > 0 && ship.passiveSkills.length > 0 ? SECTION_GAP : 0
    const passiveSection = makeSkillSection(cursor, ship.passiveSkills.length, width, padding)
    cursor += passiveSection.height
    const height = cursor - y
    cursor += SECTION_GAP
    return {
      shipId: ship.shipId,
      y,
      height,
      heading,
      officerSlots,
      officerRow,
      activeSection: { ...activeSection.rect, height: activeSection.height },
      passiveSection: { ...passiveSection.rect, height: passiveSection.height },
      activeCards: activeSection.skillCards,
      passiveCards: passiveSection.skillCards,
      activeRows: activeSection.skillRows,
      passiveRows: passiveSection.skillRows,
    }
  })
  const emptyState =
    shipSections.length === 0
      ? { x: padding, y: cursor, width: contentWidth, height: EMPTY_STATE_HEIGHT }
      : null
  if (emptyState) cursor += emptyState.height + SECTION_GAP
  const contentBottom = cursor
  const { footer, qr } = makeFooter(cursor, width, padding)
  cursor += footer.height
  return {
    width,
    height: cursor,
    padding,
    header,
    shipSections,
    groupSections: [],
    skillSection: {
      y: contentBottom,
      height: 0,
      rect: { x: padding, y: contentBottom, width: contentWidth, height: 0 },
      skillRows: 0,
      skillCards: [],
    },
    emptyState,
    footer,
    qr,
    contentBottom,
  }
}

export const measureAdventureFleetShare = (
  view: AdventureFleetShareViewModel,
  options?: ShareLayoutOptions,
): FleetShareLayout => {
  const { width, padding } = resolveOptions(options)
  const contentWidth = width - padding * 2
  const header = { x: 0, y: 0, width, height: HEADER_HEIGHT }
  let cursor = HEADER_HEIGHT
  const groupSections: FleetShareGroupLayout[] = view.groups.map((group) => {
    const y = cursor
    const heading = { x: padding, y: cursor, width: contentWidth, height: HEADING_HEIGHT }
    cursor += heading.height + HEADING_CONTENT_GAP
    const officerSlots = makeGridRects(
      padding,
      cursor,
      group.officers.length,
      contentWidth,
      GROUP_OFFICER_COLUMNS,
      OFFICER_GAP,
      OFFICER_SLOT_HEIGHT,
      OFFICER_ROW_GAP,
      true,
    )
    cursor += gridHeight(
      group.officers.length,
      GROUP_OFFICER_COLUMNS,
      OFFICER_SLOT_HEIGHT,
      OFFICER_ROW_GAP,
    )
    cursor += SECTION_GAP
    return { rarityName: group.rarityName, y, height: cursor - y, heading, officerSlots }
  })
  cursor += SKILL_HEADING_HEIGHT
  const skillSection =
    view.skills.length > 0
      ? makeSkillSection(cursor, view.skills.length, width, padding)
      : makeEmptySkillSection(cursor, width, padding)
  cursor += skillSection.height + SECTION_GAP
  const contentBottom = cursor
  const { footer, qr } = makeFooter(cursor, width, padding)
  cursor += footer.height
  return {
    width,
    height: cursor,
    padding,
    header,
    shipSections: [],
    groupSections,
    skillSection,
    emptyState: null,
    footer,
    qr,
    contentBottom,
  }
}

export { skillRows, skillSectionHeight }
