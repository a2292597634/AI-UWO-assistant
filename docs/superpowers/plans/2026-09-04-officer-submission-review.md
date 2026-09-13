# 航海士资料投稿与审核工作台实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 将资料维护页改造成所有使用者都能完成的两步投稿流程，并在小程序内提供仅限小程序管理员的投稿审核、修正、驳回与待发布管理。

**Architecture:** 投稿端只提交人类可理解的表单数据与已压缩头像，Cloud Function 以服务端 `OPENID` 区分投稿者与小程序管理员，并在 CloudBase 保存 `pending / approved / rejected / published` 记录。审核通过后由本地同步工具只导出 `approved` 记录，复核字典与资料关系、整理头像资产、生成正式数据并发布；正式生成资料和 runtime 快取不读取未发布投稿。

**Tech Stack:** 微信小程序 TypeScript、WXML、WXSS、CloudBase Cloud Function（CommonJS）、CloudBase Database/Storage、Vitest、既有 `sharp` 资产流水线与 `tcb` CLI。

## Global Constraints

- 开发分支必须是 `codex/phase-11-資料投稿審核`，不直接修改 `master`。
- 界面、资料字典、错误提示与交互文案使用繁体中文；技术名称、文件名、API 名称可保留英文。
- 涉及 UI、WXML 或 WXSS 的编码前，必须完整阅读 `docs/superpowers/specs/2026-08-09-design-foundation-design.md`；新样式只使用其中的 Token、间距、圆角、状态、按钮、触控与安全区规则。
- `archive/` 不可修改；`data/master/` 是唯一手动维护资料源；`miniprogram/generated/` 只能由 `npm run data:generate` 生成，不手动编辑。
- 不新增、升级或安装依赖；沿用现有 `vitest`、`tsx`、`sharp` 与 CloudBase SDK。
- 小程序页面不能直接调用 CloudBase；CloudBase 调用集中在既有 runtime service 边界，并更新 runtime network allowlist 与架构测试。
- 审核权限必须由 Cloud Function 服务端以 `OPENID` 和 `OFFICER_ADMIN_OPENIDS` 环境设置判断；前端显示入口不是授权依据，白名单为空时默认拒绝。
- 同步脚本使用服务端 `OFFICER_SYNC_TOKEN` 进行机器对机器操作；任何 token、OpenID 或凭证都不能写入仓库、WXML 或提交 payload。
- 每个任务完成后运行对应测试，不在执行过程中自动提交产品代码；最终提交前按 `AGENTS.md` 展示变更文件、验证结果和拟用 commit message，等待使用者确认。

---

## 文件地图与边界

### 表单与共享契约

- Create: `miniprogram/contracts/officer-submission.ts` — 投稿状态、表单 payload、投稿摘要、审核记录和 service 接口的共享类型。
- Modify: `miniprogram/contracts/officer-editor.ts` — 保留表单行类型和选项映射，移除用户不可见的 Boss、来源 ID、招募备注字段。
- Modify: `miniprogram/domain/officer-editor.ts` — 两步表单的初始值、完整性校验、头像校验、审核预览 Canonical 建构与 ID 前缀转换。
- Modify: `miniprogram/presenters/officer-editor-presenter.ts` — 投稿页分步 view model、筛选结果、摘要和错误定位。
- Create: `miniprogram/presenters/officer-submission-presenter.ts` — 投稿状态标签、我的投稿列表和审核列表/详情 view model。

### 小程序 runtime 与页面

- Modify: `miniprogram/runtime/officer-editor-service.ts` — 统一包装投稿、我的投稿、管理员状态、审核列表、审核详情与审核 action。
- Modify: `miniprogram/runtime/main-data-store.ts` — 移除投稿成功即写入的自订航海士快取行为；保留的快取只接收 `published` 记录。
- Modify: `miniprogram/pages/officer-editor/index.ts`、`index.wxml`、`index.wxss`、`index.json` — 两步投稿页。
- Create: `miniprogram/subpkg-submission/pages/officer-submissions/index.ts`、`index.wxml`、`index.wxss`、`index.json` — 我的投稿。
- Create: `miniprogram/subpkg-submission/pages/officer-review/index.ts`、`index.wxml`、`index.wxss`、`index.json` — 小程序管理员审核列表。
- Create: `miniprogram/subpkg-submission/pages/officer-review-detail/index.ts`、`index.wxml`、`index.wxss`、`index.json` — 小程序管理员审核详情与编辑。
- Modify: `miniprogram/app.json` — 注册三个新页面路由。

### CloudBase 与同步

- Modify: `cloudfunctions/officer-custom/index.js` — 注入管理员白名单、同步 token、参考资料并分发新 action。
- Modify: `cloudfunctions/officer-custom/officer-custom-service.js` — 投稿验证、角色授权、状态流转、审核编辑、重提与发布标记。
- Modify: `cloudfunctions/officer-custom/officer-custom-repository.js` — owner/status/revision 查询和乐观并发更新。
- Create: `cloudfunctions/officer-custom/image-validation.js` — PNG/JPEG 文件签名、尺寸和 512 KB 校验。
- Create: `cloudfunctions/officer-custom/reference-data.json` — 从 `data/master` 生成的服务端 ID 白名单快照，不手动编辑。
- Modify: `tools/sync-custom-officers.ts` — 只同步 `approved`，下载并规范化头像，输出 `data/master/custom-officers.json`，提供显式发布标记。
- Create: `tools/data-pipeline/load-officers.ts` — 合并官方 `officers.json` 和可选的 `custom-officers.json`，校验 ID 不重复。
- Create: `tools/data-pipeline/build-officer-reference-data.ts` — 从 master 字典、技能和航海士生成 Cloud Function 参考 ID 快照。
- Modify: `tools/data-pipeline/generate.ts`、`tools/asset-pipeline/setup-assets.ts`、`tools/asset-pipeline/download-assets.ts` — 统一使用官方+已同步自订航海士资料，并避免为投稿来源构造 voyage.tw 下载地址。
- Modify: `tools/import/types.ts`、`data/schema/officers.schema.json` — 支持官方 `sourceRefs.voyageTw` 与投稿 `sourceRefs.submissionId` 两种来源引用。
- Create: `docs/architecture/officer-submission-review.md` — CloudBase 环境设置、同步发布操作和状态说明，不写真实凭证。

