# 兌換碼結果與玩家綁定修復實施計畫

> **2026-10-03 銷項更新：** D1／R10、R21、R23 的程式修復與正式回歸已完成，修復提交為 `4ac55f9`（已在 main）。完整 Node22 門禁本輪重跑通過：2443＋100 項測試。UI／設備驗收尚有缺口，不能標全案通過。
>
> 本文件下方保留原實施步驟及歷史勾選框；當前狀態以 [銷項記錄與驗收追蹤](../../audits/2026-10-03-review-repair-closeout.md) 為準。E 盤工作目錄已同步修復提交，現於 codex/phase-51-review-closeout；原 phase-50 取證工作樹保留。

> **給執行代理：** 使用 `superpowers:subagent-driven-development` 或 `superpowers:executing-plans` 執行 D1；遵循總計畫全局約束，UI驗收使用F1本地fixture，禁止真實兌換。

**目標：** 一次修復 R10、R21、R23，使玩家、請求及結果關聯一致，保留已知失敗和結果未知的差別。

**架構：** 提交時保存不可變玩家快照／請求序號；提交期間按鈕及handler雙層鎖定切換；onShow選取變化清過期結果。typed error code維持至Presenter，transport失敗用已有未知結果指引。

**技術：** TypeScript、WXML、Vitest及既有CouponRedemptionError；無依賴／官方API改動。

## D1：玩家綁定、失敗代碼與未知指引

**文件：** 修改 `miniprogram/subpkg-coupon/pages/redemption/index.ts`、index.wxml、必要的局部結果WXSS；修改 `runtime/coupon-redemption-service.ts`；測試 pages/coupon-redemption-page、runtime/coupon-redemption-service、coupon-redemption/coupon-redemption-presenter。補coupon-visual場景watchPaths及可見结果fixture。

**資料：** 新增UI `resultProfile:{id,name,gameServerId,userNo}|null`；提交開始時复制当前profile。結果旁顯示本次玩家／伺服器；onShow檢測profile身分字段變更時清除舊result／resultProfile。onUnload使request序號失效，舊回應不能更新新頁。

- [ ] **紅燈：** 使用現有 createPageInstance／seedProfile／mockCallFunction 建 deferred提交，呼叫 onOpenSettings 時 navigateTo不發出。透過storage fixture把A換B後onShow，A遲回覆不得顯示成B結果。成功後切B也清A結果；同一A無變更的onShow可保留。
- [ ] **錯誤紅燈：** 參數化coupon-used／coupon-expired／user-invalid／rate-limited，assertlabel「兌換失敗」及各原message；unknown／callFunction rejection均label「需復核」及先確認文案。以mock次數證明每次提交只呼叫一次，無retry。

```ts
onOpenSettings() {
  if (this.data.isSubmitting) return
  wx.navigateTo({ url: '/subpkg-coupon/pages/settings/index' })
}

const result: CouponRedemptionResult = error instanceof CouponRedemptionError
  ? { code: error.code, message: error.message }
  : { code: 'unknown', message: '結果未確認，請先到官方頁面確認再嘗試。' }
```

- [ ] 跑 `npm.cmd test -- tests/pages/coupon-redemption-page.test.ts tests/runtime/coupon-redemption-service.test.ts tests/coupon-redemption/coupon-redemption-presenter.test.ts` 確認红燈；实施玩家快照／序號与上述guard。WXML切換按鈕用原生 `disabled="{{isSubmitting}}"`，輸入期間亦鎖定避免完成時清除新輸入。
- [ ] Runtime transport catch使用已有 `UNKNOWN_RESULT_MESSAGE`，不以「稍後再試」推斷請求未成功。finally只有目前有效請求可解除loading／清碼；已known失敗仍按原服務文案呈現。
- [ ] 綠燈加空設定、重複tap、輸入非法不發request、unload後遲回覆、切換後舊成功／舊失敗等案例。DevTools fixture驗收A結果標識、B切換、提交鎖定與三類狀態；final／verify後提交確認。message：`fix: 綁定兌換玩家並保留確定及未知結果語義`。
