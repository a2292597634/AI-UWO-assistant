# 技能彈窗自動化作用域修復記錄

日期：2026-10-03。分支：`codex/phase-52-ui-automation-scope`。基線：`c93dd5b`。

## 深入排查後的當前結論

已確認兩個啟動層問題，而非僅以記憶體或版本猜測原因：

1. 正式 Windows 適配器一直使用 `cli auto`。已安裝工具的實作會先關閉現有專案，再以 `liteMode` 打開；本機該路徑曾只返回 Tool.version，沒有 SDKVersion，App 命令超時。官方新入口 `cli agent start` 可複用已打開的原專案並啟動後端自動化服務。同一就緒原專案改用此入口，立即返回 SDKVersion 3.17.0、當前頁及真 SDK 元素，正式技能場景隨後通過。
2. 工具可以返回與請求不同的實際端口。實測請求 9448、CLI 明確返回 `autoPort: 9447`；適配器忽略返回值仍連 9448，造成新的連線阻塞。

修復已加入正式適配器：以子命令 help 探測 `agent start` 能力，支援時使用原專案，舊 CLI 保留 auto／TypeScript 鏡像回退；等待啟動完成，解析有效實際端口並同步既有 WebSocket 端點，等待當前頁就緒。首次啟動、場景中途恢復及下一場景均傳播實際連線資訊。沒有透過業務 handler 代替 UI 操作。

正式 CLI 顯式 WS 驗收及修復後預設啟動均通過冒險技能場景，各 18 步／4 張實際截图。預設啟動通過報告：[HTML](</E:/AI UWO assistant/artifacts/miniprogram-review/2026-10-03T081324704Z-lzajwj/report.html>)；其中技能詳情及關閉後選擇器恢復截图已人工讀圖。此結論僅為當前模擬器的該場景，不涵蓋宣告的其他設備或全專案 QA。

記憶體／頁面檔案不足確有系統錯誤，但不構成上述 SDK 問題的唯一解釋。額外整頁預設驗收曾遇到新版 CLI `open_project_window` 超時，兩次恢復失敗，該次報告仍保留為 blocked：[HTML](</E:/AI UWO assistant/artifacts/miniprogram-review/2026-10-03T082239578Z-dwfx2s/report.html>)。

進一步對照確認，整批混用 native CLI 與 SDK 會再次進入開窗口路徑。整批只要包含元件作用域場景，現在首連前便統一使用 SDK，後續重用實際端點；沒有元件場景的批次維持原有選擇。官方 `agent start` 可以合法重用現有服務，因此端口佔用檢查僅保留於舊 `auto` 分支。混合場景回歸已先紅後綠，獨立只讀復核未發現必須修復問題。

最終預設命令 `npm run devtools:review -- --page /pages/adventure-fleet/index --automation-port 9447` 退出碼 0，官方返回既有端口 9447、`openedProjectWindow: false`；三個場景全部通過，共 33 步／8 張當前模擬器實際截圖：[HTML](</E:/AI UWO assistant/artifacts/miniprogram-review/2026-10-03T083252405Z-om85e3/report.html>)。技能詳情及返回選擇器已人工讀圖。顯式 SDK 的整頁對照亦通過：[HTML](</E:/AI UWO assistant/artifacts/miniprogram-review/2026-10-03T082612242Z-lujuhr/report.html>)。此結果不涵蓋其他頁面、真機、多設備或全專案 QA。

## 已確認原因

原整批驗收在冒險配隊的「新增目標」點擊後，第 4 步查詢 `.skill-picker-sheet--sheet` 超過 5 秒。點擊後實際 `showTargetPicker` 為 `true`，頁面 WXML 亦有彈窗；不能將這次逾時判為彈窗未開啟。

本機新版 `wechatide` 的 `automation_element_action` 僅透過 `Page.getElement` 查詢，沒有自訂元件作用域參數。頁級查詢無法找到元件內部元素。嘗試 `>>>` 或 `/deep/` 會錯誤取得整個頁面的根 view，連不存在的內部類名也會命中；這些寫法不能作為修復或通過證據。

## 本次修復

