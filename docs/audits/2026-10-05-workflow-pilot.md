# 開發流程三類試運行

日期：2026-10-05。固定功能候選：基線 79e778c 加本輪未提交工具／測試變更；最終功能檔案 hash 見交付記錄及 `.superpowers/workflow-20261005/final-candidate.json`。被測小程序來源 SHA-256 為 `f8ffaac313e976837c792b492411e4e8dda31d22c049f9573827c25690f027e3`；來源穩定，未修改產品 runtime、master、archive 或正式產物。

## 實際試運行

| 類型           | 動作與結果                                                                                                                                                                             | 證據                                                                                                                                                                                   |
| -------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 文檔           | 以本批 AGENTS／CLAUDE／README／current-state 和索引執行定向 Prettier、連結核對與 3 個既有架構守門測試（6 項通過）；不新增文案鏡像測試                                                  | `C1-format.log`、`C1-spec-format.log`、`C1-convention-tests.log`                                                                                                                       |
| 資料／生成     | 最小 fixture 主資料 value 1→2，工具生成；Git index 保留 value 1 的產物，實際 dirty 為 out/result.js，新檢查 passed 且 bytes 不變。單一故障產物返回 GENERATED_OUTPUT_DRIFT 且不自動修正 | [provenance](../../artifacts/miniprogram-review/workflow-pilot-evidence/provenance.json)，`C3-pilot.log`                                                                               |
| 非同步 UI      | 同一產品來源用正式 SDK 執行冒險技能場景：19 步／4 圖，關閉後 waitUntil exists=false 及原文字斷言通過；实际 SDK 3.17.0、390×753。冒險預設整批另有 3 場景／8 圖                          | [技能場景 HTML](../../artifacts/miniprogram-review/2026-10-04T165520958Z-amilza/report.html)、[整批 HTML](../../artifacts/miniprogram-review/2026-10-04T163358836Z-ui1h9b/report.html) |
| 圖片身份／基線 | coupon-unknown 真實離線 fixture 各跑一次，同條件圖片 comparable；另以 coupon-known-failure 的場景副本實跑，基線 incompatible，不複製 before。legacy 格式樣例只作 historical            | [對照 HTML](../../artifacts/miniprogram-review/workflow-pilot-evidence/report.html) 與 provenance；舊原始報告未修改                                                                    |
| final 門禁故障 | 測試依賴注入 repository=false，重放本輪已取證 coupon 圖片，未重新連線。CLI=1、page=passed、repository=failed、整體 failed，HTML／JSON／Markdown 一致                                   | 對照目錄的 `provenance.json.finalFailure.report` 和 `final-cli.log`                                                                                                                    |

`C3-pilot.ts` 在 `.worktrees/workflow-pilot/`，只建立自有暫存 fixture、Git index 和報告；沒有 commit。資料樣例不改真實航海士，也不把副本產物拷回原工作區。final 故障是依賴注入，不破壞實際門禁。

## 成本與失敗紀錄

- 首次可信 A 預檢前，三張複製 staging PNG 的 bytes 與發布 manifest 不符；一次 `assets:ci` 的 TLS ECONNRESET 後，從既有 CI 副本取得 SHA 完全相同的發布圖，再由 assets:ci 校驗。原圖在候選內單獨備份，原工作區不變。成本：1 次失敗下載、1 次核對複製／校驗；没有修改網路或依賴配置。
- 首次正式冒險 SDK 在首頁 metadata 的 rawPath=null 處失敗，原日誌保留；wechatide currentPage 也有 timeout 對照。後續已能執行離線 coupon，原預設冒險整批及本輪技能場景通過。不能据此宣稱特定環境是唯一根因，沒有延長超時或刪斷言。
- 請求端口 9458 時工具回覆沿用 9420，實際查詢與截圖身份使用 9420；成功冒險整批沒有消耗 CLI 自動恢復次數。
- 條件等待實際耗時在場景 report.json 步驟中；首次整批為 2,132ms，包含真实 scoped 查詢，非固定延時。後續本輪試運行以其實際 report.json 為準。
- 補證操作：3 次正式 coupon（兩次同 fixture、一次不同 fixture）、1 次完整冒險重試、1 次最終技能場景；3 張關鍵截圖已閱讀。報告比較／故障注入驅動的耗時見 provenance.durationMs。
- 試運行驅動首次因 CommonJS 不支援 top-level await、第二次因重放適配器缺少 fixture 還原邊界失敗；修正僅在忽略的試運行脚本內，沒有降低產品測試。原場景／原始報告與正式門禁失敗紀錄保留。
- 舊流程沒有可比耗時基線；不虛構改善百分比，也不以測試／文檔數當效率指標。

## 驗收邊界

本地最终完整門禁、乾淨基線套入相同功能候選的副本驗證與 Git 保護結果，以 [實施交付](2026-10-05-development-workflow-implementation.md) 的實際日誌／退出碼為準。遠端 CI 未執行。

HTML 內容、圖像來源及實際頁面圖片已讀。2026-10-05 使用者按本輪對照報告的五項清單人工核驗後回覆「正常」，確認展示／截圖載入、圖片放大及關閉、折疊、歷史報告連結、未執行與不相容結果表達正常。本項人工核驗已通過，證據為本聊天的使用者確認及 `.superpowers/workflow-20261005/html-manual-acceptance.json`，記錄實際報告檔案 SHA。未取得瀏覽器／版本資訊，不補造該欄位。

此前內建瀏覽器因安全政策拒絕 file 協議的阻塞紀錄保留，未採其他表面或本地服務繞過；本次是人工補驗通過，不改寫為自動化瀏覽器通過。

真機、真雲 ACL／並發／草稿、四寬度／公共基礎庫、QR／上傳包、長列表原生渲染、solver 性能／數值與 5,254 筆資料語義 warning 均維持未完成。產品不能標為發布驗收通過。
