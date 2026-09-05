/**
 * BLE 课表导入协议（纯 JS，禁止引入 Feature 模块，保证 Node 可单测）
 *
 * 传输模型（对接规范见 docs/ORBITV-PROTOCOL.md）：
 *  - 手机（orbitV，central）向手表（外设，GATT server）三个特征写入：
 *      控制特征（Write）    : JSON 文本指令 {op:'begin'|'end'|'abort', ...}
 *      数据特征（WriteNoRsp）: UTF-8 JSON 分片字节，按到达顺序拼装
 *      状态特征（Read+Notify）: 手表回执（纯 ASCII JSON，数字错误码）
 *  - 会话：begin 声明总大小 → 依次喂分片 → end 携带整包 CRC16-CCITT 校验 → 通过后进入待确认
 */

import { genId, makeDefaultData, PRESET_SUBJECTS } from './defaults.js'
import { sanitize } from './timetable.js'

export const PROTO_VERSION = 1
export const MAX_PAYLOAD = 64 * 1024

export const BLE_SERVICE_UUID = '8e400001-f2b3-4f5e-9a1c-3d7a9c5b1e01'
export const BLE_CHAR_CONTROL = '8e400002-f2b3-4f5e-9a1c-3d7a9c5b1e01'
export const BLE_CHAR_DATA = '8e400003-f2b3-4f5e-9a1c-3d7a9c5b1e01'
export const BLE_CHAR_STATUS = '8e400004-f2b3-4f5e-9a1c-3d7a9c5b1e01'
export const CCCD_UUID = '00002902-0000-1000-8000-00805f9b34fb'
export const ADV_NAME_PREFIX = 'TTBL'

/** 手表回执错误码（状态特征 JSON 的 code 字段，纯 ASCII 协议） */
export const SYNC_CODE = {
  OK: 0,
  BUSY: 1,
  NO_BEGIN: 2,
  TOO_BIG: 3,
  CRC_MISMATCH: 4,
  FORMAT_INVALID: 5,
  USER_REJECTED: 6,
  IMPORTED: 7,
  PARSE_FAILED: 8
}

/** 科目默认色板（新增科目时按序取色） */
const PALETTE = PRESET_SUBJECTS.map(function (s) { return s.color })

/** CRC16-CCITT（poly 0x1021，初值 0xFFFF），校验 "123456789" 应得 0x29B1 */
export function crc16(bytes) {
  let crc = 0xffff
  for (let i = 0; i < bytes.length; i++) {
    crc ^= bytes[i] << 8
    for (let b = 0; b < 8; b++) {
      if (crc & 0x8000) crc = ((crc << 1) ^ 0x1021) & 0xffff
      else crc = (crc << 1) & 0xffff
    }
  }
  return crc
}

/**
 * UTF-8 字节解码为字符串（引擎 TextDecoder 可用性未证实，自实现保证一致）
 * 非法序列以 U+FFFD 替换，不抛错。
 */
export function decodeUtf8(bytes) {
  let out = ''
  let i = 0
  while (i < bytes.length) {
    const b0 = bytes[i]
    let cp = 0
    let extra = 0
    if (b0 < 0x80) { cp = b0; extra = 0 }
    else if (b0 >= 0xc2 && b0 <= 0xdf) { cp = b0 & 0x1f; extra = 1 }
    else if (b0 >= 0xe0 && b0 <= 0xef) { cp = b0 & 0x0f; extra = 2 }
    else if (b0 >= 0xf0 && b0 <= 0xf4) { cp = b0 & 0x07; extra = 3 }
    else { out += '\uFFFD'; i++; continue }
    let bad = false
    if (i + extra >= bytes.length) bad = true
    else {
      for (let k = 1; k <= extra; k++) {
        const bn = bytes[i + k]
        if ((bn & 0xc0) !== 0x80) { bad = true; break }
        cp = (cp << 6) | (bn & 0x3f)
      }
    }
    if (bad) { out += '\uFFFD'; i++; continue }
    i += extra + 1
    // 代理对区/越界视作非法
    if (cp > 0x10ffff || (cp >= 0xd800 && cp <= 0xdfff)) { out += '\uFFFD'; continue }
    if (cp > 0xffff) {
      cp -= 0x10000
      out += String.fromCharCode(0xd800 + (cp >> 10), 0xdc00 + (cp & 0x3ff))
    } else {
      out += String.fromCharCode(cp)
    }
  }
  return out
}

