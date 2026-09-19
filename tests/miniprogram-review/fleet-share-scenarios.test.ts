import { describe, expect, it } from 'vitest'

import { loadScenario } from '../../tools/miniprogram-review/scenario'

const scenarios = [
  {
    path: 'tools/miniprogram-review/scenarios/battle-fleet-share.json',
    entry: '/subpkg-fleet/pages/index/index',
    title: '戰鬥配隊分享圖',
  },
  {
    path: 'tools/miniprogram-review/scenarios/adventure-fleet-share.json',
    entry: '/pages/adventure-fleet/index',
    title: '冒險配隊分享圖',
  },
] as const

describe('艦隊分享圖自動驗收場景', () => {
  it.each(scenarios)('$title 覆蓋生成、可見性、滾動與修改前後截图证据', (definition) => {
    const scenario = loadScenario(definition.path)
    const actions = scenario.steps.map((step) => step.action)

    expect(scenario.entry).toBe(definition.entry)
    expect(scenario.watchPaths).toEqual(
      expect.arrayContaining([
        'miniprogram/runtime/fleet-share-renderer.ts',
        'miniprogram/runtime/fleet-share-layout.ts',
        'miniprogram/components/config-bar/',
        'miniprogram/components/fleet-share-preview/',
        'miniprogram/assets/ui/fleet-share-map.jpg',
        'data/master/ui-assets/fleet-share-map-source.png',
        'miniprogram/assets/ui/fleet-share-nautical-motifs.png',
        'data/master/ui-assets/fleet-share-nautical-motifs-source.png',
      ]),
    )
    expect(actions).toEqual(
      expect.arrayContaining([
        'tap',
        'waitFor',
        'assertExists',
        'assertVisible',
        'assertText',
        'scrollElement',
        'screenshot',
      ]),
    )
    expect(scenario.steps.filter((step) => step.action === 'screenshot')).toHaveLength(3)
  })
})
