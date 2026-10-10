/**
 * 发送通道，三级降级：
 *   1. navigator.sendBeacon —— 页面卸载时唯一可靠的通道
 *   2. fetch(keepalive)     —— 支持超时控制、能拿到成败
 *   3. Image GET            —— 最后的兜底（受 URL 长度限制，只发小报文）
 *
 * Content-Type 用 text/plain 而不是 application/json：
 * 后者会触发 CORS 预检（OPTIONS），多一个 RTT，还会让部分服务端网关直接拦掉。
 */
const CONTENT_TYPE = 'text/plain;charset=UTF-8'
const IMAGE_FALLBACK_MAX = 1800

export function createSender(config, logger) {
  const url = config.transport.url || config.dsn || ''
  const timeout = Number(config.transport.timeout) || 8000
  const headers = { 'Content-Type': CONTENT_TYPE, ...(config.transport.headers || {}) }

  const buildBody = (payloads) =>
    payloads.length === 1
      ? JSON.stringify(payloads[0])
      : JSON.stringify({ count: payloads.length, batch: payloads })

  const canBeacon = () =>
    typeof navigator !== 'undefined' && typeof navigator.sendBeacon === 'function'

  function viaBeacon(body) {
    if (!canBeacon()) return false
    try {
      const blob = new Blob([body], { type: CONTENT_TYPE })
      return navigator.sendBeacon(url, blob) === true
    } catch {
      return false
    }
  }

  async function viaFetch(body) {
    if (typeof fetch !== 'function') return false
    const controller = typeof AbortController === 'function' ? new AbortController() : null
    const timer = controller ? setTimeout(() => controller.abort(), timeout) : null
    try {
      const response = await fetch(url, {
        method: 'POST',
        body,
        headers,
        keepalive: true,
        mode: 'cors',
        credentials: 'same-origin',
        signal: controller ? controller.signal : undefined
      })
      return !!(response && response.ok)
    } catch {
      return false
    } finally {
      if (timer) clearTimeout(timer)
    }
  }

  function viaImage(body) {
    if (typeof Image !== 'function') return false
    if (body.length > IMAGE_FALLBACK_MAX) return false
    try {
      const separator = url.includes('?') ? '&' : '?'
      const img = new Image()
      img.src = `${url}${separator}data=${encodeURIComponent(body)}`
      return true
    } catch {
      return false
    }
  }

  /**
   * @param {object[]} payloads
   * @param {{preferBeacon?: boolean}} options
   * @returns {Promise<boolean>} 是否发送成功（失败会被放进本地重试队列）
   */
  return async function send(payloads, { preferBeacon = false } = {}) {
    if (!url) {
      logger.warn('没有配置上报地址，丢弃', payloads.length, '条事件')
      return true // 视为「已处理」，否则会在重试队列里越堆越多
    }
    if (!payloads || !payloads.length) return true

    const body = buildBody(payloads)

    if (preferBeacon && viaBeacon(body)) return true
    if (await viaFetch(body)) return true
    if (viaBeacon(body)) return true
    if (viaImage(body)) return true

    return false
  }
}
