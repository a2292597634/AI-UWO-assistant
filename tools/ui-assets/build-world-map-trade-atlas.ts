import { createHash } from 'node:crypto'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import sharp from 'sharp'
import { loadPublishedAssetManifest } from '../asset-pipeline/publish-assets'
import { buildTradeIconSources } from '../asset-pipeline/trade-icons'
import {
  MAP_ICON_ATLAS_CAPACITY,
  MAP_ICON_ATLAS_COLUMNS,
  MAP_ICON_ATLAS_ROWS,
} from '../data-pipeline/build-world-map-icon-locations'
import type { CanonicalTradeDataset } from '../import/types'

const TILE_SIZE = 40
const ICON_SIZE = TILE_SIZE - 4
const TRANSPARENT = { r: 0, g: 0, b: 0, alpha: 0 }

export async function renderTradeAtlas(inputs: readonly Buffer[]): Promise<Buffer> {
  if (!inputs.length || inputs.length > MAP_ICON_ATLAS_CAPACITY)
    throw new Error('交易品圖集的單頁格位數無效')
  const icons = await Promise.all(
    inputs.map((input) =>
      sharp(input)
        .ensureAlpha()
        .resize(ICON_SIZE, ICON_SIZE, { fit: 'contain', background: TRANSPARENT })
        .png()
        .toBuffer(),
    ),
  )
  const margin = (TILE_SIZE - ICON_SIZE) / 2
  return sharp({
    create: {
      width: TILE_SIZE * MAP_ICON_ATLAS_COLUMNS,
      height: TILE_SIZE * MAP_ICON_ATLAS_ROWS,
      channels: 4,
      background: TRANSPARENT,
    },
  })
    .composite(
      icons.map((input, index) => ({
        input,
        left: (index % MAP_ICON_ATLAS_COLUMNS) * TILE_SIZE + margin,
        top: Math.floor(index / MAP_ICON_ATLAS_COLUMNS) * TILE_SIZE + margin,
      })),
    )
    .png({ palette: true, colours: 256, effort: 8, dither: 0.35 })
    .toBuffer()
}

async function build(staging: string, output: string): Promise<void> {
  const data = JSON.parse(
    await readFile('data/master/trade-goods.json', 'utf8'),
  ) as CanonicalTradeDataset
  const sources = buildTradeIconSources(data.tradeGoods)
  const manifest = loadPublishedAssetManifest('data/assets/cloudbase-manifest.json')
  const approved = new Map(manifest.assets.map(({ filename, sha256 }) => [filename, sha256]))
  await mkdir(output, { recursive: true })
  for (let start = 0; start < sources.length; start += MAP_ICON_ATLAS_CAPACITY) {
    const inputs = await Promise.all(
      sources.slice(start, start + MAP_ICON_ATLAS_CAPACITY).map(async ({ filename }) => {
        const bytes = await readFile(join(staging, filename))
        if (createHash('sha256').update(bytes).digest('hex') !== approved.get(filename))
          throw new Error(`縮圖來源與已發布素材不一致：${filename}`)
        return bytes
      }),
    )
    const page = start / MAP_ICON_ATLAS_CAPACITY
    await writeFile(join(output, `trade-icons-${page}.png`), await renderTradeAtlas(inputs))
  }
  await writeFile(
    join(output, 'world-map-trade-atlas.json'),
    JSON.stringify(
      sources.map(({ imageId }) => imageId),
      null,
      2,
    ) + '\n',
  )
  console.log(`已核對與繪製 ${sources.length} 枚已發布交易品縮圖`)
}

if (process.argv[1]?.endsWith('build-world-map-trade-atlas.ts')) {
  const [, , staging, output] = process.argv
  if (!staging || !output) throw new Error('請提供已發布素材快取目錄及圖集輸出目錄')
  void build(staging, output).catch((error: unknown) => {
    console.error(error)
    process.exitCode = 1
  })
}
