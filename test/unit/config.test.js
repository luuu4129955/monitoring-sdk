import test from 'node:test'
import assert from 'node:assert/strict'

import { mergeConfig, DEFAULT_CONFIG } from '../../src/core/config.js'

test('深合并：只覆盖传入的字段，其余保持默认', () => {
  const config = mergeConfig({ dsn: 'https://collector/report', request: { slowThreshold: 500 } })
  assert.equal(config.request.slowThreshold, 500)
  // 同一层级里没传的字段必须保留默认值
  assert.equal(config.request.fetch, DEFAULT_CONFIG.request.fetch)
  assert.equal(config.error.dedupeWindow, DEFAULT_CONFIG.error.dedupeWindow)
})

test('采样率被夹到 [0,1]', () => {
  const config = mergeConfig({ dsn: 'x', sampling: { error: 1.5, request: -1, pv: 0.3 } })
  assert.equal(config.sampling.error, 1)
  assert.equal(config.sampling.request, 0)
  assert.equal(config.sampling.pv, 0.3)
})

test('transport.url 缺省时自动取 dsn', () => {
  const config = mergeConfig({ dsn: 'https://a.com/report' })
  assert.equal(config.transport.url, 'https://a.com/report')
})

test('非法配置只降级不抛错（监控不能把业务搞崩）', () => {
  const config = mergeConfig({ dsn: 'x', beforeSend: 'not-a-function', request: { checkBusinessError: 123 } })
  assert.equal(config.beforeSend, null)
  assert.equal(config.request.checkBusinessError, null)
  assert.equal(config.enabled, true)
})

test('batchSize 非法时回退到 1', () => {
  const config = mergeConfig({ dsn: 'x', transport: { batchSize: 0 } })
  assert.equal(config.transport.batchSize, 1)
})

test('传入非对象时不抛错', () => {
  const config = mergeConfig(null)
  assert.equal(config.storagePrefix, DEFAULT_CONFIG.storagePrefix)
})
