# 微信小程序分包素材引用策略

> 状态：已验证  
> 日期：2026-08-02  
> 关联：P0-01（代码审查报告）

---

## 背景

本项目有 600+ 名航海士头像和 500+ 技能图标，总体积约 7.5 MB。这些图片按哈希分片存放在 10 个素材分包中：

```
subpkg-a0/imgs/  ~750 KB
subpkg-a1/imgs/  ~750 KB
...
subpkg-a9/imgs/  ~750 KB
```

每个分包内有一个空的 `pages/placeholder/index` 页面，仅用于让微信识别该分包存在。

主包的名册页面（`pages/catalog/index`）和详情分包（`subpkg-detail`）通过路径引用这些图片：

```xml
<!-- catalog/index.wxml -->
<image src="/subpkg-a3/imgs/officer_chaabb020.png" />
```

---

## 问题

2026-08-02 的静态代码审查报告（P0-01）指出：微信小程序通常不允许跨包引用静态资源，这会
导致图片加载失败。报告建议通过 CDN 或重构分包结构来解决。

**但该结论未经真机验证。**

---

## 尝试过的方案与结果

### 方案 1：preloadRule 预加载

在 `app.json` 中配置 `preloadRule`，在进入名册页时预下载全部 10 个素材分包。

```json
"preloadRule": {
  "pages/catalog/index": {
    "network": "all",
    "packages": ["assets0", "assets1", ..., "assets9"]
  }
}
```

**结果：失败。** 上传时报错：

```
preloadRule [pages/catalog/index] source size 7582KB exceed max limit 2MB
```

微信限制每个页面的 `preloadRule` 预加载总分包体积 ≤ **2 MB**。10 个素材包共 ~7.5 MB，
远超限制。

### 方案 2：wx.loadSubpackage() 逐个加载

在页面 `onLoad` 中调用 `wx.loadSubpackage()` 逐个下载分包。

```ts
wx.loadSubpackage({ name: 'assets0', success: () => loadNext() })
```

**结果：失败。** 运行时错误：

```
TypeError: wx.loadSubpackage is not a function
```

当前基础库（lib 3.17.0）中不存在此 API。

### 方案 3：wx.preDownloadSubpackage()

使用类型定义中存在的 `wx.preDownloadSubpackage()`。

**结果：失败。** 该 API 的 `packageType` 参数只接受 `"workers"`，专门用于预下载
Worker 分包，不支持普通业务分包。

```ts
// miniprogram-api-typings v5.x 的定义
interface PreDownloadSubpackageOption {
  packageType: string // 目前仅支持填 "workers"
}
```

---

## 微信分包加载机制

经过实际验证，微信小程序**没有提供**在运行时主动加载普通业务分包的公共 API。
可用的分包加载机制只有：

| 机制                       | 限制                           |
| -------------------------- | ------------------------------ |
| `preloadRule`              | 单页面预加载总分包 ≤ 2 MB      |
| 用户导航到分包页面         | 自动触发下载（唯一的常规方式） |
| `wx.preDownloadSubpackage` | 仅 workers 分包                |

---

## 最终结论

**回退所有预加载代码，保持项目原始状态。**

经过真机上传验证，当前方案（主包/详情分包通过路径直接引用素材分包图片，无 preloadRule
也无手动加载）**上传和编译均正常**。

推测微信在以下场景中会自动处理分包资源的解析：

- 编译器/上传时对分包内的静态资源做了全局索引
- 运行时 `<image>` 组件在遇到分包路径时可能触发隐式下载

无论具体机制如何，**结论是：当前方案可行，不需要"修复"。**

---

## 给未来开发者的建议

1. **不要试图用 preloadRule 预加载素材分包** —— 有 2MB 总大小硬限制，不适合大量图片。

2. _*不要试图用任何 wx.* API 手动加载普通分包_* —— 微信没有提供这样的 API。

3. **如果未来发现真机图片加载有问题**，才需要考虑以下替代方案：
   - 微信云开发存储（免费额度 5 GB / 5 GB CDN 流量 / 月）
   - 将图片 base64 内联到 JS 数据文件中（仅适合小图标）
   - 重新设计分包结构，让页面和图片放在同一个分包内

4. **在修 bug 之前先做真机验证** —— 静态审查的推断不等于实际行为。

---

## 变更记录

| 日期       | 变更                                             |
| ---------- | ------------------------------------------------ |
| 2026-08-02 | 初稿：记录三种方案的尝试与失败，确认当前方案可行 |
