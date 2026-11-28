import { deflateSync, inflateSync, type Inflate } from 'node:zlib'
import type { MapChartPosition, MapLayer } from '../../miniprogram/subpkg-world-map/map-data'
import { MAP_HEIGHT, MAP_WIDTH, type Point } from '../../miniprogram/subpkg-world-map/viewport'

export const WORLD_MAP_LAND_MASK_STEP = 4
export const WORLD_MAP_LAND_MASK_WIDTH = Math.ceil(MAP_WIDTH / WORLD_MAP_LAND_MASK_STEP)
export const WORLD_MAP_LAND_MASK_HEIGHT = Math.ceil(MAP_HEIGHT / WORLD_MAP_LAND_MASK_STEP)
const PIXEL_COUNT = WORLD_MAP_LAND_MASK_WIDTH * WORLD_MAP_LAND_MASK_HEIGHT
const BYTE_COUNT = Math.ceil(PIXEL_COUNT / 8)

export interface WorldMapLandMask {
  width: number
  height: number
  step: number
  bits: string
}

export function buildWorldMapLandMask(grayscale: Uint8Array): WorldMapLandMask {
  if (!(grayscale instanceof Uint8Array) || grayscale.length !== PIXEL_COUNT) {
    throw new Error('陸水遮罩的灰階圖尺寸與海圖不符')
  }
  const packed = Buffer.alloc(BYTE_COUNT)
  for (let index = 0; index < grayscale.length; index++) {
    if (grayscale[index] >= 128) packed[index >> 3] |= 1 << (index & 7)
  }
  return {
    width: WORLD_MAP_LAND_MASK_WIDTH,
    height: WORLD_MAP_LAND_MASK_HEIGHT,
    step: WORLD_MAP_LAND_MASK_STEP,
    bits: deflateSync(packed).toString('base64'),
  }
}

export function createWorldMapLandCheck(mask: WorldMapLandMask): (point: Point) => boolean {
  if (
    mask?.width !== WORLD_MAP_LAND_MASK_WIDTH ||
    mask.height !== WORLD_MAP_LAND_MASK_HEIGHT ||
    mask.step !== WORLD_MAP_LAND_MASK_STEP ||
    typeof mask.bits !== 'string' ||
    !mask.bits
  ) {
    throw new Error('陸水遮罩缺少有效尺寸或資料')
  }
  const compressed = Buffer.from(mask.bits, 'base64')
  if (compressed.toString('base64') !== mask.bits) throw new Error('陸水遮罩編碼無效')

  let decoded: { buffer: Buffer; engine: Inflate }
  try {
    // info: true 在 Node 回傳解壓結果與讀取狀態，型別定義仍只宣告 Buffer。
    decoded = inflateSync(compressed, { maxOutputLength: BYTE_COUNT, info: true }) as unknown as {
      buffer: Buffer
      engine: Inflate
    }
  } catch {
    throw new Error('陸水遮罩無法解壓')
  }
  if (decoded.buffer.length !== BYTE_COUNT || decoded.engine.bytesWritten !== compressed.length) {
    throw new Error('陸水遮罩長度不符')
  }
  const packed = decoded.buffer
  return ({ x, y }) => {
    if (!(x >= 0 && x < MAP_WIDTH && y >= 0 && y < MAP_HEIGHT)) return false
    const row = Math.floor(y / WORLD_MAP_LAND_MASK_STEP)
    const column = Math.floor(x / WORLD_MAP_LAND_MASK_STEP)
    const index = row * WORLD_MAP_LAND_MASK_WIDTH + column
    return (packed[index >> 3] & (1 << (index & 7))) !== 0
  }
}

const isChartInterior = ({ x, y }: Point) => x > 0 && x < MAP_WIDTH && y > 0 && y < MAP_HEIGHT

export function preserveWorldMapSurface(
  layer: MapLayer,
  source: Point,
  calibrated: MapChartPosition,
  isLand: (point: Point) => boolean,
): MapChartPosition {
  // 圖幅接縫和邊界不可用來判斷陸水變更。
  if (
    calibrated.precision !== 'estimated' ||
    layer === 'port' ||
    !isChartInterior(source) ||
    !isChartInterior(calibrated)
  ) {
    return calibrated
  }
  const expectsLand = layer === 'land' || layer === 'village'
  if (isLand(source) === expectsLand && isLand(calibrated) !== expectsLand) {
    return { ...source, precision: 'source' }
  }
  return calibrated
}
