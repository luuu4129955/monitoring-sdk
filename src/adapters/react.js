/**
 * React 适配器（可选）。
 *
 * 不装也能跑：React 19 会把未捕获的渲染错误重新抛给 window，
 * 内核的 window.onerror 能收到。装它只是为了拿到 componentStack。
 *
 * 这里刻意不 import react：通过参数传进来，避免 SDK 硬绑定某个 React 版本，
 * 也保证「零依赖」这条线不被破坏。
 *
 *   const ErrorBoundary = createErrorBoundary(React, monitor, { fallback: <Oops /> })
 */
export function createErrorBoundary(React, monitor, options = {}) {
  const { fallback = null, onError } = options

  return class MonitorErrorBoundary extends React.Component {
    constructor(props) {
      super(props)
      this.state = { hasError: false }
    }

    static getDerivedStateFromError() {
      return { hasError: true }
    }

    componentDidCatch(error, errorInfo) {
      try {
        monitor.captureError(error, {
          source: 'react',
          componentStack: String((errorInfo && errorInfo.componentStack) || '').slice(0, 2000)
        })
      } catch {
        /* ignore */
      }
      if (typeof onError === 'function') onError(error, errorInfo)
    }

    render() {
      if (this.state.hasError) {
        return typeof fallback === 'function' ? fallback(this.props) : fallback
      }
      return this.props.children
    }
  }
}
