<script>
/**
 * 全局共享视图状态：跨页面传递「当前选中星期」等少量数据。
 * 蓝河环境非 Node，挂在全局原型上最轻量（官方 global.js 同款做法）。
 */

function getGlobalRef() {
  return Object.getPrototypeOf(global) || global
}

const g = getGlobalRef()

if (!g.__timetableGlobal) {
  g.__timetableGlobal = {
    selectedDay: 0 // 0=未设置(用今天) 1..7=周一..周日
  }
}

export default {
  get: function (key) {
    return g.__timetableGlobal[key]
  },
  set: function (key, val) {
    g.__timetableGlobal[key] = val
  }
}
