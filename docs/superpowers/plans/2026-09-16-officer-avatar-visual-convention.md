# 航海士頭像視覺規範 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (- [ ]) syntax for tracking.

**Goal:** 將航海士名鑒與戰鬥／冒險配隊分享圖的人物頭像統一為 voyage.tw 的滿格背景、左上稀有度覆蓋層與左下類型角標比例。

**Architecture:** 保留現有 OfficerVisualPaths 與分享 View Model，只在名鑒 WXSS 和分享 Renderer 的視覺座標層修正呈現。名鑒沿用既有 WXML 分層，分享圖由 getOfficerVisualRects 輸出四個素材矩形，Renderer 依固定順序繪製；不新增共用元件或資產。

**Tech Stack:** 微信小程序 WXML／WXSS、TypeScript、Canvas 2D、Vitest、Prettier、ESLint。

## Global Constraints

- 代碼註釋、文檔、與用戶的所有交互和回覆均使用中文；WXML/WXSS 類名維持英文 BEM 風格。
- 涉及 UI、WXML 或 WXSS 的任務，編碼前完整閱讀 docs/superpowers/specs/2026-08-09-design-foundation-design.md；新樣式遵守其中的 Token、間距、圓角、狀態、觸控和安全區規範。
- 只調整 archive/ → data/master/ → miniprogram/generated/ 之外的視覺層；不得修改 archive/、data/master/ 或 miniprogram/generated/。
- 禁止在 miniprogram/ Runtime 使用 wx.request、wx.cloud、遠程 URL 或 Node.js API。
- 禁止新增、刪除或升級依賴；禁止順手修復無關問題或格式化無關文件。
- 本次納入範圍只有航海士名鑒主列表、技能反查人物縮圖與生成的配隊分享長圖；不改配隊編輯頁的槽位、候選列、排除卡與貢獻者頭像。
- 參考基準是 60×60px：品質背景／人物／稀有度層滿格，類型層約 16/60，左下保留少量內縮。
- 修改 data/master/ 後才需要 npm run data:check；本次不修改資料源，但完整驗證仍執行 npm run verify。
- Commit 前必須展示變更文件、驗證結果與擬用 message，等待用戶確認；不得提交工作區既有的 review report 修改。

---

## File Map

| 文件 | 責任 | 本次變更 |
| --- | --- | --- |
| miniprogram/pages/catalog/index.wxss | 名鑒主列表與技能反查縮圖的分層尺寸和定位 | 稀有度層改為滿格左上；類型層改為左下 |
| miniprogram/runtime/fleet-share-renderer.ts | 分享圖素材矩形、預載與 Canvas 繪製 | 新增稀有度矩形與繪製；人物不再縮進；類型左下 |
| tests/pages/catalog-page.test.ts | 名鑒 WXML／WXSS 靜態契約 | 固定兩種名鑒頭像比例與錨點 |
| tests/runtime/fleet-share-layout.test.ts | 分享圖視覺矩形與布局契約 | 固定背景／人物／稀有度同矩形及左下類型比例 |
| tests/runtime/fleet-share-renderer.test.ts | 分享 Renderer 素材降級與實際繪製回歸 | 驗證素材缺失、超時、生成成功與四層 Canvas 行為 |
| tests/architecture/fleet-share.test.ts | 分享架構與離線邊界契約 | 將舊的「不繪製稀有度」斷言改為正向分層順序 |
| docs/superpowers/specs/2026-09-16-officer-avatar-visual-convention-design.md | 已核准的視覺設計規格 | 已提交，Commit 1869185 |

工作區目前另有 tests/miniprogram-review/cli.test.ts、tests/miniprogram-review/report.test.ts、tools/miniprogram-review/cli.ts 與 tools/miniprogram-review/report.ts 的既有修改；執行時只保留，不 stage，不重寫。

## Task 1: 先建立失敗的頭像視覺契約測試

**Files:**

- Modify: tests/pages/catalog-page.test.ts（在既有名鑒靜態契約區加入頭像分層測試）
- Modify: tests/runtime/fleet-share-layout.test.ts（更新 getOfficerVisualRects 契約）
- Modify: tests/architecture/fleet-share.test.ts（更新 Canvas 分層順序契約）
- Test: 同上三個測試文件

**Interfaces:**

- Consumes: 現有 cssRule() helper、getOfficerVisualRects()、drawFleetShareImage() 的 source contract。
- Produces: 供後續 WXSS／Renderer 實作通過的可執行紅測試；不修改 Runtime 資料接口。

- [x] **Step 1: 加入名鑒主列表與技能反查縮圖的 CSS 紅測試。**

