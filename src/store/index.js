/**
 * 数据存取层：主存（localstorage）+ 快照容错（internal://files）
 * 依赖 Feature 模块，只能在页面生命周期内调用（禁止模块加载期）。
 *
 * 可靠性约定（2026-09-05 加固）：
 * - 主存 value 一律 JSON 字符串（官方 set/getSync 支持 Object，但真机固件序列化
 *   行为不一，字符串最稳）；读取时兼容旧的 Object 形态。
 * - storage.set 无同步形态（官方仅 getSync），异步写在应用被立即杀死时可能丢失，
 *   因此写失败必须可见：persist 返回结果，save 失败直接 toast。
 * - file.readText 只有异步形态：快照恢复由 app.ux onCreate 调 primeSnapshot()
 *   预热（启动期回调早已完成），load() 走缓存结果，严禁在 load 内同步等异步回调。
 * - getSync 抛异常（瞬态故障）不等于数据损坏：此时只用内存数据，不重置主存。
 */
import sys from '../helper/sys.js'
import { STORAGE_KEY, SNAPSHOT_URI, DATA_VERSION, makeDefaultData } from '../core/defaults.js'
import { sanitize } from '../core/timetable.js'

let _data = null
let _lastSaved = ''
let _snapText = null
let _snapPrimed = false

/** 测试注入后端（正式代码勿用） */
let _backends = null
export function _setBackends(backends) {
  _backends = backends
}

/** 测试用：清空模块内单例状态（正式代码勿用） */
export function _resetInternal() {
  _data = null
  _lastSaved = ''
  _snapText = null
  _snapPrimed = false
}
function storageApi() {
  return _backends ? _backends.storage : sys.storage()
}
function fileApi() {
  return _backends ? _backends.file : sys.file()
}

/**
 * 应用启动时预热快照（异步 readText 的结果落到 _snapText）。
 * 必须在 app.ux onCreate 里调用一次。
 */
export function primeSnapshot() {
  if (_snapPrimed) return
  _snapPrimed = true
  try {
    fileApi().readText({
      uri: SNAPSHOT_URI,
      success: function (ret) {
        _snapText = ret && typeof ret.text === 'string' ? ret.text : null
      },
      fail: function () {
        _snapText = null
      }
    })
  } catch (e) {
    _snapText = null
  }
}

/**
 * 读取数据（每次进入应用/页面 onInit 时调用一次）
 * 主存损坏时尝试快照恢复并返回提示信息。
 * @returns {{data:Object, notice:string}}
 */
export function load() {
  let raw = null
  let readFailed = false
  try {
    raw = storageApi().getSync({ key: STORAGE_KEY })
  } catch (e) {
    raw = null
    readFailed = true // 瞬态故障：绝不重置主存
  }
  const r = sanitize(deserialize(raw), makeDefaultData)
  if (r.repaired) {
    // 主存缺失/损坏：尝试快照（app 启动时已预热）
    if (typeof _snapText === 'string' && _snapText.length) {
      const rs = sanitize(safeParse(_snapText), makeDefaultData)
      if (!rs.repaired) {
        _data = rs.data
        persist()
        return { data: _data, notice: '数据已从备份恢复' }
      }
    }
    _data = r.data
    if (!readFailed) persist() // 真无数据才写默认值；读失败时不动主存
    return { data: _data, notice: readFailed ? '' : '课表数据已重置' }
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
 * @returns {boolean} 是否写入成功
 */
export function save(data) {
  _data = data
  return persist()
}

/** @returns {boolean} */
function persist() {
  if (!_data) return false
  const json = JSON.stringify(_data)
  let ok = false
  try {
    storageApi().set({
      key: STORAGE_KEY,
      value: json,
      fail: function () {
        sys.toast('保存失败，请重试')
      }
    })
    ok = true
  } catch (e) {
    sys.toast('保存失败，请重试')
  }
  if (json !== _lastSaved) {
    _lastSaved = json
    try {
      fileApi().writeText({ uri: SNAPSHOT_URI, text: json })
    } catch (e) {
      // 快照失败不阻塞
    }
  }
  return ok
}

/** 恢复默认数据（确认后调用） */
export function reset() {
  _data = makeDefaultData()
  persist()
  return _data
}

/** 旧数据兼容：主存可能是对象（历史写入），也可能是字符串（新写入） */
function deserialize(raw) {
  if (typeof raw === 'string' && raw.length) {
    const parsed = safeParse(raw)
    return parsed === null ? raw : parsed
  }
  return raw
}

function safeParse(text) {
  try {
    return JSON.parse(text)
  } catch (e) {
    return null
  }
}

/** 跨页轻提示：编辑页保存/删除后，返回的列表页自绘小横幅替代系统 Toast */
let _notice = ''
export function setNotice(text) {
  _notice = String(text || '')
}
export function takeNotice() {
  const n = _notice
  _notice = ''
  return n
}

/** 数据迁移预留：读出旧版本时在此补齐字段 */
export function migrate(data) {
  if (!data.version) data.version = DATA_VERSION
  return data
}
