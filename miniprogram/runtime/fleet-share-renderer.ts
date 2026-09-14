import type {
  AdventureFleetShareGroup,
  AdventureFleetShareViewModel,
  BattleFleetShareShipView,
  BattleFleetShareViewModel,
  FleetShareOfficerView,
  FleetShareSkillView,
  FleetShareViewModel,
} from '../contracts/fleet-share'
import type {
  FleetShareGroupLayout,
  FleetShareLayout,
  FleetShareShipLayout,
  ShareRect,
} from './fleet-share-layout'

export interface ShareRenderReport {
  degradedAssetCount: number
  fatalAssetMissing: boolean
  failedAssetKinds: string[]
}

type ShareCanvas = WechatMiniprogram.Canvas
type ShareContext = WechatMiniprogram.CanvasRenderingContext.CanvasRenderingContext2D
type ShareImage = WechatMiniprogram.Image

const QR_PATH = '/assets/ui/mini-program-home-code.png'
const UI_ROOT = '/assets/ui/'
const OFFICER_SIZE = 64
const RARITY_SIZE = 32
const TYPE_SIZE = 18
const SKILL_ICON_SIZE = 30
const FONT_OFFICER = '600 22px sans-serif'
const FONT_SKILL = '600 20px sans-serif'
const FONT_LABEL = '600 22px sans-serif'
const FONT_META = '500 18px sans-serif'
const COLORS = {
  paper: '#f1ead9',
  paperAlt: '#e7ddc8',
  ink: '#2f302b',
  inkMuted: '#5e5b50',
  green: '#24473d',
  brass: '#b58a3a',
  brassLight: '#e9d49d',
  border: '#c2b59d',
  white: '#fffaf0',
  danger: '#9d3c31',
}

const localAssetPath = (path: string): string => {
  if (!path || path.startsWith('http://') || path.startsWith('https://')) return ''
  return path
}

const loadImage = (canvas: ShareCanvas, path: string): Promise<ShareImage> =>
  new Promise((resolve, reject) => {
    const normalizedPath = localAssetPath(path)
    if (!normalizedPath) {
      reject(new Error('remote-or-empty-asset'))
      return
    }
    try {
      const image = canvas.createImage()
      image.onload = () => resolve(image)
      image.onerror = () => reject(new Error(`asset-load-failed:${normalizedPath}`))
      image.src = normalizedPath
    } catch (error) {
      reject(error)
    }
  })

const roundedRect = (
  context: ShareContext,
  rect: ShareRect,
  radius: number,
  fill: string,
  stroke?: string,
): void => {
  const r = Math.min(radius, rect.width / 2, rect.height / 2)
  context.beginPath()
  context.moveTo(rect.x + r, rect.y)
  context.lineTo(rect.x + rect.width - r, rect.y)
  context.arcTo(rect.x + rect.width, rect.y, rect.x + rect.width, rect.y + r, r)
  context.lineTo(rect.x + rect.width, rect.y + rect.height - r)
  context.arcTo(
    rect.x + rect.width,
    rect.y + rect.height,
    rect.x + rect.width - r,
    rect.y + rect.height,
    r,
  )
  context.lineTo(rect.x + r, rect.y + rect.height)
  context.arcTo(rect.x, rect.y + rect.height, rect.x, rect.y + rect.height - r, r)
  context.lineTo(rect.x, rect.y + r)
  context.arcTo(rect.x, rect.y, rect.x + r, rect.y, r)
  context.closePath()
  context.fillStyle = fill
  context.fill()
  if (stroke) {
    context.strokeStyle = stroke
    context.lineWidth = 1
    context.stroke()
  }
}

const truncateText = (context: ShareContext, text: string, maxWidth: number): string => {
  if (context.measureText(text).width <= maxWidth) return text
  let value = text
  while (value.length > 1 && context.measureText(`${value}…`).width > maxWidth) {
    value = value.slice(0, -1)
  }
  return `${value}…`
}

const drawText = (
  context: ShareContext,
  text: string,
  x: number,
  y: number,
  maxWidth: number,
  font: string,
  color = COLORS.ink,
): void => {
  context.font = font
  context.fillStyle = color
  context.textBaseline = 'middle'
  context.fillText(truncateText(context, text, maxWidth), x, y, maxWidth)
}