/** ASCII/UTF-8 字符串编码为字节（状态回执限定 ASCII 内容） */
export function encodeUtf8(text) {
  const out = []
  for (let i = 0; i < text.length; i++) {
    let cp = text.charCodeAt(i)
    if (cp >= 0xd800 && cp <= 0xdbff && i + 1 < text.length) {
      const lo = text.charCodeAt(i + 1)
      if (lo >= 0xdc00 && lo <= 0xdfff) {
        cp = 0x10000 + ((cp - 0xd800) << 10) + (lo - 0xdc00)
        i++
      }
    }
    if (cp < 0x80) out.push(cp)
    else if (cp < 0x800) { out.push(0xc0 | (cp >> 6), 0x80 | (cp & 0x3f)) }
    else if (cp < 0x10000) { out.push(0xe0 | (cp >> 12), 0x80 | ((cp >> 6) & 0x3f), 0x80 | (cp & 0x3f)) }
    else { out.push(0xf0 | (cp >> 18), 0x80 | ((cp >> 12) & 0x3f), 0x80 | ((cp >> 6) & 0x3f), 0x80 | (cp & 0x3f)) }
  }
  return new Uint8Array(out)
}

/**
 * 接收会话状态机：begin → feed* → end
 * feed 只接受字节序列，顺序无关要求由 BLE 链路保证（同连接有序）
 */
export function createSession(maxPayload) {
  const cap = maxPayload || MAX_PAYLOAD
  let receiving = false
  const parts = []
  let size = 0

  return {
    /** @returns {{ok:boolean, code:number}} */
    begin(totalSize) {
      const t = parseInt(totalSize, 10)
      if (isNaN(t) || t <= 0) return { ok: false, code: SYNC_CODE.FORMAT_INVALID }
      if (t > cap) return { ok: false, code: SYNC_CODE.TOO_BIG }
      receiving = true
      parts.length = 0
      size = 0
      return { ok: true, code: SYNC_CODE.OK }
    },

    /** @param {Uint8Array} bytes */
    feed(bytes) {
      if (!receiving) return { ok: false, code: SYNC_CODE.NO_BEGIN }
      if (!bytes || !bytes.length) return { ok: true, code: SYNC_CODE.OK }
      if (size + bytes.length > cap) {
        receiving = false
        parts.length = 0
        size = 0
        return { ok: false, code: SYNC_CODE.TOO_BIG }
      }
      parts.push(bytes)
      size += bytes.length
      return { ok: true, code: SYNC_CODE.OK }
    },

    /** @returns {{ok:boolean, code:number, text?:string, size?:number}} */
    end(crcExpected) {
      if (!receiving) return { ok: false, code: SYNC_CODE.NO_BEGIN }
      receiving = false
      const all = new Uint8Array(size)
      let off = 0
      for (let i = 0; i < parts.length; i++) {
        all.set(parts[i], off)
        off += parts[i].length
      }
      parts.length = 0
      size = 0
      if (!size && !all.length) return { ok: false, code: SYNC_CODE.FORMAT_INVALID }
      const actual = crc16(all)
      if (parseInt(crcExpected, 10) !== actual) return { ok: false, code: SYNC_CODE.CRC_MISMATCH, size: all.length }
      const text = decodeUtf8(all)
      return { ok: true, code: SYNC_CODE.OK, text: text, size: all.length }
    },

    abort() {
      receiving = false
      parts.length = 0
      size = 0
    },

    isReceiving() { return receiving },
    getSize() { return size }
  }
}

/**
 * 解析并校验传输信封
 * @param {string} text
 * @returns {{ok:boolean, code:number, envelope?:Object}}
 */
