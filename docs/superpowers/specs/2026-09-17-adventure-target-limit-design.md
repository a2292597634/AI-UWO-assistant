# 冒險配隊目標上限設計

## 目標

將冒險配隊每艘船的技能目標上限從 20 提高到 30，讓新冒險艦隊預設配置的 25 個有效冒險技能全部可見；戰鬥配隊仍維持每艘船最多 20 個目標。

## 根因

冒險頁從航海士資料收集並排除指定類型後，得到 25 個預設技能，但初始化時沿用共用的 `MAX_TARGETS_PER_SHIP = 20` 截取列表。更換截取數值不足以完成修復，因為 Domain、客戶端配置回應校驗與 Cloud Function 也使用同一個 20 個目標限制。

## 設計決策

1. 保留 `MAX_TARGETS_PER_SHIP = 20` 作為戰鬥配隊與共用狀態操作的預設上限。
2. 新增 `MAX_ADVENTURE_TARGETS_PER_SHIP = 30`，由冒險頁及冒險配置校驗顯式使用。
3. 共用 `updateShipTargets` 增加可選的上限參數，預設仍為 20；冒險 Domain 提供固定使用 30 的包裝函式，避免冒險頁散落魔法數值。
4. 客戶端與 Cloud Function 的 FleetState 校驗根據配置 `scope` 選擇上限：`battle` 為 20，`adventure` 為 30，未分類資料維持 20。
5. 不修改資料源、生成資料、技能排除規則、資料 schema 版本或戰鬥頁行為。

## 驗收條件

- 新建冒險配隊包含 25 個預設目標，包含 `skill_skillT0172` 至 `skill_skillT0176`。
- 冒險配隊可以保存與編輯 30 個目標；第 31 個目標被拒絕並顯示「每艘船最多設定 30 個目標」。
- 冒險配置的 Cloud Function 建立、更新與讀取邊界接受 30 個目標，拒絕 31 個目標。
- 戰鬥配隊仍在 20 個目標時可用，21 個目標仍被拒絕。
- 不新增、刪除或升級依賴；不修改既有未提交的 `project.config.json`、`artifacts/` 或舊計劃文件。

## 測試策略

- Domain 測試覆蓋冒險 30/31 個目標邊界，並保留戰鬥 Domain 的 20/21 個目標回歸。
- 冒險頁測試覆蓋 25 個初始化目標、補到 30 個以及第 31 個被阻擋。
- 配置 contract 與 Cloud Function service 測試覆蓋 battle/adventure scope 的差異化校驗。
- 客戶端 Fleet Config service 測試覆蓋 30 個冒險目標的成功回應校驗。
