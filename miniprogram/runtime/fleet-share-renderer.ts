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
const OFFICER_SIZE = 64
const SKILL_ICON_SIZE = 26
const FRAME_INSET = 3
const SKILL_LEVEL_WIDTH = 44
const SKILL_LEVEL_HEIGHT = 20
export const SHARE_IMAGE_LOAD_TIMEOUT_MS = 8000
const FONT_OFFICER = '600 22px sans-serif'
const FONT_SKILL = '600 20px sans-serif'
const FONT_LABEL = '600 22px sans-serif'
const FONT_META = '500 18px sans-serif'
const FONT_LEVEL = '700 16px sans-serif'
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
  activePanel: '#f4e5bf',
  activeBorder: '#b58a3a',
  passivePanel: '#dce9e2',
  passiveBorder: '#527565',
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

/** 計算航海士各素材的相對座標，品質與類型圖標始終跟隨頭像。 */
export const getOfficerVisualRects = (rect: ShareRect): OfficerVisualRects => {
  const frameSize = Math.min(OFFICER_SIZE, Math.max(0, rect.width))
  const frame = {
    x: rect.x + (rect.width - frameSize) / 2,
    y: rect.y + 4,
    width: frameSize,
    height: frameSize,
  }
  const portraitSize = Math.max(0, frameSize - FRAME_INSET * 2)
  const portrait = {
    x: frame.x + FRAME_INSET,
    y: frame.y + FRAME_INSET,
    width: portraitSize,
    height: portraitSize,
  }
  const raritySize = Math.min(portraitSize, Math.max(24, portraitSize * 0.58))
  const typeSize = Math.min(portraitSize, Math.max(14, portraitSize * 0.32))
  return {
    frame,
    portrait,
    rarity: { x: portrait.x, y: portrait.y, width: raritySize, height: raritySize },
    type: {
      x: portrait.x,
      y: portrait.y + portrait.height - typeSize,
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

/** 技能卡把名稱與等級角標分到上下兩行，避免窄欄位互相覆蓋。 */
export const getSkillCardLayout = (rect: ShareRect): SkillCardLayout => {
  const iconSize = Math.min(SKILL_ICON_SIZE, Math.max(0, rect.height - 12))
  const icon = { x: rect.x + 6, y: rect.y + 6, width: iconSize, height: iconSize }
  const level = {
    x: rect.x + rect.width - SKILL_LEVEL_WIDTH - 6,
    y: rect.y + rect.height - SKILL_LEVEL_HEIGHT - 5,
    width: SKILL_LEVEL_WIDTH,
    height: SKILL_LEVEL_HEIGHT,
  }
  const name = {
    x: icon.x + icon.width + 6,
    y: rect.y + 4,
    width: Math.max(0, rect.width - (icon.x + icon.width + 6 - rect.x) - 8),
    height: 22,
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
  const visualRects = getOfficerVisualRects(rect)
  const frame = images.get(officer.visuals.framePath)
  if (frame) drawImageFit(context, frame, visualRects.frame)
  else roundedRect(context, visualRects.frame, 8, COLORS.ink)

  const portrait = images.get(officer.portraitPath)
  drawImageOptional(context, portrait, visualRects.portrait)
  if (!portrait) drawPlaceholder(context, visualRects.portrait, officer.name, COLORS.paperAlt)

  const rarity = images.get(officer.visuals.rarityIconPath)
  const crop = gradeCrop(officer.visuals.rarityIconPath)
  if (rarity && crop) {
    context.drawImage(
      rarity,
      crop.sx,
      crop.sy,
      crop.sw,
      crop.sh,
      visualRects.rarity.x,
      visualRects.rarity.y,
      visualRects.rarity.width,
      visualRects.rarity.height,
    )
  } else {
    roundedRect(context, visualRects.rarity, 16, COLORS.brass)
    drawText(
      context,
      officer.rarityName,
      visualRects.rarity.x,
      visualRects.rarity.y + visualRects.rarity.height / 2,
      visualRects.rarity.width,
      FONT_META,
      COLORS.white,
    )
  }
  const typeIcon = images.get(officer.visuals.typeIconPath)
  drawImageOptional(context, typeIcon, visualRects.type, true)
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
  const card = getSkillCardLayout(rect)
  roundedRect(context, card.rect, 8, COLORS.white, COLORS.border)
  const icon = images.get(skill.skillIconPath)
  if (icon) drawImageFit(context, icon, card.icon, true)
  else drawPlaceholder(context, card.icon, '技', COLORS.paperAlt)
  drawText(
    context,
    skill.skillName,
    card.name.x,
    card.name.y + card.name.height / 2,
    card.name.width,
    FONT_SKILL,
  )
  roundedRect(context, card.level, 10, COLORS.green)
  drawText(
    context,
    `Lv.${skill.totalLevel}`,
    card.level.x + 4,
    card.level.y + card.level.height / 2,
    card.level.width - 8,
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
      '全艦冒險技能累計',
      layout.skillSection.rect.x,
      layout.skillSection.y - 34,
      300,
      FONT_LABEL,
      COLORS.green,
    )
    drawText(
      context,
      '統計上方全部航海士 · 僅列出預設範圍',
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

  context.fillStyle = COLORS.green
  context.fillRect(layout.footer.x, layout.footer.y, layout.footer.width, layout.footer.height)
  drawText(
    context,
    '掃描 QR 碼進入小程式首頁',
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
