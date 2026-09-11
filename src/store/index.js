/**
 * 数据存取层：主存（localstorage）+ 快照容错（internal://files）
 * 依赖 Feature 模块，只能在页面生命周期内调用（禁止模块加载期）。
 * 设计：getSync 同步读保证打开即可用；写走异步 set + onHide 时落盘快照。
 */
import sys from '../helper/sys.js'
import { STORAGE_KEY, SNAPSHOT_URI, DATA_VERSION, makeDefaultData } from '../core/defaults.js'
import { sanitize } from '../core/timetable.js'

let _data = null
let _lastSaved = ''

/**
 * 读取数据（每次进入应用/页面 onInit 时调用一次）
 * 主存损坏时尝试快照恢复并返回提示信息。
 * @returns {{data:Object, notice:string}}
 */
export function load() {
  let raw = null
  try {
    raw = sys.storage().getSync({ key: STORAGE_KEY })
  } catch (e) {
    raw = null
  }
  const r = sanitize(raw, makeDefaultData)
  if (r.repaired) {
    // 主存缺失/损坏：尝试快照
    let snapRaw = null
    try {
      sys.file().readText({
        uri: SNAPSHOT_URI,
        success: function (ret) {
          try {
            snapRaw = JSON.parse(ret.text)
          } catch (e) {
            snapRaw = null
          }
        }
      })
    } catch (e) {
      snapRaw = null
    }
    if (snapRaw) {
      const rs = sanitize(snapRaw, makeDefaultData)
      if (!rs.repaired) {
        _data = rs.data
        persist()
        return { data: _data, notice: '数据已从备份恢复' }
      }
    }
    _data = r.data
    persist()
    return { data: _data, notice: '课表数据已重置' }
  }
  _data = r.data
  return { data: _data, notice: '' }
}

/** 当前内存中的数据（必须先 load） */
export function getData() {
  if (!_data) load()
  return _data
}

/**
 * 保存：主存立即写；内容变化时同时更新快照。
 * @param {Object} data
 */
export function save(data) {
  _data = data
  persist()
}

function persist() {
  if (!_data) return
  const json = JSON.stringify(_data)
  try {
    sys.storage().set({ key: STORAGE_KEY, value: _data })
  } catch (e) {
    // 存储失败由调用方 toast 提示
  }
  if (json !== _lastSaved) {
    _lastSaved = json
    try {
      sys.file().writeText({ uri: SNAPSHOT_URI, text: json })
    } catch (e) {
      // 快照失败不阻塞
    }
  }
}

/** 恢复默认数据（确认后调用） */
export function reset() {
  _data = makeDefaultData()
  persist()
  return _data
}

/** 数据迁移预留：读出旧版本时在此补齐字段 */
export function migrate(data) {
  if (!data.version) data.version = DATA_VERSION
  return data
}
