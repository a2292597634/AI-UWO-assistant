# UI/UX 重新审计后续实施计划

> **给 agentic worker：** 实施本计划时，建议使用 `superpowers:subagent-driven-development` 或 `superpowers:executing-plans`，按任务逐项执行；每个任务完成后独立验证并提交。

**目标：** 将 UI/UX 交接报告拆成可独立验收的实施批次，修复 P1-1、P1-2、P1-3、P1-4、P1-6、P2-1、P2-2、P2-3，并完成 P2-4 窄屏验收。

**架构：** 建议分为 7 次代码变更和 1 次集中验收。先处理目标状态与操作热区，再处理结果面板、航海士操作入口和目录交互，最后做配置流程与 Design Token 收敛。P2-1 采用“本次涉及页面优先”的渐进迁移，不做全仓库一次性重写。

**技术栈：** 微信小程序 WXML/WXSS/TypeScript、Vitest、Design Foundation Token、现有 Fleet Domain/Presenter/Controller。

## 全局约束

- 编码前完整阅读 `docs/superpowers/specs/2026-08-09-design-foundation-design.md`。
- 只使用繁体中文界面文案；WXML/WXSS 类名保持现有英文 BEM 风格。
- 不修改 `archive/`、`data/master/`、`miniprogram/generated/`。
- 不新增依赖，不引入 `wx.request`、`wx.cloud`、远程 URL 或 Node.js Runtime API。
- 保持现有配队方案“预览 → 应用 → 撤销”机制和状态指纹校验不变。
- 不修改 P1-5；冒险页必须继续保留 `default-expanded="{{true}}"`。
- 每个批次先运行相关测试，再运行 `npm run verify` 和 `git diff --check`。
- commit 前展示变更文件、验证结果和拟用 message，等待用户确认。
- 真机或 DevTools 最终覆盖 320px、375px、393px、430px；不能用自动化测试替代视觉验收。

## 推荐顺序与批次边界

### Task 1：`fleet-target-input-guard`（P1-3 + P1-4）

**目的：** 先统一战斗与冒险目标行的可操作性，并阻止战斗页在无有效目标时重新计算。

**Files：**

- Modify: `miniprogram/presenters/battle-fleet-presenter.ts`
- Modify: `miniprogram/pages/fleet/index.ts`
- Modify: `miniprogram/pages/fleet/index.wxml`
- Modify: `miniprogram/pages/fleet/index.wxss`
- Modify: `miniprogram/pages/adventure-fleet/index.wxml`
- Modify: `miniprogram/pages/adventure-fleet/index.wxss`
- Test: `tests/presenters/battle-fleet-presenter.test.ts`
- Test: `tests/pages/fleet-page.test.ts`
- Test: `tests/pages/adventure-fleet-page.test.ts`

**实施要点：**

- 在 `BattleFleetPageData` 增加 `canRecalculate`，定义为至少有一个 `skillId !== null` 的目标。
- Presenter、WXML 和 `onRecalculate` Controller 三层都保留校验；无效时显示“请先設定至少一個有效的戰鬥技能目標”之类的下一步提示。
- 战斗和冒险目标行统一为至少 `88rpx` 高；删除操作使用真正的 `<button>`，不再用裸 `<text>` 承担唯一操作入口。
- 等级输入、删除、新增目标、重新计算均使用 Design Foundation 的操作字号和热区；禁用按钮必须保留原因说明。
- 不改变目标数据结构、Solver 规则或冒险页技能追踪默认展开状态。

**验证：**

```powershell
npm test -- tests/presenters/battle-fleet-presenter.test.ts tests/pages/fleet-page.test.ts tests/pages/adventure-fleet-page.test.ts
npm run verify
git diff --check
```

### Task 2：`fleet-context-density`（P1-6）

**目的：** 删除战斗页编辑区重复的舰船上下文，减少首屏信息密度，同时保留顶部全局定位信息。

**Files：**

- Modify: `miniprogram/pages/fleet/index.wxml`
- Modify: `miniprogram/pages/fleet/index.wxss`
- Test: `tests/pages/fleet-page.test.ts`

**实施要点：**

