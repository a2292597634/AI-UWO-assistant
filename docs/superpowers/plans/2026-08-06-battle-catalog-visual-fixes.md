# 戰鬥配隊與航海士名鑑視覺修復實施計畫

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task with review checkpoints.

**Goal:** 修復戰鬥配隊的排除與技能互動，補齊技能說明、技能等級與航海士視覺層，並讓名鑑技能欄在手機寬度下能呈現更多、更大的圖示。

**Architecture:** 保持 archive → data/master → miniprogram/generated 三層資料邊界。領域層新增「從目前船移除並加入全艦隊排除名單」的原子狀態轉換；頁面層沿用既有共享 skill-sheet 元件，技能描述與等級由 presenter/生成器預先投影，WXML 只負責呈現。艦隊視覺欄位沿用 buildOfficerVisuals，不另造一套圖示路徑規則。

**Tech Stack:** TypeScript、微信小程序 WXML/WXSS、Vitest、既有 runtime data generator、既有 skill-sheet 元件。

## Global Constraints

- 不修改 archive/；本次不需要修改 data/master/。
- 不手動修改 miniprogram/generated/；欄位變更必須修改 tools/data-pipeline/build-runtime-data.ts 後執行 npm run data:generate。
- 不新增、刪除或升級依賴。
- 所有新增介面文字與 fallback 文字使用繁體中文。
- 不使用 wx.request、wx.cloud、遠端 URL 或 Node.js API 作為 miniprogram/ 運行時依賴。
- 使用 codex/phase-9-battle-catalog-fixes 或同等 codex/phase-N-描述 分支；不可直接在 master 開發。
- 目前工作區已有包體清理相關未提交改動；不得 reset、checkout 或格式化那些無關文件，先以 git status --short 確認範圍。
- 每個資料、轉換、狀態邏輯遵循紅—綠—重構；UI 以頁面測試、WXML/WXSS 合約測試和微信開發者工具驗證。

## 已確認的根因與行為決策

- miniprogram/pages/fleet/index.ts:426-431 的 onBanOfficer 直接呼叫 banOfficer；miniprogram/domain/battle-fleet.ts:144-158 對仍在任一船上的航海士返回 officer-occupied，因此目前船卡上的排除按鈕必然失敗，頁面再把它顯示成「其他船隊中存在」。
- 排除按鈕採用一次原子操作：未鎖定的目前船航海士從目前船移除、加入 bannedOfficerIds；鎖定航海士仍返回 officer-locked，提示先解鎖。既有「移除」按鈕仍只移出目前船、不加入全局排除。
- filterBattleSkills 目前只有技能名、分類和圖示；資料已有 RuntimeSkill.d，所以技能選項新增 description。
- 技能行單擊改為打開共享 skill-sheet；原本手動選技能與自動模式雙擊加入目標會與單擊詳情衝突，改為行內明確的「選擇」/「加入目標」操作，避免依賴雙擊手勢。
- 航海士技能角標使用 canonical 關係的 level，不是 unlockLevel。level === 1 不顯示角標，其他值顯示 Lv.N。
- 名鑑技能欄保留約 320rpx 寬度；每個觸控格約 52rpx；圖示約 48rpx；正常資料最多可同時看見 3 個主動和 3 個被動圖示，更多仍透過橫向滾動和 +N 顯示。

---

### Task 1: 修復目前船航海士的排除狀態轉換

Files:
- Modify: miniprogram/domain/battle-fleet.ts
- Modify: miniprogram/pages/fleet/index.ts
- Test: tests/domain/battle-fleet.test.ts
- Test: tests/pages/fleet-page.test.ts

Interfaces:
- Add excludeOfficerFromShip(state: FleetState, shipId: string, officerId: string): FleetTransitionResult.
- Success removes officerId from ship.officerIds, removes it from lockedOfficerIds, adds it to removedOfficerIds once, and adds it to state.bannedOfficerIds once.
- A locked officer returns officer-locked without mutation. An officer not on the selected ship returns officer-not-found.

Steps:
- [ ] Write a failing domain test that adds an unlocked officer, calls excludeOfficerFromShip, and asserts current ship removal plus global ban.
- [ ] Write a failing test that locks the officer and asserts officer-locked with unchanged state.
- [ ] Run npm test -- tests/domain/battle-fleet.test.ts and confirm the new symbol is missing.
- [ ] Implement the smallest immutable transition, validating ship membership and lock before cloning/applying both changes.
- [ ] Change onBanOfficer to call the new transition; keep banOfficer unchanged for unoccupied officers.
- [ ] Add a page regression: load page, add officer to ship-1, switch auto, call onBanOfficer, assert current ship empty and bannedOfficers contains the officer.
- [ ] Run npm test -- tests/domain/battle-fleet.test.ts tests/pages/fleet-page.test.ts.

---

### Task 2: 接入戰鬥技能詳情層並保留可選技能操作

