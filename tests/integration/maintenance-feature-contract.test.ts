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
})
