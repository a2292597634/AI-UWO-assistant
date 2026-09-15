# Task 1 報告：分享 View Model 過濾完全空船

## 實現內容

在 `buildBattleFleetShareViewModel` 中，先依既有 `buildBattleShip` 建立所有戰鬥船視圖，再以 `ship.officerSlots.some(Boolean)` 過濾完全沒有有效航海士的船。保留的船仍使用既有 11 槽 `officerSlots`，並保留原船順序。未修改 `buildBattleShip`、技能累計 predicate、資料源或頁面分享流程。

## 變更文件

- `miniprogram/presenters/fleet-share-presenter.ts`
- `tests/presenters/fleet-share-presenter.test.ts`
- `.superpowers/sdd/2026-09-15-fleet-share-image-readability/task-1-report.md`

## TDD RED/GREEN

### RED

命令：

```text
npx vitest run tests/presenters/fleet-share-presenter.test.ts -t "移除完全空船"
```

關鍵輸出：

```text
❯ tests/presenters/fleet-share-presenter.test.ts (6 tests | 1 failed | 5 skipped)
× 分享圖移除完全空船，但保留部分空位和原船順序
AssertionError: expected [ 'ship-1', 'ship-2', 'ship-3' ] to deeply equal [ 'ship-2' ]
```

失敗原因確認為 Presenter 尚未過濾完全空船。

### GREEN

命令：

```text
npx vitest run tests/presenters/fleet-share-presenter.test.ts
```

關鍵輸出：

```text
Test Files  1 passed (1)
Tests  6 passed (6)
```

## 測試結果

- `npx vitest run tests/presenters/fleet-share-presenter.test.ts`：通過，6/6。
- `git diff --check`：通過，無空白錯誤。
- `npm run verify`：通過。
  - 全量測試：157 個檔案、1957 個測試通過。
  - `check:runtime-network`：PASS。
  - `check:miniprogram-size`：PASS。
  - UI 資產、資產 manifest、資料稽核、資料 schema 與生成檢查均通過。

## 自檢

- 新增測試覆蓋完全空船、未知航海士 ID、部分空位及原船順序。
- 保留船的 `officerSlots` 長度仍為 11。
- 未改動 `buildBattleShip` 的槽位建立方式。
- 未改動技能累計 predicate。
- 未修改 brief 指定範圍外的資料源、生成資料或頁面分享流程。
- 工作樹另有既存未追蹤文件 `docs/superpowers/plans/2026-09-15-fleet-share-image-readability.md`，未納入本任務提交。

## 疑慮

無功能疑慮。依 brief 要求，本任務提交不包含工作樹中既有的計劃文件。
