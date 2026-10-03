# 品質門禁與測試有效性修復實施計畫

> **給執行代理：** 使用 `superpowers:subagent-driven-development` 或 `superpowers:executing-plans` 執行F1／F2；遵循總計畫全局約束。F1是後續UI批次final的前置，F2可獨立完成。

**目標：** 修復R20、R24、R25；沒有驗收場景的頁面不能被整批綠燈掩蓋，測試必須會拒絕所承諾辨識的受損實作。

**架構：** 觸發器維持純函式，新增unmatchedPageFiles契約；CLI逐項呈現缺口，頁面fixture只存在tools層，不进入miniprogram包。使用現有runner能力在開頁前裝本地mock，disconnect前還原。

**技術：** TypeScript、Vitest、现有miniprogram-automator／wechatide；不新增依賴或任意場景腳本執行能力。

## F1：逐頁覆蓋門禁與可安全執行的UI fixture（R20）

**文件：** 修改tools/miniprogram-review/trigger.ts的TriggerPlan／createTriggerPlan，config.ts／cli.ts／report.ts／report-html.ts／types.ts及相應測試；修改adapter.ts／wechatide.ts增加fixture生命週期；新增`tools/miniprogram-review/fixtures.ts`與tests/miniprogram-review/fixtures.test.ts。回報審核／我的回報／錯誤表單場景由C計畫交付，F1先提供共用安全能力。

**覆蓋介面：** TriggerPlan新增 `unmatchedPageFiles:string[]`。每個非route pageFile至少匹配一個watchPath；iterate對未覆蓋項也回blocked，不能静默宣稱該批已驗收。app.json路由變更要列所需路由，無場景／無明確豁免則blocked；文件級和路由級缺口均進HTML／JSON，已匹配場景可列為候選，但不把整體標passed。

createTriggerPlan的input另新增可選 `registeredPagePaths:readonly string[]`，僅app.json變更時必填；CLI用config.ts的新 `readRegisteredPagePaths(projectRoot:string):string[]` 讀project.config的miniprogramRoot及app.json，合併pages與每個subpackage的root/pages。某路由可由同entry場景或明確watch該頁目錄並在steps導航到該路由的場景覆蓋；缺口記入新增 `unmatchedPagePaths:string[]`，不能只因有catalog場景就算detail直接路由已覆蓋。沒有已聲明豁免時全部所需路由都必須覆蓋。

- [ ] **紅燈：** 用現有scenario helper，輸入catalog＋review兩頁，而只有catalog場景，outcome必须blocked並列review文件；全部匹配run、全部不匹配blocked、docs-only iterate skipped、docs-only final blocked。共享元件按原watchPaths命中全部相關入口。

```ts
const plan = createTriggerPlan({
  mode: 'final',
  changedFiles: [
    'miniprogram/pages/catalog/index.wxml',
    'miniprogram/subpkg-maintenance/pages/work-order-review/index.wxml',
  ],
  scenarios: [scenario('catalog', 1, ['miniprogram/pages/catalog/'])],
})
expect(plan.outcome).toBe('blocked')
expect(plan.unmatchedPageFiles).toEqual([
  'miniprogram/subpkg-maintenance/pages/work-order-review/index.wxml',
])
```

- [ ] 跑trigger／cli／report三組測試確認紅燈；逐檔计算覆蓋集合並更新blocked報告。補fleet/generated及major-event-reference生成排除規則，測試生成變更不誤觸頁面；新增JSON頁面／元件設定變更若影響路由／渲染亦要被識別。
- [ ] **fixture安全測試紅燈：** 新CLI可選 `--fixture error-report-review|error-report-mine|coupon-success|coupon-known-failure|coupon-unknown`，只允許固定名稱。fixture在target reLaunch前替代cloud.callFunction，未支持action立即回安全失敗，絕不回落真cloud；coupon fixture只mock目前測試玩家storage讀取，沒有真storage寫入；解連前必須恢復原API，即使場景assertion失敗。

