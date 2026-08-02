# Phase 4 UI 深度打磨交接

日期：2026-08-02  
分支：`codex/phase-4-ui-deep-polish`  
擬用提交訊息：`feat: deliver phase 4 UI deep polish`  
提交狀態：未提交；依規範須先由使用者確認變更、驗證結果與提交訊息。

## 設計與範圍

- 設計規格：`docs/superpowers/specs/2026-08-01-ui-deep-polish-design.md`
- 實作計畫：`docs/superpowers/plans/2026-08-01-ui-deep-polish.md`
- 本期沒有 Figma 或其他外部設計連結；規格與素材提示詞均保存在倉庫內。
- 已實作首頁橫幅與四列入口、名冊視覺／即時篩選、四頁籤、技能十級資訊層、技能反查、詳情與返回上下文所需的資料與 UI。
- 不包含配隊、技能圖鑑、船舶圖鑑、資訊或活動模組。

## 生成與門禁

素材與資料生成命令：

```powershell
npm run assets:ui
npm run data:generate
npm run assets:ui:check
npm run generate:check
```

完整門禁：

```powershell
npm run verify
```

`verify` 已加入 `assets:ui:check`，順序為 `check:runtime-network` → `assets:ui:check` → `data:check`。

確定性驗證：第二次 `assets:ui`、`data:generate`、`assets:ui:check` 退出碼 0；37 個受控產物在執行前後的聚合 SHA-256 都是 `b5ddc2ddf097582ba5a457e19fd7479dba584543ac249777b62f42e9f2f2e6ca`，變動數為 0。

`npm run verify` 最終退出碼為 0，完整門禁全數通過：

- Prettier：全部檔案符合格式。
- ESLint：退出碼 0，無 warning。
- TypeScript：`tsc --noEmit` 退出碼 0。
- Vitest：Task 8 staging 完成時為 43 個測試檔、452 個 tests；兩輪架構 review 後最新為 43 個測試檔、456 個 tests 全部通過。
- Runtime network：`Runtime network boundary: PASS`。
- UI 素材：`assets:ui:check` 退出碼 0。
- Data audit：`Phase 2 data audit: PASS`。
- Data schema：7 個測試檔、46 個 tests 全部通過。
- Generate check：生成完成，指定範圍相對 index 無 diff。

為相容 `generate:check` 對整個 `miniprogram/subpkg-detail` 的 pathspec，經明確授權後有意 stage 17 個檔案：12 個生成資料檔，以及 5 個 Task 7 詳情頁／presenter 檔。沒有 stage 其他 source、test、docs 或 assets，且未 commit。這是門禁相容步驟，不是提交。

## 架構覆蓋

- 從 `miniprogram` 根目錄遞迴檢查所有運行源碼副檔名，包含根層 `app.ts` 與未來新增目錄；只排除 generated／legacy data、detail 生成檔、`.d.ts`／typings、測試專用檔與 DevTools 私有設定。全部不得引用 `data/master` 或 `archive`；頁面另不得引用工具目錄或直接讀生成資料。
- 遞迴檢查整個 `miniprogram` 的 `.ts`、`.js`、`.json`、`.wxml`、`.wxss`、`.wxs`，不得包含遠端 URL、`wx.request`、`wx.cloud` 或 Node built-ins。
- `miniprogram/assets/ui` 的實際目錄項目必須與 `UI_ASSET_RECIPES` 宣告的輸出集合完全相同；缺檔、多檔或目錄都會失敗。
- `npm run check:architecture`：4 個測試檔、158 個 tests 全部通過。

## 素材來源、hash 與包體

原站 UI 共 15 份主源，來源為 `https://voyage.tw/img/common/`，每筆 URL、原始檔名、尺寸與來源 SHA-256 均記錄在 `data/master/assets.json`。生成主源：

| 主源 | bytes | SHA-256 |
| --- | ---: | --- |
| `feature-officer-catalog-chroma.png` | 2,055,684 | `565d68c65cae6dbdca44a4daa0b5b8c7c442fe33afe1815cdcc75bd0a030424e` |
| `feature-officer-catalog-source.png` | 1,594,380 | `1a7d07bbcaad2b7a7f72533d07e611345db4e5a2d8d35f7dd80eb3c3461c7d15` |
| `home-harbor-source.png` | 2,180,900 | `bce539d1cbd06f6919ab07023600b6d456aec39973e4b70ee01d93f07e568939` |
| `home-harbor.prompt.md` | 682 | `063ea6e02bb770d40e9e8c57fe841623ddd15540f2179cf7b95bf229c5c16f8e` |