在 tests/pages/catalog-page.test.ts 的 Design Foundation／技能入口測試後加入：

~~~ts
it('使用 voyage.tw 比例呈現名鑒人物角標', () => {
  for (const selector of [
    '.catalog-page__officer-rarity-icon',
    '.catalog-page__expanded-officer-rarity',
  ]) {
    expect(cssRule(selector)).toMatch(/top:\s*0;/)
    expect(cssRule(selector)).toMatch(/left:\s*0;/)
    expect(cssRule(selector)).toMatch(/width:\s*100%;/)
    expect(cssRule(selector)).toMatch(/height:\s*100%;/)
  }

  expect(cssRule('.catalog-page__officer-type-icon')).toMatch(/left:\s*var\(--uwo-space-1\);/)
  expect(cssRule('.catalog-page__officer-type-icon')).toMatch(/bottom:\s*var\(--uwo-space-1\);/)
  expect(cssRule('.catalog-page__officer-type-icon')).toMatch(/width:\s*28rpx;/)
  expect(cssRule('.catalog-page__officer-type-icon')).toMatch(/height:\s*28rpx;/)

  expect(cssRule('.catalog-page__expanded-officer-type')).toMatch(
    /left:\s*var\(--uwo-space-1\);/,
  )
  expect(cssRule('.catalog-page__expanded-officer-type')).toMatch(
    /bottom:\s*var\(--uwo-space-1\);/,
  )
  expect(cssRule('.catalog-page__expanded-officer-type')).toMatch(/width:\s*21rpx;/)
  expect(cssRule('.catalog-page__expanded-officer-type')).toMatch(/height:\s*21rpx;/)
})
~~~

- [x] **Step 2: 更新分享圖幾何測試，要求稀有度與背景同矩形、人物不縮進、類型左下。**

在 tests/runtime/fleet-share-layout.test.ts 將舊的「背景色／右下類型」測試改為：

~~~ts
it('航海士框沿用 voyage.tw 滿格分層與左下類型角標', () => {
  const visuals = getOfficerVisualRects({ x: 32, y: 120, width: 132, height: 128 })

  expect(visuals.frame.width).toBe(84)
  expect(visuals.frame.height).toBe(84)
  expect(visuals.portrait).toEqual(visuals.frame)
  expect(visuals.rarity).toEqual(visuals.frame)
  expect(visuals.type.width).toBe(22)
  expect(visuals.type.height).toBe(22)
  expect(visuals.type.x).toBe(visuals.frame.x + 4)
  expect(visuals.type.y + visuals.type.height).toBe(visuals.frame.y + visuals.frame.height - 4)
})
~~~

- [x] **Step 3: 把架構測試的舊負向斷言改成分層順序斷言。**

在 tests/architecture/fleet-share.test.ts 的 Canvas 視覺層測試中，保留 frameDraw 與 portraitDraw，新增並改成：

~~~ts
const rarityDraw = source.indexOf(
  'drawImageOptional(context, rarity, visualRects.rarity)',
)
const typeDraw = source.indexOf(
  'drawImageOptional(context, typeIcon, visualRects.type, true)',
)

expect(frameDraw).toBeGreaterThan(-1)
expect(portraitDraw).toBeGreaterThan(frameDraw)
expect(rarityDraw).toBeGreaterThan(portraitDraw)
expect(typeDraw).toBeGreaterThan(rarityDraw)
expect(source).toContain('rarityIconPath')
expect(source).toContain("add(officer.visuals.rarityIconPath, 'ui')")
expect(source).not.toContain('品質由 framePath 對應的背景框顏色表達，不再繪製品質角標')
~~~

- [x] **Step 4: 執行紅測試，確認它們確實指出目前的錯誤。**

Run:

~~~powershell
npx vitest run tests/pages/catalog-page.test.ts tests/runtime/fleet-share-layout.test.ts tests/architecture/fleet-share.test.ts
~~~

Expected: FAIL；名鑒目前的稀有度／類型定位不符合新契約，分享 Renderer 目前沒有 rarity 矩形與稀有度繪製。

## Task 2: 實作名鑒頭像的滿格稀有度層與左下類型層

**Files:**

- Modify: miniprogram/pages/catalog/index.wxss（只修改四個納入範圍的角標 selector）
- Test: tests/pages/catalog-page.test.ts

**Interfaces:**

- Consumes: 既有 WXML 的 item.visuals.rarityIconPath／typeIconPath 與固定尺寸的 officer-portrait、expanded-officer-visuals 容器。
- Produces: 名鑒主列表 104rpx 與技能反查 80rpx 頭像，均使用滿格稀有度覆蓋層和左下類型角標。

- [x] **Step 1: 只替換名鑒主列表角標規則。**

