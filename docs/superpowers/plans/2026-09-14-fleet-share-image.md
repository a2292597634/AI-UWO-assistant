# 配隊分享圖實現計畫

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在戰鬥與冒險配隊頁接入醒目的底部固定「分享隊伍」入口，依已確認的規格生成可預覽、可保存及可分享的繁體中文長圖。

**Architecture:** 用純函數 Presenter 將現有 `FleetState` 和 canonical 航海士／技能資料轉成戰鬥或冒險分享 View Model；獨立的 layout 模組只計算內容驅動的 Canvas 尺寸與繪製座標。頁面負責底部入口、未保存守衛、Canvas 節點協調、預覽狀態和微信保存／分享 API；分享預覽元件只負責展示與觸發事件。

**Tech Stack:** TypeScript、Vitest、微信小程序 WXML/WXSS、Canvas 2D、`wx.canvasToTempFilePath`、`wx.showShareImageMenu`、`wx.saveImageToPhotosAlbum`。

## Global Constraints

- 所有正式 UI 文字使用繁體中文；WXML/WXSS 類名使用英文 BEM 風格。
- 編碼前完整閱讀 `docs/superpowers/specs/2026-08-09-design-foundation-design.md`；新增樣式只使用其中的 Token、間距、圓角、陰影、按鈕和安全區規範。
- 不修改 `archive/`、`miniprogram/generated/` 或 `miniprogram/subpkg-fleet/generated/`；UI QR 原始素材按既有資產流水線放在 `data/master/ui-assets/original/`。
- 不新增依賴，不在小程序 Runtime 寫入 `wx.request`、`wx.cloud`、遠程 URL 字面量或 Node.js API。
- 技能累計只使用 canonical `level`，不得使用 `unlockLevel`；主動／被動只使用關係的 `kind`。
- 分享圖固定邏輯寬度 750px，Canvas 高度由內容計算；七艘船、每船 11 個位置及被動技能尾行不得裁切。
- 正式小程序首頁碼必須是本地素材 `miniprogram/assets/ui/mini-program-home-code.png`；缺少該素材時生成流程明確失敗，不生成無碼圖片。

---

## 文件結構與責任

| 文件 | 責任 |
| --- | --- |
| `miniprogram/contracts/fleet-share.ts` | 分享 View Model、技能條目、船位和生成狀態的型別契約 |
| `miniprogram/presenters/fleet-share-presenter.ts` | 戰鬥 TOP 5／被動篩選、冒險 SABC 分組、預設範圍技能累計和穩定排序 |
| `miniprogram/runtime/fleet-share-layout.ts` | 純函數布局測量、五欄技能行、七船與 QR 頁尾高度計算 |
| `miniprogram/runtime/fleet-share-renderer.ts` | Canvas 2D 素材載入、品質徽章裁切校準、繪製和降級報告 |
| `miniprogram/components/fleet-share-preview/index.{ts,wxml,wxss,json}` | 分享圖預覽層、關閉／分享／保存按鈕 |
| `miniprogram/assets/ui/mini-program-home-code.png` | 可掃描進入 `pages/home/index` 的本地小程序碼 |
| `miniprogram/presenters/config-management-presenter.ts` | 增加可被兩個頁面共用的 `PendingFleetAction` 型別（含 `share`） |
| `miniprogram/subpkg-fleet/pages/index/index.{ts,wxml,wxss,json}` | 戰鬥頁入口、守衛、生成、預覽和 Canvas 節點 |
| `miniprogram/pages/adventure-fleet/index.{ts,wxml,wxss,json}` | 冒險頁入口、守衛、生成、預覽和 Canvas 節點 |
| `tests/presenters/fleet-share-presenter.test.ts` | 純資料規則單元測試 |
| `tests/runtime/fleet-share-layout.test.ts` | 布局高度、五欄和不裁切契約 |
| `tests/pages/fleet-page.test.ts` | 戰鬥頁按鈕、守衛、生成和分享 API 測試 |
| `tests/pages/adventure-fleet-page.test.ts` | 冒險頁按鈕、守衛、生成和分享 API 測試 |
| `tests/architecture/fleet-share.test.ts` | 元件註冊、入口位置、Token、網路邊界和本地 QR 契約 |

### Task 1: 建立分享資料契約與純 Presenter

