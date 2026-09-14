import { existsSync, readFileSync, statSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const root = resolve(__dirname, '../..')
const read = (relativePath: string): string => readFileSync(resolve(root, relativePath), 'utf8')

describe('配隊分享圖架構契約', () => {
  it('預覽元件具備四個操作事件與安全區樣式', () => {
    const wxml = read('miniprogram/components/fleet-share-preview/index.wxml')
    const wxss = read('miniprogram/components/fleet-share-preview/index.wxss')
    expect(existsSync(resolve(root, 'miniprogram/components/fleet-share-preview/index.ts'))).toBe(
      true,
    )
    expect(existsSync(resolve(root, 'miniprogram/components/fleet-share-preview/index.json'))).toBe(
      true,
    )
    expect(wxml).toContain('分享圖片')
    expect(wxml).toContain('保存到相冊')
    expect(wxml).toContain('關閉')
    expect(wxml).toContain('bindtap="onShare"')
    expect(wxml).toContain('bindtap="onSave"')
    expect(wxml).toContain('bindtap="onClose"')
    expect(wxml).toContain('bindtap="onRetry"')
    expect(wxss).toContain('env(safe-area-inset-bottom)')
  })

  it('首頁碼是非空 PNG 且兩個頁面註冊預覽元件', () => {
    const qrPath = resolve(root, 'miniprogram/assets/ui/mini-program-home-code.png')
    expect(existsSync(qrPath)).toBe(true)
    expect(statSync(qrPath).size).toBeGreaterThan(100)
    expect(read('miniprogram/pages/adventure-fleet/index.json')).toContain('fleet-share-preview')
    expect(read('miniprogram/subpkg-fleet/pages/index/index.json')).toContain('fleet-share-preview')
  })
})