- 保留顶部 `fleet-context` 的舰船名称、状态和容量信息。
- 删除 `ship-editor` 内重复的 `section-heading` 舰船标题、人数和状态展示。
- 保留 `mode-tabs`、舰船切换条、手动配队和自动配队行为不变。
- 增加结构测试，确保主展示只保留一份舰船上下文，不改变自动配队、手动配队和切船事件。

**验证：**

```powershell
npm test -- tests/pages/fleet-page.test.ts
npm run verify
git diff --check
```

### Task 3：`fleet-result-preview-robustness`（P1-2）

**目的：** 让战斗结果预览脱离主 `scroll-view`，并让面板内容和底部操作区在真机上稳定工作。

**Files：**

- Modify: `miniprogram/pages/fleet/index.wxml`
- Modify: `miniprogram/components/result-preview-sheet/index.wxml`
- Modify: `miniprogram/components/result-preview-sheet/index.wxss`
- Test: `tests/pages/fleet-page.test.ts`
- Test: `tests/pages/adventure-fleet-page.test.ts`
- Test: `tests/presenters/fleet-proposal-presenter.test.ts`

**实施要点：**

- 将战斗页 `<result-preview-sheet>` 放到主 `fleet-scroll` 外；冒险页现有挂载位置作为参考，不改变其业务事件。
- 组件内部拆分为标题、可滚动内容区和底部操作区；可滚动内容区使用原生 `<scroll-view scroll-y>`。
- 面板最大高度保持约 `80～82vh`，底部操作区使用 `env(safe-area-inset-bottom)`。
- 遮罩和面板保持页面级层级，不能被 `fleet-scroll` 裁切；取消、应用、撤销事件名称和 payload 不变。
- 加入长目标列表结构契约，避免未来把内容重新放回主滚动区。

**验证：**

```powershell
npm test -- tests/pages/fleet-page.test.ts tests/pages/adventure-fleet-page.test.ts tests/presenters/fleet-proposal-presenter.test.ts
npm run verify
git diff --check
```

人工验收重点：长方案独立滚动、背景不滚动、iPhone 底部安全区不遮挡取消/应用、面板不被主滚动区裁切。

### Task 4：`fleet-action-surface`（P1-1）

**目的：** 把航海士常驻的三按钮改为单一入口加页面级上下文 Bottom Sheet，消除 5 列槽位中的窄按钮和危险误触。

**Files：**

- Modify: `miniprogram/components/officer-action-sheet/index.ts`
- Modify: `miniprogram/components/officer-action-sheet/index.wxml`
- Modify: `miniprogram/components/officer-action-sheet/index.wxss`
- Modify: `miniprogram/pages/fleet/index.ts`
- Modify: `miniprogram/pages/fleet/index.wxml`
- Modify: `miniprogram/pages/fleet/index.wxss`
- Modify: `miniprogram/pages/adventure-fleet/index.ts`
- Modify: `miniprogram/pages/adventure-fleet/index.wxml`
- Modify: `miniprogram/pages/adventure-fleet/index.wxss`
- Modify: `miniprogram/pages/fleet/index.json`
- Modify: `miniprogram/pages/adventure-fleet/index.json`
- Test: `tests/architecture/fleet-shared-components.test.ts`
- Test: `tests/pages/fleet-page.test.ts`
- Test: `tests/pages/adventure-fleet-page.test.ts`

**实施要点：**

- 每个卡片/槽位只保留一个“更多操作”入口；入口热区至少 `88rpx × 88rpx`，不隐藏操作文字。
- 页面只挂载一个 Bottom Sheet，状态至少包含当前航海士、当前状态、可用操作、禁用原因和是否允许排除。
- 点击遮罩或“取消”关闭；点击卡片主体只打开面板，不直接触发锁定、移除或排除。
- 锁定、移除、排除继续通过现有 `lock`、`remove`、`ban` 事件交给页面 Controller；不移动 Domain 逻辑。
- “排除”使用 `ui-button--danger`，锁定成员、容量已满、不可移除等情况必须有明确禁用反馈。
- 更新现有架构测试中关于“三个常驻操作按钮”和 slot 隐藏文字的旧断言，改为验证单一入口、Bottom Sheet、事件转发和热区。

**验证：**

```powershell
npm test -- tests/architecture/fleet-shared-components.test.ts tests/pages/fleet-page.test.ts tests/pages/adventure-fleet-page.test.ts
npm run verify
git diff --check
```

