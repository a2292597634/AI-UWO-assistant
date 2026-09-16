# 配隊分享圖可讀性優化實現計畫

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 讓戰鬥與冒險配隊分享長圖在微信圖片預覽中更容易辨識，並移除完全空船造成的無效高度。

**Architecture:** Presenter 只負責從分享 View Model 移除沒有有效航海士的戰鬥船，保留部分空位與原始順序。Layout 以純函數計算戰鬥 6＋5 航海士網格、冒險四欄分組、五欄技能卡與空狀態的內容驅動高度；Renderer 只消費 Layout，僅繪製已配置航海士，使用品質背景框顏色區分品質、保留名鑑右下類型角標，並放大素材和文字，頁面生成流程保持不變。

**Tech Stack:** TypeScript、Vitest、微信小程序 Canvas 2D、WXML／WXSS 現有分享預覽流程。

## Global Constraints

- 所有正式 UI 文字使用繁體中文；WXML/WXSS 類名使用英文 BEM 風格。
- 編碼前完整閱讀 `docs/superpowers/specs/2026-08-09-design-foundation-design.md`；新增樣式只使用其中的 Token、間距、圓角、陰影、按鈕和安全區規範。
- 不修改 `archive/`、`data/master/`、`miniprogram/generated/` 或 `miniprogram/subpkg-fleet/generated/`。
- 不新增依賴，不在小程序 Runtime 寫入 `wx.request`、`wx.cloud`、遠程 URL 字面量或 Node.js API。
- 技能累計只使用 canonical `level`，不得使用 `unlockLevel`；主動／被動只使用關係的 `kind`。
- 分享圖維持 750px 邏輯寬度；戰鬥和冒險的每個可繪製內容、頁尾與 QR 均不得被裁切。
- 完全沒有有效航海士的戰鬥船不進入分享 View Model；View Model 仍保留固定 11 個槽位契約，但分享圖 Layout／Renderer 只繪製已配置航海士。
- 每個生產修改先有一個預期失敗的測試，觀察失敗後才寫最小實現；每個可提交階段須先向用戶展示變更文件、驗證結果和擬用 message。

---

### Task 1: 分享 View Model 過濾完全空船

**Files:**
- Modify: `miniprogram/presenters/fleet-share-presenter.ts:106-149`，在戰鬥船視圖建立後過濾沒有有效航海士的船。
- Test: `tests/presenters/fleet-share-presenter.test.ts:63-128`，補充完全空船、未知航海士 ID 和部分空位的回歸測試。

**Interfaces:**
- Consumes: 現有 `buildBattleFleetShareViewModel(fleet, officerList, skills, configName, qrPath)`。
- Produces: `BattleFleetShareViewModel.ships` 仍是 `BattleFleetShareShipView[]`，但只包含 `officerSlots.some(Boolean)` 的船；每個保留的船仍有長度 11 的 `officerSlots`。

- [ ] **Step 1: 寫失敗測試，鎖定空船篩選和位置保留**

在 `tests/presenters/fleet-share-presenter.test.ts` 的戰鬥 Presenter 測試中加入：

```ts
it('分享圖移除完全空船，但保留部分空位和原船順序', () => {
  const view = buildBattleFleetShareViewModel(
    fleetWithOfficers([[], ['o1', 'missing-officer'], []]),
    [runtimeOfficer('o1', [])],
    {},
    '空船篩選案例',
    '/qr.png',
  )

  expect(view.ships.map((ship) => ship.shipId)).toEqual(['ship-2'])
  expect(view.ships[0]!.shipLabel).toBe('2號船')
  expect(view.ships[0]!.officerSlots).toHaveLength(11)
  expect(view.ships[0]!.officerSlots.slice(0, 3).map((officer) => officer?.id ?? null)).toEqual([
    'o1',
    null,
    null,
  ])
})
```

- [ ] **Step 2: 執行測試確認它因功能缺少而失敗**

Run: `npx vitest run tests/presenters/fleet-share-presenter.test.ts -t "移除完全空船"`

