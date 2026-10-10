import { sanitizeUrl } from '../../process/sanitize.js'

/**
 * 面包屑：一个固定长度的环形缓冲，记录「用户出事前干了什么」。
 *
 * 成本极低（只在内存里存 20 条小对象），价值极高（错误现场的唯一线索），
 * 所以成功请求、点击这类高频动作一律只进这里，不产生网络上报。
 */
const FIELDS = [
  'type',
  'name',
  'kind',
  'level',
  'method',
  'status',
  'duration',
  'message',
  'text',
  'selector',
  'route',
  'from',
  'to',
  'reason'
]

export function createBreadcrumb(config) {
  const max = Math.max(Number(config.maxBreadcrumbs) || 20, 1)
  const list = []

  return {
    max,

    push(item) {
      if (!item) return
      const entry = { ts: Date.now() }
      for (const field of FIELDS) {
        const value = item[field]
        if (value === undefined || value === null || value === '') continue
        entry[field] = value
      }
      if (item.url) entry.url = sanitizeUrl(item.url, { maxLength: 300 })
      if (typeof entry.message === 'string') entry.message = entry.message.slice(0, 200)
      if (typeof entry.text === 'string') entry.text = entry.text.slice(0, 50)

      list.push(entry)
      if (list.length > max) list.splice(0, list.length - max)
    },

    getList() {
      return list.slice()
    },

    clear() {
      list.length = 0
    }
  }
}
