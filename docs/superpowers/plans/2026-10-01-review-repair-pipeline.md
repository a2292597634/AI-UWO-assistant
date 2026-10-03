# 主資料、素材與同步管線修復實施計畫

> **給執行代理：** 使用 `superpowers:subagent-driven-development` 或 `superpowers:executing-plans` 按 E1→E5 執行；遵循總計畫全局約束，全部編排／故障注入在隔離副本完成。

**目標：** 修復 R15–R19、R26，使正式資料被全量檢查，合法手動技能不使素材管線崩潰，失敗回復及來源處置一致。

**架構：** 保留代表性來源審計作一套獨立檢查，新增正式 master 校驗；Schema仍嚴格禁止未声明字段。生成輸出範圍統一供生成與回復消費；同步讀合併資料並按原文件歸屬寫回。archive保持唯讀。

**技術：** 現有 TypeScript／Ajv／sharp／Vitest／Node22.x，不新增依賴；無真實下載、上傳、標記發布或部署。

## E1：正式 master 完整性與共享 Schema（R15、R18）

**文件責任：**

- 新增 `tools/data-audit/validate-master-dataset.ts`：正式集合的純校驗，不含固定8人／20技能數量。
- 新增 `tools/data-audit/check-master-dataset.ts`：讀正式文件／合併custom並輸出findings；入口加入package.json的data:check。
- 修改 `data/schema/skills.schema.json` 宣告可選 `levelInfo:{type:'string'}`；修改 dataset Schema 宣告可選auditStatus（verified／unverified）和auditNotes字串，其他字段保持additionalProperties:false。
- 修改 `tools/sync-maintenance-work-orders.ts`：移除為繞過Schema而刪levelInfo的特殊投影，改用同一嚴格校驗。
- 修改 `data/master/custom-officers.json`、`dataset.json`（僅明確核對的kind／計數／版本）；必要的說明寫本批資料審計文檔，不修改archive。
- 新增 `tests/data-contract/master-dataset.test.ts`；修改 schema-collections、skill-mapping、full-data-integrity；修改 import/transform-skills與run-import正面編排測試。

**介面：**

```ts
export interface MasterDatasetInput {
  dataset: CanonicalDatasetHeader
  officers: readonly CanonicalOfficer[]
  skills: readonly CanonicalSkill[]
  dictionaries: Readonly<Record<string, readonly DictionaryItem[]>>
  assets: readonly CanonicalAsset[]
}
export function validateMasterDataset(input: MasterDatasetInput): AuditFinding[]
export function checkMasterDataset(masterDir = 'data/master'): AuditFinding[]
```

上述import型別皆已有於tools/import/types.ts／data-audit/types.ts；純函式第一個文件需實際定義，第二個CLI完成讀取／Schema後呼叫它。`officers`參數必須是loadCanonicalOfficers結果。

- [ ] **紅燈：** 用最小獨立合法master fixture，分別破壞國籍／語言／技能／城市／前置航海士／素材owner引用、ID唯一性、語言唯一性、group+slot唯一性、level1–9／unlock正整數、天生固定1、counts。每次只改一種缺陷並assert相應code／path；不得把Phase2硬編碼counts帶入。
- [ ] **現況紅燈：** 對合併master執行新CLI，需辨認兩筆custom sk2修理分類衝突與dataset計數不符。完整skills包含levelInfo時應通過已更新Schema，而多加未聲明欄位仍失败。

```ts
const validator = createSchemaValidator()
const inputSkill = {
  id: 'skill_test',
  name: '測試技能',
  categoryId: 'skill_category_repair',
  description: '測試說明',
  levelInfo: 'Lv1: 1%',
  iconId: null,
  sourceRefs: { workOrderId: 'wo_test:skill' },
}
expect(validator.validate('skills', inputSkill)).toEqual([])
expect(validator.validate('skills', { ...inputSkill, unexpected: true })).toContainEqual(
  expect.objectContaining({ code: 'SCHEMA_ADDITIONAL_PROPERTY' }),
)
```

