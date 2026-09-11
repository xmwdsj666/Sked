/**
 * Feature 模块兼容层：真机（BlueOS 文档命名 @blueos.*）与 Studio 模拟器（@system.*）双命名空间。
 * requireFeature 对未知名称返回空对象（不抛错），因此用「功能探测」选择实现。
 * 所有 import 必须是字面量（webpack 静态分析），不能动态拼字符串。
 */

let storageMod = null
function storage() {
  if (!storageMod) {
    const a = require('@blueos.storage.storage')
    const b = require('@system.storage')
    storageMod = a && typeof a.get === 'function' ? a : b
  }
  return storageMod
}

let fileMod = null
function file() {
  if (!fileMod) {
    const a = require('@blueos.storage.file')
    const b = require('@system.file')
    fileMod = a && typeof a.readText === 'function' ? a : b
  }
  return fileMod
}

let promptMod = null
function prompt() {
  if (!promptMod) {
    const a = require('@blueos.window.prompt')
    const b = require('@system.prompt')
    promptMod = a && typeof a.showToast === 'function' ? a : b
  }
  return promptMod
}

let vibratorMod = null
function vibrator() {
  if (!vibratorMod) {
    const a = require('@blueos.hardware.vibrator.vibrator')
    const b = require('@system.vibrator')
    vibratorMod = a && typeof a.vibrate === 'function' ? a : b
  }
  return vibratorMod
}

let routerMod = null
function router() {
  if (!routerMod) {
    const a = require('@blueos.app.appmanager.router')
    const b = require('@system.router')
    routerMod = a && typeof a.push === 'function' ? a : b
  }
  return routerMod
}

function toast(message, duration) {
  prompt().showToast({ message: message, duration: duration || 0 })
}

function vibrateShort() {
  try {
    const v = vibrator()
    if (typeof v.vibrate === 'function') {
      v.vibrate({ mode: 'short' })
    }
  } catch (e) {
    // 振动失败不影响主流程
  }
}

export default {
  storage: storage,
  file: file,
  prompt: prompt,
  vibrator: vibrator,
  router: router,
  toast: toast,
  vibrateShort: vibrateShort
}
