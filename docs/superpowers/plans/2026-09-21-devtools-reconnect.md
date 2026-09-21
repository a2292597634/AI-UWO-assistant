# 页面验收阻塞自动恢复 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在微信开发者工具连接阻塞时自动关闭旧自动化会话、重新启动项目并重连，有限重试后再生成阻塞报告。

**Architecture:** 适配器负责本机自动化会话的关闭与重新启动，CLI 负责识别环境阻塞、执行最多两次恢复并重试当前验收场景。页面选择器、断言和真实页面失败不触发重启；恢复失败继续输出 `blocked` 报告，保留人工诊断证据。

**Tech Stack:** TypeScript、Node.js `child_process`/`net`、`miniprogram-automator`、Vitest、微信开发者工具 CLI。

## Global Constraints

- 所有代码註釋、文檔與 CLI 訊息使用中文；必要英文仅保留 API、命令、类型和文件名。
- 不修改 `miniprogram/` 运行时代码，不新增或升级依赖。
- 页面验收规范以 `docs/superpowers/specs/2026-09-16-miniprogram-review-html-report-design.md` 为唯一规范来源。
- `doctor` 保持只读；实际启动、运行、检查和 `changed` 验收命令才允许尝试恢复。
- 恢复最多执行 2 次，不得无限重启；恢复失败必须保持 `blocked`，不得报告通过。
- 每条 CLI 命令共享同一个恢复次数预算；只有 WebSocket 端点时仅尝试重新连接，不假装能够启动开发者工具。

---

### Task 1: 为恢复行为写失败测试

**Files:**
- Modify: `tests/miniprogram-review/cli.test.ts`
- Modify: `tests/miniprogram-review/adapter.test.ts`

**Interfaces:**
- `CliDependencies.restartDevTools(config)` 注入恢复动作，便于 CLI 测试验证调用次数和重试顺序。
- `restartReviewConnection(config, runtime?)` 负责适配器层恢复编排，测试通过运行时注入验证关闭与启动顺序。

- [x] **Step 1: 写 CLI 阻塞恢复测试**

覆盖：第一次能力检查失败时调用一次重启、重连检查成功后继续场景；两次恢复都失败时写入 `blocked` 报告并返回非零；场景执行期间发生自动化连接错误时恢复并重跑当前场景。

- [x] **Step 2: 写适配器恢复编排与连接错误识别测试**

覆盖：恢复先关闭旧会话再启动新会话；连接错误文本被识别，找不到元素和断言失败不被识别为连接错误。

- [x] **Step 3: 运行新增测试确认按预期失败**

Run: `npm test -- tests/miniprogram-review/cli.test.ts tests/miniprogram-review/adapter.test.ts`

Expected: FAIL，原因是恢复依赖和恢复函数尚未实现，而非测试语法错误。

### Task 2: 实现适配器会话重启

**Files:**
- Modify: `tools/miniprogram-review/adapter.ts`
- Modify: `tests/miniprogram-review/adapter.test.ts`

**Interfaces:**
- Produces `isDevToolsConnectionError(error)`、`restartReviewConnection(config, runtime?)`，供 CLI 调用。

- [x] **Step 1: 实现自动化端点的最佳努力关闭**

尝试发送 `App.exit` 和 `Tool.close`，每一步使用现有超时工具；关闭失败只记录为恢复阶段失败，不吞掉后续启动错误。

- [x] **Step 2: 实现同项目同端口的全新启动**

沿用现有 Windows `cli.bat auto --project --auto-port --trust-project` 启动命令，等待新 WebSocket 完成 `Tool.getInfo` 与 `App.getCurrentPage` 握手后断开临时连接，确保后续场景可以重新连接。

- [x] **Step 3: 实现可注入的重启编排函数并运行适配器测试**

Run: `npm test -- tests/miniprogram-review/adapter.test.ts`

Expected: PASS。

### Task 3: 接入 CLI 有限恢复和场景重试

**Files:**
- Modify: `tools/miniprogram-review/cli.ts`
- Modify: `tools/miniprogram-review/config.ts`
- Modify: `tests/miniprogram-review/cli.test.ts`
- Modify: `tests/miniprogram-review/config.test.ts`

**Interfaces:**
- `CliDependencies.restartDevTools` 默认绑定 `restartReviewConnection`。
- `recoverDevTools` 最多尝试两次，每次记录日志并重新检查能力。

- [x] **Step 1: 调整无服务端口配置的能力检查**

CLI 已检测到时，允许验收命令在运行阶段自动启动自动化会话，不因未设置 `WECHAT_DEVTOOLS_SERVICE_PORT` 或 WebSocket 端点提前阻塞。

- [x] **Step 2: 实现阻塞恢复流程**

在 `changed` 的预检失败、启动连接失败和场景执行中的自动化连接错误处调用恢复；恢复后只重跑当前场景，不重新执行已完成场景。

- [x] **Step 3: 保持失败分类准确**

端口、登录、WebSocket、连接关闭和 automator 协议超时触发恢复；元素不存在、元素不可见、文字断言失败等页面问题保持 `failed`。

- [x] **Step 4: 运行 CLI/config 测试**

Run: `npm test -- tests/miniprogram-review/cli.test.ts tests/miniprogram-review/config.test.ts`

Expected: PASS。

### Task 4: 更新页面截图确认规范和操作文档

**Files:**
- Modify: `docs/superpowers/specs/2026-09-16-miniprogram-review-html-report-design.md`
- Modify: `docs/miniprogram-review.md`

- [x] **Step 1: 在规范中增加阻塞恢复规则**

记录触发条件、关闭/重启/重连顺序、最多两次、场景重跑范围、无法自动重启时的降级行为和不得虚报通过的要求。

- [x] **Step 2: 在操作文档中补充日志与手动前置条件**

说明 `doctor` 仍为只读，实际验收命令会自动尝试恢复；若缺少 CLI、首次授权或登录失效，仍需要用户完成一次设置。

### Task 5: 完整验证

**Files:**
- No additional files.

- [x] **Step 1: 检查格式、类型、测试和架构约束**

Run: `npm run format:check && npm run lint && npm run typecheck && npm test && npm run check:runtime-network`

- [x] **Step 2: 运行完整仓库门禁**

Run: `npm run verify`

- [x] **Step 3: 检查差异和页面验收阻塞行为**

Run: `git diff --check`；在没有微信开发者工具连接时运行 `npm run devtools:changed -- --mode final`，确认命令尝试恢复、最终生成 `blocked` 报告且不宣称通过。
