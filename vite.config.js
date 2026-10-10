/**
 * Vite library mode 配置。
 *
 * 刻意不 import 'vite' 的 defineConfig：这个包本身零依赖，
 * 配置文件里一 import 就会要求本目录能解析到 vite。
 * 直接导出普通对象，Vite 同样接受。
 */
export default {
  build: {
    // 不用任何插件：源码是原生 ESM，Vite 开箱就能打包
    target: 'es2018',
    sourcemap: true,
    minify: 'esbuild',
    outDir: 'dist/vite',
    emptyOutDir: true,
    lib: {
      entry: 'src/index.js',
      name: 'PerfMonitor',
      formats: ['es', 'cjs', 'iife'],
      fileName: (format) =>
        ({ es: 'monitor.esm.js', cjs: 'monitor.cjs', iife: 'monitor.iife.js' })[format] ||
        `monitor.${format}.js`
    },
    rollupOptions: {
      // 源码同时有具名导出和默认导出，不显式声明的话 Rollup 会警告
      // 消费者必须用 PerfMonitor.default 才能拿到默认导出。
      // 声明成 named 之后，iife 全局对象上 init / track / getInstance 都是直接可用的。
      output: { exports: 'named' }
    }
  }
}
