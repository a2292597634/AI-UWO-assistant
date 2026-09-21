# 冒險分享圖航海士排列實作計畫

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 將冒險配隊分享圖改為按冒險、戰鬥、交易分組，組內依 `S → A → B → C` 排序，並將人物排列改為五欄。

**Architecture:** 僅調整分享圖的資料契約、Presenter、Canvas 版面測量與渲染標題。Presenter 使用冒險領域既有的 `ZONE_ORDER` 與 `getZoneLabel` 建立穩定分組；版面層只把冒險分組欄數改為五欄，戰鬥分享圖保持原有六欄與渲染流程。

**Tech Stack:** TypeScript、Vitest、微信小程序 Canvas 分享圖渲染器、Prettier、ESLint、TypeScript compiler。

## Global Constraints

- 代碼、測試、文檔與交互使用中文；WXML/WXSS 類名規則不適用於本次 Canvas 分享圖變更。
- `archive/` 只讀；不修改 `data/master/`、`miniprogram/generated/` 或任何生成資料。
- 不直接在 `master`/`main` 開發；使用 `codex/phase-39-adventure-share-order` 分支。
- 不新增、刪除或升級依賴；不使用 `wx.request`、`wx.cloud`、遠程 URL 或 Node.js Runtime API。
- 先以測試描述分組與五欄行為，再修改生產代碼；每個行為都要觀察到預期的紅燈後再進入綠燈。
- 頁面共享運行時變更完成後，執行既有冒險分享圖頁面驗收場景並保留 HTML 報告與截圖證據。
- 最終需通過 `npm run verify` 與 `git diff --check`；提交前展示變更文件、驗證結果與擬用提交信息。

---

### Task 1: 更新冒險分享資料契約與類型／稀有度排序

**Files:**
- Modify: `miniprogram/contracts/fleet-share.ts`
- Modify: `miniprogram/presenters/fleet-share-presenter.ts`
- Test: `tests/presenters/fleet-share-presenter.test.ts`

**Interfaces:**
- Consumes: `AdventureTypeZone`、`ZONE_ORDER`、`getZoneLabel`，以及 `AdventureFleetOfficer.zone` 與 `rarityName`。
- Produces: `AdventureFleetShareGroup { zone, zoneLabel, officers }`；`buildAdventureFleetShareViewModel` 返回固定類型順序和組內稀有度順序的 `groups`。

- [ ] **Step 1: 寫出混合類型與稀有度排序的失敗測試**

在 `tests/presenters/fleet-share-presenter.test.ts` 的冒險分享案例旁新增固定順序的測試資料與案例。測試輔助函式使用以下完整形狀，避免借用戰鬥航海士的 `RuntimeFleetOfficer`：

```ts
const adventureOfficer = (
  id: string,
  rarityName: string,
  typeId: string,
  typeName: string,
  zone: AdventureFleetOfficer['zone'],
): AdventureFleetOfficer => ({
  id,
  name: id,
  jobName: '航海士',
  rarityName,
  portraitPath: `/${id}.png`,
  visualGradeId: 'grade_4',
  typeId,
  typeName,
  genderId: 'gender_f',
  zone,
  adventureSkills: [],
})
```

測試案例使用以下艦隊順序，刻意讓類型與稀有度交錯，並讓兩名冒險 A 級航海士驗證同稀有度穩定排序：

```ts
it('冒險分享按冒險戰鬥交易分組，組內依 S 到 C 排序並保留同級配置順序', () => {
  const officers = [
    adventureOfficer('trade-c', 'C', 'type_class_2', '交易', 'trade'),
    adventureOfficer('adv-a', 'A', 'type_class_1', '冒險', 'adventure'),
    adventureOfficer('combat-b', 'B', 'type_class_3', '戰鬥', 'combat'),
    adventureOfficer('adv-s', 'S', 'type_class_1', '冒險', 'adventure'),
    adventureOfficer('trade-s', 'S', 'type_class_2', '交易', 'trade'),
    adventureOfficer('combat-c', 'C', 'type_class_3', '戰鬥', 'combat'),
    adventureOfficer('adv-a-2', 'A', 'type_class_1', '冒險', 'adventure'),
  ]
  const view = buildAdventureFleetShareViewModel(
    fleetWithOfficers([['trade-c', 'adv-a', 'combat-b', 'adv-s', 'trade-s', 'combat-c', 'adv-a-2']]),
    officers,
    {},
    '分類排序案例',
    '/qr.png',
  )

  expect(view.groups.map(({ zone, zoneLabel }) => [zone, zoneLabel])).toEqual([
    ['adventure', '冒險航海士'],
    ['combat', '戰鬥航海士'],
    ['trade', '交易航海士'],
  ])
  expect(view.groups.map((group) => group.officers.map((officer) => officer.id))).toEqual([
    ['adv-s', 'adv-a', 'adv-a-2'],
    ['combat-b', 'combat-c'],
    ['trade-s', 'trade-c'],
  ])
})
```

