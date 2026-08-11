# 航海士卡片内联操作 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 将战斗配队与探险配队航海士卡片下方的弹出式操作入口替换为三个紧凑的直接操作按钮，并让锁定航海士前置、高亮。

**Architecture:** 保留 `officer-action-sheet` 作为共享操作组件，仅将 `trigger` presentation 改为内联操作条；两页直接绑定组件发出的 `lock`、`remove`、`ban` 事件。展示层分别在 presenter 中生成锁定优先的卡片顺序，领域状态仍由现有 transition 处理，不改写原始船位顺序。

**Tech Stack:** TypeScript、WXML、WXSS、Vitest、Prettier、ESLint。

## Global Constraints

- 所有代码、测试、注释和文档使用中文；WXML/WXSS 类名使用英文 BEM 风格。
- 不修改 `archive/`、`data/master/` 或 `miniprogram/generated/`；不新增依赖和图片素材。
- 不在 `master` 分支开发；当前使用 `codex/phase-8-fleet-button-width`，保留该分支已有未提交按钮宽度修正。
- 不改变配队求解算法、领域状态协议、配置持久化协议、保存/撤销流程。
- 主要页面操作按钮继续遵守 88rpx 规范；仅缩小航海士卡片内的次级图标操作热区。
- UI/WXML/WXSS 修改必须遵守 `docs/superpowers/specs/2026-08-09-design-foundation-design.md`。
- 实现前先写失败测试并确认 RED；实现后运行定向测试和全量验证。

---

### Task 1: 先锁定共享操作组件的内联按钮契约

**Files:**
- Modify: `tests/architecture/fleet-shared-components.test.ts`
- Test: `tests/architecture/fleet-shared-components.test.ts`

**Interfaces:**
- Consumes: 现有 `officer-action-sheet` 的 `status`、`disabledActions`、`lock/remove/ban` 事件契约。
- Produces: 对内联 trigger 的三个按钮、锁定/解锁语义、禁用状态和无障碍标签的可执行契约。

- [ ] **Step 1: 写失败测试**

在共享组件契约中新增断言：

```ts
expect(wxml).toContain('officer-action-sheet__trigger-actions')
expect(wxml).toContain('aria-label="{{status === \'locked\' ? \'解鎖\' : \'鎖定\'}}{{officerName}}"')
expect(wxml).toContain('aria-label="移除{{officerName}}"')
expect(wxml).toContain('aria-label="排除{{officerName}}"')
expect(wxml).not.toContain('bindtap="onOpen"')
expect(wxss).toMatch(/\.officer-action-sheet__trigger-actions\s*\{[\s\S]*display:\s*flex/)
```

同时把原本要求 trigger “更多操作”和 `open` 事件的断言改为要求三个直接按钮；sheet presentation 的 `dismiss`、`lock`、`remove`、`ban` 契约继续保留。

- [ ] **Step 2: 运行测试确认 RED**

运行：

```powershell
npm test -- tests/architecture/fleet-shared-components.test.ts
```

预期：失败，原因是当前 trigger 仍只有“更多操作”按钮并包含 `onOpen`。

- [ ] **Step 3: 暂不实现生产代码，检查失败是否只涉及新契约**

确认失败集中在内联按钮结构和样式断言，不因测试路径、导入或现有 sheet 事件错误而失败；若出现其他失败，先修正测试断言再进入下一任务。

---

### Task 2: 实现共享组件的直接操作条

**Files:**
- Modify: `miniprogram/components/officer-action-sheet/index.wxml`
- Modify: `miniprogram/components/officer-action-sheet/index.wxss`
- Modify: `miniprogram/components/officer-action-sheet/index.ts`
- Test: `tests/architecture/fleet-shared-components.test.ts`

**Interfaces:**
- Consumes: Task 1 的 WXML/WXSS/事件契约，以及现有 `disabledActions` observer。
- Produces: trigger presentation 下直接发出 `lock`、`remove`、`ban` 的三个紧凑按钮；sheet presentation 保持兼容。

- [ ] **Step 1: 在 trigger WXML 中替换单一入口**

将 trigger block 改为三个 `<button>`，每个按钮带 `data-id="{{officerId}}"`、原生 `disabled`、`aria-disabled` 和可读 `aria-label`：

