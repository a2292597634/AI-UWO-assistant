# 小程序 AI 自主页面验收

本工具使用微信官方 `miniprogram-automator` 连接本机微信开发者工具，让 AI 能自行进入页面、点击、输入、滚动、断言并截图。自动化结果写入 `artifacts/miniprogram-review/`，该目录不会提交 Git。`report.html` 是主报告，打开后直接显示场景和修改过程截图；`report.json`、`report.md` 用于机器读取和兼容脚本。

## 首次设置

1. 使用微信开发者工具打开仓库根目录并登录。
2. 在「设置 → 安全设置」开启服务端口。
3. 开启「自动化接口打开工具时默认信任项目」，避免自动启动时停在项目授权弹窗。
4. 保持项目窗口打开。首次授权、扫码登录和真机确认仍由用户完成。
5. 运行诊断：

```powershell
npm run devtools:doctor
```

工具会探测常见安装位置，包括本机的 `D:/微信web开发者工具/cli.bat`。非标准安装可在当前终端设置：

```powershell
$env:WECHAT_DEVTOOLS_CLI = 'D:/微信web开发者工具/cli.bat'
$env:WECHAT_DEVTOOLS_SERVICE_PORT = '55975'
$env:WECHAT_AUTOMATION_PORT = '9420'
```

也可连接已经启动的自动化端点：

```powershell
$env:WECHAT_AUTOMATION_WS_ENDPOINT = 'ws://127.0.0.1:9420'
```

自动化端点必须是本机 `ws` 地址。不要把服务端口或自动化端口暴露到公网。

`doctor` 会先确认服务端口可访问，再调用开发者工具服务 API `/v2/islogin` 检查登录状态；如果设置了
`WECHAT_AUTOMATION_WS_ENDPOINT`，还会读取自动化端点的 `Tool.getInfo`。因此它不会把任意一个普通 TCP
监听端口误判为可用的开发者工具会话。

## 命令

```powershell
npm run devtools:doctor
npm run devtools:start
npm run devtools:inspect -- --page /pages/catalog/index
npm run devtools:run -- --scenario catalog-search
npm run devtools:review -- --page /pages/catalog/index
npm run devtools:changed -- --mode iterate --summary "调整目录页布局" --note "确认小屏没有横向溢出"
npm run devtools:changed -- --mode final --summary "目录页布局最终验收"
```

- `doctor`：检查项目路径和 CLI，不启动或修改开发者工具。
- `start`：启动自动化连接，显示当前页面后断开，用于验证连接。
- `inspect`：打开单个页面并截图。
- `run`：运行一个命名场景或 JSON 文件路径。
- `review`：运行入口路径相符的全部已保存场景。
- `changed`：根据当前 Git 页面变更选择场景，并生成带修改过程和截图的迭代报告；`--mode` 必须是 `iterate` 或 `final`，可用 `--summary` 和重复的 `--note` 补充修改说明。

艦隊分享圖场景：

```powershell
npm run devtools:run -- --scenario battle-fleet-share
npm run devtools:run -- --scenario adventure-fleet-share
```

战鬥与冒險分享场景会点击配置栏分享、等待生成图片、检查预览可见性、截取顶部与底部，并滚动分享预览内容。修改
`fleet-share-renderer`、`fleet-share-layout`、海圖／航海裝飾来源或其 UI recipe 时，`devtools:changed` 会自动选中这两个入口；
只修改数据或文档时则不会打开开发者工具。

退出码 `0` 表示命令通过，`1` 表示诊断、连接、步骤或断言失败，`2` 表示命令参数错误。

## 场景格式

场景保存在 `tools/miniprogram-review/scenarios/`。示例：

```json
{
  "name": "航海士目录搜寻与详情",
  "entry": "/pages/catalog/index",
  "state": "normal",
  "devices": ["iphone-small", "iphone-standard", "android-large"],
  "steps": [
    {
      "action": "input",
      "selector": ".catalog-page__search-input",
      "value": "達納"
    },
    { "action": "tap", "selector": ".catalog-page__officer-row" },
    { "action": "assertExists", "selector": ".detail-page" },
    { "action": "scrollElement", "selector": ".detail-page", "distance": 800 },
    { "action": "screenshot", "name": "officer-detail-bottom" }
  ]
}
```

支持的动作包括 `navigate`、`switchTab`、`tap`、`input`、`clearInput`、`scrollPage`、`scrollElement`、`waitFor`、`assertExists`、`assertVisible`、`assertText` 和 `screenshot`。场景不支持执行任意 JavaScript。

## AI 标准验收流程

每次新增或修改页面后，AI 必须：

1. 完整阅读 Design Foundation 与该功能的规格文档。
2. 运行相关 Vitest、TypeScript、ESLint 和架构门禁。
3. 运行 `devtools:doctor`；完成一批页面修改后运行 `devtools:changed -- --mode iterate`。
4. 交付前在页面改动仍存在于工作区或暂存区时运行 `devtools:changed -- --mode final`。
5. 读取生成的 `report.html`，确认报告内已经直接显示修改过程、场景和失败现场截图；`report.json`、`report.md` 只作为结构化兼容输出。
6. 检查信息层级、间距、文字溢出、按钮可发现性、安全区、空状态和交互结果。
7. 修复发现的问题并重复场景，直至自动断言和视觉检查均无阻塞问题。
8. 把 `report.html`、实际覆盖项和待人工项交给用户核验；不得要求用户自行按路径寻找截图。

## 状态与设备覆盖

新页面设计时默认考虑 `normal`、`empty`、`loading`、`error` 和 `long-text` 五类状态。当前第一阶段场景执行器不会在生产页面中注入调试后门；只有页面存在安全、确定性的测试输入时才标记对应状态已覆盖，否则报告必须列为豁免或待人工核验。

目标设备为小屏 iPhone、标准 iPhone 和安卓大屏。当前 SDK 不能稳定替代开发者工具的全部设备切换操作，因此报告只把实际运行的当前模拟器记为已覆盖，并把场景声明的三档目标设备列为待人工核验。报告还会单独列出未声明场景的状态（`empty`、`loading`、`error`、`long-text`），不得根据场景声明虚报实际设备或状态覆盖。

每个场景的截图会写入 `current-simulator/<序号-场景名>/`，避免多个场景同名截图互相覆盖。`report.html`
会直接显示成功截图、失败现场截图以及修改前/修改后截图；`report.json` 保留绝对路径，`report.md` 使用相对图片链接，终端仍会打印 `截图证据：...` 供工具定位。

## 故障恢复

- 找不到 CLI：设置 `WECHAT_DEVTOOLS_CLI` 为 `cli.bat` 的绝对路径。
- 无法连接：确认开发者工具已登录、项目窗口已打开，并在安全设置开启服务端口。
- 首次启动卡在授权：确认已开启「自动化接口打开工具时默认信任项目」，再关闭并重新打开项目。
- 端口占用：设置另一个 `WECHAT_AUTOMATION_PORT`，然后重新运行。
- 找不到元素：查看失败步骤和 `failure-step-NNN.png`，确认选择器及页面状态。
- 登录或授权失效：由用户在开发者工具处理一次，再重复原命令。

`miniprogram-automator@0.12.1` 包含较旧传递依赖，只能用于可信本机项目，不得暴露端口或用它执行不受信任的场景。
