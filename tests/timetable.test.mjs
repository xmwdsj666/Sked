import test from 'node:test'
import assert from 'node:assert/strict'
import {
  normalizeToMonday, weekNumberOf, currentPeriod,
  coursesForDay, daysUntil, formatRemain, holidayAt, sanitize
} from '../src/core/timetable.js'
import { makeDefaultData, DATA_VERSION } from '../src/core/defaults.js'

test('normalizeToMonday: 周三归一到本周一', () => {
  const m = normalizeToMonday('2026-09-02') // 周三
  assert.equal(m.getDay(), 1)
  assert.equal(m.toISOString().slice(0, 10) === m.toISOString().slice(0, 10), true)
  const local = m.getFullYear() + '-' + String(m.getMonth() + 1).padStart(2, '0') + '-' + String(m.getDate()).padStart(2, '0')
  assert.equal(local, '2026-08-31')
})

test('normalizeToMonday: 周日归到本周一（周算周一起始）', () => {
  const m = normalizeToMonday('2026-09-06') // 周日
  assert.equal(m.getDay(), 1)
  const local = m.getFullYear() + '-' + String(m.getMonth() + 1).padStart(2, '0') + '-' + String(m.getDate()).padStart(2, '0')
  assert.equal(local, '2026-08-31')
})

test('weekNumberOf: 起始周为第1周', () => {
  const now = new Date(2026, 8, 2) // 2026-09-02 周三
  assert.equal(weekNumberOf('2026-09-01', now), 1)
})

test('weekNumberOf: 跨两周正确', () => {
  const now = new Date(2026, 8, 14) // 2026-09-14
  assert.equal(weekNumberOf('2026-09-01', now), 3)
})

test('weekNumberOf: 开学前返回0', () => {
  const now = new Date(2026, 7, 30) // 2026-08-30
  assert.equal(weekNumberOf('2026-09-01', now), 0)
})

test('weekNumberOf: 周日仍属本周边界', () => {
  assert.equal(weekNumberOf('2026-08-31', new Date(2026, 8, 6)), 1)  // 9-6 周日
  assert.equal(weekNumberOf('2026-08-31', new Date(2026, 8, 7)), 2)  // 9-7 周一
})

test('isOddWeek 移除后 weekNumberOf 仍可用', () => {
  // 单双周功能已删除；此处仅确认周次计算保留
  assert.equal(weekNumberOf('2026-09-01', new Date(2026, 8, 2)), 1)
})

test('currentPeriod: 上课中', () => {
  const periods = [{ id: 'a', name: '一', start: '08:00', end: '08:45', type: 'class' }]
  const r = currentPeriod(periods, new Date(2026, 0, 1, 8, 10, 30))
  assert.equal(r.state, 'in')
  assert.equal(r.period.id, 'a')
  assert.equal(r.remainSec, 35 * 60 - 30) // 08:10:30 -> 08:45
  assert.equal(r.totalSec, 45 * 60)
})

test('currentPeriod: 课间含下节', () => {
  const periods = [
    { id: 'a', name: '一', start: '08:00', end: '08:45', type: 'class' },
    { id: 'b', name: '二', start: '08:55', end: '09:40', type: 'class' }
  ]
  const r = currentPeriod(periods, new Date(2026, 0, 1, 8, 50, 0))
  assert.equal(r.state, 'between')
  assert.equal(r.period.id, 'a')
  assert.equal(r.nextPeriod.id, 'b')
  assert.equal(r.remainSec, 5 * 60)
})

test('currentPeriod: 首课前 before/between', () => {
  const periods = [{ id: 'a', name: '一', start: '08:00', end: '08:45', type: 'class' }]
  const r = currentPeriod(periods, new Date(2026, 0, 1, 7, 30, 0))
  assert.equal(r.state, 'between')
  assert.equal(r.nextPeriod.id, 'a')
})

test('currentPeriod: 全部结束', () => {
  const periods = [{ id: 'a', name: '一', start: '08:00', end: '08:45', type: 'class' }]
  const r = currentPeriod(periods, new Date(2026, 0, 1, 23, 0, 0))
  assert.equal(r.state, 'after')
})

test('currentPeriod: 空时段表', () => {
  const r = currentPeriod([], new Date())
  assert.equal(r.state, 'after')
})

