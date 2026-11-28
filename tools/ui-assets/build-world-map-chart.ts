import { readFileSync, writeFileSync } from 'node:fs'
import sharp from 'sharp'
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

type Polygon = [number, number][][]
interface LandGeometry {
  type: 'Polygon' | 'MultiPolygon'
  coordinates: Polygon | Polygon[]
}

function getLandPath(input: string): string {
  const source = JSON.parse(readFileSync(input, 'utf8')) as {
    features: Array<{ geometry: LandGeometry }>
  }
  return source.features
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

async function buildChart(
  input: string,
  output: string,
  minorIslands?: string,
  maskOutput?: string,
): Promise<void> {
  // Natural Earth v5.1.2 的 1:10m 陸地與小島，公有領域。
  const paths = [getLandPath(input), ...(minorIslands ? [getLandPath(minorIslands)] : [])]
  const land = paths.map((path) => `<path d="${path}" fill-rule="evenodd"/>`).join('')
  const repeats = `<use href="#coast" x="-${MAP_WIDTH}"/><use href="#coast"/><use href="#coast" x="${MAP_WIDTH}"/>`
  const parallels = Array.from({ length: 9 }, (_, index) => {
    const { y } = projectMapCoordinate(0, (index - 4) * 15)
    return `M0 ${y} H${MAP_WIDTH}`
  }).join(' ')
  const meridians = Array.from({ length: 24 }, (_, index) => {
    const { x } = projectMapCoordinate(index * 15, 0)
    return `M${x} 0 V${MAP_HEIGHT}`
  }).join(' ')
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="4320" height="2550" viewBox="0 0 ${MAP_WIDTH} ${MAP_HEIGHT}">
    <defs>
      <linearGradient id="sea" x2="0" y2="1" gradientUnits="objectBoundingBox">
        <stop stop-color="#172a30"/><stop offset=".48" stop-color="#26464a"/><stop offset="1" stop-color="#172a30"/>
      </linearGradient>
      <linearGradient id="land" x1="0" x2="0" y2="1" gradientUnits="objectBoundingBox">
        <stop stop-color="#a29066"/><stop offset=".50" stop-color="#ccb584"/><stop offset="1" stop-color="#a38f67"/>
      </linearGradient>
      <g id="coast" fill="url(#land)" stroke="#daca9f" stroke-width="2.8">${land}</g>
    </defs>
    <path fill="url(#sea)" d="M0 0H${MAP_WIDTH}V${MAP_HEIGHT}H0Z"/>
    ${repeats}
    <path d="${parallels} ${meridians}" fill="none" stroke="#f5efe0" stroke-opacity=".18" stroke-width="2.8"/>
  </svg>`
  await sharp(Buffer.from(svg)).jpeg({ quality: 86, mozjpeg: true }).toFile(output)

  if (maskOutput) {
    const w = WORLD_MAP_LAND_MASK_WIDTH
    const h = WORLD_MAP_LAND_MASK_HEIGHT
    const step = WORLD_MAP_LAND_MASK_STEP
    const monochrome = `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w * step} ${h * step}">
      <defs><g id="coast" fill="white">${land}</g></defs>
      <rect width="100%" height="100%" fill="black"/>
      ${repeats}
    </svg>`
    const grayscale = await sharp(Buffer.from(monochrome)).greyscale().raw().toBuffer()
    writeFileSync(maskOutput, JSON.stringify(buildWorldMapLandMask(grayscale), null, 2) + '\n')
  }
}

const [, , input, output, minorIslands, maskOutput] = process.argv
if (process.argv[1]?.endsWith('build-world-map-chart.ts')) {
  if (!input || !output) throw new Error('請指定 Natural Earth 陸地 GeoJSON 和海圖輸出位置')
  void buildChart(input, output, minorIslands, maskOutput).catch((error: unknown) => {
    console.error(error)
    process.exitCode = 1
  })
}
