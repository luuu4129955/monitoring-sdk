/**
 * 用 Vite 的 library mode 构建（对应待办事项第二条：用 Vite 搭建并打包成独立 SDK）。
 *
 * 输出到 dist/vite/，和 esbuild 的默认产物并存，方便对比两套打包器的结果。
 */
import { spawnSync } from 'node:child_process'
import { locateBin, ROOT } from './toolchain.mjs'

const vite = locateBin('vite')
if (!vite) {
  console.error('找不到 vite。请在本目录执行：pnpm add -D vite')
  process.exit(1)
}

const result = spawnSync(vite, ['build', '--config', 'vite.config.js'], {
  cwd: ROOT,
  stdio: 'inherit'
})

if (result.status !== 0) process.exit(result.status || 1)
console.log('vite 构建完成 → dist/vite/')
