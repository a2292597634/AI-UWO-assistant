import { readFileSync } from 'node:fs'
import sharp from 'sharp'
import {
  MAP_HEIGHT,
  MAP_WIDTH,
  projectMapCoordinate,
} from '../../miniprogram/subpkg-world-map/viewport'

type Polygon = [number, number][][]
interface LandGeometry {
  type: 'Polygon' | 'MultiPolygon'
  coordinates: Polygon | Polygon[]
}

async function buildChart(input: string, output: string): Promise<void> {
  // Natural Earth 1:50m 陸地 v5.1.2，公有領域。只繪製自然海岸線。
  const source = JSON.parse(readFileSync(input, 'utf8')) as {
    features: Array<{ geometry: LandGeometry }>
  }
  const land = source.features
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

  const parallels = Array.from({ length: 9 }, (_, index) => {
    const { y } = projectMapCoordinate(0, (index - 4) * 15)
    return `M0 ${y} H${MAP_WIDTH}`
  }).join(' ')
  const meridians = Array.from({ length: 24 }, (_, index) => {
    const { x } = projectMapCoordinate(index * 15, 0)
    return `M${x} 0 V${MAP_HEIGHT}`
  }).join(' ')
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="3600" height="2125" viewBox="0 0 ${MAP_WIDTH} ${MAP_HEIGHT}">
    <defs>
      <linearGradient id="sea" x2="0" y2="1" gradientUnits="objectBoundingBox">
        <stop stop-color="#172a30"/><stop offset=".48" stop-color="#26464a"/><stop offset="1" stop-color="#172a30"/>
      </linearGradient>
      <linearGradient id="land" x1="0" x2="0" y2="1" gradientUnits="objectBoundingBox">
        <stop stop-color="#a29066"/><stop offset=".50" stop-color="#ccb584"/><stop offset="1" stop-color="#a38f67"/>
      </linearGradient>
      <path id="coast" d="${land}" fill="url(#land)" fill-rule="evenodd" stroke="#daca9f" stroke-width="2.8"/>
    </defs>
    <path fill="url(#sea)" d="M0 0H${MAP_WIDTH}V${MAP_HEIGHT}H0Z"/>
    <use href="#coast" x="-${MAP_WIDTH}"/><use href="#coast"/><use href="#coast" x="${MAP_WIDTH}"/>
    <path d="${parallels} ${meridians}" fill="none" stroke="#f5efe0" stroke-opacity=".18" stroke-width="2.8"/>
  </svg>`
  await sharp(Buffer.from(svg)).jpeg({ quality: 86, mozjpeg: true }).toFile(output)
}

const [, , input, output] = process.argv
if (process.argv[1]?.endsWith('build-world-map-chart.ts')) {
  if (!input || !output) throw new Error('請指定 Natural Earth 陸地 GeoJSON 和海圖輸出位置')
  void buildChart(input, output).catch((error: unknown) => {
    console.error(error)
    process.exitCode = 1
  })
}