const gradeCrop = (path: string): { sx: number; sy: number; sw: number; sh: number } | null => {
  if (path.endsWith('uwo-icon-grade-6.png')) return { sx: 0, sy: 0, sw: 24, sh: 24 }
  if (/uwo-icon-grade-[2-5]\.png$/.test(path)) return { sx: 2, sy: 0, sw: 20, sh: 23 }
  return null
}

const drawImageFit = (
  context: ShareContext,
  image: ShareImage,
  rect: ShareRect,
  contain = false,
): void => {
  const imageWidth = image.width || rect.width
  const imageHeight = image.height || rect.height
  if (!contain) {
    context.drawImage(image, rect.x, rect.y, rect.width, rect.height)
    return
  }
  const scale = Math.min(rect.width / imageWidth, rect.height / imageHeight)
  const width = imageWidth * scale
  const height = imageHeight * scale
  context.drawImage(
    image,
    rect.x + (rect.width - width) / 2,
    rect.y + (rect.height - height) / 2,
    width,
    height,
  )
}

const drawImageOptional = (
  context: ShareContext,
  image: ShareImage | undefined,
  rect: ShareRect,
  contain = false,
): void => {
  if (image) drawImageFit(context, image, rect, contain)
}

const drawPlaceholder = (
  context: ShareContext,
  rect: ShareRect,
  label: string,
  fill: string = COLORS.paperAlt,
): void => {
  roundedRect(context, rect, 8, fill, COLORS.border)
  drawText(
    context,
    label.slice(0, 2),
    rect.x + 6,
    rect.y + rect.height / 2,
    rect.width - 12,
    FONT_META,
    COLORS.inkMuted,
  )
}

const drawOfficer = (
  context: ShareContext,
  officer: FleetShareOfficerView | null,
  rect: ShareRect,
  images: ReadonlyMap<string, ShareImage>,
): void => {
  if (!officer) {
    drawPlaceholder(context, rect, '空位')
    return
  }
  const portraitRect = {
    x: rect.x + (rect.width - OFFICER_SIZE) / 2,
    y: rect.y + 6,
    width: OFFICER_SIZE,
    height: OFFICER_SIZE,
  }
  roundedRect(context, portraitRect, 8, COLORS.ink)
  drawImageOptional(context, images.get(officer.portraitPath), portraitRect)
  if (!images.get(officer.portraitPath))
    drawPlaceholder(context, portraitRect, officer.name, COLORS.paperAlt)

  const frame = images.get(officer.visuals.framePath)
  drawImageOptional(context, frame, portraitRect)
  const rarity = images.get(officer.visuals.rarityIconPath)
  const crop = gradeCrop(officer.visuals.rarityIconPath)
  if (rarity && crop) {
    context.drawImage(
      rarity,
      crop.sx,
      crop.sy,
      crop.sw,
      crop.sh,
      rect.x + 2,
      rect.y + 2,
      RARITY_SIZE,
      RARITY_SIZE,
    )
  } else {
    roundedRect(
      context,
      { x: rect.x + 2, y: rect.y + 2, width: RARITY_SIZE, height: RARITY_SIZE },
      16,
      COLORS.brass,
    )
    drawText(
      context,
      officer.rarityName,
      rect.x + 2,
      rect.y + 18,
      RARITY_SIZE,
      FONT_META,
      COLORS.white,
    )
  }
  const typeIcon = images.get(officer.visuals.typeIconPath)
  drawImageOptional(
    context,
    typeIcon,
    {
      x: portraitRect.x,
      y: portraitRect.y + portraitRect.height - TYPE_SIZE,
      width: TYPE_SIZE,
      height: TYPE_SIZE,
    },
    true,
  )
  drawText(
    context,
    officer.name,
    rect.x + 3,
    rect.y + rect.height - 18,
    rect.width - 6,
    FONT_OFFICER,
  )
}

