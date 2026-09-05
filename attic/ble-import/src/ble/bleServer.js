/**
 * BLE GATT 服务端（Feature 层）：课表数据接收
 * 生命周期约束（官方文档）：
 *  - 由 app.ux onCreate 初始化（后台逻辑放 app.ux，避免页面销毁影响）
 *  - app.ux onDestroy 必须调 stop() 资源清理
 *  - Feature API 禁止在模块加载期调用——全部在 start() 内触发
 * 模拟器无 BLE 实现（sys.ble() 返回 null），全部操作静默降级。
 */
import sys from '../helper/sys.js'
import {
  BLE_SERVICE_UUID, BLE_CHAR_CONTROL, BLE_CHAR_DATA, BLE_CHAR_STATUS, CCCD_UUID,
  createSession, parseEnvelope, mergeImport, encodeUtf8, decodeUtf8, SYNC_CODE, ADV_NAME_PREFIX
} from '../core/bleproto.js'
import { makeDefaultData } from '../core/defaults.js'

const PROPERTY_READ = 4
const PROPERTY_WRITE = 5
const PROPERTY_WRITE_NO_RESPONSE = 7
const PROPERTY_NOTIFY = 3
const PROPERTY_INDICATE = 2

let gattServer = null
let session = null
let currentDeviceId = ''
let pendingImport = null   // { envelope, text } 待用户确认
let enabled = true
let listeners = []         // 状态回调集合 [{fn}]

function uuidLower(u) { return String(u || '').toLowerCase() }

function notifyStatus(code, message) {
  const payload = encodeUtf8(JSON.stringify({ code: code, message: message || '' }))
  for (let i = 0; i < listeners.length; i++) {
    try { listeners[i].fn({ type: 'status', code: code, message: message }) } catch (e) { /* 回调异常不扩散 */ }
  }
  if (!gattServer || !currentDeviceId) return
  try {
    gattServer.notifyCharacteristicChanged(currentDeviceId, {
      serviceUuid: BLE_SERVICE_UUID,
      characteristicUuid: BLE_CHAR_STATUS,
      characteristicValue: payload.buffer,
      confirm: false
    })
  } catch (e) { /* notify 失败不影响主流程 */ }
}

function finishSession() {
  const r = session.end(session._crc)
  if (!r.ok) {
    notifyStatus(r.code, 'end failed')
    session = createSession()
    return
  }
  const pe = parseEnvelope(r.text)
  if (!pe.ok) {
    notifyStatus(pe.code, 'envelope invalid')
    session = createSession()
    return
  }
  const mi = mergeImport(pe.envelope, null)
  if (!mi.ok) {
    notifyStatus(mi.code, 'merge invalid')
    session = createSession()
    return
  }
  pendingImport = { envelope: pe.envelope, data: mi.data, summary: mi.summary, text: r.text }
  notifyStatus(SYNC_CODE.OK, 'awaiting confirm')
  for (let i = 0; i < listeners.length; i++) {
    try { listeners[i].fn({ type: 'import', summary: mi.summary, envelope: pe.envelope }) } catch (e) { /* 忽略 */ }
  }
}

function handleControlWrite(value) {
  const bytes = new Uint8Array(value)
  let cmd = null
  try {
    cmd = JSON.parse(decodeControlText(bytes))
  } catch (e) {
    notifyStatus(SYNC_CODE.PARSE_FAILED, 'control json')
    return
  }
  if (!cmd || typeof cmd.op !== 'string') {
    notifyStatus(SYNC_CODE.FORMAT_INVALID, 'no op')
    return
  }
  if (cmd.op === 'begin') {
    session = createSession()
    const r = session.begin(cmd.size)
    session._crc = cmd.crc
    notifyStatus(r.ok ? SYNC_CODE.OK : r.code, r.ok ? 'begin ok' : 'begin rejected')
  } else if (cmd.op === 'end') {
    session._crc = cmd.crc
    finishSession()
  } else if (cmd.op === 'abort') {
    session.abort()
    session = createSession()
    notifyStatus(SYNC_CODE.OK, 'aborted')
  } else {
    notifyStatus(SYNC_CODE.FORMAT_INVALID, 'unknown op')
  }
}

/** 控制特征文本：直接 UTF-8 解码（短指令，容错） */
function decodeControlText(bytes) {
  // 复用 bleproto 的 UTF-8 解码
  return decodeUtf8(bytes)
}