- [ ] **Step 2: 執行測試確認先紅**

Run: `npm test -- tests/presenters/fleet-share-presenter.test.ts`

Expected: FAIL，現有 `AdventureFleetShareGroup` 沒有 `zone`／`zoneLabel`，且 Presenter 仍返回以 `rarityName` 為鍵的分組；失敗原因應指向本次排序契約，而不是測試資料語法錯誤。

- [ ] **Step 3: 修改分享分組契約與 Presenter**

在 `miniprogram/contracts/fleet-share.ts` 引入 `AdventureTypeZone` 的 type-only 型別，將分組介面改為：

```ts
export interface AdventureFleetShareGroup {
  zone: AdventureTypeZone
  zoneLabel: string
  officers: FleetShareOfficerView[]
}
```

在 `miniprogram/presenters/fleet-share-presenter.ts` 引入 `getZoneLabel`、`ZONE_ORDER` 與 `AdventureTypeZone`，將 `buildAdventureGroups` 的收集和返回邏輯改為以下行為：

```ts
const grouped = new Map<AdventureTypeZone, FleetShareOfficerView[]>()
for (const [shipIndex, ship] of fleet.ships.entries()) {
  for (const [slotIndex, officerId] of ship.officerIds.slice(0, OFFICER_SLOT_COUNT).entries()) {
    const officer = officers[officerId]
    if (!officer || !officer.zone || !RARITY_ORDER.includes(officer.rarityName as FleetShareRarity)) {
      continue
    }
    const group = grouped.get(officer.zone) ?? []
    group.push(buildOfficerView(officer, ship.id || `ship-${shipIndex + 1}`, slotIndex))
    grouped.set(officer.zone, group)
  }
}

return ZONE_ORDER.flatMap((zone) => {
  const group = grouped.get(zone)
  if (!group || group.length === 0) return []
  const officersInOrder = [...group].sort(
    (a, b) =>
      RARITY_ORDER.indexOf(a.rarityName as FleetShareRarity) -
      RARITY_ORDER.indexOf(b.rarityName as FleetShareRarity),
  )
  return [{ zone, zoneLabel: getZoneLabel(zone), officers: officersInOrder }]
})
```

不得按姓名或 ID 二次排序；排序比较结果为 `0` 时保留艦隊收集顺序。未知类型和未知稀有度继续被忽略，已展示的前 11 个位置限制和技能累计逻辑不变。

- [ ] **Step 4: 执行 Presenter 测试确认先绿**

Run: `npm test -- tests/presenters/fleet-share-presenter.test.ts`

Expected: PASS，包含新分组排序案例以及原有战斗分享案例。

- [ ] **Step 5: 运行类型检查**

Run: `npm run typecheck`

Expected: PASS；若旧测试 fixture 因 `AdventureFleetShareGroup` 字段变化出现类型错误，记录到 Task 2/3 的 fixture 更新，不修改生产行为以外的文件。

### Task 2: 将冒险人物格改为五栏并更新布局契约

**Files:**
- Modify: `miniprogram/runtime/fleet-share-layout.ts`
- Test: `tests/runtime/fleet-share-layout.test.ts`

**Interfaces:**
- Consumes: Task 1 产出的 `AdventureFleetShareGroup.zone` 与 `zoneLabel`。
- Produces: `FleetShareGroupLayout` 以 `zone`／`zoneLabel` 标识区块；冒险分组使用 5 栏，戰鬥船只仍使用 6 欄。

- [ ] **Step 1: 先更新布局测试为三种类型和五栏断言**

将现有「冒险四个品质分组」fixture 改成以下三组，每组数据使用新的契约字段；冒险组使用 6 名人物，专门验证第一行五格、第二行一格：