人工验收重点：375px 下五列槽位可准确打开操作面板；点击航海士主体不会误触危险动作；面板不受主页面滚动裁切。

### Task 5：`catalog-touch-targets`（P2-3，并顺带完成目录页 Token 第一轮迁移）

**目的：** 放大目录技能入口，同时只在同一页面完成直接相关的 Design Token 收敛，避免为一个 52rpx 热区单独反复改同一文件。

**Files：**

- Modify: `miniprogram/pages/catalog/index.wxml`
- Modify: `miniprogram/pages/catalog/index.wxss`
- Test: `tests/pages/catalog-page.test.ts`
- Test: `tests/presenters/catalog-presenter.test.ts`

**实施要点：**

- 技能图标保留现有视觉尺寸，但外层点击区域提升到至少 `88rpx` 高；优先让整个技能标签承担点击责任。
- 继续使用 `catchtap`，避免技能点击冒泡触发行点击；保持技能详情与反向查询行为不变。
- 多技能仍显示前几个技能和 `+N`，不扩展目录数据模型。
- 同次只替换目录页本次触及的局部硬编码颜色、字号、间距和圆角为现有 `--uwo-*` Token；不顺手重写详情页或首页。

**验证：**

```powershell
npm test -- tests/pages/catalog-page.test.ts tests/presenters/catalog-presenter.test.ts
npm run verify
git diff --check
```

### Task 6：`config-flow-sharing`（P2-2）

**目的：** 抽取战斗和冒险配置管理的重复流程，统一保存、另存、重命名、冲突、删除和未保存拦截行为。

**Files：**

- Create: `miniprogram/presenters/config-management-presenter.ts`
- Create: `miniprogram/components/config-list-modal/index.ts`
- Create: `miniprogram/components/config-list-modal/index.wxml`
- Create: `miniprogram/components/config-list-modal/index.wxss`
- Create: `miniprogram/components/config-list-modal/index.json`
- Create: `miniprogram/components/config-name-modal/index.ts`
- Create: `miniprogram/components/config-name-modal/index.wxml`
- Create: `miniprogram/components/config-name-modal/index.wxss`
- Create: `miniprogram/components/config-name-modal/index.json`
- Create: `miniprogram/components/config-conflict-modal/index.ts`
- Create: `miniprogram/components/config-conflict-modal/index.wxml`
- Create: `miniprogram/components/config-conflict-modal/index.wxss`
- Create: `miniprogram/components/config-conflict-modal/index.json`
- Modify: `miniprogram/components/config-bar/index.ts`
- Modify: `miniprogram/components/config-bar/index.wxml`
- Modify: `miniprogram/components/config-bar/index.wxss`
- Modify: `miniprogram/components/config-bar/index.json`
- Modify: `miniprogram/pages/fleet/index.ts`
- Modify: `miniprogram/pages/fleet/index.wxml`
- Modify: `miniprogram/pages/fleet/index.wxss`
- Modify: `miniprogram/pages/adventure-fleet/index.ts`
- Modify: `miniprogram/pages/adventure-fleet/index.wxml`
- Modify: `miniprogram/pages/adventure-fleet/index.wxss`
- Modify: `miniprogram/pages/fleet/index.json`
- Modify: `miniprogram/pages/adventure-fleet/index.json`
- Test: `tests/fleet-config/fleet-config-service.test.ts`
- Test: `tests/fleet-config/fleet-config-error.test.ts`
- Test: `tests/pages/fleet-page.test.ts`
- Test: `tests/pages/adventure-fleet-page.test.ts`

**实施要点：**

- 先列出现有战斗/冒险流程的状态和动作，再抽取共享 Presenter/Modal；共享接口必须覆盖 `load`、`new`、`save`、`saveAs`、`rename`、`delete`、`exit` 和 `conflict`。
- 页面 Controller 只保留页面差异和业务状态写回，不改变 Fleet Domain、Config Service、Cloud Function 或配队算法。
- 登录、游客、冲突、删除和未保存提醒的文案与状态行为统一。
- 本批次不混入任何配队 Solver 或队伍计算逻辑。

**验证：**

```powershell
npm test -- tests/fleet-config tests/pages/fleet-page.test.ts tests/pages/adventure-fleet-page.test.ts
npm run verify
git diff --check
```