### 测试

- Create: `tests/domain/officer-submission.test.ts`、`tests/presenters/officer-submission-presenter.test.ts`。
- Create: `tests/cloudfunctions/officer-custom-service.test.ts`、`tests/cloudfunctions/officer-custom-repository.test.ts`、`tests/cloudfunctions/image-validation.test.ts`。
- Create: `tests/runtime/officer-editor-service.test.ts`。
- Modify: `tests/pages/officer-editor-page.test.ts`；Create: `tests/pages/officer-submissions-page.test.ts`、`tests/pages/officer-review-page.test.ts`、`tests/pages/officer-review-detail-page.test.ts`。
- Create: `tests/data-pipeline/load-officers.test.ts`、`tests/data-pipeline/officer-reference-data.test.ts`、`tests/tools/sync-custom-officers.test.ts`。
- Modify: `tests/data-contract/schema-validation.test.ts`、`tests/data-pipeline/build-runtime-data.test.ts`、`tests/data-pipeline/full-data-integrity.test.ts`、`tests/architecture/runtime-dependencies.test.ts`、`tests/architecture/runtime-source-boundaries.test.ts`。

---

### Task 1: 固定投稿表单与审核资料契约

**Files:**

- Create: `miniprogram/contracts/officer-submission.ts`
- Modify: `miniprogram/contracts/officer-editor.ts`
- Modify: `miniprogram/domain/officer-editor.ts`
- Modify: `miniprogram/presenters/officer-editor-presenter.ts`
- Create: `miniprogram/presenters/officer-submission-presenter.ts`
- Test: `tests/domain/officer-submission.test.ts`
- Test: `tests/presenters/officer-submission-presenter.test.ts`

**Interfaces:**

- `SubmissionStatus = 'pending' | 'approved' | 'rejected' | 'published'`。
- `SubmissionFormData` 只包含 `name`、`rarityId`、`typeId`、`genderId`、`jobId`、`nationalityId`、`languages`、`skills`、选填 `recruitment` 和服务端回填的 `portraitFileId`；不包含 `isBoss`、`sourceVoyageTw`、`maintenanceNote` 或招募备注。
- `SubmissionSkillFormRow` 只包含 `skillId`、`skillName`、`unlockLevel`、`level`；`sourceGroup`、`kind`、`slot` 只存在于审核/Canonical资料。
- `PortraitMeta` 包含 `tempFilePath`、`mimeType`、`byteSize`、`width`、`height`，并使用常量 `MAX_PORTRAIT_BYTES = 512 * 1024`、`MAX_PORTRAIT_EDGE = 512`。
- `OfficerSubmissionRecord` 包含 `submissionId`、`ownerUid`、`status`、`revision`、`formData`、`canonicalData`、`review`、`publish`、`history`、`createdAt`、`updatedAt`。
- `buildSubmissionCanonicalPreview(form, reviewFields, submissionId)` 只供管理员界面预览；客户端 service 永远只传 `formData` 与头像 payload，不传可覆盖的完整 `canonicalData`。

- [ ] **Step 1: 写失败的领域与 presenter 测试**

在测试文件中先定义固定测试夹具：`validContext` 含完整的稀有度/类型/性别/职业/国籍/语言/技能 ID 集合，`validForm` 是名称为「測試航海士」、包含一项语言、一项技能和一张 `256×256`、小于 `512 KB` 的 PNG 头像的合法表单；`validFormWithoutRecruitment` 是其 `recruitment` 全空版本，`defaultReview` 为每项技能配置 `passive/sk0/slot: 0` 的审核字段。

```ts
it('投稿必须包含至少一项语言、技能与有效头像', () => {
  const errors = validateSubmissionForm(createEmptySubmissionForm(), validContext)
  expect(errors.map((item) => item.field)).toEqual(
    expect.arrayContaining(['languages', 'skills', 'portrait']),
  )
})

it('技能解锁等级默认 1，筛选结果之外的技能 ID 无法通过', () => {
  const row = createEmptySkillRow()
  expect(row.unlockLevel).toBe(1)
  expect(validateSubmissionForm({ ...validForm, skills: [{ ...row, skillId: 'skill_unknown' }] }, validContext))
    .toEqual(expect.arrayContaining([expect.objectContaining({ field: 'skills[0].skillId' })]))
})

it('招募资料完全不填时生成空数组、null 条件和 null 备注', () => {
  const preview = buildSubmissionCanonicalPreview(validFormWithoutRecruitment, defaultReview, 'sub_1')
  expect(preview.recruitment).toEqual({ cityIds: [], requirementId: null, requiredOfficerIds: [], note: null })
})

it('状态标签和駁回原因只从服务端记录生成', () => {
  expect(buildSubmissionStatusView({ status: 'rejected', rejectReason: '缺少正式头像' })).toMatchObject({
    label: '已駁回',
    reason: '缺少正式头像',
  })
})
```

- [ ] **Step 2: 运行失败测试，确认旧契约不满足新规则**

Run: `npm.cmd test -- tests/domain/officer-submission.test.ts tests/presenters/officer-submission-presenter.test.ts`

Expected: FAIL，因为当前表单仍包含旧的 Boss/来源/招募备注字段，且没有投稿状态与头像 metadata 校验。

- [ ] **Step 3: 实现最小契约、校验与 presenter**

实现以下规则：