const drawSkillCard = (
  context: ShareContext,
  skill: FleetShareSkillView,
  rect: ShareRect,
  images: ReadonlyMap<string, ShareImage>,
): void => {
  roundedRect(context, rect, 8, COLORS.white, COLORS.border)
  const iconRect = {
    x: rect.x + 7,
    y: rect.y + (rect.height - SKILL_ICON_SIZE) / 2,
    width: SKILL_ICON_SIZE,
    height: SKILL_ICON_SIZE,
  }
  const icon = images.get(skill.skillIconPath)
  if (icon) drawImageFit(context, icon, iconRect, true)
  else drawPlaceholder(context, iconRect, '技', COLORS.paperAlt)
  drawText(
    context,
    skill.skillName,
    iconRect.x + iconRect.width + 6,
    rect.y + 18,
    rect.width - 78,
    FONT_SKILL,
  )
  roundedRect(
    context,
    { x: rect.x + rect.width - 52, y: rect.y + 11, width: 44, height: 30 },
    15,
    COLORS.green,
  )
  drawText(
    context,
    `Lv.${skill.totalLevel}`,
    rect.x + rect.width - 48,
    rect.y + 26,
    36,
    FONT_META,
    COLORS.white,
  )
}

const preloadAssets = async (
  canvas: ShareCanvas,
  view: FleetShareViewModel,
): Promise<{
  images: Map<string, ShareImage>
  degradedAssetCount: number
  failedAssetKinds: string[]
  fatalAssetMissing: boolean
}> => {
  const paths = new Map<string, 'portrait' | 'skill' | 'ui' | 'qr'>()
  const add = (path: string, kind: 'portrait' | 'skill' | 'ui' | 'qr'): void => {
    if (path) paths.set(path, kind)
  }
  add(view.qrPath || QR_PATH, 'qr')
  if (view.mode === 'battle') {
    for (const ship of view.ships) {
      for (const officer of ship.officerSlots) {
        if (!officer) continue
        add(officer.portraitPath, 'portrait')
        add(officer.visuals.framePath, 'ui')
        add(officer.visuals.rarityIconPath, 'ui')
        add(officer.visuals.typeIconPath, 'ui')
      }
      for (const skill of [...ship.activeSkills, ...ship.passiveSkills])
        add(skill.skillIconPath, 'skill')
    }
  } else {
    for (const group of view.groups) {
      for (const officer of group.officers) {
        add(officer.portraitPath, 'portrait')
        add(officer.visuals.framePath, 'ui')
        add(officer.visuals.rarityIconPath, 'ui')
        add(officer.visuals.typeIconPath, 'ui')
      }
    }
    for (const skill of view.skills) add(skill.skillIconPath, 'skill')
  }
  const images = new Map<string, ShareImage>()
  let degradedAssetCount = 0
  let fatalAssetMissing = false
  const failedAssetKinds = new Set<string>()
  await Promise.all(
    [...paths.entries()].map(async ([path, kind]) => {
      try {
        images.set(path, await loadImage(canvas, path))
      } catch {
        if (kind === 'qr') fatalAssetMissing = true
        else {
          degradedAssetCount += 1
          failedAssetKinds.add(kind)
        }
      }
    }),
  )
  return { images, degradedAssetCount, failedAssetKinds: [...failedAssetKinds], fatalAssetMissing }
}

const drawHeader = (
  context: ShareContext,
  layout: FleetShareLayout,
  configName: string,
  mode: string,
): void => {
  context.fillStyle = COLORS.green
  context.fillRect(0, layout.header.y, layout.header.width, layout.header.height)
  drawText(
    context,
    mode === 'battle' ? '戰鬥配隊分享' : '冒險配隊分享',
    layout.padding,
    34,
    layout.width - layout.padding * 2 - 160,
    FONT_LABEL,
    COLORS.white,
  )
  drawText(
    context,
    configName || '未命名隊伍',
    layout.padding,
    72,
    layout.width - layout.padding * 2 - 160,
    FONT_META,
    COLORS.brassLight,
  )
  drawText(context, '長圖', layout.width - layout.padding - 72, 52, 72, FONT_META, COLORS.white)
}

