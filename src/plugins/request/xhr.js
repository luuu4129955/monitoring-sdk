import { timeNow } from '../../utils/misc.js'
import { resolveAbsoluteUrl } from '../../utils/dom.js'
import { parseResponseBody } from './reporter.js'
import { serializeBody, shrinkParams } from './params.js'

/**
 * 劫持 XMLHttpRequest。
 *
 * 为什么连 XHR 也要管：axios / umi-request / jQuery.ajax 的底层都是它，
 * 只包 fetch 会漏掉一大批其实在用 XHR 的项目。
 *
 * 实现上改的是原型方法而不是替换构造函数：业务里可能有
 * `xhr instanceof XMLHttpRequest` 之类的判断，换掉构造函数会把这些判断搞坏。
 */
export function patchXHR(ctx, rules) {
  if (typeof window === 'undefined' || typeof window.XMLHttpRequest !== 'function') return () => {}

  const proto = window.XMLHttpRequest.prototype
  if (proto.open && proto.open.__monitorPatched) return () => {}

  const rawOpen = proto.open
  const rawSend = proto.send
  const reporter = ctx.reporter

  const wrappedOpen = function (method, url) {
    // 每次 open 都重置状态：同一个 XHR 实例复用两次也能量准
    this.__monitorState = {
      method: String(method || 'GET').toUpperCase(),
      url: resolveAbsoluteUrl(url),
      start: 0,
      aborted: false,
      failed: false,
      errorName: ''
    }
    return rawOpen.apply(this, arguments)
  }
  wrappedOpen.__monitorPatched = true

  const wrappedSend = function () {
    const state = this.__monitorState
    if (!state || rules.shouldIgnore(state.url, state.method)) return rawSend.apply(this, arguments)

    state.start = timeNow()
    try {
      state.params = shrinkParams(
        serializeBody(arguments[0]),
        Number(ctx.config.request.maxBodyLength) || 1024
      )
    } catch {
      state.params = undefined
    }
    if (!this.__monitorBound) {
      this.__monitorBound = true
      this.addEventListener('error', () => {
        const current = this.__monitorState
        if (!current) return
        current.failed = true
        current.errorName = 'NetworkError'
      })
      this.addEventListener('timeout', () => {
        const current = this.__monitorState
        if (!current) return
        current.failed = true
        current.errorName = 'TimeoutError'
      })
      this.addEventListener('abort', () => {
        const current = this.__monitorState
        if (current) current.aborted = true
      })
      this.addEventListener('loadend', () => {
        const current = this.__monitorState
        if (!current) return
        try {
          handleEnd(this, current)
        } catch {
          /* ignore */
        }
      })
    }

    return rawSend.apply(this, arguments)
  }

  function readBody(xhr) {
    try {
      const type = xhr.responseType
      if (type === '' || type === 'text') return xhr.responseText
      if (type === 'json') return typeof xhr.response === 'string' ? xhr.response : undefined
    } catch {
      /* responseType 不匹配时读 responseText 会抛错 */
    }
    return undefined
  }

  function handleEnd(xhr, state) {
    const duration = timeNow() - state.start
    let status = 0
    try {
      status = xhr.status
    } catch {
      status = 0
    }
    const ok = status >= 200 && status < 300
    const baseVerdict = rules.classify({
      status,
      duration,
      aborted: state.aborted,
      errorName: state.errorName
    })
    const base = {
      url: state.url,
      method: state.method,
      status,
      duration,
      ok,
      params: state.params
    }

    if (ok && rules.hasBusinessCheck()) {
      const text = readBody(xhr)
      const business = rules.checkBusiness(
        typeof text === 'string' ? parseResponseBody(text) : text,
        { url: state.url, method: state.method, status }
      )
      reporter.record({
        ...base,
        verdict: business.isError
          ? { kind: 'business', isError: true, isSlow: false, message: business.message }
          : baseVerdict,
        responseBody: business.isError && typeof text === 'string' ? text : undefined
      })
      return
    }

    reporter.record({ ...base, verdict: baseVerdict })
  }

  proto.open = wrappedOpen
  proto.send = wrappedSend

  return function unpatch() {
    proto.open = rawOpen
    proto.send = rawSend
  }
}