**Files:**
- Create: `miniprogram/contracts/fleet-share.ts`
- Create: `miniprogram/presenters/fleet-share-presenter.ts`
- Test: `tests/presenters/fleet-share-presenter.test.ts`

**Interfaces:**
- `buildBattleFleetShareViewModel(fleet: FleetState, officers: readonly RuntimeFleetOfficer[], skills: Readonly<Record<string, RuntimeSkill>>, configName: string, qrPath: string): BattleFleetShareViewModel`
- `buildAdventureFleetShareViewModel(fleet: FleetState, officers: readonly AdventureFleetOfficer[], skills: Readonly<Record<string, RuntimeSkill>>, configName: string, qrPath: string): AdventureFleetShareViewModel`
- `FleetShareOfficerView` 包含 `id`、`name`、`portraitPath`、`rarityName`、`visuals`、`shipId`、`slotIndex`。
- `BattleFleetShareShipView` 包含固定長度 11 的 `officerSlots`（空位為 `null`）、`activeSkills`、`passiveSkills`。
- `AdventureFleetShareViewModel` 包含 `groups`（只按 `S`、`A`、`B`、`C` 輸出）、`skills`、`presetRangeEmpty`。
- `FleetShareSkillView` 包含 `skillId`、`skillName`、`skillIconPath`、`kind`、`categoryId`、`totalLevel`。

- [ ] **Step 1: 寫失敗測試，先鎖定戰鬥資料規則**

在 `tests/presenters/fleet-share-presenter.test.ts` 建立最小 fixture：一艘含 11 個航海士的船、六個主動技能、四個戰鬥被動技能、一个非戰鬥被動技能；斷言只輸出主動綜合等級最高五項、被動只保留戰鬥分類且 `totalLevel >= 2`，同分按技能名再按 ID 排序，所有排序不使用 `unlockLevel`。

- [ ] **Step 2: 執行測試確認按預期失敗**

執行：`npx vitest run tests/presenters/fleet-share-presenter.test.ts`

預期：因 `fleet-share-presenter.ts` 和導出型別尚不存在而失敗；若測試因 fixture 或 import 錯誤報錯，先修正測試直到失敗原因是功能缺少。

- [ ] **Step 3: 寫冒險資料規則的失敗測試**

追加測試：跨兩艘船配置 S、A、B、C 航海士；第一艘船 targets 只含 `skill-a`、`skill-b`；所有已配置航海士的冒險關係都參與累計；`skill-b` 累計為零仍輸出 `Lv.0`；輸出按總等級降序，同分按技能名／ID；範圍外技能不輸出；組內維持艦隊船隻與位置順序。

- [ ] **Step 4: 寫最小 Presenter 實現**

在 `fleet-share-presenter.ts` 以 `Map` 累計關係的 canonical `level`，對無效或非有限 level 略過；戰鬥用 `isBattleFleetSkill` 判斷類別，主動取五項，被動保留戰鬥類別且累計至少二級；冒險以第一艘船的非空 target skill ID 建立範圍，對 `collectAllOfficerIds(fleet)` 的全部人累計，對範圍內缺少貢獻者的技能補零。所有排序使用「`totalLevel` 降序 → `skillName` 升序 → `skillId` 升序」。航海士視圖透過既有 `buildOfficerVisuals` 生成品質背景、品質徽章、類型圖標和性別素材路徑。

核心累計與排序保持純函數，後續 Renderer 只消費已排好序的資料：

```ts
const compareShareSkills = (a: FleetShareSkillView, b: FleetShareSkillView): number =>
  b.totalLevel - a.totalLevel || a.skillName.localeCompare(b.skillName) || a.skillId.localeCompare(b.skillId)

const addLevel = (totals: Map<string, number>, skillId: string, level: number): void => {
  if (!Number.isFinite(level) || level < 0) return
  totals.set(skillId, (totals.get(skillId) ?? 0) + level)
}
```

- [ ] **Step 5: 執行 Presenter 測試確認通過**

執行：`npx vitest run tests/presenters/fleet-share-presenter.test.ts`

預期：所有戰鬥與冒險規則測試通過。

- [ ] **Step 6: 提交純資料單元**

