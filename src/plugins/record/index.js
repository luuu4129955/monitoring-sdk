import { uuid } from '../../utils/misc.js'
import { isBrowser } from '../../utils/dom.js'

/**
 * 用户行为录制插件（rrweb）。
 *
 * 设计上刻意做成一件事：**rrweb 由接入方注入，SDK 不依赖它**。
 *  - 不装 rrweb 的项目，内核产物里连一行录屏代码都没有（默认插件集里不含本插件）；
 *  - 装了的项目，把 rrweb 传进来即可，版本由业务自己控制。
 *
 *   import * as rrweb from 'rrweb'
 *   init(config, [...defaultPlugins, createRecordPlugin({ rrweb })])
 *
 * 与错误的关联方式和 web-see 一致：录屏单独成报文，靠 recordScreenId 关联；
 * 每条报文里都会带上 record.screenId，后端按这个字段就能把「错误 + 录屏」拼起来——
 * 这也是实测里 744 KB 那种「把录屏塞进错误包」的做法的替代方案。
 */
export function createRecordPlugin({ rrweb, options } = {}) {
  return {
    name: 'record',

    setup(ctx) {
      const config = { ...(ctx.config.record || {}), ...(options || {}) }

      if (!config.enabled) return
      if (!isBrowser) return
      if (!rrweb || typeof rrweb.record !== 'function') {
        ctx.logger.warn('录屏插件已注册，但没有拿到 rrweb，已跳过。用法：createRecordPlugin({ rrweb })')
        return
      }
      // 录屏有 CPU 成本，采样要在「开始录」之前决定，不能等上报时才丢
      if (config.sampleRate < 1 && Math.random() >= config.sampleRate) {
        ctx.logger.debug('录屏未命中采样，跳过')
        return
      }

      const screenId = uuid()
      const buffer = []
      let stopFn = null
      let timer = null
      let active = false

      // 每条报文都带上录屏 id，后端据此关联错误与录屏
      ctx.monitor.addContextProvider(() => ({ record: { screenId, active } }))

      const start = () => {
        if (active) return
        try {
          stopFn = rrweb.record({
            emit(event) {
              buffer.push(event)
              if (buffer.length > config.maxEvents) buffer.splice(0, buffer.length - config.maxEvents)
            },
            maskAllInputs: config.maskAllInputs,
            blockClass: config.blockClass,
            ignoreClass: config.ignoreClass,
            // canvas / 字体录制既费流量又容易踩隐私问题，默认关
            recordCanvas: false,
            collectFonts: false
          })
          active = true
        } catch (err) {
          ctx.logger.warn('启动录屏失败', err)
        }
      }

      const stop = () => {
        if (typeof stopFn === 'function') {
          try {
            stopFn()
          } catch {
            /* ignore */
          }
        }
        stopFn = null
        active = false
      }

      /** 把缓冲区里最近的一段事件切出来上报（切走之后就清空，避免重复上报） */
      const flush = (reason = 'manual') => {
        if (!buffer.length) return null
        const events = buffer.splice(0, buffer.length).slice(-config.flushLimit)
        return ctx.report(
          'replay',
          {
            kind: 'replay',
            reason,
            screenId,
            eventCount: events.length,
            events
          },
          { sampleKey: 'replay' }
        )
      }

      start()

      // 出错时自动切一段录屏出来（错误报文先走，录屏随后到，靠 screenId 关联）
      const off = ctx.bus.on('report', ({ type }) => {
        if (type === 'replay') return // 防止自己触发自己
        if (type === 'error' || type === 'unhandledrejection' || type === 'resource_error') {
          flush('error')
        }
      })

      if (config.strategy === 'always') {
        timer = setInterval(() => flush('interval'), Math.max(config.flushInterval, 5000))
      }

      // 对外暴露手动控制入口：重要表单页可以主动 start / flush
      return {
        api: {
          screenId,
          start,
          stop,
          flush,
          isActive: () => active
        },
        destroy() {
          off()
          if (timer) clearInterval(timer)
          stop()
        }
      }
    }
  }
}
