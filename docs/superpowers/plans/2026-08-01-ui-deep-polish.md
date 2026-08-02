# 小程序 UI 深度美化 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 把首頁、航海士名冊、航海士詳情和技能資訊層統一改造成高質感的「古典航海資料館」，並讓原站頭像角標、即時篩選與 Lv.1–Lv.10 完整技能說明在本地離線運行。

**Architecture:** `archive/` 繼續唯讀；視覺等級與 UI 素材元資料寫入 `data/master/`，運行資料和圖片由確定性生成器投影到 `miniprogram/generated/`、`miniprogram/subpkg-detail/` 與 `miniprogram/assets/ui/`。頁面透過純 presenter 生成頭像疊圖路徑和技能等級模型；名冊與詳情共用 `skill-sheet` 元件。

**Tech Stack:** 微信小程式原生 TypeScript/WXML/WXSS、Node.js、Sharp、Vitest、AJV、ESLint、Prettier。

## Global Constraints

- 介面與資料只使用繁體中文。
- 開發分支固定為 `codex/phase-4-ui-deep-polish`。
- `archive/` 唯讀；只允許手工維護 `data/master/`，不得手工修改生成文件。
- 小程式運行時不得使用 `wx.request`、`wx.cloud`、遠端 URL 或 Node.js API。
- 不新增、刪除或升級依賴；圖片處理只使用已有的 `sharp`。
- 首頁橫幅 750×320 JPEG，目標 ≤120KB、硬上限 150KB；功能圖示 96×96 PNG、單個 ≤12KB。
- 原站 UI 小圖示合計 ≤80KB；本期新增主包視覺素材合計 ≤250KB。
- 不打包高解析主源、2×/3× 副本；不使用持續動畫、即時模糊、Canvas 粒子或自動輪播。
- 資料轉換、素材構建與技能等級模型採紅—綠—重構；UI 另用微信開發者工具驗證。
- 每次 commit 前展示變更文件、驗證結果和擬用 message，等待使用者確認。

---

## File Structure

- `tools/import/visual-grade.ts` 只負責來源視覺等級規則；遷移 CLI 不重複該規則。
- `tools/ui-assets/config.ts` 是素材處理配方唯一來源；builder 只執行配方、量測與預算檢查。
- `miniprogram/presenters/officer-visuals.ts` 集中管理本地角標路徑，頁面不拼路徑。
- `miniprogram/presenters/skill-sheet.ts` 集中管理十級完整說明，元件只負責呈現與事件。
- `miniprogram/components/skill-sheet/` 為名冊和詳情共用元件，兩個頁面不保留私有 tooltip 實作。
- `miniprogram/pages/home/`、`pages/catalog/`、`subpkg-detail/pages/detail/` 只管理各頁狀態、導覽和佈局。

---

### Task 1: 建立權威視覺等級欄位

**Files:**
- Create: `tools/import/visual-grade.ts`
- Create: `tools/import/migrate-visual-grades.ts`
- Modify: `tools/import/types.ts`
- Modify: `tools/import/transform-officers.ts`
- Modify: `data/schema/officers.schema.json`
- Modify: `data/master/officers.json`
- Modify: `tests/fixtures/canonical/officers.json`
- Test: `tests/import/visual-grade.test.ts`
- Test: `tests/import/transform-officers.test.ts`

**Interfaces:**
- Consumes: `SourceOfficer.rank`、`SourceOfficer.boss`。
- Produces: `VisualGradeId`、`deriveVisualGradeId(source)`、`CanonicalOfficer.visualGradeId`。

- [ ] **Step 1: 寫失敗測試**

```ts
expect(deriveVisualGradeId({ rank: '2' })).toBe('grade_2')
expect(deriveVisualGradeId({ rank: '5' })).toBe('grade_5')
expect(deriveVisualGradeId({ rank: '5', boss: 1 })).toBe('grade_6')
expect(() => deriveVisualGradeId({ rank: '99' })).toThrow('VISUAL_GRADE_UNSUPPORTED')
```

- [ ] **Step 2: 確認紅燈**

Run: `npx vitest run tests/import/visual-grade.test.ts`

Expected: FAIL，模組尚不存在。

- [ ] **Step 3: 實作唯一推導規則**