1. 名称、稀有度、类型、性别、职业、国籍、正式头像、至少一项语言和至少一项技能必填。
2. 职业、国籍、语言、技能、城市、招募条件只能接受传入的字典/技能 ID 集合；同一语言或技能不可重复。
3. 语言等级保持 `1–10`，技能等级保持本规范要求的单数字等级（当前资料为 `1–3`），解锁等级为整数且不少于 `1`，新技能行默认 `unlockLevel: 1`；两者不得互相填充。
4. 招募资料全空时保持明确的空值，不造出 `city_undefined`、假条件 ID 或手动航海士 ID；正式 Canonical 的 `recruitment.note` 固定为 `null`。
5. 头像只接受 PNG/JPEG metadata，文件大小不超过 `512 KB`，宽高最长边不超过 `512 px`，不强制裁切。
6. Presenter 为职业、国籍、技能和招募选择提供筛选后的 picker 列表，并让 picker index 以筛选列表为准；错误映射到具体字段路径。

- [ ] **Step 4: 运行测试确认领域契约通过**

Run: `npm.cmd test -- tests/domain/officer-submission.test.ts tests/presenters/officer-submission-presenter.test.ts`

Expected: PASS。

---

### Task 2: 实现 CloudBase 投稿、管理员审核与状态并发控制

**Files:**

- Create: `cloudfunctions/officer-custom/image-validation.js`
- Modify: `cloudfunctions/officer-custom/officer-custom-service.js`
- Modify: `cloudfunctions/officer-custom/officer-custom-repository.js`
- Modify: `cloudfunctions/officer-custom/index.js`
- Create: `cloudfunctions/officer-custom/reference-data.json`
- Test: `tests/cloudfunctions/image-validation.test.ts`
- Test: `tests/cloudfunctions/officer-custom-service.test.ts`
- Test: `tests/cloudfunctions/officer-custom-repository.test.ts`

**Interfaces:**

- Cloud Function action：`submit`、`resubmit`、`listMine`、`loadMine`、`getAdminStatus`、`listAdmin`、`loadAdmin`、`saveAdmin`、`approve`、`reject`、`listApprovedForSync`、`getPortraitDownloadUrl`、`markPublished`。
- `OFFICER_ADMIN_OPENIDS`：以逗号分隔的微信 `OPENID` 白名单；空值、重复值和空白值被过滤，解析失败时白名单为空。
- `OFFICER_SYNC_TOKEN`：只用于 `listApprovedForSync`、`getPortraitDownloadUrl`、`markPublished`；不接受前端 action 携带的管理员身份字段。
- `createOfficerCustomService(repo, cloud, options)` 的 `options` 注入 `adminOpenIds`、`syncToken`、`referenceData`，生产入口从环境读取，测试不依赖真实环境变量。
- Repository 提供 `listByOwner`、`listLatestByStatus`、`findBySubmissionIdAndRevision`、`findLatestBySubmissionId`、`insert`、`updateIfRevision`、`countLatestByOwner`。

- [ ] **Step 1: 写图片、权限、状态和 owner 隔离的失败测试**

测试 setup 提供 `createMemoryRepo()`（含可检查的 `records` 数组）、`validSubmissionPayload`、`dispatchSubmit(payload, ownerUid)` 和一组能通过基本表单校验的 1×1 PNG base64 夹具；`invalidPngBase64` 使用错误 signature，确保测试失败原因来自图片校验而不是表单校验。

```ts
it('非管理员不能列出或修改全部投稿', async () => {
  await expect(service.dispatch('listAdmin', { status: 'pending' }, 'openid_user'))
    .resolves.toMatchObject({ ok: false, code: 'forbidden' })
  await expect(service.dispatch('approve', { submissionId: 'sub_1', revision: 1 }, 'openid_user'))
    .resolves.toMatchObject({ ok: false, code: 'forbidden' })
})

it('管理员只能由服务端白名单身份通过', async () => {
  const result = await service.dispatch('getAdminStatus', {}, 'openid_admin')
  expect(result).toMatchObject({ ok: true, data: { isAdmin: true } })
  const spoofed = await service.dispatch('getAdminStatus', { isAdmin: true }, 'openid_user')
  expect(spoofed).toMatchObject({ ok: true, data: { isAdmin: false } })
})

it('投稿成功只产生 pending，不能被 approved 列表读取', async () => {
  const submitted = await dispatchSubmit(validPayload, 'openid_user')
  expect(submitted).toMatchObject({ ok: true, data: { status: 'pending', revision: 1 } })
  await expect(service.dispatch('listApprovedForSync', { syncToken: 'sync-secret' }, ''))
    .resolves.toMatchObject({ ok: true, data: [] })
})

it('头像签名或尺寸不合格时拒绝并不创建投稿', async () => {
  const result = await dispatchSubmit({ ...validPayload, portraitBase64: invalidPngBase64 }, 'openid_user')
  expect(result).toMatchObject({ ok: false, code: 'invalid-portrait' })
  expect(repo.records).toHaveLength(0)
})

it('駁回必须有原因，重新提交沿用 submissionId 并递增 revision', async () => {
  const first = await dispatchSubmit(validPayload, 'openid_user')
  await service.dispatch('reject', { submissionId: first.data.submissionId, revision: 1, rejectReason: '' }, 'openid_admin')
  const rejected = await service.dispatch('reject', { submissionId: first.data.submissionId, revision: 1, rejectReason: '請補正頭像' }, 'openid_admin')
  expect(rejected).toMatchObject({ ok: true, data: { status: 'rejected' } })
  const second = await service.dispatch('resubmit', { submissionId: first.data.submissionId, expectedRevision: 1, formData: validForm }, 'openid_user')
  expect(second).toMatchObject({ ok: true, data: { submissionId: first.data.submissionId, revision: 2, status: 'pending' } })
})
```

- [ ] **Step 2: 运行失败测试，确认现有 service 缺少 action 与图片验证**

Run: `npm.cmd test -- tests/cloudfunctions/image-validation.test.ts tests/cloudfunctions/officer-custom-service.test.ts tests/cloudfunctions/officer-custom-repository.test.ts`

Expected: FAIL，因为现有 service 只支持 `submit`/`listCustom`，且允许客户端传入完整 CanonicalOfficer、上传失败后继续保存。

- [ ] **Step 3: 实现服务端边界与 repository**

实现顺序和约束：