```powershell
git add miniprogram/contracts/fleet-share.ts miniprogram/presenters/fleet-share-presenter.ts tests/presenters/fleet-share-presenter.test.ts
git commit -m "feat: 建立配隊分享圖資料 presenter"
```

### Task 2: 建立純布局測量與 Canvas Renderer

**Files:**
- Create: `miniprogram/runtime/fleet-share-layout.ts`
- Create: `miniprogram/runtime/fleet-share-renderer.ts`
- Test: `tests/runtime/fleet-share-layout.test.ts`

**Interfaces:**
- `measureBattleFleetShare(view: BattleFleetShareViewModel, options?: ShareLayoutOptions): FleetShareLayout`
- `measureAdventureFleetShare(view: AdventureFleetShareViewModel, options?: ShareLayoutOptions): FleetShareLayout`
- `drawFleetShareImage(canvas: WechatMiniprogram.Canvas, view: FleetShareViewModel, layout: FleetShareLayout): Promise<ShareRenderReport>`
- `ShareRenderReport` 包含 `degradedAssetCount`、`fatalAssetMissing` 和 `failedAssetKinds`。

- [ ] **Step 1: 寫布局失敗測試**

在 `tests/runtime/fleet-share-layout.test.ts` 建立七艘船、每船 11 個 slot、主動五項、被動 16 項（四行五欄未滿一行）的 view；斷言 `measureBattleFleetShare` 的技能行為五欄、總高度包含四行被動技能和頁尾 QR 區，且最後內容底部小於總高度。建立冒險四個品質分組、多行技能的 fixture，斷言分組和技能區不重疊。

- [ ] **Step 2: 執行布局測試確認失敗**

執行：`npx vitest run tests/runtime/fleet-share-layout.test.ts`

預期：因布局模組尚不存在而失敗。

- [ ] **Step 3: 寫最小布局實現**

在 `fleet-share-layout.ts` 固定邏輯寬度 750px，使用 `padding=32`、`officerColumn=64`、`skillColumn=132`、`skillColumns=5` 和 `sectionGap=24`；技能行數使用 `Math.ceil(skillCount / 5)`，戰鬥先為每艘船測量航海士行、主動區、被動區，冒險先測量 S/A/B/C 分組再測量全艦技能區，最後統一加入頁尾和 180px QR 留白。返回每一個區塊的 y 座標、寬高和總高度，讓 renderer 不自行重新計算。

技能區高度計算使用固定欄數，不依賴內容名稱長度：

```ts
const skillRows = (count: number): number => Math.ceil(count / 5)
const skillSectionHeight = (count: number, rowHeight: number, gap: number): number => {
  const rows = skillRows(count)
  return rows === 0 ? 0 : rows * rowHeight + (rows - 1) * gap
}
```

- [ ] **Step 4: 寫 Renderer 最小實現**

在 `fleet-share-renderer.ts` 以 Canvas 2D `canvas.createImage()` 載入本地 UI、既有頭像／技能素材與 QR；素材失敗時使用人物／技能專用本地佔位圖並累加報告，QR 載入失敗設 `fatalAssetMissing=true`。清空畫布後按 layout 指令繪製海圖紙背景、墨綠頁首／頁尾、船區、五欄技能卡和 QR。

品質徽章使用既有 PNG 的實際非透明 bounds 做 source crop，再繪製到 32px 視覺尺寸（`grade_2` 至 `grade_5` 使用 `x=2,y=0,w=20,h=23`；`grade_6` 使用 `x=0,y=0,w=24,h=24`），避免把 60px PNG 畫布誤當成可見內容；類型圖標繪製為 18px，航海士名 22px 半粗體，技能名 20px 半粗體，累計等級以高對比 24px 膠囊繪製。所有文字通過單行省略函數，不改變 layout 高度。

- [ ] **Step 5: 執行布局測試確認通過**

執行：`npx vitest run tests/runtime/fleet-share-layout.test.ts`

預期：七船、四行被動技能、冒險多分組和 QR 頁尾均不裁切，五欄計算通過。

- [ ] **Step 6: 提交布局與 Renderer**

```powershell
git add miniprogram/runtime/fleet-share-layout.ts miniprogram/runtime/fleet-share-renderer.ts tests/runtime/fleet-share-layout.test.ts
git commit -m "feat: 新增配隊分享圖 canvas renderer"
```

### Task 3: 加入本地首頁碼與分享預覽元件