export function start() {
  if (!enabled) return { ok: false, reason: 'disabled' }
  const mod = sys.ble()
  if (!mod) return { ok: false, reason: 'ble unsupported' }
  if (gattServer) return { ok: true, reason: 'already running' }

  try {
    gattServer = mod.createGattServer()
  } catch (e) {
    gattServer = null
    return { ok: false, reason: 'create failed' }
  }
  session = createSession()

  try {
    gattServer.addService({
      serviceUuid: BLE_SERVICE_UUID,
      isPrimary: true,
      characteristics: [
        {
          serviceUuid: BLE_SERVICE_UUID,
          characteristicUuid: BLE_CHAR_CONTROL,
          characteristicValue: new Uint8Array([0]).buffer,
          descriptors: [],
          properties: [PROPERTY_WRITE]
        },
        {
          serviceUuid: BLE_SERVICE_UUID,
          characteristicUuid: BLE_CHAR_DATA,
          characteristicValue: new Uint8Array([0]).buffer,
          descriptors: [],
          properties: [PROPERTY_WRITE_NO_RESPONSE]
        },
        {
          serviceUuid: BLE_SERVICE_UUID,
          characteristicUuid: BLE_CHAR_STATUS,
          characteristicValue: new Uint8Array([0]).buffer,
          descriptors: [
            { serviceUuid: BLE_SERVICE_UUID, characteristicUuid: BLE_CHAR_STATUS, descriptorUuid: CCCD_UUID, descriptorValue: new Uint8Array([0, 0]).buffer }
          ],
          properties: [PROPERTY_READ, PROPERTY_NOTIFY, PROPERTY_INDICATE]
        }
      ]
    })
  } catch (e) {
    gattServer = null
    return { ok: false, reason: 'addService failed' }
  }

  try {
    gattServer.subscribeCharacteristicWrite({
      callback: function (req) {
        if (!req) return
        const cu = uuidLower(req.characteristicUuid)
        if (cu === uuidLower(BLE_CHAR_CONTROL)) {
          handleControlWrite(req.value)
        } else if (cu === uuidLower(BLE_CHAR_DATA)) {
          if (!session || !session.isReceiving()) {
            notifyStatus(SYNC_CODE.NO_BEGIN, 'data before begin')
            return
          }
          const r = session.feed(new Uint8Array(req.value))
          notifyStatus(r.ok ? SYNC_CODE.OK : r.code, r.ok ? 'chunk ok' : 'chunk rejected')
        }
      },
      fail: function (data, code) { /* 写订阅失败仅记录 */ }
    })
  } catch (e) { /* 订阅异常不阻断广播 */ }

  try {
    gattServer.subscribeConnectStateChange({
      callback: function (st) {
        if (st && st.state === 2) {
          currentDeviceId = st.deviceId
          session = createSession()
          emit({ type: 'connected', deviceId: st.deviceId })
        } else if (st && st.state === 0) {
          currentDeviceId = ''
          session = createSession()
          emit({ type: 'disconnected' })
          restartAdvertising()
        }
      },
      fail: function () { /* 忽略 */ }
    })
  } catch (e) { /* 忽略 */ }

  startAdvertising()
  return { ok: true, reason: 'started' }
}

function startAdvertising() {
  if (!gattServer) return
  try {
    gattServer.startAdvertising(
      { interval: 400, txPower: -7, connectable: true },
      { serviceUuids: [BLE_SERVICE_UUID], manufactureData: [], serviceData: [] },
      { serviceUuids: [], manufactureData: [{ manufactureId: 'TTBL', manufactureValue: encodeUtf8(ADV_NAME_PREFIX).buffer }], serviceData: [] }
    )
    emit({ type: 'advertising' })
  } catch (e) { /* 广播失败由上层状态展示 */ }
}

function restartAdvertising() {
  // 断连后重新广播，等待下一次导入
  setTimeout(function () { startAdvertising() }, 500)
}

function emit(evt) {
  for (let i = 0; i < listeners.length; i++) {
    try { listeners[i].fn(evt) } catch (e) { /* 忽略 */ }
  }
}

export function stop() {
  if (!gattServer) return
  try {
    gattServer.stopAdvertising()
  } catch (e) { /* 忽略 */ }
  try {
    gattServer.removeService(BLE_SERVICE_UUID)
  } catch (e) { /* 忽略 */ }
  try {
    gattServer.close()
  } catch (e) { /* 忽略 */ }
  gattServer = null
  session = null
  currentDeviceId = ''
  emit({ type: 'stopped' })
}

export function subscribe(fn) {
  const l = { fn: fn }
  listeners.push(l)
  return function () {
    const i = listeners.indexOf(l)
    if (i >= 0) listeners.splice(i, 1)
  }
}

/** 用户在确认页选择「应用」 */
export function confirmImport() {
  if (!pendingImport) return { ok: false }
  const d = pendingImport
  pendingImport = null
  notifyStatus(SYNC_CODE.IMPORTED, 'applied')
  return { ok: true, data: d.data, summary: d.summary, envelope: d.envelope }
}

/** 用户在确认页选择「忽略」 */
export function rejectImport() {
  pendingImport = null
  notifyStatus(SYNC_CODE.USER_REJECTED, 'rejected')
}

export function getPending() {
  return pendingImport
}

export function isEnabled() {
  return enabled
}

export function setEnabled(v) {
  enabled = !!v
  if (enabled) return start()
  stop()
  return { ok: true, reason: enabled ? 'started' : 'stopped' }
}

export function getStatus() {
  return {
    supported: !!sys.ble(),
    running: !!gattServer,
    connected: !!currentDeviceId,
    enabled: enabled,
    hasPending: !!pendingImport
  }
}
