import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const MAINTENANCE_WXML_FILES = [
  'work-order-editor/index.wxml',
  'work-order-review/index.wxml',
  'work-orders/index.wxml',
]

describe('維護頁 WXML 表達式語法', () => {
  it.each(MAINTENANCE_WXML_FILES)('%s 不在表達式中使用 HTML entity', (relativePath) => {
    const wxml = readFileSync(
      resolve(__dirname, '../../miniprogram/subpkg-maintenance/pages', relativePath),
      'utf8',
    )

    expect(wxml).not.toContain('&amp;&amp;')
  })
})