Expected: FAIL，`view.ships` 仍包含 `ship-1` 和 `ship-3`；若出現 TypeScript 或 fixture 錯誤，先修正測試本身，直到失敗原因是未過濾空船。

- [ ] **Step 3: 寫最小 Presenter 實現**

在 `buildBattleFleetShareViewModel` 先建立船視圖，再用 `officerSlots.some(Boolean)` 過濾：

```ts
const ships = fleet.ships
  .map((ship) => buildBattleShip(ship, toOfficerMap(officerList), skills))
  .filter((ship) => ship.officerSlots.some(Boolean))

return {
  mode: 'battle',
  configName,
  ships,
  qrPath,
  entrancePath: ENTRANCE_PATH,
}
```

不要變更 `buildBattleShip` 的 11 槽建立方式，也不要改動技能累計 predicate。

- [ ] **Step 4: 執行 Presenter 測試確認綠燈**

Run: `npx vitest run tests/presenters/fleet-share-presenter.test.ts`

Expected: 該檔案所有測試通過，既有「只統計前 11 個位置」與主動／被動 canonical 分類測試不回歸。

- [ ] **Step 5: 提交前檢查並等待用戶確認**

Run: `git diff --check`。

向用戶展示本任務變更文件、測試輸出和擬用 message `feat: 分享圖移除完全空船`；收到確認後再提交本任務。

---

### Task 2: 重新計算航海士與技能布局

**Files:**
- Modify: `miniprogram/runtime/fleet-share-layout.ts:18-267`，新增兩列航海士座標、四欄分組／五欄技能座標、部分空位壓縮和戰鬥空狀態矩形。
- Test: `tests/runtime/fleet-share-layout.test.ts:1-135`，驗證 6＋5 座標、已配置航海士壓縮、五欄行數、空狀態和頁尾不重疊。

**Interfaces:**
- Consumes: Task 1 產生的 `BattleFleetShareViewModel`，以及現有 `AdventureFleetShareViewModel`。
- Produces: `FleetShareLayout` 新增 `emptyState: ShareRect | null`；`FleetShareShipLayout.officerRow` 依已配置人數計算，`officerSlots` 只輸出實際要繪製的航海士矩形。

- [ ] **Step 1: 寫戰鬥 6＋5 布局的失敗測試**

在現有戰鬥布局測試旁加入以下斷言，並把技能行數的期望改為五欄規則（5 個主動技能為 1 行、16 個被動技能為 4 行）：

```ts
const section = measureBattleFleetShare(battleView()).shipSections[0]!
const firstRow = section.officerSlots.slice(0, 6)
const secondRow = section.officerSlots.slice(6)

expect(firstRow.every((slot) => slot.y === firstRow[0]!.y)).toBe(true)
expect(secondRow.every((slot) => slot.y === secondRow[0]!.y)).toBe(true)
expect(secondRow[0]!.y).toBeGreaterThan(firstRow[0]!.y)
expect(secondRow[0]!.x).toBeGreaterThan(firstRow[0]!.x)
expect(secondRow[4]!.x).toBeLessThan(firstRow[5]!.x)
expect(section.officerRow.height).toBeGreaterThan(112)
expect(section.activeRows).toBe(2)
expect(section.passiveRows).toBe(6)
```

- [ ] **Step 2: 執行布局測試確認它按預期失敗**

Run: `npx vitest run tests/runtime/fleet-share-layout.test.ts -t "6＋5"`

Expected: FAIL，現有布局的部分空位仍會建立矩形，末行也尚未置中，技能卡行數與實際五欄需求不一致。

- [ ] **Step 3: 寫空狀態與五欄技能的失敗測試**

加入以下測試，使用 `ships: []` 的最小戰鬥 View Model：

