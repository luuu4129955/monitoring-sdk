/**
 * SDK 自身信息与上报协议版本。
 *
 * PROTOCOL_VERSION 必须随「报文结构变化」递增，不要随功能变化递增：
 * 后端要靠它决定怎么解析老数据。
 */
export const SDK_NAME = '@perf/monitor'
export const SDK_VERSION = '0.1.0'
export const PROTOCOL_VERSION = 1