test('currentPeriod: 未排序输入自动排序', () => {
  const periods = [
    { id: 'b', name: '二', start: '10:00', end: '10:45', type: 'class' },
    { id: 'a', name: '一', start: '08:00', end: '08:45', type: 'class' }
  ]
  const r = currentPeriod(periods, new Date(2026, 0, 1, 8, 10, 0))
  assert.equal(r.period.id, 'a')
})

test('coursesForDay: 返回合法条目（不再区分单双周）', () => {
  const courses = {
    '1': [
      { subjectId: 'math', periodId: 'a' },
      { subjectId: 'physics', periodId: 'b', weekType: 'odd' } // 旧数据遗留字段，照样返回
    ]
  }
  assert.equal(coursesForDay(courses, 1).length, 2)
  assert.equal(coursesForDay(courses, 2).length, 0)
})

test('coursesForDay: 脏数据剔除', () => {
  const courses = { '3': [{ subjectId: '', periodId: 'a' }, null, { subjectId: 'x', periodId: 'b' }] }
  assert.equal(coursesForDay(courses, 3).length, 1)
})

test('daysUntil', () => {
  const now = new Date(2026, 8, 5)
  assert.equal(daysUntil('2026-09-05', now), 0)
  assert.equal(daysUntil('2026-09-06', now), 1)
  assert.equal(daysUntil('2026-09-01', now), -4)
})

test('formatRemain', () => {
  assert.equal(formatRemain(0), '00:00')
  assert.equal(formatRemain(65), '01:05')
  assert.equal(formatRemain(3671), '01:01:11')
  assert.equal(formatRemain(-5), '00:00')
})

test('holidayAt: 命中与未命中', () => {
  const cd = [{ kind: 'holiday', name: '国庆', date: '2026-10-01' }]
  assert.equal(holidayAt(cd, new Date(2026, 9, 3)).name, '国庆')
  assert.equal(holidayAt(cd, new Date(2026, 9, 8)), null)
  assert.equal(holidayAt([{ kind: 'exam', name: '月考', date: '2026-10-01' }], new Date(2026, 9, 1)), null)
})

test('sanitize: 正常数据原样保留', () => {
  const d = makeDefaultData(new Date(2026, 8, 5))
  d.courses['1'].push({ subjectId: 'math', periodId: 'p01' })
  d.countdowns.push({ id: 'c1', kind: 'exam', name: '月考', date: '2026-10-01' })
  const r = sanitize(JSON.parse(JSON.stringify(d)), () => makeDefaultData(new Date(2026, 8, 5)))
  assert.equal(r.repaired, false)
  assert.equal(r.data.courses['1'].length, 1)
  assert.equal(r.data.countdowns.length, 1)
})

test('sanitize: 损坏数据修复', () => {
  const r = sanitize({ version: 1, semesterStart: 'bad', subjects: 'x', periods: null, courses: { '1': 'no' }, countdowns: 5 },
    () => makeDefaultData(new Date(2026, 8, 5)))
  assert.equal(r.repaired, true)
  assert.ok(Array.isArray(r.data.subjects) && r.data.subjects.length > 0)
  assert.ok(Array.isArray(r.data.periods) && r.data.periods.length > 0)
  assert.ok(Array.isArray(r.data.courses['1']))
  assert.equal(r.data.version, DATA_VERSION)
})

test('sanitize: null 输入重置', () => {
  const r = sanitize(null, () => makeDefaultData(new Date(2026, 8, 5)))
  assert.equal(r.repaired, true)
  assert.ok(r.data.semesterStart)
})

test('sanitize: 非法课程条目过滤；旧 weekType 字段不致失败', () => {
  const raw = {
    semesterStart: '2026-09-01',
    subjects: [{ id: 'math', name: '数学', color: '#fff' }],
    periods: [{ id: 'a', name: '一', start: '08:00', end: '08:45', type: 'class' }],
    courses: { '1': [{ subjectId: 'math', periodId: 'a', weekType: 'bogus' }] },
    countdowns: [{ kind: 'exam', name: '月考', date: '20261001' }]
  }
  const r = sanitize(raw, () => makeDefaultData(new Date(2026, 8, 5)))
  assert.equal(r.data.courses['1'].length, 1) // weekType 已无意义但条目合法，保留
  assert.equal(r.data.countdowns.length, 0)
  assert.equal(r.repaired, false) // 这些属于过滤而非结构修复（courses 数组本身合法）
})
