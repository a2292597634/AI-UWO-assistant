import { describe, expect, it } from 'vitest'
import * as fs from 'node:fs'
import * as path from 'node:path'

import { buildTradePortMatrix } from '../../miniprogram/subpkg-trade/domain/trade-season'
import { getTradeReference } from '../../miniprogram/subpkg-trade/runtime/trade-data-store'
import { getTradeDetail } from '../../miniprogram/subpkg-trade/runtime/trade-detail-store'

const readWorkspaceFile = (filePath: string): string =>
  fs.readFileSync(path.resolve(filePath), 'utf8')

describe('trade feature integration contract', () => {
  it('keeps trade-only runtime sources inside the trade subpackage', () => {
    const tradeRoot = path.resolve('miniprogram/subpkg-trade')
    const mainRoot = path.resolve('miniprogram')
    const tradeSources = [
      'domain/game-month.ts',
      'domain/trade-query.ts',
      'domain/trade-season.ts',
      'presenters/trade-season-presenter.ts',
    ]

    expect(tradeSources.every((file) => fs.existsSync(path.join(tradeRoot, file)))).toBe(true)
    expect(tradeSources.every((file) => !fs.existsSync(path.join(mainRoot, file)))).toBe(true)
  })

  it('connects the homepage entry to the trade page and detail subpackage', () => {
    const appConfig = JSON.parse(readWorkspaceFile('miniprogram/app.json')) as {
      pages: string[]
      subpackages: Array<{ root: string; pages: string[] }>
    }
    const homeSource = readWorkspaceFile('miniprogram/pages/home/index.ts')
    const detailWxml = readWorkspaceFile('miniprogram/subpkg-trade/pages/detail/index.wxml')
    const detailWxss = readWorkspaceFile('miniprogram/subpkg-trade/pages/detail/index.wxss')

    expect(appConfig.subpackages).toContainEqual({
      root: 'subpkg-trade',
      name: 'trade',
      pages: ['pages/index/index', 'pages/detail/index'],
    })
    expect(homeSource).toContain("id: 'trade-goods'")
    expect(homeSource).toContain("route: '/subpkg-trade/pages/index/index'")
    expect(detailWxml).not.toContain('<scroll-view')
    expect(detailWxss).not.toMatch(/overflow-x\s*:\s*auto/)
  })

  it('projects the real wine record into a complete twelve-month port matrix', () => {
    const wine = getTradeDetail('trade0615')
    expect(wine?.name).toBe('葡萄酒')
    expect(wine?.salesMode).toBe('fixed-port')

    const rows = buildTradePortMatrix(wine!, getTradeReference(), 12)
    expect(rows.length).toBe(wine?.salesPortIds.length)
    expect(rows.every((row) => row.months.length === 12)).toBe(true)
    expect(rows.every((row) => row.months[11]?.isCurrent)).toBe(true)
  })
})
