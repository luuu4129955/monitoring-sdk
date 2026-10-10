import test from 'node:test'
import assert from 'node:assert/strict'

import { Monitor } from '../../src/core/monitor.js'

/** 用一个必然连不上的端口，保证测试不会真的把数据发出去 */
const makeMonitor = (extra = {}) =>
  new Monitor({ dsn: 'http://127.0.0.1:1/report', appName: 'test-app', ...extra })

test('采样率为 0 时事件被丢弃', () => {
  const monitor = makeMonitor({ sampling: { error: 0 } })
  assert.equal(monitor.report('error', { message: 'x' }), null)
})

test('priority=high 会绕过采样（核心链路不能被采样漏掉）', () => {
  const monitor = makeMonitor({ sampling: { error: 0 } })
  const payload = monitor.report('error', { message: '支付失败' }, { priority: 'high' })
  assert.ok(payload)
  assert.equal(payload.data.message, '支付失败')
})

test('force 也能绕过采样', () => {
  const monitor = makeMonitor({ sampling: { custom: 0 } })
  assert.ok(monitor.report('custom', { name: 'x' }, { force: true }))
})

test('去重：同一 key 在时间窗内只放行一次', () => {
  const monitor = makeMonitor()
  const options = { dedupKey: 'k', dedupWindow: 10000 }
  assert.ok(monitor.report('custom', { n: 1 }, options))
  assert.equal(monitor.report('custom', { n: 2 }, options), null)
})

test('错误事件自动附带面包屑，普通事件不带', () => {
  const monitor = makeMonitor()
  monitor.addBreadcrumb({ type: 'request', method: 'GET', url: 'https://a.com/api', status: 404 })

  const error = monitor.report('error', { message: 'boom' })
  assert.equal(error.breadcrumbs.length, 1)
  assert.equal(error.breadcrumbs[0].status, 404)

  const pv = monitor.report('pv', { stage: 'enter' })
  assert.equal(pv.breadcrumbs, undefined)
})

test('beforeSend 返回 false 时丢弃，返回对象时替换报文', () => {
  const dropped = makeMonitor({ beforeSend: () => false })
  assert.equal(dropped.report('pv', { stage: 'enter' }), null)

  const rewritten = makeMonitor({ beforeSend: (payload) => ({ ...payload, tag: 'stamped' }) })
  assert.equal(rewritten.report('pv', { stage: 'enter' }).tag, 'stamped')
})

test('beforeSend 抛错时不影响主流程（监控不能反过来把业务搞崩）', () => {
  const monitor = makeMonitor({
    beforeSend: () => {
      throw new Error('beforeSend 写错了')
    }
  })
  assert.equal(monitor.report('pv', { stage: 'enter' }), null)
})

test('上下文补充器能把插件的字段塞进每条报文', () => {
  const monitor = makeMonitor()
  monitor.addContextProvider(() => ({ record: { screenId: 'rec_1' } }))
  const payload = monitor.report('pv', { stage: 'enter' })
  assert.equal(payload.record.screenId, 'rec_1')
  assert.equal(payload.app.name, 'test-app')
})

test('上下文补充器抛错时不影响上报', () => {
  const monitor = makeMonitor()
  monitor.addContextProvider(() => {
    throw new Error('provider 写错了')
  })
  assert.ok(monitor.report('pv', { stage: 'enter' }))
})

test('脱敏在报文组装阶段生效', () => {
  const monitor = makeMonitor()
  const payload = monitor.report('request', {
    url: 'https://a.com/api?token=abc123',
    params: { password: 'p@ss', nickname: 'tom' }
  })
  assert.equal(payload.data.params.password, '***')
  assert.equal(payload.data.params.nickname, 'tom')
})
