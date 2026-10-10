/**
 * 最小可用的 Source Map 还原工具（零依赖，自己解 VLQ）。
 *
 * 为什么必须有这一步：压缩后的堆栈长这样 ——
 *   at app.min.js:1:412
 * 只看这一行，你只知道「出错了」，不知道错在哪个文件的哪一行。
 * 实测第三方 SDK 上报的 fileName 是 ":302"、line 是 30，基本没有定位价值。
 *
 * 用法：
 *   node scripts/symbolicate.mjs --stack "at app.min.js:1:412" --map demo/sourcemap/dist/app.min.js.map
 *   node scripts/symbolicate.mjs --report reports/xxx.jsonl --map demo/sourcemap/dist/app.min.js.map
 */
import { existsSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const REPO_ROOT = path.resolve(ROOT, '..', '..')

/**
 * 相对路径要按三个地方依次找：当前目录 → SDK 目录 → 仓库根目录。
 *
 * 这个顺序是有原因的：文档里的命令既有人从仓库根目录跑
 * （--report reports/... 相对根目录才成立），也有人从 SDK 目录跑
 * （--map demo/... 相对 SDK 目录才成立），两边都得能用。
 */
function resolveFile(input, label = '文件') {
  const rawCandidates = path.isAbsolute(input)
    ? [input]
    : [
        path.resolve(process.cwd(), input),
        path.resolve(ROOT, input),
        path.resolve(REPO_ROOT, input)
      ]
  // 从 SDK 目录跑时，前两个候选是一样的，去重后报错信息更干净
  const candidates = [...new Set(rawCandidates)]
  for (const candidate of candidates) {
    if (existsSync(candidate)) return candidate
  }
  const error = new Error(
    `${label}不存在：${input}\n已依次尝试：\n  ${candidates.join('\n  ')}\n` +
      '提示：先跑一遍实验台生成报文，例如 ./tools/monitoring-lab.sh start monitoring-sdk'
  )
  error.isResolveError = true
  throw error
}

/** 没传 --report 时，去几个常见位置找默认的收集器落盘文件 */
function findDefaultReport() {
  const candidates = [
    path.resolve(process.cwd(), 'reports/monitoring-lab/monitoring-sdk-report.jsonl'),
    path.resolve(ROOT, 'reports/monitoring-lab/monitoring-sdk-report.jsonl'),
    path.resolve(REPO_ROOT, 'reports/monitoring-lab/monitoring-sdk-report.jsonl')
  ]
  return candidates.find((candidate) => existsSync(candidate)) || null
}

const BASE64_CHARS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/'
const CHAR_TO_INT = new Map([...BASE64_CHARS].map((char, index) => [char, index]))

/** Base64 VLQ 解码：sourcemap 的 mappings 字段就是这种编码 */
export function decodeVLQ(input) {
  const values = []
  let shift = 0
  let value = 0
  for (const char of input) {
    const digit = CHAR_TO_INT.get(char)
    if (digit === undefined) continue
    value += (digit & 31) << shift
    if (digit & 32) {
      shift += 5
      continue
    }
    const negative = value & 1
    value >>>= 1
    values.push(negative ? -value : value)
    value = 0
    shift = 0
  }
  return values
}

/** 把 mappings 解析成「每一行有哪些片段」的结构（字段都是相对上一段的增量） */
export function parseMappings(mappings) {
  const lines = []
  let sourceIndex = 0
  let sourceLine = 0
  let sourceColumn = 0
  let nameIndex = 0

  for (const lineText of mappings.split(';')) {
    const segments = []
    let generatedColumn = 0
    if (lineText) {
      for (const segmentText of lineText.split(',')) {
        if (!segmentText) continue
        const fields = decodeVLQ(segmentText)
        generatedColumn += fields[0]
        const segment = { generatedColumn }
        if (fields.length > 1) {
          sourceIndex += fields[1]
          sourceLine += fields[2]
          sourceColumn += fields[3]
          segment.sourceIndex = sourceIndex
          segment.sourceLine = sourceLine
          segment.sourceColumn = sourceColumn
        }
        if (fields.length > 4) {
          nameIndex += fields[4]
          segment.nameIndex = nameIndex
        }
        segments.push(segment)
      }
    }
    lines.push(segments)
  }
  return lines
}

export function loadSourceMap(mapPath) {
  const absolute = resolveFile(mapPath, 'source map')
  const map = JSON.parse(readFileSync(absolute, 'utf8'))
  map.__dir = path.dirname(absolute)
  map.__parsed = parseMappings(map.mappings)
  return map
}

/**
 * 把「压缩后的位置」还原成「源码位置」。
 * line / column 都是从 1 开始（和浏览器堆栈里的口径一致）。
 */
export function originalPositionFor(map, { line, column }) {
  const segments = map.__parsed ? map.__parsed[line - 1] : parseMappings(map.mappings)[line - 1]
  if (!segments || !segments.length) return null

  // 找出最后一个 generatedColumn <= 目标列 的片段
  let matched = null
  for (const segment of segments) {
    if (segment.generatedColumn > column - 1) break
    if (segment.sourceIndex !== undefined) matched = segment
  }
  if (!matched) return null

  const source = map.sources[matched.sourceIndex] || ''
  const sourcePath = source.startsWith('webpack://') || source.startsWith('..')
    ? source
    : path.join(map.__dir || '', source)

  return {
    source: source,
    sourcePath: sourcePath,
    line: matched.sourceLine + 1,
    column: matched.sourceColumn + 1,
    name: matched.nameIndex !== undefined ? map.names && map.names[matched.nameIndex] : undefined,
    content: map.sourcesContent && map.sourcesContent[matched.sourceIndex]
  }
}

/** 从一段堆栈文本里提取「文件:行:列」 */
const FRAME_PATTERN = /([^\s()]+\.js)(?::(\d+))(?::(\d+))?/g

export function findFrames(stack) {
  const frames = []
  const text = String(stack || '')
  let match
  FRAME_PATTERN.lastIndex = 0
  while ((match = FRAME_PATTERN.exec(text))) {
    frames.push({
      file: match[1],
      line: Number(match[2]),
      column: Number(match[3] || 0),
      raw: match[0]
    })
  }
  return frames
}

/** 用一份 map 去还原一段堆栈，返回可读的文本 */
export function symbolicateStack(stack, map, { scriptName } = {}) {
  const target = scriptName || (map.file ? path.basename(map.file) : '')
  const lines = []
  for (const frame of findFrames(stack)) {
    if (target && !frame.file.includes(target)) continue
    const original = originalPositionFor(map, { line: frame.line, column: frame.column || 1 })
    if (!original) {
      lines.push(`  ${frame.raw} → 未找到映射`)
      continue
    }
    const sourceLine = original.content
      ? `\n      ${original.content.split('\n')[original.line - 1]?.trim()}`
      : ''
    lines.push(
      `  ${frame.raw} → ${original.source}:${original.line}:${original.column}` +
        (original.name ? ` (${original.name})` : '') +
        sourceLine
    )
  }
  return lines.join('\n')
}

/** 从收集器的 jsonl 里把所有错误堆栈抠出来 */
export function stacksFromReport(reportPath, { appName, scriptName } = {}) {
  const absolute = resolveFile(reportPath, '收集器报文')
  const out = []
  const seen = new Set()
  for (const line of readFileSync(absolute, 'utf8').trim().split('\n')) {
    if (!line) continue
    let record
    try {
      record = JSON.parse(JSON.parse(line).body || '{}')
    } catch {
      continue
    }
    const list = Array.isArray(record.batch) ? record.batch : [record]
    for (const event of list) {
      if (!event || !event.data) continue
      if (appName && event.app && event.app.name !== appName) continue
      if (event.data.stack && (!scriptName || event.data.stack.includes(scriptName))) {
        // 同一个错误可能被上报多次（比如页面里触发了两次），按堆栈去重
        if (seen.has(event.data.stack)) continue
        seen.add(event.data.stack)
        out.push({ stack: event.data.stack, message: event.data.message, app: event.app })
      }
    }
  }
  return out
}

// ---------------- CLI ----------------
const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)

