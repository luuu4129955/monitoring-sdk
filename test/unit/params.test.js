import test from 'node:test'
import assert from 'node:assert/strict'

import { serializeBody, shrinkParams } from '../../src/plugins/request/params.js'

test('JSON 字符串 body 会被解析成对象', () => {
  assert.deepEqual(serializeBody('{"skuId":1,"count":2}'), { skuId: 1, count: 2 })
})

test('表单编码 body 会被解析成对象', () => {
  assert.deepEqual(serializeBody('a=1&b=2'), { a: '1', b: '2' })
})

test('非法 JSON 退化成纯文本，不抛错', () => {
  assert.equal(serializeBody('{不是 JSON}'), '{不是 JSON}')
})

test('URLSearchParams / FormData 都会被转成对象', () => {
  assert.deepEqual(serializeBody(new URLSearchParams('x=1&y=2')), { x: '1', y: '2' })

  const form = new FormData()
  form.append('user', 'tom')
  form.append('tags', 'a')
  form.append('tags', 'b')
  assert.deepEqual(serializeBody(form), { user: 'tom', tags: ['a', 'b'] })
})

test('二进制与 Stream 只留标记，绝不去消费 body', () => {
  assert.equal(serializeBody(new Blob(['abc'])), '[Blob 3B]')
  assert.equal(serializeBody(new ArrayBuffer(8)), '[Binary 8B]')
})

test('空 body 返回 undefined（不上报空参数）', () => {
  assert.equal(serializeBody(undefined), undefined)
  assert.equal(serializeBody(null), undefined)
  assert.equal(serializeBody(''), undefined)
  assert.equal(serializeBody('   '), undefined)
})

test('shrinkParams：超长参数退化成截断预览，避免撑爆报文', () => {
  const big = { text: 'x'.repeat(3000) }
  const shrunk = shrinkParams(big, 500)
  assert.equal(shrunk.__truncated, true)
  assert.ok(shrunk.preview.length <= 500)

  const small = { a: 1 }
  assert.equal(shrinkParams(small, 500), small)
})
