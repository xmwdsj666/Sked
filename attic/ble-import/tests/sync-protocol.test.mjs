import test from 'node:test'
import assert from 'node:assert/strict'
import {
  crc16, decodeUtf8, encodeUtf8, createSession, parseEnvelope, mergeImport,
  SYNC_CODE, BLE_SERVICE_UUID, PROTO_VERSION
} from '../src/core/bleproto.js'
import { makeDefaultData } from '../src/core/defaults.js'

test('crc16: 标准校验向量', () => {
  const bytes = new TextEncoder().encode('123456789')
  assert.equal(crc16(bytes).toString(16), '29b1')
})

test('decodeUtf8: 中文与混合内容', () => {
  const src = '{"name":"语文","n":1}'
  const bytes = new TextEncoder().encode(src)
  assert.equal(decodeUtf8(bytes), src)
})

test('decodeUtf8: 四字节 emoji（代理对）', () => {
  const src = '课\u{1F600}表'
  const bytes = new TextEncoder().encode(src)
  assert.equal(decodeUtf8(bytes), src)
})

test('decodeUtf8: 非法字节替换不抛错', () => {
  const bytes = new Uint8Array([0x61, 0xff, 0x62])
  assert.equal(decodeUtf8(bytes), 'a\uFFFD b'.replace(' ', ''))
})

test('encodeUtf8 与 decodeUtf8 互逆', () => {
  const src = '{"姓名":"数学课"}'
  assert.equal(decodeUtf8(encodeUtf8(src)), src)
})

test('session: 完整接收流程', () => {
  const text = '{"hello":"课表数据","n":42}'
  const bytes = new TextEncoder().encode(text)
  const session = createSession()
  assert.equal(session.begin(bytes.length).ok, true)
  // 按 7 字节切片模拟分片
  for (let i = 0; i < bytes.length; i += 7) {
    const r = session.feed(bytes.slice(i, i + 7))
    assert.equal(r.ok, true)
  }
  const r = session.end(crc16(bytes))
  assert.equal(r.ok, true)
  assert.equal(r.text, text)
  assert.equal(r.size, bytes.length)
})

test('session: begin 前喂分片拒绝', () => {
  const s = createSession()
  const r = s.feed(new Uint8Array([1, 2, 3]))
  assert.equal(r.ok, false)
  assert.equal(r.code, SYNC_CODE.NO_BEGIN)
})

test('session: CRC 不符', () => {
  const bytes = new TextEncoder().encode('{"a":1}')
  const s = createSession()
  s.begin(bytes.length)
  s.feed(bytes)
  const r = s.end(0x1234)
  assert.equal(r.ok, false)
  assert.equal(r.code, SYNC_CODE.CRC_MISMATCH)
})

test('session: 超过容量上限', () => {
  const s = createSession(10)
  assert.equal(s.begin(11).code, SYNC_CODE.TOO_BIG)
  const s2 = createSession(10)
  s2.begin(8)
  assert.equal(s2.feed(new Uint8Array(9)).ok, true) // 9 <= 10
  const r = s2.feed(new Uint8Array(2)) // 累计 11 > 10
  assert.equal(r.code, SYNC_CODE.TOO_BIG)
  assert.equal(s2.isReceiving(), false)
})

test('session: abort 重置', () => {
  const s = createSession()
  s.begin(10)
  s.feed(new Uint8Array([1]))
  s.abort()
  assert.equal(s.end(1).code, SYNC_CODE.NO_BEGIN)
})

test('parseEnvelope: 合法信封', () => {
  const env = { proto: PROTO_VERSION, app: 'orbitV', data: { semesterStart: '2026-08-31' } }
  const r = parseEnvelope(JSON.stringify(env))
  assert.equal(r.ok, true)
  assert.equal(r.envelope.app, 'orbitV')
})

test('parseEnvelope: 非法 JSON / 错误协议版本 / 缺 data', () => {
  assert.equal(parseEnvelope('{bad').code, SYNC_CODE.PARSE_FAILED)
  assert.equal(parseEnvelope(JSON.stringify({ proto: 99, data: {} })).ok, false)
  assert.equal(parseEnvelope(JSON.stringify({ proto: 1 })).ok, false)
})

