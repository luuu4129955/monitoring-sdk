/**
 * 去重器：同一个 key 在时间窗内只放行一次。
 *
 * 这是从实测里学到的教训——白屏检测曾经一次连续上报 17 条，
 * 轮询接口挂掉也会瞬间刷屏。窗口传 Infinity 就是「本次会话只报一次」。
 */
export function createDeduper({ cleanupInterval = 30000 } = {}) {
  const seen = new Map()
  let lastCleanup = 0

  const cleanup = (now) => {
    if (now - lastCleanup < cleanupInterval) return
    lastCleanup = now
    for (const [key, expireAt] of seen) {
      if (expireAt !== Infinity && expireAt <= now) seen.delete(key)
    }
  }

  return {
    /**
     * @returns {boolean} true 表示「重复，应该丢弃」
     */
    isDuplicate(key, windowMs = 0) {
      if (!key) return false
      const now = Date.now()
      cleanup(now)
      const expireAt = seen.get(key)
      if (expireAt !== undefined && (expireAt === Infinity || expireAt > now)) return true
      if (windowMs > 0) seen.set(key, windowMs === Infinity ? Infinity : now + windowMs)
      else seen.set(key, now)
      return false
    },

    reset(key) {
      seen.delete(key)
    },

    clear() {
      seen.clear()
    },

    get size() {
      return seen.size
    }
  }
}