1. `index.js` 从 `cloud.getWXContext().OPENID` 取得 owner，production service 注入 `reference-data.json`、管理员白名单和同步 token；payload 中的 `ownerUid`、`isAdmin`、`reviewerUid`、`status`、`canonicalData`、`publish` 一律忽略。
2. `image-validation.js` 解析 PNG signature/IHDR 与 JPEG SOF marker，验证 MIME、实际签名、实际宽高和 `Buffer.byteLength <= 512 * 1024`；头像上传失败返回 `upload-failed`，不写入投稿记录。
3. `submit` 由服务端生成 `submissionId`，上传头像到 `officer-submissions/<submissionId>/revision-1-<unique-token>.<ext>`，保存 `pending`、`revision: 1`、空的 `review`/`publish`/`history` 和规范化 `formData`。
4. `listMine` 和 `loadMine` 必须按服务端 owner 过滤，只返回该 owner 每个 `submissionId` 的最新 revision；旧 revision 只从详情历史查看。
5. 管理 action 先执行 `isOfficerAdmin(openid)`；非管理员统一返回 `forbidden`，不能依赖前端入口隐藏。
6. `saveAdmin` 接受人类 `formData` 和 `reviewFields`，由服务端重建 `canonicalData`；审核者可修正 `visualGradeId`、技能 `kind/sourceGroup/slot`、技能等级、解锁等级、字典选择和头像，不能传入任意 Canonical 字段。
7. `approve` 只允许 `pending`，服务端重新验证完整资料、技能组别与槽位唯一性，状态改为 `approved`；`reject` 要求非空原因并保留原因到 `review` 与 `history`；`approved` 在同步前可由管理员 CAS 修改但不回退状态。
8. `resubmit` 只允许投稿 owner 从最新 `rejected` revision 发起，以同一 `submissionId` 新建递增 revision，旧 revision 唯读保留。
9. `listApprovedForSync`、`getPortraitDownloadUrl`、`markPublished` 只接受 `OFFICER_SYNC_TOKEN`；同步列表只返回最新 `approved` revision，发布标记需要 `datasetVersion` 且只允许 `approved → published`。
10. 所有写操作以 `expectedRevision` 与 `updatedAt` 做乐观并发检查；冲突返回 `conflict`，不覆盖较新版本。

- [ ] **Step 4: 运行 Cloud Function 单元测试**

Run: `npm.cmd test -- tests/cloudfunctions/image-validation.test.ts tests/cloudfunctions/officer-custom-service.test.ts tests/cloudfunctions/officer-custom-repository.test.ts`

Expected: PASS，覆盖管理员白名单、owner 隔离、状态流转、头像边界、拒绝客户端内部字段和 revision 冲突。

---

### Task 3: 接通小程序 runtime service 与发布状态契约

**Files:**

- Modify: `miniprogram/runtime/officer-editor-service.ts`
- Modify: `miniprogram/runtime/main-data-store.ts`
- Modify: `tools/quality/check-runtime-network.ts`
- Modify: `tests/architecture/runtime-dependencies.test.ts`
- Modify: `tests/architecture/runtime-source-boundaries.test.ts`
- Create: `tests/runtime/officer-editor-service.test.ts`

**Interfaces:**

- `OfficerSubmissionService.submit(form, portraitBase64, portraitMeta)`
- `OfficerSubmissionService.resubmit(submissionId, expectedRevision, form, portraitBase64, portraitMeta)`
- `OfficerSubmissionService.listMine()`、`loadMine(submissionId, revision?)`
- `OfficerSubmissionService.getAdminStatus()`、`listAdmin(status)`、`loadAdmin(submissionId, revision)`、`saveAdmin(input)`、`approve(input)`、`reject(input)`。
- 所有方法将 Cloud Function 错误转换为现有风格的 `OfficerSubmitError(code, message)`；不在 Page Controller 直接调用 `wx.cloud`。

- [ ] **Step 1: 写失败的 service adapter 测试**

先定义可注入的调用依赖：`createOfficerEditorService(deps?: { callFunction?: (action: string, payload: Record<string, unknown>) => Promise<CloudFunctionResponse> })`；测试用 `vi.fn()` 记录 action payload，生产实现默认调用 `wx.cloud.callFunction`。

```ts
it('submit 只传人类表单和头像 payload，不传 owner/status/canonicalData', async () => {
  const service = createOfficerEditorService({ callFunction: fakeCallFunction })
  await service.submit(validForm, 'base64-data', validPortraitMeta)
  expect(fakeCallFunction).toHaveBeenCalledWith(expect.objectContaining({
    action: 'submit',
    formData: validForm,
    portraitBase64: 'base64-data',
  }))
  expect(fakeCallFunction.mock.calls[0][0]).not.toHaveProperty('ownerUid')
  expect(fakeCallFunction.mock.calls[0][0]).not.toHaveProperty('canonicalData')
})
```

- [ ] **Step 2: 运行失败测试**

Run: `npm.cmd test -- tests/runtime/officer-editor-service.test.ts`

Expected: FAIL，因为当前 service 只有 `submitOfficer(officerId, canonicalData, portraitBase64)`。

- [ ] **Step 3: 实现统一 adapter 并封锁本地快取污染**

将现有 `submitOfficer` 替换为投稿表单接口；保留 `callOfficerFunction` 的单一 CloudBase 调用边界。`main-data-store.ts` 移除页面投稿成功所需的 `addCachedCustomOfficer` 调用路径，并让 `refreshCustomOfficers` 只接受服务端返回的 `published` 记录；`pending`、`approved`、`rejected` 永远不能写入 runtime 快取。

- [ ] **Step 4: 运行 adapter 与架构测试**

Run: `npm.cmd test -- tests/runtime/officer-editor-service.test.ts tests/architecture/runtime-dependencies.test.ts tests/architecture/runtime-source-boundaries.test.ts`

Expected: PASS；runtime network scanner 只允许既有 service 边界，新增页面没有 `wx.cloud`、`wx.request` 或远程 URL。

---

### Task 4: 重做用户两步投稿页

**Files:**

