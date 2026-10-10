/**
 * 资源时序汇总。
 *
 * 只在「页面离开」时采一次，并且只带耗时最长的前 N 条：
 * 完整的 PerformanceResourceTiming 一条有 35 个字段，一个页面动辄上百条资源，
 * 全量上报纯属浪费——排查单个慢请求靠采样，看整体趋势用汇总就够。
 */
export function collectResourceSummary({ topN = 5 } = {}) {
  if (typeof performance === 'undefined' || typeof performance.getEntriesByType !== 'function') {
    return null
  }
  const entries = performance.getEntriesByType('resource') || []
  if (!entries.length) return null

  const list = entries.map((entry) => ({
    name: entry.name,
    type: entry.initiatorType || 'other',
    duration: Math.round(entry.duration),
    size: Math.round(entry.transferSize || 0),
    startTime: Math.round(entry.startTime || 0)
  }))

  const byType = {}
  let totalSize = 0
  for (const item of list) {
    byType[item.type] = (byType[item.type] || 0) + 1
    totalSize += item.size
  }

  return {
    count: list.length,
    totalSize,
    byType,
    slow: [...list].sort((a, b) => b.duration - a.duration).slice(0, topN)
  }
}
