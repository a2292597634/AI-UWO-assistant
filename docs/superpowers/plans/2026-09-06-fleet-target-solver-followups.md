# 舰队目标上限与冒险求解器加固实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 统一客户端与服务端舰队目标数量上限，并让冒险自动配队在回退、部分进度和锁定超容量场景下返回可解释且可安全套用的方案。

**Architecture:** 将 20 条目标上限提升为 TypeScript 状态契约常量，领域层在所有目标变更入口统一拒绝超限；页面只负责展示固定中文提示。冒险求解器复用战斗求解器已经验证过的目标评分（已完成数量、剩余缺口、完成比例、溢出与人数），并对超容量锁定结果按实际返回的航海士重新计算进度。

**Tech Stack:** 微信小程序 TypeScript、Vitest、现有 FleetState/FleetProposal domain。

## Global Constraints

- 不修改 WXML/WXSS，不新增依赖，不修改 `data/master/` 或任何生成文件。
- 所有生产逻辑先有失败测试；只修复目标上限和冒险求解器范围内的问题。
- 保持 `FleetProposal` 的 `canApply`、约束码和现有页面交互契约。
- 目标上限固定为 20，服务端 JavaScript 与客户端 TypeScript 必须使用相同值。

## 文件边界

- `miniprogram/contracts/battle-fleet.ts`：共享 `MAX_TARGETS_PER_SHIP` 和 `target-limit` 错误类型。
- `miniprogram/contracts/fleet-config.ts`：复用共享目标上限进行持久化校验。
- `miniprogram/domain/battle-fleet.ts`：所有目标更新入口执行数量上限。
- `miniprogram/pages/fleet/index.ts`、`miniprogram/pages/adventure-fleet/index.ts`：展示上限错误。
- `miniprogram/domain/adventure-fleet-solver.ts`：修正冒险 solver 的评分、回退和锁定溢出。
- `tests/domain/battle-fleet.test.ts`、`tests/pages/fleet-page.test.ts`、`tests/pages/adventure-fleet-page.test.ts`：目标上限回归。
- `tests/domain/adventure-fleet-solver.test.ts`：求解器回归。
- `tests/architecture/miniprogram-package-size.test.ts`、`tools/quality/check-miniprogram-package-size.ts`：只验证 M-04 已有 TypeScript 源文件排除，不做重复修改。

### Task 1: 先证明领域层允许超过服务端目标上限

**Files:**
- Modify: `tests/domain/battle-fleet.test.ts`

- [x] **Step 1: 写失败测试。**

构造包含 21 条目标的单船状态，调用 `updateShipTargets`；期望返回 `error: 'target-limit'`，且返回 state 与原状态等价、目标数量仍未被写入。

Run: `npx vitest run tests/domain/battle-fleet.test.ts`

Expected: FAIL，因为领域层当前只校验等级和重复技能。

- [x] **Step 2: 增加共享常量和错误码。**

在 `contracts/battle-fleet.ts` 增加 `export const MAX_TARGETS_PER_SHIP = 20` 和 `'target-limit'`，在 `contracts/fleet-config.ts` 改为导出/复用该常量，保持持久化校验的数值不变。

- [x] **Step 3: 在 `updateShipTargets` 统一拒绝超限。**

在等级校验前增加 `targets.length > MAX_TARGETS_PER_SHIP` 分支，返回原 state 和 `target-limit`；这样战斗新增目标、冒险选择技能和配置加载前的领域变更共用同一护栏。

- [x] **Step 4: 运行领域测试确认绿色。**

Run: `npx vitest run tests/domain/battle-fleet.test.ts tests/fleet-config/fleet-config-contract.test.ts`

Expected: 全部通过。

### Task 2: 验证页面在达到上限时给出固定提示

**Files:**
- Modify: `miniprogram/pages/fleet/index.ts`
- Modify: `miniprogram/pages/adventure-fleet/index.ts`
- Modify: `tests/pages/fleet-page.test.ts`
- Modify: `tests/pages/adventure-fleet-page.test.ts`

- [x] **Step 1: 写页面失败测试。**

让页面测试实例准备 20 条目标，分别调用战斗页 `onAddTarget` 或冒险页添加技能路径；断言目标数量保持 20，并调用 `wx.showToast` 显示“每艘船最多設定 20 個目標”。

Run: `npx vitest run tests/pages/fleet-page.test.ts tests/pages/adventure-fleet-page.test.ts`

