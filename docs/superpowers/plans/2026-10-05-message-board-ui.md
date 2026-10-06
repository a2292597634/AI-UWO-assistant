# 留言板前端頁面實施計畫

> **給執行代理：** 使用 `executing-plans` 順序執行U1–U4，先完成F／B。工作根為main隔離候選。編碼前完整閱讀Design Foundation及唯一頁面驗收規格。

**目標：** 完成四頁与首頁入口，让使用者能主動選微信資料、选服务器、投稿／撤回，让管理员能審核与处置。

**架構：** runtime负责CloudBase适配与隱私／临时文件，controller保存意图与in-flight操作，presenter形成繁体文案；页面只绑定事件与ViewModel。

**技術棧：** TypeScript、WXML／WXSS、Glass-Easel、原生微信元件、Vitest及现有DevTools驗收；不新增UI依賴。

## 全域約束

遵循 [總計畫](2026-10-05-message-board.md#全域約束)、[Design Foundation](../specs/2026-08-09-design-foundation-design.md) 和 [頁面验收規格](../specs/2026-09-16-miniprogram-review-html-report-design.md)。
DTO、operation格式及动作接口消費F2，不能在前端重新發明server欄位与身份。每一批页面改动执行doctor／iterate，最终final；fixture结果不证明真实微信隐私与回调。

## U1：受控Runtime、角色能力与平台适配

**新增：** `miniprogram/runtime/message-board-service.ts`、`message-board-platform.ts`、`tests/runtime/message-board-service.test.ts`、`message-board-platform.test.ts`。
**修改：** `runtime/cloudbase-config.ts`、`tools/quality/check-runtime-network.ts`、`tests/unit/local-only.test.ts`、`tests/architecture/runtime-dependencies.test.ts`。
**消費：** F2 MessageBoardService与guards，B客户端function。
**產出：** `createMessageBoardService(): MessageBoardService`；`createMessageBoardPlatform(wxPort)` 返回privacySetting、openPrivacy、ensureConsent、choose／prepareAvatar、createOperationId、readViewerScopedDraft、writeDraft、discardPreview等原生适配，不提供数据库port。

- [ ] 添加白名单前，先对新service真实callFunction跑既有边界测试，观察拒绝；对同文件uploadFile／database／CDN均继续拒绝，不能用一个正则全放行wx.cloud。
- [ ] runtime测试合法／unknown response、public私有字段泄露、业务错误、cloud network异常与operation原值：

```ts
const op = { operationId: '1791190000000_' + 'a'.repeat(32) }
await service.createMessage({
  ...op,
  profileRevision: 1,
  gameServerId: 'UWOGL-US-01',
  catalogVersion: '1',
  text: '留言',
})
expect(capturedCall.data.operationId).toBe(op.operationId)
```

capturedCall来自mock云调用的最底层port；测试还通过真实response guard核对完整DTO，不只比较被mock调用次数。

- [ ] 最小新增已明确授权的service callFunction路径与function-name常量，其他范围原样；每个action args按F2，private DTO不进入公开VM。
- [ ] 平台适配使用wx.getPrivacySetting／agreePrivacyAuthorization／openPrivacyContract；原生chooseAvatar结果走有界缩放压缩与file stat，先判尺寸／bytes再base64读取。最多三轮，不用Node FS，不保存临时路径到持久storage。
- [ ] 私有头像preview写当前用户作用域临时目录，离开及切换viewerKey清理；后台取消timer／挂起操作，不落地公开正文缓存。
- [ ] 运行两个runtime新测试及 `npm run check:runtime-network`、相关架构测试，证明只新增目标API。外部平台支持仍使用G0证据。

## U2：表單、草稿与个人资料Controller

**新增：** `miniprogram/controllers/message-board-compose-controller.ts`、`message-board-profile-controller.ts`、`presenters/message-board-compose-presenter.ts`、`domain/message-board/draft-store.ts`；`tests/message-board/compose-controller.test.ts`、`profile-controller.test.ts`、`draft-store.test.ts`。
**消費：** F2 normalize／DTO，U1service／platform；身份由getViewer得opaque viewerKey。
**產出：** compose controller `selectServer`、`setNickname`、`setBody`、`selectAvatar`、`submitForm`、`confirmPendingOperation`、`onShow`、`dispose`；profile controller `save`／`clear`／`refreshClearStatus`，不提交原文编辑。

- [ ] 写未选服务器、失焦后昵称为空、viewerKey切换、不明身份拒读草稿、7d过期、profile版本失效及草稿新旧区分测试。
- [ ] 写timeout不产生第二operation的测试：

```ts
await controller.submitForm({ nickname: '航海者', body: '保留內容' })
expect(controller.view().submitState).toBe('unconfirmed')
const firstId = controller.pendingOperationId()
await controller.confirmPendingOperation()
expect(controller.pendingOperationId()).toBe(firstId)
expect(controller.view().body).toBe('保留內容')
```

controller测试使用完整service结果／错误port：第一次transport拒绝，第二次查询仍未确认；不假定每次timeout都意味着服务器失败。

- [ ] 最小controller状态机validating／saving-profile／submitting／unconfirmed／accepted／error；form提交值是昵称权威，不提前拿页面旧state。
- [ ] clear草稿只在确认对应operation成功且草稿代数没有新编辑时；保存的头像或昵称更新不修改旧message快照。取消头像可以默认图，拒绝privacy只保留文本草稿不上传个人数据。
- [ ] clearMyData二次确认、清除中禁新上传／投稿、status轮询有界并在dispose停止；给出已删除内容与保留最小记录的文案。
- [ ] 跑U2三测试，先红后绿；纯逻辑测试不宣称chooseAvatar真机授权通过。

## U3：公開／本人列表与投稿页面

**新增：** `controllers/message-board-list-controller.ts`、`presenters/message-board-list-presenter.ts`；`subpkg-message-board/pages/board/index.{ts,json,wxml,wxss}`、`compose/index.{ts,json,wxml,wxss}`、`mine/index.{ts,json,wxml,wxss}`；`tests/message-board/list-controller.test.ts`、`tests/pages/message-board-page.test.ts`；`tools/miniprogram-review/scenarios/message-board-list.json`、`message-board-compose.json`、`message-board-mine.json`。
**修改：** `miniprogram/app.json`、场景registry／fixtures及needed adapter能力识别。
**消費：** U1service、U2controller、F1server catalog、B公开／本人DTO。
**產出：** list controller `refresh`／`selectServer`／`loadMore`／`nextWindow`／`previousWindow`／`revalidate`／`onHide`；三頁native事件→controller、VM→WXML。

- [ ] 写逆序筛选响应不会覆盖最后意图、cursor绑当前server、空页有cursor、96KiB短页、100条换窗口、后台timer停止的controller行为测试：

```ts
const first = controller.selectServer('UWOGL-US-01')
const second = controller.selectServer('UWOGL-JP-02')
resolveSecond({ items: [JP_MESSAGE], nextCursor: null })
resolveFirst({ items: [US_MESSAGE], nextCursor: null })
await Promise.all([first, second])
expect(controller.view().items.map((x) => x.messageId)).toEqual([JP_MESSAGE.messageId])
```

deferred service port在test helper中真实控制promise完成顺序；不能调用页面handler假冒原生点击。

- [ ] UI先按照Token布局：统一列表、行分隔、六行展开、状态文案、底部按钮、安全区与键盘；mine显示五状态及needs-author单独动作。
- [ ] compose先服务器再资料／正文；先不渲染未授权privacy元件，昵称原生type、头像原生button，disabled原因文本可见。
- [ ] 路由注册四页（admin页面由U4完成），新页不能被app路由缺失伪装成“已有”截图。分页默认20，100条“下一段／上一段／回到最新”；前台重验每60s，消失項删除且cursor不回退。
- [ ] 在现有types／fixtures中注册message-board normal、pending、unconfirmed、review、error、clearing测试情境；fixture只接外部service底层，不直接改页面完成态。明确扩展真实自定义组件作用域识别，不能编造新scenario字段。
- [ ] 保存可重跑场景，使用已有waitUntil条件，点击后等实际状态／路由完成，截图绑定candidate／fixture／adapter／尺寸。
- [ ] `npm run devtools:doctor` → iterate；检查320／375／393／430px与至少三窗口长列表；读HTML与截图。跑U3相关逻辑／页面测试，真机授权仍列V2。

## U4：管理工作台、檢舉、資料清除与首頁

**新增：** `controllers/message-board-admin-controller.ts`、`presenters/message-board-admin-presenter.ts`、`subpkg-message-board/pages/admin/index.{ts,json,wxml,wxss}`；`tests/message-board/admin-controller.test.ts`、`tests/pages/message-board-admin-page.test.ts`；`tools/miniprogram-review/scenarios/message-board-admin.json`、`message-board-clear.json`。
**修改：** board／mine页面、`pages/home/index.ts`／wxml／wxss、`tests/pages/home-page.test.ts`、`tools/ui-assets/config.ts`、`tools/miniprogram-review/scenarios/home-visual.json`。
**素材来源：** 新增 `data/master/ui-assets/message-board-icon.svg`、`message-board-default-avatar.svg`。使用自绘简单信笺／人物轮廓vector，经现有sharp工具生PNG；不增加生成图片依赖、emoji或外部图标库。
**生成：** `miniprogram/assets/ui/feature-message-board.png`、`message-board-default-avatar.png`。

- [ ] 写工作台capabilities未返回管理员时不显示入口，业务forbidden可恢复到普通视图；revision冲突不覆盖新data，saveReply候选失败保留旧reply。
- [ ] 写前端不允许checking／risky公开，review显示额外理由；后台仍再次授权，不把前端disable当安全保护。
- [ ] workbench实现状态／server／report筛选、private preview、原因、回覆候选、下架／恢复、限制／解除及report处置；所有确认保持原expectedRevision和operation ID。
- [ ] board固定理由举报，mine撤回确认／清除提示，清除task开始后公开本机窗口立即移除本人項；pending失败保留本文方便另投稿，不自动重新发布。
- [ ] 首页新增“玩家交流／留言板”，原六项顺序与error-report不变；本地资源注册recipes，assets:ui生成后检查预算，不手改PNG或扩大全部UI布局。
- [ ] 使用保存场景实际点击穿过首页、发表、mine、admin及clear，含普通用户访问admin深链；iterate后读截图并最小修正。
- [ ] 跑home与两admin新测试、assets:ui:check、runtime-network、包体积；最终进入V1–V3，不以UI fixture代替真实管理权限。
