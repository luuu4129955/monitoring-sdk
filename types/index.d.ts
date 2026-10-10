/**
 * 手写类型声明（源码是纯 JS，不引入 TS 编译链，但 TS 项目 import 时要有提示）。
 */

export interface RequestRecord {
  kind: 'ok' | 'slow' | 'network' | 'http' | 'business' | 'abort'
  url: string
  method: string
  status: number
  duration: number
  ok: boolean
  reason?: string
  message?: string
  response?: string
}

export interface MonitorConfig {
  dsn?: string
  appName?: string
  appVersion?: string
  env?: string
  debug?: boolean
  enabled?: boolean
  storagePrefix?: string
  sessionTimeout?: number
  maxBreadcrumbs?: number
  sampling?: Partial<{
    error: number
    request: number
    performance: number
    behavior: number
    pv: number
    whiteScreen: number
    custom: number
  }>
  attachBreadcrumbTo?: string[]
  sanitize?: Partial<{
    enabled: boolean
    maxDepth: number
    maxArrayLength: number
    maxStringLength: number
    sensitiveKeys: string[]
    whitelistKeys: string[]
  }>
  beforeSend?: ((payload: Record<string, unknown>) => Record<string, unknown> | false | null) | null
  error?: Partial<{
    js: boolean
    resource: boolean
    console: boolean
    ignoreErrors: (string | RegExp)[]
    dedupeWindow: number
    maxStackLength: number
  }>
  request?: Partial<{
    fetch: boolean
    xhr: boolean
    ignoreUrls: (string | RegExp)[]
    ignoreMethods: string[]
    slowThreshold: number
    checkBusinessError:
      | ((responseData: unknown, meta: { url: string; method: string; status: number }) => boolean | string | { isError: boolean; message?: string })
      | null
    reportSuccess: boolean
    reportSlow: boolean
    reportParams: boolean | 'error'
    maxBodyLength: number
    dedupeWindow: number
  }>
  performance?: Partial<{
    initialDelay: number
    reportResource: boolean
    resourceTopN: number
    longTaskThreshold: number
  }>
  behavior?: Partial<{
    pv: boolean
    route: boolean
    click: boolean
    reportClick: boolean
  }>
  whiteScreen?: Partial<{
    enabled: boolean
    container: string
    delay: number
    samplePoints: number
    blankThreshold: number
  }>
  record?: Partial<{
    enabled: boolean
    strategy: 'onError' | 'always'
    sampleRate: number
    maxEvents: number
    flushLimit: number
    flushInterval: number
    maskAllInputs: boolean
    blockClass: string
    ignoreClass: string
  }>
  transport?: Partial<{
    url: string
    batchSize: number
    flushInterval: number
    maxQueue: number
    timeout: number
    retryMax: number
    retryTTL: number
    headers: Record<string, string>
  }>
}

export type Priority = 'high' | 'normal' | 'low'

export interface ReportOptions {
  sampleKey?: string
  force?: boolean
  dedupKey?: string
  dedupWindow?: number
  /** high = 不采样 + 立即发送（支付这类核心链路用） */
  priority?: Priority
}

export interface MonitorPlugin {
  name?: string
  setup(ctx: {
    config: Required<MonitorConfig>
    report: (
      type: string,
      data: Record<string, unknown>,
      options?: ReportOptions
    ) => Record<string, unknown> | null
    breadcrumb: { push(item: Record<string, unknown>): void; getList(): unknown[] }
    monitor: Monitor
  }): void
}

export declare class Monitor {
  readonly config: Required<MonitorConfig>
  use(plugin: MonitorPlugin): this
  start(): this
  report(
    type: string,
    data: Record<string, unknown>,
    options?: ReportOptions
  ): Record<string, unknown> | null
  track(name: string, data?: Record<string, unknown>, options?: ReportOptions): Record<string, unknown> | null
  captureError(error: unknown, extra?: Record<string, unknown>, options?: ReportOptions): void
  setUser(user: Record<string, unknown> | null): this
  addBreadcrumb(item: Record<string, unknown>): this
  addContextProvider(provider: () => Record<string, unknown>): this
  getPlugin(name: string): Record<string, unknown> | null
  getContext(): Record<string, unknown>
  flush(options?: { sync?: boolean }): Promise<unknown>
  destroy(): this
}

export declare const defaultPlugins: MonitorPlugin[]
export declare const SDK_NAME: string
export declare const SDK_VERSION: string

export declare function init(options?: MonitorConfig, plugins?: MonitorPlugin[]): Monitor
export declare function createMonitor(options?: MonitorConfig, plugins?: MonitorPlugin[]): Monitor
export declare function getInstance(): Monitor | null
export declare function track(name: string, data?: Record<string, unknown>): Record<string, unknown> | null
export declare function captureError(error: unknown, extra?: Record<string, unknown>): void
export declare function createRecordPlugin(options: {
  rrweb?: unknown
  options?: Record<string, unknown>
}): MonitorPlugin
export declare function setUser(user: Record<string, unknown> | null): void
export declare function flush(options?: { sync?: boolean }): Promise<unknown> | null
export declare function destroy(): void

declare const _default: {
  init: typeof init
  createMonitor: typeof createMonitor
  getInstance: typeof getInstance
  track: typeof track
  captureError: typeof captureError
  setUser: typeof setUser
  flush: typeof flush
  destroy: typeof destroy
  defaultPlugins: MonitorPlugin[]
  version: string
}
export default _default
