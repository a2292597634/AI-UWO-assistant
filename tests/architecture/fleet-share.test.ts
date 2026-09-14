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

  it('兩個頁面各只有一個固定入口並把畫布與預覽置於主滾動區外', () => {
    for (const relativePath of [
      'miniprogram/subpkg-fleet/pages/index/index.wxml',
      'miniprogram/pages/adventure-fleet/index.wxml',
    ]) {
      const wxml = read(relativePath)
      expect(wxml.match(/class="fleet-share-bar"/g)).toHaveLength(1)
      expect(wxml.match(/id="fleet-share-canvas"/g)).toHaveLength(1)
      expect(wxml).toContain('wx:if="{{proposalPreview === null}}"')
      const scrollEnd = wxml.lastIndexOf('</scroll-view>')
      expect(wxml.indexOf('class="fleet-share-bar"')).toBeGreaterThan(scrollEnd)
      expect(wxml.indexOf('<fleet-share-preview')).toBeGreaterThan(scrollEnd)
    }
  })

  it('方案預覽層必須位於固定分享欄之上，避免攔截底部確認按鈕', () => {
    const resultPreviewWxss = read('miniprogram/components/result-preview-sheet/index.wxss')
    const sharePreviewWxss = read('miniprogram/components/fleet-share-preview/index.wxss')
    const resultMaskZIndex = Number(
      resultPreviewWxss.match(/\.result-preview-sheet__mask\s*\{[\s\S]*?z-index:\s*(\d+)/)?.[1],
    )
    const resultSheetZIndex = Number(
      resultPreviewWxss.match(/\.result-preview-sheet\s*\{[\s\S]*?z-index:\s*(\d+)/)?.[1],
    )
    const undoBarZIndex = Number(
      resultPreviewWxss.match(/\.result-preview-sheet__undo-bar\s*\{[\s\S]*?z-index:\s*(\d+)/)?.[1],
    )
    const sharePreviewMaskZIndex = Number(
      sharePreviewWxss.match(/\.fleet-share-preview__mask\s*\{[\s\S]*?z-index:\s*(\d+)/)?.[1],
    )

    for (const relativePath of [
      'miniprogram/subpkg-fleet/pages/index/index.wxss',
      'miniprogram/pages/adventure-fleet/index.wxss',
    ]) {
      const wxss = read(relativePath)
      const shareBarZIndex = Number(
        wxss.match(/\.fleet-share-bar\s*\{[\s\S]*?z-index:\s*(\d+)/)?.[1],
      )
      expect(resultMaskZIndex).toBeGreaterThan(shareBarZIndex)
      expect(undoBarZIndex).toBeGreaterThan(shareBarZIndex)
      expect(resultSheetZIndex).toBeGreaterThan(shareBarZIndex)
      expect(sharePreviewMaskZIndex).toBeGreaterThan(resultSheetZIndex)

      const guardMaskZIndex = Number(
        wxss.match(/\.config-unsaved-guard__mask\s*\{[\s\S]*?z-index:\s*(\d+)/)?.[1],
      )
      const guardDialogZIndex = Number(
        wxss.match(/\.config-unsaved-guard__dialog\s*\{[\s\S]*?z-index:\s*(\d+)/)?.[1],
      )
      expect(wxss).toMatch(
        /\.config-unsaved-guard__dialog\s*\{[\s\S]*?position:\s*fixed[\s\S]*?top:\s*50%[\s\S]*?left:\s*50%/,
      )
      expect(guardDialogZIndex).toBeGreaterThan(guardMaskZIndex)
    }
  })

  it('Runtime 分享模組維持離線素材邊界並使用首頁入口字串', () => {
    const files = [
      'miniprogram/runtime/fleet-share-layout.ts',
      'miniprogram/runtime/fleet-share-renderer.ts',
      'miniprogram/presenters/fleet-share-presenter.ts',
    ]
    for (const file of files) {
      const source = read(file)
      expect(source).not.toMatch(/https?:\/\//)
      expect(source).not.toContain('wx.request')
      expect(source).not.toContain('wx.cloud')
      expect(source).not.toMatch(/from ['"]node:/)
    }
    expect(read('miniprogram/runtime/fleet-share-renderer.ts')).toContain(
      "'/assets/ui/mini-program-home-code.png'",
    )
    expect(read('miniprogram/contracts/fleet-share.ts')).toContain("'pages/home/index'")
  })

  it('Canvas 視覺層先鋪品質背景、再繪製頭像，並以分區底框區分技能', () => {
    const source = read('miniprogram/runtime/fleet-share-renderer.ts')
    const adventurePageSource = read('miniprogram/pages/adventure-fleet/index.ts')
    const battlePageSource = read('miniprogram/subpkg-fleet/pages/index/index.ts')
    expect(source.indexOf('const dimensions = getShareCanvasDimensions(layout)')).toBeLessThan(
      source.indexOf("const context = canvas.getContext('2d')"),
    )
    expect(adventurePageSource).toContain('getShareCanvasDimensions(layout)')
    expect(battlePageSource).toContain('getShareCanvasDimensions(layout)')
    const frameDraw = source.indexOf('drawImageFit(context, frame, visualRects.frame)')
    const portraitDraw = source.indexOf(
      'drawImageOptional(context, portrait, visualRects.portrait)',
    )

    expect(frameDraw).toBeGreaterThan(-1)
    expect(portraitDraw).toBeGreaterThan(frameDraw)
    expect(source).toContain('visualRects.rarity.x')
    expect(source).not.toContain("'主動技能 TOP 5'")
    expect(source).not.toContain("'戰鬥被動技能'")
    expect(source).toContain('COLORS.activePanel')
    expect(source).toContain('COLORS.passivePanel')
    expect(source).toContain('全艦冒險技能累計')
    expect(source).toContain('統計上方全部航海士的累計效果 · 只列出已選技能範圍')
    expect(source).toContain('`${group.officers.length} 人`')
  })
})
