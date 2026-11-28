import { execFileSync } from 'node:child_process'
import { mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import sharp from 'sharp'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import {
  MAP_HEIGHT,
  MAP_WIDTH,
  projectMapCoordinate,
} from '../../miniprogram/subpkg-world-map/viewport'

describe('世界海圖構建', () => {
  const tileWidth = 1440
  const tileHeight = 1275
  const tileColumns = 6
  const tileRows = 4
  const directory = mkdtempSync(join(tmpdir(), 'uwo-world-chart-'))
  const overviewPath = join(directory, 'world-chart.jpg')
  const detailPath = join(directory, 'chart-detail')
  const legacyPath = join(directory, 'legacy.jpg')
  const maskPath = join(directory, 'mask.json')
  const candidateMaskPath = join(directory, 'candidate-mask.json')
  const expectedTiles = Array.from(
    { length: 24 },
    (_, index) => `${Math.floor(index / 6)}-${index % 6}.jpg`,
  )

  function writeLayer(name: string, features: unknown[]) {
    const path = join(directory, `${name}.geojson`)
    writeFileSync(path, JSON.stringify({ type: 'FeatureCollection', features }))
    return path
  }

  function rectangle(west: number, south: number, east: number, north: number) {
    return {
      type: 'Feature',
      properties: { scalerank: 1 },
      geometry: {
        type: 'Polygon',
        coordinates: [
          [
            [west, south],
            [east, south],
            [east, north],
            [west, north],
            [west, south],
          ],
        ],
      },
    }
  }

  function river(scalerank: number, coordinates: number[][], featurecla = 'River') {
    return {
      type: 'Feature',
      properties: { featurecla, scalerank },
      geometry: { type: 'LineString', coordinates },
    }
  }

  function build(...args: string[]) {
    execFileSync(
      process.execPath,
      ['node_modules/tsx/dist/cli.mjs', 'tools/ui-assets/build-world-map-chart.ts', ...args],
      { cwd: process.cwd() },
    )
  }

  async function luminance(path: string, x: number, y: number) {
    const pixels = await sharp(path)
      .extract({ left: x, top: y, width: 1, height: 1 })
      .greyscale()
      .raw()
      .toBuffer()
    return pixels[0]!
  }

  function worldPixel(longitude: number, latitude: number) {
    const { x, y } = projectMapCoordinate(longitude, latitude)
    return [
      Math.floor((x * tileColumns * tileWidth) / MAP_WIDTH),
      Math.floor((y * tileRows * tileHeight) / MAP_HEIGHT),
    ] as const
  }

  function detailLuminance(x: number, y: number) {
    return luminance(
      join(detailPath, `${Math.floor(y / tileHeight)}-${Math.floor(x / tileWidth)}.jpg`),
      x % tileWidth,
      y % tileHeight,
    )
  }

  beforeAll(() => {
    const landPath = writeLayer('land', [rectangle(-180, -68, 180, 68)])
    const minorPath = writeLayer('minor', [rectangle(51, 69, 55, 71)])
    const lakesPath = writeLayer('lakes', [rectangle(40, 44, 43, 48)])
    const riversPath = writeLayer('rivers', [
      river(1, [
        [2, 30],
        [21, 30],
      ]),
      river(1, [
        [179, 12],
        [-179, 12],
      ]),
      river(1, [
        [57, 4],
        [57, -4],
      ]),
      river(1, [
        [-174, 28],
        [-163, 28],
      ]),
      river(8, [
        [16, 41],
        [22, 41],
      ]),
      river(
        1,
        [
          [33, 43],
          [37, 43],
        ],
        'Lake Centerline',
      ),
      river(1, [
        [37, 46],
        [46, 46],
      ]),
    ])
    build(landPath, legacyPath, minorPath, maskPath)
    build(
      landPath,
      overviewPath,
      minorPath,
      candidateMaskPath,
      '--rivers',
      riversPath,
      '--lakes',
      lakesPath,
      '--detail-dir',
      detailPath,
    )
  }, 30000)

  afterAll(() => rmSync(directory, { recursive: true, force: true }))

  it('保留原位置參數產生的底圖和登陸遮罩', async () => {
    expect(await sharp(legacyPath).metadata()).toMatchObject({ width: 4320, height: 2550 })
    expect(JSON.parse(readFileSync(maskPath, 'utf8'))).toMatchObject({
      width: expect.any(Number),
      height: expect.any(Number),
    })
    expect(readFileSync(candidateMaskPath)).toEqual(readFileSync(maskPath))
  })

  it('以 24 張等大的瓦片覆蓋整張海圖，河道在接縫兩側的同一高度', async () => {
    expect(readdirSync(detailPath).sort()).toEqual(expectedTiles)
    for (const tile of expectedTiles) {
      expect(await sharp(join(detailPath, tile)).metadata()).toMatchObject({
        width: tileWidth,
        height: tileHeight,
      })
    }
    const [, y] = worldPixel(12, 30)
    for (const x of [tileWidth * 3 - 1, tileWidth * 3]) {
      expect(await detailLuminance(x, y)).toBeLessThan((await detailLuminance(x, y + 7)) - 28)
    }
    const [x] = worldPixel(57, 0)
    for (const rowEdge of [tileHeight * 2 - 1, tileHeight * 2]) {
      expect(await detailLuminance(x, rowEdge)).toBeLessThan(
        (await detailLuminance(x + 7, rowEdge)) - 28,
      )
    }
  })

  it('按最短經度繪製換日線河道，跨越海圖左右邊緣時兩端仍有河道', async () => {
    const [dateLineX, dateLineY] = worldPixel(180, 12)
    expect(await detailLuminance(dateLineX, dateLineY)).toBeLessThan(
      (await detailLuminance(dateLineX, dateLineY + 7)) - 28,
    )
    const [unrelatedX, unrelatedY] = worldPixel(5, 12)
    expect(
      Math.abs(
        (await detailLuminance(unrelatedX, unrelatedY)) -
          (await detailLuminance(unrelatedX, unrelatedY + 7)),
      ),
    ).toBeLessThan(10)
    const [, mapEdgeY] = worldPixel(-169, 28)
    for (const x of [0, tileColumns * tileWidth - 1]) {
      expect(await detailLuminance(x, mapEdgeY)).toBeLessThan(
        (await detailLuminance(x, mapEdgeY + 7)) - 28,
      )
    }
  })

  it('全圖繪製主河道，高解析度才補上小支流', async () => {
    const overview = await sharp(overviewPath).metadata()
    const overviewAt = (longitude: number, latitude: number) => {
      const { x, y } = projectMapCoordinate(longitude, latitude)
      return [
        Math.floor((x * overview.width) / MAP_WIDTH),
        Math.floor((y * overview.height) / MAP_HEIGHT),
      ] as const
    }
    const [mainX, mainY] = overviewAt(12, 30)
    expect(await luminance(overviewPath, mainX, mainY)).toBeLessThan(
      (await luminance(overviewPath, mainX, mainY + 5)) - 15,
    )
    const [branchX, branchY] = overviewAt(19, 41)
    expect(
      Math.abs(
        (await luminance(overviewPath, branchX, branchY)) -
          (await luminance(overviewPath, branchX, branchY + 5)),
      ),
    ).toBeLessThan(10)
    const [detailX, detailY] = worldPixel(19, 41)
    expect(await detailLuminance(detailX, detailY)).toBeLessThan(
      (await detailLuminance(detailX, detailY + 7)) - 10,
    )
  })

  it('以平整的水面填滿湖泊，略過資料來源的湖泊中心線', async () => {
    const [lakeX, lakeY] = worldPixel(41, 46)
    const lake = await detailLuminance(lakeX, lakeY)
    expect(lake).toBeLessThan((await detailLuminance(...worldPixel(44, 45.8))) - 25)
    expect(Math.abs(lake - (await detailLuminance(lakeX, lakeY + 7)))).toBeLessThan(10)
    const [lineX, lineY] = worldPixel(35, 43)
    expect(
      Math.abs((await detailLuminance(lineX, lineY)) - (await detailLuminance(lineX, lineY + 7))),
    ).toBeLessThan(10)
  })
})
