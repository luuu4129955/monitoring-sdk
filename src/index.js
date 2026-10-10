import { Monitor } from './core/monitor.js'
import { SDK_NAME, SDK_VERSION } from './core/version.js'
import { logger } from './utils/logger.js'
import errorPlugin from './plugins/error/index.js'
import requestPlugin from './plugins/request/index.js'
import performancePlugin from './plugins/performance/index.js'
import behaviorPlugin from './plugins/behavior/index.js'
import whiteScreenPlugin from './plugins/whiten-screen/index.js'
import { createRecordPlugin } from './plugins/record/index.js'

/** 默认插件集：删掉其中任何一个，内核照样能跑 */
export const defaultPlugins = [
  errorPlugin,
  requestPlugin,
  performancePlugin,
  behaviorPlugin,
  whiteScreenPlugin
]

let instance = null

/**
 * 初始化并返回全局单例。
 *
 * 重复调用会被忽略并返回已有实例——这一点很重要：
 * 微前端、SSR 水合、热更新都可能让入口代码执行两次，
 * 没有这层保护就会把每个事件采集两遍。
 */
export function init(options = {}, plugins = defaultPlugins) {
  if (instance) {
    logger.warn('已经初始化过，重复 init 被忽略')
    return instance
  }
  instance = createMonitor(options, plugins)
  return instance
}

/** 不占用单例的实例（多实例 / 微前端 / 单测用） */
export function createMonitor(options = {}, plugins = defaultPlugins) {
  const monitor = new Monitor(options)
  for (const plugin of plugins || []) monitor.use(plugin)
  monitor.start()
  logger.debug(`${SDK_NAME}@${SDK_VERSION} 已启动`, monitor.config.appName)
  return monitor
}

export function getInstance() {
  return instance
}

export function track(...args) {
  return instance ? instance.track(...args) : null
}

export function captureError(...args) {
  return instance ? instance.captureError(...args) : null
}

export function setUser(...args) {
  return instance ? instance.setUser(...args) : null
}

export function flush(...args) {
  return instance ? instance.flush(...args) : null
}

export function destroy() {
  if (!instance) return
  instance.destroy()
  instance = null
}

export { Monitor, SDK_NAME, SDK_VERSION, createRecordPlugin }

export default {
  init,
  createMonitor,
  getInstance,
  track,
  captureError,
  setUser,
  flush,
  destroy,
  defaultPlugins,
  createRecordPlugin,
  version: SDK_VERSION
}

/**
 * 自动初始化，专供 <script> 直接引入的场景：
 *
 *   <script>window.__MONITOR_CONFIG__ = { dsn: 'https://...', appName: 'shop' }</script>
 *   <script src="/monitor.iife.min.js"></script>
 *
 * 只要提前挂了这个全局配置就自动启动，业务代码一行都不用写。
 * 用 import 引入的项目可以忽略这段，不受影响。
 */
if (typeof window !== 'undefined' && window.__MONITOR_CONFIG__) {
  // 关键：必须**同步**初始化，不能等 DOMContentLoaded。
  // 这一段脚本之后紧跟的业务代码里，任何一次 fetch / 抛错都会早于 DOMContentLoaded，
  // 等 DOM 就绪再打补丁等于把开头这几十毫秒的请求全漏掉——这正是实测中发现的坑。
  // 所有插件都做了「DOM 还没准备好也能安全注册」的处理（监听器 + 惰性取值），
  // 所以提前启动不会有副作用。
  init(window.__MONITOR_CONFIG__)
}
