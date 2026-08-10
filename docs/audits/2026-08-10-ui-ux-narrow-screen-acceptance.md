# UI/UX 窄屏验收记录

日期：2026-08-10
任务：Task 8 `detail-narrow-screen-qa`
分支：`codex/phase-8-detail-narrow-screen-qa`

## 验收范围

计划中的详情页路径 `miniprogram/pages/detail/` 在当前仓库不存在；实际详情页位于：

- `miniprogram/subpkg-detail/pages/detail/index.wxml`
- `miniprogram/subpkg-detail/pages/detail/index.wxss`
- `miniprogram/components/skill-sheet/index.wxml`
- `miniprogram/components/skill-sheet/index.wxss`

本轮按实际存在的详情页路径进行静态结构核查。依照用户要求，本轮不执行 Computer Use，因此不将以下结果表述为 DevTools 或真机视觉通过。

## 静态结构核查

- 详情页使用根级 `scroll-view scroll-y`，内容区包含头像身份卡、技能卡片、语言和招募信息。
- 详情页技能正文、招聘值和身份语言摘要使用 `min-width: 0` 与 `overflow-wrap: anywhere`；姓名、职位和身份值的超长连续 Latin/数字换行仍需运行时验收。
- 技能 Sheet 使用 `scroll-view scroll-y`，最大高度为 `84vh`，底部 padding 包含 `env(safe-area-inset-bottom)`。
- 技能 Sheet 关闭入口与反向查询入口保持至少 `88rpx` 高度，长文本允许换行。
- 未发现可在无运行时复现证据下确认的布局缺陷，因此未修改详情页或技能 Sheet WXSS。
- 结构检查不能替代对页面级横向溢出、字体替换、真实拖动和安全区的 DevTools/真机验收。

## 验收矩阵

| 页面/组件                | 320px                | 375px                | 393px                | 430px                |
| ------------------------ | -------------------- | -------------------- | -------------------- | -------------------- |
| 详情页头像与身份网格     | 待人工 DevTools/真机 | 待人工 DevTools/真机 | 待人工 DevTools/真机 | 待人工 DevTools/真机 |
| 技能名称与技能卡片       | 待人工 DevTools/真机 | 待人工 DevTools/真机 | 待人工 DevTools/真机 | 待人工 DevTools/真机 |
| 技能详情面板独立滚动     | 待人工 DevTools/真机 | 待人工 DevTools/真机 | 待人工 DevTools/真机 | 待人工 DevTools/真机 |
| 战斗结果预览与底部安全区 | 待人工 DevTools/真机 | 待人工 DevTools/真机 | 待人工 DevTools/真机 | 待人工 DevTools/真机 |
| 战斗/冒险目标行          | 待人工 DevTools/真机 | 待人工 DevTools/真机 | 待人工 DevTools/真机 | 待人工 DevTools/真机 |

## 待人工验收项目

- 确认四种宽度下没有页面级横向溢出。
- 检查超长航海士名、技能名、技能说明和招募条件的实际换行与视觉层级。
- 打开技能详情 Sheet，确认独立滚动不会带动背景页面。
- 检查关闭、取消、应用、撤销等固定底部操作是否避让安全区。
- 在真机确认字体替换、系统安全区和触摸热区没有回退。

## 结论

本轮完成源码结构核查和自动化测试准备，但未完成 320/375/393/430px 的人工视觉验收。后续应在微信 DevTools 或真机补齐矩阵；只有实际复现问题时才新增对应 WXSS 修改。