```ts
export type VisualGradeId = 'grade_2' | 'grade_3' | 'grade_4' | 'grade_5' | 'grade_6'

const NORMAL_GRADES: Record<string, VisualGradeId> = {
  '2': 'grade_2', '3': 'grade_3', '4': 'grade_4', '5': 'grade_5',
}

export function deriveVisualGradeId(source: { rank: string; boss?: number }): VisualGradeId {
  if (source.boss === 1) return 'grade_6'
  const grade = NORMAL_GRADES[source.rank]
  if (!grade) throw new Error(`VISUAL_GRADE_UNSUPPORTED: ${source.rank}`)
  return grade
}
```

將 `visualGradeId` 加入 canonical type、schema required 與 `transformOfficers()`；不得用 S/A/B/C 在運行時猜 Grade 6。

- [ ] **Step 4: 實作一次性主資料遷移**

`migrateVisualGrades(canonical, source)` 以 `sourceRefs.voyageTw` 對應唯讀來源，只更新 `visualGradeId`，保持順序和其他欄位不變；缺少來源時拋出 `VISUAL_GRADE_SOURCE_MISSING`。CLI 固定讀取 `archive/voyage-tw-2026052501/raw-data/json_char.js`，固定寫入 `data/master/officers.json`。

Run: `npx tsx tools/import/migrate-visual-grades.ts`

Expected: `chasT089.visualGradeId === 'grade_6'` 且 `rarityId === 'rarity_5'`。

- [ ] **Step 5: 跑綠燈與資料門禁**

Run: `npx vitest run tests/import/visual-grade.test.ts tests/import/transform-officers.test.ts tests/data-contract && npm run data:check`

Expected: PASS。展示結果和擬用 message `feat(data): add officer visual grades`，獲確認後才 commit。

---

### Task 2: 建立本地 UI 素材與體積門禁

**Files:**
- Create: `data/master/ui-assets/home-harbor-source.png`
- Create: `data/master/ui-assets/feature-officer-catalog-source.png`
- Create: `data/master/ui-assets/home-harbor.prompt.md`
- Create: `data/master/ui-assets/original/*.png`
- Modify: `data/master/assets.json`
- Modify: `data/schema/assets.schema.json`
- Modify: `tools/import/types.ts`
- Create: `tools/ui-assets/config.ts`
- Create: `tools/ui-assets/build-ui-assets.ts`
- Create: `data/audit/ui-asset-build-report.json`
- Generate: `miniprogram/assets/ui/*`
- Modify: `package.json`
- Test: `tests/ui-assets/build-ui-assets.test.ts`
- Test: `tests/data-audit/asset-metadata.test.ts`

**Interfaces:**
- Consumes: `data/master/ui-assets/` 本地主源與 `UiAssetRecipe[]`。
- Produces: `buildUiAssets(options): Promise<UiAssetBuildReport>` 和 `/assets/ui/` 運行圖片。

- [ ] **Step 1: 寫裁切、確定性與預算失敗測試**

```ts
const report = await buildUiAssets({ sourceRoot: fixtureRoot, outputRoot: outRoot })
const grade = report.files.find((file) => file.id === 'rarity-filter-grade-5')!
expect(grade.trimBounds).toEqual({ left: 2, top: 0, width: 20, height: 23 })
expect([grade.width, grade.height]).toEqual([29, 29])

await expect(buildUiAssets({ sourceRoot: oversizeRoot, outputRoot: outRoot }))
  .rejects.toThrow('UI_ASSET_BUDGET_EXCEEDED')

expect(first.files.map((file) => file.sha256))
  .toEqual(second.files.map((file) => file.sha256))
```

- [ ] **Step 2: 確認紅燈**

Run: `npx vitest run tests/ui-assets/build-ui-assets.test.ts`

Expected: FAIL，構建模組尚不存在。

- [ ] **Step 3: 使用 imagegen 技能生成原創主源**

先讀取並遵守 `imagegen` 技能。生成無文字的黃昏大航海港口橫幅，以及透明背景黃銅「航海士名鑑」徽章；不模仿在世藝術家，不複製遊戲截圖、人物和標誌。高品質主源與提示詞記錄留在 `data/master/ui-assets/`，不進運行包。

- [ ] **Step 4: 本地化原站圖示並記錄來源**

從以下固定 URL 模式下載 PNG：