```ts
it('全空戰鬥艦隊保留空狀態空間，頁尾位於其後', () => {
  const view = { ...battleView(), ships: [] }
  const layout = measureBattleFleetShare(view)

  expect(layout.emptyState).not.toBeNull()
  expect(layout.footer.y).toBeGreaterThan(
    layout.emptyState!.y + layout.emptyState!.height,
  )
  expect(layout.shipSections).toHaveLength(0)
})

it('技能布局固定使用五欄', () => {
  const layout = measureAdventureFleetShare({
    mode: 'adventure',
    configName: '五欄案例',
    qrPath: '/qr.png',
    entrancePath: 'pages/home/index',
    presetRangeEmpty: false,
    groups: [],
    skills: Array.from({ length: 9 }, (_, index) => skill(`skill-${index}`, 'passive')),
  })

  expect(layout.skillSection.skillRows).toBe(3)
})
```

- [ ] **Step 4: 執行新增測試確認它們因接口／布局缺少而失敗**

Run: `npx vitest run tests/runtime/fleet-share-layout.test.ts -t "全空戰鬥|五欄"`

Expected: FAIL，`emptyState` 尚未存在或技能 9 項仍未按五欄計算為 2 行。

- [ ] **Step 5: 寫最小 Layout 實現**

在 `fleet-share-layout.ts` 使用單一欄位計算 helper，保持坐標順序與布局責任集中：

```ts
const OFFICER_COLUMNS = 6
const GROUP_OFFICER_COLUMNS = 4
const OFFICER_ROW_GAP = 6
const OFFICER_SLOT_HEIGHT = 120
const SKILL_COLUMNS = 5
const SKILL_GAP = 6
const SKILL_SECTION_PADDING = 8
const SKILL_ROW_HEIGHT = 84
const SKILL_ROW_GAP = 6
const EMPTY_STATE_HEIGHT = 96
const SECTION_GAP = 16
const HEADER_HEIGHT = 100
const FOOTER_HEIGHT = 160
const QR_SIZE = 144
```

以 `Math.floor(index / columns)` 計算航海士行，以 `index % columns` 計算列內位置；戰鬥使用 6 欄，冒險品質分組使用 4 欄。戰鬥只按已配置航海士數量建立座標，部分末行置中；`makeSkillSection` 使用 `SKILL_COLUMNS = 5`，技能卡以 84px 高度容納兩行名稱。戰鬥沒有船時建立 `emptyState`，有船時設為 `null`；冒險布局明確回傳 `emptyState: null`。

- [ ] **Step 6: 執行布局測試確認綠燈**

Run: `npx vitest run tests/runtime/fleet-share-layout.test.ts`

Expected: 所有布局測試通過，並確認 `footer.y` 大於最後一個船區、技能區或空狀態的底部。

- [ ] **Step 7: 提交前檢查並等待用戶確認**

Run: `git diff --check`。

向用戶展示 `miniprogram/runtime/fleet-share-layout.ts` 和 `tests/runtime/fleet-share-layout.test.ts` 的變更、定向測試輸出和擬用 message `feat: 分享圖改用寬鬆網格布局`；收到確認後再提交本任務。

---

### Task 3: 放大 Canvas 文字／圖標並繪製空狀態

**Files:**
- Modify: `miniprogram/runtime/fleet-share-renderer.ts:25-165,300-404,602-689`，放大素材與字體、同步 QR／頁尾尺寸、加入空狀態繪製。
- Test: `tests/runtime/fleet-share-layout.test.ts:101-135`，將視覺矩形測試改為新尺寸並補足技能卡；`tests/runtime/fleet-share-renderer.test.ts:1-120`，驗證空狀態文字和既有素材降級。
- Modify: `tests/architecture/fleet-share.test.ts:102-143`，保護五欄與空狀態／本地 QR 契約。

**Interfaces:**
- Consumes: Task 2 的 `FleetShareLayout.emptyState`、按已配置數量建立的 `officerSlots` 和五欄技能卡矩形。
- Produces: `getOfficerVisualRects`、`getSkillCardLayout` 仍為純函數；`drawFleetShareImage` 在全空戰鬥 View Model 中繪製「尚未配置航海士」，並保留 `ShareRenderReport` 結構。

- [ ] **Step 1: 寫視覺尺寸和空狀態的失敗測試**

在 `tests/runtime/fleet-share-layout.test.ts` 把視覺 fixture 的期望改為新契約：