**Files:**
- Create: `miniprogram/assets/ui/mini-program-home-code.png`
- Create: `miniprogram/components/fleet-share-preview/index.ts`
- Create: `miniprogram/components/fleet-share-preview/index.wxml`
- Create: `miniprogram/components/fleet-share-preview/index.wxss`
- Create: `miniprogram/components/fleet-share-preview/index.json`
- Test: `tests/architecture/fleet-share.test.ts`

**Interfaces:**
- Component properties: `visible: boolean`、`imagePath: string`、`status: 'ready' | 'error'`、`errorMessage: string`、`degradedAssetCount: number`。
- Component events: `close`、`share`、`save`、`retry`。

- [ ] **Step 1: 加入並檢查正式首頁碼素材**

將產品提供的、指向 `pages/home/index` 的可掃描小程序碼保存為 `miniprogram/assets/ui/mini-program-home-code.png`；使用圖片檢查工具確認 PNG 可讀、非零尺寸、帶透明或白色留白，並在素材 manifest 中能被 `assets:manifest:check` 找到。Renderer 只接受這個本地路徑，不接受網路路徑。

- [ ] **Step 2: 寫架構契約測試確認元件缺失**

在 `tests/architecture/fleet-share.test.ts` 先斷言元件四個文件存在、WXML 含 `分享圖片`、`保存到相冊`、`關閉` 和四個事件、WXSS 使用 `env(safe-area-inset-bottom)`；同時斷言兩頁 JSON 尚未註冊元件以確認測試會失敗。

- [ ] **Step 3: 執行架構測試確認失敗**

執行：`npx vitest run tests/architecture/fleet-share.test.ts`

預期：因元件文件與頁面註冊尚不存在而失敗。

- [ ] **Step 4: 寫預覽元件**

以既有 `result-preview-sheet` 的浮層結構為基礎建立 `fleet-share-preview`：頂部顯示「分享圖預覽」與關閉；中間 `scroll-view` 用 `imagePath` 顯示長圖；若 `degradedAssetCount > 0` 顯示「部分素材未載入」；底部固定三個操作，`分享圖片`、`保存到相冊`、`關閉`，錯誤狀態顯示錯誤訊息和 `重試生成`。所有操作熱區至少 88rpx，頁尾 padding 使用 safe-area token。

元件最小 WXML 結構固定為：

```xml
<block wx:if="{{visible}}">
  <view class="fleet-share-preview__mask" bindtap="onClose"></view>
  <view class="fleet-share-preview" catchtap="onNoop" role="dialog" aria-label="分享圖預覽">
    <view class="fleet-share-preview__header">
      <text class="fleet-share-preview__title">分享圖預覽</text>
      <button class="fleet-share-preview__close" bindtap="onClose">關閉</button>
    </view>
    <scroll-view class="fleet-share-preview__content" scroll-y>
      <image wx:if="{{imagePath}}" src="{{imagePath}}" mode="widthFix" />
      <text wx:if="{{degradedAssetCount > 0}}" class="ui-status ui-status--review">部分素材未載入</text>
      <text wx:if="{{status === 'error'}}" class="ui-status ui-status--error">{{errorMessage}}</text>
    </scroll-view>
    <view class="fleet-share-preview__actions">
      <button class="ui-button ui-button--secondary" bindtap="onShare">分享圖片</button>
      <button class="ui-button ui-button--primary" bindtap="onSave">保存到相冊</button>
    </view>
  </view>
</block>
```

- [ ] **Step 5: 完成頁面 JSON 註冊並確認架構測試通過**

在戰鬥頁和冒險頁的 `index.json` 註冊 `fleet-share-preview`，再執行：`npx vitest run tests/architecture/fleet-share.test.ts`

預期：元件文件、WXML 事件、Token 和兩頁註冊契約通過。

- [ ] **Step 6: 提交素材與預覽元件**

```powershell
git add miniprogram/assets/ui/mini-program-home-code.png miniprogram/components/fleet-share-preview tests/architecture/fleet-share.test.ts miniprogram/subpkg-fleet/pages/index/index.json miniprogram/pages/adventure-fleet/index.json
git commit -m "feat: 新增配隊分享圖預覽元件"
```

### Task 4: 接入底部固定分享入口與未保存守衛