- 技能選擇器及技能詳情的保存場景，根據步驟選擇器自動要求元件作用域能力，所在批次統一改用專案已有的官方 SDK 適配器；不含這些場景的批次保持既有適配器選擇。
- 正式 SDK 使用 `$$` 查詢，以保留協議錯誤。頁級找不到時，搜尋具有 `nodeId` 的真自訂元件，在其作用域內查詢原選擇器；保留 sheet／inline 區分及 `data-id` 條件。
- 點擊、輸入、清空、滾動及文字讀取仍由 SDK 的真 Element 執行，沒有呼叫 Page／Component 業務 handler 代替交互。每次操作重新取得當前頁及元件，不快取場景間節點。
- 查詢和元素動作各有整體期限；SDK 導航及 fixture evaluate 也有期限。fixture 安裝失敗仍嘗試還原，還原失敗亦會釋放連線並保留錯誤。
- 同一批技能場景重用已啟動的 SDK 端點，恢復時保留能力需求，避免每個場景重新啟動並耗盡兩次恢復額度。

沒有修改小程序頁面、資料、生成產物、依賴或使用者本機配置。

### 最終防遺漏複核

使用者要求避免同類問題再發生後，再次逐項對照正式規範、實作與回歸。發現並補齊四項邊界：

- 啟動端口解析原本只檢查 `autoPort`，會接受帶端口的失敗回應。現在僅接受明確的 `status: ok`，失敗或狀態缺失均報錯；回歸已先紅後綠。
- SDK 整頁滾動原本無期限，現在有 5 秒動作期限；掛起回歸已先紅後綠。
- SDK 截圖原本無期限，失敗現場截圖也可能擋住場景清理。現在獨立截圖有 5 秒期限並於 finally 斷線，完整截圖會話有 15 秒期限，仍僅重試一次。掛起及獨立連接清理回歸已先紅後綠；另以正式 runner 驗證失敗截圖掛起後仍結束場景、保留原始查詢錯誤並釋放主會話和兩個截圖會話。
- `changed` 預檢失敗的恢復原本早於批次通道選擇，可能重新走 native CLI。現在預檢前就設定整批元件能力；回歸已先紅後綠，並驗證預檢恢復返回的新端口傳至後續 SDK 連接。

