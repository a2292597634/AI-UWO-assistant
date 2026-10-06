# 留言板頭像自動化驗證記錄

## 實際結論

使用者要求自動化驗證後，已執行開發者工具 SDK → 現有付費環境的圖片探測。合法 PNG 精確 65,536 bytes，64×64；實際 RPC 往返 SHA-256 相同，原生 getImageInfo 成功解碼。這是 SDK／真雲傳輸與原生解碼證據，不是完整留言板 UI 或真機驗收。

私有存儲門檻仍未通過。按目錄的規則候選被平台 ModifyStorageSafeRule 以 InvalidParameter／rule invalid 拒絕；單一合成文件的較小規則可套用，但過程中舊公開素材經 SDK 取址後 HTTP 讀取出現 403，不滿足保留既有讀取鏈路的條件。自動控制器已清理本批圖片、恢复 ADMINWRITE 並停用 rpc；不再擴大或嘗試放寬公共桶規則。

此結果要求重新評估私有头像暂存方式，不能把本地規則語義測試當作平台兼容證據，也不能僅因 SDK 產生了 URL 就判讀取通過。候選可評估同環境的服務端私有集合暫存有界圖片、公開副本仍用既有 CDN；本批未實作或驗證該替代方案，沒有创建集合、其他環境或新套餐。

## 身分與保護

- 隔離根：`C:\Users\XB\.codex\worktrees\phase-58-message-board\AI UWO assistant`，分支 `codex/phase-58-message-board`。
- runId：`g0-shared-avatar-59b81041768d`；探測 buildSha：`9a29a64a8189aac64605f1dda62224d275502f56ad13bd13025a42206e21bdbf`；基線 `9fb8dec43d6f8bbc3c7ab54ba36c3fb33241f8aa`。
- 固化 transport-only 授權只允許 getIdentity／echoImage，內容安全、圖片發布、callback／worker／業務資料庫動作仍拒絕。只有本次平台身分取得的操作者 hash 可回傳圖片。
- DevTools SDK 端點 `ws://127.0.0.1:9458` 綁定本次工作根；沒有把 event.OPENID／SOURCE 當可信來源。
- 只操作新建 rpc 和本批合成物件。原四業務函數、原根檔案與存儲原值的最終核對見 ledger／final-protection.json。

## 成功與失敗證據

原始記錄位於 `artifacts/message-board/g0-shared-avatar-59b81041768d/`。

- `synthetic-64k.png`：PNG 分塊 CRC 由 Node crc32 產生，IDAT 可 inflate 回原像素，SHA-256 為 `14fef35297278efad59e8eb820dc6e2b8a478917c51bccb66dbfe02b418008bf`；RPC 回傳位元組匹配，原生解碼 64×64。
- `report.json`：保留 overall failed、成功的字節往返／原生解碼／管理端物件存在檢查，以及失敗的舊素材讀取保護檢查。目錄規則與下載邊界的前次失敗分別留在 report-prefix-rule-rejected／report-cli-download-empty／report-promise-download-boundary 等歷史文件，不覆寫為成功。
- `apply-private-rule-failure.log`／`prefix-rule-rejected.json`：平台拒絕目錄規則；布林 write 的單變量對照也被拒絕，沒有據此放寬權限。
- `admin-object-head.log`：合成物件存在，64 KiB，ETag MD5 為 `e91f9f620733b23a8a927fc2936b240c`。CLI download 返回成功但本地文件為 0 bytes，故改以 HEAD 大小及 ETag 證明存在／上傳完整性；不將空文件當作 SHA 回讀成功。
- `public-sdk-file-shape.json`／`public-download-cache-observation.json`：區分下載 API、成功回調與實際文件讀取邊界。最終公開素材控制使用 SDK 取址加真實 HTTP 位元組 SHA 校驗，避免假通過。
- `final-restored.json`：恢复後 ADMINWRITE、rpc enabled=false；舊公開素材 SDK 取址 status=0、HTTP 200、11,553 bytes，SHA 與发布 manifest 一致。
- `account-capability-inventory.json` 在 G0 目錄：自動化測試帳號数量 0，跨帳號仍 not-run，不能注入 OpenID 偽造。

## 本地門禁與剩餘界限

4 檔／66 項探測測試通過；完整 npm run verify 通過，190 檔／2,614 項測試，資料契約另 12 檔／100 項，master 0 errors／5,254 待複核保持。記錄在 `.superpowers/message-board-g0/avatar-automation-verify.log`。後續僅修改 ignored 控制器與記錄，另做相關 lint／格式／diff 檢查。

G0 整體保持未通過：私有存儲與舊素材兼容問題、真正圖片安全推送／匹配／清理、跨帳號同實例、真機与實際頁面显示均未完成。Node 22 本機、Nodejs20.19 雲函數、DevTools SDK 測試與真機發布結論分開。

## 瀏覽器限制

嘗試核對小程序消息推送后台时，工具的站點安全策略禁止訪問 `https://mp.weixin.qq.com/`，沒有發起用戶授權提示或自動審批。沒有換瀏覽器、代理、CLI 或請求庫繞過該限制。涉及該后台的配置需要本人操作；在接收端準備完成前不要求用戶盲目設置或提供密鑰。

依據：[存儲規則](https://docs.cloudbase.net/storage/security-rules)、[表達式語法](https://docs.cloudbase.net/rule/learn-rules) 與本次平台回應。文檔不能覆蓋真實拒絕及讀取不兼容的結果。