- [ ] 實施校驗：Schema／外鍵／唯一性／counts基於合併正式集合；category→kind只使用已有明確group/category證據，至少覆蓋sk2修理／醫術及sk1天生規則。無證據的對應另列待複核明細，不按名稱猜kind、不用來源數值猜level。保留canonical active/passive值與不同關係的合法差異，不要求同skillId全球一種kind。
- [ ] 依 `data/audit/skill-group-mapping.json`、最新等級規格及錄入證據核對兩筆修理關係，確認後修正master。更新dataset為實際合併officers、skills、canonical assets及dictionaryItems數；assets不是2327個CDN項。contentVersion／updatedAt隨本批內容變更，auditNotes只陳述實際完成的檢查。若證據出現矛盾，保持資料錯誤明細并停止該資料發布，不用skip抹掉紅燈。
- [ ] 將check-master接到data:check，保持原Phase2審計；生成器本批前置呼叫同一正式校驗，防止略過CLI直接生成壞master。暫存產物先構建完成再替換，不改生成欄位語義。
- [ ] 綠燈：在副本把首位國籍改`nationality_missing`，data:check必须非零；還原後全套通過。`data:generate`／generate:check確認master與runtime一致、kind分組／角標正確，不手改generated。message：`fix: 對正式主資料執行完整契約與關係校驗`；提交前展示資料及生成差異。

## E2：明確分流 voyage.tw 與手動素材（R16）

**文件：** 修改 `tools/asset-pipeline/download-assets.ts`，新增export `buildVoyageSkillData`；修改 `tests/asset-pipeline/download-assets.test.ts`。不改URL規則、source snapshot或現有CDN。

**介面／最小投影：**

```ts
export function buildVoyageSkillData(
  skills: readonly CanonicalSkill[],
  overrides: ReadonlyMap<string, string>,
) {
  return skills.flatMap((skill) => {
    const id = skill.sourceRefs.voyageTw
    if (typeof id !== 'string' || id.length === 0) return []
    return [
      {
        id,
        imageOverrideId:
          overrides
            .get(skill.id)
            ?.replace(/^skill_/, '')
            .replace(/\.png$/, '') ?? null,
      },
    ]
  })
}
```

- [ ] **紅燈：** 獨立技能fixture同時含voyageTw與workOrderId，真實master全部1209技能也跑清單純函式；完整清單建立不能讀undefined.length，手動六筆不能產生遠端URL。覆蓋limit0及預設小limit，不只測前40。
- [ ] 跑下載管線测试確認紅燈；CLI改消費上述投影，手動圖片來源由staging／現有reuse／fallback處理，必要的缺圖錯誤在setup由既有PNG門禁呈現。不要給手動技能臆造voyage.tw來源。
- [ ] 綠燈時fetch用拒絕stub確認建清單無外部I/O；再用假的fetch回應驗證voyage技能清單／override／快取既有行為。禁止為驗收執行會真下載的assets:full。message：`fix: 分流手動技能與來源技能素材下載`。

## E3：以單一生成輸出清單做完整回復（R17）

**文件：** 新增 `tools/data-pipeline/generated-output-paths.ts`；修改generate.ts的輸出路徑引用及sync-maintenance-work-orders.ts快照；修改 tests/tools/sync-maintenance-work-orders.test.ts，新增 `tests/data-pipeline/generated-output-paths.test.ts`。

**介面：** `DATA_GENERATION_OUTPUT_PATHS:readonly string[]`，所有值為倉庫相對路徑；`getMaintenanceRollbackPaths(projectRoot:string):readonly string[]`回傳生成輸出加staging／manifest的絕對路徑。仍允許現有options.rollbackPaths測試注入，但正式預設必須用此函式。

- [ ] **紅燈：** 斷言清單包含fleet分包、10份detail／trade分片、兩份index／loader、trade-goods／reference／major-event-reference、maintenance索引、兩份CloudFunction reference、asset-dependencies及主generated。不得以「引用整個subpkg-detail／trade目錄」代替精確生成集合，以免回復覆寫人工頁面。

```ts
expect(DATA_GENERATION_OUTPUT_PATHS).toContain(
  'miniprogram/subpkg-fleet/generated/fleet-officers.js',
)
expect(DATA_GENERATION_OUTPUT_PATHS).not.toContain('miniprogram/subpkg-detail')
```

- [ ] 正式預設路徑測試在完整隔離副本運行：生成後改fleet索引，下一gate拋錯；逐檔hash比較所有輸出／master回復一致，人工頁面保持原hash。測試不能顯式另傳一份補齊rollbackPaths而掩蓋預設缺陷。
- [ ] 最小實施包含缺失fleet輸出；再由共享路徑定義替換重複清單。快照還要保留原本不存在的檔案狀態，回復移除失敗後新增的生成檔；清理只作用已驗證projectRoot內的路径。
- [ ] 綠燈覆蓋data:generate／manifest／verify各階段失敗及成功後markPublished失敗的既有語義；成功发布後回寫失敗不能把已發布本地內容回退。message：`fix: 完整回復維護同步的所有生成輸出`。

