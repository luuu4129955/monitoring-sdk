/**
 * 在「本包没装依赖」的情况下找到可用的构建工具。
 *
 * 本仓库的其它项目（bundler-lab、shadcn-admin …）已经装好了 Vite / Webpack / esbuild，
 * 这里直接复用它们的可执行文件，好处是：读源码、改代码、重新构建都不需要联网。
 * 正式把它当独立包发布时，走正常的 devDependencies 即可，这个定位逻辑会自动命中本包的 node_modules。
 */
import { existsSync, readdirSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')

export function locateBin(name) {
  const candidates = [path.join(ROOT, 'node_modules', '.bin', name)]
  const projectsDir = path.resolve(ROOT, '..')
  try {
    for (const project of readdirSync(projectsDir)) {
      candidates.push(path.join(projectsDir, project, 'node_modules', '.bin', name))
    }
  } catch {
    /* ignore */
  }
  return candidates.find((candidate) => existsSync(candidate)) || null
}
