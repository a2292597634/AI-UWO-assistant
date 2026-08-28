# 配置管理與全局按鈕對齊重設計規格

## 1. 設計狀態

- 日期：2026-08-28
- 適用範圍：戰鬥配隊頁、冒險配隊頁、共享配置管理元件、配置 CloudBase 服務、全小程序按鈕基礎樣式
- 設計狀態：已完成需求確認與設計確認，等待實作計畫
- 已確認方案：在現有配置服務上增加配置範圍 `scope`
- 相關規範：涉及 UI、WXML 或 WXSS 的實作必須遵守 `docs/superpowers/specs/2026-08-09-design-foundation-design.md`

## 2. 背景與問題

目前戰鬥與冒險頁面共用同一套配置服務、配置集合與配置列表，因此兩種頁面可能互相看到或載入錯誤類型的配置。配置管理區同時放置多個大型操作按鈕，與配隊工作區爭奪注意力；收起與展開層級不清，使用者難以判斷下一步。專案內部分原生按鈕使用共享 `.ui-button`，部分按鈕使用頁面或元件自訂樣式，造成文字在按鈕上方偏移、垂直對齊不一致。

本 Change 要在不改變配隊 Domain、Solver、Controller、Presenter 業務語義的前提下，重設配置管理的資料邊界與 UI 層級，並建立全局按鈕置中契約。

## 3. 目標

1. 戰鬥與冒險配置成為完全分開的兩個命名空間，互相不能列表、載入、保存、重新命名或刪除。
2. 戰鬥與冒險各自最多保存 10 套配置，名稱只在同一類型內唯一。
3. 舊配置不直接刪除；缺少範圍的舊記錄進入 `unclassified`，首次使用時逐一分類。
4. 兩個配隊頁各自只顯示本頁對應的配置清單，不提供日常的戰鬥／冒險切換控制。
5. 所有配置切換與操作集中在單一折疊模組；收起時高度最低，展開後提供完整操作。
6. 配置成功載入後自動收起模組；載入失敗時保持展開並說明下一步。
7. 全小程序所有 `<button>` 的文字與圖示上下左右置中，包含自訂按鈕、分頁、模式切換、列表、Sheet、彈窗與圖示操作。
8. 主要操作維持清楚的主次／危險層級；配置模組內的次要操作使用緊湊外觀但不犧牲可用性。

## 4. 不在本 Change

- 不新增配置分享、公開查看、多人協作或歷史版本。
- 不修改航海士、技能、配隊 Solver 或配隊結果的業務規則。
- 不將戰鬥與冒險配置合併成一筆雙內容記錄。
- 不新增依賴、遠端 URL 或新的運行時網路入口。
- 不修改 `archive/`、`data/master/`、`miniprogram/generated/`、資料匯入流程或無關頁面業務。
- 不把純文字連結或 `role="button"` 的 `<view>` 強行改成大型原生按鈕；只檢查其內容對齊與可讀性。

## 5. 使用者體驗設計

### 5.1 單一配置管理模組

戰鬥頁與冒險頁共用同一個配置管理元件。元件只顯示「我的配置」，不顯示配置類型切換；頁面本身決定傳入的資料範圍。

收起狀態為預設狀態，只有一行核心資訊：

- 展開箭頭與可點擊的整行熱區
- 目前配置名稱
- `已保存`、`尚未保存` 或 `未命名配置` 狀態
- 同類型配置數量，例如 `3 / 10`
- 「展開」文字入口

展開後，內容固定按以下順序排列：

1. 目前配置摘要與未保存提示。
2. 本頁 scope 的配置清單；每筆顯示名稱、最後修改時間、目前使用狀態及單一「載入」操作。
3. 緊湊操作列：保存、另存為、新建、重新命名、刪除。只有保存使用主要按鈕；刪除使用危險色文字或邊界。
4. 有 `unclassified` 記錄時顯示「待分類舊配置」，每筆提供「歸入戰鬥」與「歸入冒險」。該入口仍位於同一折疊模組內，完成分類後移除該筆。

