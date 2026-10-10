import { matchAny, toRegExps } from '../../utils/misc.js'

/**
 * 请求判定规则：什么该忽略、什么算失败、什么算慢。
 *
 * 判定标准必须是显式的、可配置的，否则「接口报错」这件事会变成噪音源：
 * 用户主动取消的请求、跨域被拦的请求、后端约定的业务码失败，
 * 三者长得完全一样（status=0 或 200），但处理方式完全不同。
 */
export function createRequestRules(config) {
  const ignoreUrls = toRegExps(config.request.ignoreUrls)
  const ignoreMethods = (config.request.ignoreMethods || []).map((m) => String(m).toUpperCase())
  const transportUrl = config.transport.url || config.dsn || ''
  const slowThreshold = Number(config.request.slowThreshold) || 2000
  const businessChecker =
    typeof config.request.checkBusinessError === 'function'
      ? config.request.checkBusinessError
      : null

  return {
    slowThreshold,

    hasBusinessCheck() {
      return !!businessChecker
    },

    shouldIgnore(url, method) {
      if (!url) return true
      if (method && ignoreMethods.includes(String(method).toUpperCase())) return true
      // 上报请求本身必须排除，否则一次失败的发送会触发新的上报，无限递归
      if (transportUrl && url.includes(transportUrl)) return true
      if (matchAny(url, ignoreUrls)) return true
      return false
    },

    /**
     * @returns {{kind: 'abort'|'network'|'http'|'slow'|'ok', isError: boolean, isSlow: boolean, reason?: string}}
     */
    classify({ status = 0, errorName = '', duration = 0, aborted = false } = {}) {
      if (aborted) return { kind: 'abort', isError: false, isSlow: false, reason: 'aborted' }
      if (errorName) return { kind: 'network', isError: true, isSlow: false, reason: errorName }
      if (!status) return { kind: 'network', isError: true, isSlow: false, reason: 'no_status' }
      if (status >= 400) return { kind: 'http', isError: true, isSlow: false, reason: `HTTP ${status}` }
      if (duration >= slowThreshold) return { kind: 'slow', isError: false, isSlow: true }
      return { kind: 'ok', isError: false, isSlow: false }
    },

    /**
     * 业务码判定：接入方传函数，返回 true / 错误信息 / {isError, message}
     * 判定函数自己抛错时按「不是业务错误」处理，避免把监控的判断失误算到业务头上。
     */
    checkBusiness(data, meta) {
      if (!businessChecker) return { isError: false }
      try {
        const verdict = businessChecker(data, meta)
        if (verdict === true) return { isError: true, message: '业务码判定失败' }
        if (typeof verdict === 'string') return { isError: true, message: verdict }
        if (verdict && verdict.isError) {
          return { isError: true, message: String(verdict.message || '业务码判定失败') }
        }
        return { isError: false }
      } catch (err) {
        return { isError: false, checkerError: String(err && err.message) }
      }
    }
  }
}
