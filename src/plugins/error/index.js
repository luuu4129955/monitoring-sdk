import { setupJsError } from './js-error.js'
import { setupResourceError } from './resource-error.js'
import { setupConsoleError } from './console-error.js'

/**
 * 错误采集插件。
 *
 * 只做一件事：把所有入口的错误收敛到同一个 handle 函数，
 * 这样手动上报（monitor.captureError）和自动采集的数据形状完全一致。
 */
export default {
  name: 'error',

  setup(ctx) {
    let handleManual = null

    if (ctx.config.error.js) handleManual = setupJsError(ctx)
    if (ctx.config.error.resource) setupResourceError(ctx)
    if (ctx.config.error.console) setupConsoleError(ctx)

    // 业务代码 try/catch 之后手动上报：monitor.captureError(err, { ... })
    ctx.bus.on('error:capture', ({ error, extra, options } = {}) => {
      if (typeof handleManual !== 'function') return
      handleManual({
        kind: 'manual',
        type: 'error',
        error,
        extra,
        priority: options && options.priority
      })
    })
  }
}