```ts
groups: [
  {
    zone: 'adventure',
    zoneLabel: '冒險航海士',
    officers: Array.from({ length: 6 }, (_, index) => officer(`adventure-${index + 1}`)),
  },
  {
    zone: 'combat',
    zoneLabel: '戰鬥航海士',
    officers: [officer('combat-1')],
  },
  {
    zone: 'trade',
    zoneLabel: '交易航海士',
    officers: Array.from({ length: 5 }, (_, index) => officer(`trade-${index + 1}`)),
  },
],
```

将断言改为 `groupSections` 数量为 3；对第一个区块断言 `officerSlots` 数量为 6、前 5 个座标同列、最后 1 个进入第二行并且在容器中置中。保留技能区、页尾、QR 与所有矩形不越界断言，确保新增五栏不会覆盖后续区域。

- [ ] **Step 2: 运行布局测试确认先红**

Run: `npm test -- tests/runtime/fleet-share-layout.test.ts`

Expected: FAIL，失败应表现为冒险分组仍按 4 欄计算，或 `FleetShareGroupLayout` 尚未返回新的类型字段；战斗 6 欄断言必须继续通过。

- [ ] **Step 3: 修改布局常数与分组布局返回值**

在 `miniprogram/runtime/fleet-share-layout.ts` 将：

```ts
const GROUP_OFFICER_COLUMNS = 4
```

改为：

```ts
const GROUP_OFFICER_COLUMNS = 5
```

将 `FleetShareGroupLayout` 的 `rarityName` 改为 `zone` 与 `zoneLabel`，并在 `measureAdventureFleetShare` 的 `groupSections` 返回对象中原样传递 `group.zone` 和 `group.zoneLabel`。不得修改 `OFFICER_COLUMNS = 6`、人物格尺寸、置中参数、技能五栏或页尾高度。

- [ ] **Step 4: 运行布局测试确认先绿**

Run: `npm test -- tests/runtime/fleet-share-layout.test.ts`

Expected: PASS；冒险区块使用五栏、末行仍置中、技能区和页尾均在分享图高度内，战斗布局全部通过。

### Task 3: 渲染类型标题并迁移 Canvas 测试 fixture

**Files:**
- Modify: `miniprogram/runtime/fleet-share-renderer.ts`
- Test: `tests/runtime/fleet-share-renderer.test.ts`

**Interfaces:**
- Consumes: Task 1 的 `AdventureFleetShareGroup.zoneLabel` 与 Task 2 的 `FleetShareGroupLayout.zoneLabel`。
- Produces: Canvas 冒险分组标题直接显示「冒險航海士」「戰鬥航海士」「交易航海士」，人物素材预载与绘制顺序不变。

- [ ] **Step 1: 更新测试 fixture 并增加标题失败测试**

将 `tests/runtime/fleet-share-renderer.test.ts` 中两个冒险分享 fixture 的旧字段：

```ts
{ rarityName: 'A', officers: [...] }
```

改为：

```ts
{ zone: 'adventure', zoneLabel: '冒險航海士', officers: [...] }
```

新增 Canvas 测试，使用现有 `createCanvas(true)`，将三个空人物组传入 `drawFleetShareImage`，并断言 `fillText` 收到三个类型标题：

```ts
it('冒險分享分組標題使用類型名稱', async () => {
  const groupedView: AdventureFleetShareViewModel = {
    ...view,
    groups: [
      { zone: 'adventure', zoneLabel: '冒險航海士', officers: [] },
      { zone: 'combat', zoneLabel: '戰鬥航海士', officers: [] },
      { zone: 'trade', zoneLabel: '交易航海士', officers: [] },
    ],
  }
  const canvas = createCanvas(true)

  await drawFleetShareImage(canvas, groupedView, measureAdventureFleetShare(groupedView))

  const fillText = vi.mocked(canvas.getContext('2d').fillText)
  for (const label of ['冒險航海士', '戰鬥航海士', '交易航海士']) {
    expect(fillText).toHaveBeenCalledWith(label, expect.any(Number), expect.any(Number), expect.any(Number))
  }
})
```

- [ ] **Step 2: 运行渲染测试确认先红**

Run: `npm test -- tests/runtime/fleet-share-renderer.test.ts`

Expected: FAIL，当前 `drawGroup` 仍读取不存在的 `group.rarityName`，标题断言失败；其他 Canvas 素材、背景和超时测试不应出现新的失败。

