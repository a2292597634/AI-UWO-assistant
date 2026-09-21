# 新增三个冒险被动技能实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (\`- [ ]\`) syntax for tracking.

**Goal:** 将「採集險地」「平定險地」「觀察險地」及其图示、十级效果和航海士挂载关系加入 Canonical 主数据，生成运行时资料并发布云端素材。

**Architecture:** 三个技能实体写入 data/master/skills.json，使用独立 workOrderId 来源；关系追加到目标航海士现有 sk5 冒险技能组末尾，保持 level 与 unlockLevel 语义分离。截图裁切成技能 PNG 后进入 data/assets/staging、CloudBase manifest 和现有运行时依赖生成流程。

**Tech Stack:** JSON、TypeScript、Vitest、Sharp、现有 data:check、data:generate 和 CloudBase asset pipeline。

## Global Constraints

- archive/ 只读；手动资料只写入 data/master/，生成产物不手动修改。
- 新增名称、说明和文档使用繁体中文；Canonical ID、文件名、命令和 API 保留英文。
- 当前分支为 codex/phase-35-add-adventure-passive-skills，完成验证后才合并 main。
- 不新增或升级依赖，不修改无关文件或已有未追踪文件。
- 关系固定为 kind=passive、sourceGroup=sk5、slot=2、unlockLevel=1、level=1；十级效果只写入 levelInfo。
- 修改 data/master/ 后运行 npm run data:check；生成后运行 npm run generate:check，最终运行 npm run verify。

---

### Task 1: 先写 Canonical 数据回归测试

**Files:**
- Create: tests/data-pipeline/adventure-passive-skills.test.ts

**Interfaces:**
- Consumes: data/master/skills.json、data/master/officers.json、data/master/custom-officers.json。
- Produces: 三个技能实体和八名目标航海士关系的稳定行为约束。

- [x] **Step 1: Write the failing test**

读取三份 JSON，定义三个固定技能：

~~~text
skill_wo_offline_adventure_collect_hazard | 採集險地 | 探險中採集力增加3。 | officer_chabbd046, officer_chaabd005
skill_wo_offline_adventure_battle_hazard | 平定險地 | 探險中戰鬥力增加3。 | officer_custom_piyale, officer_chaabd009, officer_chaabd010
skill_wo_offline_adventure_observation_hazard | 觀察險地 | 探險中觀察力增加3。 | officer_chasbd003, officer_chacbd017, officer_chast099
~~~

测试必须断言：每项技能的 categoryId 是 skill_category_adventure、iconId 是 null、sourceRefs 只有非空 workOrderId，且 levelInfo 完全为「Lv1: 3 | Lv2: 5 | Lv3: 6 | Lv4: 7 | Lv5: 9 | Lv6: 10 | Lv7: 11 | Lv8: 12 | Lv9: 13 | Lv10: 15」；每名目标航海士都有对应的 passive/sk5/slot 2/unlockLevel 1/level 1 关系，并且关系是该航海士 sk5 数组的最后一项。

- [x] **Step 2: Run test to verify it fails**

Run: npm.cmd test -- tests/data-pipeline/adventure-passive-skills.test.ts

Expected: FAIL，因为三个技能和八笔关系尚不存在；失败来自数据断言而不是导入错误。

- [x] **Step 3: Commit**

不单独提交失败测试，测试和 Canonical 数据在同一功能提交中提交。

### Task 2: 写入技能实体与航海士关系

**Files:**
- Modify: data/master/skills.json
- Modify: data/master/officers.json
- Modify: data/master/custom-officers.json
- Test: tests/data-pipeline/adventure-passive-skills.test.ts

**Interfaces:**
- Consumes: Task 1 的三个技能定义与目标 ID。
- Produces: 三个离线技能实体和八笔 sk5 关系。

- [x] **Step 1: Write the minimal Canonical records**

在 data/master/skills.json 末尾追加三个对象，使用以下稳定 ID 与 workOrderId：

~~~text
skill_wo_offline_adventure_collect_hazard
wo_offline_adventure_passive_skills:collect_hazard

skill_wo_offline_adventure_battle_hazard
wo_offline_adventure_passive_skills:battle_hazard

skill_wo_offline_adventure_observation_hazard
wo_offline_adventure_passive_skills:observation_hazard
~~~

每项写入对应繁体名称、说明、categoryId=skill_category_adventure、固定十级 levelInfo 和 iconId=null；不使用 voyageTw 来源或重复 ID。

- [x] **Step 2: Append relations without reordering**

在目标航海士 skills 数组末尾追加与目标对应的以下对象：

~~~json
{
  "skillId": "skill_wo_offline_adventure_collect_hazard",
  "kind": "passive",
  "sourceGroup": "sk5",
  "slot": 2,
  "unlockLevel": 1,
  "level": 1
}
{
  "skillId": "skill_wo_offline_adventure_battle_hazard",
  "kind": "passive",
  "sourceGroup": "sk5",
  "slot": 2,
  "unlockLevel": 1,
  "level": 1
}
{
  "skillId": "skill_wo_offline_adventure_observation_hazard",
  "kind": "passive",
  "sourceGroup": "sk5",
  "slot": 2,
  "unlockLevel": 1,
  "level": 1
}
~~~

挂载映射固定为：collect_hazard → officer_chabbd046、officer_chaabd005；battle_hazard → officer_custom_piyale、officer_chaabd009、officer_chaabd010；observation_hazard → officer_chasbd003、officer_chacbd017、officer_chast099。皮雅利·帕夏只改 custom-officers.json，其余七名航海士只改 officers.json。

- [x] **Step 3: Run focused test and data check**

