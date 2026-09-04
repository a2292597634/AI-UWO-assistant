import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const ROOT = resolve(__dirname, '../..')
const read = (file: string): string =>
  readFileSync(
    resolve(ROOT, 'miniprogram/subpkg-submission/pages/officer-submissions', file),
    'utf8',
  )

describe('我的投稿頁契約', () => {
  it('展示投稿狀態與駁回原因，並提供重新提交入口', () => {
    const wxml = read('index.wxml')
    const page = read('index.ts')
    expect(wxml).toContain('item.statusLabel')
    expect(wxml).toContain('駁回原因')
    expect(wxml).toContain('修改後重提')
    expect(page).toContain('/subpkg-submission/pages/officer-review-detail/index')
    expect(page).toContain('listMine()')
  })
})
