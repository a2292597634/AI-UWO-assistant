# 代码审查遗留任务

> 来源：`e:\temp\AI-UWO-assistant-master-code-review-2026-08-02.md`  
> 日期：2026-08-02  
> 状态：部分完成，待继续

---

## 已完成（本回合）

- [x] P0-01 分包图片引用 — 验证当前方案可行，无需改代码。详见 `docs/architecture/wechat-subpackage-asset-strategy.md`
- [x] P0-02 流水线顺序 — `pipeline:full` 改为 `import → assets:full → data:generate`
- [x] P0-03 clean checkout 可复现 — 决策：素材不提交 Git
- [x] P1-01 下载失败非零退出 — `tools/asset-pipeline/download-assets.ts` 已加 `process.exitCode = 1`
- [x] P1-05 旧数据归档 — 旧 JS/JSON → `archive/legacy-data/`，测试页 → `archive/legacy-test-pages/`
- [x] P2-06 反向技能查询 — 方案 A：从技能弹层查询时清空所有筛选
- [x] P2-09 免责声明 — 写了 `DISCLAIMER.md`

---

## 待完成：P1（中优先级）

### P1-02：下载批次间缺少延迟，可能被源站封

- **文件**：`tools/asset-pipeline/download-assets.ts`
- **现状**：声明了 `_BATCH_DELAY_MS = 100` 常量但未使用，批次之间连续发起请求无间隔
- **修复**：批次间加真实 sleep，加随机抖动（jitter），设置清晰 User-Agent
- **工作量**：小

### P1-03：测试只检查路径格式，不检查图片真实存在

- **文件**：`tests/data-pipeline/full-data-integrity.test.ts`
- **现状**：断言 `expect(s.ip).toMatch(/^\/subpkg-a\d\/imgs\//)` 只验证字符串格式
- **修复**：
  - 验证每个 `catalog.portraitPath` 对应文件存在
  - 验证每个 `skill.ip` 对应文件存在
  - 验证同一素材只存在于一个正确分片
  - 验证图片可被 sharp 解码
- **工作量**：中

### P1-04：缺少 GitHub Actions CI

- **现状**：仓库无 `.github/workflows` 目录，所有门禁依赖本地执行
- **修复**：新建 `.github/workflows/verify.yml`，PR 和 push 到 master 时跑 `npm ci && npm run verify`
- **注意**：CI 环境不要从 voyage.tw 高频抓取素材，应使用缓存或固定 Manifest
- **工作量**：中

### P1-07：职业筛选项一次性全传，setData 和渲染开销大

- **文件**：`miniprogram/pages/catalog/index.ts`
- **现状**：`onLoad` 时将全部 600 条职业字典一次性 `setData`
- **修复**：
  - 职业筛选加搜索
  - 按冒险/交易/战斗分组
  - 初始只发当前标签所需数据
- **工作量**：中

### P1-08：运行时数据版本硬编码

- **文件**：`tools/data-pipeline/build-runtime-data.ts`、`miniprogram/app.ts`
- **现状**：`dataset.json` 已有 `contentVersion: "1.0.0"`，但运行时写入和 `app.ts` 都硬编码
- **修复**：
  - `generate.ts` 读取 `data/master/dataset.json` 的 `contentVersion`、`sourceSnapshot`、`updatedAt`
  - 传入生成器写入运行时元数据
  - 删除或初始化 `globalData.datasetVersion`
- **工作量**：小

---

## 待完成：P2（低优先级）

### P2-01：素材缓存不复核 SHA-256

- **文件**：`tools/asset-pipeline/download-assets.ts`
- **现状**：`existsSync(prev.localPath)` 判断缓存有效，不重新计算哈希
- **修复**：全量构建或 `assets:verify` 时重新计算哈希
- **工作量**：中

### P2-02：Node.js 版本未固定

- **现状**：无 `.nvmrc`、`.node-version`、`package.json#engines`
- **修复**：添加 `"engines": { "node": ">=22 <23", "npm": ">=10" }` 到 `package.json`
- **工作量**：极小

### P2-03：测试临时目录残留

- **路径**：`tests/.tmp-ui-assets-2jjjRq/` 等
- **修复**：删除临时目录，`.gitignore` 加 `tests/.tmp-*/`
- **工作量**：极小（⚠️ 先确认目录是否仍被使用）

### P2-04：技能图标无统一错误回退组件

- **现状**：头像和装饰框有 `binderror`，技能图标没有统一处理
- **修复**：封装 SkillIcon 组件，统一 binderror、分类默认图标、加载占位、无障碍文本
- **工作量**：中

### P2-05：筛选 Chip 无障碍语义不一致

- **文件**：`miniprogram/pages/catalog/index.wxml`
- **现状**：稀有度/类型/性别 Chip 有 `role="button"` 和 `aria-label`，技能/语言/职业没有
- **修复**：补全 `role="button"`、`aria-label`、`aria-checked`
- **工作量**：小

---

## 推荐执行顺序

```
第一轮（扫小活）：P2-02 → P2-03 → P1-08 → P1-02
第二轮（中等活）：P1-03 → P1-04
第三轮（锦上添花）：P2-01 → P2-04 → P2-05 → P1-07
```

---

## 未纳入修复计划的审查意见

以下来自审查报告的建议**未采纳**或**暂不处理**：

| 建议                     | 原因                     |
| ------------------------ | ------------------------ |
| P0-01 CDN 或离线分包重构 | 经真机验证，当前方案可行 |
| 全量素材提交 Git         | 用户决策不提交           |
| P1-06 页面控制器重构     | 重构风险大，当前可用     |
| P2-07 数据快照时间展示   | 产品需求，待定           |
| P2-08 资产统计口径澄清   | 优先级低                 |

---

## 给接手 Agent 的上下文

- 项目根目录：`E:\AI UWO assistant`
- 微信小程序 + TypeScript + Glass-Easel，离线优先
- `CLAUDE.md` 有项目架构和关键约束
- 修复前先 `npm run verify` 确认基线，修复后再跑一次
