import { mergeConfig } from './config.js'
import { EventBus } from './event-bus.js'
import { Transport } from '../transport/index.js'
import { createStorage } from '../storage/index.js'
import { createIdentity } from '../storage/identity.js'
import { createContextProvider } from '../process/context.js'
import { createSampler } from '../process/sampling.js'
import { createDeduper } from '../process/dedup.js'
import { buildPayload } from '../process/payload.js'
import { sanitizeValue } from '../process/sanitize.js'
import { createBreadcrumb } from '../plugins/behavior/breadcrumb.js'
import { logger, setDebug } from '../utils/logger.js'
import { isPlainObject } from '../utils/misc.js'

/**
 * 监控实例：整个 SDK 的中枢。
 *
 * 三层职责分得很清楚：
 *   - 插件只负责「采集」，产出事件；
 *   - 本类负责「加工」：采样、去重、脱敏、加上下文、beforeSend；
 *   - Transport 负责「发送」：排队、批量、降级、重试。
 *
 * 这样拆分之后，新增一种采集（比如 WebSocket 消息）只需要写一个插件，
 * 完全不用碰采样 / 上报 / 存储这些逻辑。
 */
export class Monitor {
  constructor(options = {}) {
    this.config = mergeConfig(options)
    setDebug(this.config.debug)

    this.storage = createStorage(this.config.storagePrefix)
    this.identity = createIdentity(this.config, this.storage)
    this.bus = new EventBus()
    this.breadcrumb = createBreadcrumb(this.config)
    this.dedup = createDeduper()
    this.sampler = createSampler(this.config)
    this.context = createContextProvider(this.config, this.identity)
    this.transport = new Transport(this.config, { storage: this.storage, logger })

    this.plugins = new Map()
    this.pluginInstances = new Map()
    this.contextProviders = []
    this.started = false
  }

  /**
   * 注册一个「上下文补充器」：插件可以往每条报文里塞自己的字段
   * （比如录屏插件塞 recordScreenId，让后端能把错误和录屏关联起来）。
   */
  addContextProvider(provider) {
    if (typeof provider === 'function') this.contextProviders.push(provider)
    return this
  }

  /** 注册插件。重复注册同名插件会被忽略，保证热更新 / 重复初始化时不会采集两遍 */
  use(plugin) {
    if (!plugin || typeof plugin.setup !== 'function') {
      logger.warn('插件必须提供 setup(ctx) 方法，已忽略：', plugin)
      return this
    }
    const name = plugin.name || `plugin_${this.plugins.size + 1}`
    if (this.plugins.has(name)) {
      logger.warn(`插件 ${name} 已经注册过，跳过`)
      return this
    }
    // setup 可以返回一个实例对象（比如录屏插件返回的 api / destroy）
    const instance = plugin.setup(this.createPluginContext())
    this.plugins.set(name, plugin)
    if (instance) this.pluginInstances.set(name, instance)
    logger.debug('插件已注册', name)
    return this
  }

  createPluginContext() {
    return {
      config: this.config,
      /** 插件唯一需要的出口：把一条事件交给内核 */
      report: this.report.bind(this),
      bus: this.bus,
      breadcrumb: this.breadcrumb,
      identity: this.identity,
      monitor: this,
      logger
    }
  }

  start() {
    if (this.started) return this
    this.started = true
    this.transport.start()
    return this
  }

