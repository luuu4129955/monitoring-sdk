import { getCurrentRoute } from '../../utils/dom.js'

/**
 * 路由变化监听。
 *
 * 不 import 任何路由库：Vue Router、React Router、手写的 history 封装，
 * 底层走的都是 history.pushState / replaceState 加 popstate，
 * 所以劫持这两个方法就通吃了所有框架——这正是「框架无关」能成立的原因之一。
 */
export function setupRoute(ctx) {
  if (typeof window === 'undefined' || !window.history) return () => {}

  const history = window.history
  let current = getCurrentRoute()

  const onNavigate = (kind) => {
    const next = getCurrentRoute()
    if (next === current) return
    const from = current
    current = next
    ctx.bus.emit('route:change', { from, to: next, kind })
  }

  const patch = (name) => {
    const raw = history[name]
    if (typeof raw !== 'function' || raw.__monitorPatched) return
    const wrapped = function (...args) {
      const result = raw.apply(this, args)
      try {
        onNavigate(name)
      } catch {
        /* ignore */
      }
      return result
    }
    wrapped.__monitorPatched = true
    wrapped.__monitorOriginal = raw
    history[name] = wrapped
  }

  patch('pushState')
  patch('replaceState')

  const onPopState = () => onNavigate('popstate')
  const onHashChange = () => onNavigate('hashchange')
  window.addEventListener('popstate', onPopState)
  window.addEventListener('hashchange', onHashChange)

  return () => {
    window.removeEventListener('popstate', onPopState)
    window.removeEventListener('hashchange', onHashChange)
  }
}
