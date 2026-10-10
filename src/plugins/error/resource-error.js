import { matchAny, toRegExps } from '../../utils/misc.js'
import { sanitizeUrl } from '../../process/sanitize.js'

const RESOURCE_TAGS = ['script', 'link', 'img', 'image', 'video', 'audio', 'source', 'iframe', 'input']

/**
 * 资源加载失败。
 *
 * 必须在捕获阶段监听 window 的 error 事件：脚本自身的错误会走到 window 上（由 js-error 处理），
 * 而 img / link / script 的加载失败只会以「事件目标」的形式冒泡到捕获阶段的监听器。
 */
export function setupResourceError(ctx) {
  if (typeof window === 'undefined') return () => {}

  const ignorePatterns = toRegExps(
    [ctx.config.transport.url, ctx.config.dsn, ...(ctx.config.error.ignoreErrors || [])].filter(
      Boolean
    )
  )

  const handler = (event) => {
    const target = event.target || event.srcElement
    // target === window 说明是脚本运行时错误，交给 js-error，避免重复上报
    if (!target || target === window) return
    if (target.nodeType !== 1) return

    const tag = String(target.tagName || '').toLowerCase()
    if (!RESOURCE_TAGS.includes(tag)) return

    const url = target.currentSrc || target.src || target.href || ''
    if (!url) return
    if (matchAny(url, ignorePatterns)) return

    ctx.report(
      'resource_error',
      {
        kind: 'resource',
        tag,
        url: sanitizeUrl(url, { maxLength: 500 }),
        message: `${tag} 加载失败`
      },
      {
        sampleKey: 'error',
        dedupKey: `resource:${tag}:${url}`,
        dedupWindow: ctx.config.error.dedupeWindow
      }
    )

    ctx.breadcrumb.push({ type: 'resource_error', kind: 'resource', message: `${tag} 加载失败`, url })
  }

  window.addEventListener('error', handler, true)
  return () => window.removeEventListener('error', handler, true)
}