**Files:**
- Modify: `miniprogram/presenters/config-management-presenter.ts`
- Modify: `miniprogram/subpkg-fleet/pages/index/index.ts`
- Modify: `miniprogram/subpkg-fleet/pages/index/index.wxml`
- Modify: `miniprogram/subpkg-fleet/pages/index/index.wxss`
- Modify: `miniprogram/pages/adventure-fleet/index.ts`
- Modify: `miniprogram/pages/adventure-fleet/index.wxml`
- Modify: `miniprogram/pages/adventure-fleet/index.wxss`
- Modify: `tests/pages/fleet-page.test.ts`
- Modify: `tests/pages/adventure-fleet-page.test.ts`

**Interfaces:**
- `PendingFleetAction = PendingConfigAction | { type: 'share' }`。
- Page data: `shareStatus`、`shareImagePath`、`shareError`、`shareDegradedAssetCount`、`shareCanvasWidth`、`shareCanvasHeight`。
- Page handlers: `onShareFleet()`、`onSharePreviewClose()`、`onShareImage()`、`onSaveShareImage()`、`onShareRetry()`。

- [ ] **Step 1: 寫戰鬥頁入口與守衛的失敗測試**

在 `tests/pages/fleet-page.test.ts` 擴充 page interface 和 wx stub；斷言 WXML 的 `.fleet-share-bar` 位於主 `scroll-view` 之外，含 `分享當前隊伍`、`↗ 分享隊伍`、`bindtap="onShareFleet"` 和 `disabled="{{shareStatus === 'generating'}}"`。頁面測試斷言乾淨狀態點擊直接進入 `generating`，dirty 狀態顯示現有守衛且 `pendingAction.type === 'share'`；「直接生成」不改變 `configStatus` 或序列化 FleetState。

- [ ] **Step 2: 寫冒險頁入口與守衛的失敗測試**

在 `tests/pages/adventure-fleet-page.test.ts` 加入相同契約，並額外斷言冒險頁入口位於主滾動區外、頁面只保留一個分享入口；dirty 狀態的按鈕文案為「保存後生成」和「直接生成」，不使用「放棄修改」。

- [ ] **Step 3: 寫最小共享 pending action 改動**

在 `config-management-presenter.ts` 導出 `PendingFleetAction`；兩頁的 `FleetPageState.pendingAction` 改用該聯合型別。`resolvePendingAction` 增加 `case 'share'`，呼叫尚未改變頁面狀態的 `generateShareImage(page)`；`onUnsavedGuardSave` 在 share action 保存成功後再生成，`onUnsavedGuardDiscard` 在 share action 只清除守衛並生成，不把 `isDirty` 設為 false；取消則清除 pending action 並保留原狀態。WXML 依 `pendingAction.type === 'share'` 切換「保存後生成／直接生成」文案。

- [ ] **Step 4: 寫底部固定操作欄**

在兩頁 `index.wxml` 的主 `scroll-view` 後插入同一結構：`.fleet-share-bar`、左側 `.fleet-share-bar__copy`、右側 `ui-button ui-button--primary fleet-share-bar__button`；在兩頁 `index.wxss` 使用墨綠 Token 操作欄、黃銅唯一強調、`min-height: 88rpx`，並為 `.fleet-scroll` 增加等高底部 padding 及 `env(safe-area-inset-bottom)`，確保不遮擋第七船和技能尾行。生成中顯示「正在生成…」，錯誤狀態顯示「重試分享」。

兩頁共用同一段語義結構，僅替換左側上下文：

```xml
<view class="fleet-share-bar" role="region" aria-label="分享當前隊伍">
  <view class="fleet-share-bar__copy">
    <text class="fleet-share-bar__title">分享當前隊伍</text>
    <text class="fleet-share-bar__hint">生成可保存、可分享的長圖</text>
  </view>
  <button class="ui-button ui-button--primary fleet-share-bar__button"
    disabled="{{shareStatus === 'generating'}}" bindtap="onShareFleet">
    {{shareStatus === 'generating' ? '正在生成…' : shareStatus === 'error' ? '重試分享' : '↗ 分享隊伍'}}
  </button>
</view>
```

- [ ] **Step 5: 執行頁面入口測試確認通過**

執行：`npx vitest run tests/pages/fleet-page.test.ts tests/pages/adventure-fleet-page.test.ts`