- Modify: `miniprogram/pages/officer-editor/index.ts`
- Modify: `miniprogram/pages/officer-editor/index.wxml`
- Modify: `miniprogram/pages/officer-editor/index.wxss`
- Modify: `miniprogram/pages/officer-editor/index.json`
- Modify: `tests/pages/officer-editor-page.test.ts`

**Interfaces:**

- Page state 使用 `step: 1 | 2`、`showReview: boolean`、`isResubmitting: boolean`、`submissionId/revision` 和共享 `OfficerSubmissionFormState`。
- `onNextStep` 只允许通过第一步校验；`onBackStep` 返回修改；第二步完成后进入唯读摘要；`onBackToEdit` 回到第二步。
- 头像选择流程使用 `wx.chooseImage`、`wx.getImageInfo`、`wx.getFileInfo` 和现有 `wx.getFileSystemManager`；压缩/缩放到最长边不超过 `512 px`，保留比例，提交前再次检查 `512 KB`。
- 新投稿调用 `service.submit`；从駁回记录进入时调用 `service.resubmit`；成功后不调用 `addCachedCustomOfficer`，导航至 `/subpkg-submission/pages/officer-submissions/index`。

- [ ] **Step 1: 更新页面静态契约测试使其先失败**

```ts
it('页面只显示两步投稿，不显示旧技术字段', () => {
  const wxml = readPageFile('index.wxml')
  expect(wxml).toContain('第 1 步／共 2 步')
  expect(wxml).toContain('下一步')
  expect(wxml).toContain('已選擇')
  expect(wxml).not.toContain('Boss')
  expect(wxml).not.toContain('voyage.tw')
  expect(wxml).not.toContain('招募備註')
  expect(wxml).not.toContain('技能組別')
})

it('技能选择使用筛选结果 picker，不允许自由建立未知技能', () => {
  const wxml = readPageFile('index.wxml')
  expect(wxml).toContain('filteredSkillOptions')
  expect(wxml).toContain('onSkillIdChange')
  expect(wxml).not.toContain('輸入技能 ID')
})
```

- [ ] **Step 2: 运行页面契约测试确认旧五段长表单不满足要求**

Run: `npm.cmd test -- tests/pages/officer-editor-page.test.ts`

Expected: FAIL，因为当前页面仍有五个 disclosure、Boss、来源 ID、招募备注和技能组别。

- [ ] **Step 3: 实现两步 WXML/WXSS/Controller**

实现以下可见流程：

1. 页面顶部显示 `新增投稿`、`我的投稿`；管理员状态为真时额外显示 `審核工作台`，但不把该显示当作权限判断。
2. 第一步只显示名称、稀有度、类型、性别、职业、国籍与正式头像；职业、国籍使用搜索后 picker，搜索无结果时显示清楚文字。
3. 第二步显示语言和技能；语言从字典 picker 选择，技能先筛选再 picker 选择，重复项即时提示；每条技能只显示技能等级与解锁等级，解锁等级默认 `1`。
4. 招募资料收起并标示 `選填`；城市、招募条件和前置航海士均从字典/名鉴筛选，取消当前手动拼接 `city_` 和 `officer_` ID 的路径；不出现招募备注。
5. 第二步底部显示只读提交摘要、头像预览和 `已選擇 X KB / 512 KB`；提交按钮在请求中禁用并显示加载状态。
6. 对未登录、字典加载失败、头像读取/压缩失败、头像超限、提交网络失败分别保留表单并显示下一步；字段错误显示在对应字段附近，不能只用 toast。
7. 所有新增样式使用 Design Foundation Token；固定底部确认区加 `env(safe-area-inset-bottom)`，按钮最小热区 `88rpx`，长文案允许换行。

- [ ] **Step 4: 运行页面静态与 TypeScript 检查**

Run: `npm.cmd test -- tests/pages/officer-editor-page.test.ts`; `npm.cmd run typecheck`

Expected: PASS；页面不包含旧内部字段，不会在投稿成功时污染本地名鉴。

---

### Task 5: 增加我的投稿列表与駁回重提入口

**Files:**

- Create: `miniprogram/subpkg-submission/pages/officer-submissions/index.ts`
- Create: `miniprogram/subpkg-submission/pages/officer-submissions/index.wxml`
- Create: `miniprogram/subpkg-submission/pages/officer-submissions/index.wxss`
- Create: `miniprogram/subpkg-submission/pages/officer-submissions/index.json`
- Modify: `miniprogram/app.json`
- Create: `tests/pages/officer-submissions-page.test.ts`

**Interfaces:**

- 页面只调用 `service.listMine()`，不传 `ownerUid`；详情/重提调用 `service.loadMine()`。
- `pending` 显示 `待審核`；`approved` 显示 `已審核，待發布`；`published` 显示 `已發布`；`rejected` 显示 `已駁回` 与 `rejectReason`。
- 駁回项的 `根據原因修改後再次提交` 跳转 `/pages/officer-editor/index?submissionId=<id>&revision=<revision>`；新投稿不建立云端草稿。

- [ ] **Step 1: 写页面路由、状态和重提静态测试**

测试文件先定义 `readFile(path: string)` 与 `readPageFile(file: string)` 两个 UTF-8 文件读取 helper，页面读取都从仓库根目录解析，避免依赖运行目录。

```ts
it('我的投稿页面注册路由并展示四种状态语义', () => {
  const app = JSON.parse(readFile('miniprogram/app.json'))
  expect(app.subpackages).toContainEqual(expect.objectContaining({
    root: 'subpkg-submission',
  }))
  const wxml = readPageFile('index.wxml')
  for (const label of ['待審核', '已審核，待發布', '已駁回', '已發布']) expect(wxml).toContain(label)
  expect(wxml).toContain('根據原因修改後再次提交')
})
```

- [ ] **Step 2: 运行测试确认页面不存在**

Run: `npm.cmd test -- tests/pages/officer-submissions-page.test.ts`

Expected: FAIL，因为页面和路由尚未创建。

- [ ] **Step 3: 实现列表、加载态、空态、错误重试和重提导航**

