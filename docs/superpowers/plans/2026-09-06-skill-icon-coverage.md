# 技能圖示資產覆蓋修復 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (\`- [ ]\`) syntax for tracking.

**Goal:** 讓普通技能只使用自己的圖示資產，修復海戰主動－強化分類的 24 個技能共用錯誤圖示，並在 CDN manifest 缺圖時於生成期失敗。

**Architecture:** 將技能圖示解析分為「自身檔案」、「明確的 \`skill_skillT\` 變體 fallback」和「普通技能缺圖錯誤」三種結果。資產發布仍由現有 CloudBase pipeline 負責，生成器只消費真實發布 manifest；不手寫或猜測 CloudBase \`fileID\`。

**Tech Stack:** TypeScript、Vitest、tsx、CloudBase manifest、PNG 素材流水線。

## Global Constraints

- \`archive/\`：voyage.tw 一次性快照，只讀。
- \`data/master/\`：唯一權威數據源，所有人手修改在此進行。
- \`miniprogram/generated/\`：由 \`npm run data:generate\` 生成，禁止手動修改。
- 修改 \`data/master/\` 後必須運行 \`npm run data:check\`。
- 禁止直接在 \`master\` 分支開發；本分支為 \`codex/phase-5-fix-skill-icons\`。
- 禁止新增、刪除或升級依賴。
- 數據解析、轉換、校驗、索引/分片生成和確定性構建遵循 TDD。
- 不修改與本問題無關的既有未提交工作。

---

### Task 1: 建立技能圖示映射回歸測試

**Files:**
- Modify: \`tests/data-pipeline/asset-dependencies.test.ts\`

**Interfaces:**
- Consumes: \`buildAssetDependencyIndex(officers, skills, { assetFilenames })\`
- Produces: 普通技能缺圖、變體 fallback、強化技能一對一映射的測試約束。

- [ ] **Step 1: Write the failing test**

加入三個行為測試：

\`\`\`ts
it('rejects a missing regular skill icon instead of borrowing a category icon', () => {
  const skills = [
    makeSkill('skill_skill400591', 'skill_category_naval_active_enhancement'),
    makeSkill('skill_skill400581', 'skill_category_naval_active_enhancement'),
  ]

  expect(() =>
    buildAssetDependencyIndex([], skills, {
      assetFilenames: new Set(['skill_skill400591.png']),
    }),
  ).toThrow('skill_skill400581.png')
})

it('keeps category fallback only for skillT variant icons', () => {
  const skills = [
    makeSkill('skill_skill400591', 'skill_category_naval_active_enhancement'),
    makeSkill('skill_skillT0001', 'skill_category_naval_active_enhancement'),
  ]

  const index = buildAssetDependencyIndex([], skills, {
    assetFilenames: new Set(['skill_skill400591.png']),
  })

  expect(index.skillIcons.skill_skillT0001?.path).toContain('skill_skill400591.png')
})

it('keeps every enhancement skill on its own icon filename when all assets exist', () => {
  const skills = [
    'skill_skill400591',
    'skill_skill400581',
    'skill_skill400711',
    'skill_skill400471',
  ].map((id) => makeSkill(id, 'skill_category_naval_active_enhancement'))
  const filenames = new Set(skills.map((skill) => \`\${skill.id}.png\`))

  const index = buildAssetDependencyIndex([], skills, { assetFilenames: filenames })

  expect(new Set(skills.map((skill) => index.skillIcons[skill.id]?.path))).toHaveLength(
    skills.length,
  )
})
\`\`\`

- [ ] **Step 2: Run test to verify it fails**

Run:

\`\`\`powershell
npx vitest run tests/data-pipeline/asset-dependencies.test.ts
\`\`\`

Expected: FAIL because the current resolver silently maps the missing regular skill to the category fallback.

- [ ] **Step 3: Commit**

\`\`\`powershell
git add tests/data-pipeline/asset-dependencies.test.ts
git commit -m "test: 鎖定技能圖示缺圖回退行為"
\`\`\`

### Task 2: 收窄技能圖示 fallback 規則

**Files:**
- Modify: \`tools/data-pipeline/asset-dependencies.ts\`
- Test: \`tests/data-pipeline/asset-dependencies.test.ts\`

**Interfaces:**
- Consumes: \`CanonicalSkill.id\`、\`assetFilenames\`、分類 fallback map。
- Produces: 普通技能缺圖拋錯，\`skill_skillT\` 變體保留分類 fallback。

- [ ] **Step 1: Write the failing test**

使用 Task 1 的三個測試作為失敗證明；不要先修改 production code。

- [ ] **Step 2: Run test to verify it fails**

\`\`\`powershell
npx vitest run tests/data-pipeline/asset-dependencies.test.ts
\`\`\`

Expected: FAIL with the missing regular skill being silently mapped to \`skill_skill400591.png\`.

- [ ] **Step 3: Write minimal implementation**

在 \`tools/data-pipeline/asset-dependencies.ts\` 增加明確變體判斷，並只讓變體使用 fallback：

\`\`\`ts
const isVariantSkill = (skillId: string): boolean => /^skill_skillT\\d+$/.test(skillId)

const resolveSkillFilename = (
  skill: CanonicalSkill,
  assetFilenames: ReadonlySet<string>,
  categoryFallback: ReadonlyMap<string, string>,
): string | undefined => {
  const ownFilename = filenameForSkill(skill.id)
  if (assetFilenames.size === 0 || assetFilenames.has(ownFilename)) return ownFilename
  if (isVariantSkill(skill.id)) return categoryFallback.get(skill.categoryId)
  throw new Error(
    \`missing regular skill icon asset: \${skill.id} (\${skill.categoryId}), expected \${ownFilename}\`,
  )
}
\`\`\`

- [ ] **Step 4: Run test to verify it passes**

\`\`\`powershell
npx vitest run tests/data-pipeline/asset-dependencies.test.ts
\`\`\`

Expected: PASS for all tests in the file.

- [ ] **Step 5: Commit**

\`\`\`powershell
git add tools/data-pipeline/asset-dependencies.ts tests/data-pipeline/asset-dependencies.test.ts
git commit -m "fix: 限制技能圖示分類回退範圍"
\`\`\`

### Task 3: 使用完整來源資產建立發布準備

**Files:**
- No tracked source changes expected; use ignored \`data/assets/staging/\` as local staging output.
- Read-only source: \`E:/AI UWO assistant/archive/voyage-tw-2026052501/raw-assets/\`

**Interfaces:**
- Consumes: archive 中的 PNG、\`data/master\`、修正後的資產依賴索引。
- Produces: staging 中每個被依賴的真實 PNG；不產生虛構 CloudBase manifest。

- [ ] **Step 1: Prepare local staging from the existing archive**

只讀取主工作區 archive，複製到本分支 ignored staging；不得修改 archive 或將 staging 加入 git。

\`\`\`powershell
New-Item -ItemType Directory -Force -Path "data/assets/staging" | Out-Null
Copy-Item -LiteralPath "E:/AI UWO assistant/archive/voyage-tw-2026052501/raw-assets/*.png" -Destination "data/assets/staging" -Force
npm run assets:setup
\`\`\`

- [ ] **Step 2: Verify local source coverage**

\`\`\`powershell
npx vitest run tests/asset-pipeline/setup-assets.test.ts tests/asset-pipeline/cloudbase-manifest.test.ts
\`\`\`

Expected: asset setup and release-plan tests pass; staging contains the real PNGs required by the corrected dependency index.

- [ ] **Step 3: Publish only with real CloudBase authorization**

When CloudBase credentials and an approved release window are available, run:

\`\`\`powershell
npm run assets:publish
npm run data:generate
\`\`\`

Do not edit \`data/assets/cloudbase-manifest.json\` by hand. If credentials are unavailable, report publishing as an external prerequisite instead of fabricating \`fileID\` values.

### Task 4: 完成驗證並檢查分支範圍

**Files:**
- Verify: Tasks 1–2 files and generator outputs produced after a real manifest refresh.

**Interfaces:**
- Consumes: corrected resolver, regression tests, and (when published) complete CloudBase manifest.
- Produces: evidence-backed verification report and a branch diff limited to this fix.

- [ ] **Step 1: Run focused verification**

\`\`\`powershell
npx vitest run tests/data-pipeline/asset-dependencies.test.ts tests/data-pipeline/asset-dependency-output.test.ts tests/data-pipeline/build-runtime-data.test.ts
npm run data:check
npm run check:runtime-network
\`\`\`

- [ ] **Step 2: Run the full project gate when the manifest is complete**

\`\`\`powershell
npm run verify
\`\`\`

Expected: all gates pass after the missing CDN assets are genuinely published and generated files are regenerated.

- [ ] **Step 3: Inspect final scope**

\`\`\`powershell
git status --short
git diff --stat
git diff --check
\`\`\`

Confirm that archive is unchanged, no dependency files changed, and no unrelated fleet changes entered the branch.