### Task 7：`design-token-convergence`（P2-1，本审计范围内的第二轮迁移）

**目的：** 在前六批稳定后，收敛战斗、冒险和共享浮层中本次高频触及的旧样式；不追求一次性清空全仓库历史硬编码。

**Files：**

- Modify: `miniprogram/pages/fleet/index.wxss`
- Modify: `miniprogram/pages/adventure-fleet/index.wxss`
- Modify: `miniprogram/components/officer-action-sheet/index.wxss`
- Modify: `miniprogram/components/result-preview-sheet/index.wxss`
- Modify: `miniprogram/components/config-bar/index.wxss`
- Modify: `tests/architecture/design-foundation.test.ts`（仅在新增契约需要保护时）
- Test: `tests/pages/fleet-page.test.ts`
- Test: `tests/pages/adventure-fleet-page.test.ts`
- Test: `tests/architecture/design-foundation.test.ts`

**实施要点：**

- 只替换主要背景、面板、按钮、边框、状态色、字号、间距和圆角；新样式不得引入新的局部颜色。
- 新增或改动的按钮使用 `.ui-button` 变体；重要操作最小高度 `88rpx`，操作文字不小于 `22rpx`。
- 状态继续同时提供文字语义和状态类，不以颜色单独表达成功、警告或错误。
- 面板、固定底部操作区和长文字遵循安全区与窄屏规则。
- 旧页面未触及的历史样式记录为后续渐进任务，不在本批次夹带修改。

**验证：**

```powershell
npm test -- tests/architecture/design-foundation.test.ts tests/pages/fleet-page.test.ts tests/pages/adventure-fleet-page.test.ts
npm run verify
git diff --check
```

### Task 8：`detail-narrow-screen-qa`（P2-4 集中验收）

**目的：** 完成详情页和本轮受影响页面的 320/375/393/430px 人工验收；只修复实际发现的问题。

**Files：**

- Read/Verify: `miniprogram/pages/detail/index.wxml`
- Read/Verify: `miniprogram/pages/detail/index.wxss`
- Read/Verify: `miniprogram/components/skill-sheet/index.wxml`
- Read/Verify: `miniprogram/components/skill-sheet/index.wxss`
- Modify only if a concrete issue is reproduced: `miniprogram/pages/detail/index.wxss`
- Modify only if a concrete issue is reproduced: `miniprogram/components/skill-sheet/index.wxss`
- Record: `docs/audits/2026-08-10-ui-ux-narrow-screen-acceptance.md`

**验收矩阵：**

| 页面/组件 | 320px | 375px | 393px | 430px |
|---|---:|---:|---:|---:|
| 详情页头像与身份网格 | 检查 | 检查 | 检查 | 检查 |
| 技能名称与技能卡片 | 检查 | 检查 | 检查 | 检查 |
| 技能详情面板独立滚动 | 检查 | 检查 | 检查 | 检查 |
| 战斗结果预览与底部安全区 | 检查 | 检查 | 检查 | 检查 |
| 战斗/冒险目标行 | 检查 | 检查 | 检查 | 检查 |

**检查重点：**

- 不出现页面级横向溢出；
- 头像、身份网格和技能名称不被重要内容挤压或截断；
- 关闭、取消、应用和撤销按钮不被底部安全区遮挡；
- 面板滚动不会误触背景页面；
- 只记录真实复现的问题，不为最窄宽度牺牲常规宽度布局。

**最终验证：**

```powershell
npm run verify
git diff --check
```

## 明确不纳入本计划的内容

- P1-5 冒险页“技能追踪”默认展开；继续保留 `default-expanded="{{true}}"`。
- 配队算法、Solver、Domain 数据结构和方案预览/应用/撤销业务规则重构。
- `archive/`、`data/master/`、`miniprogram/generated/` 以及新增依赖。
- 为了适配 320px 而大范围重做常规宽度页面布局。

## 结论

推荐按上述 8 个批次执行：前 4 批完成 P1 核心风险，Task 5～7 完成 P2 的交互、配置复用和渐进式 Token 收敛，Task 8 做最终人工验收。每批都能单独 review、测试和回滚，且不会把高风险 Bottom Sheet、滚动层级和配置流程重构混在同一个变更中。
