/**
 * 把 demo/sourcemap/app.src.js 压缩成 dist/app.min.js 并生成 sourcemap。
 *
 * 这一步模拟的就是真实项目的构建产物：
 * 上线的是压缩文件 + 一份 .map，出问题时靠 .map 把堆栈还原回源码。
 */
import path from 'node:path'
import { mkdirSync, readdirSync, existsSync } from 'node:fs'
import { createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const require = createRequire(import.meta.url)

function locateEsbuild() {
  try {
    return require(require.resolve('esbuild'))
  } catch {
    /* 继续找仓库里的副本 */
  }
  const projectsDir = path.resolve(ROOT, '..')
  try {
    for (const project of readdirSync(projectsDir)) {
      const pnpmDir = path.join(projectsDir, project, 'node_modules', '.pnpm')
      if (!existsSync(pnpmDir)) continue
      for (const entry of readdirSync(pnpmDir)) {
        if (!entry.startsWith('esbuild@')) continue
        const dir = path.join(pnpmDir, entry, 'node_modules', 'esbuild')
        if (!existsSync(path.join(dir, 'package.json'))) continue
        try {
          return require(dir)
        } catch {
          /* 换下一个 */
        }
      }
    }
  } catch {
    /* ignore */
  }
  return null
}

const esbuild = locateEsbuild()
if (!esbuild) {
  console.error('找不到 esbuild')
  process.exit(1)
}

const outdir = path.join(ROOT, 'demo/sourcemap/dist')
mkdirSync(outdir, { recursive: true })

await esbuild.build({
  entryPoints: [path.join(ROOT, 'demo/sourcemap/app.src.js')],
  outfile: path.join(outdir, 'app.min.js'),
  bundle: true,
  minify: true,
  format: 'iife',
  target: 'es2018',
  sourcemap: true
})

console.log('demo 压缩产物已生成 → demo/sourcemap/dist/app.min.js(.map)')
