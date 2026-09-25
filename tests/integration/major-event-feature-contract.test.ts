import { existsSync, readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { getTradeCategoryIconPath } from '../../miniprogram/subpkg-trade/trade-category-icons'
import { getMajorEventReference } from '../../miniprogram/subpkg-trade/runtime/major-event-data-store'

const readJson = <T>(path: string): T => JSON.parse(readFileSync(path, 'utf8')) as T

describe('major-event feature integration contract', () => {
  it('registers the popularity page at the end of the trade subpackage', () => {
    const appConfig = readJson<{
      subpackages: Array<{ root: string; pages: string[] }>
    }>('miniprogram/app.json')

    expect(appConfig.subpackages.find((item) => item.root === 'subpkg-trade')?.pages).toEqual([
      'pages/index/index',
      'pages/detail/index',
      'pages/popularity/index',
    ])
    expect(existsSync('miniprogram/subpkg-trade/pages/popularity/index.wxml')).toBe(true)
    expect(existsSync('miniprogram/subpkg-trade/major-event-reference.js')).toBe(true)
  })

  it('uses all event category IDs through the shared trade-category icon resolver', () => {
    const reference = getMajorEventReference()
    const categoryIds = [
      ...new Set(reference.eventTypes.flatMap((event) => event.tradeTypeIds)),
    ].sort()

    expect(categoryIds).toHaveLength(20)
    for (const categoryId of categoryIds) {
      const iconPath = getTradeCategoryIconPath(categoryId)
      expect(iconPath).toBe(`/subpkg-trade/assets/category-icons/${categoryId}.png`)
      expect(existsSync(`miniprogram${iconPath}`)).toBe(true)
    }
  })

  it('keeps the home entry route and keeps its fallback inside the primary tile', () => {
    const homeSource = readFileSync('miniprogram/pages/home/index.ts', 'utf8')
    const homeWxml = readFileSync('miniprogram/pages/home/index.wxml', 'utf8')

    expect(homeSource).toContain("id: 'major-events'")
    expect(homeSource).toContain("name: '大流行預測'")
    expect(homeSource).toContain("route: '/subpkg-trade/pages/popularity/index'")
    expect(homeWxml).toContain('index < 6')
    expect(homeWxml).toContain('module-grid__icon-fallback')
    expect(homeWxml).toContain("item.id === 'error-report'")
  })
})
