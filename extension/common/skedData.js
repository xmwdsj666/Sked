/**
 * 双端共享数据常量（与手表 src/core/defaults.js 人工同步）。
 * 修改任一侧时必须同步另一侧。
 */
export const PRESET_SUBJECTS = [
  { id: 'chinese', name: '语文', color: '#FF453A' },
  { id: 'math', name: '数学', color: '#0A84FF' },
  { id: 'english', name: '英语', color: '#FF9F0A' },
  { id: 'physics', name: '物理', color: '#BF5AF2' },
  { id: 'chemistry', name: '化学', color: '#30D158' },
  { id: 'biology', name: '生物', color: '#66D4CF' },
  { id: 'politics', name: '政治', color: '#FFD60A' },
  { id: 'history', name: '历史', color: '#AC8E68' },
  { id: 'geography', name: '地理', color: '#64D2FF' },
  { id: 'pe', name: '体育', color: '#32D74B' },
  { id: 'reading', name: '早读', color: '#98989D' },
  { id: 'selfstudy', name: '自习', color: '#8E8E93' },
  { id: 'evening', name: '晚自习', color: '#6C6C70' }
]

export const CUSTOM_COLORS = [
  '#FF453A', '#0A84FF', '#FF9F0A', '#BF5AF2', '#30D158',
  '#64D2FF', '#FFD60A', '#FF6482', '#66D4CF', '#AC8E68'
]

export const PERIOD_NAME_PRESETS = [
  '早读', '晨会', '第一节', '第二节', '第三节', '第四节', '第五节', '第六节', '第七节', '第八节', '第九节',
  '早操', '课间操', '眼保健操', '大课间', '早餐', '午餐', '晚饭', '午休', '午自习',
  '自习', '活动课', '班会', '晚自习一', '晚自习二', '晚自习三', '晚休', '熄灯'
]

export const DEFAULT_PERIODS = [
  { id: 'p01', name: '早读', start: '07:20', end: '07:50', type: 'class' },
  { id: 'p02', name: '第一节', start: '08:00', end: '08:45', type: 'class' },
  { id: 'p03', name: '第二节', start: '08:55', end: '09:40', type: 'class' },
  { id: 'p04', name: '大课间', start: '09:40', end: '10:10', type: 'break' },
  { id: 'p05', name: '第三节', start: '10:10', end: '10:55', type: 'class' },
  { id: 'p06', name: '第四节', start: '11:05', end: '11:50', type: 'class' },
  { id: 'p07', name: '午休', start: '11:50', end: '14:00', type: 'break' },
  { id: 'p08', name: '第五节', start: '14:00', end: '14:45', type: 'class' },
  { id: 'p09', name: '第六节', start: '14:55', end: '15:40', type: 'class' },
  { id: 'p10', name: '晚饭', start: '15:40', end: '18:00', type: 'break' },
  { id: 'p11', name: '晚自习一', start: '18:00', end: '18:45', type: 'class' },
  { id: 'p12', name: '晚自习二', start: '18:55', end: '19:40', type: 'class' },
  { id: 'p13', name: '晚自习三', start: '19:50', end: '20:35', type: 'class' }
]

/** 与手表 core/defaults.js genId 同规则：Date36 + rand36 */
export function genId() {
  return Date.now().toString(36) + Math.floor(Math.random() * 46656).toString(36)
}

export const DAY_NAMES = ['周一', '周二', '周三', '周四', '周五', '周六', '周日']

/** 深拷贝（结构化数据，无循环引用） */
export function clone(value) {
  return JSON.parse(JSON.stringify(value))
}

/**
 * 新建一份空白课表（与手表 makeDefaultData 同构，学期起始日=本周一）
 */
export function makeEmptyTimetable() {
  const d = new Date()
  const monday = new Date(d.getFullYear(), d.getMonth(), d.getDate())
  monday.setDate(monday.getDate() - ((monday.getDay() + 6) % 7))
  const mm = monday.getMonth() + 1
  const dd = monday.getDate()
  const iso = monday.getFullYear() + '-' + (mm < 10 ? '0' : '') + mm + '-' + (dd < 10 ? '0' : '') + dd
  return {
    version: 1,
    semesterStart: iso,
    subjects: clone(PRESET_SUBJECTS),
    periods: clone(DEFAULT_PERIODS),
    courses: { '1': [], '2': [], '3': [], '4': [], '5': [], '6': [], '7': [] },
    countdowns: []
  }
}

import { getOrbitV } from './orbitv.js'

export const TIMETABLE_KEY = 'sked.timetable'
export const UPDATED_AT_KEY = 'sked.timetable.updatedAt'

/**
 * 读取手机端课表基准；不存在或结构不符返回 null。
 */
export async function loadBase() {
  const ov = await getOrbitV()
  const raw = await ov.storage.get(TIMETABLE_KEY)
  if (raw && typeof raw === 'object' && Array.isArray(raw.subjects) && Array.isArray(raw.periods)) {
    return raw
  }
  return null
}

/**
 * 保存基准（每次编辑后调用；数据量仅几 KB，storage 定位内）。
 */
export async function saveBase(timetable) {
  const ov = await getOrbitV()
  await ov.storage.set(TIMETABLE_KEY, timetable)
  await ov.storage.set(UPDATED_AT_KEY, new Date().toISOString())
}

/** 展示用更新时间 */
export function formatUpdatedAt(iso) {
  if (!iso) return '从未'
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return '从未'
  const pad = (n) => (n < 10 ? '0' + n : '' + n)
  return (d.getMonth() + 1) + '月' + d.getDate() + '日 ' + pad(d.getHours()) + ':' + pad(d.getMinutes())
}
