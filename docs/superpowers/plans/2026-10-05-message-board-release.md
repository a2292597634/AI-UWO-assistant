# 留言板驗收與發布準備實施計畫

> **給執行代理：** 使用 `executing-plans` 順序執行V1–V3。依總計畫保护原根和授权范围，完成可review结果后才申请尚未覆盖的正式部署／提交授权。

**目標：** 证明实现与设计一致，分别交付仓库、页面、真机、真云及部署证据。

**架構：** 一个candidate对应冻结输入／部署manifest／场景hash；真实权限和平台能力不由mock替代。发布包在artifacts，回退不删除用户数据。

**技術棧：** Node22、Vitest、现有verify／DevTools报告、测试CloudBase、iOS／Android。无需新增依赖。

## 全域約束

遵循 [总计划](2026-10-05-message-board.md#全域約束)、设计及唯一页面验收规范。所有测试与部署命令在指定隔离根运行，确认git／env／hash，禁止默认使用原根production环境。

新增 `tools/message-board/check-release-readiness.ts` 与 `tests/message-board/release-readiness.test.ts`。不做文档grep测试，实际消费冻结manifest和存在的证据文件，检测身份／门禁冲突：

```ts
type GateStatus = 'passed' | 'failed' | 'blocked' | 'not-run'
interface ReleaseEvidence {
  candidateSha: string
  gates: Record<'repository' | 'page' | 'ios' | 'android' | 'cloud' | 'callback', GateStatus>
  artifactPaths: string[]
}
function assessRelease(input: ReleaseEvidence): {
  ready: boolean
  failures: string[]
}
expect(
  assessRelease({
    candidateSha: 'candidate',
    artifactPaths: [],
    gates: {
      repository: 'passed',
      page: 'passed',
      ios: 'not-run',
      android: 'not-run',
      cloud: 'not-run',
      callback: 'not-run',
    },
  }).ready,
).toBe(false)
```

该assert证明实际发布门槛拒绝缺少外部证据，不能用工具自己填的passed代替完整证据。存在且匹配candidate／env／SDK／时间的文件由assessRelease核验。

## V1：仓库与页面最终门禁

**修改：** 新实现／场景按失败作范围内修复；新增readiness工具／测试。输出 `artifacts/message-board/<candidate-id>/repository.log`、HTML报告及task-ledger。
**消費：** F/B/U实现、runtime与生成登记、candidate SHA。
**產出：** repository／page分别结果与覆盖矩阵，不含虚构真机通过。

- [ ] 先新增readiness缺云／跨candidate／缺截图拒绝测试，跑红后最小实现判定与安全路径，跑绿；不读取报告外任意文件、不执行其内容。
- [ ] Node22执行 `npm run workflow:preflight` 与 `npm run verify`，记录各step输出；依最新main只读generate:check验证新server产物，不回退旧git-index式generate:check。
- [ ] 运行 `git diff --check`；核对archive、unrelatedmaster、依赖、原根保护SHA；新server字典是唯一允许master业务变更。
- [ ] `npm run devtools:changed -- --mode final --summary "留言板完整流程驗收"`，路由app.json改变按既有规则选择场景全量，保存相应HTML。
- [ ] 读取所有before／after、场景／失败截图、candidate与fixture身份、default formal adapter证明。没有可信before如实缺失，不能重用旧391px截图充新四宽。
- [ ] 覆盖：首页入口、列表empty/loading/error／长文、三个100条窗口、form未选服务器／隐私拒绝／timeout、mine五状态与needs-author、admin普通用户深链与完整处置、清除流程。
- [ ] 修复范围内错误后重跑受影响测试／场景，再最终门禁；范围外缺陷单列，不夹带修复。

## V2：真实CloudBase、回调及双平台验收

**文件：** 更新 `docs/architecture/message-board-cloudbase.md` 的实测表；本次记录 `docs/audits/2026-10-05-message-board-validation.md`（若后续日期执行改实际日期），证据放artifacts，不写真实OpenID、Token或私密内容到Git。
**消費：** G0已批准的测试AppID／环境／接收端、两部署包SHA、合成测试内容与两个普通账号／管理员。
**產出：** ios／android／cloud／callback四层独立证据。

- [ ] 部署前复核包manifest、当前supported云runtime、SDK版本、集合索引、只读public／全私有staging、client function／后台function invoke策略；检查不改现有CDN、error-report、其他消息路由。
- [ ] 合成64KiB边界图片经iOS／Android chooseAvatar上传，记录privacy同意／拒绝、nickname快捷填入／失焦安全清空、默认头像与低能力降级；只测DevTools不填真机passed。
- [ ] 发真实text／media检测，观察private URL可读、trace映射、secure HTTP验签／解密、实际wxa_media_check落库、provider review／risky分类；测试伪造签名、旧／重复／未知trace及45min逾时。
- [ ] 两普通用户验证不能读／撤回／preview对方private数据；普通账号deep link与伪造admin action失败；平台HTTP／timer／跨账号与实例复用不能继承身份。
- [ ] 真数据库并发测额度临界、同operation重复、同ID改payload、approve vs withdraw、clear vs create、worker双租约、asset新增引用vs cleanup；没有实测不能把memory repo判为真实事务通过。
- [ ] 生命周期实际让clear fence排除作者、后台24h以内完成、旧公开副本删除／私有残留处理、profile移除不恢复留言；preview缓存切换用户清理。保留期限用受控clock／到期fixture与实际删除adapter联合验证，不临时删除真实用户资料。
- [ ] 全局开关及角色撤销、限制／解除、举报20/day／去重、候选回复失败保留旧值、admin恢复不置顶，分别留结果；确认日志无原文、完整OpenID／base64／签名。
- [ ] 测试云资源变更及清理按当次有效授权执行。前台读到过的旧内容无法收回应在验收说明保留，不承诺“所有设备瞬间删除”。

## V3：部署准备、差异Review与授权边界

**新增：** `tools/message-board/release-manifest.ts`、`tests/message-board/release-manifest.test.ts`；生产配置模板 `tools/message-board/deploy-config.example.json`（只环境变量名，不含真实秘密）；更新部署说明／候选收尾记录。
**消費：** 两bundle SHA、game-server版本、所有外部证据、approved deployment target。
**產出：** 可review manifest＋部署／回退操作清单；实际执行仍需要相应明确授权。

- [ ] 用实际构建产物生成manifest，含candidate SHA、server catalogVersion、每包／素材hash、集合索引版本、policyVersion、cloud runtime、所需秘密名称、测试证据identity，不用当前系统时间造成不确定性。
- [ ] readiness对任何failed／blocked／not-run、证据缺失／candidate不一致返回ready:false；测试false在正确独立证据齐备时才变true，不能靠patch状态字段。
- [ ] 冻结中文UI素材、两bundle与小程序包；部署顺序是ACL／索引／角色／秘密 → backend／callback／worker → callback verified → miniprogram →逐步开关。
- [ ] 如果测试环境沿用同一AppID的消息推送，正式切换会影响旧路由；明确列出保留事件分流与回退配置，不自动覆盖它。优先独立测试AppID，有共享约束时在G0真实验证并记录。
- [ ] 回退先关write／review，public按需要关read；本人撤回／clear与已持久任务继续可用，worker暂停不得遗失task。保留上一包、索引兼容性和policy配置，不删除用户集合。
- [ ] 最终展示：全部变更文件、master与生成物、依赖清单、各层验证、剩余缺口、manifest及拟用中文commit message，等待用户当次commit／push／正式部署授权。
- [ ] 授权未覆盖时交付准备好的清单与文件，不提交、不推送、不部署，不把计划写完称为留言板上线。若有授权，严格按对应target／版本执行并验证真实结果，失败按已review回退清单处理。
