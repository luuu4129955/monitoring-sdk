import { timeNow } from '../../utils/misc.js'
import { resolveAbsoluteUrl } from '../../utils/dom.js'
import { parseResponseBody } from './reporter.js'
import { serializeBody, shrinkParams } from './params.js'

/**
 * 劫持 window.fetch。
 *
 * 三个硬性约束：
 *  1. 必须原样返回 Response 对象（含 body 流），业务代码不能察觉到被包了一层。
 *  2. 要看响应体判定业务码就得 clone()，但 clone 有内存成本，
 *     所以默认不读 body，只有接入方配了 checkBusinessError 才克隆。
 *  3. 绝不能 await 上报，否则就是把监控的延迟加在业务请求上。
 */
export function patchFetch(ctx, rules) {
  if (typeof window === 'undefined' || typeof window.fetch !== 'function') return () => {}

  const original = window.fetch
  // 幂等：同页多 SDK 共存、热更新都会重复执行到这里
  if (original.__monitorPatched) return () => {}

  const reporter = ctx.reporter

  const wrapped = function (input, init) {
    let url = ''
    let method = 'GET'
    let params
    try {
      if (typeof input === 'string') {
        url = input
      } else if (input && typeof input.url === 'string') {
        url = input.url
        method = String(input.method || 'GET')
      }
      if (init && init.method) method = String(init.method)
      method = method.toUpperCase()
      url = resolveAbsoluteUrl(url)
      // 注意：input 是 Request 对象时它的 body 已经被消费语义接管，
      // 想读只能 clone，成本高且可能抛错，所以只采集 init.body 这一种明确来源。
      params = shrinkParams(
        serializeBody(init && init.body),
        Number(ctx.config.request.maxBodyLength) || 1024
      )
    } catch {
      url = ''
    }

    if (rules.shouldIgnore(url, method)) return original.apply(this, arguments)

    const start = timeNow()

    return original.apply(this, arguments).then(
      (response) => {
        const duration = timeNow() - start
        try {
        handleResponse({ url, method, duration, response, params })
        } catch {
          /* 采集失败不能影响业务拿到的 response */
        }
        return response
      },
      (error) => {
        const duration = timeNow() - start
        try {
          handleFailure({ url, method, duration, error, params })
        } catch {
          /* ignore */
        }
        // 原样抛出：业务代码的 catch 分支必须照常执行
        throw error
      }
    )
  }

  function handleResponse({ url, method, duration, response, params }) {
    const status = response.status
    const ok = response.ok
    const baseVerdict = rules.classify({ status, duration })
    const base = { url, method, status, duration, ok, params }

    // 只在配置了业务码判定时才 clone，默认零成本
    if (ok && rules.hasBusinessCheck()) {
      let clone = null
      try {
        clone = response.clone()
      } catch {
        clone = null
      }
      if (clone) {
        // 刻意不 await：不阻塞调用方读取 body
        clone
          .text()
          .then((text) => {
            const business = rules.checkBusiness(parseResponseBody(text), { url, method, status })
            reporter.record({
              ...base,
              verdict: business.isError
                ? { kind: 'business', isError: true, isSlow: false, message: business.message }
                : baseVerdict,
              responseBody: business.isError ? text : undefined
            })
          })
          .catch(() => reporter.record({ ...base, verdict: baseVerdict }))
        return
      }
    }

    reporter.record({ ...base, verdict: baseVerdict })
  }

  function handleFailure({ url, method, duration, error, params }) {
    const name = String((error && error.name) || '')
    // fetch 被 abort 抛的是 AbortError：用户主动取消不是故障，不能上报
    const aborted = name === 'AbortError' || /aborted/i.test(String((error && error.message) || ''))
    const verdict = rules.classify({
      duration,
      status: 0,
      aborted,
      errorName: aborted ? '' : name || 'NetworkError'
    })
    reporter.record({ url, method, status: 0, duration, ok: false, verdict, params })
  }

  wrapped.__monitorPatched = true
  wrapped.__monitorOriginal = original
  window.fetch = wrapped

  return function unpatch() {
    if (window.fetch === wrapped) window.fetch = original
  }
}
