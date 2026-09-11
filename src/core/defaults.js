/**
 * 默认数据与预设常量（纯 JS，禁止引入 Feature 模块，保证 Node 可单测）
 */

export const DATA_VERSION = 1
export const STORAGE_KEY = 'timetable_data_v1'
export const SNAPSHOT_URI = 'internal://files/timetable_snapshot.json'

/** 预设科目库（iOS 深色系统色板） */
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

/** 默认作息（典型高中模板，全部可改） */
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

export const PERIOD_NAME_PRESETS = [
  '早读', '第一节', '第二节', '第三节', '第四节', '第五节', '第六节', '第七节', '第八节',
  '大课间', '午休', '晚饭', '晚自习一', '晚自习二', '晚自习三', '自习'
]

export const EXAM_NAME_PRESETS = ['月考', '期中考试', '期末考试', '模拟考', '高考', '学考']
export const HOLIDAY_NAME_PRESETS = ['国庆假期', '元旦假期', '寒假', '暑假', '五一假期', '清明假期']

export const WEEKDAY_ZH = ['周一', '周二', '周三', '周四', '周五', '周六', '周日']
export const WEEKDAY_SHORT = ['一', '二', '三', '四', '五', '六', '日']

/** 自定义科目配色轮换（iOS 深色系统色板扩展） */
export const CUSTOM_COLORS = [
  '#FF453A', '#0A84FF', '#FF9F0A', '#BF5AF2', '#30D158',
  '#64D2FF', '#FFD60A', '#FF6482', '#66D4CF', '#AC8E68'
]

/** 生成唯一 id（本地时钟 + 随机后缀，够用且短） */
export function genId() {
  return Date.now().toString(36) + Math.floor(Math.random() * 46656).toString(36)
}

/**
 * 构造默认数据
 * @param {Date} [now] 便于测试注入
 */
export function makeDefaultData(now) {
  const d = now || new Date()
  const monday = new Date(d.getFullYear(), d.getMonth(), d.getDate())
  monday.setDate(monday.getDate() - ((monday.getDay() + 6) % 7))
  const mm = monday.getMonth() + 1
  const dd = monday.getDate()
  const iso = monday.getFullYear() + '-' + (mm < 10 ? '0' : '') + mm + '-' + (dd < 10 ? '0' : '') + dd
  return {
    version: DATA_VERSION,
    semesterStart: iso,
    subjects: JSON.parse(JSON.stringify(PRESET_SUBJECTS)),
    periods: JSON.parse(JSON.stringify(DEFAULT_PERIODS)),
    courses: { '1': [], '2': [], '3': [], '4': [], '5': [], '6': [], '7': [] },
    countdowns: []
  }
}
