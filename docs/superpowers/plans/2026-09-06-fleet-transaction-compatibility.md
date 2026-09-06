# Fleet 配置交易兼容性修复计划

## Goal

修复 `fleet-config` 在 CloudBase server-side transaction 中调用 `where()` 导致创建、重命名和分类操作失败的问题，同时保留同一 owner、同一 scope 下的名称唯一性与 10 笔上限约束。

## Architecture

- `fleet_configs` 继续保存完整配置记录。
- `fleet_config_owner_locks` 的稳定 `_id` 文件同时作为 owner 级交易锁与配置的轻量索引，按 `battle`、`adventure`、`unclassified` 记录 `configId`、底层文档 ID 与规范化名称。
- 交易回调内只使用 CloudBase 支持的文档操作：`doc().get/set/update/remove` 与新增文档；所有 `where()` 查询留在交易外，用于读取列表、定位旧文档和首次建立 owner 索引快照。
- 首次遇到旧数据时，在 owner 锁文档尚不存在的情况下，以交易外查询建立分类配置索引；后续并发写入通过同一锁文档产生交易冲突并由 CloudBase 重试。

## Tech Stack

- Node.js CommonJS Cloud Function
- CloudBase database transaction API
- Vitest
- TypeScript 测试类型声明

## Global Constraints

- 不修改 `archive/`；不手动修改 `miniprogram/generated/`。
- 不新增、删除或升级依赖。
- 不直接在 `main` 开发；当前工作只在 `codex/phase-1-blockers`。
- 只触及本缺陷需要的 repository、测试和计划文档，不夹带其他审查项。
- 先写失败测试，再修改生产代码；所有注释和文档使用中文。

## Implementation Plan

- [ ] 在 `tests/fleet-config/fleet-config-repository.test.ts` 扩充 fake database 的文档级 `get/set/update/remove` 能力，并让交易 fake 明确拒绝 `where()`，使现有约束测试在当前实现上先失败。
- [ ] 为旧记录建立 owner 索引快照，兼容缺少有效 `scope` 的 `unclassified` 记录，并只把已分类记录纳入名称与数量索引。
- [ ] 重构 `insertWithConstraints`：交易内读取 owner 锁文档，检查索引、写入 `fleet_configs` 文档并更新索引；不在交易内执行查询。
- [ ] 重构 `renameIfVersionAndNameAvailable` 与 `classifyIfVersionAndConstraints`：使用交易外定位的底层文档 ID，交易内通过 `doc()` 读取和条件更新，并同步 owner 索引。
- [ ] 将删除路径纳入同一索引维护机制，避免删除已分类配置后索引残留导致错误的重名或上限判断；保持乐观锁失败返回值不变。
- [ ] 增加旧数据初始化、重名、scope 独立上限、并发插入和版本冲突回归测试；运行 fleet-config 定向测试并确认所有测试通过。
- [ ] 复核变更只覆盖 B-01 相关文件，记录后续仍需处理的 H/M/L 项，不在本计划中实现。

## Verification

- `npx vitest run tests/fleet-config/fleet-config-repository.test.ts`
- `npm run typecheck`
- `npm run lint`
