/**
 * 课表核心纯函数（纯 JS，禁止引入 Feature 模块，保证 Node 可单测）
 * 时间一律用本地时区；日期字符串格式 YYYY-MM-DD；时分格式 HH:mm
 */

/**
 * 归一化学期起始日为其所在周的周一
 * @param {string} dateStr YYYY-MM-DD
 * @returns {Date} 周一 00:00 本地时间
 */
export function normalizeToMonday(dateStr) {
  const parts = String(dateStr || '').split('-')
  const y = parseInt(parts[0], 10)
  const mo = parseInt(parts[1], 10) - 1
  const d = parseInt(parts[2], 10)
  const date = new Date(y, mo, d)
  const offset = (date.getDay() + 6) % 7
  date.setDate(date.getDate() - offset)
  date.setHours(0, 0, 0, 0)
  return date
}

/**
 * 计算给定日期是学期第几周（起始日所在周为第 1 周）；开学前返回 0
 * @param {string} semesterStart YYYY-MM-DD
 * @param {Date} date
 * @returns {number}
 */
export function weekNumberOf(semesterStart, date) {
  const start = normalizeToMonday(semesterStart)
  const cur = new Date(date.getFullYear(), date.getMonth(), date.getDate())
  const msPerWeek = 7 * 24 * 3600 * 1000
  const diff = Math.floor((cur.getTime() - start.getTime()) / msPerWeek)
  return diff < 0 ? 0 : diff + 1
}

/**
 * 取某天的课程（按时段顺序返回，仅保留结构合法的条目）
 * @param {Object} courses {'1'..'7': [{subjectId, periodId}]}
 * @param {number} day 1=周一 ... 7=周日
 * @returns {Array}
 */
export function coursesForDay(courses, day) {
  const list = (courses && courses[String(day)]) || []
  return list.filter(function (c) {
    return c && c.subjectId && c.periodId
  })
}

/**
 * 当前处于哪个时段
 * @param {Array<{id,name,start,end,type}>} periods
 * @param {Date} now
 * @returns {{state:'before'|'in'|'between'|'after', period?, nextPeriod?, remainSec, totalSec}}
 *   before: 全部课程未开始；in: 正在上课/时段中；between: 课间；after: 全部结束
 *   in 态：remainSec=距本时段结束秒数，totalSec=本时段总秒数
 *   between 态：remainSec=距下一时段开始秒数
 */
export function currentPeriod(periods, now) {
  const sorted = (periods || []).slice().sort((a, b) => (a.start < b.start ? -1 : 1))
  const nowMin = now.getHours() * 60 + now.getMinutes()
  const toMin = function (hm) {
    const p = String(hm || '00:00').split(':')
    return parseInt(p[0], 10) * 60 + parseInt(p[1], 10)
  }
  if (!sorted.length) {
    return { state: 'after', period: null, nextPeriod: null, remainSec: 0, totalSec: 0 }
  }
  for (let i = 0; i < sorted.length; i++) {
    const p = sorted[i]
    const s = toMin(p.start)
    const e = toMin(p.end)
    if (nowMin >= s && nowMin < e) {
      return {
        state: 'in',
        period: p,
        nextPeriod: sorted[i + 1] || null,
        remainSec: (e - nowMin) * 60 - now.getSeconds(),
        totalSec: (e - s) * 60
      }
    }
    if (nowMin < s) {
      return {
        state: 'between',
        period: sorted[i - 1] || null,
        nextPeriod: p,
        remainSec: (s - nowMin) * 60 - now.getSeconds(),
        totalSec: 0
      }
    }
  }
  return { state: 'after', period: sorted[sorted.length - 1], nextPeriod: null, remainSec: 0, totalSec: 0 }
}

