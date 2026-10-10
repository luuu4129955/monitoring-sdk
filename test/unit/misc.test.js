import test from 'node:test'
import assert from 'node:assert/strict'

import { deepMerge, safeStringify, toRegExps, matchAny, truncate } from '../../src/utils/misc.js'

test('deepMerge：嵌套对象递归合并，数组整体覆盖', () => {
  const result = deepMerge({ a: { b: 1, c: 2 }, list: [1, 2] }, { a: { c: 3 }, list: [9] })
  assert.deepEqual(result, { a: { b: 1, c: 3 }, list: [9] })
})

test('deepMerge：undefined 不会覆盖已有值', () => {
  const result = deepMerge({ a: 1 }, { a: undefined })
  assert.equal(result.a, 1)
})

test('deepMerge：不修改原对象', () => {
  const base = { a: { b: 1 } }
  deepMerge(base, { a: { b: 2 } })
  assert.equal(base.a.b, 1)
})

test('safeStringify：循环引用不会抛错', () => {
  const obj = { name: 'x' }
  obj.self = obj
  const text = safeStringify(obj)
  assert.ok(text.includes('Circular'))
})

test('safeStringify：BigInt 不会抛错', () => {
  assert.ok(safeStringify({ big: 1n }).includes('1'))
})

test('toRegExps：字符串按字面量转义，正则原样保留', () => {
  const patterns = toRegExps(['/a.b', /^https/])
  assert.equal(patterns.length, 2)
  assert.equal(patterns[0].test('/a.b'), true)
  // 字面量里的 . 不应该变成通配符
  assert.equal(patterns[0].test('/axb'), false)
  assert.equal(patterns[1].test('https://a.com'), true)
})

test('matchAny：空列表一律不匹配', () => {
  assert.equal(matchAny('anything', []), false)
})

test('truncate：超长时截断并标注长度', () => {
  const result = truncate('abcdef', 3)
  assert.ok(result.startsWith('abc'))
  assert.ok(result.includes('truncated'))
})
