import { describe, expect, it } from 'vitest'

import { createTriggerPlan, isPageRelatedPath } from '../../tools/miniprogram-review/trigger'
import type { ReviewScenario } from '../../tools/miniprogram-review/types'

const scenario = (
  name: string,
  steps: number,
  watchPaths?: string[],
  entry = `/pages/${name}/index`,
): ReviewScenario => ({
  name,
  entry,
  watchPaths,
  state: 'normal',
  devices: ['iphone-standard'],
  steps: Array.from({ length: steps }, (_, index) => ({
    action: 'screenshot' as const,
    name: `screen-${index}`,
  })),
})

describe('小程序页面变更触发器', () => {
  it('只把页面相关变更送入最小迭代场景', () => {
    const plan = createTriggerPlan({
      mode: 'iterate',
      changedFiles: [
        'miniprogram/pages/catalog/index.wxss',
        'data/master/officers.json',
        'docs/miniprogram-review.md',
      ],
      scenarios: [
        scenario('catalog', 3, ['miniprogram/pages/catalog/']),
        scenario('catalog-detail', 1, ['miniprogram/pages/catalog/'], '/pages/catalog/index'),
      ],
    })

    expect(plan.outcome).toBe('run')
    expect(plan.pageFiles).toEqual(['miniprogram/pages/catalog/index.wxss'])
    expect(plan.scenarios.map(({ name }) => name)).toEqual(['catalog-detail'])
  })

  it('final 模式选择受影响入口的全部场景，共享组件可命中多个入口', () => {
    const plan = createTriggerPlan({
      mode: 'final',
      changedFiles: ['miniprogram/components/catalog/row.ts'],
      scenarios: [
        scenario('catalog', 2, ['miniprogram/components/catalog/']),
        scenario('detail', 2, ['miniprogram/components/catalog/']),
      ],
    })

    expect(plan.scenarios.map(({ name }) => name)).toEqual(['catalog', 'detail'])
  })

  it('没有页面变更时 iterate 跳过，final 阻塞', () => {
    const input = { changedFiles: ['data/master/officers.json'], scenarios: [] }

    expect(createTriggerPlan({ ...input, mode: 'iterate' })).toMatchObject({ outcome: 'skipped' })
    expect(createTriggerPlan({ ...input, mode: 'final' })).toMatchObject({ outcome: 'blocked' })
  })

  it('路由配置变更命中全部场景，生成文件和相似目录不会触发', () => {
    expect(isPageRelatedPath('miniprogram/app.json')).toBe(true)
    expect(isPageRelatedPath('miniprogram/generated/catalog.js')).toBe(false)
    expect(isPageRelatedPath('miniprogram/subpkg-detail/details-officer.js')).toBe(false)
    expect(
      createTriggerPlan({
        mode: 'final',
        changedFiles: ['miniprogram/app.json'],
        scenarios: [scenario('catalog', 1), scenario('detail', 1)],
      }).scenarios.map(({ name }) => name),
    ).toEqual(['catalog', 'detail'])
  })

  it('目录 watchPaths 要求边界，catalog-old 不会误命中 catalog', () => {
    const plan = createTriggerPlan({
      mode: 'final',
      changedFiles: ['miniprogram/pages/catalog-old/index.wxss'],
      scenarios: [scenario('catalog', 1, ['miniprogram/pages/catalog/'])],
    })

    expect(plan.outcome).toBe('blocked')
    expect(plan.scenarios).toEqual([])
  })

  it('分享底板来源或 recipe 变更会同时触发戰鬥與冒險分享场景', () => {
    const watchPaths = [
      'miniprogram/runtime/fleet-share-renderer.ts',
      'miniprogram/runtime/fleet-share-layout.ts',
      'miniprogram/assets/ui/fleet-share-map.jpg',
      'data/master/ui-assets/fleet-share-map-source.png',
      'miniprogram/assets/ui/fleet-share-nautical-motifs.png',
      'data/master/ui-assets/fleet-share-nautical-motifs-source.png',
      'tools/ui-assets/config.ts',
      'tools/ui-assets/build-ui-assets.ts',
    ]
    const plan = createTriggerPlan({
      mode: 'final',
      changedFiles: ['data/master/ui-assets/fleet-share-map-source.png'],
      scenarios: [
        scenario('battle-share', 2, watchPaths, '/subpkg-fleet/pages/index/index'),
        scenario('adventure-share', 2, watchPaths, '/pages/adventure-fleet/index'),
      ],
    })

    expect(isPageRelatedPath('data/master/ui-assets/fleet-share-map-source.png')).toBe(true)
    expect(isPageRelatedPath('data/master/ui-assets/fleet-share-nautical-motifs-source.png')).toBe(
      true,
    )
    expect(isPageRelatedPath('miniprogram/assets/ui/fleet-share-nautical-motifs.png')).toBe(true)
    expect(plan.outcome).toBe('run')
    expect(plan.pageFiles).toEqual(['data/master/ui-assets/fleet-share-map-source.png'])
    expect(plan.scenarios.map(({ name }) => name)).toEqual(['adventure-share', 'battle-share'])
  })
})