```text
https://voyage.tw/img/common/uwo_bg_grade_{2..6}.png
https://voyage.tw/img/common/uwo_icon_grade_{2..6}.png
https://voyage.tw/img/common/uwo_icon_class_{1..3}.png
https://voyage.tw/img/common/gender_f.png
https://voyage.tw/img/common/gender_m.png
```

每條 master asset 記錄來源 URL、下載日期、原檔名、MIME、byteSize、SHA-256、寬高；`ownerType` 擴展為 `ui`，`kind` 擴展為 `ui-image`。下載只發生在開發階段。

- [ ] **Step 5: 實作確定性圖片處理**

```ts
export interface UiAssetRecipe {
  id: string
  source: string
  output: string
  mode: 'copy-png' | 'trim-rarity' | 'resize-png' | 'banner-jpeg'
  width?: number
  height?: number
  maxBytes: number
  group: 'banner' | 'feature' | 'original-ui'
}
```

橫幅使用 `resize(750, 320, { fit: 'cover' })` 和 JPEG quality 78/74/70/66 逐級壓縮；功能圖示輸出 96×96 palette PNG；篩選稀有度先依透明邊界 trim 再輸出 29×29；頭像稀有度角標保留原 60×60 透明畫布。依穩定 ID 排序輸出報告，任一硬預算超限即失敗。

- [ ] **Step 6: 加入命令並跑綠燈**

```json
"assets:ui": "tsx tools/ui-assets/build-ui-assets.ts --write",
"assets:ui:check": "tsx tools/ui-assets/build-ui-assets.ts --check"
```

Run: `npm run assets:ui && npm run assets:ui:check && npx vitest run tests/ui-assets tests/data-audit/asset-metadata.test.ts`

Expected: PASS；橫幅 ≤150KB、功能圖示 ≤12KB、原站 UI 合計 ≤80KB、新增主包視覺合計 ≤250KB。展示結果和擬用 message `feat(assets): add optimized nautical UI artwork`，獲確認後才 commit。

---

### Task 3: 建立共用技能底部資訊層

**Files:**
- Create: `miniprogram/presenters/skill-sheet.ts`
- Create: `miniprogram/components/skill-sheet/index.json`
- Create: `miniprogram/components/skill-sheet/index.ts`
- Create: `miniprogram/components/skill-sheet/index.wxml`
- Create: `miniprogram/components/skill-sheet/index.wxss`
- Modify: `miniprogram/contracts/runtime-data.ts`
- Modify: `tools/data-pipeline/build-runtime-data.ts`
- Test: `tests/presenters/skill-sheet.test.ts`
- Test: `tests/data-pipeline/build-runtime-data.test.ts`

**Interfaces:**
- Consumes: `RuntimeSkill { id, n, cat, cn, ip, d, li }` 與技能 kind。
- Produces: `buildSkillSheet(skill, kind): SkillSheetView`，其中 `levels` 恆為 10 行；元件觸發 `dismiss`、`reverselookup`。

- [ ] **Step 1: 寫完整等級句子失敗測試**

```ts
const rows = buildSkillLevelRows(
  '購買工藝品時，可以用減少1％的價格購買。',
  'Lv1: 1% | Lv2: 2.5% | Lv3: 3% | Lv4: 3.5% | Lv5: 5.5% | Lv6: 6% | Lv7: 6.5% | Lv8: 7% | Lv9: 7.5% | Lv10: 10%',
)
expect(rows).toHaveLength(10)
expect(rows[9]!.description).toBe('購買工藝品時，可以用減少10％的價格購買。')

const missing = buildSkillLevelRows('效果增加1%。', 'Lv1: 1%')
expect(missing[1]).toEqual({
  level: 2, label: 'Lv.2', description: '此等級暫無資料', missing: true,
})
```

另測試一句內兩個數值按來源順序替換，例如 12.6%/6.1% → 15.4%/8.2%。

- [ ] **Step 2: 確認紅燈**

Run: `npx vitest run tests/presenters/skill-sheet.test.ts`

Expected: FAIL，presenter 尚不存在。

- [ ] **Step 3: 實作解析與替換**

`parseLevelInfo()` 依 `|` 分級、依 `/` 保留數值順序；以 Lv.1 數值作模板 token，逐個替換當前等級 token，匹配半角/全角百分號並保留原句標點。只用明確來源值；缺少任一級固定輸出「此等級暫無資料」。

- [ ] **Step 4: 為 RuntimeSkill 增加分類名稱**

