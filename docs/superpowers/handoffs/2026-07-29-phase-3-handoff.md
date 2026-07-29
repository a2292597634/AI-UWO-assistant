# Phase 3 Handoff: 一次性 voyage.tw 導入器

> **致實施 Agent：** 這是 Phase 3 的完整上下文和開工指令。Phase 1–2 已完成並合併到 master，Phase 2 demo 在分支 `codex/phase-2-demo`。
> 你的工作目錄：`E:\AI UWO assistant`，分支：`codex/phase-3-importer`（從 master 創建）。

## 1. 項目背景

UWO Assistant 是《Uncharted Waters Origin》國際服的繁體中文微信小程序航海士資料查詢工具。架構三層：
- 原始存檔層（`archive/`）：voyage.tw 一次性快照，不可修改
- 主資料庫層（`data/master/`）：唯一可人工維護的 canonical 數據
- 運行時數據層（`miniprogram/generated/`）：構建工具自動生成

## 2. Phase 2 已完成的工作

Phase 2 完成了**有界源審計**和**canonical schema**：

| 產物 | 路徑 | 說明 |
|------|------|------|
| 源配置 | `tools/data-audit/source-config.ts` | 源 URL、版本號、HTTP Range 白名單 |
| JS 值提取器 | `tools/data-audit/extract-js-value.ts` | 從 JS 變量中非求值提取 JSON |
| 字段清單 | `data/audit/source-field-inventory.json` | 29 個字段的 disposition（canonical/derived/archive-only/rejected） |
| 枚舉清單 | `data/audit/source-enum-inventory.json` | 43 個枚舉值的 canonical 映射 |
| 技能映射 | `data/audit/skill-group-mapping.json` | sk0–sk5 × category → kind(active/passive) + categoryId，附源證據 |
| JSON Schemas | `data/schema/*.schema.json` | 5 個 Draft 2020-12 schema |
| Canonical fixtures | `tests/fixtures/canonical/` | 8 officers、20 skills、9 assets、72 dictionary items |
| Source fixtures | `tests/fixtures/source-audit/` | bounded capture 的源樣本、技能名、資產觀察 |
| Schema validator | `tools/data-audit/create-schema-validator.ts` | Ajv 2020-12 校驗器 |
| Cross-file validator | `tools/data-audit/validate-canonical-dataset.ts` | 跨文件引用、唯一性、計數校驗 |
| 數據門禁 | `npm run data:check` | `data:audit:check` + `data:schema:check` |

**關鍵約束（Phase 3 必須遵守）：**
- 不得創建/填充 `data/master`（Phase 3 輸出到 `archive/` 和臨時候選數據）
- 不得定義 `alias`/`aliases` 字段
- 每個源字段必須有且僅有一個 disposition
- 未解析的字段/枚舉/映射 = 阻塞錯誤
- `chasT051` 已拒絕：不得進入 canonical cityIds 或推斷為 prerequisite
- `lang_1.js` 完整下載時只能用四個授權 Range（0–47237, 47238–88188, 92126–178363, 178364–262143）

## 3. Phase 2 的已知缺口（Phase 3 需要解決）

| 缺口 | 影響 | Phase 3 解決方式 |
|------|------|------------------|
| 字典無顯示名 | name 字段等於 id | 完整下載 `lang_1.js` 後提取全體顯示名字符串 |
| 僅有 8 個採樣 officer | canonical fixtures 只有 8 條 | 解析完整 `json_char.js` 得到全體 ~2000+ officer |
| 僅有 20 個採樣 skill | canonical fixtures 只有 20 條 | 解析完整 `json_char.js` 的 `skill_arr` |

## 4. 數據源

唯一源：`https://voyage.tw/`

| 文件 | URL | 估算大小 | 內容 |
|------|-----|----------|------|
| `json_char.js` | `/js/json_char.js?v=2026052501` | ~568 KiB | 全體 officer 數據：`var json_char={chasT001:{...},...}` |
| `lang_1.js` | `/js/lang_1.js?v=1779690379` | ~338 KiB | 全體顯示名：`lang_js[1]={key:"中文",...}` |
| `json_char.js` 含 skill_arr | 同上，offset 446464+ | ~數百 KiB | 全體技能元數據：`skill_arr={skill100001:{...},...}` |

Phase 2 的 `source-config.ts` 已固定版本號。

## 5. Phase 3 目標

1. **完整下載**三個源腳本並保存到 `archive/voyage-tw-2026052501/raw-data/`
2. **解析**全體 officers、skills、dictionaries
3. **轉換**為 canonical 格式（應用 Phase 2 的 field disposition + skill mapping）
4. **生成**來源清單 `source-manifest.json`（URL、時間戳、SHA-256、字節數）
5. **生成**記錄對賬報告（源記錄數 vs 轉換成功/失敗/跳過數）
6. **輸出** canonical 候選數據到臨時目錄

