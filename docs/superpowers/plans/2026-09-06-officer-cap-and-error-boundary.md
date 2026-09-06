# 航海士投稿上限与错误边界加固实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 让航海士投稿数量上限在并发请求下仍然严格生效，并保证 Cloud Function 不向客户端泄露内部异常细节。

**Architecture:** 在 `custom_officers` 外增加按 owner 稳定寻址的锁文件。新投稿在同一事务中读取/更新 owner 计数并插入记录；重提投稿仍使用已有的 revision CAS 路径，不重复占用额度。投稿入口记录带 request id 的完整异常，但只返回固定安全错误 envelope。

**Tech Stack:** Node.js CommonJS Cloud Function、CloudBase transaction、Vitest、TypeScript 测试。

## Global Constraints

- 不新增、删除或升级依赖。
- 所有人工维护的注释、文档和测试描述使用中文；保留必要的 API、变量名和命令英文。
- 只修改 `cloudfunctions/officer-custom/` 及其直接回归测试和本计划文档；不修改 `archive/`、`data/master/` 或 `miniprogram/generated/`。
- 事务内只使用 CloudBase 支持的 `doc().get/set` 与 `collection.add`，不在事务内调用 `where()`。
- 每个生产改动必须先有能失败的回归测试，再实现最小修复。

## 文件边界

- `cloudfunctions/officer-custom/officer-custom-repository.js`：owner 限额锁文件、事务插入 CAS。
- `cloudfunctions/officer-custom/officer-custom-service.js`：新投稿改用限额事务接口，重提路径保持 revision CAS。
- `cloudfunctions/officer-custom/index.js`：统一安全错误返回并保留服务端日志。
- `tests/cloudfunctions/officer-custom-repository.test.ts`：事务限额与并发插入回归。
- `tests/cloudfunctions/officer-custom-service.test.ts`：服务层调用限额接口和并发超限回归。
- `tests/cloudfunctions/officer-custom-index.test.ts`：入口异常不泄露原始错误消息。

### Task 1: 先证明投稿上限存在并发竞态

**Files:**
- Modify: `tests/cloudfunctions/officer-custom-repository.test.ts`

- [x] **Step 1: 扩展测试数据库以支持按名称隔离的 collection 和事务 document 操作。**

让 fake database 为 `custom_officers` 与 `custom_officer_owner_locks` 分别维护 `Map`，事务仍通过串行 `transactionTail` 模拟同一 owner 锁文件的写冲突。

- [x] **Step 2: 写失败测试。**

新增测试：准备同一 owner 的 49 个最新投稿，同时并发调用未来的 `insertIfOwnerBelowLimit` 两次，限制为 50；期望恰好一个返回记录、一个返回 `null`，并且最新投稿总数为 50。

Run: `npx vitest run tests/cloudfunctions/officer-custom-repository.test.ts`

Expected: FAIL，因为 repository 尚无 `insertIfOwnerBelowLimit`。

- [x] **Step 3: 实现 owner 限额事务。**

在 repository 中增加：

```js
const OWNER_LIMIT_COLLECTION = 'custom_officer_owner_locks'
const getOwnerLimitDocumentId = (ownerUid) =>
  `owner_${encodeURIComponent(ownerUid)}`

async function insertIfOwnerBelowLimit(record, maxRecords) {
  await ensureCollection(COLLECTION)
  await ensureCollection(OWNER_LIMIT_COLLECTION)
  const seedCount = await getOwnerLimitSeed(record.ownerUid)
  return db.runTransaction(async (transaction) => {
    const lock = transaction.collection(OWNER_LIMIT_COLLECTION).doc(
      getOwnerLimitDocumentId(record.ownerUid),
    )
    const current = await lock.get()
    const count = Number.isInteger(current?.data?.count) ? current.data.count : seedCount
    if (count >= maxRecords) return null

    const { _id: _ignoredId, ...data } = record
    const result = await transaction.collection(COLLECTION).add({ data })
    await lock.set({
      data: { ownerUid: record.ownerUid, count: count + 1, updatedAt: new Date().toISOString() },
    })
    return { ...data, _id: result._id }
  })
}
```