預期：兩頁入口位置、disabled 狀態、dirty 守衛三分支和內容留白契約通過。

- [ ] **Step 6: 提交分享入口與守衛**

```powershell
git add miniprogram/presenters/config-management-presenter.ts miniprogram/subpkg-fleet/pages/index miniprogram/pages/adventure-fleet/index tests/pages/fleet-page.test.ts tests/pages/adventure-fleet-page.test.ts
git commit -m "feat: 接入配隊分享入口與未保存守衛"
```

### Task 5: 接入 Canvas 生成、預覽操作與微信 API

**Files:**
- Modify: `miniprogram/subpkg-fleet/pages/index/index.ts`
- Modify: `miniprogram/subpkg-fleet/pages/index/index.wxml`
- Modify: `miniprogram/pages/adventure-fleet/index.ts`
- Modify: `miniprogram/pages/adventure-fleet/index.wxml`
- Modify: `tests/pages/fleet-page.test.ts`
- Modify: `tests/pages/adventure-fleet-page.test.ts`

**Interfaces:**
- `generateShareImage(page: FleetPageLike): Promise<void>`（兩頁各自以正確 Presenter 建立 View Model）。
- `exportShareCanvas(page: FleetPageLike, canvas: WechatMiniprogram.Canvas, layout: FleetShareLayout): Promise<string>`。
- `buildShareViewModel(state: FleetPageState): FleetShareViewModel`、`selectShareCanvas(): Promise<WechatMiniprogram.Canvas>`、`resolveShareError(error: unknown): string` 由各頁的協調層提供，Renderer 不依賴頁面實例。

- [ ] **Step 1: 寫生成與預覽的失敗測試**

在兩個頁面測試中 stub `wx.createSelectorQuery().select('#fleet-share-canvas').node().exec` 返回 fake Canvas、stub `wx.canvasToTempFilePath` 返回 `wxfile://fleet-share.png`；斷言成功後 `shareStatus === 'ready'`、`shareImagePath` 有值、預覽元件資料可用。再測試 Canvas 導出失敗恢復 `shareStatus === 'error'` 且顯示重試文字；QR 素材失敗不得進入 ready。

- [ ] **Step 2: 執行測試確認失敗**

執行：`npx vitest run tests/pages/fleet-page.test.ts tests/pages/adventure-fleet-page.test.ts`

預期：因 `generateShareImage` 和 `onShareFleet` 尚未接入而失敗。

- [ ] **Step 3: 寫頁面生成協調**

`onShareFleet` 先攔截 `shareStatus === 'generating'`，再通過 `checkUnsavedAndProceed(this, { type: 'share' })`；`generateShareImage` 設定 generating、以目前 state 建立 View Model、透過 selector query 取得 2D Canvas、呼叫 `measure*`、設定 Canvas 寬高、呼叫 `drawFleetShareImage`，最後用 `wx.canvasToTempFilePath({ canvas, x: 0, y: 0, width: layout.width, height: layout.height, destWidth: layout.width * 2, destHeight: layout.height * 2, fileType: 'png' }, this)` 導出。成功時保存降級數量並設 ready，失敗時設 error 並保留現有 FleetState 和 dirty 狀態。

頁面協調順序固定為：

```ts
async function generateShareImage(page: FleetPageLike): Promise<void> {
  const state = getState(page)
  page.setData({ shareStatus: 'generating', shareError: null })
  try {
    const view = buildShareViewModel(state)
    const canvas = await selectShareCanvas()
    const layout = view.mode === 'battle'
      ? measureBattleFleetShare(view)
      : measureAdventureFleetShare(view)
    canvas.width = layout.width * 2
    canvas.height = layout.height * 2
    const report = await drawFleetShareImage(canvas, view, layout)
    if (report.fatalAssetMissing) throw new Error('小程序首頁碼素材缺失')
    const imagePath = await exportShareCanvas(page, canvas, layout)
    page.setData({ shareStatus: 'ready', shareImagePath: imagePath, shareDegradedAssetCount: report.degradedAssetCount })
  } catch (error) {
    page.setData({ shareStatus: 'error', shareError: resolveShareError(error) })
  }
}
```

- [ ] **Step 4: 接入預覽、保存和分享操作**

