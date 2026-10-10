import { deepMerge, isPlainObject } from '../utils/misc.js'
import { logger } from '../utils/logger.js'

export const DEFAULT_CONFIG = {
  /** 上报地址。也可以在 init 时改成 transport.url */
  dsn: '',
  appName: '',
  appVersion: '',
  env: '',
  /** 打开后 SDK 会在控制台输出采集与上报细节，生产环境务必关掉 */
  debug: false,
  /** 总开关：false 时一个字节都不发 */
  enabled: true,
  /** 本地存储 key 前缀，同域多应用共存时要区分开 */
  storagePrefix: '__perf_monitor__',
  /** 超过这个时长没有活动就算新会话（默认 30 分钟） */
  sessionTimeout: 30 * 60 * 1000,
  /** 面包屑环形缓冲长度 */
  maxBreadcrumbs: 20,

  /** 分类型采样率，0~1 */
  sampling: {
    error: 1,
    request: 1,
    performance: 1,
    behavior: 1,
    pv: 1,
    whiteScreen: 1,
    replay: 1,
    custom: 1
  },

  /** 哪些类型的事件需要附带面包屑（面包屑很便宜，错误必须带） */
  attachBreadcrumbTo: ['error', 'unhandledrejection', 'resource_error', 'console_error'],

  /** 脱敏：深度、数组长度、字符串长度都设上限，防止一条报文把后端打爆 */
  sanitize: {
    enabled: true,
    maxDepth: 4,
    maxArrayLength: 20,
    maxStringLength: 1000,
    /** 命中这些 key 的字段值会被替换成 *** */
    sensitiveKeys: [
      'password',
      'passwd',
      'pwd',
      'token',
      'access_token',
      'refresh_token',
      'authorization',
      'secret',
      'signature',
      'sign',
      'credential',
      'cookie',
      'session',
      'sid',
      'mobile',
      'phone',
      'idcard',
      'id_card',
      'bank_card',
      'cardno'
    ],
    /** 这些字段名不脱敏（否则 page.path 之类会被误伤，非必须，留作兜底） */
    whitelistKeys: []
  },

  /** 上报前最后的改写机会：返回 false 丢弃，返回对象则替换报文 */
  beforeSend: null,

  error: {
    /** JS 运行时错误（window.onerror + unhandledrejection） */
    js: true,
    /** 资源加载失败（img / script / link ...） */
    resource: true,
    /** console.error 采集，默认关：噪音大且常与真实错误重复 */
    console: false,
    /** 命中即忽略的错误（字符串会转成正则） */
    ignoreErrors: [],
    /** 同一条错误在这个时间窗内只报一次（毫秒） */
    dedupeWindow: 3000,
    maxStackLength: 5000
  },

  request: {
    fetch: true,
    xhr: true,
    /** 命中即忽略的 URL（字符串按字面量匹配，也可以直接写正则） */
    ignoreUrls: [],
    ignoreMethods: [],
    /** 超过这个耗时算慢请求 */
    slowThreshold: 2000,
    /**
     * 业务码判定。后端返回 HTTP 200 但业务失败时用得上，默认关闭：
     * 各项目 code 规范不统一，强开会误报一片。
     * 传函数：(responseData, meta) => true / false / '错误信息'
     */
    checkBusinessError: null,
    /** 成功的请求默认只进面包屑，不上报；置 true 则全部上报（谨慎，流量大） */
    reportSuccess: false,
    /** 慢请求是否上报（走采样） */
    reportSlow: true,
    /**
     * 是否上报请求参数（会议笔记里明确要求「接口报错时上报传入参数」）。
     *  - 'error'：只在失败 / 慢请求时带上（默认，兼顾排查价值与带宽）
     *  - true   ：所有请求都带上（数据量大，慎用）
     *  - false  ：一律不带
     */
    reportParams: 'error',
    /** 响应体记录的最大长度 */
    maxBodyLength: 1024
  },

  performance: {
    /** 首次性能报文在 load 之后延迟多久发（给 LCP / CLS 一点收敛时间） */
    initialDelay: 1500,
    /** 资源时序汇总开关 */
    reportResource: true,
    /** 只上报耗时最长的前 N 个资源 */
    resourceTopN: 5,
    /** 长任务阈值（毫秒），PerformanceObserver 的 longtask 默认就是 50 */
    longTaskThreshold: 50
  },

  behavior: {
    /** 页面访问量 */
    pv: true,
    /** 路由变化监听（劫持 pushState / replaceState） */
    route: true,
    /** 点击写入面包屑 */
    click: true,
    /** 点击是否单独上报（默认只做面包屑，省流量） */
    reportClick: false
  },

  /**
   * 录屏（rrweb）配置。
   *
   * 注意：录屏插件**不在默认插件集里**，必须显式注册才会生效
   * （见 src/plugins/record/index.js），所以这里的 enabled 只是插件内部的开关。
   * rrweb 由接入方传进来，SDK 自己不依赖它。
   */
  record: {
    enabled: true,
    /** onError = 只在出错时上报最近的一段；always = 还会按 flushInterval 定期上报 */
    strategy: 'onError',
    /** 录屏采样率：录屏本身有 CPU 成本，C 端建议 0.01 ~ 0.05 */
    sampleRate: 1,
    /** 内存里保留的事件条数（环形缓冲） */
    maxEvents: 100,
    /** 单次上报的事件条数上限。这是全 SDK 最大的报文来源，别调太大 */
    flushLimit: 40,
    /** strategy=always 时的上报间隔 */
    flushInterval: 30000,
    /** 隐私：默认遮罩所有输入框 */
    maskAllInputs: true,
    /** 给这些 class 的元素加 monitor-block / monitor-ignore 即可屏蔽或忽略录制 */
    blockClass: 'monitor-block',
    ignoreClass: 'monitor-ignore'
  },

  whiteScreen: {
    enabled: true,
    /** 挂载容器；留空则按 ['#app','#root','.app','main','body'] 顺序自动探测 */
    container: '',
    /** load 之后再等多久检测（给首屏渲染留宽限期，避免误报） */
    delay: 3000,
    /** 采样点个数：9 = 3x3 网格 */
    samplePoints: 9,
    /** 空白点占比阈值，达到即判定白屏 */
    blankThreshold: 1
  },

  transport: {
    /** 留空则用 dsn */
    url: '',
    /** 攒够多少条发一次 */
    batchSize: 5,
    /** 最多攒多久发一次（毫秒） */
    flushInterval: 5000,
    /** 队列上限，超出丢最旧的，防止内存无限增长 */
    maxQueue: 30,
    /** 单次请求超时（仅 fetch 通道生效） */
    timeout: 8000,
    /** 发送失败后本地最多缓存多少条，等下次进入页面重发 */
    retryMax: 20,
    /**
     * 失败缓存的存活时间，超过就丢弃（默认 12 小时）。
     * 没有过期时间的话，用户断网一周再回来，会把一周前的无效数据全补发一遍。
     */
    retryTTL: 12 * 60 * 60 * 1000
  }
}