```xml
<view class="officer-action-sheet__trigger-actions">
  <button
    class="officer-action-sheet__icon-button officer-action-sheet__icon-button--lock"
    bindtap="onLock"
    data-id="{{officerId}}"
    disabled="{{lockDisabled}}"
    aria-disabled="{{lockDisabled}}"
    aria-label="{{status === 'locked' ? '解鎖' : '鎖定'}}{{officerName}}"
  >{{status === 'locked' ? '解' : '鎖'}}</button>
  <button
    class="officer-action-sheet__icon-button officer-action-sheet__icon-button--remove"
    bindtap="onRemove"
    data-id="{{officerId}}"
    disabled="{{removeDisabled}}"
    aria-disabled="{{removeDisabled}}"
    aria-label="移除{{officerName}}"
  >×</button>
  <button
    wx:if="{{allowBan}}"
    class="officer-action-sheet__icon-button officer-action-sheet__icon-button--ban"
    bindtap="onBan"
    data-id="{{officerId}}"
    disabled="{{banDisabled}}"
    aria-disabled="{{banDisabled}}"
    aria-label="排除{{officerName}}"
  >排</button>
</view>
```

保留原 sheet block，确保其他潜在调用者仍有完整文字操作面板；trigger 不再渲染“更多操作”或调用 `onOpen`。

- [ ] **Step 2: 清理 trigger 专用 TypeScript 入口**

删除只服务于旧触发器的 `onOpen` 方法；保留并复用 `onLock`、`onRemove`、`onBan`、`onDismiss` 和 disabled observer。确认事件 payload 仍为 `{ officerId }`。

- [ ] **Step 3: 添加紧凑按钮样式**

新增 `.officer-action-sheet__trigger-actions` 和 `.officer-action-sheet__icon-button`：按钮按内容/固定图标宽度布局，不使用 `width: 100%`，使用 token 间距、边框、颜色和按下/禁用状态；锁定按钮的状态色使用 `accent-brass`，排除使用 `danger`，不使用 Emoji 图片。

- [ ] **Step 4: 运行共享组件测试确认 GREEN**

运行：

```powershell
npm test -- tests/architecture/fleet-shared-components.test.ts
```

预期：共享组件契约全部通过，并且原 sheet 模式的无障碍与安全区断言仍通过。

---

### Task 3: 两页改为直接绑定三个操作并移除卡片弹出框挂载

**Files:**
- Modify: `miniprogram/pages/fleet/index.wxml`
- Modify: `miniprogram/pages/fleet/index.ts`
- Modify: `miniprogram/pages/adventure-fleet/index.wxml`
- Modify: `miniprogram/pages/adventure-fleet/index.ts`
- Modify: `tests/pages/fleet-page.test.ts`
- Modify: `tests/pages/adventure-fleet-page.test.ts`

**Interfaces:**
- Consumes: Task 2 的组件事件 payload `{ officerId }`。
- Produces: 两页每张卡片直接执行锁定、移除、排除；页面不再挂载 trigger-to-sheet 的打开/关闭流程。

- [ ] **Step 1: 写失败页面契约**

把两页结构测试改为要求每个 trigger 实例绑定：

```ts
expect(pageWxml).toContain('bind:lock="onOfficerLock"')
expect(pageWxml).toContain('bind:remove="onOfficerRemove"')
expect(pageWxml).toContain('bind:ban="onBanOfficer"')
expect(pageWxml).not.toContain('bind:open="onOfficerActionOpen"')
expect(pageWxml).not.toContain('presentation="sheet"')
expect(pageWxml).not.toContain('officerActionSheet.visible')
```

更新页面测试接口，移除只服务于 `onOfficerActionOpen`/`onOfficerActionDismiss` 的声明和测试；保留现有页面操作函数的 `detail.officerId` 兼容测试。

- [ ] **Step 2: 运行页面测试确认 RED**

运行：

```powershell
npm test -- tests/pages/fleet-page.test.ts tests/pages/adventure-fleet-page.test.ts
```

预期：失败在两页仍存在 sheet 挂载和 `bind:open`，不应出现领域行为回归错误。

- [ ] **Step 3: 修改两页 WXML**

在卡片 trigger 实例上直接增加 `bind:lock`、`bind:remove`、`bind:ban`；删除页面底部 `presentation="sheet"` 的 `officer-action-sheet` 实例，保留结果预览组件。

- [ ] **Step 4: 清理两页只服务于弹出框的状态和事件**

删除 `officerActionSheet` 初始数据、`buildOfficerActionSheet`/`closeOfficerActionSheet` 的调用链及 `onOfficerActionOpen`/`onOfficerActionDismiss`；`onOfficerLock`、`onOfficerRemove`、`onBanOfficer` 继续直接调用现有领域 transition，并保留原有错误提示、保存脏状态和 render 流程。

- [ ] **Step 5: 运行页面测试确认 GREEN**

运行：

```powershell
npm test -- tests/pages/fleet-page.test.ts tests/pages/adventure-fleet-page.test.ts
```

预期：两页结构、事件和现有操作行为全部通过。

---

### Task 4: 增加锁定优先展示顺序和战斗页高亮

