import { sanitizeUrl } from './sanitize.js'
import { SDK_NAME, SDK_VERSION } from '../core/version.js'
import { getCurrentRoute } from '../utils/dom.js'

/**
 * 每条报文都要带的基础上下文。
 *
 * 刻意不缓存：URL、路由、标题在单页应用里随时会变，
 * 这几项取值的成本可以忽略，缓存反而容易上报「上一次的页面」。
 */
export function createContextProvider(config, identity) {
  return function getContext() {
    identity.touch()
    const nav = typeof navigator !== 'undefined' ? navigator : {}
    const loc = typeof location !== 'undefined' ? location : {}
    const scr = typeof screen !== 'undefined' ? screen : {}
    const doc = typeof document !== 'undefined' ? document : {}

    return {
      app: {
        name: config.appName,
        version: config.appVersion,
        env: config.env
      },
      sdk: {
        name: SDK_NAME,
        version: SDK_VERSION
      },
      session: {
        uid: identity.uid,
        sid: identity.sid
      },
      user: identity.user,
      page: {
        url: sanitizeUrl(String(loc.href || '')),
        path: String(loc.pathname || ''),
        route: getCurrentRoute(),
        hash: String(loc.hash || ''),
        title: String(doc.title || ''),
        referrer: sanitizeUrl(String(doc.referrer || ''))
      },
      device: {
        ua: String(nav.userAgent || ''),
        platform: String(nav.platform || ''),
        lang: String(nav.language || ''),
        screen: scr.width ? `${scr.width}x${scr.height}` : '',
        viewport:
          typeof window !== 'undefined' ? `${window.innerWidth}x${window.innerHeight}` : '',
        dpr: typeof window !== 'undefined' ? Number(window.devicePixelRatio) || 1 : 1
      }
    }
  }
}
