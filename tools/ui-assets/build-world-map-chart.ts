import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { parseArgs } from 'node:util'
import sharp from 'sharp'
import {
  DETAIL_TILE_COLUMNS,
  DETAIL_TILE_ROWS,
} from '../../miniprogram/subpkg-world-map/chart-tile-layout'
import {
  MAP_HEIGHT,
  MAP_WIDTH,
  projectMapCoordinate,
} from '../../miniprogram/subpkg-world-map/viewport'
import {
  buildWorldMapLandMask,
  WORLD_MAP_LAND_MASK_HEIGHT,
  WORLD_MAP_LAND_MASK_STEP,
  WORLD_MAP_LAND_MASK_WIDTH,
} from '../data-pipeline/world-map-land-mask'

type Position = [number, number]
type Polygon = Position[][]
interface LandGeometry {
  type: 'Polygon' | 'MultiPolygon'
  coordinates: Polygon | Polygon[]
}

interface RiverGeometry {
  type: 'LineString' | 'MultiLineString'
  coordinates: Position[] | Position[][]
}

const DETAIL_WIDTH = 8640
const DETAIL_HEIGHT = 5100
const OVERVIEW_WIDTH = 2160
const OVERVIEW_HEIGHT = 1275

function getLandPath(input: string, maxRank = Infinity): string {
  const source = JSON.parse(readFileSync(input, 'utf8')) as {
    features: Array<{ geometry: LandGeometry; properties?: { scalerank?: number } }>
  }
  return source.features
    .filter(({ properties }) => (properties?.scalerank ?? 0) <= maxRank)
    .flatMap(({ geometry }) => {
      const polygons =
        geometry.type === 'Polygon'
          ? [geometry.coordinates as Polygon]
          : (geometry.coordinates as Polygon[])
      return polygons.map((rings) =>
        rings
          .map(
            (ring) =>
              ring
                .map(([lon, lat], index) => {
                  const { x, y } = projectMapCoordinate(lon, lat, false)
                  return `${index ? 'L' : 'M'}${x.toFixed(1)} ${y.toFixed(1)}`
                })
                .join(' ') + 'Z',
          )
          .join(' '),
      )
    })
    .join(' ')
}

function wrapLayer(id: string): string {
  return `<use href="#${id}" x="-${MAP_WIDTH}"/><use href="#${id}"/><use href="#${id}" x="${MAP_WIDTH}"/>`
}

function projectRiverLine(line: Position[]): string {
  let longitude = line[0]?.[0] ?? 0
  let previousLongitude = longitude
  return line
    .map(([lon, lat], index) => {
      // 線段跨過 ±180° 時取短邊，投影後再按海圖自己的經度接縫平移。
      const delta = lon - previousLongitude
      longitude += delta - Math.round(delta / 360) * 360
      previousLongitude = lon
      const { x, y } = projectMapCoordinate(longitude, lat, false)
      return `${index ? 'L' : 'M'}${x.toFixed(1)} ${y.toFixed(1)}`
    })
    .join(' ')
}

function getRiverPaths(input: string): string[] {
  const source = JSON.parse(readFileSync(input, 'utf8')) as {
    features: Array<{
      geometry: RiverGeometry
      properties: { featurecla: string; scalerank: number }
    }>
  }
  const paths: string[][] = [[], [], []]
  for (const { geometry, properties } of source.features) {
    if (properties.featurecla !== 'River') continue
    const lines =
      geometry.type === 'LineString'
        ? [geometry.coordinates as Position[]]
        : (geometry.coordinates as Position[][])
    const index = properties.scalerank <= 4 ? 0 : properties.scalerank <= 7 ? 1 : 2
    paths[index].push(...lines.map(projectRiverLine))
  }
  return paths.map((path) => path.join(' '))
}