**Files:**
- Modify: `miniprogram/presenters/battle-fleet-presenter.ts`
- Modify: `miniprogram/pages/fleet/index.wxml`
- Modify: `miniprogram/pages/fleet/index.wxss`
- Test: `tests/presenters/battle-fleet-presenter.test.ts`
- Test: `tests/presenters/adventure-fleet-presenter.test.ts`
- Modify: `tests/pages/fleet-page.test.ts`
- Modify: `tests/pages/adventure-fleet-page.test.ts`

**Interfaces:**
- Consumes: `FleetShipState.officerIds`、`lockedOfficerIds` 和现有 officer view status。
- Produces: 仅展示层的锁定优先 `currentShip.slots`，以及两页一致的 locked class。

- [ ] **Step 1: 写 presenter 失败测试**

在战斗 presenter 测试中构造原始顺序为 `['officer-a', 'officer-c']`、锁定 `officer-c` 的 state，断言：

```ts
expect(view.currentShip.slots.slice(0, 2).map((slot) => slot.officer?.id)).toEqual([
  'officer-c',
  'officer-a',
])
expect(state.ships[0]!.officerIds).toEqual(['officer-a', 'officer-c'])
```

在两页结构测试中增加 locked class 的断言；探险 presenter 测试补充“锁定项在 type zone 前面”的具体行为。

- [ ] **Step 2: 运行 presenter 测试确认 RED**

运行：

```powershell
npm test -- tests/presenters/battle-fleet-presenter.test.ts tests/presenters/adventure-fleet-presenter.test.ts
```

预期：战斗顺序测试失败，原因是 presenter 仍按 `officerIds` 原始顺序输出。

- [ ] **Step 3: 实现展示层锁定优先排序**

在 battle presenter 内为 `currentShip.slots` 使用 `lockedOfficerIds` 构造稳定的 `[lockedIds, otherIds]` 顺序，再映射到 11 个展示 slot；不写回 state。探险 presenter 保留既有锁定优先分组，并补齐测试覆盖。

- [ ] **Step 4: 增加战斗页 locked class 和高亮样式**

将战斗 slot class 扩展为包含 `item.officer.status === 'locked' ? 'officer-slot--locked' : ''`，在 WXSS 中以 `accent-brass` 边框和轻量内框高亮；探险页沿用已有 `.officer-card--locked`，仅在需要时补充操作条与高亮的间距适配。

- [ ] **Step 5: 运行 presenter 与页面定向测试确认 GREEN**

运行：

```powershell
npm test -- tests/presenters/battle-fleet-presenter.test.ts tests/presenters/adventure-fleet-presenter.test.ts tests/pages/fleet-page.test.ts tests/pages/adventure-fleet-page.test.ts
```

预期：锁定顺序、原始 state 不变、两页高亮 class 和现有页面行为全部通过。

---

### Task 5: 完成回归验证并检查变更边界

**Files:**
- Verify only: `miniprogram/components/officer-action-sheet/*`, `miniprogram/pages/fleet/*`, `miniprogram/pages/adventure-fleet/*`, `miniprogram/presenters/battle-fleet-presenter.ts`, relevant tests and this plan/spec.

**Interfaces:**
- Consumes: Tasks 1-4 的实现和测试。
- Produces: 可交付的验证结果和明确的变更文件清单；不包含现有无关未跟踪文档。

- [ ] **Step 1: 运行全量测试、Lint、类型检查**

```powershell
npm test
npm run lint
npm run typecheck
```

- [ ] **Step 2: 检查变更文件格式与 diff**

```powershell
npx prettier --check miniprogram/components/officer-action-sheet/index.wxml miniprogram/components/officer-action-sheet/index.wxss miniprogram/components/officer-action-sheet/index.ts miniprogram/pages/fleet/index.wxml miniprogram/pages/fleet/index.wxss miniprogram/pages/fleet/index.ts miniprogram/pages/adventure-fleet/index.wxml miniprogram/pages/adventure-fleet/index.wxss miniprogram/pages/adventure-fleet/index.ts miniprogram/presenters/battle-fleet-presenter.ts tests/architecture/fleet-shared-components.test.ts tests/pages/fleet-page.test.ts tests/pages/adventure-fleet-page.test.ts tests/presenters/battle-fleet-presenter.test.ts tests/presenters/adventure-fleet-presenter.test.ts
git diff --check
```

- [ ] **Step 3: 运行仓库质量门禁**

运行 `npm run verify`；若仍被工作区原有未跟踪的 `docs/audits/2026-08-10-ui-ux-re-audit-handoff.md` 格式问题拦截，不修改该无关文件，并在交付报告中单独说明。

- [ ] **Step 4: 检查边界**

确认 `archive/`、`data/master/`、`miniprogram/generated/` 无变更，未新增依赖、远程资源或 Node.js runtime API；列出本任务实际修改文件，等待用户确认后再提交。
