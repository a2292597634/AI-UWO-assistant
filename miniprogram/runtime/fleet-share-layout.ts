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
  footer: ShareRect
  qr: ShareRect
  contentBottom: number
}

const DEFAULT_WIDTH = 750
const DEFAULT_PADDING = 32
const SKILL_COLUMNS = 5
const SKILL_COLUMN = 132
const SKILL_GAP = 4
const SECTION_GAP = 24
const HEADER_HEIGHT = 104
const FOOTER_HEIGHT = 180
const QR_SIZE = 124
const OFFICER_SLOT_HEIGHT = 112
const OFFICER_GAP = 6
const SKILL_ROW_HEIGHT = 52
const SKILL_ROW_GAP = 6

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
  const height = skillSectionHeight(count)
  const contentWidth = width - padding * 2
  const columnWidth = Math.min(
    SKILL_COLUMN,
    (contentWidth - (SKILL_COLUMNS - 1) * SKILL_GAP) / SKILL_COLUMNS,
  )
  const cards = Array.from({ length: count }, (_, index) => ({
    x: padding + (index % SKILL_COLUMNS) * (columnWidth + SKILL_GAP),
    y: y + Math.floor(index / SKILL_COLUMNS) * (SKILL_ROW_HEIGHT + SKILL_ROW_GAP),
    width: columnWidth,
    height: SKILL_ROW_HEIGHT,
  }))
  return {
    y,
    height,
    rect: { x: padding, y, width: contentWidth, height },
    skillRows: rows,
    skillCards: cards,
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
  const slotWidth = (contentWidth - (11 - 1) * OFFICER_GAP) / 11
  const header = { x: 0, y: 0, width, height: HEADER_HEIGHT }
  let cursor = HEADER_HEIGHT
  const shipSections: FleetShareShipLayout[] = view.ships.map((ship) => {
    const y = cursor
    const heading = { x: padding, y: cursor, width: contentWidth, height: 40 }
    cursor += heading.height + 8
    const officerRow = { x: padding, y: cursor, width: contentWidth, height: OFFICER_SLOT_HEIGHT }
    const officerSlots = ship.officerSlots.map((_, index) => ({
      x: padding + index * (slotWidth + OFFICER_GAP),
      y: cursor,
      width: slotWidth,
      height: OFFICER_SLOT_HEIGHT,
    }))
    cursor += OFFICER_SLOT_HEIGHT
    cursor += SECTION_GAP
    const activeHeight = skillSectionHeight(ship.activeSkills.length)
    const activeSection = makeSkillSection(cursor, ship.activeSkills.length, width, padding)
    cursor += activeHeight
    cursor += ship.passiveSkills.length > 0 ? SECTION_GAP : 0
    const passiveSection = makeSkillSection(cursor, ship.passiveSkills.length, width, padding)
    cursor += passiveSection.height
    cursor += SECTION_GAP
    return {
      shipId: ship.shipId,
      y,
      height: cursor - y,
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
    const heading = { x: padding, y: cursor, width: contentWidth, height: 40 }
    cursor += heading.height + 8
    const columns = 5
    const columnWidth = (contentWidth - (columns - 1) * OFFICER_GAP) / columns
    const rows = Math.ceil(group.officers.length / columns)
    const officerHeight = 112
    const officerSlots = group.officers.map((_, index) => ({
      x: padding + (index % columns) * (columnWidth + OFFICER_GAP),
      y: cursor + Math.floor(index / columns) * officerHeight,
      width: columnWidth,
      height: officerHeight,
    }))
    cursor += rows * officerHeight
    cursor += SECTION_GAP
    return { rarityName: group.rarityName, y, height: cursor - y, heading, officerSlots }
  })
  const skillSection = makeSkillSection(cursor, view.skills.length, width, padding)
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
    footer,
    qr,
    contentBottom,
  }
}

export { skillRows, skillSectionHeight }
