import { elementAtPoint, getCurrentRoute, isBrowser, onLoad } from '../../utils/dom.js'

const CONTAINER_CANDIDATES = ['#app', '#root', '.app', '#__next', 'main']

/**
 * 白屏检测。
 *
 * 两条规则都是从 web-see 的实测结果里学来的：
 *  1. 先去重：它的 demo 里一次白屏连续上报了 17 条，同一路由重复 14 条，
 *     真实项目里这种量级会直接把告警淹掉。这里「同一路由一个会话只报一次」。
 *  2. 给宽限期：load 之后再等 delay（默认 3s）才检测。框架慢启动不等于白屏，
 *     检测太早会把「慢」误判成「坏」。
 */
export default {
  name: 'whiteScreen',

  setup(ctx) {
    const options = ctx.config.whiteScreen
    if (!options.enabled || !isBrowser) return

    onLoad(
      () => {
        try {
          runCheck(ctx, options)
        } catch {
          /* ignore */
        }
      },
      { delay: options.delay }
    )
  }
}

function resolveContainer(options) {
  if (options.container) {
    try {
      return document.querySelector(options.container)
    } catch {
      return null
    }
  }
  for (const selector of CONTAINER_CANDIDATES) {
    const element = document.querySelector(selector)
    if (element) return element
  }
  return document.body
}

/** 生成相对视口的采样点，避开最边缘（边缘经常是滚动条或留白） */
function buildPoints(total) {
  const count = Math.max(Math.round(total) || 9, 1)
  if (count === 1) return [[0.5, 0.5]]
  const side = Math.ceil(Math.sqrt(count))
  const points = []
  for (let row = 1; row <= side; row += 1) {
    for (let col = 1; col <= side; col += 1) {
      points.push([col / (side + 1), row / (side + 1)])
    }
  }
  return points.slice(0, count)
}

function runCheck(ctx, options) {
  // 页面在后台时布局不可信，跳过（用户切回来还有机会再检测一次）
  if (document.visibilityState === 'hidden') return
  if (!document.body) return

  const container = resolveContainer(options)
  if (!container) return

  const points = buildPoints(options.samplePoints)
  let blank = 0

  for (const [ratioX, ratioY] of points) {
    const element = elementAtPoint(ratioX, ratioY)
    if (!element) {
      blank += 1
      continue
    }
    if (element === document.documentElement || element === document.body) {
      blank += 1
      continue
    }
    // 命中的还是空容器本身：挂载点存在，但里面什么都没有
    if (element === container && container.children.length === 0) blank += 1
  }

  const hasText = String(document.body.innerText || '').trim().length > 0
  const mediaCount = document.querySelectorAll('img,canvas,video,svg,iframe').length
  const ratio = blank / points.length

  if (ratio < options.blankThreshold || hasText || mediaCount > 0) return

  const route = getCurrentRoute()
  ctx.report(
    'white_screen',
    {
      kind: 'white_screen',
      route,
      blankRatio: Number(ratio.toFixed(2)),
      viewport: `${window.innerWidth}x${window.innerHeight}`,
      container: options.container || container.id || container.tagName.toLowerCase(),
      delay: options.delay
    },
    {
      sampleKey: 'whiteScreen',
      // Infinity = 本次会话内同一路由只报一次
      dedupKey: `whiteScreen:${route}`,
      dedupWindow: Infinity
    }
  )
}
