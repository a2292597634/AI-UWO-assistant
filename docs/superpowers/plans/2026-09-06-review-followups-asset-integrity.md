# 素材完整性审查遗留项实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 补齐素材来源文件的存在性与 PNG 解码校验，并让下载缓存只有在本地文件 SHA-256 与清单一致时才复用。

**Architecture:** `setup-assets` 在构建素材包前，对依赖索引中的所有引用文件执行存在性和 `sharp` 解码校验；依赖索引既有的单一分片归属断言继续负责同一素材只能归属一个根。`downloadAssets` 复用缓存前读取本地文件，比较清单中的 `sha256` 与实际摘要，不一致时重新下载。

**Tech Stack:** TypeScript、Node.js `node:fs`/`node:crypto`、sharp、Vitest、微信小程序素材依赖索引。

## Global Constraints

- 不新增、删除或升级依赖。
- 不修改 `archive/`、`data/master/` 或手工编辑生成文件。
- 所有新增注释、文档和测试描述使用中文；保留必要的 API、文件名、命令和变量名英文。
- 不修改当前已合入 `main` 的 UI 对齐和技能图示范围外代码。
- 逻辑改动遵循先写失败测试、再实现、最后重构的 TDD 顺序。

---

### Task 1: 素材来源文件完整性校验（P1-03）

**Files:**

- Modify: `tools/asset-pipeline/setup-assets.ts`
- Test: `tests/asset-pipeline/setup-assets.test.ts`
- Verify: `tests/data-pipeline/asset-dependency-output.test.ts`

**Interfaces:**

- 新增并导出 `validateReferencedAssetSources(dependencies, sourceFiles)`，接收 `AssetDependencyIndex` 与文件名到本地路径的只读映射。
- 缺少依赖文件时抛出包含文件名的错误；文件无法被 `sharp` 解码或不是 PNG 时抛出包含文件名的错误。
- `setupAssets` 在生成素材包前调用该校验；现有依赖索引断言继续保证每个生成路径只有一个物理素材根。

- [x] **Step 1: 写缺少文件与坏 PNG 的失败测试。**

在 `tests/asset-pipeline/setup-assets.test.ts` 中构造最小依赖索引和临时文件映射，分别断言缺失文件和不可解码文件会使 `validateReferencedAssetSources` reject，并保留现有来源目录与素材隔离测试。

- [x] **Step 2: 运行失败测试。**

Run: `npx vitest run tests/asset-pipeline/setup-assets.test.ts`

Expected: 因为校验函数尚未导出而失败，失败原因应指向待实现的素材完整性接口。

- [x] **Step 3: 实现最小来源校验并接入 setup。**

在 `setup-assets.ts` 中遍历依赖根的去重文件名，先检查映射和文件可读性，再用 `sharp(buffer).metadata()` 确认格式为 PNG；`setupAssets` 在规划并复制前调用该函数，保持现有输出目录和压缩逻辑不变。

- [x] **Step 4: 运行素材校验与依赖归属测试。**

Run: `npx vitest run tests/asset-pipeline/setup-assets.test.ts tests/data-pipeline/asset-dependency-output.test.ts`

Expected: 缺失文件、坏 PNG、来源目录隔离、依赖根唯一归属全部通过。

### Task 2: 下载缓存 SHA-256 复核（P2-01）

**Files:**

- Modify: `tools/asset-pipeline/download-assets.ts`
- Test: `tests/asset-pipeline/download-assets.test.ts`

**Interfaces:**

- 缓存命中必须同时满足状态为 200、清单有 `sha256`、本地文件存在、实际 SHA-256 与清单一致。
- 缓存摘要或文件大小不一致时，按普通下载路径重新请求并更新 manifest；不改变批次延迟、User-Agent、失败状态和输出格式。

- [x] **Step 1: 写缓存摘要不一致的失败测试。**

写入内容与清单摘要不一致的临时文件，传入带旧摘要的 manifest 和注入的 fake fetcher，断言会重新请求，并返回新文件的摘要与大小。

- [x] **Step 2: 运行失败测试。**

Run: `npx vitest run tests/asset-pipeline/download-assets.test.ts`

Expected: 当前实现只检查文件存在，测试会错误地跳过请求，导致 fetch 次数和新摘要断言失败。

- [x] **Step 3: 实现缓存内容复核。**

使用现有 `sha256Hex` 和 `readFileSync` 读取缓存文件，比较实际摘要和清单摘要；读取失败、摘要不一致或记录无效时均进入下载队列。

- [x] **Step 4: 运行素材下载回归。**

Run: `npx vitest run tests/asset-pipeline/download-assets.test.ts tests/asset-pipeline/setup-assets.test.ts`

Expected: 批次节流、User-Agent、缓存命中、摘要不一致重下载和素材来源校验全部通过。

### Task 3: 收口验证与审查清单

- [x] **Step 1:** `npm run lint`
- [x] **Step 2:** `npm run typecheck`
- [x] **Step 3:** `npm test`
- [x] **Step 4:** `npm run verify`
- [x] **Step 5:** `git diff --check`，确认没有修改禁止路径和无关 UI 文件。
- [x] **Step 6:** 更新 `docs/code-review-2026-08-02-remaining-tasks.md`，仅在验证通过后勾选 P1-03、P2-01，并保留仍未处理的 P1-07、P2-04、P2-05。

提交前展示完整变更文件、验证结果和拟用 commit message，等待用户确认后再执行 commit 或 push。

## Self-review checklist

- [x] 缺失素材会在复制或发布前失败，而不是静默生成不完整包。
- [x] 坏 PNG 会由 `sharp` 解码失败明确暴露。
- [x] 依赖索引现有的单一分片归属测试仍然覆盖全量生成引用。
- [x] 缓存命中不会绕过 SHA-256 复核。
- [x] 没有新增依赖或修改无关 UI。