```ts
const visuals = getOfficerVisualRects({ x: 32, y: 120, width: 132, height: 128 })
expect(visuals.frame.width).toBe(84)
expect(visuals.frame.height).toBe(84)
expect(visuals.rarity.width).toBe(24)
expect(visuals.rarity.height).toBe(28)
expect(visuals.type.width).toBe(22)
expect(visuals.type.height).toBe(22)

const card = getSkillCardLayout({ x: 32, y: 200, width: 160, height: 84 })
expect(card.icon.width).toBe(36)
expect(card.icon.height).toBe(36)
expect(card.level.width).toBe(68)
expect(card.level.height).toBe(28)
expect(card.icon.y + card.icon.height).toBeLessThanOrEqual(card.name.y)
expect(card.level.y + card.level.height).toBeLessThanOrEqual(card.name.y)
```

在 `tests/runtime/fleet-share-renderer.test.ts` 增加一個空戰鬥 View Model，使用既有 `createCanvas(true)`，呼叫 `drawFleetShareImage` 後以實際繪製參數確認空狀態文字出現：

```ts
const emptyView: BattleFleetShareViewModel = {
  mode: 'battle',
  configName: '全空案例',
  ships: [],
  qrPath: '/qr.png',
  entrancePath: 'pages/home/index',
}
const canvas = createCanvas(true)
const layout = measureBattleFleetShare(emptyView)

await drawFleetShareImage(canvas, emptyView, layout)

expect(canvas.getContext('2d').fillText).toHaveBeenCalledWith(
  '尚未配置航海士',
  expect.any(Number),
  expect.any(Number),
  expect.any(Number),
)
```

- [ ] **Step 2: 執行測試確認它們按預期失敗**

Run: `npx vitest run tests/runtime/fleet-share-layout.test.ts tests/runtime/fleet-share-renderer.test.ts -t "84|尚未配置航海士"`

Expected: FAIL，現有技能卡仍不足以容納兩行名稱，徽章／圖標層級也尚未按新比例調整，且 Renderer 尚未繪製空狀態。

- [ ] **Step 3: 寫最小 Renderer 實現**

在 `fleet-share-renderer.ts` 調整視覺常量，保持 750px 邏輯坐標與既有倍率上限。頁首、頁尾與 QR 尺寸已由 Task 2 的 Layout 常量統一提供，不在 Renderer 重複定義：

```ts
const OFFICER_SIZE = 84
const SKILL_ICON_SIZE = 36
const SKILL_LEVEL_WIDTH = 68
const SKILL_LEVEL_HEIGHT = 28
const SKILL_CARD_INSET = 8
const SKILL_META_TOP = 6
const SKILL_NAME_GAP = 4
const SKILL_NAME_BOTTOM = 4
const SKILL_NAME_LINE_HEIGHT = 20
const FONT_OFFICER = '600 20px sans-serif'
const FONT_SKILL = '600 20px sans-serif'
const FONT_LABEL = '600 28px sans-serif'
const FONT_META = '500 22px sans-serif'
const FONT_LEVEL = '700 17px sans-serif'
```

實際 `HEADER_HEIGHT`、`FOOTER_HEIGHT` 和 `QR_SIZE` 由 `fleet-share-layout.ts` 對應使用，避免 Renderer 與 Layout 的高度常量分離。調整 `getOfficerVisualRects` 的頭像內縮比例與類型圖標錨點：品質不再繪製角標，改由 `framePath` 對應的背景框顏色表達；類型角標沿用航海士名鑑右下位置並完全位於 portrait rect 內，保留素材原始透明／彩色邊緣，不加白色底板。預載入只保留頭像、品質框、類型圖標與技能素材，不再載入品質角標。

新增只接受矩形的繪製 helper：

```ts
const drawEmptyState = (context: ShareContext, rect: ShareRect): void => {
  roundedRect(context, rect, 16, COLORS.paperAlt, COLORS.border)
  drawText(
    context,
    '尚未配置航海士',
    rect.x + 16,
    rect.y + rect.height / 2,
    rect.width - 32,
    FONT_LABEL,
    COLORS.green,
  )
}
```

