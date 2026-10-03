# 2026-10-02 正式 master 完整性修復審計

本批以正式合併集合執行嚴格 Schema、外鍵、ID／語言／技能槽唯一性、技能等級 1–9、解鎖正整數、天生效果固定 Lv.1、素材 owner 與實際計數檢查。代表性 Phase 2 審計保持獨立，未以固定 8 位航海士／20 技能限制正式集合。

## 已確認修正

- `officer_custom_singuack` 與 `officer_custom_piyale` 的 `skill_skill400089` 關係，來源組 `sk2`、分类 `skill_category_repair`，由 passive 修正 active。依据 `data/audit/skill-group-mapping.json` 中 sk2／menuskt14／repair 的既有戰鬥行動證據，亦符合既有同步器明確 repair／medicine 規則；未按技能名稱猜分類。
- 計數以當前文件實際集合為準：official 637＋custom 2＝639 位航海士、1209 技能、15 個 canonical 素材、600 字典項。CDN 的 2327 個圖片項並非 canonical assets 計數。保留當前已錄入的正式資料，不回退到計畫寫作時的 630 範例。
- 天生效果以 `sourceGroup:sk1` **及** `skill_category_innate_buff` 識別，固定 level／unlockLevel 1、kind passive。其他分類中的 sk1 關係不會被自動改成被動。
- `levelInfo`、`auditStatus` 與 `auditNotes` 現為明確 Schema 字段，其他未聲明字段仍拒絕。同步器不再剝除 levelInfo 繞過 Schema。

## 未決明細

本批正式校驗 0 個阻斷錯誤，以下關係缺少現有精確 group/category 映射證據，共 5254 筆，保留為 warning 待複核；未猜測 kind、未修改原關係、未宣稱全量分類已人工確認。dataset `auditStatus` 改 `unverified`，auditNotes 只陳述實際檢查。完整逐關係明細可由 `checkMasterDataset()` 返回，執行報告另保留 `e1-master-findings.json`。

| sourceGroup | categoryId                              | 待複核關係數 |
| ----------- | --------------------------------------- | -----------: |
| sk0         | skill_category_certificate              |            4 |
| sk0         | skill_category_medicine                 |          135 |
| sk0         | skill_category_naval_active_enhancement |            4 |
| sk0         | skill_category_naval_passive_boarding   |          321 |
| sk0         | skill_category_naval_passive_cannon     |          331 |
| sk0         | skill_category_naval_passive_defense    |          807 |
| sk0         | skill_category_naval_passive_melee      |          454 |
| sk0         | skill_category_navigation               |          743 |
| sk0         | skill_category_negotiation              |           77 |
| sk0         | skill_category_repair                   |          156 |
| sk0         | skill_category_salvage                  |           83 |
| sk1         | skill_category_admiral                  |            1 |
| sk1         | skill_category_combat_other             |          177 |
| sk1         | skill_category_innate_debuff            |          222 |
| sk1         | skill_category_negotiation              |           12 |
| sk2         | skill_category_innate_buff              |            1 |
| sk2         | skill_category_naval_active_boarding    |          207 |
| sk2         | skill_category_naval_active_cannon      |          195 |
| sk2         | skill_category_naval_active_melee       |          312 |
| sk5         | skill_category_adventure                |          220 |
| sk5         | skill_category_barter                   |           45 |
| sk5         | skill_category_medicine                 |           23 |
| sk5         | skill_category_naval_passive_boarding   |           56 |
| sk5         | skill_category_naval_passive_cannon     |           63 |
| sk5         | skill_category_naval_passive_defense    |          144 |
| sk5         | skill_category_naval_passive_melee      |           86 |
| sk5         | skill_category_naval_passive_other      |          107 |
| sk5         | skill_category_navigation               |           36 |
| sk5         | skill_category_negotiation              |           36 |
| sk5         | skill_category_repair                   |           19 |
| sk5         | skill_category_trade_expertise          |          177 |

## 驗證及產物來源

Node22 下正式 `npm.cmd run data:check` 通過（Phase 2 PASS、12 files／100 tests、master 0 errors）；資料／匯入／同步相關批次測試通過。完整副本先生成成功，再測壞國籍退出 1／還原退出 0及移除大流行素材時生成末段退出 1且原產物 hash 不變；正式產物隨後由生成工具更新，未手改 generated。所有 archive 保持唯讀。完整 verify／generate:check 由主代理在包含當前全內容的副本統一驗證。
