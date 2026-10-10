import { uuid } from '../utils/misc.js'

const UID_KEY = 'uid'
const SESSION_KEY = 'session'
const USER_KEY = 'user'

/**
 * 身份与会话：
 *  - uid：只要这个浏览器不清缓存就不变，用来算「影响多少用户」
 *  - sid：超过 sessionTimeout 没有活动就换新的，用来把一个用户的多次访问切开
 *  - user：业务调用 setUser 之后才有，用来算「影响了哪些具体账号」
 */
export function createIdentity(config, storage) {
  let uid = storage.get(UID_KEY)
  if (!uid) {
    uid = uuid()
    storage.set(UID_KEY, uid)
  }

  const now = Date.now()
  let session = storage.getJSON(SESSION_KEY, { persist: 'session' })
  if (!session || !session.sid || now - (session.lastActive || 0) > config.sessionTimeout) {
    session = { sid: uuid(), start: now, lastActive: now }
  } else {
    session.lastActive = now
  }
  storage.setJSON(SESSION_KEY, session, { persist: 'session' })

  let user = storage.getJSON(USER_KEY)
  let lastTouchWrite = now

  return {
    get uid() {
      return uid
    },
    get sid() {
      return session.sid
    },
    get sessionStart() {
      return session.start
    },
    get user() {
      return user
    },

    setUser(nextUser) {
      if (!nextUser) {
        user = null
        storage.remove(USER_KEY)
        return
      }
      const safe = {}
      for (const key of ['id', 'name', 'email', 'role']) {
        if (nextUser[key] !== undefined && nextUser[key] !== null) safe[key] = String(nextUser[key])
      }
      // id / name 之外的自定义字段也允许带，但统一转成字符串存
      for (const key of Object.keys(nextUser)) {
        if (safe[key] === undefined && nextUser[key] !== undefined) safe[key] = String(nextUser[key])
      }
      user = safe
      storage.setJSON(USER_KEY, safe)
    },

    /** 刷新会话活跃时间（写盘有节流，默认 30 秒最多写一次） */
    touch() {
      const t = Date.now()
      session.lastActive = t
      if (t - lastTouchWrite > 30000) {
        lastTouchWrite = t
        storage.setJSON(SESSION_KEY, session, { persist: 'session' })
      }
    },

    markSessionStart() {
      session.start = Date.now()
      storage.setJSON(SESSION_KEY, session, { persist: 'session' })
    }
  }
}