新增短欄位 `cn`；`buildSkills()` 由 `skillCategories` 字典投影繁體分類名。測試 `runtime['skill_skill200681'].cn` 非空。

- [ ] **Step 5: 實作共用元件**

元件使用底部 `scroll-view scroll-y`，顯示圖示、名稱、主動／被動、分類、完整說明與十個獨立 `.level-row`。遮罩關閉、內容阻止冒泡，反查文字固定為「查看擁有此技能的航海士」。只允許一次性 180ms transform/opacity 入場。

- [ ] **Step 6: 跑綠燈並準備檢查點**

Run: `npm run typecheck && npm run lint && npx vitest run tests/presenters/skill-sheet.test.ts tests/data-pipeline/build-runtime-data.test.ts`

Expected: PASS。展示結果和擬用 message `feat(ui): add shared skill detail sheet`，獲確認後才 commit。

---

### Task 4: 投影頭像邊框與角標路徑

**Files:**
- Create: `miniprogram/presenters/officer-visuals.ts`
- Modify: `miniprogram/contracts/runtime-data.ts`
- Modify: `tools/data-pipeline/build-runtime-data.ts`
- Modify: `miniprogram/presenters/catalog-presenter.ts`
- Modify: `miniprogram/subpkg-detail/runtime/detail-presenter.ts`
- Modify: `tests/data-pipeline/build-runtime-data.test.ts`
- Modify: `tests/presenters/catalog-presenter.test.ts`
- Modify: `tests/runtime/detail-presenter.test.ts`

**Interfaces:**
- Consumes: `visualGradeId`、`typeId`、`genderId`。
- Produces: `OfficerVisualPaths { framePath, rarityIconPath, typeIconPath, genderIconPath }`。

- [ ] **Step 1: 寫路徑失敗測試**

```ts
expect(buildOfficerVisuals({
  visualGradeId: 'grade_6', typeId: 'type_class_2', genderId: 'gender_f',
})).toEqual({
  framePath: '/assets/ui/uwo-bg-grade-6.png',
  rarityIconPath: '/assets/ui/uwo-icon-grade-6.png',
  typeIconPath: '/assets/ui/uwo-icon-class-2.png',
  genderIconPath: '/assets/ui/gender-f.png',
})
```

未知 type/gender 必須回傳空路徑，不得回傳 URL。

- [ ] **Step 2: 確認紅燈**

Run: `npx vitest run tests/presenters/catalog-presenter.test.ts tests/runtime/detail-presenter.test.ts`

Expected: FAIL，新欄位不存在。

- [ ] **Step 3: 更新緊湊運行契約**

`RuntimeCatalogEntry` 加 `visualGradeId`；`RuntimeDetailRecord` 加 `vg`、`ti`、`gi`。生成資料只保存 ID，不為每位航海士重複四個完整路徑。

- [ ] **Step 4: 實作純路徑 presenter**

所有路徑固定使用 `/assets/ui/`；catalog presenter 的 row 與 detail presenter 的 officer view 都加入 `visuals`。圖片失敗狀態仍與資料模型分離。

- [ ] **Step 5: 生成並驗證契約**

Run: `npm run data:generate && npx vitest run tests/data-pipeline/build-runtime-data.test.ts tests/presenters/catalog-presenter.test.ts tests/runtime/detail-presenter.test.ts tests/runtime-contract`

Expected: PASS。展示結果和擬用 message `feat(runtime): project officer visual assets`，獲確認後才 commit。

---

### Task 5: 重做首頁為可擴展功能港口

**Files:**
- Modify: `miniprogram/app.wxss`
- Modify: `miniprogram/pages/home/index.ts`
- Modify: `miniprogram/pages/home/index.wxml`
- Modify: `miniprogram/pages/home/index.wxss`
- Modify: `miniprogram/pages/home/index.json`

**Interfaces:**
- Consumes: `/assets/ui/home-harbor.jpg`、`feature-officer-catalog.png`、`getDatasetMeta()`。
- Produces: 四列資料驅動 `modules` 網格；目前只顯示「航海士名鑑」。

- [ ] **Step 1: 改成模組陣列**

```ts
modules: [{
  id: 'officer-catalog',
  name: '航海士名鑑',
  iconPath: '/assets/ui/feature-officer-catalog.png',
  route: '/pages/catalog/index',
}]
```

`onModuleTap` 只從 `data-route` 導航，未上線功能不加入陣列。

