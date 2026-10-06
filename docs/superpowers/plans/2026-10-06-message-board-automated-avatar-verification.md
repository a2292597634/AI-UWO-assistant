# 留言板頭像鏈路自動驗證計畫

> **給執行代理：** 使用 executing-plans 在現有隔離 worktree 順序執行；沿用使用者已授權的現有付費環境測試與自動化驗證，不提交、不新增環境或依賴。

**目標：** 自動證明 64 KiB 合法 PNG 可經實際微信 SDK／雲函數往返，並核驗本次私有存儲目錄的客戶端讀取限制及既有素材可讀；保留真機／回調缺口。

**架構：** 新增固化的 transport-only 探測範圍，僅允許 getIdentity／echoImage，回應有界圖片位元組與 SHA，不寫資料庫或發起內容安全。存儲測试使用 CLI 管理端上传合成图片，只在本次唯一目录临时收紧客户端读取，旧目录客户端读／写语义保持；结束清理图片并恢复原 ADMINWRITE。

**技術棧：** 既有 SDK 4.0.2、Node >=22 <23、TypeScript、Vitest、Node zlib／crypto；无新增依赖。

## 自動化邊界

- SDK 端點仍綁定本次隔離根，開發者工具證據不作真機證據。測試帳號能力查詢結果為 0，不能用注入 OPENID 偽造跨帳號通過。
- 浏览器安全策略禁止自动访问 mp.weixin.qq.com；不得换浏览器、代理、CLI、请求库或其他路径绕过。消息推送后台配置需本人操作，先交付具体可设置的接收端再请求人工步骤。
- 本批不创建数据库集合、不发布用户头像、不变更消息推送配置。RPC 图片动作 stageAvatar／submitImage／makePublicAvatar／worker／callback 仍不放行。
- 原存储必须是 ADMINWRITE 且没有自定义规则，才允许自动生成等价规则；发现他人改动立即停，不覆盖。
- 单一私有前缀 `message-board-probes/private/<runId>/`：read 为 `/^.../.test(resource.path) == false`，write 为 `false`。只使用平台支持的正则 test 与显式比较，不使用 startsWith。
- 规则变更前保存原值，之后复读确认。测试图清理只作用于本次已登记路径；规则恢复前复核当前仍是本次规则，其他人改变后不覆盖。
- SDK 下载旧公开素材与其发布 manifest 的字节 SHA 校验须保持成功。私有文件的服务端存在／字节匹配与客户端权限拒绝须同时成立，不能用文件不存在或网络失败当权限证据。
- 即使上述通过，头像门槛仍需原生展示／真机／完整业务清理；图片安全回调仍未验证，G0 整体不标 passed。

本批实测后补充：目录规则候选被平台拒绝；更小的单文件规则可应用，但旧公开素材取址后的实际 HTTP 读取得到 403，故自动清理并恢复原规则。单文件规则仅作兼容性诊断，不宣称目录私有通过；暂停沿公共桶规则实现私有头图的方案，先评估不改变旧公开素材链路的私有暂存方式。

## 任務

**修改：** `build-probe-package.ts`、`probe-sources/shared.js`、`rpc.js`，新增 `private-storage-rule.ts` 与其逻辑测试；本批控制器／合成图片／原始记录置于 ignored artifacts／.superpowers。

`buildProbePackages.sharedEnvironment.scope?: 'identity-text'|'transport-only'`，未填保留 identity-text；所有 scope 纳入 buildSha／manifest。transport-only 的 `echoImage({base64})` 复用既有 64 KiB／256px／PNG-JPEG 校验，只有允许的操作者才能取得回传；拒绝其他动作。

`buildPrivateProbeRule({acl,rule},runId): {acl:'CUSTOM',rule:{read:string,write:'false'},privatePrefix:string}` 只接受无自定义规则的 ADMINWRITE 与合法 g0-shared-runId。

- [x] 先写 transport-only、超预算／越权拒绝、scope 固化与旧目录等价读取规则的红测试。
- [x] 实作最小代码，跑 message-board 测试至绿与相关类型／lint 检查。
- [x] 生成合法 CRC PNG，精确 65,536 bytes；冻结新批次授权、环境／包 manifest 与资源快照。
- [x] 部署本次 rpc，实际 SDK 身分核对后限定操作者，验证字节往返；临时规则／私有与旧公开素材读权限自动测、按 finally 清理／恢复／停用。自动执行完成不等于私有门槛通过；本批发现不兼容并回退。
- [x] 保存真实成功／失败／阻塞，完整 verify、原根 963 文件及原四业务函数／存储原值核对；不把模拟或未跑项销账。执行记录见 [自動化結果](../../audits/2026-10-06-message-board-automated-avatar.md)，私有存储门槛仍失败。

依据：[存储安全规则](https://docs.cloudbase.net/storage/security-rules)、[规则表达式显式比较](https://docs.cloudbase.net/rule/learn-rules)。
