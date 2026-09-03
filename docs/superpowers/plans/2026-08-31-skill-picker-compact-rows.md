# 战斗配队技能列表紧凑化 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在不改变技能筛选、查看详情和加入目标行为的前提下，采用已确认的 10A 方案降低战斗配队页 inline 技能列表的行高与行间距。

**Architecture:** 只在共享 `skill-picker-sheet` 的 `inline` 展示模式增加紧凑视觉覆盖：保留图标、技能名称、分类元信息和「加入目标」按钮，隐藏列表内重复的描述；点按整行继续由现有 `onSkillTap` 打开完整技能详情。`sheet` 模式不继承这些覆盖，避免影响冒险配队的 Bottom Sheet。

**Tech Stack:** 微信小程序 WXML/WXSS、TypeScript、Vitest、Prettier。

**Spec:** `docs/superpowers/specs/2026-08-09-design-foundation-design.md`、`docs/superpowers/specs/2026-08-10-fleet-compact-controls-design.md`。

## Global Constraints

- 所有界面文案、代码注释和文档使用中文；WXML/WXSS 类名保持现有英文 BEM 风格。
- 新样式只使用 Design Foundation 的 Token；间距只能使用 `--uwo-space-1`、`--uwo-space-2` 等既有序列。
- 只调整 `inline` 模式；`sheet` 模式的尺寸、描述和安全区行为保持不变。
- 保留现有 `bindtap="onSkillTap"`、`catchtap="onSelect"`、筛选、搜索、分页和图标失败占位语义。
- 不修改 Controller、Presenter、Domain、Solver、配置保存流程、事件名称、数据结构或业务文案。
- 不修改 `archive/`、`data/master/`、`miniprogram/generated/`，不新增依赖，不加入远程请求或运行时网络调用。
- 完成前运行相关 Vitest、`git diff --check` 和 `npm run verify`；提交前展示变更文件、验证结果与拟用 Commit Message，并等待用户确认。

---

### Task 1: 为 10A inline 技能行密度建立失败契约

**Files:**
- Modify: `tests/architecture/fleet-shared-components.test.ts:634-655`
- Test: `tests/architecture/fleet-shared-components.test.ts`

**Interfaces:**
- Consumes: 现有 `readSkillPickerFile('index.wxss')` 读取共享技能选择组件样式。
- Produces: 可验证的 10A inline 样式契约，覆盖隐藏重复描述、56rpx 行内内容高度和 `space-2` 紧凑间距。

- [ ] **Step 1: Write the failing test**

在现有 `戰鬥頁 inline 模式使用緊湊篩選、圖標與加入目標控件` 测试之后加入：

```ts
  it('10A inline 技能行隐藏重复描述并收紧行内高度', () => {
    const wxss = readSkillPickerFile('index.wxss')

    expect(wxss).toMatch(
      /\.skill-picker-sheet--inline\s+\.skill-picker-sheet__description\s*\{[\s\S]*display:\s*none/,
    )
    expect(wxss).toMatch(
      /\.skill-picker-sheet--inline\s+\.skill-picker-sheet__skill\s*\{[\s\S]*gap:\s*var\(--uwo-space-2\)/,
    )
    expect(wxss).toMatch(
      /\.skill-picker-sheet--inline\s+\.skill-picker-sheet__detail\s*\{[\s\S]*min-height:\s*56rpx[\s\S]*gap:\s*var\(--uwo-space-2\)/,
    )
    expect(wxss).toMatch(
      /\.skill-picker-sheet--inline\s+\.skill-picker-sheet__meta\s*\{[\s\S]*margin-top:\s*0/,
    )
  })
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- --run tests/architecture/fleet-shared-components.test.ts`

Expected: FAIL，新增断言失败，因为当前 inline 技能描述没有隐藏，detail 仍为 `64rpx`，且技能行和 detail 仍使用 `space-3` 间距。

- [ ] **Step 3: Write minimal implementation**

在 `miniprogram/components/skill-picker-sheet/index.wxss` 的 inline 覆盖区域加入以下规则，并将 inline detail 高度由 `64rpx` 改为 `56rpx`；同步将现有 inline 高度契约从旧的 `64rpx` 更新为新的 `56rpx`：

```wxss
.skill-picker-sheet--inline .skill-picker-sheet__skill {
  gap: var(--uwo-space-2);
  padding: var(--uwo-space-1) 0;
}

.skill-picker-sheet--inline .skill-picker-sheet__detail {
  min-height: 56rpx;
  gap: var(--uwo-space-2);
}

.skill-picker-sheet--inline .skill-picker-sheet__meta {
  margin-top: 0;
}

.skill-picker-sheet--inline .skill-picker-sheet__description {
  display: none;
}
```

不删除 WXML 中的描述节点，以保持现有数据语义和共享组件契约；只让 inline 列表不显示它。`sheet` 模式不匹配这些选择器，因此仍显示完整描述。

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- --run tests/architecture/fleet-shared-components.test.ts`

Expected: PASS，技能选择共享组件契约全部通过。

- [ ] **Step 5: Run page behavior regression tests**

Run: `npm test -- --run tests/pages/fleet-page.test.ts`

Expected: PASS，技能点按打开详情、加入目标、手动配队筛选和自动配队目标行为均保持通过。

### Task 2: 完成格式、全量验证与视觉检查

**Files:**
- Modify: `miniprogram/components/skill-picker-sheet/index.wxss`
- Modify: `tests/architecture/fleet-shared-components.test.ts`

**Interfaces:**
- Consumes: Task 1 已通过的 10A 样式契约与技能选择组件行为。
- Produces: 可在微信 DevTools 的 320px、375px、393px、430px 宽度检查的紧凑技能列表。

- [ ] **Step 1: Check formatting and diff scope**

Run: `npx prettier --check miniprogram/components/skill-picker-sheet/index.wxss tests/architecture/fleet-shared-components.test.ts`

Expected: 两个文件格式检查通过；`git diff --check` 无空白错误，变更只落在技能选择组件样式和对应契约测试。

- [ ] **Step 2: Run the complete verification gate**

Run: `npm run verify`

Expected: format、lint、typecheck、全部测试、runtime-network、miniprogram-size、assets、data-check 和 generate-check 全部通过。

- [ ] **Step 3: Perform visual acceptance in DevTools**

检查战斗配队页的 `inline` 技能列表：

1. 图标仍保持现有 `40rpx`，没有缩小。
2. 每行只显示技能名称和分类元信息两层文字，不显示描述。
3. 行尾「加入目标」仍可操作，点按技能内容仍打开技能详情 Sheet。
4. 320px、375px、393px、430px 宽度下无页面级横向溢出，长技能名称不会覆盖按钮。
5. 冒险配队的技能 Bottom Sheet 仍显示描述、保持原有高度和安全区。

- [ ] **Step 4: Report before commit**

展示变更文件、`npm run verify`、`git diff --check`、相关测试与 DevTools 结果，并给出拟用 Commit Message：

```text
fix(fleet): 压缩技能选择列表行高
```

本计划不执行 commit，等待用户确认后再提交。
