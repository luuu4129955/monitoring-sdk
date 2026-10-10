# @perf/monitor · 零依赖前端监控 SDK

一个**不使用任何前端框架、零运行时依赖**的前端基础监控 SDK。内核只挂浏览器原生入口，
所以同一个产物在 Vue、React、原生页面里都能直接用，不需要为每个项目写适配代码。

## 一、采集能力

| 能力 | 挂载的原生入口 | 是否依赖框架 |
|---|---|---|
| JS 错误 | `window.onerror` + `unhandledrejection` | 否 |
| 资源加载失败 | `window` 的 `error` 捕获阶段（img / script / link ...） | 否 |
| 接口错误 | 劫持 `fetch` + `XMLHttpRequest` | 否（axios 等底层就是它） |
| 性能指标 | `PerformanceObserver` | 否 |
| 路由变化 | `pushState` / `replaceState` / `popstate` / `hashchange` | 否 |
| PV / 停留时长 | `load` / `visibilitychange` / `pagehide` | 否 |
| 点击 | document 事件委托 | 否 |
| 白屏 | 视口网格采样 | 否 |
| 面包屑 | 内存环形缓冲（错误自动附带） | 否 |
| 录屏（可选插件） | rrweb（由接入方注入） | 否 |

## 二、三种接入方式

### 1. `<script>` 直接引入（业务代码零改动）

```html
<script>
  window.__MONITOR_CONFIG__ = { dsn: 'https://your-collector/report', appName: 'shop' }
</script>
<script src="/path/to/monitor.iife.min.js"></script>
```

SDK 检测到 `window.__MONITOR_CONFIG__` 就自动初始化，业务代码一行都不用写。

### 2. ESM / 打包器项目

```js
import { init } from '@perf/monitor' // 或者直接从 src/index.js 引源码

const monitor = init({
  dsn: 'https://your-collector/report',
  appName: 'shop',
  appVersion: '1.2.3',
  request: {
    checkBusinessError: (data) => data && data.code !== 0 && `业务码 ${data.code}`
  }
})
```

### 3. Vue / React / axios 适配（可选，不装也能跑）

```js
// Vue：只是为了错误能带上「哪个组件 / 哪个钩子」
import { createVuePlugin } from '@perf/monitor/adapters/vue'
app.use(createVuePlugin(monitor))

// React：只是为了拿到 componentStack（React 19 的未捕获错误内核本来就能收到）
import { createErrorBoundary } from '@perf/monitor/adapters/react'
const Boundary = createErrorBoundary(React, monitor, { fallback: null })

// axios：网络层失败内核已覆盖，这里只补业务码和请求参数
import { setupAxios } from '@perf/monitor/adapters/axios'
setupAxios(axiosInstance, monitor, { checkBusinessError: (data) => data.code !== 0 })
```

### 4. 录屏（可选插件，rrweb 由你注入）

录屏**不在默认插件集里**：不装它的项目，产物里连一行录屏代码都没有。

```js
import * as rrweb from 'rrweb'
import { init, defaultPlugins, createRecordPlugin } from '@perf/monitor'

const monitor = init(
  { dsn: 'https://your-collector/report', appName: 'shop', record: { sampleRate: 0.05 } },
  [...defaultPlugins, createRecordPlugin({ rrweb })]
)

// 重要表单页可以手动控制
monitor.getPlugin('record').api.flush('manual')
```

录屏单独成报文，靠 `recordScreenId` 与错误关联（每条报文里都带 `record.screenId`），
**不会内嵌进错误报文**——内嵌就是实测里单包 487 KB 的来源。

## 三、接入清单

装好之后**每个项目要填的只有下面几项**，都是配置，不是改代码：

