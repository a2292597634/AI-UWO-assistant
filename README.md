# UWO Assistant

《Uncharted Waters Origin》國際服航海士資料查詢微信小程序。

## 本機安裝

```powershell
npm.cmd ci
```

## 完整驗證

```powershell
npm.cmd run verify
```

此命令依序檢查格式、ESLint、TypeScript、Vitest、運行時網路邊界、資料審計、生成確定性。

### 單獨驗證命令

| 命令 | 說明 |
|------|------|
| `npm run format:check` | Prettier 格式檢查 |
| `npm run lint` | ESLint 檢查 |
| `npm run typecheck` | TypeScript 型別檢查 |
| `npm test` | 全部單元/契約測試 |
| `npm run check:runtime-network` | 檢查運行碼不含遠端請求 |
| `npm run data:check` | 資料審計 + Schema 檢查 |
| `npm run generate:check` | 驗證生成產物確定性 |
| `npm run check:architecture` | 架構邊界與依賴方向 |
| `npm run check:runtime-contract` | 生成資料契約驗證 |

## 專案架構

```
data/master/          → Canonical 主資料（唯一可人工維護資料源）
tools/import/         → 資料匯入器（voyage.tw → canonical）
tools/data-pipeline/  → 資料生成器（canonical → 運行資料）
tools/asset-pipeline/ → 素材管線
tools/quality/        → 品質工具

miniprogram/
├─ contracts/          → 共享型別契約（生成器 + 運行端共用）
├─ domain/             → 純 TypeScript 查詢/篩選/排序（無框架依賴）
├─ runtime/            → 運行時 Store（唯一讀取生成資料的模組）
├─ presenters/         → ViewModel 轉換層
├─ generated/          → 自動生成 CommonJS 資料（不可手改）
├─ pages/              → 頁面控制器（薄層，只做事件轉發與 setData）
└─ subpkg-detail/      → 詳情分包（含自動生成分片與 loader）

tests/
├─ architecture/       → 架構門禁測試
├─ runtime-contract/   → 生成資料契約測試
├─ domain/             → 查詢/篩選單元測試
├─ presenters/         → Presenter 單元測試
├─ runtime/            → Store/Presenter 測試
├─ data-contract/      → 資料契約測試
├─ data-pipeline/      → 管線測試
└─ import/             → 匯入測試
```

### 依賴方向

```
pages → presenters → domain + runtime stores → contracts → generated
```

禁止依賴：
- `pages → generated`（必須透過 Store）
- `pages → data/master`、`archive`、`tools`
- `domain → wx`、`Page`、`Component`、`setData`

## 來源資料一次性匯入

```powershell
npm run import:download   # 下載 json_char.js 和 lang_1.js
npm run import:run        # 解析、轉換、校驗、輸出候選資料
```

匯入結果輸出至 `archive/voyage-tw-2026052501/canonical-candidates/`。

## 資料生成

```powershell
npm run data:generate     # 從 data/master/ 生成所有運行資料
```

生成產物：
- `miniprogram/generated/catalog.js` — 航海士名冊
- `miniprogram/generated/skills.js` — 技能字典
- `miniprogram/generated/dictionaries.js` — 列舉字典
- `miniprogram/generated/dataset-meta.js` — 資料集元資訊
- `miniprogram/subpkg-detail/details-N.js` — 詳情分片
- `miniprogram/subpkg-detail/detail-index.js` — 詳情索引
- `miniprogram/subpkg-detail/detail-loaders.js` — 詳情靜態載入器

## 微信開發者工具

使用微信開發者工具開啟專案根目錄。`project.config.json` 啟用內建 TypeScript 編譯插件。

首次編譯後確認首頁顯示「航海助手」與「航海士名鑑」，且控制台沒有登入、網路、路由或 TypeScript 錯誤。

## 技術棧

- **框架**：原生微信小程序 + Glass-Easel
- **語言**：人工維護邏輯使用 TypeScript；自動生成資料使用 JavaScript/CommonJS
- **開發工具**：微信開發者工具內建 TypeScript 插件
- **測試**：Vitest（單元、契約、架構）
- **品質**：Prettier、ESLint、tsc、generate:check、runtime-network guard
