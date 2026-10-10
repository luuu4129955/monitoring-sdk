import { matchAny, toRegExps, truncate } from '../../utils/misc.js'

/** 从任意值里抠出错误信息，Error / 字符串 / 对象都能处理 */
export function describeThrown(value) {
  if (value instanceof Error) {
    return { name: value.name || 'Error', message: value.message || String(value), stack: value.stack || '' }
  }
  if (typeof value === 'string') return { name: 'Error', message: value, stack: '' }
  if (value && typeof value === 'object') {
    return {
      name: value.name || 'Error',
      message: value.message ? String(value.message) : String(value),
      stack: typeof value.stack === 'string' ? value.stack : ''
    }
  }
  return { name: 'Error', message: String(value ?? '未知错误'), stack: '' }
}

/**
 * JS 运行时错误采集。
 *
 * 两个入口都必须保留原行为：
 *  - window.onerror 不能吞掉业务自己写的处理函数，也不能 return true（会抑制默认控制台报错，
 *    排查问题的时候会很抓狂）。
 *  - unhandledrejection 不能 preventDefault，否则业务方的全局兜底就失效了。
 */
export function setupJsError(ctx) {
  const { config } = ctx
  const ignorePatterns = toRegExps(config.error.ignoreErrors)

  const handle = (info = {}) => {
    const described = describeThrown(info.error ?? info.message ?? '未知错误')
    const message = described.message
    const name = info.name || described.name

    if (message && matchAny(message, ignorePatterns)) return
    if (info.source && matchAny(info.source, ignorePatterns)) return

    ctx.report(
      info.type || 'error',
      {
        kind: info.kind || 'js',
        name,
        message: truncate(message, 500),
        source: info.source || '',
        lineno: info.lineno ?? 0,
        colno: info.colno ?? 0,
        stack: truncate(info.stack || described.stack || '', config.error.maxStackLength),
        // 跨域脚本的报错会被浏览器改写成 "Script error."，必须单独标记出来
        crossOrigin: message === 'Script error.' || undefined,
        extra: info.extra
      },
      {
        sampleKey: 'error',
        dedupKey: `error:${name}:${message}:${info.source || ''}:${info.lineno ?? 0}:${info.kind || 'js'}`,
        dedupWindow: config.error.dedupeWindow,
        priority: info.priority
      }
    )

    ctx.breadcrumb.push({ type: 'error', kind: info.kind || 'js', message, name })
  }

  if (typeof window === 'undefined') return handle

  const previousHandler = window.onerror
  window.onerror = function (message, source, lineno, colno, error) {
    try {
      handle({ kind: 'js', message, source, lineno, colno, error })
    } catch {
      /* 监控自己出错绝不能再抛出去 */
    }
    if (typeof previousHandler === 'function') return previousHandler.apply(this, arguments)
    return false
  }

  window.addEventListener('unhandledrejection', (event) => {
    try {
      handle({ kind: 'unhandledrejection', type: 'unhandledrejection', error: event && event.reason })
    } catch {
      /* ignore */
    }
  })

  return handle
}