/**
 * 合并配置。两个约定：
 *  1. 用户传 error: true 这类「关掉整个插件」的写法也支持（见 normalize）。
 *  2. 非法值只警告不抛错——监控 SDK 不能因为配置写错就把业务页面搞崩。
 */
export function mergeConfig(input = {}) {
  if (input && !isPlainObject(input)) {
    logger.warn('init(options) 需要一个对象，已忽略：', input)
    input = {}
  }
  const config = deepMerge(DEFAULT_CONFIG, input || {})
  normalize(config)
  validate(config)
  return config
}

function normalize(config) {
  if (typeof config.dsn !== 'string') config.dsn = String(config.dsn ?? '')
  if (!config.transport.url) config.transport.url = config.dsn
  if (!config.appName && typeof location !== 'undefined') config.appName = location.hostname
  if (!config.env && typeof location !== 'undefined') {
    config.env = /^(localhost|127\.|0\.0\.0\.0|192\.168\.)/.test(location.hostname)
      ? 'development'
      : 'production'
  }
  // 采样率夹到 [0,1]，防止写出 1.5 或 -1 这种值
  for (const key of Object.keys(config.sampling)) {
    const rate = Number(config.sampling[key])
    config.sampling[key] = Number.isFinite(rate) ? Math.min(Math.max(rate, 0), 1) : 1
  }
  if (typeof config.transport.batchSize !== 'number' || config.transport.batchSize < 1) {
    config.transport.batchSize = 1
  }
}

function validate(config) {
  if (config.enabled && !config.transport.url) {
    logger.warn('没有配置 dsn / transport.url，事件只会在队列里等待，不会被发出去')
  }
  if (config.beforeSend && typeof config.beforeSend !== 'function') {
    logger.warn('beforeSend 必须是函数，已忽略')
    config.beforeSend = null
  }
  if (
    config.request.checkBusinessError &&
    typeof config.request.checkBusinessError !== 'function'
  ) {
    logger.warn('request.checkBusinessError 必须是函数，已忽略')
    config.request.checkBusinessError = null
  }
}