/** 距目标日期的天数（今天=0，明天=1；只按日历日差） */
export function daysUntil(dateStr, now) {
  const parts = String(dateStr || '').split('-')
  const target = new Date(parseInt(parts[0], 10), parseInt(parts[1], 10) - 1, parseInt(parts[2], 10))
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  const msPerDay = 24 * 3600 * 1000
  return Math.round((target.getTime() - today.getTime()) / msPerDay)
}

/**
 * 秒数格式化为 HH:MM:SS 或 MM:SS（超过 1 小时用前者）
 */
export function formatRemain(sec) {
  sec = Math.max(0, Math.floor(sec))
  const h = Math.floor(sec / 3600)
  const m = Math.floor((sec % 3600) / 60)
  const ss = sec % 60
  const pad = function (n) { return n < 10 ? '0' + n : '' + n }
  if (h > 0) return pad(h) + ':' + pad(m) + ':' + pad(ss)
  return pad(m) + ':' + pad(ss)
}

/**
 * 判断给定日期是否落在某个假期条目区间（countdowns 中 kind='holiday' 的 date 表示假期第一天，
 * 视为其后 7 天为假期；单日假期即当天。这里采用简化模型：假期 date 当天起 7 天）
 * @param {Array<{kind,name,date}>} countdowns
 * @param {Date} date
 * @returns {{name}|null}
 */
export function holidayAt(countdowns, date) {
  const list = countdowns || []
  for (let i = 0; i < list.length; i++) {
    const c = list[i]
    if (c.kind !== 'holiday' || !c.date) continue
    const parts = String(c.date).split('-')
    const start = new Date(parseInt(parts[0], 10), parseInt(parts[1], 10) - 1, parseInt(parts[2], 10))
    const end = new Date(start.getTime() + 7 * 24 * 3600 * 1000)
    if (date >= start && date < end) return c
  }
  return null
}

/**
 * 深度校验并修复数据结构（读取容错的核心）
 * @param {*} raw 任意读出的数据
 * @param {Function} makeDefault 默认数据工厂
 * @returns {{data: Object, repaired: boolean}}
 */
export function sanitize(raw, makeDefault) {
  const def = makeDefault()
  if (!raw || typeof raw !== 'object') return { data: def, repaired: true }
  const out = def
  let repaired = false
  if (typeof raw.semesterStart === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(raw.semesterStart)) {
    out.semesterStart = raw.semesterStart
  } else {
    repaired = true
  }
  if (Array.isArray(raw.subjects) && raw.subjects.length) {
    out.subjects = raw.subjects.filter(function (s) {
      return s && typeof s.id === 'string' && typeof s.name === 'string'
    })
    if (!out.subjects.length) out.subjects = def.subjects
  } else {
    repaired = true
  }
  if (Array.isArray(raw.periods)) {
    out.periods = raw.periods.filter(function (p) {
      return p && typeof p.id === 'string' && typeof p.name === 'string' &&
        /^\d{2}:\d{2}$/.test(p.start) && /^\d{2}:\d{2}$/.test(p.end)
    })
    if (!out.periods.length) out.periods = def.periods
  } else {
    repaired = true
  }
  const courses = {}
  if (raw.courses && typeof raw.courses === 'object') {
    for (let d = 1; d <= 7; d++) {
      const arr = raw.courses[String(d)]
      if (Array.isArray(arr)) {
        courses[String(d)] = arr.filter(function (c) {
          return c && typeof c.subjectId === 'string' && typeof c.periodId === 'string'
        })
      } else {
        courses[String(d)] = []
        if (arr !== undefined) repaired = true
      }
    }
  } else {
    repaired = true
  }
  out.courses = courses
  if (Array.isArray(raw.countdowns)) {
    out.countdowns = raw.countdowns.filter(function (c) {
      return c && typeof c.name === 'string' && (c.kind === 'exam' || c.kind === 'holiday') &&
        /^\d{4}-\d{2}-\d{2}$/.test(c.date || '')
    })
  } else {
    repaired = true
  }
  return { data: out, repaired: repaired }
}
