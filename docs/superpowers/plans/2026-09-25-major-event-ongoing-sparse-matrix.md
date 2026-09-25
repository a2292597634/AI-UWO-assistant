# 大流行可能进行事件与精简矩阵实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:subagent-driven-development` (recommended) or `superpowers:executing-plans` to implement this plan task-by-task. Steps use checkbox (`- [x]`) syntax for tracking.

**Goal:** 在目前七时段矩阵中显示最近两小时内可能仍在持续的大流行候选，并隐藏当前矩阵范围内没有事件的海域。

**Architecture:** Domain 保持未来预测 `[now, now + horizon)`，另提供独立的两小时候选查询。Presenter 将候选放入 UTC+8 当前槽并与该槽未来事件合并、去重、最多保留两种；Page 只渲染当前七槽中有事件的海域，始终从独立的 `headerSlots` 渲染时间栏头。行程与查下一次继续使用未来事件。

**Tech Stack:** TypeScript、微信小程序 WXML/WXSS、Vitest、既有 DevTools review 工具；不新增依赖。

**Spec:** `docs/superpowers/specs/2026-09-25-major-event-ongoing-sparse-matrix-design.md`

## Global Constraints

- 只在 `codex/phase-46-major-event-ongoing-sparse-matrix` 开发，不在 `main` 开发。
- 一般未来预测保持 `[now, now + horizon)`；候选只取 `now - 7200 < triggerAt < now`，只显示在当前矩阵槽并标示「可能進行」。
- 未取得城市活动或预算实时资料；不得把候选标成已确认活动，不推算实际结束时间。
- 当前槽合并候选和未来事件后按唯一键去重，同一海域最多显示两种，使用来源事件顺序优先级。
- 海域筛选和事件类型筛选同时作用于未来预测与候选；矩阵只显示当前七槽中至少有一项事件的海域，不因筛选空结果回退显示全部海域。
- `archive/`、`data/master/`、`miniprogram/generated/` 与交易品图标保持不变；不新增依赖或 Runtime 网络／Node API。
- 日期和时间继续固定使用 UTC+8；现有范围、日期导览、行程及查下一次行为保持不变。
- UI 遵循 Design Foundation、页面验收报告规格和已提交的游戏时刻表设计；TDD 用于 Domain／Presenter／Page 逻辑，修改 WXML/WXSS 后用 DevTools 截图验收。
- 提交前展示全部变更文件、检查结果和提交说明，并遵循用户确认门。

## Review Focus

- `triggerAt === now - 7200` 应视为已达到最长持续时间而排除；略晚于边界的事件应作为候选，`triggerAt === now` 则只属于未来预测。
- 设备时区变化不得改变候选日期、时刻、当前槽或候选截止边界。
- 候选只在矩阵当前 UTC+8 小时槽显示；浏览其他七槽页段或行程时不得重复出现。
- 合并过去候选与当前槽未来预测后，同一海域不得出现重复事件或超过两种事件类型。
- 海域／类型筛选没有当前页事件时，时间栏头和本段空状态仍显示；空海域不应重新出现。

---

### Task 1: Domain 两小时候选查询

**Files:**

- Modify: `miniprogram/subpkg-trade/domain/major-event-forecast.ts`
- Test: `tests/domain/major-event-forecast.test.ts`

**Interfaces:**

- 新增 `MajorEventOngoingQuery`：`{ nowUnixSeconds: number; zoneId?: string | null; eventTypeId?: string | null }`。
- 新增 `forecastOngoingMajorEvents(reference, query): MajorEventOccurrence[]`。它复用现有 `forecastWithinHours`、周期优先级和筛选，返回满足 `now - 7200 < triggerAt < now` 的事件。
- `forecastMajorEvents` 和 `findNextMajorEvent` 的现有输出不变。

- [x] **Step 1: 先写会失败的候选边界测试**

用既有 `withFixture`、`onlyEvent('pop1')`、`onlyZone()` 建立周期为 379 小时、延迟为 0 的单事件样本：

```ts
const reference = withFixture({
  eventTypes: [{ ...onlyEvent('pop1')[0]!, periodHours: 379 }],
  zones: onlyZone(),
})
const at = ANCHOR + 7200
const oneSecondInside = forecastOngoingMajorEvents(reference, {
  nowUnixSeconds: at - 1,
})
const atMaximumDuration = forecastOngoingMajorEvents(reference, {
  nowUnixSeconds: at,
})

expect(oneSecondInside.map((event) => event.triggerAtUnixSeconds)).toEqual([ANCHOR])
expect(atMaximumDuration).toEqual([])
```

