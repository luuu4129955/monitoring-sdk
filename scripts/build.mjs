/**
 * 构建脚本：产出 esm / cjs / iife 三种形态。
 *
 * 故意写得很朴素：不引入 rollup 那一整套配置，
 * 因为 SDK 只有一个入口、零依赖，esbuild 一次调用就够了。
 *
 * esbuild 的定位顺序（重要）：
 *  1. 本包 node_modules（正式安装依赖时走这条）
 *  2. 本仓库其它项目 .pnpm 里已有的副本（离线也能构建，不用联网）
 */
import { createRequire } from 'node:module'
import { existsSync, readdirSync, mkdirSync, readFileSync } from 'node:fs'
import { gzipSync } from 'node:zlib'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const require = createRequire(import.meta.url)
const pkg = JSON.parse(readFileSync(path.join(ROOT, 'package.json'), 'utf8'))

function locateEsbuild() {
  const candidates = []
  try {
    candidates.push(require.resolve('esbuild'))
  } catch {
    /* 本包还没装依赖，继续找仓库里的副本 */
  }

  const projectsDir = path.resolve(ROOT, '..')
  try {
    for (const project of readdirSync(projectsDir)) {
      const pnpmDir = path.join(projectsDir, project, 'node_modules', '.pnpm')
      if (!existsSync(pnpmDir)) continue
      for (const entry of readdirSync(pnpmDir)) {
        if (!entry.startsWith('esbuild@')) continue
        const dir = path.join(pnpmDir, entry, 'node_modules', 'esbuild')
        if (existsSync(path.join(dir, 'package.json'))) candidates.push(dir)
      }
    }
  } catch {
    /* ignore */
  }

  for (const candidate of candidates) {
    try {
      return require(candidate)
    } catch {
      /* 换下一个候选 */
    }
  }
  return null
}

const esbuild = locateEsbuild()
if (!esbuild) {
  console.error('找不到 esbuild。请在本目录执行：pnpm add -D esbuild')
  process.exit(1)
}

const outdir = path.join(ROOT, 'dist')
mkdirSync(outdir, { recursive: true })

const entry = path.join(ROOT, 'src/index.js')
const banner = `/*! ${pkg.name} v${pkg.version} | 零依赖前端监控 SDK | MIT */`

const targets = [
  { format: 'esm', outfile: 'monitor.esm.js', platform: 'neutral' },
  { format: 'cjs', outfile: 'monitor.cjs', platform: 'neutral' },
  { format: 'iife', outfile: 'monitor.iife.js', platform: 'browser', globalName: 'PerfMonitor' },
  {
    format: 'iife',
    outfile: 'monitor.iife.min.js',
    platform: 'browser',
    globalName: 'PerfMonitor',
    minify: true
  }
]

for (const target of targets) {
  await esbuild.build({
    entryPoints: [entry],
    outfile: path.join(outdir, target.outfile),
    bundle: true,
    format: target.format,
    globalName: target.globalName,
    platform: target.platform,
    target: 'es2018',
    minify: !!target.minify,
    // 生成独立 .map：错误堆栈要靠它才能还原到源码位置（见 scripts/symbolicate.mjs）
    sourcemap: true,
    legalComments: 'none',
    banner: { js: banner }
  })
}

console.log(`esbuild ${esbuild.version} → dist/`)
for (const target of targets) {
  const file = path.join(outdir, target.outfile)
  const raw = readFileSync(file)
  const gzip = gzipSync(raw).length
  console.log(
    `  ${target.outfile.padEnd(22)} ${(raw.length / 1024).toFixed(1).padStart(6)} KB` +
      `  gzip ${(gzip / 1024).toFixed(1).padStart(5)} KB`
  )
}
