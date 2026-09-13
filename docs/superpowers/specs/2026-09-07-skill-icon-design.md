# 目录页技能图标组件设计规格

## 1. 背景与目标

代码审查发现，目录页的主动技能和被动技能图标分别在页面 WXML 中直接处理图片加载、错误回退和等级徽章，页面逻辑还会在图片失败时修改行数据。这样会让同一套展示规则分散在模板、页面事件和 presenter 数据结构中，也难以保证无障碍语义一致。

本任务新增通用 `skill-icon` 微信自定义组件，统一目录页技能图标的以下行为：

- 技能图标加载与图片错误回退；
- 无图标或加载失败时的分类文字占位；
- 技能名称的无障碍语义；
- 技能等级徽章；
- 现有 Design Foundation Token 下的图标、占位和徽章样式。

本批次只收口目录页。详情页已有独立的图标回退逻辑，保持现状并另开任务处理，避免扩大本次范围。

## 2. 方案与边界

### 2.1 组件职责

`miniprogram/components/skill-icon/` 是纯展示组件，不负责点击导航，也不修改父页面的行数据。

组件接收以下 properties：

| 属性 | 类型 | 默认值 | 用途 |
| --- | --- | --- | --- |
| `iconPath` | `String` | `''` | 技能图标路径 |
| `skillName` | `String` | `'技能'` | 图标的无障碍名称 |
| `categoryName` | `String` | `'技能'` | 图标缺失时生成分类占位字 |
| `level` | `Number` | `0` | Canonical 技能等级；`Lv.1` 隐藏徽章，`Lv.2` 及以上才显示 |
| `assetReady` | `Boolean` | `false` | 当前目录行素材是否已准备好 |

组件内部维护 `imageFailed` 状态：

- 当 `assetReady`、`iconPath` 均有效且图片尚未失败时显示 `<image>`；
- 图片触发 `error` 后仅将当前组件实例切换到占位状态，不回写父页面的 `visibleRows`；
- `assetReady` 或 `iconPath` 变化时清除失败状态，允许新素材重新尝试加载；
- 占位内容取 `categoryName` 的第一个字符；分类为空时使用稳定的 `技` 作为兜底。

组件根节点使用 `role="img"` 和 `aria-label="{{skillName}}"`。真实图片和占位文字本身不重复暴露语义，外层目录点击热区继续负责按钮语义。

### 2.2 目录页职责

目录页继续拥有 88rpx 的点击热区、技能详情点击事件和主动/被动技能分组布局。页面只负责把 presenter 提供的技能元数据传给组件：

- 主动技能：`activeSkillIcons`、`activeSkillNames`、`activeSkillCategories`、`skillLevels`；
- 被动技能：`passiveSkillIcons`、`passiveSkillNames`、`passiveSkillCategories`、`skillLevels`。

点击热区的无障碍标签改为包含技能名称的动态文本，例如“查看技能詳情：操帆”。若名称缺失则使用“查看技能詳情：技能”。页面移除 `binderror`、图片错误事件处理器和相关的行数据清空逻辑。

页面 JSON 注册 `skill-icon` 组件。页面保留技能 ID、技能名称和技能分类的 presenter 传递链，因为这些字段同时服务于组件展示和点击详情所需的 dataset；不修改技能主数据和生成数据。

### 2.3 样式与素材边界

- 不新增图片、字体或依赖。
- `skill-icon` 组件迁移当前目录页的 44rpx 图标、占位和等级徽章样式。
- 所有颜色、间距、圆角、字号和状态值继续使用 `docs/superpowers/specs/2026-08-09-design-foundation-design.md` 中已有的 `--uwo-*` Token。
- 目录页只保留 88rpx 点击热区和列表布局相关样式，避免组件与页面布局耦合。
- 组件采用项目现有自定义组件的样式隔离约定，确保 Token 可继承且页面样式不会反向依赖组件内部类名。

## 3. 数据流

```text
RuntimeSkill(id, n, cn, ip)
        │
        ▼
catalog presenter enrichCatalogWithIcons
        │  同时生成 icon/name/category 三类 map
        ▼
CatalogRowView.activeSkill* / passiveSkill*
        │
        ▼
catalog/index.wxml
        │  传入 skill-icon properties
        ▼
skill-icon
        ├─ iconPath 有效且加载成功 → 显示图片
        └─ 无路径或加载失败       → 显示分类首字占位
```

图片失败只影响当前 `skill-icon` 实例。父页面的行数据保持不可变，排序、筛选、滚动和其他技能实例不会受到某一张图片失败的副作用影响。

## 4. 错误处理与兼容性

1. 素材尚未准备好：直接显示分类首字占位，不触发无效的网络图片加载。
2. 素材路径存在但图片加载失败：组件捕获 `error`，显示同一分类首字占位。
3. 技能名称为空：无障碍标签使用“技能”，点击热区使用“查看技能詳情：技能”。
4. 分类为空：占位文字使用“技”。
5. `level` 为零、空值、非正值或 `1`：不显示等级徽章；只有 canonical 技能等级大于 `1` 才显示 `Lv.N`。`unlockLevel` 永远不参与角标计算。
6. 组件只使用本地素材路径和已有 presenter 数据，不引入运行时网络请求、远程 URL 或 Node.js API。

## 5. 测试策略

### 5.1 组件契约测试

新增 `tests/components/skill-icon.test.ts`，按项目现有组件测试方式检查：

- 组件 JSON 已声明为自定义组件并采用项目约定的样式隔离；
- WXML 包含图片成功条件、错误事件、分类占位、技能名称无障碍语义和等级徽章；
- 组件 TS 在图片失败后切换本地状态，并在图标路径或素材状态变化时恢复尝试；
- 样式使用 44rpx 尺寸和现有 `--uwo-*` Token，不再依赖目录页内部图标类名。

### 5.2 Presenter 测试

扩展 `tests/presenters/catalog-presenter.test.ts`，验证主动和被动技能均能根据 `RuntimeSkill.n`、`RuntimeSkill.cn` 生成名称和分类 map；无技能元数据时使用空字符串，不改变现有 icon map 和等级数据。

### 5.3 目录页契约测试

扩展 `tests/pages/catalog-page.test.ts`，验证：

- 页面注册并渲染 `skill-icon`；
- 主动、被动技能都传入对应的 icon、名称、分类和等级；
- 点击热区仍为 88rpx，并使用包含技能名称的按钮语义；
- 页面不再保留技能图片 `binderror` 和 `onSkillIconError` 行数据变更逻辑；
- 图标和徽章样式已由组件承接，目录页仍保留点击热区尺寸。

最后运行 `npm run verify`，确认格式、Lint、类型检查、全部测试、运行时网络扫描、数据检查和生成检查均通过。

## 6. 非目标

- 不修改详情页 `subpkg-detail/pages/detail/index.*` 的图标回退；
- 不新增或修改素材生成流程、主数据和生成数据；
- 不改变技能详情点击行为、目录排序、职业显示或筛选行为；
- 不重构其他页面的图标组件；
- 不新增、删除或升级 npm 依赖。

## 7. 验收标准

实现完成后，目录页主动和被动技能都通过 `skill-icon` 展示；图标路径为空、素材尚未就绪或图片加载失败时，用户仍能看到稳定的分类首字占位；等级徽章、点击热区和技能详情导航保持原有行为；无障碍树能读出技能名称；`npm run verify` 退出码为 0；变更仅限本设计和实现所需文件。
