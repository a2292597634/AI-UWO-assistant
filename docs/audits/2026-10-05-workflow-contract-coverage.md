# 流程操作契約覆蓋核對

日期：2026-10-05。基線 79e778c；候選尚未提交。四類契約見 [操作索引](../development/operation-contracts.md)。本輪是既有回歸的核對，沒有重新開啟 R01–R26 或新一輪全專案審查。

## 已核對的斷言

- 對象：兩個 fleet 分類 L／active A 衝突的零寫入及合法 update 參數；coupon 發起玩家、遲到回覆與單次請求。
- 範圍：正式 master 逐 records 契約與 official/custom 讀取；維護同步逐 registry 路徑 SHA、缺失狀態及人工頁面保護；頁面混合未匹配文件／路由阻塞。
- 時間：登入 deferred 列表中新編輯、逆序載入 B/A、保存後列表、新草稿、取消、放棄回復失敗、重試原配置與卸載失效。
- 獨立依據：chasT051 的真 pipeline 驗證在寫候選前失敗；全 relation Lv.1 的明確合成 officer 必須省略 skillLevels；破損 Range 先斷言 JSON.parse 拋錯再檢查兩側键。

相關風險命令实际通過：9 個測試檔／320 項測試；日誌 `.superpowers/workflow-20261005/C2-risk-regression.log`。C1 既有規範守門：3 檔／6 項通過。沒有為文案或已有業務行為新增鏡像測試。

## 完整 warning 台帳

工具重新執行 checkMasterDataset：0 errors／5254 warnings；全部 code 為 MASTER_SKILL_MAPPING_UNVERIFIED，按 group/category 分為 31 組。沒有硬編碼歷史數量。

以 (code, entityId, path) 和完整 finding 比較本輪開始受保護的原工作區 master；schema／mapping 未修改。新增 0、消失 0、改變 0。2026-10-02 歷史文檔只有分組摘要，本輪不宣稱已追溯更早全部關係身份。

完整證據：`.superpowers/workflow-20261005/C2-findings.json`、`C2-relations.json`、`C2-summary.json`。每筆關係有 officer／skill ID、path、原 group／category／kind、independentSource=null、reviewStatus=unverified、保留 warning 的理由。這是缺證據台帳，不是語義確認。

| sourceGroup | categoryId                              | 待核對關係數 |
| ----------- | --------------------------------------- | -----------: |
| sk0         | skill_category_medicine                 |          135 |
| sk0         | skill_category_naval_passive_defense    |          807 |
| sk0         | skill_category_naval_passive_boarding   |          321 |
| sk0         | skill_category_salvage                  |           83 |
| sk2         | skill_category_naval_active_boarding    |          207 |
| sk5         | skill_category_naval_passive_boarding   |           56 |
| sk0         | skill_category_negotiation              |           77 |
| sk0         | skill_category_repair                   |          156 |
| sk5         | skill_category_negotiation              |           36 |
| sk5         | skill_category_barter                   |           45 |
| sk0         | skill_category_navigation               |          743 |
| sk0         | skill_category_naval_passive_melee      |          454 |
| sk2         | skill_category_naval_active_melee       |          312 |
| sk5         | skill_category_naval_passive_melee      |           86 |
| sk5         | skill_category_adventure                |          220 |
| sk0         | skill_category_certificate              |            4 |
| sk5         | skill_category_naval_passive_other      |          107 |
| sk1         | skill_category_combat_other             |          177 |
| sk5         | skill_category_naval_passive_defense    |          144 |
| sk0         | skill_category_naval_passive_cannon     |          331 |
| sk2         | skill_category_naval_active_cannon      |          195 |
| sk5         | skill_category_naval_passive_cannon     |           63 |
| sk5         | skill_category_trade_expertise          |          177 |
| sk5         | skill_category_medicine                 |           23 |
| sk1         | skill_category_innate_debuff            |          222 |
| sk5         | skill_category_repair                   |           19 |
| sk1         | skill_category_admiral                  |            1 |
| sk1         | skill_category_negotiation              |           12 |
| sk0         | skill_category_naval_active_enhancement |            4 |
| sk5         | skill_category_navigation               |           36 |
| sk2         | skill_category_innate_buff              |            1 |

## 未覆蓋項

真 CloudBase ACL／多 instance CAS／限流、原生返回草稿、真兌換、四寬度／公共 SDK、真機、QR／上傳包、長列表原生渲染及 solver 性能／數值保持獨立隊列。group/category 未取得獨立來源，auditStatus=unverified 保留。兩個 fleet controller 的共同抽取不在本批範圍。