Files:
- Modify: miniprogram/contracts/battle-fleet.ts
- Modify: miniprogram/domain/battle-fleet.ts
- Modify: miniprogram/presenters/battle-fleet-presenter.ts
- Modify: miniprogram/pages/fleet/index.ts
- Modify: miniprogram/pages/fleet/index.wxml
- Modify: miniprogram/pages/fleet/index.wxss
- Modify: miniprogram/pages/fleet/index.json
- Test: tests/presenters/battle-fleet-presenter.test.ts
- Test: tests/pages/fleet-page.test.ts

Interfaces:
- Extend BattleSkillOption with description: string.
- Extend BattleFleetPageData with sheetSkill: SkillSheetView | null.
- Add page handlers onSheetDismiss, onReverseLookup, and onSkillSelect; onSkillTap becomes the single-tap detail handler.
- onSkillSelect sets manualSkillId in manual mode; in auto mode calls assignSkillToFirstOpenTarget and uses existing error messages.

Steps:
- [ ] Add a failing presenter assertion that manualSkills contains the full RuntimeSkill.d description.
- [ ] Add a failing page assertion that one onSkillTap opens sheetSkill with the selected skill ID.
- [ ] Run npm test -- tests/presenters/battle-fleet-presenter.test.ts tests/pages/fleet-page.test.ts and confirm the assertions fail.
- [ ] Set description: skill.d in filterBattleSkills. Add sheetSkill: null, register skill-sheet in fleet index.json, and render it with dismiss/reverselookup bindings.
- [ ] Keep the whole .skill-option row bound to onSkillTap. Add a right-side .skill-option__select action with catchtap=onSkillSelect and labels 選擇 / 加入目標.
- [ ] Render item.description beside the icon with a two-line clamp and a Traditional Chinese empty fallback. Remove the timestamp/double-tap assignment path only after explicit-action tests are green.
- [ ] Test dismiss, manual selection, auto target assignment, duplicate-target rejection, and reverse lookup to /pages/catalog/index?skillId=....
- [ ] Run npm test -- tests/presenters/battle-fleet-presenter.test.ts tests/pages/fleet-page.test.ts tests/presenters/skill-sheet.test.ts.

---

### Task 3: 將航海士技能等級投影到名鑑資料

Files:
- Modify: tools/data-pipeline/build-runtime-data.ts
- Modify: miniprogram/contracts/runtime-data.ts
- Modify: miniprogram/runtime/generated-modules.d.ts
- Test: tests/data-pipeline/build-runtime-data.test.ts
- Test: tests/runtime-contract/runtime-shapes.test.ts
- Modify tests/domain/catalog-query.test.ts and tests/presenters/catalog-presenter.test.ts only if the contract field is made required.

Interfaces:
- Add skillLevels?: Record<string, number> to RuntimeCatalogEntry and the generated catalog declaration.
- buildCatalog emits a skillLevels map for CanonicalSkillRelation.level values other than 1. The map key must be an activeSkills or passiveSkills ID; absent means level 1.
- Do not change activeSkills/passiveSkills from string arrays, so catalog query/filter logic remains unchanged.

Steps:
- [ ] Add a failing generator test: for officer_chast089, skill_skill200681 is 10, skill_skill203426 is 70, and skill_skill400591 is absent.
- [ ] Add runtime shape checks for integer skillLevels and valid officer skill IDs.
- [ ] Run npm test -- tests/data-pipeline/build-runtime-data.test.ts tests/runtime-contract/runtime-shapes.test.ts and confirm failure.
- [ ] Implement deterministic map insertion in canonical officer skill order; do not use unlockLevel.
- [ ] Run npm test -- tests/data-pipeline/build-runtime-data.test.ts tests/runtime-contract/runtime-shapes.test.ts tests/domain/catalog-query.test.ts tests/presenters/catalog-presenter.test.ts.
- [ ] Run npm run typecheck.

---

### Task 4: 放大名鑑技能欄並在技能圖示上顯示等級角標

Files:
- Modify: miniprogram/pages/catalog/index.wxml
- Modify: miniprogram/pages/catalog/index.wxss
- Modify: miniprogram/subpkg-detail/pages/detail/index.wxml
- Modify: miniprogram/subpkg-detail/pages/detail/index.wxss
- Test: tests/pages/catalog-page.test.ts
- Test: tests/pages/detail-page.test.ts

Interfaces:
- Catalog reads item.skillLevels[sid]; absent or 1 means no badge.
- Detail reads existing item.level; values other than 1 receive the same badge.
- Both use a relative icon wrapper and a high-contrast badge with text Lv.N.