function sampleEnvelope() {
  return {
    proto: PROTO_VERSION,
    app: 'orbitV',
    exportedAt: '2026-09-05T12:00:00+08:00',
    data: {
      semesterStart: '2026-08-31',
      subjects: [
        { id: 'sx01', name: '语文', color: '#FF453A' },
        { name: '数学' },
        { name: '数学' }
      ],
      periods: [
        { id: 'p1', name: '第一节', start: '8:00', end: '8:45' },
        { name: '第二节', start: '08:55', end: '08:40', type: 'class' },
        { id: 'p1', name: '重复时段', start: '09:00', end: '09:45' },
        { name: '午休', start: '12:00', end: '14:00', type: 'break' }
      ],
      courses: {
        '1': [
          { subjectId: 'sx01', periodId: 'p1' },
          { subjectName: '物理', periodName: '第二节' },
          { subjectName: '化学', periodName: '周三加课' },
          { subjectName: '物理', periodName: '第二节' }
        ],
        '3': [{ subjectName: '数学', periodId: 'p1', weekType: 'odd' }],
        '9': [{ subjectName: '幽灵课', periodName: 'x' }]
      },
      countdowns: [
        { kind: 'exam', name: '期中考试', date: '2026-11-05' },
        { kind: 'holiday', name: '元旦', date: '2026-12-31' },
        { kind: 'exam', name: '坏数据', date: '20261105' }
      ]
    }
  }
}

test('mergeImport: 名称引用自动建档 + 归一化 + 汇总', () => {
  const env = parseEnvelope(JSON.stringify(sampleEnvelope())).envelope
  const r = mergeImport(env, makeDefaultData(new Date(2026, 8, 5)))
  assert.equal(r.ok, true)
  const d = r.data
  // 科目：语文+数学+物理+化学（重复数学剔除，幽灵课无科目引用不触发）
  const names = d.subjects.map(s => s.name)
  assert.ok(names.includes('语文') && names.includes('数学') && names.includes('物理') && names.includes('化学'))
  // 时段：第一节(start 归一化 08:00)+第二节+午休；重复 id 的"重复时段"剔除
  assert.equal(d.periods.filter(p => p.name === '第一节')[0].start, '08:00')
  assert.equal(d.periods.filter(p => p.name === '午休')[0].type, 'break')
  assert.equal(d.periods.filter(p => p.name === '重复时段').length, 0)
  // 周一 3 条有效课程（重复物理剔除），周三 1 条单周课
  assert.equal(d.courses['1'].length, 3)
  assert.equal(d.courses['3'].length, 1)
  assert.equal(d.courses['3'][0].weekType, 'odd')
  // 非法键 '9' 不进入
  assert.equal(d.courses['9'], undefined)
  // 倒计时坏日期被过滤
  assert.equal(d.countdowns.length, 2)
  // 汇总
  assert.equal(r.summary.courseCount, 4)
  assert.equal(r.summary.countdownCount, 2)
  assert.equal(r.summary.semesterStart, '2026-08-31')
  // 结构终检：sanitize 后字段齐全
  assert.ok(Array.isArray(d.subjects) && d.subjects.every(s => s.id && s.name && s.color))
})

test('mergeImport: semesterStart 缺失回退本地', () => {
  const env = parseEnvelope(JSON.stringify({
    proto: 1, data: { subjects: [{ name: '自习' }], periods: [{ name: '晚自习', start: '19:00', end: '20:00' }] }
  })).envelope
  const local = makeDefaultData(new Date(2026, 8, 5))
  local.semesterStart = '2026-03-02'
  const r = mergeImport(env, local)
  assert.equal(r.ok, true)
  assert.equal(r.data.semesterStart, '2026-03-02')
  assert.equal(r.data.periods.length, 1)
  // 课程为空也能导入（空课表合法）
  assert.equal(r.summary.courseCount, 0)
})

test('mergeImport: 无时段则拒绝（避免导入废数据）', () => {
  const env = parseEnvelope(JSON.stringify({ proto: 1, data: { subjects: [{ name: 'x' }] } })).envelope
  const r = mergeImport(env, makeDefaultData())
  assert.equal(r.ok, false)
  assert.equal(r.code, SYNC_CODE.FORMAT_INVALID)
})

test('mergeImport: 空载荷拒绝导入（防误清空）', () => {
  const env = parseEnvelope(JSON.stringify({ proto: 1, data: { semesterStart: '2026-09-01' } })).envelope
  const r = mergeImport(env, makeDefaultData())
  assert.equal(r.ok, false)
  assert.equal(r.code, SYNC_CODE.FORMAT_INVALID)
})