未登入狀態下，保存入口仍位於同一模組中，使用「登入後保存」；登入、命名、保存與錯誤訊息不另開第二套配置工具列。

### 5.2 展開、收起與載入行為

- 進入頁面後模組預設收起。
- 點擊標題、箭頭或「展開」均可展開模組。
- 點擊「載入」後先沿用現有未保存守衛；載入成功、頁面狀態更新、列表刷新完成後，模組自動收起。
- 自動載入最後使用配置成功後同樣保持收起。
- 載入失敗時保持展開，錯誤文字描述發生原因與可採取的下一步。
- 保存成功後保持展開，讓使用者看到已保存狀態；另存為、新建、重新命名完成後也保留當前操作結果。
- 列表載入失敗不得渲染成「空列表」；需要獨立的錯誤狀態與重試入口。
- 配置列表為空時，在模組內顯示建立第一套配置的入口。
- 未保存守衛繼續涵蓋載入、另存為、新建、重新命名、刪除和離開；保存／放棄／取消語義不變。

### 5.3 類型隔離的可見語義

日常配置管理不提供類型切換，也不在模組內重複標示「戰鬥／冒險」。戰鬥頁的頁面標題與工作區已提供上下文，模組直接顯示該頁的「我的配置」。只有一次性的舊配置分類流程才顯示「歸入戰鬥／歸入冒險」，用於完成使用者已確認的資料整理。

## 6. 資料模型與服務邊界

### 6.1 Scope 型別與記錄欄位

新增內部型別：

```ts
type ConfigScope = 'battle' | 'adventure' | 'unclassified'
```

`FleetConfigSummary` 與 `FleetConfigRecord` 增加 `scope: ConfigScope`。新建立的記錄只能是 `battle` 或 `adventure`；前端頁面以固定 scope 呼叫服務，不由使用者在日常 UI 任意切換。

既有記錄若缺少 `scope`，在服務端讀取時一律視為 `unclassified`。這是向後相容的非破壞性遷移，不自動猜測其內容類型，也不刪除任何舊配置。

現有 `fleetState` 序列化格式仍為 `SCHEMA_VERSION = 1`；scope 是配置記錄的持久化 metadata，不進入 FleetState envelope，因此不因本 Change 修改配隊資料 schema 版本。

### 6.2 數量與名稱規則

- 新增 `MAX_CONFIGS_PER_SCOPE = 10`，取代日常建立流程的每使用者 20 套限制。
- `battle` 與 `adventure` 分別計算上限，各自最多 10 套。
- `unclassified` 不計入任一 scope 的上限；分類到目標 scope 時才檢查該 scope 的 10 套上限。
- 名稱在 `(ownerUid, scope)` 範圍內 trim 後唯一。
- 戰鬥與冒險可以各自使用相同名稱。
- 舊資料原本的每使用者名稱唯一限制必須由新的 scope 唯一規則取代，否則無法支援兩種 scope 使用相同名稱。

### 6.3 受控服務介面

服務適配層仍是小程序唯一可呼叫 CloudBase 的模組。所有與已分類配置有關的操作都必須帶上固定 scope，並由雲函數再次檢查記錄 scope：

```ts
listMyConfigs(scope: Exclude<ConfigScope, 'unclassified'>)
listUnclassifiedConfigs()
loadConfig(scope, configId)
createConfig(scope, name, fleetState)
updateConfig({ scope, configId, expectedVersion, fleetState, force })
saveAsConfig(scope, name, fleetState)
renameConfig(scope, configId, version, name)
deleteConfig(scope, configId, expectedVersion)
setLastUsedConfig(scope, configId)
classifyConfig(configId, expectedVersion, targetScope)
```

`loadConfig`、`updateConfig`、`renameConfig`、`deleteConfig` 與 `setLastUsedConfig` 只接受與記錄一致的 scope；scope 不一致時返回安全的 not-found 或 invalid-state 結果，不暴露另一類型記錄。`classifyConfig` 只能將 `unclassified` 記錄寫入 `battle` 或 `adventure`，並在同一個 owner lock／交易邊界內檢查版本、名稱唯一性與目標 scope 上限。

