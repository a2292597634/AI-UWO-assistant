# Runtime Architecture Baseline

> **记录日期**：2026-07-30
> **计划文档**：`e:\temp\AI-UWO-assistant-runtime-architecture-superpowers-final-plan.md`
> **目的**：在架构迁移开始前，完整记录当前质量门禁、生成结果和运行时状态。

## 仓库基线

| 项目 | 值 |
|------|-----|
| 仓库 | `a2292597634/AI-UWO-assistant` |
| 默认分支 | `main`（计划假设仍为 `main`） |
| 当前分支 | `master`（非计划假设的 `codex/phase-3-importer`） |
| HEAD SHA | `abd808bcb8555a237573beb22130fb12091b24ac` |
| HEAD 提交 | `docs: add AGENTS.md — agent discipline for data pipeline project` |
| 工作区状态 | 干净 |
| 实施分支 | `codex/runtime-architecture-stabilization`（从 HEAD 创建） |

## 环境

| 项目 | 值 |
|------|-----|
| Node.js | 通过 `npm ci` 安装（142 packages，0 vulnerabilities） |
| TypeScript | `^6.0.3` |
| 小程序基础库 | `3.7.0` |
| App ID | `wx8f961bcd8b26996a` |

## 质量门禁状态

| 命令 | 状态 | 详情 |
|------|------|------|
| `npm run format:check` | **FAIL** | 39 个文件格式不符合 Prettier |
| `npm run lint` | **FAIL** | 64 errors, 1 warning（`no-undef`、`no-require-imports`、`no-unused-vars`、`no-explicit-any`） |
| `npm run typecheck` | **FAIL** | 2 errors：`generate-skill-mapping.ts` 中 `string` 不能赋值给联合类型 |
| `npm test` | **FAIL** | 3 个测试失败（审计清单 — 城市/语言/需求枚举未观测） |
| `npm run check:runtime-network` | **PASS** | 无运行时网络请求 |
| `npm run data:check` | **FAIL** | 536 errors（`AUDIT_ENUM_UNOBSERVED` — 城市、语言、需求枚举） |
| `npm run generate:check` | **PASS** | 生成产物无差异，与 Git 一致 |

### Lint 错误分类

| 类别 | 数量 | 涉及文件 |
|------|------|---------|
| `no-undef`（`module` 未定义） | 14 | `miniprogram/data/*.js`（4）、`miniprogram/subpkg-detail/details-*.js`（10） |
| `no-require-imports` | 28 | 页面（home、catalog、detail）+ 测试文件 |
| `no-unused-vars` | 8 | 多个 tools/ 和 test 文件 |
| `no-explicit-any` | 12 | 测试和下载脚本 |
| 其他 | 3 | `prefer-const`、unused imports 等 |

### 测试失败详情

3 个测试全部与审计清单（audit inventory）相关：
- `audit-inventory-fix.test.ts` > `covers the eight captured officers and twenty captured skills`
- `audit-inventory.test.ts` > `accounts for every observed source field and enum exactly once`
- `skill-mapping.test.ts` > `accepts the full eight-officer fixture for the selected twenty skills`

根因：审计清单中的城市、语言和需求枚举值与 8 名捕获航海士中实际观测到的值不一致（新增了未观测枚举）。

## 生成文件大小

| 文件 | 大小 (KB) | 条目数 |
|------|-----------|--------|
| `catalog.js` | 441.1 | 627 officers |
| `skills.js` | 184.5 | 1203 entries |
| `dictionaries.js` | 7.3 | 6 组字典 |
| `dataset-meta.js` | 0.1 | 元数据 |
| `details-0.js` | 142.8 | 66 |
| `details-1.js` | 138.7 | 64 |
| `details-2.js` | 131.8 | 60 |
| `details-3.js` | 123.0 | 57 |
| `details-4.js` | 138.6 | 64 |
| `details-5.js` | 140.9 | 66 |
| `details-6.js` | 129.3 | 60 |
| `details-7.js` | 132.3 | 61 |
| `details-8.js` | 143.1 | 67 |
| `details-9.js` | 134.6 | 62 |

详情分片总计：10 个分片，627 条记录。

## 关键架构发现

### 配置与文档不一致

- `project.config.json`：`useCompilerPlugins: []`（TypeScript 插件已关闭）
- `tsconfig.json`：`allowJs: true, checkJs: false`
- README 声称使用微信内置 TypeScript 编译插件，**与实际配置不一致**

### 页面源码状态

| 文件 | 语言 | 状态 |
|------|------|------|
| `miniprogram/app.js` | JS | 入口文件为 JS |
| `miniprogram/pages/home/index.js` | JS | 首页为 JS |
| `miniprogram/pages/catalog/index.js` | JS | **名册页为 JS，含内联筛选逻辑、数据加载、分页** |
| `miniprogram/subpkg-detail/pages/detail/index.js` | JS | **详情页为 JS，含重复的分片哈希算法** |
| `miniprogram/pages/test/index.js` | JS | 测试页 |

**`miniprogram/pages/**/*.ts` 不存在**。所有页面都是纯 JS。

### 页面直接依赖生成数据

- 首页：`require('../../generated/dataset-meta')`
- 名册：`require('../../generated/catalog')`、`require('../../generated/skills')`、`require('../../generated/dictionaries')`
- 详情：`require('../../details-N.js')`（10 个静态 loader）

### 详情分片算法重复

- `tools/data-pipeline/build-runtime-data.ts`：第 29-34 行 `shardFor()` 和第 236-242 行 `detailShard()`
- `miniprogram/subpkg-detail/pages/detail/index.js`：第 3-9 行 `shardFor()`

两处实现相同算法，详情页硬编码 `SHARD_COUNT = 10` 和 `DETAIL_LOADERS` 数组。

### 名册页职责过重

`miniprogram/pages/catalog/index.js` 同时承担：
- 数据加载（直接 require 生成文件）
- 搜索（`filterCatalog`）
- 组合筛选（`hasActiveFilters`）
- 分页（`loadMore`）
- 视图映射（`buildViewMaps`、技能图标预计算）
- 图片失败状态
- 导航

## 历史提交（形成当前 JS 状态的关键提交）

```
361858b  chore: add TypeScript quality toolchain
ad1b770  refactor: migrate mini program source to TypeScript
65553f8  fix: rename page .ts to .js to bypass WeChat TS compiler errors
48787b6  fix: convert app.ts to app.js, disable TS plugin, lazy-load catalog deps
7767f79  fix: strip TypeScript syntax from detail page after .ts to .js rename
```

## 微信开发者工具验证

- [ ] 待运行：需在微信开发者工具中手动验证当前 JS 版本
- 预期验证：首页、名册、筛选、详情是否正常工作

## 已知问题（非本计划范围）

以下问题在计划第 4.2 节中明确延期：
1. `searchAliases` 与 Phase 2 规格差异
2. S/A/B/C 稀有度徽章与原始 UI 规格差异
3. 筛选 UI 与四页式筛选交互规格差异
4. Phase 3 分支阶段边界混合
5. 默认分支指向问题

## 下一步

Task 1：建立共享 Runtime Contract，不改变生成输出。
