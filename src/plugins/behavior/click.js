import { getInteractiveTarget, getSelector } from '../../utils/dom.js'

/**
 * 点击采集。
 *
 * 默认「只记面包屑、不上报」：点击是最高频的行为，全量上报的流量成本
 * 远超它带来的排查价值。真要做点击分析的项目，把 behavior.reportClick 打开即可。
 *
 * 用事件委托而不是逐个元素绑监听：单页应用里几千个按钮逐个绑，
 * 光是监听器本身就够把内存吃掉。
 */
export function setupClick(ctx) {
  if (typeof document === 'undefined') return () => {}

  const handler = (event) => {
    try {
      const target = getInteractiveTarget(event.target)
      if (!target) return
      const selector = getSelector(target)
      const text = String(target.innerText || target.value || '').trim().slice(0, 30)

      ctx.breadcrumb.push({ type: 'click', selector, text })

      if (ctx.config.behavior.reportClick) {
        ctx.report(
          'click',
          { selector, text, x: Math.round(event.clientX), y: Math.round(event.clientY) },
          { sampleKey: 'behavior' }
        )
      }
    } catch {
      /* ignore */
    }
  }

  document.addEventListener('click', handler, true)
  return () => document.removeEventListener('click', handler, true)
}