### 6.4 CloudBase 索引與舊資料

配置集合的名稱唯一索引改為：

`ownerUid + scope + normalizedName`

既有 `ownerUid + normalizedName` 唯一索引需要移除或改造，否則會阻止兩個 scope 使用相同名稱。部署前以非破壞方式回填舊記錄的 `scope`（或讓服務端缺省值等價於 `unclassified`），不自動把舊配置歸入任何一種類型。owner lock 交易繼續負責同 scope 的 10 套上限與名稱檢查。

### 6.5 最後使用記錄

`lastUsedAt` 仍是每筆配置的欄位，但只在同 scope 的列表與載入流程中使用。戰鬥頁自動載入戰鬥 scope 的最後使用配置；冒險頁自動載入冒險 scope 的最後使用配置；兩者互不影響。

## 7. 元件與頁面責任

### 7.1 配置管理元件

將現有 `config-bar` 改造為單一折疊配置管理元件（可保留檔案路徑以降低引用變更）：

- 接收目前配置摘要、同 scope 配置列表、待分類列表、展開狀態與列表狀態。
- 只負責展示、展開／收起與觸發事件，不直接呼叫 CloudBase。
- 將載入、保存、另存為、新建、重新命名、刪除、分類與登入事件交給頁面。
- 逐步移除頁面对 `config-list-modal` 的依賴，使列表與操作都位於同一折疊模組；命名彈窗與衝突彈窗仍可維持獨立，因其為暫時性決策流程而非日常工具列。

### 7.2 配隊頁

戰鬥頁固定使用 `battle` scope，冒險頁固定使用 `adventure` scope。兩頁可以共用配置管理 presenter／元件，但各自維護本頁 FleetState 與配置服務狀態。載入成功後頁面將 `expanded` 設為 false；其餘 Domain、Solver、提案預覽與未保存守衛保持原有語義。

### 7.3 列表狀態

頁面狀態需能區分：未登入、載入中、載入成功且有資料、載入成功但為空、載入失敗。這避免網路錯誤被誤呈現為「尚無配置」，也讓重試入口位於同一折疊模組內。

## 8. 全局按鈕與對齊規範

### 8.1 基礎規則

Design Foundation 的全局按鈕基礎層統一補足：

```css
button {
  display: flex;
  align-items: center;
  justify-content: center;
  text-align: center;
}

button::after {
  border: 0;
}
```

既有 `.ui-button` 繼續使用系統無襯線字體、Token 色彩與狀態；專用元件可以覆寫寬度、排列與尺寸，但不得移除上下左右置中。多行文字允許換行，不能以裁切或上對齊維持單行。

### 8.2 覆蓋範圍

需檢查並統一以下所有 `<button>`：

- 配置、命名、衝突、結果預覽與技能 Sheet 的按鈕
- 戰鬥／冒險目標操作與模式切換
- 技能、列表與分頁選擇
- 航海士鎖定／移除／排除圖示操作
- 編輯頁重新選擇、移除、新增與提交
- 空狀態與重試入口

對不使用 `.ui-button` 的自訂類別，優先補上共享基礎類別或等價置中規則，不順手修改與本問題無關的顏色與布局。

### 8.3 尺寸分層

- 保存、確認、應用、提交等主要操作維持至少 `88rpx` 熱區與 `26rpx` 操作文字。
- 配置模組內的載入、另存、新建、重新命名等可逆次要操作使用緊湊外觀，減少 padding 與視覺高度，但保持至少可用的觸控熱區與 `22rpx` 以上文字。
- 純圖示按鈕維持至少 `88rpx × 88rpx` 熱區，圖示幾何中心與文字基線均置中。
- 主要、次要、危險、禁用、按下與焦點狀態仍遵守 Design Foundation；禁用原因需由相鄰文字或狀態說明提供。

## 9. 錯誤與狀態流程

