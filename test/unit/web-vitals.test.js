import test from 'node:test'
import assert from 'node:assert/strict'

import { computeCLS } from '../../src/plugins/performance/web-vitals.js'

const close = (actual, expected) => assert.ok(Math.abs(actual - expected) < 1e-9, `${actual} != ${expected}`)

test('CLS：1 秒内连续偏移算同一个会话窗口', () => {
  close(
    computeCLS([
      { startTime: 100, value: 0.1, hadRecentInput: false },
      { startTime: 600, value: 0.1, hadRecentInput: false }
    ]),
    0.2
  )
})

test('CLS：用户输入后的偏移不计入', () => {
  close(
    computeCLS([
      { startTime: 100, value: 0.1, hadRecentInput: false },
      { startTime: 600, value: 0.9, hadRecentInput: true }
    ]),
    0.1
  )
})

test('CLS：窗口之间取最大值而不是总和', () => {
  close(
    computeCLS([
      { startTime: 0, value: 0.3, hadRecentInput: false },
      { startTime: 6000, value: 0.2, hadRecentInput: false }
    ]),
    0.3
  )
})

test('CLS：超过 5 秒的窗口会断开', () => {
  close(
    computeCLS([
      { startTime: 0, value: 0.2, hadRecentInput: false },
      { startTime: 900, value: 0.2, hadRecentInput: false },
      { startTime: 5100, value: 0.2, hadRecentInput: false }
    ]),
    0.4
  )
})

test('CLS：空数组返回 0', () => {
  close(computeCLS([]), 0)
})