## 6. 技術實現指引

### 6.1 下載源腳本
- 使用 Node.js `fetch`，HTTP GET（不需要 Range，lang_1.js 除外）
- 驗證 HTTP 200、Content-Type、Content-Length
- 保存時記錄 `Last-Modified`、SHA-256、字節數
- 保存在 `archive/voyage-tw-2026052501/raw-data/`

### 6.2 解析 json_char.js
- 復用 `tools/data-audit/extract-js-value.ts` 的 `extractJsValue` 函數
- 變量名 `json_char`，整體是一個大對象 `{chasT001:{...}, chasT002:{...}, ...}`
- 遍歷所有鍵，對每個 officer 提取全部字段
- 參考 `source-field-inventory.json` 了解所有已知字段和 disposition
- `skill_arr` 也在 `json_char.js` 中（在 officer 數據之後的區段）

### 6.3 解析 lang_1.js（重要：Range 約束）
- **必須使用 HTTP Range**，四個授權區間：
  - `bytes=0-47237`
  - `bytes=47238-88188`
  - `bytes=92126-178363`
  - `bytes=178364-262143`
- **不得讀取** `bytes=88189-92125`
- **不得下載**完整 337759-byte 腳本
- 變量名 `lang_js[1]`，是 `{key: "中文值", ...}` 的大字典
- 用於解析：技能名（`skill100043`→`神之手腕`）、技能描述（`skill100043des`→`...`）、職位名、語言名、城市名等

### 6.4 解析 skill_arr
- skill_arr 在 `json_char.js` 中，起始 offset 約 446464
- Phase 2 的成功 range 已在 `source-config.ts` 的 `skillMetadataRanges` 中定義
- 每個 skill 的 `skill_arr[skillId]` 含 `g`（分組 ID，即 `sourceCategoryId`）和可選的 `i`（圖標覆蓋 ID）

### 6.5 字段轉換規則
參考 `data/audit/source-field-inventory.json`：
- `cht` → canonical → `name`
- `rank` → canonical → `rarityId`
- `type` → canonical → `typeId`
- `gender` → canonical → `genderId`
- `job` → canonical → `jobId`
- `skill.sk0.*` → derived → `skills`（按 skill-group-mapping 轉換）
- 完整清單見該文件

### 6.6 技能映射
參考 `data/audit/skill-group-mapping.json`：
- 每個 `sk0`–`sk5` × `sourceCategoryId` 對有一個已批准的映射
- 映射決定 `kind`（active/passive）和 `categoryId`
- 任何未映射的 sourceGroup × sourceCategoryId 必須阻塞導入

### 6.7 字典生成
- 從全體 officers 中收集所有枚舉值
- 用 `lang_1.js` 的字符串映射為顯示名
- 生成 `dictionaries.json`

### 6.8 輸出驗證
- 所有 canonical 候選數據必須通過 Phase 2 的 5 個 JSON Schema 和 `validate-canonical-dataset`
- 運行 `npm run data:check` 確認零錯誤

## 7. 建議文件結構

```
archive/
  voyage-tw-2026052501/
    raw-data/
      json_char.js
      lang_1_ranges/
      source-manifest.json
    raw-assets/

tools/
  import/
    download-source.ts
    parse-officers.ts
    parse-languages.ts
    parse-skills.ts
    transform-officers.ts
    transform-skills.ts
    build-dictionaries.ts
    collect-assets.ts
    run-import.ts
    types.ts

tests/
  import/
    download-source.test.ts
    parse-officers.test.ts
    parse-languages.test.ts
    parse-skills.test.ts
    transform-officers.test.ts
    transform-skills.test.ts
    build-dictionaries.test.ts
```

## 8. 開發流程

- **嚴格 TDD**：每個 parser/transformer 先寫測試再實現
- 每個 task 做 focused commit
- 不修改 `project.config.json`（有無關未暫存改動）
- Windows 環境，PowerShell 終端
- 安裝依賴：`npm ci`
- 完整驗證：`npm run verify`

## 9. 關鍵提醒

- `lang_1.js` 的四個授權 Range 是硬約束
- 所有源字段必須有 disposition
- 技能映射必須精確匹配 `sourceGroup × sourceCategoryId`
- `chasT051` 是已拒絕異常，不要放入 canonical 數據
- Phase 2 的 canonical fixtures（8 officers / 20 skills）可用作測試用例
- 導入器是一次性工具，不是運行時依賴

## 10. 當前分支狀態

- master：`aa42383`（Phase 2 全部合併）
- `codex/phase-2-demo`：`93d2bb2`（demo 頁面代碼）
- 工作區有未暫存的 `.task6-*.patch` 文件和 `tools/fix-*.js` 臨時腳本——不要提交它們
