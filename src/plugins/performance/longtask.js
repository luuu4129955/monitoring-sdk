/**
 * 长任务：单次占用主线程超过阈值（默认 50ms）的任务，是「页面卡顿」最直接的可观测信号。
 * 它和 FCP / LCP 互补——首屏再快，只要一直有长任务，用户还是觉得卡。
 */
export function collectLongTasks({ threshold = 50 } = {}) {
  const items = []
  const summary = { count: 0, total: 0, max: 0 }
  let observer = null

  if (typeof PerformanceObserver === 'function') {
    try {
      observer = new PerformanceObserver((list) => {
        for (const entry of list.getEntries()) {
          if (entry.duration < threshold) continue
          summary.count += 1
          summary.total += entry.duration
          summary.max = Math.max(summary.max, entry.duration)
          if (items.length < 5) {
            items.push({
              startTime: Math.round(entry.startTime),
              duration: Math.round(entry.duration)
            })
          }
        }
      })
      observer.observe({ type: 'longtask', buffered: true })
    } catch {
      observer = null
    }
  }

  return {
    get() {
      return {
        count: summary.count,
        total: Math.round(summary.total),
        max: Math.round(summary.max),
        samples: items
      }
    },
    stop() {
      if (observer) {
        try {
          observer.disconnect()
        } catch {
          /* ignore */
        }
      }
    }
  }
}