Run: npm.cmd test -- tests/data-pipeline/adventure-passive-skills.test.ts

Expected: PASS。

Run: npm.cmd run data:check

Expected: schema 和 data audit 通过，archive/ 无修改。

### Task 3: 裁切并接入三个技能图示

**Files:**
- Create: data/assets/staging/skill_wo_offline_adventure_collect_hazard.png
- Create: data/assets/staging/skill_wo_offline_adventure_battle_hazard.png
- Create: data/assets/staging/skill_wo_offline_adventure_observation_hazard.png
- Test: tests/data-pipeline/adventure-passive-skills.test.ts

**Interfaces:**
- Consumes: 当前会话提供的三张带说明面板 PNG 截图。
- Produces: 三个与 Canonical ID 同名、可由 Sharp 解码的 PNG 源素材。

- [x] **Step 1: Write the failing asset assertion**

在测试中使用 Sharp 读取三个 staging 文件，断言 format=png 且宽高均为正数；运行时应因文件不存在而失败。

- [x] **Step 2: Run test to verify it fails**

Run: npm.cmd test -- tests/data-pipeline/adventure-passive-skills.test.ts

Expected: FAIL with missing staging file。

- [x] **Step 3: Crop and validate the icons**

用已安装的 Sharp 从每张截图左上方图示区域裁出独立 PNG，保存到上述三个路径；结果不得包含说明文字、面板边框或问号按钮。

- [x] **Step 4: Run test and local asset setup**

Run: npm.cmd test -- tests/data-pipeline/adventure-passive-skills.test.ts

Expected: PASS。

Run: npm.cmd run assets:setup

Expected: asset-dependencies.json 为三个新技能解析对应文件，现有依赖不被删除。

### Task 4: 发布云端素材并生成运行时资料

**Files:**
- Modify (generated): data/assets/asset-dependencies.json
- Modify (generated): data/assets/cloudbase-manifest.json
- Modify (generated): miniprogram/generated、miniprogram/subpkg-detail、miniprogram/subpkg-fleet/generated、miniprogram/subpkg-maintenance
- Modify (generated): cloudfunctions/officer-custom/reference-data.json、cloudfunctions/officer-maintenance/reference-data.json

**Interfaces:**
- Consumes: Task 2 的 Canonical 数据和 Task 3 的 PNG。
- Produces: CloudBase manifest、技能图示依赖、技能／名鉴／详情运行时模块和维护索引。

- [x] **Step 1: Publish staged PNG files**

Run: npm.cmd run assets:publish

Expected: CloudBase 成功发布，manifest 包含三个新文件的 cloudPath、publicUrl、fileID 和 SHA-256；不手动伪造云端字段。

- [x] **Step 2: Generate runtime data**

Run: npm.cmd run data:generate

Expected: 运行时技能字典和八名目标航海士详情包含新资料，图示路径指向 manifest 中的文件。

- [x] **Step 3: Run deterministic generation check**

Run: npm.cmd run generate:check

Expected: 生成后无生成文件差异，退出码为 0。

### Task 5: 全量验证、提交并合并

**Files:**
- Verify: 本功能相关 tracked files；保留既有 artifacts/ 和两份未追踪 plans 文件。
- Modify: tests/pages/adventure-fleet-page.test.ts、tests/pages/trade-detail-page.test.ts、tests/pages/trade-page.test.ts（同步新增目标与可复用 CloudBase 素材地址断言）

**Interfaces:**
- Consumes: Task 1–4 的测试、Canonical 数据、素材清单和生成产物。
- Produces: 可合并的功能提交并快进合并到 main。

- [x] **Step 1: Run focused regression tests**

Run: npm.cmd test -- tests/data-pipeline/adventure-passive-skills.test.ts tests/data-pipeline/asset-dependencies.test.ts tests/data-pipeline/full-data-integrity.test.ts

Expected: PASS，无本功能相关 warning。

- [x] **Step 2: Run the full repository gate**

Run: npm.cmd run verify

Expected: format、lint、typecheck、全量测试、runtime network、package size、assets、data check 和 generate check 全部通过。

- [x] **Step 3: Review status and diff**

Run: git status --short --branch；git diff --stat main...HEAD

Expected: archive/ 无变更；既有未追踪文件不在提交中；差异只含设计／计划、测试、data/master、三个图示发布结果和生成文件。

- [x] **Step 4: Commit implementation**

Run:

~~~powershell
git add -- data/master/skills.json data/master/officers.json data/master/custom-officers.json tests/data-pipeline/adventure-passive-skills.test.ts tests/pages/adventure-fleet-page.test.ts tests/pages/trade-detail-page.test.ts tests/pages/trade-page.test.ts data/assets/asset-dependencies.json data/assets/cloudbase-manifest.json miniprogram/generated miniprogram/subpkg-detail miniprogram/subpkg-fleet/generated/fleet-officers.js miniprogram/subpkg-maintenance/maintenance-officers.js cloudfunctions/officer-custom/reference-data.json cloudfunctions/officer-maintenance/reference-data.json docs/superpowers/plans/2026-09-21-adventure-passive-skills.md
git commit -m "feat: 新增險地冒險被動技能"
~~~

Expected: 只有列出的 tracked files 被提交；ignored staging PNG 不进入 Git，但已由 CloudBase manifest 记录云端版本。

- [x] **Step 5: Merge into main**

Run:

~~~powershell
git switch main
git merge --ff-only codex/phase-35-add-adventure-passive-skills
~~~

Expected: main fast-forward 到功能提交，用户原有未追踪文件保留；最后再次运行 git status --short --branch。