## E4：來源拒絕處置與完整離線匯入編排（R19，並完成R18編排驗收）

**文件：** 修改 transform-officers.ts、validate-candidates.ts、run-import.ts、run-trade-import.ts及import/types.ts；修改source-corrections的消費方式而非修改archive；候選預設改`artifacts/import-candidates/`，在.gitignore加入該專用路徑。測試transform-officers、run-import、parse-languages及data-contract/city-anomaly-disposition。

**介面：** 新增 `SourceCorrection`型別表示現有corrections字段；transformOfficers新增末尾可選 `corrections:readonly SourceCorrection[]=[]`。run-import匯出可注入raw source／outputDir的編排函数，固定原來源讀取預設保持唯讀；失敗不替換已有候選。runTradeImport的候選輸出也移出archive，不自動promote。

- [ ] **紅燈：** 使用唯讀archive中chasT101及已approved修正表，斷言 `city_chasT051` 和字典中的該值皆不存在；使用精確大小寫，不用錯誤的city_chast051代替。已拒絕值沒有approved處置證據時必須阻斷並列明來源／值。

```ts
expect(officer.recruitment.cityIds).not.toContain('city_chasT051')
expect(dictionaries.cities.some((item) => item.id === 'city_chasT051')).toBe(false)
```

這裡officer／dictionaries來自同一測試中的真transformOfficers→buildDictionaries；validator還需獨立拒絕人造`city_chasT051`，不能以自建錯誤字典證明它合法。

- [ ] 實施明確approved remove，保留correction證據／報告；不把chasT051推成前置航海士，不新增假城市。來源未知值的未決處置保持阻斷，不以warning後自動收錄。
- [ ] 正面編排：以一組已完整映射的離線source fixture執行parse→transform→Schema→引用→write，assert零error、候選內容與levelInfo；負面fixture在寫入前失敗並保留舊候選。使用临時outputDir、spy檔案路徑，assert沒有archive／master寫入。不能把原run-import测试中的findings.length>=0當接受證據。
- [ ] 跑匯入／資料契約綠燈，再整體verify／generate:check；不執行import:download或真網路匯入。message：`fix: 落實來源拒絕處置與離線匯入契約`。

## E5：合併讀取但按原master文件寫回custom（R26）

**文件：** 修改sync-maintenance-work-orders.ts、load-officers.ts（新增保留文件歸屬的讀取介面）；修改tests/tools/sync-maintenance-work-orders.test.ts、tests/data-pipeline/load-officers.test.ts及reference-data測試。既有退役頁不恢復註冊。

**介面：**

```ts
export interface OfficerMasterCollections {
  official: CanonicalOfficer[]
  custom: CanonicalOfficer[]
  sourceFileById: ReadonlyMap<string, 'officers' | 'custom-officers'>
}
export function loadOfficerMasterCollections(masterDir: string): OfficerMasterCollections
```

loadCanonicalOfficers仍返回official＋custom的原順序。同步把合併陣列送applyApprovedWorkOrders，結果按sourceFileById分回兩個檔案；本批新增workOrder航海士沿目前規範放officers.json。既有ID、sourceRefs與文件歸屬不改。

- [ ] **紅燈：** 临時master目錄具official＋custom＋skills／dict／dataset，更新custom核准工單可成功，official文件byte hash不變，custom只改目標，sourceRefs.submissionId保留；兩檔ID重複拒絕，未知目標拒絕。
- [ ] 最小實施合併與分流；原子替換增加custom-officers備份／temp／rollback，E3快照範圍同步納入。dataset counts按合併結果，不以official數覆蓋總數。
- [ ] 綠燈加重复执行幂等、custom寫入後gate失敗兩檔／dataset回復、沒有真markPublished。生成reference／maintenance索引與合併集合一致。message：`fix: 按主資料歸屬同步自訂航海士更新`。

## 管線批次門禁

每項先跑其明確測試；E1／E4／E5完成後執行data:check。最後在隔離副本跑verify和generate:check，檢查原master之外沒有人工修改generated。素材發布僅測純計畫與mock CLI；assets:publish／sync CLI的真雲動作不在本次執行範圍。
