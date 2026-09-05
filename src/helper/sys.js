/**
 * Feature 模块兼容层：真机（BlueOS 文档命名 @blueos.*）与 Studio 模拟器（@system.*）双命名空间。
 * requireFeature 对未知名称返回空对象（不抛错），因此用「功能探测」选择实现。
 * 约束：
 * - 所有 import 必须是字面量（webpack 静态分析），不能抽成公共函数传变量。
 * - require 可能因命名空间缺失直接抛错（真机固件差异），一律 try/catch 后回退另一命名空间。
 */

let storageMod = null
function storage() {
  if (!storageMod) {
    let a = null
    let b = null
    try { a = require('@blueos.storage.storage') } catch (e) { a = null }
    try { b = require('@system.storage') } catch (e) { b = null }
    storageMod = a && typeof a.get === 'function' ? a : b
  }
  return storageMod
}

let fileMod = null
function file() {
  if (!fileMod) {
    let a = null
    let b = null
    try { a = require('@blueos.storage.file') } catch (e) { a = null }
    try { b = require('@system.file') } catch (e) { b = null }
    fileMod = a && typeof a.readText === 'function' ? a : b
  }
  return fileMod
}

let promptMod = null
function prompt() {
  if (!promptMod) {
    let a = null
    let b = null
    try { a = require('@blueos.window.prompt') } catch (e) { a = null }
    try { b = require('@system.prompt') } catch (e) { b = null }
    promptMod = a && typeof a.showToast === 'function' ? a : b
  }
  return promptMod
}

let vibratorMod = null
function vibrator() {
  if (!vibratorMod) {
    let a = null
    let b = null
    try { a = require('@blueos.hardware.vibrator.vibrator') } catch (e) { a = null }
    try { b = require('@system.vibrator') } catch (e) { b = null }
    vibratorMod = a && typeof a.vibrate === 'function' ? a : b
  }
  return vibratorMod
}

let routerMod = null
function router() {
  if (!routerMod) {
    let a = null
    let b = null
    try { a = require('@blueos.app.appmanager.router') } catch (e) { a = null }
    try { b = require('@system.router') } catch (e) { b = null }
    routerMod = a && typeof a.push === 'function' ? a : b
  }
  return routerMod
}

function toast(message, duration) {
  const p = prompt()
  if (p && typeof p.showToast === 'function') {
    p.showToast({ message: message, duration: duration || 0 })
  }
}

function vibrateShort() {
  try {
    const v = vibrator()
    if (v && typeof v.vibrate === 'function') {
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
