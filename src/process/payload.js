import { PROTOCOL_VERSION } from '../core/version.js'
import { uuid } from '../utils/misc.js'

/**
 * 统一报文结构。
 *
 * 后端只认这一种形状，新增字段一律加在 data 里，
 * 避免「每种事件一条自己的解析分支」。
 */
export function buildPayload({ type, data, context, breadcrumbs }) {
  const payload = {
    v: PROTOCOL_VERSION,
    eventId: uuid(),
    type,
    ts: Date.now(),
    ...context,
    data
  }
  if (breadcrumbs && breadcrumbs.length) payload.breadcrumbs = breadcrumbs
  return payload
}
