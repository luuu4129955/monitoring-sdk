import { sanitizeUrl } from '../../process/sanitize.js'
import { truncate } from '../../utils/misc.js'

/**
 * 请求结果的统一处理：先记面包屑，再决定要不要上报。
 *
 * 这里体现的是本项目最重要的一条取舍：
 *   - 成功的请求 → 只进内存面包屑，零网络成本
 *   - 失败 / 慢请求 → 才走上报通道
 * 实测过把每个请求都上报的 SDK，一次访问就是几百 KB，C 端产品扛不住。
 */
export function createRequestReporter(ctx, rules) {
  const maxBodyLength = Number(ctx.config.request.maxBodyLength) || 1024
  const reportParams = ctx.config.request.reportParams
  /** 同一个接口 1 秒内重复失败只报一次，避免轮询接口挂掉时刷屏 */
  const errorDedupeWindow = Number(ctx.config.request.dedupeWindow ?? 1000)

  /**
   * 请求参数的采集策略。
   * 默认 'error'：只在出问题时才带上参数——这正是会议笔记的要求
   * （接口报错时上报 URL、传入参数、用户信息），同时不会让正常请求的报文变胖。
   */
  const shouldReportParams = (isError, isSlow) => {
    if (reportParams === false) return false
    if (reportParams === true) return true
    return Boolean(isError || isSlow)
  }

  return {
    record({ url, method, status = 0, duration = 0, ok = false, verdict, responseBody, params }) {
      const roundedDuration = Math.round(duration)

      ctx.breadcrumb.push({
        type: 'request',
        method,
        url,
        status,
        duration: roundedDuration,
        kind: verdict.isError ? verdict.kind : undefined
      })

      const { reportSuccess, reportSlow } = ctx.config.request
      const shouldReport =
        verdict.isError || (verdict.isSlow && reportSlow) || (reportSuccess && !verdict.isError)
      if (!shouldReport) return

      const data = {
        kind: verdict.kind,
        url: sanitizeUrl(url, { maxLength: 500 }),
        method,
        status: status || 0,
        duration: roundedDuration,
        ok: !!ok
      }
      if (verdict.reason) data.reason = verdict.reason
      if (verdict.message) data.message = verdict.message
      if (responseBody) data.response = truncate(responseBody, maxBodyLength)
      if (params !== undefined && shouldReportParams(verdict.isError, verdict.isSlow)) {
        data.params = params
      }

      ctx.report('request', data, {
        sampleKey: 'request',
        dedupKey: verdict.isError
          ? `request:${method}:${url}:${status}:${verdict.kind}`
          : undefined,
        dedupWindow: verdict.isError ? errorDedupeWindow : 0
      })
    }
  }
}

export function parseResponseBody(text) {
  if (typeof text !== 'string' || !text) return undefined
  try {
    return JSON.parse(text)
  } catch {
    return undefined
  }
}
