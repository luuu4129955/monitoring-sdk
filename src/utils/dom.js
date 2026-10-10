/** DOM 相关工具：都做了「不在浏览器环境就安全返回」的保护，方便 Node 下单测。 */

export const isBrowser = typeof window !== 'undefined' && typeof document !== 'undefined'

export function getCurrentRoute() {
  if (!isBrowser) return ''
  const { pathname = '', search = '', hash = '' } = window.location
  // hash 路由（#/a/b）优先用 hash 当路由，否则路径会被全部识别成同一个
  if (hash && hash.length > 1 && (hash.startsWith('#/') || hash.startsWith('#!/'))) return hash
  return `${pathname}${search}`
}

/** 生成一个尽量稳定、可读的元素选择器，用于点击埋点定位 */
export function getSelector(element) {
  if (!element || element.nodeType !== 1) return ''
  const parts = []
  let node = element
  let depth = 0
  while (node && node.nodeType === 1 && depth < 5) {
    parts.unshift(describeNode(node))
    if (node.id) break
    node = node.parentElement
    depth += 1
  }
  return parts.join(' > ')
}

function describeNode(node) {
  const tag = (node.tagName || '').toLowerCase()
  if (!tag) return ''
  if (node.id) return `${tag}#${node.id}`
  const className = typeof node.className === 'string' ? node.className.trim().split(/\s+/)[0] : ''
  const stableClass = className && !/^(css|sc|_|[a-z]+-[0-9a-f]{6,})/i.test(className) ? `.${className}` : ''
  const dataAttr = node.getAttribute && (node.getAttribute('data-testid') || node.getAttribute('data-track'))
  if (dataAttr) return `${tag}[data-testid="${dataAttr}"]`
  return `${tag}${stableClass}`
}

/** 找到真正被点到的可交互元素（点到 span 时回溯到 button / a） */
export function getInteractiveTarget(target) {
  if (!target || target.nodeType !== 1) return null
  const native = typeof target.closest === 'function' ? target : null
  if (!native) return target
  return (
    native.closest('button,a,input,select,textarea,[role="button"],[data-track]') ||
    target
  )
}

/**
 * 页面要离开时统一执行回调：visibilitychange(hidden) 与 pagehide 双保险，
 * 只在浏览器支持 sendBeacon 时才能真正保证送达。
 */
export function onPageLeave(callback) {
  if (!isBrowser) return () => {}
  const onHidden = () => {
    if (document.visibilityState === 'hidden') callback()
  }
  document.addEventListener('visibilitychange', onHidden)
  window.addEventListener('pagehide', callback)
  return () => {
    document.removeEventListener('visibilitychange', onHidden)
    window.removeEventListener('pagehide', callback)
  }
}

export function onLoad(callback, { delay = 0 } = {}) {
  if (!isBrowser) return () => {}
  let timer = null
  const run = () => {
    timer = setTimeout(callback, delay)
  }
  if (document.readyState === 'complete') run()
  else window.addEventListener('load', run, { once: true })
  return () => timer && clearTimeout(timer)
}

/** 用相对视口的比例坐标采样，返回命中的元素（用于白屏检测） */
export function elementAtPoint(ratioX, ratioY) {
  if (!isBrowser || typeof document.elementFromPoint !== 'function') return null
  const x = Math.min(Math.max(Math.floor(window.innerWidth * ratioX), 0), window.innerWidth - 1)
  const y = Math.min(Math.max(Math.floor(window.innerHeight * ratioY), 0), window.innerHeight - 1)
  if (x <= 0 || y <= 0) return null
  try {
    return document.elementFromPoint(x, y)
  } catch {
    return null
  }
}

export function resolveAbsoluteUrl(url) {
  if (!isBrowser) return String(url || '')
  try {
    return new URL(String(url), window.location.href).href
  } catch {
    return String(url || '')
  }
}
