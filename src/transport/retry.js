/**
 * 发送失败的事件本地留一份，下次进入页面时补发。
 *
 * 必须设上限：用户断网一整天，缓存的报文可能比一次会话的全部数据还大。
 * 超限就丢最旧的——监控数据宁可少，不能把用户的 localStorage 写满。
 */
const RETRY_KEY = 'retry'

export function createRetryQueue(config, storage, logger) {
  const max = Math.max(Number(config.transport.retryMax) || 0, 0)
  const ttl = Math.max(Number(config.transport.retryTTL) || 0, 0)

  /** 读出来顺手做两件事：兼容老格式、丢掉过期数据 */
  const read = () => {
    const raw = storage.getJSON(RETRY_KEY) || []
    const now = Date.now()
    return raw
      .map((item) => (item && item.p ? item : { t: now, p: item }))
      .filter((item) => (ttl ? now - item.t <= ttl : true))
  }
  const write = (entries) => storage.setJSON(RETRY_KEY, entries)

  return {
    push(...payloads) {
      if (!max) return
      if (!payloads.length) return
      const now = Date.now()
      const entries = read()
      for (const payload of payloads) entries.push({ t: now, p: payload })
      write(entries.slice(-max))
    },

    /** 补发一次；无论成败都先清空，避免下次启动重复补发同一条 */
    drain(send) {
      if (!max) return
      const stored = storage.getJSON(RETRY_KEY) || []
      const entries = read()
      const expired = stored.length - entries.length
      if (expired > 0) logger.debug('丢弃过期的失败缓存', expired, '条')
      if (!entries.length) {
        if (expired > 0) write([])
        return
      }
      write([])
      logger.debug('补发上次失败的事件', entries.length, '条')
      Promise.resolve(send(entries.map((item) => item.p))).catch(() => {
        /* 补发失败就算了：这批数据本来就属于「尽力而为」 */
      })
    },

    clear() {
      write([])
    },

    size() {
      return read().length
    }
  }
}