另加来源样本断言：`2026-09-25T10:47:00+08:00` 下，`zone_34/pop5` 的 `2026-09-25T09:06:30+08:00` 是候选；查询只选 `zone_34/pop5` 时不返回其他海域或类型。

- [x] **Step 2: 运行 Domain 测试确认失败**

Run: `npm test -- tests/domain/major-event-forecast.test.ts`

Expected: 因 `forecastOngoingMajorEvents` 尚不存在而 FAIL。

- [x] **Step 3: 实作候选查询**

使用 `forecastWithinHours(reference, { ...query, nowUnixSeconds: query.nowUnixSeconds - 7200, horizonHours: 2 })` 生成左闭右开的候选窗口，再严格排除 `triggerAt <= query.nowUnixSeconds - 7200` 及 `triggerAt >= query.nowUnixSeconds`。保留既有排序和海域／事件类型筛选。

- [x] **Step 4: 重跑 Domain 专项测试**

Run: `npm test -- tests/domain/major-event-forecast.test.ts`

Expected: PASS；未来预测左闭右开边界、最多两种类型和下一次查询既有测试继续通过。

### Task 2: Presenter 合并当前候选

**Files:**

- Modify: `miniprogram/subpkg-trade/presenters/major-event-presenter.ts`
- Test: `tests/presenters/major-event-presenter.test.ts`

**Interfaces:**

- `MajorEventListViewItem` 增加 `isOngoingCandidate: boolean`。
- 新增 `MajorEventMatrixHeaderSlot`：`{ index: number; startUnixSeconds: number; timeLabel: string; isCurrentHour: boolean }`。
- `MajorEventMatrixView.headerSlots: MajorEventMatrixHeaderSlot[]`；栏头不再依赖海域列是否有数据。
- `presentMajorEventMatrix(futureOccurrences, ongoingOccurrences, reference, tradeReference, segmentStartUnixSeconds, slotCount, currentHourStartUnixSeconds)` 接收未来事件和候选。

- [x] **Step 1: 先写会失败的 Presenter 测试**

固定 `now = Date.parse('2026-09-25T10:47:00+08:00') / 1000`，将 `zone_34/pop5` 的 `09:06:30` 事件作为候选，另将 `zone_53/pop1` 的 `11:04` 事件作为未来项传入 Presenter。断言 `10:00` 当前槽包含北极海战争且 `isOngoingCandidate === true`，`11:00` 槽包含东亚奢侈且 `isOngoingCandidate === false`；`headerSlots` 总有七项且首项 `isCurrentHour`。

再提供同一海域超过两种的候选／未来组合，断言当前槽依来源事件顺序最多显示两种且 key 不重复。

- [x] **Step 2: 运行 Presenter 测试确认失败**

Run: `npm test -- tests/presenters/major-event-presenter.test.ts`

Expected: 新候选参数、独立栏头和状态断言 FAIL。

- [x] **Step 3: 实作 Presenter 合并与当前槽归位**

未来项按触发时间归入其实际整点；候选项仅在 `currentHourStartUnixSeconds` 落入当前段时归入当前槽，并以 `isOngoingCandidate` 标记。候选与未来项按 key 去重、按 `reference.eventTypes` 顺序从长周期到短周期排序，当前槽每海域保留前两种。`headerSlots` 独立生成，即使 rows 为空仍包含完整栏头。

- [x] **Step 4: 重跑 Presenter 测试**

Run: `npm test -- tests/presenters/major-event-presenter.test.ts`

Expected: PASS；UTC+8 标签、七槽、事件顺序及图标映射测试继续通过。

### Task 3: Page 候选详情与有事件海域过滤

**Files:**

- Modify: `miniprogram/subpkg-trade/pages/popularity/index.ts`
- Test: `tests/pages/major-event-page.test.ts`

**Interfaces:**

- `refreshPage` 分别取得未来预测和可能进行候选；Presenter 同时收到两组数据。
- 矩阵详情查找列表包含候选和未来项；行程与下一次搜索仍只使用未来项。
- `pageMatrix` 先套用所选海域，再移除所有七个槽皆无事件的海域，不作全海域 fallback。

- [x] **Step 1: 先写会失败的 Page 测试**