- [ ] **Step 3: 修改渲染器标题来源**

在 `miniprogram/runtime/fleet-share-renderer.ts` 的 `drawGroup` 中，将：

```ts
`${group.rarityName} 級航海士`
```

改为直接绘制：

```ts
group.zoneLabel
```

保留标题的座标、字体、颜色、人数字样及后续 `drawOfficer` 调用；不得在渲染器重新按类型或稀有度分组。

- [ ] **Step 4: 运行渲染测试确认先绿**

Run: `npm test -- tests/runtime/fleet-share-renderer.test.ts`

Expected: PASS，类型标题、人物四层绘制、海图背景、QR 映射、技能区间距与素材超时测试全部通过。

### Task 4: 综合验证与页面验收

**Files:**
- Verify: `miniprogram/contracts/fleet-share.ts`
- Verify: `miniprogram/presenters/fleet-share-presenter.ts`
- Verify: `miniprogram/runtime/fleet-share-layout.ts`
- Verify: `miniprogram/runtime/fleet-share-renderer.ts`
- Verify: `tests/presenters/fleet-share-presenter.test.ts`
- Verify: `tests/runtime/fleet-share-layout.test.ts`
- Verify: `tests/runtime/fleet-share-renderer.test.ts`
- Verify: `tools/miniprogram-review/scenarios/adventure-fleet-share.json`

**Interfaces:**
- Consumes: Task 1–3 的完整实现。
- Produces: 通过自动化门禁与页面验收报告的冒险分享图排列变更。

- [ ] **Step 1: 运行本次变更的定向测试**

Run: `npm test -- tests/presenters/fleet-share-presenter.test.ts tests/runtime/fleet-share-layout.test.ts tests/runtime/fleet-share-renderer.test.ts`

Expected: 三个测试文件全部通过，包含类型分组顺序、五栏行布局和类型标题。

- [ ] **Step 2: 运行格式与静态检查**

Run: `npx prettier --write miniprogram/contracts/fleet-share.ts miniprogram/presenters/fleet-share-presenter.ts miniprogram/runtime/fleet-share-layout.ts miniprogram/runtime/fleet-share-renderer.ts tests/presenters/fleet-share-presenter.test.ts tests/runtime/fleet-share-layout.test.ts tests/runtime/fleet-share-renderer.test.ts`

Run: `npm run format:check`

Run: `npm run lint`

Run: `npm run typecheck`

Expected: Prettier、ESLint 与 TypeScript 均通过；Prettier 只处理本次列出的文件，不格式化无关文件。

- [ ] **Step 3: 运行冒险分享图页面验收场景**

Run: `npm run devtools:changed -- --mode iterate --summary "冒險分享圖改為冒險、戰鬥、交易分組，組內依 S 到 C 排序並使用五欄"`

完成修改后再次运行：

Run: `npm run devtools:changed -- --mode final --summary "驗收冒險分享圖類型分組、稀有度排序與五欄排列"`

检查 `artifacts/miniprogram-review/report.html`：报告必须包含冒险配队分享图场景的通过状态、修改后截图和滚动／可见性证据；截图中应能看到类型区块和五栏人物行。环境阻塞时记录为 blocked，不把缺少设备连接误报为代码通过。

- [ ] **Step 4: 运行完整验证**

Run: `npm run verify`

Run: `git diff --check`

Expected: 完整验证通过，生成检查没有因为本次未修改生成资料而产生差异，运行时网络边界与数据审计保持通过。

- [ ] **Step 5: 提交前检查并等待用户确认**

Run: `git status --short`

Run: `git diff --stat`

向用户展示实际变更文件、`npm run verify`、页面验收报告与 `git diff --check` 结果，并提出：

```text
fix: 調整冒險分享圖航海士排列
```

得到确认后再执行：

```powershell
git add miniprogram/contracts/fleet-share.ts miniprogram/presenters/fleet-share-presenter.ts miniprogram/runtime/fleet-share-layout.ts miniprogram/runtime/fleet-share-renderer.ts tests/presenters/fleet-share-presenter.test.ts tests/runtime/fleet-share-layout.test.ts tests/runtime/fleet-share-renderer.test.ts docs/superpowers/plans/2026-09-21-adventure-share-officer-layout.md
git commit -m "fix: 調整冒險分享圖航海士排列"
```
