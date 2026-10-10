/**
 * Vue 适配器（可选）。
 *
 * 不装它也能跑：JS 错误、接口错误、性能、路由、点击全都由内核的原生拦截覆盖。
 * 装它的唯一好处是错误能带上「哪个组件 / 哪个生命周期钩子」，
 * 排查 Vue 组件树里的报错会快很多。
 *
 *   import { init } from '@perf/monitor'
 *   import { createVuePlugin } from '@perf/monitor/adapters/vue'
 *   const monitor = init({ dsn: '...' })
 *   app.use(createVuePlugin(monitor))
 */
export function createVuePlugin(monitor, options = {}) {
  return {
    install(app) {
      if (!app || !app.config) return
      const previous = app.config.errorHandler

      app.config.errorHandler = (error, instance, info) => {
        try {
          monitor.captureError(error, {
            source: 'vue',
            hook: String(info || ''),
            component: options.componentName ? options.componentName(instance) : componentName(instance)
          })
        } catch {
          /* ignore */
        }
        // 业务自己注册的 errorHandler 必须继续执行，不能被监控顶掉
        if (typeof previous === 'function') previous(error, instance, info)
      }

      return undefined
    }
  }
}

function componentName(instance) {
  if (!instance) return ''
  const options = instance.$options || instance.type || {}
  return String(options.name || options.__name || options.__file || '')
}

/**
 * 可选：把 vue-router 的「路由名」也带上。
 * 内核已经能识别路由变化（劫持 history），这里只是补一个更可读的名字。
 */
export function setupVueRouter(monitor, router) {
  if (!router || typeof router.afterEach !== 'function') return () => {}
  return router.afterEach((to, from) => {
    monitor.report(
      'route_view',
      { name: String((to && to.name) || ''), path: String((to && to.path) || ''), from: String((from && from.path) || '') },
      { sampleKey: 'pv' }
    )
  })
}
