export interface MajorEventsAssetDefinition {
  kind: 'region' | 'texture' | 'ornament'
  source: string
  output: string
  width: number
  height: number
  paletteColors: number
  dither?: number
  transparent: boolean
}

export const REGION_IDS = [
  '37',
  '41',
  '57',
  '21',
  '22',
  '23',
  '58',
  '59',
  '50',
  '53',
  '54',
  '33',
  '63',
  '34',
  '18',
  '60',
  '20',
  '55',
] as const

export const MAJOR_EVENTS_ASSET_DEFINITIONS = [
  ...REGION_IDS.map((numericId): MajorEventsAssetDefinition => ({
    kind: 'region',
    source: `region-zone-${numericId}-source.png`,
    output: `region-zone-${numericId}.png`,
    width: 64,
    height: 64,
    paletteColors: 16,
    transparent: true,
  })),
  {
    kind: 'texture',
    source: 'paper-chart-tile-source.png',
    output: 'paper-chart-tile.png',
    width: 512,
    height: 512,
    paletteColors: 2,
    dither: 0,
    transparent: false,
  },
  {
    kind: 'ornament',
    source: 'compass-rose-source.png',
    output: 'compass-rose.png',
    width: 160,
    height: 160,
    paletteColors: 16,
    transparent: true,
  },
  {
    kind: 'ornament',
    source: 'journey-harbor-footer-source.png',
    output: 'journey-harbor-footer.png',
    width: 750,
    height: 180,
    paletteColors: 16,
    transparent: true,
  },
  {
    kind: 'ornament',
    source: 'matrix-ship-engraving-source.png',
    output: 'matrix-ship-engraving.png',
    width: 320,
    height: 180,
    paletteColors: 16,
    transparent: true,
  },
] satisfies MajorEventsAssetDefinition[]

MAJOR_EVENTS_ASSET_DEFINITIONS.sort((left, right) =>
  Buffer.compare(Buffer.from(left.output), Buffer.from(right.output)),
)