function chartSvg(
  land: string,
  width: number,
  height: number,
  water?: { rivers: string[]; lakes: string },
): Buffer {
  const rivers = water?.rivers
    .map((path, index) => {
      const width = [4, 2.25, 1.35][index]
      const opacity = [0.88, 0.66, 0.58][index]
      return `<path d="${path}" stroke-width="${width}" stroke-opacity="${opacity}"/>`
    })
    .reverse()
    .join('')
  const waterways = water
    ? `<g id="waterways"><g fill="none" stroke="#47747a" stroke-linecap="round" stroke-linejoin="round">${rivers}</g><path d="${water.lakes}" fill="#527c80" fill-rule="evenodd"/></g>`
    : ''
  const parallels = Array.from({ length: 9 }, (_, index) => {
    const { y } = projectMapCoordinate(0, (index - 4) * 15)
    return `M0 ${y} H${MAP_WIDTH}`
  }).join(' ')
  const meridians = Array.from({ length: 24 }, (_, index) => {
    const { x } = projectMapCoordinate(index * 15, 0)
    return `M${x} 0 V${MAP_HEIGHT}`
  }).join(' ')
  return Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${MAP_WIDTH} ${MAP_HEIGHT}"${water ? ' preserveAspectRatio="none"' : ''}>
    <defs>
      <linearGradient id="sea" x2="0" y2="1" gradientUnits="objectBoundingBox">
        <stop stop-color="#172a30"/><stop offset=".48" stop-color="#26464a"/><stop offset="1" stop-color="#172a30"/>
      </linearGradient>
      <linearGradient id="land" x1="0" x2="0" y2="1" gradientUnits="objectBoundingBox">
        <stop stop-color="#a29066"/><stop offset=".50" stop-color="#ccb584"/><stop offset="1" stop-color="#a38f67"/>
      </linearGradient>
      <g id="coast" fill="url(#land)" stroke="#daca9f" stroke-width="2.8">${land}</g>
      ${waterways}
    </defs>
    <path fill="url(#sea)" d="M0 0H${MAP_WIDTH}V${MAP_HEIGHT}H0Z"/>
    ${wrapLayer('coast')}
    ${water ? wrapLayer('waterways') : ''}
    <path d="${parallels} ${meridians}" fill="none" stroke="#f5efe0" stroke-opacity=".18" stroke-width="2.8"/>
  </svg>`)
}

async function writeDetailTiles(land: string, rivers: string[], lakes: string, directory: string) {
  const width = DETAIL_WIDTH / DETAIL_TILE_COLUMNS
  const height = DETAIL_HEIGHT / DETAIL_TILE_ROWS
  // 同一張整幅圖裁出所有格位，像素與水系跨片位置一致。
  const { data, info } = await sharp(chartSvg(land, DETAIL_WIDTH, DETAIL_HEIGHT, { rivers, lakes }))
    .removeAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true })
  mkdirSync(directory, { recursive: true })
  for (let row = 0; row < DETAIL_TILE_ROWS; row++) {
    for (let column = 0; column < DETAIL_TILE_COLUMNS; column++) {
      await sharp(data, { raw: info })
        .extract({ left: column * width, top: row * height, width, height })
        .jpeg({ quality: 33, mozjpeg: true })
        .toFile(join(directory, `${row}-${column}.jpg`))
    }
  }
}

async function buildChart(
  input: string,
  output: string,
  minorIslands?: string,
  maskOutput?: string,
  hydrography?: { rivers: string; lakes: string; detailDir?: string },
): Promise<void> {
  // Natural Earth v5.1.2 的 1:10m 陸地、小島、河流和湖泊，公有領域。
  const paths = [getLandPath(input), ...(minorIslands ? [getLandPath(minorIslands)] : [])]
  const land = paths.map((path) => `<path d="${path}" fill-rule="evenodd"/>`).join('')
  if (hydrography) {
    const rivers = getRiverPaths(hydrography.rivers)
    const lakes = getLandPath(hydrography.lakes, 5)
    const overview = chartSvg(land, OVERVIEW_WIDTH, OVERVIEW_HEIGHT, {
      rivers: rivers.slice(0, 1),
      lakes,
    })
    await sharp(overview).jpeg({ quality: 52, mozjpeg: true }).toFile(output)
    if (hydrography.detailDir) {
      await writeDetailTiles(land, rivers, getLandPath(hydrography.lakes), hydrography.detailDir)
    }
  } else {
    await sharp(chartSvg(land, 4320, 2550))
      .jpeg({ quality: 86, mozjpeg: true })
      .toFile(output)
  }

  if (maskOutput) {
    const w = WORLD_MAP_LAND_MASK_WIDTH
    const h = WORLD_MAP_LAND_MASK_HEIGHT
    const step = WORLD_MAP_LAND_MASK_STEP
    const monochrome = `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w * step} ${h * step}">
      <defs><g id="coast" fill="white">${land}</g></defs>
      <rect width="100%" height="100%" fill="black"/>
      ${wrapLayer('coast')}
    </svg>`
    const grayscale = await sharp(Buffer.from(monochrome)).greyscale().raw().toBuffer()
    writeFileSync(maskOutput, JSON.stringify(buildWorldMapLandMask(grayscale), null, 2) + '\n')
  }
}

if (process.argv[1]?.endsWith('build-world-map-chart.ts')) {
  const { positionals, values } = parseArgs({
    allowPositionals: true,
    options: {
      rivers: { type: 'string' },
      lakes: { type: 'string' },
      'detail-dir': { type: 'string' },
    },
  })
  const [input, output, minorIslands, maskOutput] = positionals
  if (!input || !output) throw new Error('請指定 Natural Earth 陸地 GeoJSON 和海圖輸出位置')
  const { rivers, lakes, 'detail-dir': detailDir } = values
  if (Boolean(rivers) !== Boolean(lakes) || (detailDir && !rivers)) {
    throw new Error(
      '請同時指定 --rivers 河流 GeoJSON 和 --lakes 湖泊 GeoJSON，再選擇 --detail-dir 瓦片輸出目錄',
    )
  }
  const hydrography = rivers && lakes ? { rivers, lakes, detailDir } : undefined
  void buildChart(input, output, minorIslands, maskOutput, hydrography).catch((error: unknown) => {
    console.error(error)
    process.exitCode = 1
  })
}