Expected: FAIL，因为当前页面没有数量提示，冒险页仍可继续打开选择器。

- [x] **Step 2: 接入共享常量和错误提示。**

页面的 `resultMessage` 增加 `target-limit` 映射；战斗页直接依赖 `updateShipTargets` 的错误，冒险页在打开选择器/添加新技能前先判断已配置目标是否达到 20，避免打开一个必然失败的选择器。

- [x] **Step 3: 运行页面回归。**

Run: `npx vitest run tests/pages/fleet-page.test.ts tests/pages/adventure-fleet-page.test.ts`

Expected: 全部通过，既有目标选择、删除和 Lv.0 tracking 行为不变。

### Task 3: 先锁定冒险 solver 的三个失败场景

**Files:**
- Modify: `tests/domain/adventure-fleet-solver.test.ts`

- [x] **Step 1: 添加锁定超容量回归。**

使用两个锁定航海士、一个目标和 `capacity: 1`；期望返回的 `officerIds` 只有容量允许的航海士，`targetProgress` 按实际返回名单计算，而不是把被截掉的锁定者贡献算进去。

- [x] **Step 2: 添加大状态空间评分回归。**

构造 6 个 Lv.10 目标（使 `11^6 > 200000`）、容量为 1，并准备一个只贡献目标 A Lv.10 的航海士与一个同时贡献 A/B 各 Lv.1 的航海士；期望回退优先选择完成一个目标的候选，而不是只按覆盖技能数量选择后者。

- [x] **Step 3: 运行并确认 RED。**

Run: `npx vitest run tests/domain/adventure-fleet-solver.test.ts`

Expected: 当前锁定超容量返回全部锁定者，且贪心回退会优先选择覆盖技能更多但完成目标更少的候选，因此测试失败。

### Task 4: 实现冒险 solver 的最小修复

**Files:**
- Modify: `miniprogram/domain/adventure-fleet-solver.ts`

- [x] **Step 1: 对齐目标评分。**

扩展 `ScoredSelection`/`DpState` 增加 `remainingDeficitTotal` 和 `completionScore`；在 `betterFinalResult` 中按“已完成目标数量 → 剩余总缺口 → 完成比例 → 完成时人数更少 → 溢出更少 → 人数更少 → 稳定 ID”排序。

- [x] **Step 2: 替换贪心候选选择。**

每轮构造加入单个候选后的完整 `ScoredSelection`，使用 `betterFinalResult` 选择真实进步最大的候选；没有进步时停止，保留已取得的部分进度。

- [x] **Step 3: 修正锁定超容量回退。**

只返回 `lockedIds.slice(0, capacity)`，按实际返回的航海士重新累计 totals，再生成约束和 progress；保留 `canApply: false` 的容量错误语义。

- [x] **Step 4: 运行 solver 测试确认绿色。**

Run: `npx vitest run tests/domain/adventure-fleet-solver.test.ts tests/domain/battle-fleet-solver.test.ts`

Expected: 两个 solver 测试文件全部通过，战斗 solver 行为不变。

### Task 5: 验证 M-04，不重复改代码

- [x] **Step 1:** 运行 `npx vitest run tests/architecture/miniprogram-package-size.test.ts`，确认 `.ts`/`.tsx` 源文件不计入包体。
- [x] **Step 2:** 检查 `project.config.json` 的 `useCompilerPlugins` 仍启用 TypeScript，并确认 `npm run check:miniprogram-size` 输出主包实际大小。

如果上述测试或配置失败，只修复 TypeScript 源文件识别逻辑；当前主分支已有对应实现，不预先修改。

### Task 6: 质量门禁

- [x] **Step 1:** `npx prettier --check miniprogram/contracts miniprogram/domain miniprogram/pages tests/domain tests/pages tests/architecture tools/quality`
- [x] **Step 2:** `npm run lint`
- [x] **Step 3:** `npm run typecheck`
- [x] **Step 4:** `npm run verify`

提交前记录变更文件、验证结果和拟用 message，等待用户确认。

## Self-review checklist

- [x] 客户端不能构造超过服务端允许的 20 条目标。
- [x] 冒险 solver 回退优先最大化真实目标完成度，并保留有价值的部分进度。
- [x] 锁定超容量时不会把未返回的航海士贡献计入 progress。
- [x] M-04 已由现有测试和 TypeScript 配置证明，无重复代码变更。
