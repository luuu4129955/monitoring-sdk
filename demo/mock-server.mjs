/**
 * demo 用的本地服务：静态文件 + 一批「故意做坏」的接口。
 *
 * 接口是给接口监控制造素材的：
 *   /api/ok          200 + code 0        → 正常请求（只进面包屑）
 *   /api/slow        延迟 2.5s           → 慢请求
 *   /api/biz-error   200 + code 500      → 业务码失败（需要配 checkBusinessError 才识别）
 *   /api/http-500    500                 → HTTP 层失败
 *   /api/missing     404                 → 接口不存在
 *
 * 用法：node demo/mock-server.mjs [端口]
 */
import http from 'node:http'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const PORT = Number(process.argv[2] || 8399)

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon'
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

const sendJson = (res, status, data) => {
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Access-Control-Allow-Origin': '*'
  })
  res.end(JSON.stringify(data))
}

function serveStatic(pathname, res) {
  let relative = decodeURIComponent(pathname)
  if (relative === '/') relative = '/demo/index.html'
  if (relative.endsWith('/')) relative += 'index.html'

  const filePath = path.join(ROOT, relative)
  // 防目录穿越：解析后的路径必须还在项目目录内
  if (!filePath.startsWith(ROOT)) {
    res.writeHead(403).end('forbidden')
    return
  }
  if (!fs.existsSync(filePath) || !fs.statSync(filePath).isFile()) {
    res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' })
    res.end('404 not found')
    return
  }

  res.writeHead(200, {
    'Content-Type': MIME[path.extname(filePath)] || 'application/octet-stream',
    'Cache-Control': 'no-store'
  })
  fs.createReadStream(filePath).pipe(res)
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://127.0.0.1:${PORT}`)
  const { pathname } = url

  if (req.method === 'OPTIONS') {
    res.writeHead(204, {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Headers': '*',
      'Access-Control-Allow-Methods': 'GET,POST,OPTIONS'
    })
    return res.end()
  }

  if (pathname.startsWith('/api/')) {
    if (pathname === '/api/ok') return sendJson(res, 200, { code: 0, data: { list: [] } })
    if (pathname === '/api/slow') {
      await sleep(Number(url.searchParams.get('ms') || 2500))
      return sendJson(res, 200, { code: 0, data: { slow: true } })
    }
    if (pathname === '/api/biz-error') {
      return sendJson(res, 200, { code: 500, message: '业务码失败：余额不足' })
    }
    if (pathname === '/api/http-500') return sendJson(res, 500, { message: '服务器内部错误' })
    if (pathname === '/api/xhr-ok') return sendJson(res, 200, { code: 0, via: 'xhr' })
    return sendJson(res, 404, { message: '接口不存在' })
  }

  serveStatic(pathname, res)
})

server.listen(PORT, '127.0.0.1', () => {
  console.log(`demo      http://127.0.0.1:${PORT}/`)
  console.log(`esm demo  http://127.0.0.1:${PORT}/demo/esm/`)
  console.log(`静态根目录 ${ROOT}`)
})
