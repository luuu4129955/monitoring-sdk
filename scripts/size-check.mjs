/**
 * 体积红线。
 *
 * 监控 SDK 是「每个用户每次访问都要下载」的资源，体积必须像对待首屏 JS 一样抠。
 * 超过红线就退出码非 0，可以直接挂到 CI 上。
 */
import { readFileSync, existsSync } from 'node:fs'
import { gzipSync } from 'node:zlib'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')

/**
 * 单位 KB（gzip 后）。当前实测：三套打包器的压缩产物都在 12.6 ~ 12.8 KB。
 * 留一点余量而不是卡死在实测值上，否则加一个字段就红。
 */
const TARGETS = [
  { file: 'dist/monitor.iife.min.js', label: 'esbuild', budget: 14, required: true },
  { file: 'dist/vite/monitor.iife.js', label: 'vite', budget: 14, required: false },
  { file: 'dist/webpack/monitor.umd.min.js', label: 'webpack', budget: 14, required: false }
]

let failed = false

for (const target of TARGETS) {
  const full = path.join(ROOT, target.file)
  if (!existsSync(full)) {
    if (target.required) {
      console.error(`缺少 ${target.file}，先执行 node scripts/build.mjs`)
      failed = true
    } else {
      console.log(`SKIP  ${target.file.padEnd(34)} 还没构建（pnpm build:${target.label}）`)
    }
    continue
  }
  const size = gzipSync(readFileSync(full)).length / 1024
  const pass = size <= target.budget
  if (!pass) failed = true
  console.log(
    `${pass ? 'PASS' : 'FAIL'}  ${target.file.padEnd(34)} gzip ${size.toFixed(1)} KB / 预算 ${target.budget} KB`
  )
}

process.exit(failed ? 1 : 0)
