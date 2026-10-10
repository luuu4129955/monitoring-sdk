/**
 * 用 Webpack 构建（对应待办事项第二条的另一半）。
 *
 * 输出 UMD + sourcemap 到 dist/webpack/。
 */
import { spawnSync } from 'node:child_process'
import { locateBin, ROOT } from './toolchain.mjs'

const webpack = locateBin('webpack')
if (!webpack) {
  console.error('找不到 webpack。请在本目录执行：pnpm add -D webpack webpack-cli')
  process.exit(1)
}

const result = spawnSync(webpack, ['--config', 'webpack.config.js'], {
  cwd: ROOT,
  stdio: 'inherit'
})

if (result.status !== 0) process.exit(result.status || 1)
console.log('webpack 构建完成 → dist/webpack/')
