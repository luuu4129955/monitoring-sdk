/* 场景按钮：每一个都对应一种监控能力，点一下就能在收集器里看到报文 */
(function () {
  // 惰性取实例：脚本直接引入时，SDK 在上一行 script 里同步初始化，
  // 但业务脚本在解析期就可能被点击，所以每次用的时候再取一次最稳。
  function getMonitor() {
    return window.PerfMonitor && window.PerfMonitor.getInstance
      ? window.PerfMonitor.getInstance()
      : null
  }
  var log = document.getElementById('log')

  function print(text) {
    log.textContent = '[' + new Date().toLocaleTimeString() + '] ' + text + '\n' + log.textContent
  }

  function on(id, handler) {
    var el = document.getElementById(id)
    if (el) el.addEventListener('click', handler)
  }

  on('btn-ok', function () {
    fetch('/api/ok?id=1')
      .then(function () { print('正常请求完成（只进面包屑，不上报）') })
      .catch(function () {})
  })

  on('btn-404', function () {
    fetch('/api/missing?id=1').catch(function () {})
    print('发起 404 请求')
  })

  on('btn-slow', function () {
    fetch('/api/slow?ms=2500').catch(function () {})
    print('发起慢请求（2.5s）')
  })

  on('btn-biz', function () {
    fetch('/api/biz-error')
      .then(function (res) { return res.json() })
      .then(function () { print('业务码失败已返回') })
      .catch(function () {})
  })

  on('btn-500', function () {
    fetch('/api/http-500?traceId=abc&token=secret-token').catch(function () {})
    print('发起 500 请求（URL 里带了 token，看脱敏是否生效）')
  })

  on('btn-xhr', function () {
    var xhr = new XMLHttpRequest()
    xhr.open('GET', '/api/xhr-ok')
    xhr.onload = function () { print('XHR 正常完成') }
    xhr.onerror = function () { print('XHR 失败') }
    xhr.send()
  })

  on('btn-post', function () {
    // 带请求体的 POST 且必然失败：用来验证「接口报错时上报传入参数」
    fetch('/api/http-500', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ orderId: '20260101', amount: 199, password: 'p@ss' })
    }).catch(function () {})
    print('发起带请求体的 POST（会返回 500）')
  })

  on('btn-error', function () {
    setTimeout(function () {
      throw new Error('demo-sync-error')
    }, 0)
    print('已抛出同步错误')
  })

  on('btn-reject', function () {
    Promise.reject(new Error('demo-unhandled-rejection'))
    print('已抛出未捕获 Promise')
  })

  on('btn-missing-img', function () {
    var img = new Image()
    img.src = '/not-exist.png?' + Date.now()
    document.body.appendChild(img)
    print('已插入不存在的图片')
  })

  on('btn-try-catch', function () {
    var monitor = getMonitor()
    try {
      JSON.parse('{ 这不是 JSON }')
    } catch (err) {
      if (monitor) monitor.captureError(err, { scene: 'demo-try-catch' })
    }
    print('try/catch 里手动上报了一条错误')
  })

  on('btn-track', function () {
    var monitor = getMonitor()
    if (monitor) monitor.track('demo_custom_event', { from: 'button', value: Math.random() })
    print('自定义埋点已上报')
  })

  on('btn-route', function () {
    var next = history.state && history.state.page === 'b' ? 'a' : 'b'
    history.pushState({ page: next }, '', '/demo/index.html?page=' + next)
    print('路由已切换到 page=' + next + '（会产生一条 pv 上报）')
  })

  on('btn-user', function () {
    var monitor = getMonitor()
    if (monitor) monitor.setUser({ id: 'u_10086', name: '演示用户' })
    print('已绑定用户，之后所有报文都会带上它')
  })

  on('btn-flush', function () {
    var monitor = getMonitor()
    if (monitor) {
      monitor.flush().then(function () { print('已强制上报队列中的报文') })
    }
  })

  var ready = getMonitor()
  if (ready) {
    print('SDK 已就绪：' + ready.config.appName + ' → ' + ready.config.transport.url)
  } else {
    print('没有拿到 monitor 实例，检查 dist/monitor.iife.js 是否构建过')
  }

  // 页面加载后自动发一次「带敏感参数 + 500」的请求。
  // 这样即使没人点按钮，也能稳定验证两件事：接口错误会上报、URL 里的 token 会被脱敏。
  fetch('/api/http-500?token=secret-token&page=1&orderNo=20260101').catch(function () {})

  // 自动发一个「带请求体且失败」的 POST：这样没人点按钮也能验证参数上报与脱敏
  fetch('/api/http-500', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ orderId: '20260101', amount: 199, password: 'p@ss' })
  }).catch(function () {})
})()
