# 查詢、圖片與浮層修復實施計畫

> **2026-10-03 銷項更新：** B1–B4／R07、R12–R14 的程式修復與正式回歸已完成，修復提交為 `4ac55f9`（已在 main）。完整 Node22 門禁本輪重跑通過：2443＋100 項測試。UI／設備驗收尚有缺口，不能標全案通過。
>
> 本文件下方保留原實施步驟及歷史勾選框；當前狀態以 [銷項記錄與驗收追蹤](../../audits/2026-10-03-review-repair-closeout.md) 為準。E 盤工作目錄已同步修復提交，現於 codex/phase-51-review-closeout；原 phase-50 取證工作樹保留。

> **給執行代理：** 使用 `superpowers:subagent-driven-development` 或 `superpowers:executing-plans` 逐任務執行；遵循總計畫全局約束與提交確認。最終 UI 驗收依賴 F1。

**目標：** 修復 R07、R12、R13、R14，保留既有查詢資訊架構與技能等級語義。

**架構：** 名鑑使用局部資料路徑更新，技能清單仍以 skillId 去重，但按關係保存兩種 kind 的持有者計數；頁面生命週期管理自己的 timer；技能詳情開啟時暫時收起選擇器。

**技術：** TypeScript、WXML、WXSS、Vitest、既有 DevTools；不新增依賴。

## B1：長名鑑圖片錯誤只更新旗標（R12）

**文件：** 修改 `miniprogram/pages/catalog/index.ts` 的 onPortraitError／onPortraitLayerError；修改 `tests/pages/catalog-page.test.ts`；補 `tools/miniprogram-review/scenarios/catalog-filter.json` 的圖片回退診斷證據或由既有工具事件診斷取圖。

**介面：** 保持事件 `currentTarget.dataset.index`／`layer`；只允許 `portraitFail` 及目前明確存在的 layer 欄位，先驗證整數 index 和範圍。內部 visibleRows 旗標仍需同步，不把任意 dataset.layer 拼成資料路徑。

- [ ] **紅燈：** 在現有 createPageInstance／onLoad fixture 逐批 loadMore 到 630 列，spy 最後一次 setData，觸發第一列圖片失敗；assert 路徑旗標及 byteLength，而不是只檢查 page.data 的值。對 frame／rarity／type layer 都參數化測試。

```ts
const updates = vi.spyOn(page, 'setData')
page.onPortraitError({ currentTarget: { dataset: { index: 0 } } } as WechatMiniprogram.BaseEvent)
const payload = updates.mock.calls.at(-1)![0]
expect(payload).toEqual({ 'visibleRows[0].portraitFail': true })
expect(Buffer.byteLength(JSON.stringify(payload))).toBeLessThan(1024 * 1024)
```

page 由該文件既有 createPageInstance 建立；onPortraitLayerError 加入測試介面，使用同一已完整載入的實例。另測非法 index、未知 layer 不呼叫 setData。

- [ ] 跑 `npm.cmd test -- tests/pages/catalog-page.test.ts`，確認整列重傳導致紅燈。
- [ ] 最小修復使用 `this.setData({ [\`visibleRows[${index}].portraitFail\`]: true })`；layer 使用允許集合，禁止整個 visibleRows 重傳。調整測試 setData harness，使路徑 patch 真正反映嵌套資料，不能只 Object.assign 字串 key。
- [ ] 綠燈並保護原分頁 payload 測試；DevTools 長列表觸發單圖 error，文字／捲動保留且圖片回退生效；final／verify 後提交確認。message：`fix: 局部更新名鑑圖片失敗狀態`。

## B2：大流行頁卸載清理分鐘 timer（R13）

**文件：** 修改 `miniprogram/subpkg-trade/pages/popularity/index.ts` 的 context／scheduleMinuteRefresh／生命週期；修改 `tests/pages/major-event-page.test.ts`；既有 major-event-forecast 場景及卸載診斷。

- [ ] **紅燈：** 使用既有 createPageInstance、store fixture 和 fake timers；onShow 啟動後只呼叫 onUnload（不能先 onHide），再推進兩分鐘，assert 沒新 setData 且 timer 數為 0。

```ts
vi.useFakeTimers()
try {
  const page = createPageInstance()
  page.onLoad()
  page.onShow()
  const updates = vi.spyOn(page, 'setData')
  page.onUnload()
  await vi.advanceTimersByTimeAsync(120_000)
  expect(updates).not.toHaveBeenCalled()
  expect(vi.getTimerCount()).toBe(0)
} finally {
  vi.useRealTimers()
}
```

測試的 MajorEventPageConfig 必須新增 `onUnload():void`；直接隱藏／重複卸載／兩次 onShow 各有案例。