`getOwnerLimitSeed` 只在锁文件缺失或格式不完整时，通过已有的分页 `countLatestByOwner` 取得一次兼容旧数据的初始值；后续事务只依赖锁文件。

- [x] **Step 4: 运行 repository 测试并确认绿色。**

Run: `npx vitest run tests/cloudfunctions/officer-custom-repository.test.ts`

Expected: 全部通过，新增并发限额测试通过。

### Task 2: 让服务层使用限额事务且不影响重提

**Files:**
- Modify: `cloudfunctions/officer-custom-service.js`
- Modify: `tests/cloudfunctions/officer-custom-service.test.ts`

- [x] **Step 1: 让测试 memory repository 暴露 `insertIfOwnerBelowLimit`。**

该方法按 owner 的当前最新投稿数执行上限判断；测试同时保留 `insert`，以证明只有首次 `submit` 走限额接口。

- [x] **Step 2: 写失败测试。**

准备 49 条最新投稿，并发执行两个新的 `submit`；期望一个成功、一个返回 `limit-reached`，且记录数为 50。另加一个 rejected 投稿的 `resubmit` 测试，确认重提不因已有 50 条新投稿而错误占用新的额度。

Run: `npx vitest run tests/cloudfunctions/officer-custom-service.test.ts`

Expected: FAIL，因为服务仍先 `countLatestByOwner` 再调用普通 `insert`。

- [x] **Step 3: 最小修改服务调用路径。**

将首次投稿的写入替换为：

```js
const record = sourceSubmissionId
  ? await repo.insertRevisionIfAbsent(recordData)
  : await repo.insertIfOwnerBelowLimit(recordData, MAX_CUSTOM_OFFICERS_PER_USER)
```

删除首次投稿前的非原子 `countLatestByOwner` 判断；保留统一的 `null -> limit-reached/conflict` 结果映射。

- [x] **Step 4: 运行服务层测试。**

Run: `npx vitest run tests/cloudfunctions/officer-custom-service.test.ts tests/cloudfunctions/officer-custom-repository.test.ts`

Expected: 全部通过。

### Task 3: 修复投稿入口的内部错误泄露

**Files:**
- Modify: `cloudfunctions/officer-custom/index.js`
- Create: `tests/cloudfunctions/officer-custom-index.test.ts`

- [x] **Step 1: 写入口异常回归测试。**

用 Vitest mock `wx-server-sdk`、repository 和 service，让 `service.dispatch` 抛出 `Error('database password=secret')`；调用导出的 `main`，断言返回值严格为：

```js
{ ok: false, code: 'network', message: '伺服器暫時無法處理請求，請稍後再試' }
```

并断言返回值不包含 `secret`，完整错误只传给 `console.error`。

Run: `npx vitest run tests/cloudfunctions/officer-custom-index.test.ts`

Expected: FAIL，当前入口把原始异常文本拼进返回 message。

- [x] **Step 2: 实现安全错误 envelope。**

入口 catch 保留带 action/request id 的服务端日志，只返回固定中文消息；不要把 `error.message`、`String(error)` 或 stack 放进结果。

- [x] **Step 3: 运行入口测试与相关回归。**

Run: `npx vitest run tests/cloudfunctions/officer-custom-index.test.ts tests/cloudfunctions/officer-custom-service.test.ts tests/cloudfunctions/officer-custom-repository.test.ts`

Expected: 全部通过。

### Task 4: 质量门禁

- [x] **Step 1:** `npx prettier --check cloudfunctions/officer-custom tests/cloudfunctions`
- [x] **Step 2:** `npm run lint`
- [x] **Step 3:** `npm run typecheck`
- [x] **Step 4:** `npm run verify`

提交前记录变更文件、验证结果和拟用 commit message，等待用户确认。

## Self-review checklist

- [x] 新投稿并发场景只能成功一次，50 条上限不会被绕过。
- [x] 重提同一 submission 不增加 owner 配额。
- [x] 旧数据没有 owner 锁文件时能够安全初始化。
- [x] 客户端永远看不到数据库、凭据或 stack 细节。
- [x] 没有新增依赖或修改生成数据。