正式 [页面验收规范 8.6](../superpowers/specs/2026-09-16-miniprogram-review-html-report-design.md#86-sdk-启动组件查询与防回归规则规范性) 和 [操作手册](../miniprogram-review.md#故障恢复) 已同步上述防回歸要求、最小 SDK 診斷及預設整批驗收。最小 SDK 診斷是排查要求，尚未實作為 doctor 的自動檢查；新增其他元件場景時亦須擴展目前的技能選擇器能力識別，不宣稱已支援未加入的場景。

加入截圖期限及成功狀態校驗後，預設整頁命令再次退出碼 0，請求 9448、官方返回既有端口 9447；三個場景仍為 33 步／8 張實際截圖：[HTML](</E:/AI UWO assistant/artifacts/miniprogram-review/2026-10-03T091459673Z-aabtx3/report.html>)。

## 驗證狀態

元件作用域、原生交互、轉場重新定位、宿主存在而內部元素缺失、協議錯誤、查詢／點擊掛起、fixture 還原失敗及連續場景重用均有正式回歸測試。核心新測試已觀察到原程式紅燈，再修復為綠燈。CLI 還原失敗的清理包裝器亦已先紅後綠，確保仍斷開連線並保留原始錯誤。

定向驗收工具測試：14 個文件／142 項測試通過。最終完整 `npm run verify` 退出碼為 0，其中 180 個文件／2470 項測試通過；格式、lint、TypeScript、執行期網路限制、包大小、素材、資料及確定性生成檢查均通過。最終獨立只讀復核未發現尚需修復的必修問題。

完整門禁及最新結果保留於 `.superpowers/ui-scope-20261003/`；最終門禁結果以 `final-verify-closeout-preflight.log` 為準，實際整頁驗收日誌為 `adventure-page-closeout.log`。

### 使用者確認的提交清單

本次修復及規範同步共 9 個文件；既有使用者改動 `.codex/config.toml` 不屬本次提交範圍：

- `tools/miniprogram-review/adapter.ts`
- `tools/miniprogram-review/cli.ts`
- `tools/miniprogram-review/types.ts`
- `tests/miniprogram-review/adapter.test.ts`
- `tests/miniprogram-review/cli.test.ts`
- `tests/miniprogram-review/component-scope.test.ts`
- `docs/miniprogram-review.md`
- `docs/superpowers/specs/2026-09-16-miniprogram-review-html-report-design.md`
- `docs/audits/2026-10-03-ui-automation-scope-repair.md`

提交訊息：`fix: 修復小程序 UI 自動化連接與元件查詢並補齊防回歸規範`。使用者已確認上述提交範圍，本記錄隨修復一同提交，提交完成資訊以 Git 記錄為準。未推送或部署。

## 此前的實際驗收阻塞與排查歷程

正式命令：

```powershell
npm run devtools:run -- --scenario adventure-skill-picker-detail --automation-port 9440
```

本輪已繞過原 CLI 元件查詢路徑，但官方 SDK 在導航階段未返回。自動恢復兩次後，結果仍為 `blocked`，沒有完成場景、沒有取得場景截圖，也沒有據此關閉整批 QA-01。

實際報告：[HTML](</E:/AI UWO assistant/artifacts/miniprogram-review/2026-10-03T043858062Z-n29j6d/report.html>)；原始錯誤為 `automator response timeout（導航）`。這是新的連線／執行環境阻塞，不等同原技能彈窗查詢已取得實機通過證據。

需要重新建立開發者工具與已編譯頁面的 SDK 連線，再執行技能場景及原整批驗收。完整 18 步原生交互、實際截圖與整批報告通過前，不宣稱 UI 自動化已完全收尾。本次尚未提交、推送或部署。

### 使用者完整重啟後的復驗

使用者確認已重啟後，改用新端口 9441 執行同一正式場景。兩次恢復後仍為 `blocked`，原始原因仍為 SDK 導航超時；沒有完成步驟或取得截圖。最新報告：[HTML](</E:/AI UWO assistant/artifacts/miniprogram-review/2026-10-03T064007738Z-cu0zwi/report.html>)。

另以官方 CLI 將使用者原專案接到端口 9442，排除臨時 TypeScript 副本因素。`Tool.getInfo` 僅返回版本 `2.02.2607271`，沒有 `SDKVersion`，`App.getCurrentPage` 超時。重新編譯後，新版 CLI 的 `automation_runtime_info` 能返回首頁及 pageId，但舊 SDK 通道仍無回應；模擬器日誌顯示基礎庫 3.17.0 及 App 啟動，未發現編譯錯誤。

安裝診斷為 `compatible: true`，不能據此宣稱舊 SDK 通道可用。官方下載解析器返回 Windows x64 開發版 `2.02.2609292`，可作版本兼容性的下一個驗證方向；目前沒有證據保證更新必定修復。

使用者已同意更新並繼續驗收。官方安裝包下載至 `C:/Users/XB/Downloads/wechat_devtools_2.02.2609292_win32_x64.exe`，Windows 數位簽名為 `Valid`，簽署者為騰訊。首個 UAC 請求取消後，改以可見窗口啟動，安裝退出碼 0。安裝診斷確認版本 `2.02.2609292`，登入有效；內置 skill 為 0.3.11，後續狀態检查版本關係為 `equal`。

更新後端口 9443 的正式場景仍阻塞，第二次恢復另遇端口未釋放。最新報告：[HTML](</E:/AI UWO assistant/artifacts/miniprogram-review/2026-10-03T070325650Z-hy2ydl/report.html>)。本輪沒有用更新完成代替 UI 通過。

隨後 Windows 明確返回 `0x800705AF`（頁面檔案太小），連新的 PowerShell 進程都無法載入組件；使用者亦表示工具窗口未響應並已關閉。退出後物理記憶體剩餘約 5.8 GB、虛擬記憶體剩餘約 8 GB。只開原專案進行一次最小檢查，剩餘虛擬記憶體降至約 3 GB，SDK 未就緒。已發出官方正常退出命令，不再反覆啟動整批驗收。

資源不足是已確認的系統阻塞證據，尚不能證明它是 SDK 導航超時的唯一原因。建議使用者保存工作、重啟 Windows，恢復系統資源後再做最小 SDK 連線及正式場景復驗；不自動終止其他應用或修改頁面檔案設定。

### 使用者要求再次重試

再次只開原專案，初次当前頁讀取超時，但稍後新版 CLI 成功返回首頁 pageId 7，官方模擬器截图也確認首頁正常。因此啟動未就緒可能影響早期查詢，不能把所有超時歸因於資源不足。截图來源為 `C:/Users/XB/AppData/Local/Temp/wechatide-simulator-screenshot-1791011924651-i7u9pi.jpg`；這只證明首頁顯示，不是技能場景的通過證據。

在已就緒原專案上啟動端口 9446 的舊 SDK，CLI 停在權限準備階段，未觀察到自動化端口就緒。已停止本次等待中的 CLI 請求，保留原專案窗口，不繼續疊加會話。

模擬器日誌額外報告四個交易／兌換頁面缺少 JSON：`subpkg-trade/pages/index/index`、`subpkg-trade/pages/detail/index`、`subpkg-coupon/pages/redemption/index`、`subpkg-coupon/pages/settings/index`。檔案清單確認這些 JSON 不存在；屬範圍外的頁面配置缺陷，未夾帶修改，也沒有推斷它們就是 SDK 超時原因。
