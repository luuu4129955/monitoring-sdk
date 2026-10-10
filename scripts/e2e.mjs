/**
 * 端到端验证：起「demo + 收集器」，用真实 Chrome 复现固定动作，再核对收到的报文。
 *
 * 直接复用仓库里已有的两个工具，不另造一套：
 *   tools/monitor-collector.mjs      假收集器（原样落盘，不做任何加工）
 *   tools/capture-monitor-events.mjs Playwright 驱动的固定 7 步动作
 *
 * 这样自研 SDK 和 web-see / web-tracing 的实测数据是同口径、可直接对比的。
 *
 * 用法：node scripts/e2e.mjs
 */
import { spawn } from 'node:child_process'
import { existsSync, mkdirSync, readFileSync, rmSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { loadSourceMap, stacksFromReport, symbolicateStack } from './symbolicate.mjs'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const REPO_ROOT = path.resolve(ROOT, '..', '..')
const REPORT_DIR = path.join(REPO_ROOT, 'reports/monitoring-lab')
const REPORT_FILE = path.join(REPORT_DIR, 'monitoring-sdk-report.jsonl')
const DRIVER_FILE = path.join(REPORT_DIR, 'monitoring-sdk-driver.json')
const DRIVER_ESM_FILE = path.join(REPORT_DIR, 'monitoring-sdk-driver-esm.json')
const DRIVER_MAP_FILE = path.join(REPORT_DIR, 'monitoring-sdk-driver-sourcemap.json')
const DEMO_MAP = path.join(ROOT, 'demo/sourcemap/dist/app.min.js.map')
const DEMO_PORT = 8399
const COLLECTOR_PORT = 8398

mkdirSync(REPORT_DIR, { recursive: true })
rmSync(REPORT_FILE, { force: true })

const children = []
const run = (args, options = {}) =>
  spawn(process.execPath, args, { stdio: ['ignore', 'pipe', 'pipe'], ...options })

async function waitFor(url, timeout = 15000) {
  const deadline = Date.now() + timeout
  while (Date.now() < deadline) {
    try {
      await fetch(url)
      return true
    } catch {
      await new Promise((resolve) => setTimeout(resolve, 300))
    }
  }
  return false
}

function stopAll() {
  for (const child of children) {
    try {
      child.kill('SIGKILL')
    } catch {
      /* ignore */
    }
  }
}

/**
 * 用仓库里已有的 Playwright 驱动跑固定 7 步动作。
 *
 * 注：驱动脚本在收尾关页面时会记录一条 driver-error（"Target page ... has been closed"），
 * 那是它自己的收尾竞态，与 SDK 无关，所以这里只要求 7 个动作步骤都跑完。
 */
async function drive(url, outFile, label) {
  console.log(`==> [${label}] 用 Chrome 跑固定动作（访问 / 点击 / 错误 / 404 / 资源失败 / 停留）`)
  const driver = run(
    [
      path.join(REPO_ROOT, 'tools/capture-monitor-events.mjs'),
      url,
      '--stay',
      '6000',
      '--out',
      outFile
    ],
    { stdio: ['ignore', 'inherit', 'inherit'] }
  )
  const code = await new Promise((resolve) => driver.on('exit', resolve))
  if (code !== 0) throw new Error(`浏览器驱动退出码 ${code}`)
}

let exitCode = 0

try {
  const collector = run([path.join(REPO_ROOT, 'tools/monitor-collector.mjs'), String(COLLECTOR_PORT), REPORT_FILE])
  const demo = run([path.join(ROOT, 'demo/mock-server.mjs'), String(DEMO_PORT)])
  children.push(collector, demo)

  collector.stderr.on('data', (chunk) => process.stderr.write(`[collector] ${chunk}`))
  demo.stderr.on('data', (chunk) => process.stderr.write(`[demo] ${chunk}`))

  const [collectorReady, demoReady] = await Promise.all([
    waitFor(`http://127.0.0.1:${COLLECTOR_PORT}/ping`),
    waitFor(`http://127.0.0.1:${DEMO_PORT}/`)
  ])
  if (!collectorReady || !demoReady) throw new Error('服务没起来，检查端口是否被占用')

  // 两个接入方式都要验：script 直引产物，以及 ESM 直接引源码
  await drive(`http://127.0.0.1:${DEMO_PORT}/`, DRIVER_FILE, 'script 直引')
  await drive(`http://127.0.0.1:${DEMO_PORT}/demo/esm/`, DRIVER_ESM_FILE, 'ESM 引源码')

  // 第三页专门验 Source Map：加载压缩产物，让错误堆栈只有 app.min.js:1:xxx
  const buildDemo = await new Promise((resolve) => {
    const child = run([path.join(ROOT, 'scripts/build-demo-sourcemap.mjs')], { stdio: 'inherit' })
    child.on('exit', resolve)
  })
  if (buildDemo !== 0) throw new Error('demo 压缩产物构建失败')
  await drive(`http://127.0.0.1:${DEMO_PORT}/demo/sourcemap/`, DRIVER_MAP_FILE, '压缩产物 + sourcemap')

  // 收集器是同步写盘的，给一点缓冲时间
  await new Promise((resolve) => setTimeout(resolve, 800))

  if (!existsSync(REPORT_FILE)) throw new Error('没有收到任何报文')

  // 过滤掉 byteLength 为 0 的记录：e2e 脚本自己探活时会对收集器发一次空 GET
  const lines = readFileSync(REPORT_FILE, 'utf8')
    .trim()
    .split('\n')
    .filter(Boolean)
    .map((line) => JSON.parse(line))
    .filter((record) => record.byteLength > 0)
  const events = []
  let totalBytes = 0
  let maxBytes = 0

  for (const record of lines) {
    totalBytes += record.byteLength
    maxBytes = Math.max(maxBytes, record.byteLength)
    if (!record.body) continue
    let parsed
    try {
      parsed = JSON.parse(record.body)
    } catch {
      continue
    }
    if (Array.isArray(parsed.batch)) events.push(...parsed.batch)
    else if (parsed.type) events.push(parsed)
  }

  const byType = new Map()
  for (const event of events) byType.set(event.type, (byType.get(event.type) || 0) + 1)

  console.log('\n=== 采集结果 ===')
  console.log(`上报请求数 : ${lines.length}`)
  console.log(`事件条数   : ${events.length}`)
  console.log(`总字节     : ${totalBytes} B`)
  console.log(`单包最大   : ${maxBytes} B`)
  console.log('事件分布   :')
  for (const [type, count] of [...byType].sort((a, b) => b[1] - a[1])) {
    console.log(`  ${type.padEnd(18)} ${count}`)
  }

  const kinds = events.map((event) => `${event.type}:${(event.data && event.data.kind) || ''}`)
  const hasType = (type) => events.some((event) => event.type === type)
  const hasKind = (kind) => kinds.some((item) => item.endsWith(`:${kind}`))
  const appEvents = (name) => events.filter((event) => event.app && event.app.name === name)
  const replayEvents = events.filter((event) => event.type === 'replay')
  const requestEvents = events.filter((event) => event.type === 'request')
  const paramEvent = requestEvents.find((event) => event.data && event.data.params)
  const esmError = appEvents('monitor-demo-esm').find(
    (event) => event.type === 'error' && event.record && event.record.screenId
  )

  // Source Map 还原：把收集到的压缩堆栈还原成源码位置
  let symbolicated = ''
  try {
    const map = loadSourceMap(DEMO_MAP)
    const stacks = stacksFromReport(REPORT_FILE, {
      appName: 'monitor-demo-sourcemap',
      scriptName: 'app.min.js'
    })
    if (stacks.length) {
      symbolicated = symbolicateStack(stacks[0].stack, map, { scriptName: 'app.min.js' })
    }
  } catch (err) {
    console.error('还原失败：', err && err.message)
  }

  const hasParams = () => !!paramEvent
  const paramsRedacted = () =>
    !!(paramEvent && paramEvent.data.params.password === '***' && !JSON.stringify(paramEvent).includes('p@ss'))

  const expectations = [
    ['JS 运行时错误', hasType('error')],
    ['未捕获 Promise', hasType('unhandledrejection')],
    ['资源加载失败', hasType('resource_error')],
    ['接口 404（http 类）', hasKind('http')],
    ['性能指标', hasType('performance')],
    ['PV', hasType('pv')],
    ['没有白屏误报', !hasType('white_screen')],
    ['ESM 直接引源码也采集到错误', appEvents('monitor-demo-esm').some((e) => e.type === 'error')],
    ['ESM 直接引源码也采集到接口错误', appEvents('monitor-demo-esm').some((e) => e.type === 'request')],
    ['出错的请求带上了请求参数', hasParams()],
    ['请求参数里的 password 已脱敏', paramsRedacted()],
    ['录屏切片已上报', replayEvents.length > 0],
    [
      '错误与录屏用 screenId 关联',
      !!(
        esmError &&
        replayEvents.some((event) => event.data && event.data.screenId === esmError.record.screenId)
      )
    ],
    ['压缩堆栈能还原到源码行（app.src.js）', symbolicated.includes('app.src.js')]
  ]

  console.log('\n=== 断言 ===')
  for (const [name, pass] of expectations) {
    console.log(`${pass ? 'PASS' : 'FAIL'}  ${name}`)
    if (!pass) exitCode = 1
  }

  if (symbolicated) {
    console.log('\n=== Source Map 还原结果 ===')
    console.log(symbolicated)
  }

  // 顺手确认脱敏：demo 里有一个带 token 的 500 请求
  const leaked = events.some((event) => JSON.stringify(event).includes('secret-token'))
  console.log(`${leaked ? 'FAIL' : 'PASS'}  URL 里的 token 已脱敏`)
  if (leaked) exitCode = 1

  console.log(`\n原始报文: ${REPORT_FILE}`)
  console.log(`浏览器侧: ${DRIVER_FILE} / ${DRIVER_ESM_FILE}`)
} catch (err) {
  console.error('e2e 失败：', err && err.message)
  exitCode = 1
} finally {
  stopAll()
}

process.exit(exitCode)
