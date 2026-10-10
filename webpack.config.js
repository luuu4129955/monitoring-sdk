/**
 * Webpack 配置：打包成 UMD + sourcemap。
 *
 * 与 Vite 那套的分工：Vite 出三种形态（es / cjs / iife），
 * Webpack 出一个 UMD（既能 <script> 直引，也能被 CommonJS require）。
 */
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const dir = path.dirname(fileURLToPath(import.meta.url))

export default {
  mode: 'production',
  // source-map 而不是 eval：只有独立 .map 文件才能被后端的还原工具消费
  devtool: 'source-map',
  entry: path.join(dir, 'src/index.js'),
  output: {
    path: path.join(dir, 'dist/webpack'),
    filename: 'monitor.umd.min.js',
    library: { name: 'PerfMonitor', type: 'umd' },
    globalObject: 'this',
    clean: true
  },
  performance: {
    // 监控 SDK 天生就是「一个文件」，不该因为体积提示而报错
    hints: false
  }
}