export function parseEnvelope(text) {
  let obj = null
  try {
    obj = JSON.parse(text)
  } catch (e) {
    return { ok: false, code: SYNC_CODE.PARSE_FAILED }
  }
  if (!obj || typeof obj !== 'object' || Array.isArray(obj)) return { ok: false, code: SYNC_CODE.FORMAT_INVALID }
  if (obj.proto !== PROTO_VERSION) return { ok: false, code: SYNC_CODE.FORMAT_INVALID }
  if (!obj.data || typeof obj.data !== 'object') return { ok: false, code: SYNC_CODE.FORMAT_INVALID }
  return { ok: true, code: SYNC_CODE.OK, envelope: obj }
}

function normTime(hhmm, fallback) {
  if (typeof hhmm === 'string' && /^\d{1,2}:\d{2}$/.test(hhmm.trim())) {
    const p = hhmm.trim().split(':')
    const h = parseInt(p[0], 10)
    const m = parseInt(p[1], 10)
    if (h >= 0 && h <= 23 && m >= 0 && m <= 59) {
      return (h < 10 ? '0' : '') + h + ':' + (m < 10 ? '0' : '') + m
    }
  }
  return fallback
}

/**
 * 合并导入：以导入数据为主覆盖本地，科目/时段支持按名称引用并自动建档
 * @param {Object} envelope parseEnvelope 的 envelope
 * @param {Object} currentData 当前本地数据（仅用于 semesterStart 回退等兜底）
 * @returns {{ok:boolean, code:number, data?:Object, summary?:Object}}
 */