- [ ] **Step 2: 重寫首頁結構與樣式**

頂部 320rpx 橫幅使用 `aspectFill`，左上保留標題安全區；載入失敗顯示靜態墨綠—羊皮紙漸層。下方四列網格每項只顯示黃銅徽章與下方功能名；可見圖示約 96rpx，點擊熱區至少 112rpx。功能圖示失敗時顯示統一黃銅線稿 CSS 佔位，不使用 emoji。全域色為羊皮紙 `#e7deca`、炭墨綠 `#26332f`、黃銅 `#b99552`、正文 `#292a26`。

- [ ] **Step 3: 開發者工具驗證**

驗證 320/375/414 CSS px 等效寬度不溢出、標題不遮船、橫幅失敗仍可進名冊。截取正常態與降級態。

- [ ] **Step 4: 跑門禁並準備檢查點**

Run: `npm run typecheck && npm run lint && npm run check:runtime-network && npm run assets:ui:check`

Expected: PASS。展示截圖和擬用 message `feat(home): redesign nautical feature hub`，獲確認後才 commit。

---

### Task 6: 重做即時篩選與航海日誌名冊

**Files:**
- Modify: `miniprogram/pages/catalog/index.json`
- Modify: `miniprogram/pages/catalog/index.ts`
- Modify: `miniprogram/pages/catalog/index.wxml`
- Modify: `miniprogram/pages/catalog/index.wxss`
- Modify: `tests/presenters/catalog-presenter.test.ts`

**Interfaces:**
- Consumes: `CatalogRowView.visuals`、本地篩選圖示、`buildSkillSheet()`。
- Produces: 約 50px 高無框圖片篩選首行、約 58px 高列表行、`sheetSkill`。

- [ ] **Step 1: 以本地圖片取代 emoji**

`FilterOption = { id, name, iconPath, accessibilityLabel }`。稀有度使用裁切後 `uwo-icon-grade-{2..5}-filter.png`，類型和性別使用原站本地圖。不顯示類型/性別文字，但保留無障礙標籤。

- [ ] **Step 2: 保持即時篩選並壓縮首行**

保留 `toggleFilter → applyFilterUpdate → queryCatalog → setData(first page)`，不加抽屜、草稿、摘要行或「套用」。三組同列、細分隔線；選中 opacity 1 與輕陰影，未選 opacity .35；無圓點、膠囊背景和外框。切換四個頁籤保留組合條件。

- [ ] **Step 3: 加入頭像四層疊圖**

WXML 順序固定為邊框、人物、左上完整 60×60 稀有度透明畫布、左下類型。類型可見尺寸 24rpx（約 12px），左/下各內縮 4rpx。人物失敗顯示姓名首字；任一裝飾圖失敗只隱藏該層，不遮人物或文字。

- [ ] **Step 4: 壓縮列表並移除字母方塊**

行高目標 116rpx，頭像 88–92rpx；姓名/職業為主，技能圖示仍可點。移除 S/A/B/C 色塊，視覺等級由邊框和左上圖示承擔。無結果時顯示「清除篩選」，條件在點擊前保持。

- [ ] **Step 5: 接入共用 skill-sheet**

頁面 json 註冊元件；技能點擊呼叫 `buildSkillSheet(sk, kind)`。關閉只清空 sheet，反查沿用 `selectedSkillId` 並保持篩選、分頁和滾動上下文。

- [ ] **Step 6: 自動與 UI 回歸**

Run: `npx vitest run tests/domain tests/presenters/catalog-presenter.test.ts && npm run typecheck && npm run lint`

Expected: PASS。手動逐項確認稀有度、類型、性別、技能、語言、職業點擊後數量立即改變；技能層可滾至 Lv.10。

- [ ] **Step 7: 準備檢查點**

展示截圖和擬用 message `feat(catalog): polish filters and officer log`，獲確認後才 commit。

---

### Task 7: 重做技能優先人物卷宗詳情

**Files:**
- Modify: `miniprogram/subpkg-detail/pages/detail/index.json`
- Modify: `miniprogram/subpkg-detail/pages/detail/index.ts`
- Modify: `miniprogram/subpkg-detail/pages/detail/index.wxml`
- Modify: `miniprogram/subpkg-detail/pages/detail/index.wxss`
- Modify: `miniprogram/subpkg-detail/runtime/detail-presenter.ts`
- Modify: `tests/runtime/detail-presenter.test.ts`

