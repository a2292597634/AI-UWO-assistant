import type {
  AdventureFleetShareGroup,
  BattleFleetShareShipView,
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
export const FLEET_SHARE_BACKGROUND_PATH = '/assets/ui/fleet-share-map.jpg'
const FLEET_SHARE_BACKGROUND_HEIGHT = 420
const OFFICER_SIZE = 84
const REFERENCE_TILE_SIZE = 60
const TYPE_ICON_RATIO = 16 / REFERENCE_TILE_SIZE
const TYPE_ICON_OFFSET = 4
const SKILL_ICON_SIZE = 36
const SKILL_LEVEL_WIDTH = 68
const SKILL_LEVEL_HEIGHT = 28
const SKILL_CARD_INSET = 8
const SKILL_META_TOP = 6
const SKILL_NAME_GAP = 4
const SKILL_NAME_BOTTOM = 4
const SKILL_NAME_LINE_HEIGHT = 20
export const SHARE_IMAGE_LOAD_TIMEOUT_MS = 8000
export const SHARE_IMAGE_MAX_OUTPUT_SIDE = 4096
export const SHARE_IMAGE_PREFERRED_SCALE = 2
const FONT_OFFICER = '600 20px sans-serif'
const FONT_SKILL = '600 20px sans-serif'
const FONT_LABEL = '600 28px sans-serif'
const FONT_META = '500 22px sans-serif'
const FONT_LEVEL = '700 17px sans-serif'
const FONT_EYEBROW = '600 14px sans-serif'
const FONT_HEADER_TITLE = '700 28px sans-serif'
const FONT_HEADER_META = '500 16px sans-serif'
const FONT_HEADER_SLOGAN = '600 15px sans-serif'
const FONT_FOOTER_TITLE = '700 20px sans-serif'
const FONT_FOOTER_META = '500 16px sans-serif'
const COLORS = {
  canvas: '#E7DECA',
  surface: '#F5EFE0',
  ink: '#26332F',
  textPrimary: '#292A26',
  textSecondary: '#625947',
  brass: '#B99552',
  accentText: '#76501A',
  battleAccent: '#8B3A3A',
  adventureAccent: '#315451',
  paper: '#E7DECA',
  paperAlt: '#F5EFE0',
  inkMuted: '#625947',
  green: '#26332F',
  brassLight: '#F5EFE0',
  border: '#B99552',
  white: '#F5EFE0',
  danger: '#8B3A3A',
  activePanel: '#F5EFE0',
  activeBorder: '#B99552',
  passivePanel: '#F5EFE0',
  passiveBorder: '#315451',
}

const localAssetPath = (path: string): string => {
  if (path.startsWith('/')) return path
  // 頭像與技能素材沿用既有 CDN 資料；不接受其他遠程來源。
  if (path.startsWith('https:') && path.includes('.tcb.qcloud.la/')) return path
  return ''
}

export interface OfficerVisualRects {
  frame: ShareRect
  portrait: ShareRect
  rarity: ShareRect
  type: ShareRect
}

/** 計算航海士四層素材座標：框、頭像、稀有度共用滿格人物格，類型角標置於左下。 */
export const getOfficerVisualRects = (rect: ShareRect): OfficerVisualRects => {
  const frameSize = Math.min(OFFICER_SIZE, Math.max(0, rect.width))
  const frame = {
    x: rect.x + (rect.width - frameSize) / 2,
    y: rect.y + 4,
    width: frameSize,
    height: frameSize,
  }
  const typeSize = Math.min(frameSize, Math.round(frameSize * TYPE_ICON_RATIO))
  return {
    frame,
    portrait: frame,
    rarity: frame,
    type: {
      x: frame.x + TYPE_ICON_OFFSET,
      y: frame.y + frame.height - typeSize - TYPE_ICON_OFFSET,
      width: typeSize,
      height: typeSize,
    },
  }
}

export interface SkillCardLayout {
  rect: ShareRect
  icon: ShareRect
  name: ShareRect
  level: ShareRect
}

export interface ShareCanvasDimensions {
  /** 實際 Canvas bitmap 的寬度，單位為像素。 */
  width: number
  /** 實際 Canvas bitmap 的高度，單位為像素。 */
  height: number
  /** 從邏輯坐標到 bitmap 像素的縮放倍率。 */
  scale: number
}

/**
 * 依內容高度選擇安全的 Canvas 倍率，避免長圖在部分平台超過 4096px 邊長。
 * 寬度與高度共用同一倍率，確保輸出不變形；短圖仍保留最多 2 倍清晰度。
 */
export const getShareCanvasDimensions = (
  layout: Pick<FleetShareLayout, 'width' | 'height'>,
): ShareCanvasDimensions => {
  const longestSide = Math.max(1, layout.width, layout.height)
  const scale = Math.min(SHARE_IMAGE_PREFERRED_SCALE, SHARE_IMAGE_MAX_OUTPUT_SIDE / longestSide)
  return {
    width: Math.max(1, Math.round(layout.width * scale)),
    height: Math.max(1, Math.round(layout.height * scale)),
    scale,
  }
}

/** 技能卡上排放圖標與等級，下排保留完整寬度給技能名稱。 */
export const getSkillCardLayout = (rect: ShareRect): SkillCardLayout => {
  const iconSize = Math.min(SKILL_ICON_SIZE, Math.max(0, rect.height - 36))
  const icon = {
    x: rect.x + SKILL_CARD_INSET,
    y: rect.y + SKILL_META_TOP,
    width: iconSize,
    height: iconSize,
  }
  const level = {
    x: rect.x + rect.width - SKILL_LEVEL_WIDTH - SKILL_CARD_INSET,
    y: rect.y + SKILL_META_TOP,
    width: SKILL_LEVEL_WIDTH,
    height: SKILL_LEVEL_HEIGHT,
  }
  const name = {
    x: rect.x + SKILL_CARD_INSET,
    y: rect.y + SKILL_META_TOP + Math.max(iconSize, SKILL_LEVEL_HEIGHT) + SKILL_NAME_GAP,
    width: Math.max(0, rect.width - SKILL_CARD_INSET * 2),
    height: Math.max(
      0,
      rect.height -
        (SKILL_META_TOP + Math.max(iconSize, SKILL_LEVEL_HEIGHT) + SKILL_NAME_GAP) -
        SKILL_NAME_BOTTOM,
    ),
  }
  return { rect, icon, name, level }
}

const loadImage = (canvas: ShareCanvas, path: string): Promise<ShareImage> =>
  new Promise((resolve, reject) => {
    const normalizedPath = localAssetPath(path)
    if (!normalizedPath) {
      reject(new Error('remote-or-empty-asset'))
      return
    }

    let settled = false
    let timeoutId: ReturnType<typeof setTimeout> | undefined
    const resolveOnce = (image: ShareImage): void => {
      if (settled) return
      settled = true
      if (timeoutId !== undefined) clearTimeout(timeoutId)
      resolve(image)
    }
    const rejectOnce = (error: unknown): void => {
      if (settled) return
      settled = true
      if (timeoutId !== undefined) clearTimeout(timeoutId)
      reject(error)
    }

    try {
      const image = canvas.createImage()
      image.onload = () => resolveOnce(image)
      image.onerror = () => rejectOnce(new Error(`asset-load-failed:${normalizedPath}`))
      timeoutId = setTimeout(
        () => rejectOnce(new Error(`asset-load-timeout:${normalizedPath}`)),
        SHARE_IMAGE_LOAD_TIMEOUT_MS,
      )
      image.src = normalizedPath
    } catch (error) {
      rejectOnce(error)
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
  context.textAlign = 'left'
  context.fillText(truncateText(context, text, maxWidth), x, y, maxWidth)
}

const drawCenteredText = (
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
  context.textAlign = 'center'
  context.fillText(truncateText(context, text, maxWidth), x + maxWidth / 2, y, maxWidth)
  context.textAlign = 'left'
}

const wrapText = (
  context: ShareContext,
  text: string,
  maxWidth: number,
  maxLines: number,
): string[] => {
  const chars = Array.from(text)
  const lines: string[] = []
  let cursor = 0

  while (cursor < chars.length && lines.length < maxLines) {
    const isLastLine = lines.length === maxLines - 1
    let line = ''
    while (cursor < chars.length) {
      const next = `${line}${chars[cursor]}`
      if (line.length === 0 || context.measureText(next).width <= maxWidth) {
        line = next
        cursor += 1
      } else {
        break
      }
    }
    if (isLastLine && cursor < chars.length) {
      while (line.length > 0 && context.measureText(`${line}…`).width > maxWidth) {
        line = line.slice(0, -1)
      }
      line = `${line}…`
    }
    lines.push(line)
  }

  return lines.length > 0 ? lines : ['']
}

const drawMultilineText = (
  context: ShareContext,
  text: string,
  x: number,
  y: number,
  maxWidth: number,
  font: string,
  lineHeight: number,
  maxLines: number,
  color = COLORS.ink,
): void => {
  context.font = font
  context.fillStyle = color
  context.textBaseline = 'middle'
  context.textAlign = 'left'
  const lines = wrapText(context, text, maxWidth, maxLines)
  const blockHeight = (lines.length - 1) * lineHeight
  lines.forEach((line, index) => {
    context.fillText(line, x, y - blockHeight / 2 + index * lineHeight, maxWidth)
  })
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

type ShareMode = FleetShareViewModel['mode']

const modeTitle = (mode: ShareMode): string => (mode === 'battle' ? '戰鬥配隊記錄' : '冒險配隊記錄')

const modeSlogan = (mode: ShareMode): string =>
  mode === 'battle' ? '定航向・統全艦・赴遠洋' : '向未知海域・寫下下一段航跡'

const modeAccent = (mode: ShareMode): string =>
  mode === 'battle' ? COLORS.battleAccent : COLORS.adventureAccent

const drawShareBackground = (
  context: ShareContext,
  layout: FleetShareLayout,
  image: ShareImage | undefined,
): void => {
  context.save()
  context.globalAlpha = 1
  context.fillStyle = COLORS.canvas
  context.fillRect(0, 0, layout.width, layout.height)
  if (image) {
    context.globalAlpha = 0.18
    for (let y = 0; y < layout.height; y += FLEET_SHARE_BACKGROUND_HEIGHT) {
      context.drawImage(
        image,
        0,
        0,
        image.width || FLEET_SHARE_BACKGROUND_HEIGHT,
        image.height || FLEET_SHARE_BACKGROUND_HEIGHT,
        0,
        y,
        layout.width,
        FLEET_SHARE_BACKGROUND_HEIGHT,
      )
    }
  }
  context.globalAlpha = 0.52
  context.strokeStyle = COLORS.brass
  context.lineWidth = 1
  context.beginPath()
  context.moveTo(layout.padding, layout.header.height - 1)
  context.lineTo(layout.width - layout.padding, layout.header.height - 1)
  context.moveTo(layout.padding, layout.height - 1)
  context.lineTo(layout.width - layout.padding, layout.height - 1)
  context.stroke()
  context.restore()
}

const drawModeEmblem = (context: ShareContext, x: number, y: number, mode: ShareMode): void => {
  const accent = modeAccent(mode)
  const centerX = x + 22
  const centerY = y + 22
  context.save()
  context.strokeStyle = accent
  context.fillStyle = accent
  context.lineWidth = 1.5
  context.beginPath()
  context.arc(centerX, centerY, 18, 0, Math.PI * 2)
  context.stroke()
  context.beginPath()
  context.moveTo(centerX, centerY - 14)
  context.lineTo(centerX + 4, centerY)
  context.lineTo(centerX, centerY + 14)
  context.lineTo(centerX - 4, centerY)
  context.closePath()
  context.stroke()
  if (mode === 'battle') {
    context.beginPath()
    context.moveTo(centerX + 7, centerY - 14)
    context.lineTo(centerX + 7, centerY + 12)
    context.lineTo(centerX + 18, centerY + 7)
    context.lineTo(centerX + 7, centerY + 2)
    context.stroke()
  } else {
    context.beginPath()
    context.moveTo(centerX - 13, centerY + 5)
    context.lineTo(centerX - 5, centerY + 1)
    context.lineTo(centerX + 3, centerY + 5)
    context.lineTo(centerX + 11, centerY + 1)
    context.stroke()
    context.beginPath()
    context.moveTo(centerX - 11, centerY + 11)
    context.lineTo(centerX - 3, centerY + 7)
    context.lineTo(centerX + 5, centerY + 11)
    context.lineTo(centerX + 13, centerY + 7)
    context.stroke()
  }
  context.restore()
}

const drawHeader = (
  context: ShareContext,
  layout: FleetShareLayout,
  configName: string,
  mode: ShareMode,
): void => {
  const emblemX = layout.width - layout.padding - 44
  const titleMaxWidth = layout.width - layout.padding * 2 - 72
  const sloganMaxWidth = layout.width - layout.padding * 2 - 112
  context.save()
  context.shadowColor = 'rgba(245, 239, 224, 0.72)'
  context.shadowBlur = 4
  context.shadowOffsetX = 0
  context.shadowOffsetY = 1
  drawText(
    context,
    '遠洋艦隊・航海檔案',
    layout.padding,
    12,
    titleMaxWidth,
    FONT_EYEBROW,
    COLORS.accentText,
  )
  drawText(
    context,
    modeTitle(mode),
    layout.padding,
    34,
    titleMaxWidth,
    FONT_HEADER_TITLE,
    COLORS.ink,
  )
  drawText(
    context,
    configName || '未命名隊伍',
    layout.padding,
    54,
    titleMaxWidth,
    FONT_HEADER_META,
    COLORS.textSecondary,
  )
  drawText(
    context,
    modeSlogan(mode),
    layout.padding + 18,
    75,
    sloganMaxWidth,
    FONT_HEADER_SLOGAN,
    modeAccent(mode),
  )
  context.shadowColor = 'transparent'
  context.shadowBlur = 0
  context.beginPath()
  context.strokeStyle = COLORS.brass
  context.lineWidth = 1
  context.moveTo(layout.padding, 75)
  context.lineTo(layout.padding + 10, 75)
  context.stroke()
  drawModeEmblem(context, emblemX, 8, mode)
  drawCenteredText(
    context,
    mode === 'battle' ? '戰鬥' : '冒險',
    emblemX - 4,
    76,
    52,
    FONT_EYEBROW,
    modeAccent(mode),
  )
  context.restore()
}

const drawSectionAccent = (
  context: ShareContext,
  layout: FleetShareLayout,
  mode: ShareMode,
): void => {
  const sections = mode === 'battle' ? layout.shipSections : layout.groupSections
  context.save()
  context.globalAlpha = 0.6
  context.strokeStyle = modeAccent(mode)
  context.fillStyle = modeAccent(mode)
  context.lineWidth = 1
  sections.forEach((section) => {
    const x = Math.max(4, section.heading.x - 10)
    const top = section.y + 12
    const bottom = section.y + section.height - 12
    context.beginPath()
    context.moveTo(x, top)
    context.lineTo(x, bottom)
    context.stroke()
    context.beginPath()
    context.arc(x, top, 2.5, 0, Math.PI * 2)
    context.fill()
  })
  if (layout.skillSection.height > 0) {
    const x = Math.max(4, layout.skillSection.rect.x - 10)
    context.beginPath()
    context.moveTo(x, layout.skillSection.y + 8)
    context.lineTo(x, layout.skillSection.y + layout.skillSection.height - 8)
    context.stroke()
  }
  context.restore()
}

const drawFooter = (
  context: ShareContext,
  layout: FleetShareLayout,
  mode: ShareMode,
  qr: ShareImage | undefined,
): void => {
  const textX = layout.padding + 60
  const textWidth = Math.max(0, layout.qr.x - textX - 16)
  context.save()
  context.fillStyle = COLORS.ink
  context.fillRect(layout.footer.x, layout.footer.y, layout.footer.width, layout.footer.height)
  context.globalAlpha = 0.85
  context.strokeStyle = COLORS.brass
  context.lineWidth = 1
  context.beginPath()
  context.moveTo(layout.padding, layout.footer.y + 16)
  context.lineTo(layout.qr.x - 16, layout.footer.y + 16)
  context.stroke()
  context.globalAlpha = 1
  drawModeEmblem(context, layout.padding + 4, layout.footer.y + 30, mode)
  drawText(
    context,
    '一圖收艦・掃碼回到航海日誌',
    textX,
    layout.footer.y + 58,
    textWidth,
    FONT_FOOTER_TITLE,
    COLORS.surface,
  )
  drawText(
    context,
    '掃描進入小程式首頁',
    textX,
    layout.footer.y + 90,
    textWidth,
    FONT_FOOTER_META,
    COLORS.brassLight,
  )
  if (qr) drawImageFit(context, qr, layout.qr, true)
  else drawPlaceholder(context, layout.qr, '首頁碼', COLORS.surface)
  context.restore()
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

const drawEmptyState = (context: ShareContext, rect: ShareRect): void => {
  roundedRect(context, rect, 16, COLORS.paperAlt, COLORS.border)
  drawText(
    context,
    '尚未配置航海士',
    rect.x + 16,
    rect.y + rect.height / 2,
    rect.width - 32,
    FONT_LABEL,
    COLORS.green,
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
  const visualRects = getOfficerVisualRects(rect)
  const frame = images.get(officer.visuals.framePath)
  if (frame) drawImageFit(context, frame, visualRects.frame)
  else roundedRect(context, visualRects.frame, 8, COLORS.ink)

  const portrait = images.get(officer.portraitPath)
  drawImageOptional(context, portrait, visualRects.portrait)
  if (!portrait) drawPlaceholder(context, visualRects.portrait, officer.name, COLORS.paperAlt)

  const rarity = images.get(officer.visuals.rarityIconPath)
  drawImageOptional(context, rarity, visualRects.rarity)

  const typeIcon = images.get(officer.visuals.typeIconPath)
  drawImageOptional(context, typeIcon, visualRects.type, true)
  drawCenteredText(
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
  const card = getSkillCardLayout(rect)
  roundedRect(context, card.rect, 8, COLORS.white, COLORS.border)
  const icon = images.get(skill.skillIconPath)
  roundedRect(
    context,
    {
      x: card.icon.x - 2,
      y: card.icon.y - 2,
      width: card.icon.width + 4,
      height: card.icon.height + 4,
    },
    6,
    COLORS.paperAlt,
    COLORS.border,
  )
  if (icon) drawImageFit(context, icon, card.icon, true)
  else drawPlaceholder(context, card.icon, '技', COLORS.paperAlt)
  drawMultilineText(
    context,
    skill.skillName,
    card.name.x,
    card.name.y + card.name.height / 2,
    card.name.width,
    FONT_SKILL,
    SKILL_NAME_LINE_HEIGHT,
    2,
  )
  roundedRect(context, card.level, 10, COLORS.green)
  drawCenteredText(
    context,
    `Lv.${skill.totalLevel}`,
    card.level.x,
    card.level.y + card.level.height / 2,
    card.level.width,
    FONT_LEVEL,
    COLORS.white,
  )
}

const drawSkillSection = (
  context: ShareContext,
  skills: readonly FleetShareSkillView[],
  section: ShareRect,
  cards: readonly ShareRect[],
  kind: 'active' | 'passive',
  images: ReadonlyMap<string, ShareImage>,
): void => {
  if (section.height <= 0) return
  roundedRect(
    context,
    section,
    10,
    kind === 'active' ? COLORS.activePanel : COLORS.passivePanel,
    kind === 'active' ? COLORS.activeBorder : COLORS.passiveBorder,
  )
  skills.forEach((skill, index) => {
    const card = cards[index]
    if (card) drawSkillCard(context, skill, card, images)
  })
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
  const missingAssetKinds = new Set<'portrait' | 'skill' | 'ui'>()
  const add = (path: string, kind: 'portrait' | 'skill' | 'ui' | 'qr'): void => {
    if (path) paths.set(path, kind)
    else if (kind !== 'qr') missingAssetKinds.add(kind)
  }
  add(view.qrPath || QR_PATH, 'qr')
  add(FLEET_SHARE_BACKGROUND_PATH, 'ui')
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
  let degradedAssetCount = missingAssetKinds.size
  let fatalAssetMissing = false
  const failedAssetKinds = new Set<string>(missingAssetKinds)
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
    section.heading.y + 20,
    180,
    FONT_LABEL,
    COLORS.green,
  )
  drawText(
    context,
    `${ship.officerSlots.filter(Boolean).length}/11 航海士`,
    section.heading.x + section.heading.width - 180,
    section.heading.y + 20,
    166,
    FONT_META,
    COLORS.inkMuted,
  )
  ship.officerSlots
    .filter((officer) => officer !== null)
    .forEach((officer, index) =>
      drawOfficer(context, officer, section.officerSlots[index]!, images),
    )
  drawSkillSection(
    context,
    ship.activeSkills,
    section.activeSection,
    section.activeCards,
    'active',
    images,
  )
  drawSkillSection(
    context,
    ship.passiveSkills,
    section.passiveSection,
    section.passiveCards,
    'passive',
    images,
  )
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
  drawText(
    context,
    `${group.officers.length} 人`,
    section.heading.x + section.heading.width - 120,
    section.heading.y + 20,
    120,
    FONT_META,
    COLORS.inkMuted,
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
  const dimensions = getShareCanvasDimensions(layout)
  canvas.width = dimensions.width
  canvas.height = dimensions.height
  const context = canvas.getContext('2d') as ShareContext
  if (dimensions.scale !== 1 && typeof context.scale === 'function') {
    context.scale(dimensions.scale, dimensions.scale)
  }
  context.clearRect(0, 0, layout.width, layout.height)
  drawShareBackground(context, layout, report.images.get(FLEET_SHARE_BACKGROUND_PATH))
  drawHeader(context, layout, view.configName, view.mode)

  if (view.mode === 'battle') {
    if (layout.emptyState) drawEmptyState(context, layout.emptyState)
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
      '全艦冒險技能累計',
      layout.skillSection.rect.x,
      layout.skillSection.y - 40,
      300,
      FONT_LABEL,
      COLORS.green,
    )
    drawText(
      context,
      '統計上方全部航海士的累計效果 · 只列出已選技能範圍',
      layout.skillSection.rect.x,
      layout.skillSection.y - 12,
      layout.skillSection.rect.width,
      FONT_META,
      COLORS.inkMuted,
    )
    drawSkillSection(
      context,
      view.skills,
      layout.skillSection.rect,
      layout.skillSection.skillCards,
      'passive',
      report.images,
    )
    if (view.skills.length === 0) {
      drawText(
        context,
        '尚未設定預設範圍',
        layout.skillSection.rect.x + 16,
        layout.skillSection.rect.y + layout.skillSection.rect.height / 2,
        layout.skillSection.rect.width - 32,
        FONT_SKILL,
        COLORS.inkMuted,
      )
    }
  }

  drawSectionAccent(context, layout, view.mode)
  const qr = report.images.get(view.qrPath || QR_PATH)
  drawFooter(context, layout, view.mode, qr)

  return {
    degradedAssetCount: report.degradedAssetCount,
    fatalAssetMissing: report.fatalAssetMissing,
    failedAssetKinds: report.failedAssetKinds,
  }
}

export { QR_PATH, localAssetPath }
