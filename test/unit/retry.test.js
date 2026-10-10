import test from 'node:test'
import assert from 'node:assert/strict'

import { createRetryQueue } from '../../src/transport/retry.js'
import { mergeConfig } from '../../src/core/config.js'

const noopLogger = { debug: () => {}, warn: () => {}, log: () => {}, error: () => {} }

function createFakeStorage() {
  const data = new Map()
  return {
    getJSON(key) {
      return data.has(key) ? JSON.parse(data.get(key)) : null
    },
    setJSON(key, value) {
      data.set(key, JSON.stringify(value))
    },
    raw: data
  }
}

const makeQueue = (extra = {}) => {
  const storage = createFakeStorage()
  const config = mergeConfig({
    dsn: 'https://collector/report',
    transport: { retryMax: 3, retryTTL: 1000, ...extra }
  })
  return { queue: createRetryQueue(config, storage, noopLogger), storage }
}

test('push / size / drain 基本行为', () => {
  const { queue } = makeQueue()
  queue.push({ type: 'a' }, { type: 'b' })
  assert.equal(queue.size(), 2)

  let sent = null
  queue.drain((list) => {
    sent = list
  })
  assert.deepEqual(sent, [{ type: 'a' }, { type: 'b' }])
  assert.equal(queue.size(), 0)
})

test('超过 retryMax 时丢最旧的', () => {
  const { queue } = makeQueue()
  queue.push({ type: '1' }, { type: '2' }, { type: '3' }, { type: '4' })
  let sent = null
  queue.drain((list) => {
    sent = list
  })
  assert.deepEqual(
    sent.map((item) => item.type),
    ['2', '3', '4']
  )
})

test('超过 TTL 的缓存会被丢弃，不再补发', () => {
  const { queue, storage } = makeQueue()
  const now = Date.now()
  // 直接写一条 2 小时前的缓存（TTL 是 1 秒）
  storage.setJSON('retry', [
    { t: now - 2 * 60 * 60 * 1000, p: { type: 'stale' } },
    { t: now, p: { type: 'fresh' } }
  ])

  let sent = null
  queue.drain((list) => {
    sent = list
  })
  assert.deepEqual(
    sent.map((item) => item.type),
    ['fresh']
  )
})

test('兼容没有时间戳的老格式缓存', () => {
  const { queue, storage } = makeQueue()
  storage.setJSON('retry', [{ type: 'legacy' }])
  let sent = null
  queue.drain((list) => {
    sent = list
  })
  assert.deepEqual(
    sent.map((item) => item.type),
    ['legacy']
  )
})

test('retryMax 为 0 时完全不缓存', () => {
  const { queue } = makeQueue({ retryMax: 0 })
  queue.push({ type: 'a' })
  assert.equal(queue.size(), 0)
})
