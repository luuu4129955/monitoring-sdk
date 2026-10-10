import test from 'node:test'
import assert from 'node:assert/strict'

import { createRequestRules } from '../../src/plugins/request/rules.js'
import { mergeConfig } from '../../src/core/config.js'

const makeRules = (extra = {}) =>
  createRequestRules(
    mergeConfig({
      dsn: 'https://collector.local/report',
      request: { slowThreshold: 2000, ...extra }
    })
  )

test('上报请求自己必须被忽略，否则一次失败的发送会触发新的上报', () => {
  const rules = makeRules()
  assert.equal(rules.shouldIgnore('https://collector.local/report', 'POST'), true)
  assert.equal(rules.shouldIgnore('https://shop.com/api/order', 'GET'), false)
})

test('ignoreUrls 支持字符串与正则', () => {
  const rules = makeRules({ ignoreUrls: ['/health', /^https:\/\/cdn\./] })
  assert.equal(rules.shouldIgnore('https://shop.com/health', 'GET'), true)
  assert.equal(rules.shouldIgnore('https://cdn.example.com/a.js', 'GET'), true)
  assert.equal(rules.shouldIgnore('https://shop.com/api/order', 'GET'), false)
})

test('ignoneMethods 命中时忽略', () => {
  const rules = makeRules({ ignoreMethods: ['options'] })
  assert.equal(rules.shouldIgnore('https://shop.com/api', 'OPTIONS'), true)
})

test('判定：4xx/5xx 是 http 错误', () => {
  const rules = makeRules()
  assert.deepEqual(rules.classify({ status: 404, duration: 100 }), {
    kind: 'http',
    isError: true,
    isSlow: false,
    reason: 'HTTP 404'
  })
})

test('判定：没有状态码或抛异常是网络错误', () => {
  const rules = makeRules()
  assert.equal(rules.classify({ status: 0, duration: 10 }).kind, 'network')
  assert.equal(rules.classify({ status: 200, errorName: 'TypeError', duration: 10 }).kind, 'network')
})

test('判定：用户主动取消不算错误（这是最容易制造的假报警）', () => {
  const rules = makeRules()
  const verdict = rules.classify({ status: 0, duration: 10, aborted: true })
  assert.equal(verdict.isError, false)
  assert.equal(verdict.kind, 'abort')
})

test('判定：超过阈值算慢请求', () => {
  const rules = makeRules()
  const verdict = rules.classify({ status: 200, duration: 2500 })
  assert.equal(verdict.isSlow, true)
  assert.equal(verdict.isError, false)
})

test('业务码判定：函数返回字符串 / true / 对象都能识别', () => {
  assert.equal(makeRules({ checkBusinessError: (d) => d.code !== 0 && 'code 不对' }).checkBusiness({ code: 500 }).isError, true)
  assert.equal(makeRules({ checkBusinessError: (d) => d.code !== 0 }).checkBusiness({ code: 0 }).isError, false)
  assert.equal(makeRules({ checkBusinessError: () => true }).checkBusiness({}).message, '业务码判定失败')
  assert.equal(
    makeRules({ checkBusinessError: () => ({ isError: true, message: '余额不足' }) }).checkBusiness({})
      .message,
    '余额不足'
  )
})

test('业务码判定函数自己抛错时，按「不是业务错误」处理', () => {
  const rules = makeRules({
    checkBusinessError: () => {
      throw new Error('判定函数写错了')
    }
  })
  const verdict = rules.checkBusiness({})
  assert.equal(verdict.isError, false)
  assert.ok(verdict.checkerError)
})
