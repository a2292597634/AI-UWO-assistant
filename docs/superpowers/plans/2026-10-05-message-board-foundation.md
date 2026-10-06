# 留言板資料與介面基礎實施計畫

> **給執行代理：** 使用 `executing-plans` 順序執行本文件，所有 checkbox 完成要附證據。工作根為主計畫指定的完整隔離候選，原根 `E:\AI UWO assistant` 保持不動。

**目標：** 先確認微信／CloudBase 可行性，建立伺服器唯一來源、穩定協議及可重現部署包。

**架構：** 靜態資料走既有生成流程，前後端共用契約測例，服務端核心與兩個可信入口分離。

**技術棧：** Node >=22 <23、TypeScript、Vitest、現有 wx-server-sdk@4.0.2；不新增根依賴。

## 全域約束

遵循 [總計畫](2026-10-05-message-board.md#全域約束) 與 [設計](../specs/2026-10-05-message-board-design.md)。本文件之輸出名稱是後續 B／U 的唯一接口；變更接口須同步後續計畫及測試。不自動提交或部署。

## G0：保護根與三項可行性門檻

**檔案：** 新增 `tools/message-board/probe-contract.ts`、`build-probe-package.ts`、`tools/message-board/probe-sources/rpc.js`、`callback.js`、`worker.js`、`tests/message-board/probe-contract.test.ts`；只讀檢查 main 上 `tools/workflow/preflight.ts`、既有 CloudBase config；探測說明 `docs/architecture/message-board-cloudbase.md`，輸出 artifacts，配置測試雲須取得相應授權。

**消費：** 最新 main SHA、現有規格、使用者提供的測試環境／接收端資訊。
**產出：** `ProbeResult { gate: 'safety'|'avatar'|'identity'; status: 'passed'|'failed'|'blocked'|'not-run'; environmentId: string|null; candidateSha: string; buildSha: string; evidencePaths: string[]; reason: string|null; verification: 'evidence-consistency' }`。工具只核對證據一致性，正式 G0 判定仍須確認平台與真機來源。

- [x] 記錄原根全部 dirty／untracked SHA，用原生 managed worktree 方式建立 main 隔離分支；copy spec／plans 後核對，不覆蓋 main 新規範。
- [x] 用 Node22 執行 workflow:preflight，記錄公開／私有基礎庫、required inputs 与正确素材來源，不能自動修復原根。
- [x] 寫有真正外部證據缺失的分類測試，不把 probe 自己設定的 boolean 當平台證據：

```ts
expect(
  classifyProbe({
    gate: 'avatar',
    environmentId: 'test-env',
    candidateSha: 'candidate',
    buildSha: 'b'.repeat(64),
    evidencePaths: [],
    observed: { transport: true },
  }),
).toMatchObject({ status: 'not-run' })
```

`classifyProbe(input)` 在 probe-contract 產生上述 ProbeResult；evidencePaths 必須指向本次可讀證據，safety 同時需要發起／回調／落庫，avatar 需要傳輸／ACL／展示／清理，identity 需要多來源／實例复用对照，不接受缺項的「全部通過」。

- [x] 指令 `npm test -- tests/message-board/probe-contract.test.ts`，先觀察缺證據被錯判的紅測試，再實作分類，重跑變綠。
- [x] 最小探測包只依賴已確認的 SDK 版本及 Node 內建能力，由 build-probe-package 產生自包含 index／manifest。rpc.js 驗證本次來源、傳輸預算與私有儲存，callback.js 驗簽／解密、落庫並按要求應答，worker.js 驗證可信定時來源及恢復。它們只寫專用 probe 集合／路徑，不包含玩家留言業務，不引用 F／B 尚未完成的核心，不修改正式消息路由。本地提供合成協議與位元組測例，避免 G0 對 F3／B2 的循環依賴；真實平台的黃金事件／位元組證據由下一項真雲實測取得，不計為本項完成證據。
- [ ] 取得測試條件後做三項 G0 实测：先平台凭证／角色與回調，再64 KiB圖片链路，最後跨來源／實例复用；記录source、版本、時間與候選身份，不上傳真實玩家私密內容。
- [x] 未配置環境時保存探測 payload／步骤與 not-run 結果，不啟動依賴 G0 的正式業務實作。只有三項 passed 后进入 F1。部署／包依賴／接收端 Token 調整逐項依現有授權範圍處理。

G0 本地準備記錄見 [執行記錄](../../audits/2026-10-05-message-board-g0.md)；三個真雲門檻仍 not-run，G0 整體及 F1–V3 不標完成。

## F1：伺服器唯一來源與生成

**新增：** `data/master/game-servers.json`、`data/schema/game-servers.schema.json`、`tools/data-pipeline/build-game-servers.ts`、`tests/data-pipeline/game-servers.test.ts`、`tests/data-contract/game-servers.test.ts`、`tests/fixtures/message-board/server-id-types.ts`。
**修改：** `tools/data-audit/create-schema-validator.ts`、`check-master-dataset.ts`、`validate-master-dataset.ts`；`tools/data-pipeline/generate.ts`、`generated-output-paths.ts`；`miniprogram/contracts/coupon-redemption.ts`、`runtime/generated-modules.d.ts`；`cloudfunctions/coupon-redemption/coupon-redemption-service.js` 及已有相關測試。
**生成：** `miniprogram/generated/game-servers.js`／`game-servers.d.ts`、`cloudfunctions/coupon-redemption/game-servers.json`、`cloudfunctions/message-board/game-servers.json`。不手寫這四個文件。

**產出介面：**

```ts
interface GameServerCatalog {
  version: string
  servers: readonly { id: string; name: string }[]
}
function buildGameServerOutputs(catalog: GameServerCatalog): {
  runtimeJs: string
  runtimeTypes: string
  referenceJson: string
}
```

保留既有 `GAME_SERVERS`、`GameServerId`、`getServerName` 介面；生成 d.ts 帶 literal ID union，不能把 GameServerId 靜默變成任意 string。

- [ ] 在 tests/fixtures/message-board/game-servers-baseline.json 固定現有九項 ID／名稱／順序；內容從已核對既有清單一次採樣，測試期望不能再由新 builder 自己生成。
- [ ] 測試重複／空ID、名稱缺失、排序、literal types、兩雲端參考檔相同及九項基線：

```ts
const output = buildGameServerOutputs(baseline)
expect(JSON.parse(output.referenceJson).servers).toEqual(baseline.servers)
expect(() =>
  buildGameServerOutputs({
    version: '1',
    servers: [
      { id: 'x', name: '甲' },
      { id: 'x', name: '乙' },
    ],
  }),
).toThrow('SERVER_ID_DUPLICATED')
```

- [ ] 跑上述兩個新測試及既有 coupon contract／service 測試，觀察真實重複校驗／相容性失敗；只新增最小輸入 schema、builder 与 pipeline 接線，重跑。
- [ ] 生成後以真實 TypeScript consumer 驗證 literal union；fixture 內容如下，使用 `node node_modules/typescript/bin/tsc --noEmit --skipLibCheck --module commonjs tests/fixtures/message-board/server-id-types.ts`，錯誤放寬為 string 會令 expect-error 無效而失敗，不只檢查 declaration 的某段字串：

```ts
import catalog = require('../../../miniprogram/generated/game-servers')
const valid: (typeof catalog.servers)[number]['id'] = 'UWOGL-US-01'
// @ts-expect-error 未登記的伺服器必須被型別拒絕
const invalid: (typeof catalog.servers)[number]['id'] = 'forged'
void valid
void invalid
```

- [ ] 新 master 纳入 data:check；输出登记含新的 d.ts／JSON 路徑。main 的 GENERATION_INPUT_PATHS 已覆盖 data/master、data/schema 与 tools，先证明 input fingerprint 会随新來源变化，不重寫既有 A2 检查器。
- [ ] 執行 data:check → data:generate → generate:check；觀察所有新輸出被納入完整產物與確定性检查。既有 coupon page、settings、runtime及雲函數行為保持相容。
- [ ] 保留before／after檔案SHA，列出需要与清單版本一起部署的兩函數，不自动部署。

## F2：DTO、純規則與共同測試向量

**新增：** `miniprogram/contracts/message-board.ts`、`miniprogram/domain/message-board/text-policy.ts`、`state-policy.ts`、`response-guards.ts`；`cloudfunctions/message-board/core/validation.js`、`state-policy.js`、`operation-policy.js`、`dto.js`；`tests/message-board/text-policy.test.ts`、`state-policy.test.ts`、`operation-policy.test.ts`、`response-guards.test.ts`、`tests/fixtures/message-board/contract-vectors.json`。

**公共介面：**

```ts
type MessageStatus = 'pending-review' | 'published' | 'rejected' | 'withdrawn' | 'hidden'
type SafetyStatus = 'checking' | 'pass' | 'review' | 'risky' | 'retryable-error' | 'needs-author'
type Actor = { ownerKey: string; openId: string; appId: string; isAdmin: boolean }
type Operation = { operationId: string; expectedRevision?: number }
type Page<T> = { items: readonly T[]; nextCursor: string | null }
type Result<T> = { ok: true; data: T } | { ok: false; code: string; message: string }
interface PublicMessage {
  messageId: string
  revision: number
  nickName: string
  avatarFileId: string | null
  gameServerId: string
  gameServerName: string
  text: string
  createdAt: string
  publishedAt: string
  reply: { text: string; createdAt: string; updatedAt: string } | null
}
function normalizeText(value: unknown, kind: 'nickname' | 'body' | 'reason'): Result<string>
function canPublish(input: {
  status: MessageStatus
  safety: readonly SafetyStatus[]
  manualReviewsComplete: boolean
  ownerClearing: boolean
  assetRevoked: boolean
}): boolean
```

MyMessage 增加 status、安全進度、對作者原因與撤回能力；AdminMessage 再增加检查依據、管理操作能力；均用显式字段白名單，不能继承原資料庫記錄。ViewerCapabilities 返回 viewerKey、isAdmin、serverTime、read／write／review及restricted／clearing；Profile 返回 profileRevision、nickName、avatarAssetId、安全进度、lastServerId。

輸入固定：list 操作 `{cursor?, gameServerId?, status?}`；saveProfile `Operation & {profileRevision, nickName, avatarAssetId:string|null}`；uploadAvatar `Operation & {base64}`；createMessage `Operation & {profileRevision,gameServerId,catalogVersion,text}`；message 動作 `Operation & {messageId,expectedRevision}`，按动作加 reason／reply；reportMessage 加 fixedReason；素材preview传assetId；getOperationResult传operationId；clearMyData传Operation。未知字段、状态、结果或游标拒绝。

服務入口统一 `invoke(action, input, actor): Promise<Result<unknown>>`，action 集合严格对应设计第8.3節。前端 MessageBoardService 同名强类型方法，操作对象及返回DTO按上述规则固定，不以 any／cast 替代guards。

- [ ] 共同測例覆盖501个emoji、NFC／换行、空白、surrogate pair、方向控制字元；前後端分别跑同一人工期望，不互相生成expected。
- [ ] 寫真實失敗並最小修正：

```ts
expect(normalizeText('😀'.repeat(500), 'body')).toMatchObject({ ok: true })
expect(normalizeText('😀'.repeat(501), 'body')).toMatchObject({ ok: false })
expect(
  canPublish({
    status: 'withdrawn',
    safety: ['pass', 'pass', 'pass'],
    manualReviewsComplete: true,
    ownerClearing: false,
    assetRevoked: false,
  }),
).toBe(false)
```

- [ ] operation ID 結構固定為 `<epoch-ms>_<32-hex>`；服务端检查24小时、最多2分钟未来偏差，回执命中先返回，payload hash冲突拒绝；测试回执清理后旧ID仍拒绝。
- [ ] 只在服務端用Node crypto求内容SHA／游标签名，前端用能力探測後的微信安全隨機能力生成128-bit随机ID并以serverTime校时；沒有安全隨機能力時停用投稿並提示更新微信，不增加未定義的發號 RPC，也不用Math.random作唯一凭证。
- [ ] guards拒绝返回私有字段／不合法status，测试公开DTO无OpenID、ownerKey、tasks、拒绝原因；格式錯誤一律展示受控系统錯誤。
- [ ] 跑 `npm test -- tests/message-board`，記錄紅→綠与未实现B/U不会调用真实云。

## F3：共用核心部署包与入口边界

**新增：** `tools/message-board/build-deploy-packages.ts`、`cloudfunctions/message-board/entry.js`、`cloudfunctions/message-board-events/entry.js`、兩source package.json／lock（授权后产生）；`tests/message-board/deploy-packages.test.ts`、`entry.test.ts`。
**修改：** `docs/architecture/message-board-cloudbase.md`。

**產出：** `buildDeployPackages({sourceRoot,outputRoot}): {packages:{name,path,sha256}[]}`，两包写 `artifacts/message-board-deploy/<candidate-hash>/`。业务入口factory `createRpcEntry({readIdentity,service})`；事件入口factory `createEventsEntry({verifyHttp,verifyTimer,callbacks,worker})`。两factory不在module顶层读取用户身分。

- [ ] 先測独立bundle缺失共享require、路径越界、依赖非4.0.2、缺生成server清单时失败：

```ts
const built = buildDeployPackages({ sourceRoot: fixtureRoot, outputRoot: outputDir })
expect(validatePackageRequires(built.packages[1].path)).toEqual([])
expect(buildManifest(built)).toEqual(
  buildManifest(buildDeployPackages({ sourceRoot: fixtureRoot, outputRoot: secondOutput })),
)
```

`validatePackageRequires(path)`／`buildManifest(result)` 由该工具导出，後者接受 buildDeployPackages 的完整回傳值。解析本包静态require，Node內建模块由 builtinModules 判定，唯一其他外部SDK归package.json，拒绝跨包路径与未登记依赖；不执行未知代码来验证依赖。

- [ ] 包结构固定：包根的工具生成 index.js、entry.js、shared/core目录及server参考；index只装配SDK、repo和入口factory。shared由权威core复制，source不维护两份core。禁止直接右键未包装源码目录作正式部署。
- [ ] F3 用完整的合成部署 fixture 驗證包工具及 entry factory，尚未完成的業務組裝不宣稱可部署。B4 完成後以實際核心重建兩包、重跑 requires／exports／node --check；V3 才產生可发布 manifest。G0 使用自己的最小探測包，不依賴此處的未完成業務。
- [ ] 用no-network SDK port做入口測試：普通wx调用payload自称timer仍走RPC并拒绝；HTTP无签名、wrong AppID、跨账号及不同来源复用不可继承Actor。
- [ ] 运行 `npm test -- tests/message-board/entry.test.ts tests/message-board/deploy-packages.test.ts`；对生成JS逐档 `node --check`，包hash不含当前时间及本机绝对路径。
- [ ] 新包依賴仅已核对wx-server-sdk版本；安装／测试云上传之前展示包清单與需求并使用当次有效授权。不得把此task的本地通过称作G0真云通过。
