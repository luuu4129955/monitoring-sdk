import test from 'node:test'
import assert from 'node:assert/strict'

import { sanitizeUrl, sanitizeValue } from '../../src/process/sanitize.js'

const options = {
  enabled: true,
  maxDepth: 3,
  maxArrayLength: 3,
  maxStringLength: 10,
  sensitiveKeys: ['password', 'token', 'mobile'],
  whitelistKeys: []
}

test('sanitizeUrl：敏感参数打码，普通参数与 hash 路由保留', () => {
  const url = sanitizeUrl('https://shop.com/api/list?page=1&token=abc123&mobile=13800000000#/detail')
  assert.equal(url.includes('abc123'), false)
  assert.equal(url.includes('13800000000'), false)
  assert.ok(url.includes('page=1'))
  assert.ok(url.includes('token=***'))
  assert.ok(url.includes('#/detail'))
})

test('sanitizeUrl：没有 query 时原样返回', () => {
  assert.equal(sanitizeUrl('https://shop.com/#/home'), 'https://shop.com/#/home')
  assert.equal(sanitizeUrl(''), '')
})

test('sanitizeValue：按 key 打码，大小写与片段都能命中', () => {
  const result = sanitizeValue(
    { Password: 'p@ss', 'x-access-token': 't', mobile: '138', nickname: '张三' },
    options
  )
  assert.equal(result.Password, '***')
  assert.equal(result['x-access-token'], '***')
  assert.equal(result.mobile, '***')
  assert.equal(result.nickname, '张三')
})

test('sanitizeValue：超长字符串被截断', () => {
  const result = sanitizeValue({ text: 'x'.repeat(50) }, options)
  assert.ok(result.text.length < 50)
  assert.ok(result.text.includes('truncated'))
})

test('sanitizeValue：超过深度限制后不再展开', () => {
  const result = sanitizeValue({ a: { b: { c: { d: 1 } } } }, options)
  assert.equal(result.a.b.c, '[MaxDepth]')
})

test('sanitizeValue：数组超长时截断并标注', () => {
  const result = sanitizeValue({ list: [1, 2, 3, 4, 5] }, options)
  assert.equal(result.list.length, 4)
  assert.equal(result.list[3], '[+2 more]')
})

test('sanitizeValue：Error 转成可序列化的普通对象', () => {
  const result = sanitizeValue(new Error('boom'), options)
  assert.equal(result.message, 'boom')
  assert.equal(result.name, 'Error')
})

test('sanitizeValue：Map 之类不深挖，避免体积失控', () => {
  const result = sanitizeValue(new Map([['a', 1]]), options)
  assert.equal(result, '[Map]')
})

test('sanitizeValue：enabled 为 false 时原样返回', () => {
  const input = { password: 'p@ss' }
  assert.equal(sanitizeValue(input, { enabled: false }), input)
})
