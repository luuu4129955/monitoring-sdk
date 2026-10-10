import test from 'node:test'
import assert from 'node:assert/strict'

import { createDeduper } from '../../src/process/dedup.js'

test('时间窗内重复的 key 会被判为重复', () => {
  const dedup = createDeduper()
  assert.equal(dedup.isDuplicate('same', 1000), false)
  assert.equal(dedup.isDuplicate('same', 1000), true)
  assert.equal(dedup.isDuplicate('other', 1000), false)
})

test('窗口传 0 表示不去重', () => {
  const dedup = createDeduper()
  assert.equal(dedup.isDuplicate('k', 0), false)
  assert.equal(dedup.isDuplicate('k', 0), false)
})

test('Infinity 表示本次会话只报一次（白屏检测就靠它）', () => {
  const dedup = createDeduper()
  assert.equal(dedup.isDuplicate('whiteScreen:/order', Infinity), false)
  assert.equal(dedup.isDuplicate('whiteScreen:/order', Infinity), true)
  assert.equal(dedup.isDuplicate('whiteScreen:/detail', Infinity), false)
})

test('reset 之后可以重新放行', () => {
  const dedup = createDeduper()
  dedup.isDuplicate('k', Infinity)
  assert.equal(dedup.isDuplicate('k', Infinity), true)
  dedup.reset('k')
  assert.equal(dedup.isDuplicate('k', Infinity), false)
})

test('空 key 一律放行，避免误伤没有去重键的事件', () => {
  const dedup = createDeduper()
  assert.equal(dedup.isDuplicate('', 1000), false)
  assert.equal(dedup.isDuplicate(undefined, 1000), false)
})