將 .catalog-page__officer-rarity-icon 和 .catalog-page__officer-type-icon 改為以下規則；移除舊的 right 定位。共用規則只放 position／z-index，讓兩個 selector 各自保留規格要求的左側錨點：

~~~wxss
.catalog-page__officer-rarity-icon,
.catalog-page__officer-type-icon {
  position: absolute;
  z-index: 2;
}

.catalog-page__officer-rarity-icon {
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
}

.catalog-page__officer-type-icon {
  left: var(--uwo-space-1);
  bottom: var(--uwo-space-1);
  width: 28rpx;
  height: 28rpx;
}
~~~

- [x] **Step 2: 只替換技能反查縮圖角標規則。**

將 .catalog-page__expanded-officer-rarity 和 .catalog-page__expanded-officer-type 改為以下規則；共用規則只放 position／z-index：

~~~wxss
.catalog-page__expanded-officer-rarity,
.catalog-page__expanded-officer-type {
  position: absolute;
  z-index: 2;
}

.catalog-page__expanded-officer-rarity {
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
}

.catalog-page__expanded-officer-type {
  left: var(--uwo-space-1);
  bottom: var(--uwo-space-1);
  width: 21rpx;
  height: 21rpx;
}
~~~

- [x] **Step 3: 執行名鑒定向測試與格式檢查。**

Run:

~~~powershell
npx vitest run tests/pages/catalog-page.test.ts
npx prettier --check miniprogram/pages/catalog/index.wxss tests/pages/catalog-page.test.ts
~~~

Expected: PASS；名鑒契約確認稀有度滿格左上、類型左下，既有人物回退與技能點擊測試不變。

## Task 3: 實作分享圖 Renderer 的四層人物繪製

**Files:**

- Modify: miniprogram/runtime/fleet-share-renderer.ts
- Verify: tests/runtime/fleet-share-layout.test.ts（Task 1 已建立的分享幾何契約）
- Modify: tests/runtime/fleet-share-renderer.test.ts（補充實際素材預載與 Canvas 四層行為契約）
- Verify: tests/architecture/fleet-share.test.ts（Task 1 已建立的 Canvas 分層契約）
- Test: 上述三個分享測試文件

**Interfaces:**

- Consumes: FleetShareOfficerView.visuals 的既有 framePath、rarityIconPath、typeIconPath。
- Produces: OfficerVisualRects { frame, portrait, rarity, type }；drawFleetShareImage() 仍返回既有 ShareRenderReport。

- [x] **Step 1: 先擴充 OfficerVisualRects 和幾何計算。**

在 miniprogram/runtime/fleet-share-renderer.ts 保留 OFFICER_SIZE = 84，將類型比例抽成基準常數，並讓人物與稀有度共用完整人物格：

~~~ts
const REFERENCE_TILE_SIZE = 60
const TYPE_ICON_RATIO = 16 / REFERENCE_TILE_SIZE
const TYPE_ICON_OFFSET = 4

export interface OfficerVisualRects {
  frame: ShareRect
  portrait: ShareRect
  rarity: ShareRect
  type: ShareRect
}

export const getOfficerVisualRects = (rect: ShareRect): OfficerVisualRects => {
  const frameSize = Math.min(OFFICER_SIZE, Math.max(0, rect.width))
  const frame = {
    x: rect.x + (rect.width - frameSize) / 2,
    y: rect.y + 4,
    width: frameSize,
    height: frameSize,
  }
  const typeSize = Math.min(frameSize, Math.round(frameSize * TYPE_ICON_RATIO))

  return {
    frame,
    portrait: frame,
    rarity: frame,
    type: {
      x: frame.x + TYPE_ICON_OFFSET,
      y: frame.y + frame.height - typeSize - TYPE_ICON_OFFSET,
      width: typeSize,
      height: typeSize,
    },
  }
}
~~~

刪除不再使用的 FRAME_INSET；不要改動 FleetShareLayout、技能卡或 Canvas 倍率計算。

- [x] **Step 2: 在 drawOfficer() 中按四層順序繪製。**

保留背景缺失時的既有深色回退，將人物段落改為：

~~~ts
const frame = images.get(officer.visuals.framePath)
if (frame) drawImageFit(context, frame, visualRects.frame)
else roundedRect(context, visualRects.frame, 8, COLORS.ink)

const portrait = images.get(officer.portraitPath)
drawImageOptional(context, portrait, visualRects.portrait)
if (!portrait) drawPlaceholder(context, visualRects.portrait, officer.name, COLORS.paperAlt)

const rarity = images.get(officer.visuals.rarityIconPath)
drawImageOptional(context, rarity, visualRects.rarity)