Steps:
- [ ] Update catalog WXML/WXSS contract expectations from 88rpx hit cells / 32rpx icons / 176rpx rail to 52rpx / 48rpx / 320rpx, and add assertions for the level wrapper/badge.
- [ ] Run npm test -- tests/pages/catalog-page.test.ts tests/pages/detail-page.test.ts and confirm the new assertions fail.
- [ ] Wrap each catalog image/fallback in a relative icon wrapper, keep catchtap=onSkillIconTap, show Lv.N only when item.skillLevels[sid] > 1, and preserve +N overflow.
- [ ] Set .row-info right padding and .row-skills width/min-width to 320rpx; set each hit cell to 52rpx and each icon to 48rpx; keep row height at least 116rpx.
- [ ] Wrap both active and passive detail icons/fallbacks, preserve image-error datasets, and show the badge when item.level !== 1.
- [ ] Do not add officer level to the shared skill-sheet icon; that sheet represents the skill definition.
- [ ] Run npm test -- tests/pages/catalog-page.test.ts tests/pages/detail-page.test.ts.
- [ ] In微信開發者工具 verify a row with at least 3 active and 3 passive skills: six icons are larger/compact, overflow scrolls, and only non-level-one icons show badges.

---

### Task 5: 補齊戰鬥配隊航海士視覺資料與圖層

Files:
- Modify: tools/data-pipeline/build-runtime-data.ts
- Modify: miniprogram/contracts/runtime-data.ts
- Modify: miniprogram/runtime/generated-modules.d.ts
- Modify: miniprogram/presenters/battle-fleet-presenter.ts
- Modify: miniprogram/pages/fleet/index.ts
- Modify: miniprogram/pages/fleet/index.wxml
- Modify: miniprogram/pages/fleet/index.wxss
- Test: tests/data-pipeline/build-runtime-data.test.ts
- Test: tests/runtime-contract/runtime-shapes.test.ts
- Test: tests/presenters/battle-fleet-presenter.test.ts
- Test: tests/pages/fleet-page.test.ts

Interfaces:
- Extend RuntimeFleetOfficer with visualGradeId, typeId, and genderId; generated fleet declarations must match.
- buildFleetOfficers copies those canonical IDs without changing battle relation filtering.
- Extend BattleFleetOfficerView with visuals: OfficerVisualPaths, created by buildOfficerVisuals.

Steps:
- [ ] Add failing fixture assertions for Grade 6/type_class_2/gender_f, presenter paths framePath/rarityIconPath/typeIconPath, and fleet WXML layered nodes.
- [ ] Run the focused generator/runtime/presenter/page tests and confirm failure.
- [ ] Project the IDs and import buildOfficerVisuals in the battle presenter. Do not hardcode UI filenames in the fleet page.
- [ ] For current ship slots and candidate rows, render grade background behind portrait, then portrait, rarity icon and type icon. Keep compact contributor avatars unchanged unless layers fit without changing summary behavior.
- [ ] Track decoration failures independently so one missing frame/icon does not hide the portrait or name.
- [ ] Verify the six-column grid remains intact and run the focused tests again.

---

### Task 6: 重新生成資料並完成全量驗證

Files:
- Generated by command only: miniprogram/generated/catalog.js
- Generated by command only: miniprogram/generated/fleet-officers.js
- Generated by command only: miniprogram/generated/dataset-meta.js if the deterministic generator changes it
- Generated by command only: miniprogram/subpkg-detail/details-*.js only if the normal generator rewrites them
- No changes: archive/** and data/master/**

Steps:
- [ ] Run npm run data:generate. Confirm catalog entries contain skillLevels and fleet entries contain visual IDs; never manually edit generated files.
- [ ] Run npm run data:check.
- [ ] Run npm run check:runtime-network.
- [ ] Run npm run generate:check.
- [ ] Run the focused combined test command covering domain/battle-fleet, pages/fleet-page, presenters/battle-fleet-presenter, presenters/catalog-presenter, pages/catalog-page, pages/detail-page, data-pipeline/build-runtime-data and runtime-contract/runtime-shapes.
- [ ] Run npm run verify. If current package-size cleanup changes the baseline, report it separately and do not fold unrelated fixes into this task.
- [ ] Inspect git status --short, git diff --stat and git diff --name-only -- archive data/master. Archive and data/master must remain unchanged.
- [ ] Before commit, show changed files, verification results and proposed message fix(ui): repair fleet and officer skill visuals; wait for user confirmation per AGENTS.md.

## Coverage Checklist

- [ ] Current unlocked officer exclusion removes from the current ship and enters the global exclusion list.
- [ ] Locked officer exclusion remains blocked with a correct Traditional Chinese message.
- [ ] One tap on a fleet skill row opens the shared ten-level skill detail sheet.
- [ ] Manual skill selection and auto target assignment remain available through explicit actions.
- [ ] Fleet skill rows include the skill description beside the icon.
- [ ] Catalog rows can show up to 3 active + 3 passive skill icons with compact spacing.
- [ ] Catalog and detail officer skill icons show Lv.N only when current skill level is not 1.
- [ ] Fleet officer cards show grade background, rarity icon, type icon and portrait fallback.
- [ ] No dependency, archive, master-data or runtime-network boundary changes.
