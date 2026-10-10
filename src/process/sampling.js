/**
 * 采样：按事件类型独立配置采样率。
 *
 * 采样结果用随机数决定，并对同一个 eventKey 稳定（同一错误不要一会儿报一会儿不报），
 * 这样采样后的数据仍然是「按条目」而不是「按时间」丢失的。
 */
export function createSampler(config) {
  const sampling = config.sampling || {}

  const rateOf = (type) => {
    const rate = Number(sampling[type])
    if (!Number.isFinite(rate)) return 1
    return Math.min(Math.max(rate, 0), 1)
  }

  return (type) => {
    const rate = rateOf(type)
    if (rate >= 1) return true
    if (rate <= 0) return false
    return Math.random() < rate
  }
}
