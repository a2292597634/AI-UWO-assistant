import { describe, expect, it } from 'vitest'
import * as fs from 'node:fs'
import * as path from 'node:path'

describe('資料維護功能分包邊界', () => {
  it('維護專用技能分類 presenter 必須只存在於維護分包', () => {
    const mainPath = path.resolve('miniprogram/presenters/maintenance-skill-type-presenter.ts')
    const subpackagePath = path.resolve(
      'miniprogram/subpkg-maintenance/presenters/maintenance-skill-type-presenter.ts',
    )

    expect(fs.existsSync(mainPath)).toBe(false)
    expect(fs.existsSync(subpackagePath)).toBe(true)
  })

  it('正式路由只暴露錯誤回報、我的回報與管理員審核', () => {
    const app = JSON.parse(fs.readFileSync(path.resolve('miniprogram/app.json'), 'utf8')) as {
      pages: string[]
      subpackages: Array<{ root: string; pages: string[] }>
    }
    expect(app.pages).toContain('pages/officer-editor/index')
    const maintenance = app.subpackages.find(({ root }) => root === 'subpkg-maintenance')
    expect(maintenance?.pages).toEqual(['pages/work-orders/index', 'pages/work-order-review/index'])
    expect(app.subpackages.some(({ root }) => root === 'subpkg-submission')).toBe(false)
  })

  it('線上回報頁不暴露 canonical 編輯欄位且不直接修改 master data', () => {
    const page = fs.readFileSync('miniprogram/pages/officer-editor/index.ts', 'utf8')
    const wxml = fs.readFileSync('miniprogram/pages/officer-editor/index.wxml', 'utf8')
    expect(page).toContain('getOfficerErrorReportService')
    expect(page).not.toContain('data/master')
    expect(wxml).not.toContain('displayOrder')
    expect(wxml).not.toContain('新增航海士')
  })
})
