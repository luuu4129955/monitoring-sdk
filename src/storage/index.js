/**
 * 存储降级链路：localStorage / sessionStorage → 内存。
 *
 * 浏览器隐私模式、禁用 Cookie、Safari ITP 都可能让 storage 抛错，
 * 所以每一次读写都必须 try/catch，失败就退回内存（当次会话有效）。
 */
const memory = new Map()

function pickDriver(persist) {
  const key = persist === 'session' ? 'sessionStorage' : 'localStorage'
  try {
    const driver = typeof window !== 'undefined' ? window[key] : undefined
    if (!driver) return null
    // 真正写一次才知道能不能用（隐私模式下属性存在但 setItem 抛错）
    const probeKey = '__perf_monitor_probe__'
    driver.setItem(probeKey, '1')
    driver.removeItem(probeKey)
    return driver
  } catch {
    return null
  }
}

export function createStorage(prefix = '__perf_monitor__') {
  const fullKey = (key) => `${prefix}:${key}`

  return {
    prefix,

    get(key, { persist = 'local' } = {}) {
      const name = fullKey(key)
      const driver = pickDriver(persist)
      if (!driver) return memory.has(name) ? memory.get(name) : null
      try {
        return driver.getItem(name)
      } catch {
        return memory.has(name) ? memory.get(name) : null
      }
    },

    set(key, value, { persist = 'local' } = {}) {
      const name = fullKey(key)
      const driver = pickDriver(persist)
      if (!driver) {
        memory.set(name, value)
        return
      }
      try {
        driver.setItem(name, value)
      } catch {
        // 配额写满是常态（比如别的代码把 localStorage 用光了），退回内存
        memory.set(name, value)
      }
    },

    remove(key, { persist = 'local' } = {}) {
      const name = fullKey(key)
      const driver = pickDriver(persist)
      try {
        driver && driver.removeItem(name)
      } catch {
        /* ignore */
      }
      memory.delete(name)
    },

    getJSON(key, options) {
      const raw = this.get(key, options)
      if (!raw) return null
      try {
        return JSON.parse(raw)
      } catch {
        return null
      }
    },

    setJSON(key, value, options) {
      try {
        this.set(key, JSON.stringify(value), options)
      } catch {
        /* ignore */
      }
    }
  }
}