**Interfaces:**
- Consumes: `DetailViewModel.visuals` 與共用 `skill-sheet`。
- Produces: 96px 頭像卷宗摘要、技能優先順序、統一技能層。

- [ ] **Step 1: 擴充失敗測試**

斷言 Grade 6 稀有度與 class 2 類型路徑正確；斷言從 shared skills bridge 建出的 sheet 有 category、description 和十級 rows。

- [ ] **Step 2: 確認紅燈**

Run: `npx vitest run tests/runtime/detail-presenter.test.ts`

Expected: FAIL，舊詳情沒有新視覺和 sheet 模型。

- [ ] **Step 3: 以卷宗摘要取代全寬人物圖**

左側約 192rpx 方形四層頭像，右側顯示姓名、職業、稀有度、類型、性別、國籍和語言摘要。人物圖只在方框內 `aspectFill`，不拉成橫幅。

- [ ] **Step 4: 改成技能優先順序**

依序顯示主動技能、被動技能、語言、招募資訊。技能卡突出圖示、名稱、目前等級和解鎖等級；招募資訊降低視覺權重。

- [ ] **Step 5: 刪除私有 tooltip 並接共用元件**

主動/被動技能都產生同一 `SkillSheetView`；反查跳轉 `/pages/catalog/index?skillId=...`；關閉後保持詳情滾動位置。

- [ ] **Step 6: 測試與 UI 回歸**

Run: `npx vitest run tests/runtime/detail-presenter.test.ts tests/runtime-contract && npm run typecheck && npm run lint`

Expected: PASS。驗證正常/失敗頭像、Grade 6、三種類型、長技能說明、Lv.10 滾動和反查。展示截圖和擬用 message `feat(detail): add skill-first officer dossier`，獲確認後才 commit。

---

### Task 8: 全鏈路生成、性能與發布前驗證

**Files:**
- Modify: `package.json`
- Modify: `tests/architecture/runtime-dependencies.test.ts`
- Modify: `tests/architecture/runtime-source-boundaries.test.ts`
- Create: `docs/superpowers/handoffs/2026-08-01-ui-deep-polish-handoff.md`
- Regenerate by command: `miniprogram/generated/*`
- Regenerate by command: `miniprogram/subpkg-detail/detail-*.js`, `details-*.js`
- Regenerate by command: `miniprogram/assets/ui/*`

**Interfaces:**
- Consumes: 所有前置任務。
- Produces: 可審核的離線小程式、完整驗證與包體記錄。

- [ ] **Step 1: 將素材門禁加入 verify**

把 `npm run assets:ui:check` 放在 runtime-network 後、data:check 前，讓缺檔、hash 漂移或超限阻止提交。

- [ ] **Step 2: 增加架構邊界測試**

斷言頁面不讀 `data/master` 或 `archive`；`miniprogram/assets/ui` 只有 config 已知輸出；運行文件不含 `http://`、`https://`、`wx.request`、`wx.cloud` 或 Node built-ins。

- [ ] **Step 3: 跑確定性生成**

Run: `npm run assets:ui && npm run data:generate && npm run assets:ui:check && npm run generate:check`

Expected: PASS，第二次生成無未解釋 diff。

- [ ] **Step 4: 跑完整門禁**

Run: `npm run verify`

Expected: format、lint、typecheck、test、runtime-network、素材、data:check、generate:check 全部 PASS。

- [ ] **Step 5: 三端核心路徑驗收**

在 Android、iOS、微信開發者工具驗證：首頁 → 名冊 → 稀有度/類型/性別即時篩選 → 四頁籤 → 技能層 Lv.10 → 反查 → 詳情 → 技能層 → 返回上下文。記錄設備、微信版本、主包/分包體積和截圖。

- [ ] **Step 6: 最終包體核對**

確認橫幅 ≤150KB、功能圖示 ≤12KB、原站 UI 合計 ≤80KB、新增主包視覺 ≤250KB，且無主源、2×/3× 或未裁切橫幅進包。

- [ ] **Step 7: 寫交接並準備最終提交**

交接記錄設計連結、生成命令、素材來源/hash、測試與實機結果、已知限制，以及後續功能如何複用四列入口。展示全部變更、`npm run verify` 摘要和擬用 message `feat: deliver phase 4 UI deep polish`，獲確認後才 commit。
