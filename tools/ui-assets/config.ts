export interface UiAssetRecipe {
  id: string
  source: string
  output: string
  mode: 'copy-png' | 'trim-rarity' | 'resize-png' | 'banner-jpeg'
  width?: number
  height?: number
  paletteColors?: number
  maxBytes: number
  group: 'banner' | 'feature' | 'original-ui'
}

const originalUi = (id: string, source: string, output: string): UiAssetRecipe => ({
  id,
  source: `original/${source}`,
  output,
  mode: 'copy-png',
  maxBytes: 20 * 1024,
  group: 'original-ui',
})

const compactDisclosureUi = (id: string, source: string, output: string): UiAssetRecipe => ({
  id,
  source: `original/${source}`,
  output,
  mode: 'resize-png',
  width: 512,
  height: 512,
  paletteColors: 16,
  maxBytes: 8 * 1024,
  group: 'original-ui',
})

export const UI_ASSET_RECIPES: readonly UiAssetRecipe[] = [
  {
    id: 'feature-officer-catalog',
    source: 'feature-officer-catalog-source.png',
    output: 'feature-officer-catalog.png',
    mode: 'resize-png',
    width: 96,
    height: 96,
    paletteColors: 16,
    maxBytes: 12 * 1024,
    group: 'feature',
  },
  {
    id: 'feature-trade-goods',
    source: 'feature-trade-goods-source.png',
    output: 'feature-trade-goods.png',
    mode: 'resize-png',
    width: 96,
    height: 96,
    paletteColors: 16,
    maxBytes: 12 * 1024,
    group: 'feature',
  },
  {
    id: 'feature-battle-fleet',
    source: 'feature-battle-fleet-source.png',
    output: 'feature-battle-fleet.png',
    mode: 'resize-png',
    width: 96,
    height: 96,
    paletteColors: 16,
    maxBytes: 12 * 1024,
    group: 'feature',
  },
  {
    id: 'feature-adventure-fleet',
    source: 'feature-adventure-fleet-source.png',
    output: 'feature-adventure-fleet.png',
    mode: 'resize-png',
    width: 96,
    height: 96,
    paletteColors: 16,
    maxBytes: 12 * 1024,
    group: 'feature',
  },
  {
    id: 'feature-data-maintenance',
    source: 'feature-data-maintenance-source.png',
    output: 'feature-data-maintenance.png',
    mode: 'resize-png',
    width: 96,
    height: 96,
    paletteColors: 16,
    maxBytes: 12 * 1024,
    group: 'feature',
  },
  {
    id: 'feature-coupon',
    source: 'feature-coupon-source.png',
    output: 'feature-coupon.png',
    mode: 'resize-png',
    width: 96,
    height: 96,
    paletteColors: 16,
    maxBytes: 12 * 1024,
    group: 'feature',
  },
  {
    id: 'home-harbor',
    source: 'home-harbor-source.png',
    output: 'home-harbor.jpg',
    mode: 'banner-jpeg',
    width: 750,
    height: 320,
    maxBytes: 150 * 1024,
    group: 'banner',
  },
  {
    id: 'fleet-share-map',
    source: 'fleet-share-map-source.png',
    output: 'fleet-share-map.jpg',
    mode: 'banner-jpeg',
    width: 750,
    height: 1125,
    maxBytes: 80 * 1024,
    group: 'banner',
  },
  {
    id: 'fleet-share-nautical-motifs',
    source: 'fleet-share-nautical-motifs-source.png',
    output: 'fleet-share-nautical-motifs.png',
    mode: 'resize-png',
    width: 768,
    height: 512,
    paletteColors: 128,
    maxBytes: 80 * 1024,
    group: 'banner',
  },
  ...[2, 3, 4, 5, 6].flatMap((grade) => [
    originalUi(
      `rarity-badge-grade-${grade}`,
      `uwo_icon_grade_${grade}.png`,
      `uwo-icon-grade-${grade}.png`,
    ),
    originalUi(
      `rarity-frame-grade-${grade}`,
      `uwo_bg_grade_${grade}.png`,
      `uwo-bg-grade-${grade}.png`,
    ),
  ]),
  ...[2, 3, 4, 5].map<UiAssetRecipe>((grade) => ({
    id: `rarity-filter-grade-${grade}`,
    source: `original/uwo_icon_grade_${grade}.png`,
    output: `uwo-icon-grade-${grade}-filter.png`,
    mode: 'trim-rarity',
    width: 29,
    height: 29,
    maxBytes: 12 * 1024,
    group: 'original-ui',
  })),
  ...[1, 2, 3].map((kind) =>
    originalUi(`officer-class-${kind}`, `uwo_icon_class_${kind}.png`, `uwo-icon-class-${kind}.png`),
  ),
  originalUi('gender-f', 'gender_f.png', 'gender-f.png'),
  originalUi('gender-m', 'gender_m.png', 'gender-m.png'),
  {
    id: 'mini-program-home-code',
    source: 'original/mini-program-home-code.png',
    output: 'mini-program-home-code.png',
    mode: 'resize-png',
    width: 220,
    height: 220,
    paletteColors: 64,
    maxBytes: 20 * 1024,
    group: 'original-ui',
  },
  compactDisclosureUi(
    'disclosure-chevron-down',
    'uwo_disclosure_chevron_down.png',
    'uwo-disclosure-chevron-down.png',
  ),
  compactDisclosureUi(
    'disclosure-chevron-up',
    'uwo_disclosure_chevron_up.png',
    'uwo-disclosure-chevron-up.png',
  ),
]

export const UI_ASSET_GROUP_BUDGETS: Readonly<Record<UiAssetRecipe['group'], number>> = {
  banner: 180 * 1024,
  feature: 48 * 1024,
  'original-ui': 80 * 1024,
}

export const UI_ASSET_TOTAL_BUDGET = 250 * 1024
