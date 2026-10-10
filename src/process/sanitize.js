import { isPlainObject } from '../utils/misc.js'

const REDACTED = '***'

/** URL 里出现这些参数名一律打码（值可能是 token、手机号、签名） */
const SENSITIVE_QUERY =
  /(pass(word)?|pwd|token|access[_-]?token|refresh[_-]?token|secret|signature|sign|auth|credential|session|sid|sessionid|mobile|phone|idcard|id_?card|bank_?card|cardno)/i

/**
 * URL 脱敏：保留 origin + path，只打码敏感 query；
 * hash 里的路由信息保留（单页应用要靠它区分页面）。
 */
export function sanitizeUrl(url, { maxLength = 500 } = {}) {
  const raw = String(url ?? '')
  if (!raw) return ''
  const truncated = raw.length > maxLength ? raw.slice(0, maxLength) : raw
  const hashIndex = truncated.indexOf('#')
  const hash = hashIndex >= 0 ? truncated.slice(hashIndex) : ''
  const beforeHash = hashIndex >= 0 ? truncated.slice(0, hashIndex) : truncated
  const [path, query] = beforeHash.split('?')
  if (!query) return `${path}${hash}`

  const safeQuery = query
    .split('&')
    .filter(Boolean)
    .map((pair) => {
      const eq = pair.indexOf('=')
      if (eq < 0) return pair
      const key = pair.slice(0, eq)
      if (SENSITIVE_QUERY.test(key)) return `${key}=${REDACTED}`
      return pair
    })
    .join('&')

  return `${path}?${safeQuery}${hash}`
}

function isSensitiveKey(key, sensitiveKeys) {
  const lower = String(key).toLowerCase()
  return sensitiveKeys.some((item) => {
    const target = String(item).toLowerCase()
    if (target === lower) return true
    // 允许配置里写片段，比如 'token' 命中 'x-access-token'
    return target.length > 3 && lower.includes(target)
  })
}

/**
 * 深度脱敏：限制层级 / 数组长度 / 字符串长度，并按 key 打码。
 *
 * 这一步既是隐私防线，也是稳定性防线——用户往 track() 里传了
 * 一个 500KB 的对象、或者循环引用，都不能把上报链路拖垮。
 */
export function sanitizeValue(
  value,
  {
    enabled = true,
    maxDepth = 4,
    maxArrayLength = 20,
    maxStringLength = 1000,
    sensitiveKeys = [],
    whitelistKeys = []
  } = {},
  depth = 0
) {
  if (!enabled) return value
  if (value === null || value === undefined) return value

  const type = typeof value
  if (type === 'string') {
    return value.length > maxStringLength
      ? `${value.slice(0, maxStringLength)}…[truncated ${value.length - maxStringLength}]`
      : value
  }
  if (type === 'number' || type === 'boolean') return value
  if (type === 'bigint') return String(value)
  if (type === 'function') return `[Function ${value.name || 'anonymous'}]`
  if (type === 'symbol') return String(value)

  if (value instanceof Error) {
    return { name: value.name, message: value.message, stack: value.stack }
  }
  if (value instanceof Date) return value.toISOString()

  if (depth >= maxDepth) return '[MaxDepth]'

  if (Array.isArray(value)) {
    const list = value.slice(0, maxArrayLength).map((item) =>
      sanitizeValue(
        item,
        { enabled, maxDepth, maxArrayLength, maxStringLength, sensitiveKeys, whitelistKeys },
        depth + 1
      )
    )
    if (value.length > maxArrayLength) list.push(`[+${value.length - maxArrayLength} more]`)
    return list
  }

  // 注意：Node / Element 在非浏览器环境不存在，必须先判断构造函数是否可用
  if (
    typeof Element !== 'undefined' &&
    typeof Node !== 'undefined' &&
    (value instanceof Element || value instanceof Node)
  ) {
    return `[${value.nodeName}]`
  }

  if (isPlainObject(value)) {
    const out = {}
    for (const key of Object.keys(value)) {
      if (whitelistKeys.includes(key)) {
        out[key] = value[key]
        continue
      }
      if (isSensitiveKey(key, sensitiveKeys)) {
        out[key] = REDACTED
        continue
      }
      out[key] = sanitizeValue(
        value[key],
        { enabled, maxDepth, maxArrayLength, maxStringLength, sensitiveKeys, whitelistKeys },
        depth + 1
      )
    }
    return out
  }

  // Map / Set / 其他自定义对象：不深挖，避免把体积搞炸
  return `[${Object.prototype.toString.call(value).slice(8, -1)}]`
}