  /**
   * 上报一条事件。
   *
   * @param {string} type 事件类型（pv / performance / error / request / custom ...）
   * @param {object} data 事件内容
   * @param {object} [options]
   * @param {string} [options.sampleKey] 用哪一项采样配置（默认取 type）
   * @param {boolean} [options.force] 跳过采样（手动上报的关键事件用）
   * @param {string} [options.dedupKey] 去重键
   * @param {number} [options.dedupWindow] 去重时间窗，Infinity = 本次会话只报一次
   * @param {'high'|'normal'|'low'} [options.priority] 高优先级 = 不采样 + 立即发送（核心链路用）
   * @returns {object|null} 实际入队的报文；被采样 / 去重 / beforeSend 丢弃时返回 null
   */
  report(type, data, options = {}) {
    try {
      if (!this.config.enabled) return null

      const { sampleKey = type, force = false, dedupKey, dedupWindow = 0, priority } = options
      // 高优先级走两条捷径：不采样（核心链路不能被采样漏掉）、不等批量（立即发）
      const urgent = priority === 'high'

      if (!force && !urgent && !this.sampler(sampleKey)) return null
      if (dedupKey && this.dedup.isDuplicate(dedupKey, dedupWindow)) {
        logger.debug('去重命中，丢弃', type, dedupKey)
        return null
      }

      const sanitized = sanitizeValue(data, this.config.sanitize)
      const withBreadcrumb = (this.config.attachBreadcrumbTo || []).includes(type)
      const context = this.collectContext()

      let payload = buildPayload({
        type,
        data: sanitized,
        context,
        breadcrumbs: withBreadcrumb ? this.breadcrumb.getList() : undefined
      })

      if (typeof this.config.beforeSend === 'function') {
        const result = this.config.beforeSend(payload)
        if (result === false || result === null) return null
        if (isPlainObject(result)) payload = result
      }

      this.transport.push(payload, { urgent })
      // 广播一条「已上报」事件：插件可以据此联动（录屏插件就是靠它切片的）
      this.bus.emit('report', { type, payload })
      return payload
    } catch (err) {
      // 监控自己出问题不能往外抛
      logger.warn('report 失败', err)
      return null
    }
  }

  /** 基础上下文 + 各插件注册的补充字段 */
  collectContext() {
    const context = this.context()
    if (!this.contextProviders.length) return context
    const extra = {}
    for (const provider of this.contextProviders) {
      try {
        Object.assign(extra, provider() || {})
      } catch {
        /* 单个补充器出错不能影响上报 */
      }
    }
    return { ...context, ...extra }
  }

  /** 自定义埋点：monitor.track('click_buy', { skuId: 1 }) */
  track(name, data, options = {}) {
    const payloadData = isPlainObject(data) ? { name, ...data } : { name, value: data }
    return this.report('custom', payloadData, { sampleKey: 'custom', ...options })
  }

  /** 手动上报错误：catch 块里调用，数据形状和自动采集完全一致 */
  captureError(error, extra, options) {
    if (this.plugins.has('error')) {
      this.bus.emit('error:capture', { error, extra, options })
      return
    }
    // 没装错误插件时也别丢：至少把 message 报上去
    const message =
      error instanceof Error ? error.message : typeof error === 'string' ? error : String(error)
    this.report(
      'error',
      { kind: 'manual', message, extra },
      { sampleKey: 'error', force: true, ...(options || {}) }
    )
  }

  setUser(user) {
    this.identity.setUser(user)
    return this
  }

  addBreadcrumb(item) {
    this.breadcrumb.push(item)
    return this
  }

  /** 取插件实例（录屏插件的手动控制入口就挂在这上面） */
  getPlugin(name) {
    const instance = this.pluginInstances.get(name)
    return instance ? { name, ...instance } : null
  }

  getContext() {
    return this.context()
  }

  /** 立刻把队列里的报文发出去（比如提交表单前、跳转到别的站点前） */
  flush(options = { sync: true }) {
    return this.transport.flush(options)
  }

  destroy() {
    for (const instance of this.pluginInstances.values()) {
      if (instance && typeof instance.destroy === 'function') {
        try {
          instance.destroy()
        } catch {
          /* 单个插件清理失败不影响其它插件 */
        }
      }
    }
    this.transport.stop()
    this.bus.clear()
    this.breadcrumb.clear()
    this.dedup.clear()
    this.plugins.clear()
    this.pluginInstances.clear()
    this.started = false
    return this
  }
}