if (isMain) {
  try {
    const argOf = (name, fallback) => {
      const index = process.argv.indexOf(name)
      return index > -1 ? process.argv[index + 1] : fallback
    }
    const mapPath = argOf('--map')
    if (!mapPath) {
      console.error(
        '用法: node scripts/symbolicate.mjs --map <x.min.js.map> [--report <report.jsonl> | --stack "<stack>"]'
      )
      process.exit(1)
    }
    const map = loadSourceMap(mapPath)
    const scriptName = argOf('--script', map.file ? path.basename(map.file) : '')
    const stackArg = argOf('--stack')
    const reportPath = argOf('--report') || (stackArg ? null : findDefaultReport())

    if (stackArg) {
      console.log(symbolicateStack(stackArg, map, { scriptName }))
    } else if (reportPath) {
      const items = stacksFromReport(reportPath, { appName: argOf('--app'), scriptName })
      console.log(`从 ${reportPath} 里找到 ${items.length} 条相关堆栈\n`)
      for (const item of items) {
        console.log(`[${item.app && item.app.name}] ${item.message}`)
        console.log(symbolicateStack(item.stack, map, { scriptName }) || '  （没有匹配到帧）')
        console.log('')
      }
    } else {
      console.error(
        '没找到可以还原的报文。要么用 --report <jsonl> 指定，要么用 --stack "<stack>" 直接给一段堆栈，\n' +
          '或者先跑 ./tools/monitoring-lab.sh start monitoring-sdk 生成报文。'
      )
      process.exit(1)
    }
  } catch (err) {
    // 路径找不到是最常见的错，就别甩一整段 Node 堆栈了
    console.error(`✗ ${err && err.message ? err.message : err}`)
    process.exit(1)
  }
}
