# UWO Assistant — 航海士資料查詢微信小程序

原生微信小程序 + TypeScript + Glass-Easel。离线优先，运行时无网络请求。

## 语言规范

- **项目代码注释、文档、与用户的所有交互和回复均使用中文**。
- 保留必要的英文表述：专有名词（TypeScript、CloudBase、CDN、Vitest）、文件名、命令、变量名、API 名称等。
- WXML/WXSS 样式类名采用英文（BEM 风格），但与其关联的注释和文档说明使用中文。

## 架构

```
pages → presenters → domain/runtime → contracts → generated
```

数据链路：`voyage.tw → tools/import → data/master → tools/data-pipeline → miniprogram/generated`

素材链路：`voyage.tw → tools/asset-pipeline → miniprogram/assets → subpkg-a0~a9/imgs`

## 触发式参考文档

以下文档不需要每次读取，只在相关任务时按需查阅：

| 场景                                | 文档                                                       |
| ----------------------------------- | ---------------------------------------------------------- |
| 修改素材分包、图片加载、preloadRule | `docs/architecture/wechat-subpackage-asset-strategy.md`    |
| 修改数据流水线、生成逻辑            | `tools/data-pipeline/` 源码 + `tools/asset-pipeline/` 源码 |
| 修改筛选/查询逻辑                   | `miniprogram/domain/catalog-query.ts`                      |
| 数据审计与 Schema                   | `docs/data-audit/`                                         |

## 常用命令

| 命令                    | 用途                                                                          |
| ----------------------- | ----------------------------------------------------------------------------- |
| `npm run verify`        | 全量门禁（format + lint + typecheck + test + 网络边界 + 数据审计 + 生成检查） |
| `npm run pipeline:full` | import → assets:full → data:generate                                          |
| `npm test`              | Vitest                                                                        |

## 一坑一注

- **流水线顺序**：必须先 `assets:full` 再 `data:generate`，运行数据依赖素材已存在。
- **分包图片**：不要加 preloadRule（超 2MB 限制），不要手动 loadSubpackage（API 不可用）。现状已验证可行。详情见上述参考文档。
- **离线优先**：运行时禁止网络请求，`check:runtime-network` 会拦截。
- **头像显示一致性**：所有页面头像层级统一为 z-index: 1=frame, 2=portrait, 3=rarity(top-left), 4=type(bottom-left)。稀有度图标约为头像尺寸的 65%，类型图标约 26%。容器暗色背景 #2f302b（或对应页面的暗色背景）。不可简化为纯肖像图——必须包含 frame + rarity + type 三层。