| 项 | 必填 | 说明 |
|---|---|---|
| `dsn` / `transport.url` | 是 | 上报地址，SDK 不可能知道你的后端在哪 |
| `appName` / `appVersion` | 是 | 多应用共用一个后端时用来区分 |
| `request.checkBusinessError` | 否 | HTTP 200 但业务失败时用；各家 `code` 规范不同，所以必须由接入方给函数 |
| sourcemap 上传 | 否 | 不做的话错误堆栈只有 `:302` 这种没用的信息，价值减半 |

## 四、配置项速查

| 配置 | 默认 | 说明 |
|---|---|---|
| `debug` | `false` | 打开后控制台输出采集与上报细节 |
| `enabled` | `true` | 总开关，false 时一个字节都不发 |
| `sampling.error/request/performance/behavior/pv/whiteScreen/custom` | `1` | 分类型采样率 0~1 |
| `beforeSend` | `null` | 上报前最后改写机会，返回 `false` 丢弃 |
| `error.ignoreErrors` | `[]` | 命中即忽略（字符串按字面量转义） |
| `error.dedupeWindow` | `3000` | 同一条错误在这个窗口内只报一次 |
| `error.console` | `false` | console.error 采集，默认关（框架会重复打一遍真实错误） |
| `request.ignoreUrls` | `[]` | 忽略名单，上报地址自动排除 |
| `request.slowThreshold` | `2000` | 超过算慢请求 |
| `request.reportSuccess` | `false` | 成功请求默认只进面包屑 |
| `request.reportParams` | `'error'` | 请求参数采集策略：`'error'` 只在上报失败/慢请求时带、`true` 全带、`false` 不带 |
| `request.xhr` / `request.fetch` | `true` | 两个入口分别可关 |
| `behavior.reportClick` | `false` | 点击默认只做面包屑 |
| `whiteScreen.delay` | `3000` | load 之后的宽限期，防止把「慢」判成「白」 |
| `transport.batchSize` | `5` | 攒够多少条发一次 |
| `transport.flushInterval` | `5000` | 最多攒多久发一次 |
| `transport.retryMax` | `20` | 发送失败后本地最多缓存多少条 |
| `transport.retryTTL` | `12h` | 失败缓存的存活时间，超过就丢弃 |
| `record.sampleRate` | `1` | 录屏采样率（录屏有 CPU 成本，C 端建议 1%~5%） |
| `record.strategy` | `'onError'` | 只在出错时切一段上报；`'always'` 还会按间隔定期上报 |
| `record.flushLimit` | `40` | 单次上报的录屏事件条数上限 |

另外，`monitor.report(type, data, { priority: 'high' })` 用于核心链路（比如支付）：
**不采样 + 不等批量、立即发送**。`monitor.captureError(err, extra, { priority: 'high' })` 同理。

## 五、报文结构

所有事件共用一种形状，新增字段一律加在 `data` 里，后端不需要为每种事件写分支：

```json
{
  "v": 1,
  "eventId": "68d8b3a6-...",
  "type": "error",
  "ts": 1791623169782,
  "app": { "name": "monitor-demo", "version": "0.1.0", "env": "development" },
  "sdk": { "name": "@perf/monitor", "version": "0.1.0" },
  "session": { "uid": "c4cc7708-...", "sid": "6b08178b-..." },
  "user": { "id": "u_10086" },
  "page": { "url": "https://shop.com/order", "route": "/order", "title": "订单" },
  "device": { "ua": "...", "viewport": "1280x900", "dpr": 2 },
  "breadcrumbs": [{ "ts": 1791623169700, "type": "request", "method": "GET", "status": 404 }],
  "data": { "kind": "js", "message": "xxx is not defined", "stack": "..." }
}
```

`v` 是协议版本，只在报文结构变化时递增，后端靠它决定怎么解析老数据。

## 六、接口报错的判定口径

这是最容易做成噪音的地方，所以四种情况分开处理：