列表按服务端返回顺序显示名称、头像、提交时间、技能数量和状态；加载失败不当作空列表；駁回原因允许换行。重提页由编辑页加载该 owner 自己的最新駁回 revision，提交后回到本页并显示新的 `待審核` 记录。

- [ ] **Step 4: 运行页面测试与型别检查**

Run: `npm.cmd test -- tests/pages/officer-submissions-page.test.ts`; `npm.cmd run typecheck`

Expected: PASS。

---

### Task 6: 增加小程序管理员审核列表与详情编辑页

**Files:**

- Create: `miniprogram/subpkg-submission/pages/officer-review/index.ts`
- Create: `miniprogram/subpkg-submission/pages/officer-review/index.wxml`
- Create: `miniprogram/subpkg-submission/pages/officer-review/index.wxss`
- Create: `miniprogram/subpkg-submission/pages/officer-review/index.json`
- Create: `miniprogram/subpkg-submission/pages/officer-review-detail/index.ts`
- Create: `miniprogram/subpkg-submission/pages/officer-review-detail/index.wxml`
- Create: `miniprogram/subpkg-submission/pages/officer-review-detail/index.wxss`
- Create: `miniprogram/subpkg-submission/pages/officer-review-detail/index.json`
- Modify: `miniprogram/app.json`
- Create: `tests/pages/officer-review-page.test.ts`
- Create: `tests/pages/officer-review-detail-page.test.ts`

**Interfaces:**

- 审核列表进入时先调用 `getAdminStatus()`；`isAdmin:false` 显示无权限说明并返回，不请求投稿全量列表。
- `listAdmin(status)` 支持 `pending`、`approved`、`rejected`、`published` 四种筛选，默认 `pending`，按提交时间倒序。
- 详情 action 使用 `saveAdmin`、`approve`、`reject`，每次携带 `submissionId`、`revision`、`updatedAt`，服务端冲突时显示重新加载。
- 详情中管理员可编辑用户字段、头像、技能等级/解锁等级、技能 `kind/sourceGroup/slot` 和 `visualGradeId`，可查看生成的 `officerId`、Canonical 预览与历史；普通投稿者不可看到这些内部字段。

- [ ] **Step 1: 写管理员页面静态和入口权限测试**

测试文件先定义 `readPageFile` 与 `readDetailFile` 两个 UTF-8 文件读取 helper，分别指向审核列表和详情目录。

```ts
it('审核列表包含状态筛选与待审核摘要', () => {
  const wxml = readPageFile('index.wxml')
  for (const label of ['待審核', '已審核，待發布', '已駁回', '已發布']) expect(wxml).toContain(label)
  expect(wxml).toContain('待審核數量')
  expect(wxml).toContain('onStatusFilterChange')
})

it('审核详情包含保存、通过等待发布和必须填写原因的驳回操作', () => {
  const wxml = readDetailFile('index.wxml')
  expect(wxml).toContain('保存修改')
  expect(wxml).toContain('通過，等待發布')
  expect(wxml).toContain('駁回投稿')
  expect(wxml).toContain('Canonical')
  expect(wxml).toContain('sourceGroup')
  expect(wxml).toContain('slot')
})
```

- [ ] **Step 2: 运行测试确认管理员页面不存在**

Run: `npm.cmd test -- tests/pages/officer-review-page.test.ts tests/pages/officer-review-detail-page.test.ts`

Expected: FAIL，因为审核列表/详情页面和路由尚未创建。

- [ ] **Step 3: 实现管理员列表与详情**

实现以下交互：

1. 管理员列表区分加载中、空列表、错误重试和正常列表，状态不只依赖颜色，并在标题显示待审核数量。
2. 详情复用投稿端纯 presenter/domain 逻辑，但额外展示审核所需的组别、类型、槽位和 Canonical 预览；`sourceGroup` 使用 `sk0`–`sk5` 对应的繁体中文组别名称，槽位只接受非负整数且同组不能重复。
3. `保存修改` 保持当前状态；`通過，等待發布` 只显示为 `approved`；`駁回投稿` 必须先填写非空原因；所有 action 完成后刷新详情与列表。
4. 非管理员无论手动输入路由还是调用 action 都显示无权限；前端不保存或显示真实管理员 OpenID。
5. 详情底部固定 action 区符合安全区和最小热区规则，长驳回原因可以换行。

- [ ] **Step 4: 运行页面、型别与架构测试**

Run: `npm.cmd test -- tests/pages/officer-review-page.test.ts tests/pages/officer-review-detail-page.test.ts`; `npm.cmd run typecheck`; `npm.cmd run check:runtime-network`

Expected: PASS。

---

### Task 7: 把已审核投稿接入 master、schema 与生成资产边界

**Files:**

- Create: `tools/data-pipeline/load-officers.ts`
- Create: `tools/data-pipeline/build-officer-reference-data.ts`
- Modify: `tools/data-pipeline/generate.ts`
- Modify: `tools/asset-pipeline/setup-assets.ts`
- Modify: `tools/asset-pipeline/download-assets.ts`
- Modify: `tools/import/types.ts`
- Modify: `data/schema/officers.schema.json`
- Modify: `tests/data-contract/schema-validation.test.ts`
- Modify: `tests/data-pipeline/build-runtime-data.test.ts`
- Modify: `tests/data-pipeline/full-data-integrity.test.ts`
- Create: `tests/data-pipeline/load-officers.test.ts`
- Create: `tests/data-pipeline/officer-reference-data.test.ts`

**Interfaces:**

- `CanonicalOfficerSourceRefs = { voyageTw: string } | { submissionId: string }`。
- `loadCanonicalOfficers(masterDir = 'data/master')` 返回官方 `officers.json` 后接 `custom-officers.json` 的稳定数组；缺少 custom 文件等同于空数组；ID 重复、投稿来源错误或 custom 记录不是 CanonicalOfficer 时抛出清楚错误。
- `buildOfficerReferenceData(masterDir)` 输出服务端所需的 `rarityIds`、`typeIds`、`genderIds`、`jobIds`、`nationalityIds`、短格式 `languageIds`、`cityIds`、`requirementIds`、`skillIds`、`officerIds`。
- `data/schema/officers.schema.json` 的 `sourceRefs` 使用严格 `oneOf`，只接受完整的 `voyageTw` 或完整的 `submissionId`，不接受 `{ manual: true }`。

