# 留言板雲端流程實施計畫

> **給執行代理：** 使用 `executing-plans` 按B1–B4順序執行，先完成 [F基礎計畫](2026-10-05-message-board-foundation.md) 的G0与F1–F3。執行根為完整main隔離候選。

**目標：** 從可信使用者投稿到人工公開，提供可靠安全任務、處置與資料清理閉環。

**架構：** core依賴Repository／Clock／SafetyProvider／StoragePort，外部副作用在交易外；两个入口装配同一核心，部署包自包含。

**技術棧：** CloudBase、现有wx-server-sdk@4.0.2、CommonJS、Vitest。根依赖不变。

## 全域約束與共同接口

遵循 [總計畫](2026-10-05-message-board.md#全域約束) 和設計，不自动commit或部署。F2的DTO、Actor、Result、operation格式与动作名称保持一致。

新增 `tests/message-board/support/memory-repository.ts`、`harness.ts` 作为局部服务测试支撑，禁止进入production。memory repo模拟已明确的原子transaction／revision及租约，用真实业务service；不mock“是否有权限”的结论，外部微信／存储port可替换。并发测试加入可控读取屏障，不能用永远串行的fake证明真实CloudBase并发。

```ts
interface BoardHarness {
  invoke(action: string, input: unknown, actor: Actor): Promise<Result<unknown>>
  seedMessage(record: object): Promise<void>
  seedProfile(ownerKey: string, record: object): Promise<void>
  countMessages(): Promise<number>
  readOwner(ownerKey: string): Promise<{ dailyCount: number; clearing: boolean }>
  advanceMs(ms: number): void
  deliverSafety(event: object): Promise<void>
  forceTransactionRetry(times: number): void
}
function createBoardHarness(): BoardHarness
```

harness角色固定：AUTHOR_A／AUTHOR_B两名普通用户、ADMIN一名管理员；测试只使用合成OpenID，永不写真实用户凭证。预设fake provider返回有效的2.0结构与trace，不用删字段的简化mock。每一task增加此task需要的harness方法，并在support文件实现；不能以未定义helper让测试失效。

## B1：交易投稿、本人权限与公开读取

**新增：** `core/repository.js`、`operation-service.js`、`message-service.js`、`cursor.js`、`service.js`；`tests/message-board/message-service.test.ts`、`repository-contract.test.ts`、`pagination.test.ts`、上述support。
**消費：** F1 server catalog、F2policy／DTO、Actor／Clock、G0可信entry。
**產出：** `createMessageBoardService({repo,clock,policy,safety,storage})` 返回 `invoke(action,input,actor)`；repo `runTransaction(fn)`、`getDoc(collection,id)`、`queryPage(query)`，服务不接收客戶端OpenID。

- [ ] 寫未審核不可見、他人不能撤回／查mine、重复operation一次计额与原文快照的行为测试：

```ts
const h = createBoardHarness()
await h.seedProfile(AUTHOR_A.ownerKey, PROFILE_V1)
const command = validMessageCommand('新留言')
await Promise.all([
  h.invoke('createMessage', command, AUTHOR_A),
  h.invoke('createMessage', command, AUTHOR_A),
])
expect(await h.countMessages()).toBe(1)
expect((await h.readOwner(AUTHOR_A.ownerKey)).dailyCount).toBe(1)
expect(await h.invoke('listPublic', {}, AUTHOR_B)).toMatchObject({
  ok: true,
  data: { items: [] },
})
```

PROFILE_V1 与 `validMessageCommand(text)` 定義於harness，前者有immutable版本1、默认头像与合格暱称；后者产生当前Clock前缀operationId、version1、serverID及catalogVersion，不从production构造测试期望。

- [ ] 运行 `npm test -- tests/message-board/message-service.test.ts`，最小实现交易写message／owner／receipt／tasks；校验version、已知risky、清除flag在扣额度前，禁止先count再insert。
- [ ] 造同一operation不同payload、旧ID回执删除后重放、跨owner猜operation、错误serverVersion及profile失效测试，守住不可變快照与24h过期。
- [ ] 造并发发布与撤回、清除与投稿、两次额度竞争的读屏障，观察服务是否漏读owner gate；与CloudBase adapter doc事务接口契合，transaction内不调用外部provider。
- [ ] 分页用签名cursor、upper-bound与稳定tuple；测试短页／空页有cursor／response96KiB截断、五批扫描预算、restore保留原publishedAt、公开author gate及revoked素材过滤。
- [ ] `withdrawMessage` 幂等：旧公开receipt查询返回最新状态，不重新公开。listMine只给本人；public field白名单验证。
- [ ] 跑B1三文件，后端其他动作未实现时明确unknown-action，不用返回成功空对象作占位。

## B2：个人资料、头像与可靠安全任务

**新增：** `core/profile-service.js`、`asset-service.js`、`image-validation.js`、`safety-provider.js`、`safety-service.js`、`task-repository.js`、`task-worker.js`、`callback-service.js`、`wechat-event-crypto.js`；`tests/message-board/profile-service.test.ts`、`asset-service.test.ts`、`safety-service.test.ts`、`callback-service.test.ts`、`task-worker.test.ts`。
**消費：** B1 transaction／operation／Clock；F2 safety分类；G0签名／解析能力。
**產出：** `uploadAvatar`、`saveProfile`、`getProfile`、`loadPrivateAvatar`、`retrySafety`动作，以及 `createTaskWorker({repo,safety,storage,clock}).runDue()`；`createCallbackService({repo,clock}).acceptVerified(event)` 不接受未经入口验证的原始HTTP。

- [ ] 写64KiB真bytes、256px、signature／格式错误、他人asset、immutable profile历史版本的测试；base64长度先检查，不能Buffer.from后才拒巨型输入。
- [ ] 写非同步结果不会自动公开的测试：

```ts
const h = createBoardHarness()
const created = await createPendingWithCheckingAvatar(h, AUTHOR_A)
await h.deliverSafety(validImagePass(created.assetTraceId))
expect(await h.invoke('listPublic', {}, AUTHOR_B)).toMatchObject({
  ok: true,
  data: { items: [] },
})
```

`createPendingWithCheckingAvatar` 通过真实uploadAvatar／saveProfile／createMessage服务建立记录；`validImagePass(trace)` 返回官方2.0 `wxa_media_check` 合成结构，包含有效AppID、trace、result.suggest与errcode；入口验签另外测试，不让helper绕过来源验证。

- [ ] 运行该组测试观察真实公开／hash错误，再实现三类text／image任务：transaction持久化目标与代数，transaction外调用openid近期要求的provider；scene为nickname1、body／reply2，所有结果验证errcode及suggest。
- [ ] 实现私有存储与server持有的60分钟检查URL，不记录签名。loadPrivateAvatar只回限大小base64；损坏图与渲染／真实provider解析门槛不能被浅signature检查替代。
- [ ] 验证重复、早到、未知trace、旧代数、wrongAppID、假签名、security-mode解密错；有效事件先持久化再ack，落库失败不ack成功。
- [ ] task-worker使用doc事务租约、全局发送预算、1／5min重试、45min无回调错误；2小时访问失效改needs-author，本人访问后重新触发，不用admin替身OpenID。
- [ ] 强制transaction重试与worker崩溃，断言外部check不会在transaction内重复执行；多个worker抢相同task只一个获租约，过期租约可恢复。
- [ ] `npm test -- tests/message-board/profile-service.test.ts tests/message-board/asset-service.test.ts tests/message-board/safety-service.test.ts tests/message-board/callback-service.test.ts tests/message-board/task-worker.test.ts`，再记录G0来源与本地fixture证据区别。

## B3：人工公开、回覆、檢舉与角色

**新增：** `core/review-service.js`、`reply-service.js`、`report-service.js`、`role-policy.js`；`tests/message-board/review-service.test.ts`、`reply-service.test.ts`、`report-service.test.ts`。
**消費：** B1版本／owner状态，B2有效安全结果与storage，专用admin白名单。
**產出：** listAdmin/loadAdmin、approve/reject/hide/restore、saveReply/removeReply、reportMessage、restrictAuthor/unrestrictAuthor/resolveReport。

- [ ] 写普通用户伪造isAdmin／OpenID、admin被移除、checking／risky强行公开、review未额外复核的拒绝测试。
- [ ] 写管理动作碰到撤回的结果：

```ts
const h = createBoardHarness()
const m = await createSafePending(h, AUTHOR_A)
await h.invoke('withdrawMessage', messageOperation(m), AUTHOR_A)
expect(await h.invoke('approve', messageOperation(m), ADMIN)).toMatchObject({
  ok: false,
})
expect(await h.invoke('listPublic', {}, AUTHOR_B)).toMatchObject({
  ok: true,
  data: { items: [] },
})
```

`createSafePending` 经真实B1服务建立；`messageOperation(m)` 含messageId、原expectedRevision与新operationId。测试同时确认DB状态仍withdrawn，而非只断言错误对象。

- [ ] 最小实现角色重验、state／hash／revision gate；public图片准备在transaction外，commit重读owner／asset／revision；孤立候选登记cleanup，不复用可猜assetID作public path。
- [ ] 回覆候选单独检查，旧合格回覆保持；failed candidate丢弃，原文不下架。reject/hide/人工review理由1–200字元，由当次admin安全检查；复制原文违规后不保存公开理由。
- [ ] 举报固定原因、非本人公开留言、one reporter/message、20/day；处理下架与保留都审计；限制／解除从目标message内部解析author，禁止外部传OpenID。
- [ ] restore保留首次publishedAt，受限／清除／revoked作者不可恢复。scope动作命中receipt仍需当前角色合法，不返回旧admin私有DTO。
- [ ] 跑B3三文件；确认profile更新不改旧message，公开DTO不含处罚原因和真实管理OpenID。

## B4：資料清除、素材撤銷、开关与營運

**新增：** `core/privacy-service.js`、`cleanup-service.js`、`feature-policy.js`、`audit-service.js`；`tests/message-board/privacy-service.test.ts`、`cleanup-service.test.ts`、`feature-policy.test.ts`。
**修改：** B1公开读取／发布、B2worker／asset、部署说明。
**產出：** clearMyData/getClearStatus、过期清理任务、owner clear gate、API capability／admin指标。

- [ ] 写清除先于后台删除就阻断公开：

```ts
const h = createBoardHarness()
await seedPublishedViaReview(h, AUTHOR_A, ADMIN)
await h.invoke('clearMyData', freshOperation(), AUTHOR_A)
expect(await h.invoke('listPublic', {}, AUTHOR_B)).toMatchObject({
  ok: true,
  data: { items: [] },
})
expect((await h.readOwner(AUTHOR_A.ownerKey)).clearing).toBe(true)
```

`seedPublishedViaReview` 使用真实create／safety／approve链路；freshOperation遵循F2格式。保留task未执行，证明排除不是靠测试先删光message。

- [ ] 实现owner_state原子clear fence、取消未完成外部任务、记录batch清除游标；每批有限处理，所有旧公开记录变墓碑后才结束fence，删除profile不会恢复旧消息。
- [ ] 写asset新引用与cleanup竞态，取得deleting租约后禁止发布／新引用；重新扫有效profile／message／task引用，删除公私副本只在无保留引用时，外部删除失败重试。
- [ ] 24h孤立物、30d待审／拒绝／撤回与receipt、60min未匹配事件、90d审计；活跃ban不因clear而清除，解除后30d最小key过期。不能靠DB TTL漏删图片。
- [ ] provider后续撤销asset立即让public过滤，后台将已公开相关记录hidden；withdrawn终态不改变。回覆候选risky不误下架原留言。
- [ ] feature开关关闭read／write／review分别测试，withdraw和clear保持可用；指标、脱敏日志、clear失败可追踪。
- [ ] 跑B4三文件与所有message-board本地测试，完成后端工作台必要DTO与部署集合／索引清单，进入U1而非直接正式发布。
- [ ] 補齊 `cloudfunctions/message-board/core/assembly.js` 的 `createRuntimePorts(cloud)`（返回 readIdentity／service）與 `createEventsPorts(cloud)`（返回 verifyHttp／verifyTimer／callbacks／worker），將已測試服務裝配到 F3 的兩個薄 entry；工具生成 index 使用這兩個明確 factory。以實際源構建包並核對每個 require、factory export、SDK manifest 和 node --check，不只驗證合成 fixture。
