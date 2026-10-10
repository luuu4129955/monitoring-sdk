/** 极简事件总线：插件之间只通过事件解耦，互相不 import。 */
export class EventBus {
  constructor() {
    this.map = new Map()
  }

  on(name, handler) {
    if (typeof handler !== 'function') return () => {}
    if (!this.map.has(name)) this.map.set(name, new Set())
    this.map.get(name).add(handler)
    return () => this.off(name, handler)
  }

  off(name, handler) {
    const set = this.map.get(name)
    if (!set) return
    set.delete(handler)
    if (!set.size) this.map.delete(name)
  }

  emit(name, payload) {
    const set = this.map.get(name)
    if (!set) return
    // 复制一份再遍历：回调里 off 自己不会导致遍历错乱
    for (const handler of [...set]) {
      try {
        handler(payload)
      } catch {
        /* 单个订阅者出错不影响其他订阅者与主流程 */
      }
    }
  }

  clear() {
    this.map.clear()
  }
}