- [ ] **Step 1: 写失败的来源、schema、合并和确定性生成测试**

测试 setup 提供 `tempMasterWithoutCustom()`、`tempMasterWithCustom(record)` 和 `customOfficer(submissionId)`：它们在系统临时目录生成最小的 `officers.json`、`custom-officers.json`、`dictionaries.json`、`skills.json` 与 `trade-goods.json`，测试结束递归移除临时目录。

```ts
it('没有 custom-officers.json 时只加载官方航海士', () => {
  expect(loadCanonicalOfficers(tempMasterWithoutCustom())).toHaveLength(officialCount)
})

it('custom 航海士接在官方资料之后并保持稳定顺序', () => {
  const first = loadCanonicalOfficers(tempMasterWithCustom(customOfficer('sub_a')))
  const second = loadCanonicalOfficers(tempMasterWithCustom(customOfficer('sub_a')))
  expect(first).toEqual(second)
  expect(first.at(-1)?.sourceRefs).toEqual({ submissionId: 'sub_a' })
})

it('schema 接受投稿来源但拒绝旧的 manual 来源', () => {
  expect(validator.validate('officers', { ...fixtureOfficer, sourceRefs: { submissionId: 'sub_1' } })).toEqual([])
  expect(validator.validate('officers', { ...fixtureOfficer, sourceRefs: { manual: true } })).toEqual(
    expect.arrayContaining([expect.objectContaining({ code: 'SCHEMA_REQUIRED' })]),
  )
})
```

- [ ] **Step 2: 运行失败测试**

Run: `npm.cmd test -- tests/data-pipeline/load-officers.test.ts tests/data-pipeline/officer-reference-data.test.ts tests/data-contract/schema-validation.test.ts`

Expected: FAIL，因为 generator 目前只读取 `data/master/officers.json`，schema 只接受 `sourceRefs.voyageTw`。

- [ ] **Step 3: 实现合并加载、参考数据快照与资产边界**

1. `generate.ts`、`setup-assets.ts` 使用同一 `loadCanonicalOfficers`；生成前输出合并后的 officer count。
2. generator 将 `custom-officers.json` 中的已发布资产按 `officer_<id>.png` 纳入依赖；正式 manifest 缺头像时明确失败，不回退到远程 URL。
3. `download-assets.ts` 只对有 `sourceRefs.voyageTw` 的官方记录构造 voyage.tw 下载条目；投稿头像由同步工具转换为本地 staging PNG，不被误当成外部来源下载。
4. `data:generate` 同时写入 `cloudfunctions/officer-custom/reference-data.json`；`generate:check` 纳入该文件，防止服务端白名单快照漂移。
5. `sourceRefs` 相关工具使用统一 helper 读取 `voyageTw` 或 `submissionId`；官方 source audit 的代表性 fixture 行为保持不变。
6. `custom-officers.json` 不手动提前写入；当同步工具第一次输出后，`data:check` 和 schema 测试必须覆盖它。

- [ ] **Step 4: 运行资料、生成与资产测试**

Run: `npm.cmd test -- tests/data-pipeline/load-officers.test.ts tests/data-pipeline/officer-reference-data.test.ts tests/data-contract/schema-validation.test.ts tests/data-pipeline/build-runtime-data.test.ts tests/data-pipeline/full-data-integrity.test.ts`; `npm.cmd run data:generate`; `npm.cmd run generate:check`

Expected: PASS，当前无 custom 文件时生成输出与 baseline 一致；有 custom fixture 时会将其纳入 catalog、fleet index、detail shard 和参考 ID 快照。

---

### Task 8: 完成 approved 同步、头像资产和 published 标记

**Files:**

- Modify: `tools/sync-custom-officers.ts`
- Create: `tests/tools/sync-custom-officers.test.ts`
- Create: `docs/architecture/officer-submission-review.md`

**Interfaces:**

- `fetchApprovedSubmissions(syncToken)` 调用 `listApprovedForSync`，只返回最新 `approved` revision。
- `downloadApprovedPortrait(record, syncToken)` 调用 `getPortraitDownloadUrl`，下载后使用现有 `sharp` 转为 PNG，写入 `data/assets/staging/officer_<canonical-id>.png`，保留原比例并校验最长边与大小。
- `buildCustomOfficerMaster(records, existing)` 将 approved 记录的服务端 Canonical 数据按稳定 `submissionId` 顺序写入 `data/master/custom-officers.json`；保留本地已有 published 记录，不写入 pending/rejected。
- CLI 支持默认同步和显式 `--mark-published --dataset-version <version>`；没有显式标记参数时不能改变 CloudBase 状态。

- [ ] **Step 1: 写失败的同步纯函数测试**

测试 setup 提供 `approvedRecord(id, revision = 1)`、`pendingRecord(id)`、`rejectedRecord(id)`、`runSync(input)` 和可注入的 `markPublished` spy；`runSync` 不执行真实 `tcb` 命令，只调用同步模块导出的纯编排函数。

```ts
it('同步只输出 approved，pending/rejected 不进入 custom master', () => {
  const output = buildCustomOfficerMaster([
    approvedRecord('sub_a'),
    pendingRecord('sub_b'),
    rejectedRecord('sub_c'),
  ], [])
  expect(output.map((item) => item.sourceRefs)).toEqual([{ submissionId: 'sub_a' }])
})

it('同一投稿按 submissionId 与 revision 确定性输出，重复运行结果相同', () => {
  const first = buildCustomOfficerMaster([approvedRecord('sub_b'), approvedRecord('sub_a')], [])
  const second = buildCustomOfficerMaster([approvedRecord('sub_a'), approvedRecord('sub_b')], [])
  expect(second).toEqual(first)
})

it('默认同步不标记 published，显式 datasetVersion 才调用标记 action', async () => {
  await runSync({ approved: [approvedRecord('sub_a')] })
  expect(markPublished).not.toHaveBeenCalled()
  await runSync({ approved: [approvedRecord('sub_a')], markPublished: '1.0.1' })
  expect(markPublished).toHaveBeenCalledWith('sub_a', 1, '1.0.1')
})
```