註冊 `fleet-share-preview` 並在主滾動區外傳入 `shareStatus`、`shareImagePath`、`shareError`、`shareDegradedAssetCount`；`onSaveShareImage` 調用 `wx.saveImageToPhotosAlbum({ filePath: shareImagePath })`，失敗時顯示「請在小程序設定中開啟相冊權限」；`onShareImage` 調用 `wx.showShareImageMenu({ path: shareImagePath, needShowEntrance: true, entrancePath: 'pages/home/index' })`，失敗時保留保存入口並提示「当前版本暂不支持直接分享，请先保存图片」；關閉只清理預覽路徑，不改變隊伍狀態；重試重新走 generating 流程。

- [ ] **Step 5: 執行頁面測試確認通過**

執行：`npx vitest run tests/pages/fleet-page.test.ts tests/pages/adventure-fleet-page.test.ts`

預期：生成、預覽、保存相冊、分享失敗、重試和未保存三分支全部通過。

- [ ] **Step 6: 提交 Canvas 與頁面協調**

```powershell
git add miniprogram/subpkg-fleet/pages/index miniprogram/pages/adventure-fleet/index tests/pages/fleet-page.test.ts tests/pages/adventure-fleet-page.test.ts
git commit -m "feat: 接入配隊分享圖生成與預覽"
```

### Task 6: 完整契約、門禁與微信驗收

**Files:**
- Modify: `tests/architecture/fleet-share.test.ts`
- Modify: `docs/superpowers/specs/2026-09-14-fleet-share-image-design.md`（只在驗收發現規格歧義時更新）

- [ ] **Step 1: 補齊架構契約**

斷言兩個頁面的 WXML 只有一個 `.fleet-share-bar`、入口位於 `</scroll-view>` 之後、操作欄使用 `ui-button` 和 Design Foundation Token；斷言 Runtime 檔案不存在 `wx.request`、`wx.cloud`、Node.js import 或遠程 URL 字面量；斷言 QR 路徑是 `/assets/ui/mini-program-home-code.png` 且 `entrancePath` 是 `pages/home/index`。

- [ ] **Step 2: 執行定向測試與格式檢查**

執行：

```powershell
npx prettier --check miniprogram/contracts/fleet-share.ts miniprogram/presenters/fleet-share-presenter.ts miniprogram/runtime/fleet-share-layout.ts miniprogram/runtime/fleet-share-renderer.ts miniprogram/components/fleet-share-preview/index.ts miniprogram/components/fleet-share-preview/index.wxml miniprogram/components/fleet-share-preview/index.wxss tests/presenters/fleet-share-presenter.test.ts tests/runtime/fleet-share-layout.test.ts tests/architecture/fleet-share.test.ts
npx vitest run tests/presenters/fleet-share-presenter.test.ts tests/runtime/fleet-share-layout.test.ts tests/architecture/fleet-share.test.ts tests/pages/fleet-page.test.ts tests/pages/adventure-fleet-page.test.ts
git diff --check
```

預期：格式、定向測試和 diff 檢查全部通過。

- [ ] **Step 3: 執行完整工程門禁**

執行：`npm run verify`

預期：format、lint、typecheck、全部 Vitest、runtime-network、包大小、素材 manifest、data check 和 generate check 全部通過；生成工具不得留下 `miniprogram/generated/` 差異。

- [ ] **Step 4: 微信 DevTools 驗收**

以七船案例打開戰鬥頁，確認底部固定欄始終可見、生成圖包含每船 11 個位置、主動 TOP 5、四行以上被動技能和 QR；以多品質案例打開冒險頁，確認 S/A/B/C 分組、預設範圍以外技能不出現、累計零顯示 `Lv.0`；在 320px、375px、393px、430px 寬度確認沒有橫向溢出、最後一行不被固定欄遮擋、航海士名／技能名／品質徽章可辨識。

- [ ] **Step 5: 真機驗收與交付前清單**

在至少一台 iOS 和一台 Android 真機掃描分享圖首頁碼，確認進入小程序首頁；測試素材失敗降級、Canvas 導出失敗、保存相冊拒絕、分享能力不可用和生成中重複點擊。完成後檢查 `git status --short` 只包含預期文件，展示變更文件、驗證結果和擬用 commit message，等待用戶確認後再提交最後整合 commit。
