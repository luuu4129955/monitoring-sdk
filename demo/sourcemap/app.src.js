// 这个文件会被压缩成 dist/app.min.js，并生成配套的 .map。
// 页面加载后它会抛一个错误：浏览器给出的堆栈只有 app.min.js:1:xxxx，
// 必须靠 sourcemap 才能还原到下面这几行源码。

function loadOrderDetail(orderId) {
  const raw = JSON.stringify({ orderId: orderId, ok: true })
  return parseOrder(raw)
}

function parseOrder(raw) {
  const data = JSON.parse(raw)
  return renderOrder(data)
}

function renderOrder(data) {
  if (!data.orderId) return ''
  // ↓↓↓ 真实的出错点就在这一行
  const total = data.amount.toFixed(2)
  return total
}

window.__sourcemapDemoRun = function run() {
  setTimeout(function () {
    loadOrderDetail('20260101')
  }, 500)
}

window.__sourcemapDemoRun()
