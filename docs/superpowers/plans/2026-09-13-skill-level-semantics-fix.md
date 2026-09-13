# 技能等级语义与航海士名鉴显示修复计划

> 执行方式：在当前隔离分支内直接执行，完成验证后再提交并等待合并确认。

## 目标

修正航海士技能关系中技能等级与解锁等级的字段语义，落实 `Lv.1` 不显示角标的规则，补齐詹姆士蘭開斯特的三项主动技能，并保证名鉴列表与详情页继续按 `kind` 区分主动／被动。

## 根因

原始 `json_char.js` 中：

- `skill.sk0` 至 `skill.sk5` 的值是技能解锁门槛；
- `slv.*` 的值是技能自身等级；
- 当前导入器将两者写反，导致旧资料的 10/30/50/70 被当成图标等级；
- 图标组件以 `level > 0` 显示角标，导致 `Lv.1` 也显示。

## 实施步骤

### 1. 先写失败测试

- 在 `tests/import/transform-officers.test.ts` 增加断言：原始 `skill.sk2.skill400581 = 50`、`slv.skill400581 = 2` 必须归一化为 `unlockLevel: 50`、`level: 2`。
- 在 `tests/components/skill-icon.test.ts` 将规格断言改为 `level > 1`，先确认现有模板测试失败。
- 在 `tests/data-contract/canonical-relations.test.ts` 增加 `level > 9` 时的校验测试。
- 在 `tests/data-pipeline/full-data-integrity.test.ts` 增加新航海士三项主动技能和技能等级断言。

### 2. 修正导入与校验

- 修改 `tools/import/transform-officers.ts`：嵌套 `skill.sk*` 写入 `unlockLevel`，`slv.*` 写入 `level`；缺少 `slv` 时技能等级归一化为 1；不再将未参与官方图标关系的顶层动态 `skill*` 当作关系等级覆盖。
- 更新 `tools/import/types.ts`、数据审计清单及相关说明，保持 `slv` 与 `skill.sk*` 的语义一致。
- 在 `tools/data-audit/validate-canonical-dataset.ts` 增加规范校验：canonical 技能 `level` 必须为 1–9 的整数；`unlockLevel` 保持独立字段，不能替代 `level`。

### 3. 修正权威主数据

- 只处理 `sourceRefs.voyageTw` 的旧航海士，依据 archive 原始记录重建每条关系的 `level` 与 `unlockLevel`；不修改 `archive/`，不覆盖手动维护记录。
- 在 `data/master/officers.json` 为 `詹姆士蘭開斯特` 增加三条主动关系：
  - `行動封鎖` → `skill_skill400591`，`active`，技能等级 1；
  - `攻擊力增加` → `skill_skill400471`，`active`，技能等级 2；
  - `絕對反擊` → `skill_skill300004`，`active`，技能等级 1。
- 三项技能的解锁字段按同技能、同主动技能槽位的已审核参考资料填写，且不使用用户括号中的技能等级作为解锁等级。
- 运行 `npm run data:check`，确认 10/30/50/70 只出现在 `unlockLevel`，不出现在 `level`。

### 4. 修正生成与界面

- 修改 `miniprogram/components/skill-icon/index.wxml`：仅 canonical `level > 1` 时显示 `Lv.N`。
- 保持 `miniprogram/pages/catalog/index.wxml` 使用 `skillLevels`（仅 canonical 技能等级），保持主动／被动分隔线结构。
- 检查详情 presenter 与详情模板，确保 `item.level` 和 `item.unlockLevel` 分别显示，不互换。
- 运行 `npm run data:generate`，不手改 `miniprogram/generated/` 或其他生成文件。

### 5. 全量验证

依次运行相关定向测试，再运行 `npm run verify`。核对变更文件和验证结果后，向用户展示拟用提交信息，等待提交确认；未获确认前不提交、不合并。

## 验收标准

1. 所有 canonical 技能关系的 `level` 都是 1–9 的技能等级，旧的 10/30/50/70 不再进入图标角标。
2. `level === 1` 不显示角标，`level > 1` 显示对应 `Lv.N`。
3. 詹姆士蘭開斯特在名鉴中有 3 项主动技能、11 项被动技能，中间只有分隔线；三项主动技能等级分别为 1/2/1。
4. 札克·布魯姆仍有 3 项主动技能。
5. 详情页可同时表达技能等级与解锁等级，两个字段不会互换。
6. `npm run verify` 全部通过。
