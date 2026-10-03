# 錯誤回報流程修復實施計畫

> **2026-10-03 銷項更新：** C1–C3／R08、R09、R11、R22 的程式修復與正式回歸已完成，修復提交為 `4ac55f9`（已在 main）。完整 Node22 門禁本輪重跑通過：2443＋100 項測試。UI／設備驗收尚有缺口，不能標全案通過。
>
> 本文件下方保留原實施步驟及歷史勾選框；當前狀態以 [銷項記錄與驗收追蹤](../../audits/2026-10-03-review-repair-closeout.md) 為準。E 盤工作目錄已同步修復提交，現於 codex/phase-51-review-closeout；原 phase-50 取證工作樹保留。

> **給執行代理：** 使用 `superpowers:subagent-driven-development` 或 `superpowers:executing-plans` 按 C1→C3 執行；遵循總計畫全局約束。動態 UI 驗收依賴 F1 的本地 fixture，不能連真實回報資料。

**目標：** 修復 R08、R09、R11、R22，使審核者讀到完整證據，篩選與狀態機一致。

**架構：** 保留現有 report model／history／revision／updatedAt。頁面请求保存所查狀態和序號；Presenter 整理原始與追加證據；服務端仍作 owner／admin／CAS 校驗。

**技術：** TypeScript、WXML／WXSS、现有 CloudBase adapter、Vitest；不新增依賴。

## C1：最後選取的篩選狀態主導列表（R09）

**文件：** 修改 `subpkg-maintenance/pages/work-order-review/index.ts`；修改 `tests/pages/work-order-review-page.test.ts`。TestPage 增加 activeStatus／onStatusTap／onUnload。现有 `loadPage():Promise<TestPage>` 和 `service.listAdmin` 可沿用。

- [ ] **紅燈：** pending deferred未回覆時切 accepted，accepted先回覆再pending回覆；最後 reports 只含accepted。再測pending空回覆、切回同狀態、unload後回覆。

```ts
const requestedStatus = this.data.activeStatus
const requestVersion = ++this.listRequestVersion
const records = await service.listAdmin(requestedStatus)
if (requestVersion !== this.listRequestVersion || requestedStatus !== this.data.activeStatus) return
```

實施時 service 使用既有 getOfficerErrorReportService()，requestVersion 存頁面私有字段且卸載時失效；移除阻止新狀態請求的 loading早退。catch／finally也按同一序號更新，不让舊請求清掉最新 loading。

- [ ] 跑 `npm.cmd test -- tests/pages/work-order-review-page.test.ts` 確認紅燈後修復；新狀態立即清舊 reports／selectedReportId，最新請求失敗顯示其 loadError，可重試。
- [ ] 綠燈加本地 fixture 延遲／錯誤場景截圖；final／verify後提交確認。message：`fix: 防止審核列表過期請求覆蓋目前篩選`。

## C2：展示完整原始與補充證據（R08）

**文件：** 修改 `miniprogram/presenters/officer-error-report-presenter.ts`（新增 evidence投影）、work-order-review 的 TS／WXML／WXSS；修改 `tests/presenters/officer-error-report-presenter.test.ts`、`tests/pages/work-order-review-page.test.ts`；新增 fixture場景 `tools/miniprogram-review/scenarios/error-report-review.json`。

**介面：** 新增 `buildErrorReportEvidence(report: OfficerErrorReport): readonly ErrorReportEvidence[]`。每項 `{id,text,sourceUrl,screenshotFileIds,createdAt,isOriginal}`：第一項用原description／supplement／sourceUrl／screenshots，後續按 supplements原順序。使用只讀新物件，絕不改 report 原始內容／history。

- [ ] **紅燈：** fixture含原始supplement＋一張圖、兩次補充（文字與純網址／純圖片）、空補充；assert投影次序、內容及原report不變。页测断言每張圖能触發實際 previewImage handler，不以模板含某單字代替完整展示。

```ts
export interface ErrorReportEvidence {
  id: string
  text: string
  sourceUrl: string
  screenshotFileIds: readonly string[]
  createdAt: string
  isOriginal: boolean
}
```

- [ ] 跑 Presenter／審核頁測試红→绿；WXML逐項顯示原始／第N次補充、時間、文字、網址、圖片縮略圖及失敗提示。preview只接受目前已載入report的fileId清單；runtime以现有cloud file圖片能力顯示，頁面不新增CloudBase呼叫／遠端常數。
- [ ] DevTools fixture確認管理員看到全部證據、長內容仍能選回報與處理。附件真ACL／owner綁定仍屬V1，這個UI修復不能宣稱檔案權限完成。
- [ ] final／verify及存原始report不變證據後提交確認。message：`fix: 在審核頁展示原始及歷次補充證據`。

## C3：補充非空聯集與管理員狀態規則（R11、R22）

**文件：** 修改 work-orders/index.ts、work-order-review/index.ts／WXML；修改 `miniprogram/domain/officer-error-report.ts` 及 `cloudfunctions/officer-maintenance/error-report-service.js`；測試 work-orders-page、work-order-review-page、domain/officer-error-report、cloudfunctions/officer-error-report-service。

**選定語義：** 文字、合法網址、截圖任一非空即可補交；needsInfo允許管理員再次requestInfo更新要求，新增history并保留原report／supplements，沿用CAS和admin权限。

- [ ] **紅燈：** 使用者三種單一內容分別成功、三者皆空拒絕、無效URL及>3圖拒絕；補充成功回pending；非owner不可補充。needsInfo admin requestInfo有合法reply成功，revision遞增、history追加且supplements不變；無reply、非admin、版本舊、fixed／rejected維持拒絕。

```ts
const hasContent = text.trim().length > 0 || sourceUrl.trim().length > 0 || screenshotCount > 0
expect(canTransitionErrorReport('needsInfo', 'requestInfo', 'admin')).toBe(true)
```

Controller以 `hasContent` 作非空門檻，其餘格式仍交既有 validator/server。服務端 requestReportInfo 的allowed statuses从 `['pending','accepted']` 改為 `['pending','needsInfo','accepted']`；不绕过current／admin／updateIfCurrent。

- [ ] 跑上述四組測試確認各紅燈後最小修改；本地fixture驗收「要求截圖→只交截圖→審核看到→再次要求补充」闭環。
- [ ] final／verify後提交確認。message：`fix: 統一回報補充內容與再次要求補充的規則`。
