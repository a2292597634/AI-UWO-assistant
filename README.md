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

此命令依序檢查格式、ESLint、TypeScript、Vitest，以及小程序執行碼是否包含遠端資料或網路 API。

## 微信開發者工具

使用微信開發者工具開啟專案根目錄。`project.config.json` 會將小程序來源指向
`miniprogram/`，並使用內建 TypeScript 編譯插件。

首次編譯後確認首頁顯示「航海助手」與「航海士名鑑」，且控制台沒有登入、網路、路由或
TypeScript 錯誤。

## 目錄邊界

- `miniprogram/`：小程序執行碼與本地素材。
- `data/master/`：後續建立的唯一可人工維護資料源。
- `archive/`：後續保存的一次性來源快照，不進入小程序包。
- `tools/`：資料、素材和品質工具。
- `tests/`：單元、契約和流程測試。
- `docs/superpowers/`：已確認規格與實施計畫。
