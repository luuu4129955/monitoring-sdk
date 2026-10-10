import { setupRoute } from './route.js'
import { setupPv } from './pv.js'
import { setupClick } from './click.js'

/**
 * 行为插件：PV / 路由 / 点击。
 *
 * 这三件事的共同点是单独看信息量不大，但组合起来能还原「用户走到了哪一步」，
 * 所以点击默认只进面包屑，只有 PV 和路由变化真正上报。
 */
export default {
  name: 'behavior',

  setup(ctx) {
    if (ctx.config.behavior.route) setupRoute(ctx)
    if (ctx.config.behavior.pv) setupPv(ctx)
    if (ctx.config.behavior.click) setupClick(ctx)
  }
}