用既有 Page 测试夹具固定到 `2026-09-25T10:47:00+08:00`。断言北极海战争在当前槽可打开详情，详情保留 `09:06` 起始时刻并标记候选；行程不包含该过去起始候选。断言没有事件的海域不在 `matrix.rows`，筛选后本段无行时 `rows` 为空但 `headerSlots` 仍为七项，并设置本段空状态。

- [x] **Step 2: 运行 Page 测试确认失败**

Run: `npm test -- tests/pages/major-event-page.test.ts`

Expected: 候选不在当前槽、详情或行程边界断言 FAIL；空海域仍可见。

- [x] **Step 3: 实作 Page 候选数据流和精简行**

保留 `forecastMajorEvents` 输出给行程和查下一次；用 `forecastOngoingMajorEvents` 为矩阵当前槽增加候选。把候选和未来事件都转换成可打开详情的 `eventItems`。矩阵只保留筛选后至少有一项槽位事件的海域；删除无结果时退回所有海域的逻辑。Page 数据在 rows 为空时仍保留 Presenter 的 `headerSlots`。

- [x] **Step 4: 重跑 Page 测试**

Run: `npm test -- tests/pages/major-event-page.test.ts`

Expected: PASS；日期范围、分段、筛选、详情快照与素材 fallback 测试继续通过。

### Task 4: WXML 状态提示、空段提示与最终验收

**Files:**

- Modify: `miniprogram/subpkg-trade/pages/popularity/index.wxml`
- Modify: `miniprogram/subpkg-trade/pages/popularity/index.wxss`
- Modify: `tests/pages/major-event-page.test.ts`
- Modify: `tools/miniprogram-review/scenarios/major-event-filter-empty.json`
- Modify: `tests/miniprogram-review/scenario.test.ts`

- [x] **Step 1: 先写 WXML 与 DevTools 场景契约测试**

断言栏头使用 `matrix.headerSlots`，候选事件具有独立的「可能進行」提示和无障碍名称；`matrix.rows.length === 0` 时仍显示时间栏头和本段空状态。空筛选场景设置筛选后短暂等待并截图，不依赖真实当前时间必有候选事件；Page 测试锁定空行与七个栏头。

- [x] **Step 2: 运行页面与场景测试确认失败**

Run: `npm test -- tests/pages/major-event-page.test.ts tests/miniprogram-review/scenario.test.ts`

Expected: 栏头、候选标记、本段空状态的新断言 FAIL。

- [x] **Step 3: 实作候选标记及空矩阵段**

矩阵候选 green tag 显示「可能進行」小标记，事件名称维持原标签；详情附带可能已因预算或城镇活动结束的说明。时间栏头由 `matrix.headerSlots` 渲染。Rows 为空时在栏头下显示「此七個時段暫無預測」，不恢复无事件海域。

- [x] **Step 4: 更新 DevTools 场景**

更新空筛选场景，在筛选后截图检查本段空状态；保留矩阵场景既有详情、行程、筛选、范围和查下一次动作。DevTools 对动态空状态节点的 selector 查询出现自动化超时，因此截图由人工检查，候选定位、空海域过滤与七栏头由固定时间的 Domain／Presenter／Page 测试验证。

- [x] **Step 5: 执行专项测试及页面迭代验收**

Run: `npm test -- tests/domain/major-event-forecast.test.ts tests/presenters/major-event-presenter.test.ts tests/pages/major-event-page.test.ts tests/miniprogram-review/scenario.test.ts`

Run: `npm run devtools:doctor`

Run: `npm run devtools:changed -- --mode iterate --summary "顯示目前可能進行的大流行並隱藏空海域"`

Run: `npm run devtools:run -- --scenario major-event-filter-empty`

Expected: domain 边界、Presenter 候选定位、Page 行过滤及场景契约通过；截图中的黄当前栏、绿事件标签、本段空状态和有事件海域行符合规格。

- [x] **Step 6: 最终验收与合并门禁**

Run: `npm run devtools:changed -- --mode final --summary "大流行可能進行候選與精簡矩陣最終驗收" --note "僅目前時段顯示兩小時內可能持續候選，實際狀態非即時確認。"`

Run: `npm run verify`

Run: `git diff --check`

报告需如实记录 320／375／393／430px 精确宽度未被自动化预设覆盖的情况。产品代码提交前，展示变更文件、验证结果和提交信息，等待用户确认。