- [ ] 跑該頁測試確認紅燈；在 page context 新增不送視圖的 `isPageVisible:boolean`。onShow 設 true，hide／unload 設 false 並 clearMinuteRefresh；排程前／callback 前都檢查此旗標。重複 onShow 先清舊 timer。
- [ ] 綠燈：返回前景即時刷新且只保留一個 timer。DevTools 使用 navigateBack 卸載，確認不持續刷新舊頁；final／verify 後提交確認。message：`fix: 卸載大流行頁時停止刷新排程`。

## B3：技能清單保存完整關係 kind（R14）

**文件：** 修改 `miniprogram/presenters/catalog-presenter.ts` 的 SkillCheckRowView／buildSkillCheckList／filterSkillCheckList／getOfficersForSkill；修改 catalog Controller／WXML 及局部 badge WXSS；修改 `tests/presenters/catalog-presenter.test.ts`、`tests/pages/catalog-page.test.ts`，新增 skill 模式驗收場景 `tools/miniprogram-review/scenarios/catalog-skill-kind.json`。

**選定 ViewModel：** 保留每個 skillId 一列；`kind` 改成 view 專用 `'active'|'passive'|'mixed'`，新增 `kindLabel`（主／被／主及被）、`officerCountByKind:{active:number;passive:number}`。all 的 officerCount 是持有者 union，不能將同一 officer 重複加總；active／passive 篩選投影對應計數和 badge。mixed 只存在於 ViewModel，不寫入 canonical relation.kind。

**簽名：** `getOfficersForSkill(skillId, catalog, kind: 'all'|'active'|'passive' = 'all')`。Controller 展開時傳目前技能 kind 篩選；切換 kind 清理舊展開狀態。category／text AND 篩選保持。

- [ ] **紅燈：** 兩個獨立 officer fixture 擁有同 skillId 但不同關係；all 應一列／兩位／mixed，active／passive 各一位，展開也只一位。

```ts
const base = getCatalog()[0]!
const sid = Object.keys(getSkills())[0]!
const catalog = [
  { ...base, id: 'officer_a', activeSkills: [sid], passiveSkills: [] },
  { ...base, id: 'officer_b', activeSkills: [], passiveSkills: [sid] },
]
const rows = buildSkillCheckList(catalog, getSkills())
expect(rows).toHaveLength(1)
expect(rows[0]).toMatchObject({ kind: 'mixed', officerCount: 2 })
expect(filterSkillCheckList(rows, 'passive', [], '')[0]!.officerCount).toBe(1)
expect(getOfficersForSkill(sid, catalog, 'passive').map((x) => x.officerId)).toEqual(['officer_b'])
```

測試明確 import Store 的現有 getCatalog／getSkills 只提供完整型別基底，active／passive 關係由上述合成 fixture 控制，不能依賴 E1 修正後的現況錯分類仍存在。

- [ ] 跑 Presenter／頁面測試確認紅燈；builder 使用每 skillId 的 active／passive owner Set，再投影計數／mixed。filter 回傳投影副本，不改 `_fullSkillCheckList`；getOfficersForSkill 按 kind 選相應關係。
- [ ] WXML badge 改讀 kindLabel，mixed 使用中性 Token；名鑑航海士列表的主／被分隔和技能 level 角標不改。補 all→passive→active、已展開再篩選、同 owner 去重回歸。
- [ ] DevTools 截圖三種篩選與持有者列表；final／verify 後提交確認。message：`fix: 保留技能清單的主被動關係與持有者計數`。

## B4：詳情開啟時暫時收起技能選擇器（R07）

**文件：** 修改 `miniprogram/pages/adventure-fleet/index.ts` 的 onSkillTap／onSheetDismiss／onReverseLookup；修改 `tests/pages/adventure-fleet-page.test.ts`；新增 `tools/miniprogram-review/scenarios/adventure-skill-picker-detail.json`。

**選定方案：** 避免全局提高 skill-sheet z-index 干擾其他彈窗；新增 UI 暫態 `resumeTargetPickerAfterSkillSheet:boolean`，開詳情時記錄原 pickerVisible 並收起，關閉詳情再恢復。searchText／選取／載入窗口不清空；reverseLookup 導航則清恢復旗標。

- [ ] **紅燈：** onAddTarget→onSkillTap 後 `sheetSkill` 非空且 `showTargetPicker=false`；onSheetDismiss 後 picker恢復，搜尋與選取仍相同；一般非 picker 技能詳情關閉不能凭空開 picker。

```ts
const wasPickerVisible = this.data.showTargetPicker
this.setData({
  sheetSkill: sheet,
  showTargetPicker: false,
  resumeTargetPickerAfterSkillSheet: wasPickerVisible,
})
```

上列取代 onSkillTap 最後的 setData；`sheet` 沿用既有 buildSkillSheet 結果。dismiss 將該旗標投影回 showTargetPicker，再清旗標；導航和頁面卸載清旗標。

- [ ] 跑冒險頁測試紅→綠；依審查的兩張 picker 診斷圖取得修復後真實截图，確認詳情可讀／關閉可按、返回後能繼續選擇；final／verify 後提交確認。message：`fix: 顯示技能詳情時暫時收起目標選擇器`。