| 类型 | 触发条件 | 处理 |
|---|---|---|
| `network` | fetch reject / XHR status=0（断网、DNS、跨域被拦） | 上报 |
| `http` | status 4xx / 5xx | 上报（同接口 1s 内去重） |
| `business` | 200 但业务码失败 | 上报，需要接入方提供判定函数 |
| `slow` | 耗时超过 `slowThreshold` | 采样上报 |
| `abort` | 被 `AbortController` 主动取消 | **不上报**，只记面包屑 |

成功的请求完全不进上报通道，只写进内存面包屑——这条取舍直接决定了带宽量级。

## 七、自动采集不到的边界

这几类不在拦截范围内，需要业务自己调 `monitor.track()` / `monitor.captureError()`：

| 场景 | 原因 |
|---|---|
| WebSocket / SSE | 不走 fetch / XHR |
| Web Worker 内的错误 | 独立上下文，主线程的 onerror 收不到 |
| iframe 内的页面 | 各自独立接入 |
| 微前端多实例 | 约定好谁来 init（重复 init 会被自动忽略并警告） |
| 跨域脚本的详细报错 | 浏览器只给 "Script error."，需要给标签加 `crossorigin` |

## 八、本地验证

> 下面这些命令**都在本目录（`projects/monitoring-sdk`）下执行**。
> 相对路径是跟着「当前目录」走的：如果你站在仓库根目录，就要把 `scripts/` 写成
> `projects/monitoring-sdk/scripts/`、`demo/` 写成 `projects/monitoring-sdk/demo/`，
> 两种写法别混着用（混用会拼出 `projects/monitoring-sdk/projects/monitoring-sdk/...`）。
>
> **第一次拿到源码要先构建**：`dist/` 没有进版本库，demo 页面依赖它。
> 先跑 `node scripts/build.mjs`（再跑 `node scripts/build-demo-sourcemap.mjs` 才能看 sourcemap 示例）。

```bash
# 单元测试（纯函数：脱敏 / 去重 / 采样 / 判定 / CLS）
node --test test/unit/*.test.js

# 三套打包器都能出产物（对应待办事项第二条）
node scripts/build.mjs           # esbuild → dist/
node scripts/build-vite.mjs      # Vite library mode → dist/vite/
node scripts/build-webpack.mjs   # Webpack UMD → dist/webpack/

# 体积红线
node scripts/size-check.mjs

# 生成「压缩产物 + sourcemap」的示例页
node scripts/build-demo-sourcemap.mjs

# 把压缩堆栈还原成源码位置
node scripts/symbolicate.mjs \
  --report <收集器落盘的 jsonl> \
  --map demo/sourcemap/dist/app.min.js.map \
  --app monitor-demo-sourcemap
# 相对路径会依次按「当前目录 → SDK 目录 → 仓库根目录」查找，
# 所以在仓库根目录和 SDK 目录下执行都能用；--report 省略时会自动找实验台默认落盘文件

# 端到端：起 demo + 假收集器，用真实 Chrome 跑固定动作，再核对报文
node scripts/e2e.mjs

# 单独起 demo 手动点（收集器在另一个终端）
node tools/monitor-collector.mjs 8398 /private/tmp/report.jsonl
node demo/mock-server.mjs 8399     # 打开 http://127.0.0.1:8399/
```

也可以用仓库统一实验台（`tools/monitoring-lab.sh`），这样自研 SDK 和
web-see / web-tracing 是同一套动作、同一个假收集器，数据可直接横向对比：

```bash
./tools/monitoring-lab.sh start monitoring-sdk   # demo 8399 + 收集器 8398
./tools/monitoring-lab.sh probe monitoring-sdk
./tools/monitoring-lab.sh stop
```

### 实测数据（同一套 7 步动作，单次页面访问约 25 秒）

| 场景 | 上报请求数 | 总字节 |
|---|---|---|
| 单页（不含录屏） | 3 ~ 4 | 12 ~ 14 KB |
| 单页（含录屏插件） | 4 | 约 18 KB |
| 三页合计（e2e 全量） | 10 | 44.6 KB |

