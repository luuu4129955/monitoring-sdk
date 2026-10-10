import { createRequestRules } from './rules.js'
import { createRequestReporter } from './reporter.js'
import { patchFetch } from './fetch.js'
import { patchXHR } from './xhr.js'

/**
 * 接口监控插件：只劫持 fetch 与 XMLHttpRequest 两个原生入口，
 * 因此不依赖 axios / umi-request 等任何请求库，也不需要框架适配。
 */
export default {
  name: 'request',

  setup(ctx) {
    const rules = createRequestRules(ctx.config)
    ctx.reporter = createRequestReporter(ctx, rules)

    if (ctx.config.request.fetch) patchFetch(ctx, rules)
    if (ctx.config.request.xhr) patchXHR(ctx, rules)
  }
}
