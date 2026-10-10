import { safeStringify } from '../../utils/misc.js'

/**
 * 把请求体转成「可上报的普通对象」。
 *
 * 三原则：
 *  1. 读不懂的类型（流、二进制、blob）一律降级成标记字符串，绝不为了采集去消耗 body，
 *     否则会把业务自己的请求搞坏。
 *  2. 不在这里做脱敏：脱敏统一由 process 层负责，避免两处规则打架。
 *  3. 输出必须是有界的，不能因为一个 50MB 的请求体把上报链路撑爆。
 */
export function serializeBody(body) {
  if (body === undefined || body === null) return undefined

  if (typeof body === 'string') return serializeText(body)

  if (typeof URLSearchParams !== 'undefined' && body instanceof URLSearchParams) {
    return Object.fromEntries(body)
  }

  if (typeof FormData !== 'undefined' && body instanceof FormData) {
    const out = {}
    let files = 0
    try {
      for (const [key, value] of body.entries()) {
        if (typeof File !== 'undefined' && value instanceof File) {
          files += 1
          continue
        }
        out[key] = out[key] === undefined ? value : [].concat(out[key], value)
      }
    } catch {
      return '[FormData]'
    }
    if (files) out.__files = `${files} 个文件`
    return Object.keys(out).length ? out : undefined
  }

  if (typeof Blob !== 'undefined' && body instanceof Blob) return `[Blob ${body.size}B]`
  if (
    typeof ArrayBuffer !== 'undefined' &&
    (body instanceof ArrayBuffer || ArrayBuffer.isView(body))
  ) {
    return `[Binary ${body.byteLength}B]`
  }
  if (typeof ReadableStream !== 'undefined' && body instanceof ReadableStream) {
    // 读流会消费掉它，业务就拿不到 body 了，只能标记
    return '[ReadableStream]'
  }

  return safeStringify(body, 200)
}

function serializeText(text) {
  const trimmed = text.trim()
  if (!trimmed) return undefined

  if (trimmed.startsWith('{') || trimmed.startsWith('[')) {
    try {
      return JSON.parse(trimmed)
    } catch {
      /* 不是合法 JSON，按下面的规则继续判断 */
    }
  }

  // 表单编码的 body：a=1&b=2
  if (/^[^=&]+=[^&]*(&|$)/.test(trimmed)) {
    try {
      return Object.fromEntries(new URLSearchParams(trimmed))
    } catch {
      /* 落到纯文本 */
    }
  }

  return trimmed
}

/**
 * 体积兜底：参数结构再复杂，单条上报也只能占这么大。
 * 超了就退化成「截断预览」，而不是把整条报文撑成几百 KB。
 */
export function shrinkParams(params, maxLength = 1024) {
  if (params === undefined) return undefined
  const text = safeStringify(params)
  if (typeof text !== 'string' || text.length <= maxLength) return params
  return { __truncated: true, preview: text.slice(0, maxLength) }
}
