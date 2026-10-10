import { safeStringify, truncate } from '../../utils/misc.js'

/**
 * console.error 采集（默认关闭）。
 *
 * 为什么默认关：很多框架（React、Vue）会把真实错误再 console.error 一遍，
 * 强开会和 window.onerror 重复上报同一条错误，把信噪比拉低。
 */
export function setupConsoleError(ctx) {
  if (typeof console === 'undefined' || typeof console.error !== 'function') return () => {}

  const rawError = console.error
  const format = (args) =>
    args
      .map((arg) => {
        if (arg instanceof Error) return arg.stack || `${arg.name}: ${arg.message}`
        if (typeof arg === 'string') return arg
        return safeStringify(arg, 300)
      })
      .join(' ')

  console.error = function (...args) {
    try {
      const message = format(args)
      if (message) {
        ctx.report(
          'console_error',
          { kind: 'console', level: 'error', message: truncate(message, 800) },
          {
            sampleKey: 'error',
            dedupKey: `console:${message}`,
            dedupWindow: ctx.config.error.dedupeWindow
          }
        )
      }
    } catch {
      /* ignore */
    }
    return rawError.apply(this, args)
  }

  return () => {
    console.error = rawError
  }
}