運行素材報告 `data/audit/ui-asset-build-report.json`：

| 分組 | bytes | KiB | 上限 | 結果 |
| --- | ---: | ---: | ---: | --- |
| 橫幅 | 32,507 | 31.75 | 150 KiB | 通過 |
| 功能圖示 | 4,887 | 4.77 | 12 KiB | 通過 |
| 原站 UI | 40,210 | 39.27 | 80 KiB | 通過 |
| 新增主包視覺合計 | 77,604 | 75.79 | 250 KiB | 通過 |

`home-harbor.jpg` 為 750×320、32,507 bytes；包內檔名掃描沒有 `source`、`@2x`、`@3x`、`-2x/-3x` 或 `_2x/_3x` 變體，計數 0。UI 目錄又由 config 精確白名單保護，因此主源與未宣告大圖不會進入該目錄。

以下是未經 DevTools 編譯／壓縮的磁碟原始量測，僅供相對比較，不能替代微信開發者工具的包體分析：

| 包 | files | bytes | KiB |
| --- | ---: | ---: | ---: |
| 主包 | 75 | 1,181,143 | 1,153.46 |
| `subpkg-detail` | 18 | 1,215,682 | 1,187.19 |
| `subpkg-a0` | 189 | 801,084 | 782.31 |
| `subpkg-a1` | 180 | 771,149 | 753.08 |
| `subpkg-a2` | 180 | 736,247 | 718.99 |
| `subpkg-a3` | 183 | 759,601 | 741.80 |
| `subpkg-a4` | 191 | 815,103 | 796.00 |
| `subpkg-a5` | 190 | 788,772 | 770.29 |
| `subpkg-a6` | 184 | 781,190 | 762.88 |
| `subpkg-a7` | 186 | 774,657 | 756.50 |
| `subpkg-a8` | 190 | 784,648 | 766.26 |
| `subpkg-a9` | 184 | 753,345 | 735.69 |
| 全部 | 1,950 | 10,162,621 | 9,924.43 |

## 外部驗收狀態

三端核心路徑尚未取得可審核的完成證據：

- 微信開發者工具與 CLI 存在於 `D:\微信web開發者工具\`，既有專案視窗標題為 `UWO Assitant`。
- CLI `open --project` 回報服務端口已關閉並初始化失敗。依任務限制未開啟「設定 → 安全設定 → 服務端口」。
- Windows 視窗擷取對既有 DevTools 視窗連續兩次回報 `SetIsBorderRequired failed: 不支持此接口 (0x80004002)`，無法取得可靠畫面或操作證據。
- Android 與 iOS 沒有本輪已授權、可操作並可記錄微信版本的實機會話。
- 因此沒有 DevTools 編譯後主包／分包體積、設備型號、微信版本或驗收截圖。不可將磁碟原始量測冒充 DevTools 包體。

後續需由可操作 DevTools 與兩台實機的測試者完成：首頁 → 名冊 → 稀有度／類型／性別即時篩選 → 四頁籤 → 技能層 Lv.10 → 反查 → 詳情 → 技能層 → 返回上下文，並補上設備、微信版本、DevTools 包體與截圖。

## 後續複用四列入口

首頁以 `pages/home/index.ts` 的 `modules` 陣列驅動，`.module-grid__item` 固定 `width: 25%` 並自然換行。後續功能需：

1. 在 `modules` 增加 `id`、繁體中文 `name`、本地 `iconPath`、已註冊 `route` 與 `iconFailed: false`。
2. 將頁面註冊到 `app.json` 的主包或分包。
3. 把圖示主源與 recipe 加入權威素材層，再執行 `npm run assets:ui`；不要手改 `miniprogram/assets/ui`。
4. 執行 `npm run assets:ui:check`、`npm run data:check` 與 `npm run verify`。

## 已知限制與提交前動作

- `npm run verify` 已全綠；Task 8 staging 完成基準為 43 個測試檔、452 個 tests，兩輪架構 review 後最新為 43 個測試檔、456 個 tests 全部通過。
- 三端實機／DevTools 核心路徑與編譯包體尚未完成。
- index 有意包含 17 個已授權 generator／detail 檔；其他 source、test、docs 與 assets 保持 unstaged。
- 不得直接 commit。先展示完整 `git status --short`、本交接與 Task 8 報告，取得使用者對 `feat: deliver phase 4 UI deep polish` 的確認。