- [ ] **Step 2: 运行失败测试**

Run: `npm.cmd test -- tests/tools/sync-custom-officers.test.ts`

Expected: FAIL，因为当前脚本调用返回 pending/approved 的 `listCustom`，不能下载投稿头像，也没有显式 published 标记。

- [ ] **Step 3: 实现同步与运维说明**

1. 重构脚本让 CloudBase 调用、头像下载、Canonical 合并和文件写入成为可测试函数；CLI 入口只在直接执行时运行。
2. 下载 URL 使用 Cloud Function 返回的临时 URL，仅存在于本地同步过程；不把 URL 写进 runtime 数据或仓库。
3. 将 JPG/JPEG/PNG 统一转换为现有资产流水线要求的 PNG；输出文件名只使用服务端稳定 officer ID，禁止用户名称参与路径。
4. 同步结束只写 `custom-officers.json` 和 staging 资产，并打印后续顺序：`npm run assets:setup` → `npm run assets:publish` → `npm run data:generate` → `npm run verify` → 小程序发布 → `--mark-published`。
5. 运维文档明确设置 `OFFICER_ADMIN_OPENIDS`、`OFFICER_SYNC_TOKEN`，说明「小程序管理员」不是前端开关，未配置时审核 action 会拒绝；不记录真实值。

- [ ] **Step 4: 运行同步测试与脚本静态检查**

Run: `npm.cmd test -- tests/tools/sync-custom-officers.test.ts`; `npm.cmd run typecheck`; `npm.cmd run lint`

Expected: PASS；未提供 CloudBase 凭证时测试使用 fake runner，不触发真实外部写入。

---

### Task 9: 集成验收、窄屏检查与交付门禁

**Files:**

- Modify only files already listed in Tasks 1–8 if integration fixes are required。
- Test: `tests/pages/officer-editor-page.test.ts`
- Test: `tests/pages/officer-submissions-page.test.ts`
- Test: `tests/pages/officer-review-page.test.ts`
- Test: `tests/pages/officer-review-detail-page.test.ts`
- Test: all existing and newly added tests through `npm.cmd run verify`

**Interfaces:**

- 所有 UI 页只通过 service 使用 CloudBase；页面静态契约、runtime network scanner 和 architecture tests 共同守住边界。
- 数据发布链路是 `pending → approved → sync approved → data/master/custom-officers.json → assets → data:generate → verify → 小程序发布 → published`。

- [ ] **Step 1: 运行聚焦测试并修正集成契约**

Run: `npm.cmd test -- tests/domain tests/presenters tests/runtime/officer-editor-service.test.ts tests/cloudfunctions tests/pages tests/data-pipeline/load-officers.test.ts tests/data-pipeline/officer-reference-data.test.ts tests/tools/sync-custom-officers.test.ts`

Expected: PASS；若失败，只修正本 feature 触及的契约，不顺手修改无关页面或数据。

- [ ] **Step 2: 运行完整仓库验证**

Run: `npm.cmd run verify`

Expected: `format:check`、`lint`、`typecheck`、全量 Vitest、runtime network、mini program size、UI assets、CloudBase manifest、data check 和 generate check 全部通过。

- [ ] **Step 3: 做人工窄屏验收**

使用微信开发者工具在 320/375/393/430 px 检查：

1. 普通用户能在两步内完成基本资料、语言、技能和头像投稿；招募资料可留空。
2. 技能只能筛选后选择；解锁等级默认 1 且可逐条修改；任何页面不显示用户不需要填写的 Boss、来源、证明或招募备注。
3. 头像选择后显示预览和文件大小，超 512 KB 或最长边超 512 px 时保留表单并要求重新选择。
4. 我的投稿正确展示四种状态、駁回原因和重提入口；pending/approved/rejected 不出现在正式名鉴。
5. 非管理员手动打开审核路由显示无权限；小程序管理员可看到待审核列表、编辑详情、保存、通过等待发布、填写原因后驳回。
6. 审核通过后仍显示已审核待发布；同步/生成/发布完成并标记 published 后才出现在正式名鉴。
7. 所有固定底部 action 有安全区留白，长名称/长技能名/长駁回原因可换行，无页面级横向溢出。

- [ ] **Step 4: 提交前展示变更与验证结果，等待确认**

执行：`git status --short`、`git diff --stat`、`git diff --check`，记录完整 `npm.cmd run verify` 输出、人工窄屏结果和拟用 commit message。未取得用户确认前不执行产品代码 commit。

拟用 commit message：`feat: 新增航海士资料投稿审核工作台`

---

## 计划自检

- 设计规格第 1–3 节由 Global Constraints、Tasks 1/4/6/7 覆盖：所有使用者投稿、管理员服务端权限、数据三层边界和非目标依赖限制均有对应任务。
- 设计规格第 4–6 节由 Tasks 4/5 覆盖：两步流程、选填招募、512 KB/512 px 头像、我的投稿、状态文案和駁回重提均有测试与页面验收。
- 设计规格第 7–8 节由 Tasks 2/6 覆盖：管理员列表/详情、直接修改、保存/通过/驳回、白名单和 revision/CAS 均有服务端与静态测试。
- 设计规格第 9–10 节由 Tasks 7/8/9 覆盖：approved 同步、资产处理、生成、发布标记、失败可恢复和不污染 runtime 均有明确命令与边界。
- 设计规格第 11–14 节由 Tasks 1/3/4/5/6/9 覆盖：Page/Presenter/Domain/Service 分层、测试、窄屏验收和工程门禁均有文件归属。
- 已扫描本计划中的占位词，未保留 `TBD`、`TODO`、`待確認` 或未定义的“适当处理”步骤；所有跨任务接口均在对应 Task 的 Interfaces 中定义。
