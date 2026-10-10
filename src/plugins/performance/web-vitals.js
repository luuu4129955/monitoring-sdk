import { timeNow } from '../../utils/misc.js'

const round = (value) => Math.round((Number(value) || 0) * 100) / 100

/**
 * 核心 Web Vitals 采集（不依赖 web-vitals 库，自己用 PerformanceObserver 实现）。
 *
 * 为什么要自己写：web-vitals 的实现很好，但它带来一个额外依赖和一份需要跟随的升级成本；
 * 而我们只需要 5 个指标加一个「页面加载完成」的时间点。
 *
 * 各指标口径（跟 Lighthouse 对数时避免误以为算错）：
 *  - TTFB：navigation.responseStart - startTime
 *  - FCP / LCP：取 PerformancePaintTiming / LCP 条目的 startTime
 *  - CLS：按标准算法做「会话窗口」聚簇后取最大值，不是简单求和
 *  - INP：用 event 条目的最大 duration 近似（完整实现取 98 分位，这里标注为近似值）
 */
export function collectWebVitals() {
  const metrics = { ttfb: 0, fcp: 0, lcp: 0, cls: 0, inp: 0, domReady: 0, load: 0 }
  const observers = []
  const shiftEntries = []

  const observe = (type, handler) => {
    if (typeof PerformanceObserver !== 'function') return
    try {
      const observer = new PerformanceObserver((list) => {
        try {
          handler(list.getEntries())
        } catch {
          /* ignore */
        }
      })
      observer.observe({ type, buffered: true })
      observers.push(observer)
    } catch {
      /* 浏览器不支持这个 entry type（例如早期 Safari 没有 longtask），跳过即可 */
    }
  }

  const readNavigation = () => {
    if (typeof performance === 'undefined') return
    const nav = performance.getEntriesByType && performance.getEntriesByType('navigation')[0]
    if (nav) {
      metrics.ttfb = round(nav.responseStart - nav.startTime)
      metrics.domReady = round(Math.max(nav.domContentLoadedEventEnd - nav.startTime, 0))
      metrics.load = round(Math.max(nav.loadEventEnd - nav.startTime, 0))
      return
    }
    const timing = performance.timing
    if (timing && timing.navigationStart) {
      metrics.ttfb = round(timing.responseStart - timing.navigationStart)
      metrics.domReady = round(Math.max(timing.domContentLoadedEventEnd - timing.navigationStart, 0))
      metrics.load = round(Math.max(timing.loadEventEnd - timing.navigationStart, 0))
    }
  }
  readNavigation()

  observe('paint', (entries) => {
    for (const entry of entries) {
      if (entry.name === 'first-contentful-paint') metrics.fcp = round(entry.startTime)
    }
  })

  observe('largest-contentful-paint', (entries) => {
    const last = entries[entries.length - 1]
    if (last) metrics.lcp = round(Math.max(metrics.lcp, last.startTime))
  })

  observe('layout-shift', (entries) => {
    for (const entry of entries) shiftEntries.push(entry)
    metrics.cls = round(computeCLS(shiftEntries))
  })

  observe('event', (entries) => {
    for (const entry of entries) {
      // 只统计真实交互：滚动、鼠标移动也会产生 event 条目，会把 INP 拉偏
      if (entry.interactionId === undefined && entry.duration < 40) continue
      metrics.inp = round(Math.max(metrics.inp, entry.duration))
    }
  })

  const refresh = () => {
    readNavigation()
    if (typeof performance !== 'undefined' && performance.getEntriesByType) {
      if (!metrics.fcp) {
        const paint = performance.getEntriesByName('first-contentful-paint')[0]
        if (paint) metrics.fcp = round(paint.startTime)
      }
      // 注意：不要用 getEntriesByType('largest-contentful-paint') 兜底。
      // LCP / layout-shift / longtask 这些 entry type 不通过该 API 暴露，
      // Chrome 会直接打一条 "Deprecated API for given entry type." 警告污染控制台。
      // LCP 已经由上面的 PerformanceObserver 收全了。
    }
    return { ...metrics, collectedAt: Math.round(timeNow()) }
  }

  return {
    get: refresh,
    stop() {
      for (const observer of observers) {
        try {
          observer.disconnect()
        } catch {
          /* ignore */
        }
      }
      observers.length = 0
    }
  }
}

/**
 * CLS 的「会话窗口」算法：把没有用户输入的布局偏移按
 * 「间隔小于 1s 且窗口总长小于 5s」聚成一组，取组内和的最大值。
 * 直接求和会在长会话页面算出夸张的数值，和 Lighthouse 对不上账。
 */
export function computeCLS(entries) {
  let max = 0
  let current = 0
  let windowStart = 0
  let previous = 0

  for (const entry of entries) {
    if (entry.hadRecentInput) continue
    const start = Number(entry.startTime) || 0
    const value = Number(entry.value) || 0
    if (current === 0) {
      current = value
      windowStart = start
    } else if (start - previous < 1000 && start - windowStart < 5000) {
      current += value
    } else {
      current = value
      windowStart = start
    }
    if (current > max) max = current
    previous = start
  }
  return max
}