在 `drawFleetShareImage` 的戰鬥分支中，先繪製 `layout.emptyState`（如果存在），再繪製船區；其餘素材載入、QR 缺失和導出前後流程保持原順序。

- [ ] **Step 4: 執行定向測試確認綠燈**

Run: `npx vitest run tests/runtime/fleet-share-layout.test.ts tests/runtime/fleet-share-renderer.test.ts`

Expected: 所有布局、Canvas 尺寸、素材逾時、素材降級和空狀態測試通過。

- [ ] **Step 5: 更新架構契約測試並執行**

在 `tests/architecture/fleet-share.test.ts` 保留本地 QR、離線邊界、品質背景先於頭像的既有斷言，新增下列靜態契約：

```ts
expect(source).toContain("const FONT_SKILL = '600 20px sans-serif'")
expect(source).toContain('尚未配置航海士')
expect(read('miniprogram/runtime/fleet-share-layout.ts')).toContain('const SKILL_COLUMNS = 5')
```

Run: `npx vitest run tests/architecture/fleet-share.test.ts`

Expected: 架構契約全部通過，沒有遠程 URL、`wx.request` 或 `wx.cloud`。

- [ ] **Step 6: 提交前檢查並等待用戶確認**

Run: `git diff --check`。

向用戶展示 Renderer、布局測試和架構測試變更、定向測試輸出和擬用 message `feat: 放大分享圖文字與圖標`；收到確認後再提交本任務。

---

### Task 4: 全量驗證與微信預覽驗收

**Files:**
- Inspect only: `miniprogram/subpkg-fleet/pages/index/index.ts`、`miniprogram/pages/adventure-fleet/index.ts`、兩頁現有測試與分享預覽元件，確認頁面仍使用同一套生成流程。
- Modify only if a test assertion directly描述舊五欄／空船輸出的契約：`tests/pages/fleet-page.test.ts`、`tests/pages/adventure-fleet-page.test.ts`、`tests/architecture/fleet-share.test.ts`。

**Interfaces:**
- Consumes: Tasks 1–3 的 Presenter、Layout、Renderer 行為。
- Produces: 不新增頁面 API；現有 `onShareFleet`、`wx.canvasToTempFilePath`、預覽、保存和分享操作保持相同。

- [ ] **Step 1: 執行所有分享相關測試**

Run:

```powershell
npx vitest run tests/presenters/fleet-share-presenter.test.ts tests/runtime/fleet-share-layout.test.ts tests/runtime/fleet-share-renderer.test.ts tests/architecture/fleet-share.test.ts tests/pages/fleet-page.test.ts tests/pages/adventure-fleet-page.test.ts
```

Expected: 所有分享相關測試通過，頁面測試仍確認乾淨分享不改變艦隊視圖、Canvas 等待尺寸與繪製完成、預覽保存／分享錯誤可恢復。

- [ ] **Step 2: 執行完整工程門禁**

Run:

```powershell
npm run verify
git diff --check
```

Expected: `format:check`、lint、typecheck、全量測試、runtime-network、素材、資料檢查和 generate:check 全部以 exit code 0 完成；`git diff --check` 沒有輸出。

- [ ] **Step 3: 執行可用的 DevTools 檢查**

Run: `npm run devtools:doctor`

若環境可連接微信 DevTools，使用現有分享驗收流程檢查以下案例：一艘有航海士其餘全空、多艘有航海士且含部分空位、冒險多品質分組、全空戰鬥艦隊。記錄 320px、375px、393px、430px 寬度下的文字、圖標、QR、頁尾與橫向溢出結果；若 DevTools 不可用，保留命令輸出並以 Vitest 和 Renderer 指令序列作為可重現驗證證據。

- [ ] **Step 4: 提交前展示總結並等待用戶確認**

展示：

```text
變更文件：git status --short 與 git diff --stat
驗證結果：定向 Vitest、npm run verify、git diff --check、DevTools doctor
擬用 message：feat: 優化配隊分享圖可讀性
```

收到用戶確認後才建立最終提交；提交前再次確認沒有 `archive/`、`data/master/`、`miniprogram/generated/`、Cloud Function 或無關文件變更。
