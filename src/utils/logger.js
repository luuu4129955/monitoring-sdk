/**
 * 带前缀的日志器。
 *
 * 约定：warn / error 始终输出（接入方需要知道 SDK 出问题了），
 * log / debug 只在 config.debug 为真时输出，避免污染生产控制台。
 */
import { noop } from './misc.js'

const PREFIX = '[perf-monitor]'
let debugEnabled = false

export function setDebug(value) {
  debugEnabled = !!value
}

export function isDebug() {
  return debugEnabled
}

const hasConsole = typeof console !== 'undefined'

export const logger = {
  log(...args) {
    if (!debugEnabled || !hasConsole) return
    console.log(PREFIX, ...args)
  },
  debug(...args) {
    if (!debugEnabled || !hasConsole) return
    console.debug(PREFIX, ...args)
  },
  warn(...args) {
    if (!hasConsole) return
    console.warn(PREFIX, ...args)
  },
  error(...args) {
    if (!hasConsole) return
    console.error(PREFIX, ...args)
  },
  noop
}