export function mergeImport(envelope, currentData) {
  const raw = envelope.data
  const fallback = currentData || makeDefaultData()

  // 学期起始日：格式合法用导入值，否则沿用本地
  const semesterStart = (typeof raw.semesterStart === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(raw.semesterStart))
    ? raw.semesterStart
    : (typeof fallback.semesterStart === 'string' ? fallback.semesterStart : makeDefaultData().semesterStart)

  // 科目：id 缺失/重复自动生成；颜色缺失按色板补齐；名称去重
  const subjects = []
  const nameToSubject = {}
  const idSet = {}
  const rawSubjects = Array.isArray(raw.subjects) ? raw.subjects : []
  for (let i = 0; i < rawSubjects.length; i++) {
    const s = rawSubjects[i]
    if (!s || typeof s.name !== 'string' || !s.name.trim()) continue
    const name = s.name.trim().slice(0, 8)
    if (nameToSubject[name]) continue
    if (typeof s.id === 'string' && s.id.trim() && idSet[s.id]) continue
    let id = (typeof s.id === 'string' && s.id.trim()) ? s.id.trim() : genId()
    idSet[id] = true
    const color = (typeof s.color === 'string' && /^#[0-9a-fA-F]{6}([0-9a-fA-F]{2})?$/.test(s.color))
      ? s.color
      : PALETTE[subjects.length % PALETTE.length]
    const subj = { id: id, name: name, color: color }
    subjects.push(subj)
    nameToSubject[name] = subj
  }

  // 时段：type 归一化，id 补齐去重；同名时段首个生效
  const periods = []
  const nameToPeriod = {}
  const periodIdSet = {}
  const rawPeriods = Array.isArray(raw.periods) ? raw.periods : []
  for (let i = 0; i < rawPeriods.length; i++) {
    const p = rawPeriods[i]
    if (!p || typeof p.name !== 'string' || !p.name.trim()) continue
    const name = p.name.trim().slice(0, 10)
    if (nameToPeriod[name]) continue
    if (typeof p.id === 'string' && p.id.trim() && periodIdSet[p.id]) continue
    const start = normTime(p.start, null)
    const end = normTime(p.end, null)
    if (!start || !end) continue
    let id = (typeof p.id === 'string' && p.id.trim()) ? p.id.trim() : genId()
    periodIdSet[id] = true
    const type = p.type === 'break' ? 'break' : 'class'
    const period = { id: id, name: name, start: start, end: end, type: type }
    periods.push(period)
    nameToPeriod[name] = period
  }

  // 课程：科目/时段允许按名称引用，未知名称自动建档
  const courses = { '1': [], '2': [], '3': [], '4': [], '5': [], '6': [], '7': [] }
  let courseCount = 0
  const rawCourses = (raw.courses && typeof raw.courses === 'object' && !Array.isArray(raw.courses)) ? raw.courses : {}
  for (let day = 1; day <= 7; day++) {
    const arr = Array.isArray(rawCourses[String(day)]) ? rawCourses[String(day)] : []
    const seen = {}
    for (let i = 0; i < arr.length; i++) {
      const c = arr[i]
      if (!c) continue
      // 科目解析：id 优先，其次名称（不匹配则自动建科目）
      let subj = null
      if (typeof c.subjectId === 'string' && c.subjectId) {
        for (let k = 0; k < subjects.length; k++) if (subjects[k].id === c.subjectId) { subj = subjects[k]; break }
      }
      if (!subj && typeof c.subjectName === 'string' && c.subjectName.trim()) {
        const nm = c.subjectName.trim().slice(0, 8)
        subj = nameToSubject[nm]
        if (!subj) {
          subj = { id: genId(), name: nm, color: PALETTE[subjects.length % PALETTE.length] }
          subjects.push(subj)
          nameToSubject[nm] = subj
        }
      }
      if (!subj) continue
      // 时段解析：id 优先，其次名称（不匹配则自动建 45 分钟时段）
      let period = null
      if (typeof c.periodId === 'string' && c.periodId) {
        for (let k = 0; k < periods.length; k++) if (periods[k].id === c.periodId) { period = periods[k]; break }
      }
      if (!period && typeof c.periodName === 'string' && c.periodName.trim()) {
        const nm = c.periodName.trim().slice(0, 10)
        period = nameToPeriod[nm]
        if (!period) {
          period = { id: genId(), name: nm, start: '08:00', end: '08:45', type: 'class' }
          periods.push(period)
          nameToPeriod[nm] = period
        }
      }
      if (!period) continue
      let weekType = (!c.weekType || c.weekType === 'all' || c.weekType === 'odd' || c.weekType === 'even') ? (c.weekType || 'all') : 'all'
      const dedupeKey = period.id + '|' + weekType
      if (seen[dedupeKey]) continue
      seen[dedupeKey] = true
      courses[String(day)].push({ subjectId: subj.id, periodId: period.id, weekType: weekType })
      courseCount++
    }
  }

  // 倒计时
  const countdowns = []
  const rawCountdowns = Array.isArray(raw.countdowns) ? raw.countdowns : []
  for (let i = 0; i < rawCountdowns.length; i++) {
    const c = rawCountdowns[i]
    if (!c || typeof c.name !== 'string' || !c.name.trim()) continue
    const kind = c.kind === 'holiday' ? 'holiday' : 'exam'
    if (typeof c.date !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(c.date)) continue
    countdowns.push({ id: genId(), kind: kind, name: c.name.trim().slice(0, 10), date: c.date })
  }

  const candidate = {
    version: 1,
    semesterStart: semesterStart,
    subjects: subjects,
    periods: periods,
    courses: courses,
    countdowns: countdowns
  }
  // 空载荷（无任何有效内容）拒绝导入，避免误清空；重置请走设置页显式操作
  if (subjects.length === 0 && periods.length === 0 && courseCount === 0 && countdowns.length === 0) {
    return { ok: false, code: SYNC_CODE.FORMAT_INVALID }
  }
  if (subjects.length > 0 && periods.length === 0) return { ok: false, code: SYNC_CODE.FORMAT_INVALID }

  const summary = {
    semesterStart: semesterStart,
    subjectCount: subjects.length,
    periodCount: periods.length,
    courseCount: courseCount,
    countdownCount: countdowns.length
  }
  return { ok: true, code: SYNC_CODE.OK, data: candidate, summary: summary }
}
