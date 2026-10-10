import { createSender } from './sender.js'
import { createRetryQueue } from './retry.js'
import { onPageLeave } from '../utils/dom.js'

/**
 * 上报队列。
 *
 * 触发发送的时机有三个：攒够 batchSize / 到 flushInterval / 页面要离开。
 * 最后一个走 sendBeacon，这是唯一能在 pagehide 里把数据送出去的通道。
 */
export class Transport {
  constructor(config, { storage, logger }) {
    this.config = config
    this.logger = logger
    this.queue = []
    this.sending = false
    this.timer = null
    this.offLeave = null
    this.sender = createSender(config, logger)
    this.retry = createRetryQueue(config, storage, logger)
  }

  get size() {
    return this.queue.length
  }

  start() {
    if (this.timer || !this.config.enabled) return this

    // 上次没发出去的先补发
    this.retry.drain((list) => this.sender(list, { preferBeacon: false }))

    this.timer = setInterval(() => this.flush(), Math.max(this.config.transport.flushInterval, 500))
    this.offLeave = onPageLeave(() => this.flush({ sync: true }))
    return this
  }

  stop() {
    if (this.timer) clearInterval(this.timer)
    this.timer = null
    if (this.offLeave) this.offLeave()
    this.offLeave = null
    return this
  }

  /**
   * @param {object} payload 报文
   * @param {{urgent?: boolean}} options urgent = 立即发送（核心链路的关键事件用）
   */
  push(payload, { urgent = false } = {}) {
    if (!payload || !this.config.enabled) return
    this.queue.push(payload)

    const maxQueue = Math.max(Number(this.config.transport.maxQueue) || 30, 1)
    if (this.queue.length > maxQueue) {
      const dropped = this.queue.splice(0, this.queue.length - maxQueue)
      this.logger.warn(`队列超过 ${maxQueue} 条，丢弃最早的 ${dropped.length} 条`)
    }

    this.logger.debug('入队', payload.type, urgent ? '(紧急)' : '', '队列长度', this.queue.length)

    if (urgent || this.queue.length >= Math.max(Number(this.config.transport.batchSize) || 1, 1)) {
      this.flush()
    }
  }

  /**
   * @param {{sync?: boolean}} options sync 用于页面卸载：一次性全发、优先 beacon、不等待
   */
  flush({ sync = false } = {}) {
    if (this.sending || !this.queue.length) return Promise.resolve(true)
    if (!this.config.enabled) {
      this.queue.length = 0
      return Promise.resolve(true)
    }

    const batchSize = Math.max(Number(this.config.transport.batchSize) || 1, 1)
    const batches = []
    if (sync) {
      // 卸载时只有一次机会：把所有排队的事件压成一个请求
      batches.push(this.queue.splice(0, this.queue.length))
    } else {
      while (this.queue.length) batches.push(this.queue.splice(0, batchSize))
    }

    this.sending = true
    const tasks = batches.map(async (batch) => {
      const ok = await this.sender(batch, { preferBeacon: sync })
      if (!ok) {
        this.logger.debug('发送失败，转入重试队列', batch.length, '条')
        this.retry.push(...batch)
      }
    })

    return Promise.all(tasks)
      .catch(() => {
        /* sender 内部已兜底，这里只防止 Promise.all 把异常抛到全局 */
      })
      .finally(() => {
        this.sending = false
      })
  }
}
