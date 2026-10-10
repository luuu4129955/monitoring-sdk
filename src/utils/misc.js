/** 通用小工具：无副作用、不依赖 DOM，方便单测。 */

export const noop = () => {}

export const isObject = (value) => value !== null && typeof value === 'object'

export const isPlainObject = (value) =>
  Object.prototype.toString.call(value) === '[object Object]'

/** 用 performance.now() 计时（页面隐藏时它仍单调递增，比 Date.now() 稳） */
export const timeNow = () =>
  typeof performance !== 'undefined' && typeof performance.now === 'function'
    ? performance.now()
    : Date.now()

/** 深合并：只递归普通对象，数组和函数整体覆盖，避免配置被意外合并成怪物 */
export function deepMerge(base, extra) {
  if (!isPlainObject(extra)) return cloneDeep(base)
  const out = cloneDeep(base)
  for (const key of Object.keys(extra)) {
    const next = extra[key]
    if (next === undefined) continue
    out[key] = isPlainObject(next) && isPlainObject(out[key]) ? deepMerge(out[key], next) : next
  }
  return out
}

export function cloneDeep(value) {
  if (Array.isArray(value)) return value.map(cloneDeep)
  if (isPlainObject(value)) {
    const out = {}
    for (const key of Object.keys(value)) out[key] = cloneDeep(value[key])
    return out
  }
  return value
}

/** 生成唯一 ID：优先用原生 crypto，降级到时间戳 + 随机串 */
export function uuid() {
  try {
    if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
      return crypto.randomUUID()
    }
  } catch {
    /* 忽略：部分环境 crypto 存在但不可用 */
  }
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`
}

export function truncate(value, max) {
  const str = typeof value === 'string' ? value : String(value ?? '')
  if (!max || str.length <= max) return str
  return `${str.slice(0, max)}…[truncated ${str.length - max}]`
}

/** 安全序列化：循环引用、BigInt、超长字符串都不会把上报链路搞崩 */
export function safeStringify(value, maxLength = 0) {
  const seen = new WeakSet()
  let text
  try {
    text = JSON.stringify(value, (key, item) => {
      if (typeof item === 'bigint') return String(item)
      if (typeof item === 'object' && item !== null) {
        if (seen.has(item)) return '[Circular]'
        seen.add(item)
      }
      return item
    })
  } catch (err) {
    text = `[Unserializable: ${err && err.message}]`
  }
  return maxLength ? truncate(text, maxLength) : text
}

/** 把配置里的字符串 / 正则混排列表统一成正则数组 */
export function toRegExps(list) {
  if (!Array.isArray(list)) return []
  return list
    .map((item) => {
      if (item instanceof RegExp) return item
      if (typeof item === 'string' && item) return new RegExp(escapeRegExp(item))
      return null
    })
    .filter(Boolean)
}

export function escapeRegExp(str) {
  return String(str).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

export function matchAny(value, patterns) {
  if (!patterns || !patterns.length) return false
  return patterns.some((pattern) => pattern.test(value))
}