| 对照 | 上报请求数 | 总字节 | 单包最大 |
|---|---|---|---|
| **@perf/monitor** | 3 ~ 4 | **约 12 ~ 14 KB** | 7.8 KB |
| web-see | 32 | 27 KB | 3 KB |
| web-tracing | 5 | **744 KB** | 487 KB |

体积差主要来自两个取舍：成功请求不上报、录屏不内嵌进错误报文。
录屏一旦打开就是全 SDK 最大的流量来源（单条切片 5 ~ 7 KB），这也是它默认不进插件集、
并且建议按 1%~5% 采样的原因。

## 九、目录结构

```
src/
  index.js            对外入口：init / track / captureError / setUser / flush
  core/               配置、单例、事件总线
  plugins/            error / request / performance / behavior / whiten-screen
                      record/（可选录屏插件，需注入 rrweb）
  process/            报文组装、去重、采样、脱敏、上下文
  transport/          队列、批量、三级降级发送、失败重试
  storage/            存储降级、匿名 uid 与会话 sid
  adapters/           可选：vue / react / axios
  utils/              日志、DOM、通用小工具
types/                手写类型声明（源码是 JS，TS 项目也能有提示）
demo/                 三种接入方式的示例 + 故意做坏的接口
demo/sourcemap/       压缩产物 + sourcemap 还原示例
test/unit/            纯函数单测
scripts/              build / size-check / e2e
                      build-vite / build-webpack / symbolicate
```

## 十、对照会议笔记的实现情况

| 笔记里的要求 | 实现 |
|---|---|
| 全局事件委托点击监听 | `plugins/behavior/click.js`（document 捕获阶段，支持 `data-track`） |
| 浏览时长 | `page_stay` 报文，含 `pageDuration` / `routeDuration` |
| 队列批量上报 | `transport.batchSize` + `flushInterval` + 卸载时统一发 |
| 异常退出缓存 + 过期时间 | `transport.retryMax` + `retryTTL`（默认 12 小时） |
| 实时上报（B 端审计） | `report(type, data, { priority: 'high' })`：不采样、立即发送 |
| PV/UV、History 与 Hash 路由 | `getCurrentRoute()` 区分；UV 用 `session.uid` 交给后端聚合 |
| 静态资源加载失败 | `plugins/error/resource-error.js`（含 3 秒去重） |
| window error + unhandledrejection | `plugins/error/js-error.js` |
| 重写 XHR / fetch 无感拦截 | `plugins/request/fetch.js` + `xhr.js` |
| 接口报错上报 URL / 参数 / 用户 | `request.reportParams`（默认失败时带）+ 报文里的 `page` / `user` |
| Source Map 映射源码 | `scripts/symbolicate.mjs` + 三套构建都产出 `.map` |
| 性能指标（LCP / CLS …） | `plugins/performance/`（零依赖自实现，口径见源码注释） |
| rrweb 行为录制 | `plugins/record/`（可选插件，rrweb 由接入方注入） |
| init 传配置按需开关 | 支持 `error: false` / `request: false` 这类整体开关，也有分项开关 |
| 报错优先级与频率策略 | `priority` 语义已支持；「5 分钟超 N 次才推送」属后端聚合策略 |
| 用 Vite / Webpack 打包成独立 SDK | `vite.config.js` + `webpack.config.js`，另有 esbuild 一套 |

## 十一、几个刻意的取舍

- **上报用 `text/plain` 而不是 `application/json`**：后者会触发 CORS 预检，多一个 RTT。
- **三级降级**：`sendBeacon` → `fetch(keepalive)` → `Image`，页面卸载时唯一可靠的是第一条。
- **面包屑必做、录屏不做**：录屏单独存、按 session 采样才有意义，内嵌进错误报文会让单包到几百 KB。
- **白屏必须去重 + 宽限期**：web-see 实测一次白屏连报 17 条，且框架慢启动极易误判。
- **幂等**：重复 `init`、重复 `use` 插件、fetch/XHR 已被包装过，都会自动跳过。
