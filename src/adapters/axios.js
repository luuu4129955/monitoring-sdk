/**
 * axios 适配器（可选）。
 *
 * 职责划分（这点很重要，否则会和内核重复上报）：
 *   - 网络层失败（断网、超时、4xx/5xx）：内核劫持 XHR 时已经抓到了，适配器不再报。
 *   - 业务码失败（HTTP 200 但 code != 0）：内核看不到响应体，只有适配器能补上。
 *   - 请求参数：内核只知道 URL 和 method，适配器能拿到 config.data。
 *
 *   setupAxios(axiosInstance, monitor, {
 *     checkBusinessError: (data) => data && data.code !== 0
 *   })
 */
export function setupAxios(axiosInstance, monitor, options = {}) {
  if (!axiosInstance || !axiosInstance.interceptors) return () => {}

  const { checkBusinessError } = options

  const onRequest = (config) => {
    if (config && typeof config === 'object') config.__monitorStart = Date.now()
    return config
  }

  const onResponse = (response) => {
    try {
      const config = (response && response.config) || {}
      const startedAt = Number(config.__monitorStart) || Date.now()
      const duration = Date.now() - startedAt
      const url = String(config.url || '')
      const method = String(config.method || 'GET').toUpperCase()
      const status = (response && response.status) || 0

      if (typeof checkBusinessError === 'function') {
        const verdict = checkBusinessError(response && response.data, response)
        if (verdict) {
          monitor.report(
            'request',
            {
              kind: 'business',
              url,
              method,
              status,
              duration,
              message: typeof verdict === 'string' ? verdict : '业务码判定失败',
              params: config.params,
              requestBody: config.data
            },
            {
              sampleKey: 'request',
              dedupKey: `request:${method}:${url}:${status}:business`,
              dedupWindow: Number(monitor.config.request.dedupeWindow ?? 1000)
            }
          )
        }
      }
    } catch {
      /* ignore */
    }
    return response
  }

  const onError = (error) => {
    // 只补面包屑，不上报：网络层失败已经由内核的 XHR 劫持处理
    try {
      const config = (error && error.config) || {}
      monitor.addBreadcrumb({
        type: 'axios_error',
        method: String(config.method || '').toUpperCase(),
        url: String(config.url || ''),
        status: Number((error && error.response && error.response.status) || 0),
        message: String((error && error.message) || '')
      })
    } catch {
      /* ignore */
    }
    return Promise.reject(error)
  }

  const requestInterceptor = axiosInstance.interceptors.request.use(onRequest, (error) =>
    Promise.reject(error)
  )
  const responseInterceptor = axiosInstance.interceptors.response.use(onResponse, onError)

  return function unwrap() {
    try {
      axiosInstance.interceptors.request.eject(requestInterceptor)
      axiosInstance.interceptors.response.eject(responseInterceptor)
    } catch {
      /* ignore */
    }
  }
}
