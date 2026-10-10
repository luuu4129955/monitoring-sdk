import { getCurrentRoute, onPageLeave } from '../../utils/dom.js'

/** 页面访问量 + 停留时长。停留时长只在离开时发一条，成本极低、信息量很大。 */
export function setupPv(ctx) {
  const startedAt = Date.now()
  let lastRoute = getCurrentRoute()
  let routeStartedAt = startedAt

  ctx.report(
    'pv',
    {
      stage: 'enter',
      route: lastRoute,
      referrer: typeof document !== 'undefined' ? document.referrer || '' : ''
    },
    { sampleKey: 'pv' }
  )

  const off = ctx.bus.on('route:change', ({ from, to, kind }) => {
    const duration = Date.now() - routeStartedAt
    routeStartedAt = Date.now()
    lastRoute = to
    ctx.report('pv', { stage: 'route', from, to, kind, duration }, { sampleKey: 'pv' })
  })

  let leaveReported = false
  const offLeave = onPageLeave(() => {
    // visibilitychange 和 pagehide 会先后触发，这里必须只认第一次，
    // 否则每次离开页面都会收到两条一模一样的 page_stay
    if (leaveReported) return
    leaveReported = true
    ctx.report(
      'page_stay',
      {
        pageDuration: Date.now() - startedAt,
        routeDuration: Date.now() - routeStartedAt,
        route: lastRoute
      },
      { sampleKey: 'pv' }
    )
  })

  return () => {
    off()
    offLeave()
  }
}