- 登入失敗：保留本地 FleetState，模組顯示重試入口。
- 配置列表載入失敗：模組顯示錯誤與重試，不渲染為空列表。
- scope 不一致或配置不存在：顯示配置不可用，返回本 scope 列表或空狀態，不載入另一類型配置。
- 保存失敗：保留本地修改並維持尚未保存狀態。
- 版本衝突：沿用重新載入雲端版本／強制覆蓋流程；重新載入成功後自動收起。
- 分類失敗：待分類記錄保持原狀，顯示重名、已達 10 套或版本衝突等具體原因。
- CloudBase 暫時不可用：允許繼續編輯，但不把失敗操作標記為成功。

所有成功／未達成／需復核／錯誤狀態都要同時具備可見文字與 Design Foundation 狀態類別，不能只依賴顏色。

## 10. 測試策略

### 10.1 TDD：資料與服務

先新增失敗測試，再實作 scope 隔離：

- `ConfigScope`、記錄欄位與缺省 `unclassified` 的 contract 測試。
- 每個 scope 上限 10 套；不同 scope 相同名稱可用；同 scope 重名拒絕。
- 舊記錄缺少 scope 時列入待分類，不被戰鬥或冒險普通列表讀取。
- 所有 scoped service action 必須傳 scope，scope 不一致不能讀寫。
- 分類操作驗證 owner、版本、目標 scope 上限與名稱唯一性。
- 服務端向後相容讀取缺少 scope 的舊記錄，並返回明確的 unclassified scope。

### 10.2 TDD：Presenter 與純邏輯

- 配置列表狀態能區分 loading、ready、empty、error。
- 收起狀態只產生核心摘要；展開狀態顯示同 scope 清單與操作。
- 載入成功後 view state 變為收起；載入失敗保持展開。
- 只有存在待分類資料時才生成分類區。
- 10 套上限與分類提示文字由 presenter／純函數測試保護。

### 10.3 樣式與靜態契約

- 驗證全局 `button` 與 `.ui-button` 具備 `display:flex`、`align-items:center`、`justify-content:center`、`text-align:center`。
- 掃描自訂按鈕類別，確認沒有因 `line-height`、`display:block` 或固定高度造成上對齊。
- 驗證配置模組收起／展開類別、主要／緊湊操作層級與狀態類別。
- 保留 Design Foundation 架構測試與按鈕／狀態 Token 契約。

### 10.4 手動驗收

在微信 DevTools 以 320px、375px、393px、430px 寬度驗證：

- 戰鬥頁只出現戰鬥配置；冒險頁只出現冒險配置。
- 兩頁各自可建立最多 10 套；同名配置可以在另一 scope 建立。
- 舊配置逐一分類後，從待分類列表消失並進入對應 scope。
- 配置模組預設收起，收起高度低且不遮蔽工作區。
- 載入成功後自動收起；錯誤時保持展開並提供下一步。
- 全小程序按鈕文字／圖示上下左右置中，沒有頂部偏移或垂直裁切。
- 沒有新增頁面級橫向溢出、長文字裁切或安全區回退。

## 11. 工程門禁與交付

- 不新增或升級依賴。
- 不在 `miniprogram/` 新增任意 `wx.request`、`wx.cloud`、遠程 URL 或 Node.js API；CloudBase 呼叫仍只在配置服務適配層。
- 完成後執行 `npm run verify`、`git diff --check` 與相關 Cloud Function／配置測試。
- 確認 `archive/`、`data/master/`、`miniprogram/generated/`、Controller、Presenter、Domain、Solver 與無關頁面沒有變更。
- 實作完成後展示變更文件、驗證結果、DevTools 驗收結果與擬用 commit message；未經使用者確認不提交產品實作 commit。

## 12. 設計確認記錄

- 已確認採用現有配置服務增加 `scope` 的方案。
- 已確認舊配置保留為 `unclassified`，首次使用時逐筆分類。
- 已確認單一配置管理折疊模組，收起高度最低，載入成功後自動收起。
- 已確認戰鬥頁與冒險頁不顯示日常類型切換，頁面上下文決定配置範圍。
- 已確認全小程序所有按鈕文字／圖示上下左右置中。
