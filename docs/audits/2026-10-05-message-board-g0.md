# 留言板 G0：本地準備執行記錄

本輪於 2026-10-05 開始，完整倉庫門禁與保護核對於 2026-10-06 完成；真雲／真機尚未執行。

## 候選與保護

- 原根：`E:\AI UWO assistant`，保持原分支、配置、素材與未追蹤文件。
- 隔離根：`C:\Users\XB\.codex\worktrees\phase-58-message-board\AI UWO assistant`。
- 分支：`codex/phase-58-message-board`；基線 `9fb8dec43d6f8bbc3c7ab54ba36c3fb33241f8aa`。
- Node 22.23.3／npm 10.9.9，僅修改命令進程 PATH；未安裝或升級根依賴。
- 六份留言板文檔逐檔 SHA 複製核對；main 的完整規範保留，不以旧分支AGENTS覆盖。
- 原根 963 個 tracked／untracked 檔案 SHA 保存於臨時保護 manifest，交付前重新核對。
- 新工作區缺三張 ignored 素材，僅在隔離副本 assets:ci 按發布 manifest 校驗取得；靜態預檢及基線 186 檔／2,548 項測試通過。
- 頁面只讀預檢記錄公開與有效基礎庫皆3.7.0、CLI設定完整；實際 SDK／頁面／元素探測明確 not-run，不以 static ready 充頁面驗收。

## 已實作的本地準備

證據一致性分類、三個最小探測入口、加密／角色與私有素材護欄、自包含組包器、產物忽略規則、部署說明。小程序頁面／runtime 網路白名單／遊戲資料沒有修改。

工具與包預設停用，拒絕現有正式環境。當前三包及 manifest 在 `artifacts/message-board-probes/9fb8dec43d6f-g0/`；manifest 内的 source buildSha 及每包 SHA 是本次依據，三包九個 JS 的 node --check 已通過。

## 紅→綠證據

| 循環                 | 觀察到的真實失敗                                            | 修正後結果                                          |
| -------------------- | ----------------------------------------------------------- | --------------------------------------------------- |
| 證據分類             | 可讀 stub 下 11 項判定斷言失敗；缺模組不算行為紅證據        | 核對真實檔案、身份、SHA、trace與不完整門檻          |
| 入口護欄             | 可讀 stub 下11項停用／来源／身份／密文／私有素材斷言失敗    | 實作三來源獨立校驗，普通 event 自稱 timer 不執行    |
| 素材歸屬與資料庫故障 | 另一 asset 的安全結果誤放行；讀取故障被誤判不存在並繼續寫入 | 綁定 candidate／asset／trace，不吞非缺文檔錯誤      |
| 身份證據             | 不同 build、不同容器對照、local fixture掩蓋真雲失敗         | 绑定 source buildSha、同 instanceId，真實失敗優先   |
| 組包                 | 5項自包含／停用／覆寫／缺來源／source hash行為失敗          | 包自帶 shared，拒絕已有輸出；不包含秘密或時間隨機值 |
| 真實 CLI 路徑        | 新父目錄不存在导致 lstat ENOENT，新增測試重現               | 從已存在磁碟根逐層校驗，不關閉越界／link防護        |

紅測試原始日志在 `.superpowers/message-board-g0/*red*.log`。所有測試使用合成資料與外部 CloudBase port，沒有把 fixture認證為真雲結果。

## 驗證狀態

- 本地新測試：3 個檔案、35 項通過，原始紀錄在 `.superpowers/message-board-g0/g0-test-green.log`。
- 完整 `npm run verify` 通過：189 個檔案、2,583 項測試；資料契約另有 12 檔／100 項通過，master 0 errors／5,254 待複核項保持；format、lint、typecheck、runtime-network、素材／體積／manifest及只讀生成檢查均通過。原始紀錄在 `.superpowers/message-board-g0/verify.log`。
- 三探測包九個 JS 語法檢查、可重現包 hash 與不覆寫輸出測試通過，`git diff --check` 通過。
- 原根保護 manifest 的963個tracked／untracked檔案重新核對，變更數0；沒有把原根修改搬入main或重設其分支。
- 真機、真雲安全回調、HTTP gateway format、真正 platform Source／實例复用、client storage ACL、native image展示：not-run。

不能把工具的 evidence-consistency passed、message API mock、SDK init或發現CLI已登入當作上述門檻通過。

## 外部條件與下一步

CloudBase CLI 只讀列舉目前登入帳號，只返回已知正式環境（NORMAL），沒有發現獨立測試環境。本輪没有新增CloudBase環境、集合、函數、storage規則、callback配置或定時觸發；沒有對外發送消息、提交、推送或部署。

需確認独立測試環境、AppID綁定与微信消息接收路由，並取得相应測試部署／同版本SDK雲端安裝授权。此後按 [部署說明](../architecture/message-board-cloudbase.md) 做真雲 G0，三門檻符合後再進 F1，不能跳過本計畫的前置條件。

本輪交付為「G0 本地準備」，不是留言板功能完成。正式業務、UI与其他批次仍pending。