const typeIcon = images.get(officer.visuals.typeIconPath)
drawImageOptional(context, typeIcon, visualRects.type, true)
~~~

稀有度層缺失時不新增致命錯誤；類型與稀有度都維持既有 ui 降級分類。

- [x] **Step 3: 把稀有度素材加入戰鬥與冒險的 UI 預載。**

在兩個 officer 預載循環中，緊接 framePath 後加入：

~~~ts
add(officer.visuals.rarityIconPath, 'ui')
~~~

不要改 localAssetPath() 的離線邊界、QR 預載分類或 ShareRenderReport 欄位。

- [x] **Step 4: 更新 Renderer 註釋並執行分享定向測試。**

將舊的「品質由背景表達、不繪製品質角標」註釋改成描述四層順序，然後執行：

~~~powershell
npx vitest run tests/runtime/fleet-share-layout.test.ts tests/runtime/fleet-share-renderer.test.ts tests/architecture/fleet-share.test.ts
npm run typecheck
~~~

Expected: PASS；幾何、Canvas 分層、素材超時、QR 缺失和 UI 降級測試全部通過，且 Runtime 網路邊界沒有新增引用。

## Task 4: 完整驗證、視覺檢查與提交前審計

**Files:**

- Verify: miniprogram/pages/catalog/index.wxss
- Verify: miniprogram/runtime/fleet-share-renderer.ts
- Verify: tests/pages/catalog-page.test.ts
- Verify: tests/runtime/fleet-share-layout.test.ts
- Verify: tests/runtime/fleet-share-renderer.test.ts
- Verify: tests/architecture/fleet-share.test.ts

**Interfaces:**

- Consumes: Tasks 1–3 的測試與實作。
- Produces: 可交付的頭像視覺修正；不包含工作區既有 review report 修改。

- [x] **Step 1: 執行完整工程驗證。**

Run:

~~~powershell
npm run verify
git diff --check
~~~

Expected: 兩個命令均成功；generate:check 不產生 miniprogram/generated/、data/master/ 或其他生成資產差異。

- [x] **Step 2: 執行微信 DevTools 可用性檢查。**

Run:

~~~powershell
npm run devtools:doctor
~~~

若 doctor 回報已連接微信開發者工具，使用名鑒頁檢查 320px、375px、393px、430px 寬度：主列表稀有度徽章位於左上、類型徽章位於左下、背景色依 S／A／B／C 素材顯示，且沒有裁切或頁面級橫向溢出。再以一個戰鬥分享圖和一個冒險分享圖檢查四層順序；若環境沒有 DevTools，記錄為環境不可用，不能以此理由改動功能範圍。

- [x] **Step 3: 審計變更範圍。**

Run:

~~~powershell
git status --short
git diff --name-only
git diff --stat
~~~

Expected: 本次允許的實作／測試文件集合只有六個，實際差異可少於六個（Renderer 回歸測試若無需調整則保持無差異）；已提交的設計規格保持在 Commit 1869185；archive/、data/master/、miniprogram/generated/、Cloud Function、Controller、Presenter、Domain、Solver 沒有本次新增差異。工作區既有 review report 文件仍保持其原始修改狀態。

- [x] **Step 4: 提交前展示並等待用戶確認。** 已獲確認並提交 `b3f5a42`。

先向用戶展示變更文件、npm run verify 結果、git diff --check 結果與 DevTools 結果；得到確認後只 stage 本次文件：

~~~powershell
git add -- miniprogram/pages/catalog/index.wxss miniprogram/runtime/fleet-share-renderer.ts tests/pages/catalog-page.test.ts tests/runtime/fleet-share-layout.test.ts tests/runtime/fleet-share-renderer.test.ts tests/architecture/fleet-share.test.ts
git diff --cached --name-status
git commit -m 'feat: 統一航海士頭像角標分層'
~~~

Expected: git diff --cached --name-status 不包含 review report 文件、設計規格或生成資料；commit message 使用 feat: 統一航海士頭像角標分層。

## Self-Review Checklist

- 規格中的四層順序、名鑒兩種尺寸、分享圖 84px 邏輯格、16/60 類型比例、降級語義與非目標均有對應 Task 1–3。
- 沒有新增 OfficerVisualPaths 字段、View Model 字段、依賴、素材或 Runtime 網路 API。
- 沒有引用未定義的函式；後續測試使用現有 cssRule、getOfficerVisualRects、source.indexOf 與 drawFleetShareImage。
- 沒有佔位符或空泛步驟，每個實作步驟都有明確文件、命令與驗收結果。
- 完整驗證與提交前人工確認均在 Task 4，且不會覆蓋工作區既有修改。