const drawShip = (
  context: ShareContext,
  ship: BattleFleetShareShipView,
  section: FleetShareShipLayout,
  images: ReadonlyMap<string, ShareImage>,
): void => {
  roundedRect(
    context,
    {
      x: section.heading.x,
      y: section.heading.y,
      width: section.heading.width,
      height: section.height,
    },
    10,
    COLORS.paper,
    COLORS.border,
  )
  drawText(
    context,
    ship.shipLabel,
    section.heading.x + 14,
    section.heading.y + 22,
    180,
    FONT_LABEL,
    COLORS.green,
  )
  drawText(
    context,
    `${ship.officerSlots.filter(Boolean).length}/11 航海士`,
    section.heading.x + section.heading.width - 180,
    section.heading.y + 22,
    166,
    FONT_META,
    COLORS.inkMuted,
  )
  ship.officerSlots.forEach((officer, index) =>
    drawOfficer(context, officer, section.officerSlots[index]!, images),
  )
  if (ship.activeSkills.length > 0) {
    drawText(
      context,
      '主動技能 TOP 5',
      section.activeSection.x,
      section.activeSection.y - 10,
      220,
      FONT_META,
      COLORS.green,
    )
    ship.activeSkills.forEach((skill, index) =>
      drawSkillCard(context, skill, section.activeCards[index]!, images),
    )
  }
  if (ship.passiveSkills.length > 0) {
    drawText(
      context,
      '戰鬥被動技能',
      section.passiveSection.x,
      section.passiveSection.y - 10,
      220,
      FONT_META,
      COLORS.green,
    )
    ship.passiveSkills.forEach((skill, index) =>
      drawSkillCard(context, skill, section.passiveCards[index]!, images),
    )
  }
}

const drawGroup = (
  context: ShareContext,
  group: AdventureFleetShareGroup,
  section: FleetShareGroupLayout,
  images: ReadonlyMap<string, ShareImage>,
): void => {
  drawText(
    context,
    `${group.rarityName} 級航海士`,
    section.heading.x,
    section.heading.y + 20,
    240,
    FONT_LABEL,
    COLORS.green,
  )
  group.officers.forEach((officer, index) =>
    drawOfficer(context, officer, section.officerSlots[index]!, images),
  )
}

export const drawFleetShareImage = async (
  canvas: WechatMiniprogram.Canvas,
  view: FleetShareViewModel,
  layout: FleetShareLayout,
): Promise<ShareRenderReport> => {
  const report = await preloadAssets(canvas, view)
  const context = canvas.getContext('2d') as ShareContext
  canvas.width = layout.width
  canvas.height = layout.height
  context.clearRect(0, 0, layout.width, layout.height)
  context.fillStyle = COLORS.paper
  context.fillRect(0, 0, layout.width, layout.height)
  drawHeader(context, layout, view.configName, view.mode)

  if (view.mode === 'battle') {
    view.ships.forEach((ship, index) => {
      const section = layout.shipSections[index]
      if (section) drawShip(context, ship, section, report.images)
    })
  } else {
    view.groups.forEach((group, index) => {
      const section = layout.groupSections[index]
      if (section) drawGroup(context, group, section, report.images)
    })
    drawText(
      context,
      '全艦累計技能',
      layout.skillSection.rect.x,
      layout.skillSection.y - 10,
      240,
      FONT_LABEL,
      COLORS.green,
    )
    view.skills.forEach((skill, index) =>
      drawSkillCard(context, skill, layout.skillSection.skillCards[index]!, report.images),
    )
  }

  context.fillStyle = COLORS.green
  context.fillRect(layout.footer.x, layout.footer.y, layout.footer.width, layout.footer.height)
  drawText(
    context,
    '掃描 QR 碼進入小程序首頁',
    layout.padding,
    layout.footer.y + layout.footer.height / 2,
    layout.footer.width - layout.padding * 2 - layout.qr.width - 16,
    FONT_META,
    COLORS.white,
  )
  const qr = report.images.get(view.qrPath || QR_PATH)
  if (qr) drawImageFit(context, qr, layout.qr, true)
  else drawPlaceholder(context, layout.qr, '首頁碼', COLORS.white)

  return {
    degradedAssetCount: report.degradedAssetCount,
    fatalAssetMissing: report.fatalAssetMissing,
    failedAssetKinds: report.failedAssetKinds,
  }
}

export { QR_PATH, gradeCrop, localAssetPath }