```ts
export type ReviewFixtureName =
  | 'error-report-review'
  | 'error-report-mine'
  | 'coupon-success'
  | 'coupon-known-failure'
  | 'coupon-unknown'
export interface ReviewFixtureSession {
  restore(): Promise<void>
}
```

`installReviewFixture(adapter:ReviewAdapter, name:ReviewFixtureName):Promise<ReviewFixtureSession>`在fixtures.ts定義；ReviewAdapter新增可選的 `installFixture(name:ReviewFixtureName):Promise<void>` 和 `restoreFixture():Promise<void>`，不支援時明確回blocked。舊automator可用已安装MiniProgram.mockWxMethod／restoreWxMethod／evaluate，新wechatide用已實作automation_evaluate；dot方法mock若平台不支援，使用工具內固定evaluate source，仍須marker驗證。若API不能有效安裝，target頁不得被開啟。不能把任意JS／文件路徑從scenario JSON送去執行。

- [ ] 實施fixture生命周期：connect後、runScenario.reLaunch前安裝；將disconnect包成先restore再disconnect，恢復後再重跑場景需重新安裝。fixture提供完整OfficerErrorReport及固定owner/admin結果，動作只修改該fixture記憶體。测试fake runner记录真API呼叫为0；保持所有mock代码在tools，不在Page加入測試入口。
- [ ] 給相應場景增加watchPaths：shared skill-sheet／picker、runtime／presenters／domain、report fixture；新回報場景至少有一次文字断言、处理／补充交互和截图。保留缺少修改後截图不得passed與有限恢复规则。
- [ ] 綠燈：混合未覆蓋頁仍blocked；fixture normal/error／補充历史／known&unknown coupon結果均安全取圖；无fixture的純本地既有場景仍可執行。final／verify後提交確認。message：`fix: 阻止未覆蓋頁面通過並支援離線UI驗收`。

## F2：讓兩項關鍵契約測試具備辨錯能力（R24、R25）

**文件：** 修改tests/data-pipeline/build-runtime-data.test.ts與tests/import/parse-languages.test.ts。生产實作只在新紅燈暴露對應既有缺陷時按原任务範圍處理，不能順手重寫parser。

- [ ] **R24紅燈／測試內容：** 使用該文件既有officers[0]作型別基底，獨立覆蓋所有關係level為1，確定id。无條件assert該輸出存在且skillLevels缺失，移除從待測輸出尋找「已符合條件者」的if。

```ts
const officer = {
  ...officers[0]!,
  id: 'officer_level_one',
  skills: officers[0]!.skills.map((relation) => ({ ...relation, level: 1 })),
}
const result = buildCatalog([officer], skills, dictionaries)
expect(result).toHaveLength(1)
expect(result[0]!.id).toBe('officer_level_one')
expect(result[0]!.skillLevels).toBeUndefined()
```

- [ ] **R25紅燈／測試內容：** 输入确实不能整体JSON.parse的片段，保留兩側完整鍵並切斷中間值；assert完整两側值且不把截断值當資料。

```ts
const ranges = [
  'lang_js[1]={"skill100043":"神之手腕","broken":"半個',
  '被截去結尾的殘片,"lang80":"英語"}',
]
// broken的值缺少結尾引號，而兩個需要的完整鍵保留。
expect(() => JSON.parse(ranges.join('').replace(/^lang_js\[1\]=/, ''))).toThrow()
const result = parseLanguageMap(ranges)
expect(result.skill100043).toBe('神之手腕')
expect(result.lang80).toBe('英語')
expect(result.broken).toBeUndefined()
```

實施時确认extractJsString對broken實際解析失敗而略過、完整鍵能恢復；不要藉移除broken斷言讓拼接錯值過關。還需加入 escaped quote／Unicode片段，沿用已存在decoder，不新增依賴。

- [ ] 跑兩個檔案確定正常實作綠燈；临時在隔離副本把buildCatalog改成永遠有非空skillLevels、parseLanguageMap改成只做完整JSON.parse，兩項測試必须分別紅燈。還原受損實作後重跑，保留實際output；不能提交變異代碼。
- [ ] 完整verify、原／副本差異檢查後提交確認。message：`test: 強化技能等級省略與Range缺口回歸`。
