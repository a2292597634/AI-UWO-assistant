# 新增航海士

将用户提供的一段航海士描述解析并添加到 `data/master/officers.json`，自动查找所有引用 ID，参考已有航海士分配技能组别。

## 输入格式

用户会提供以下格式的信息（字段可缺省，缺的跳过或设默认值）：

```
航海士名：<繁體中文名>
稀有度：<S/A/B/C 或 ★★★★★/★★★★/★★★/★★>
類型：<冒險/交易/戰鬥>
性別：<男/女>
職業：<職業名稱>
國籍：<國籍名稱>
語言能力：<語言名>lv<等級>（可多行，逗號或換行分隔）
技能列表：<技能名>（lv<等級>）（可多行，逗號或換行分隔）
頭像：<圖片檔案路徑>
招募城市：<城市名>（可多個）
招募條件：<條件描述>
所需航海士：<航海士名>（可多個）
招募備註：<備註>
```

用户也可能直接粘贴游戏截图或 voyage.tw 页面的文字。

## 处理步骤

### 1. 解析输入

从用户消息中提取所有字段。名称、稀有度、类型、性别、职业、国籍这些简单字段直接匹配；语言和技能列表按行/逗号拆分。

### 2. 查找 ID 映射

- **稀有度**：S → rarity_5, A → rarity_4, B → rarity_3, C → rarity_2
- **类型**：冒險 → type_class_1, 交易 → type_class_2, 戰鬥 → type_class_3
- **性别**：男 → gender_m, 女 → gender_f
- **职业**：在 `data/master/dictionaries.json` 的 jobs 中按名称搜索，取最匹配项
- **国籍**：在 dictionaries.json 的 nationalities 中按名称搜索
- **语言**：在 dictionaries.json 的 languages 中按名称搜索
- **技能**：在 `data/master/skills.json` 中按名称搜索。用户输入的技能名可能与数据库中的略有差异（繁简、标点、空格），需模糊匹配。如果找不到完全匹配，列出最接近的候选项让用户确认

### 3. 技能组别分配

参考已有航海士的技能分配模式来确定 sourceGroup 和 slot：

```bash
node -e "
const officers = require('./data/master/officers.json');
const targetSkills = ['<skillId1>', '<skillId2>', ...];
for (const sid of targetSkills) {
  const examples = officers.filter(o => o.skills.some(s => s.skillId === sid)).slice(0,3);
  console.log(sid + ':', examples.map(o => {
    const sk = o.skills.find(s => s.skillId === sid);
    return o.name + '[' + sk.sourceGroup + ' slot=' + sk.slot + ' kind=' + sk.kind + ']';
  }).join(', '));
}
"
```

按以下规则分配：
- 多个参考案例使用相同 sourceGroup → 沿用
- 同 sourceGroup 内 slot 按参考数据中出现的顺序递增
- kind 根据 skill 的 categoryId 判定：`skill_category_naval_active_*` → active，其余 → passive

### 4. 生成 officer ID

格式：`officer_custom_<名稱羅馬化>`，如 `officer_custom_singuack`。检查不重复。

### 5. 构建 CanonicalOfficer

```json
{
  "id": "officer_custom_xxx",
  "name": "名稱",
  "rarityId": "rarity_5",
  "visualGradeId": "grade_5",
  "typeId": "type_class_1",
  "genderId": "gender_m",
  "jobId": "job_xxx",
  "nationalityId": "nationality_ctn_xxx",
  "languages": [{ "languageId": "language_langXXX", "level": 5 }],
  "skills": [{ "skillId": "skill_xxx", "kind": "passive", "sourceGroup": "sk0", "slot": 0, "unlockLevel": 1, "level": 1 }],
  "recruitment": { "cityIds": [], "requirementId": null, "requiredOfficerIds": [], "note": null },
  "portraitId": null,
  "displayOrder": <max+1>,
  "sourceRefs": { "manual": true },
  "maintenanceNote": "手動新增 — YYYY-MM-DD"
}
```

- visualGradeId：rarity_5 → grade_5, rarity_4 → grade_4，以此类推
- displayOrder：当前最大 + 1
- 缺少的招募信息留空，remitment.note 写 "待補充招募資訊"

### 6. 写入数据

用 Node.js 脚本将新条目追加到 `data/master/officers.json`，然后：

```bash
npm run data:generate   # 重新生成运行时数据
npm run data:check      # 数据审计 + Schema 校验
npm run typecheck       # TypeScript 检查
npm test                # 全量测试
```

### 7. 处理头像

如果用户提供了头像路径，复制到：
- `data/assets/staging/officer_custom_xxx.png`（源文件）
- `miniprogram/subpkg-assets-N/imgs/officer_custom_xxx.png`（运行时使用，N 根据生成结果确定）

### 8. 确认缺失信息

完成后列出已入库的字段摘要，提醒用户补充缺失的招募信息。

## 注意事项

- 数据流水线 `resolvedPortraitPath` 已支持自定义航海士的本地路径回退，无需 CDN 发布
- 测试文件的 627 硬编码已改为动态读取 `officers.length`，新增航海士不会破坏测试
- 所有 skill ID 技能名可能有繁简/标点差异，优先模糊匹配后向用户确认
