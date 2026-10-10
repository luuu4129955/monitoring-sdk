import { collectWebVitals } from './web-vitals.js'
import { collectLongTasks } from './longtask.js'
import { collectResourceSummary } from './resource.js'
import { onLoad, onPageLeave } from '../../utils/dom.js'

/**
 * 性能插件：每个页面访问发两条报文。
 *  - load 阶段：TTFB / FCP / LCP / 加载耗时（延迟 initialDelay，给指标收敛时间）
 *  - final 阶段：CLS / INP / 长任务 / 资源汇总（页面离开时用 sendBeacon 送达）
 *
 * 拆两条而不是一条：CLS / INP / 资源汇总在 load 时还没有定论，
 * 但硬等到页面离开才发，又会丢掉「用户打开很快就走」这一类页面。
 */
export default {
  name: 'performance',

  setup(ctx) {
    const vitals = collectWebVitals()
    const longTasks = collectLongTasks({ threshold: ctx.config.performance.longTaskThreshold })
    let finalReported = false

    const report = (stage) => {
      const data = { stage, ...vitals.get() }
      const longTask = longTasks.get()
      if (longTask.count) data.longTask = longTask

      if (stage === 'final' && ctx.config.performance.reportResource) {
        const resource = collectResourceSummary({ topN: ctx.config.performance.resourceTopN })
        if (resource) data.resource = resource
      }

      ctx.report('performance', data, { sampleKey: 'performance' })
    }

    onLoad(() => report('load'), { delay: ctx.config.performance.initialDelay })

    onPageLeave(() => {
      if (finalReported) return
      finalReported = true
      report('final')
    })
  }
}
