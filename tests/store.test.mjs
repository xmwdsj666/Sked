import test from 'node:test'
import assert from 'node:assert/strict'
import { load, save, getData, reset, primeSnapshot, _setBackends, _resetInternal } from '../src/store/index.js'

/** 构造可注入的 fake 存储后端（模拟真机 getSync/set/readText/writeText 语义） */
function makeBackends() {
  const kv = new Map()
  const files = new Map()
  return {
    kv,
    files,
    storage: {
      getSync({ key }) {
        if (!kv.has(key)) return '' // 官方语义：缺失返回空字符串
        return kv.get(key)
      },
      set({ key, value, fail }) {
        kv.set(key, value)
      },
      clear() {
        kv.clear()
      }
    },
    file: {
      readText({ uri, success, fail }) {
        // 异步回调语义：延迟到下一个 tick，模拟真机
        setTimeout(function () {
          if (files.has(uri)) success({ text: files.get(uri) })
          else fail({ code: 301 })
        }, 0)
      },
      writeText({ uri, text }) {
        files.set(uri, text)
      }
    }
  }
}

const SAMPLE = {
  version: 1,
  semesterStart: '2026-08-31',
  subjects: [{ id: 'math', name: '数学', color: '#0A84FF' }],
  periods: [{ id: 'p01', name: '早读', start: '07:20', end: '07:50', type: 'class' }],
  courses: { '1': [{ subjectId: 'math', periodId: 'p01' }] },
  countdowns: []
}

test('store: 保存 → 重载往返（字符串化主存）', async () => {
  const b = makeBackends()
  _resetInternal()
  _setBackends(b)
  reset()
  const st = getData()
  st.courses['2'] = [{ subjectId: 'math', periodId: 'p01' }]
  assert.equal(save(st), true)

  // 主存里是 JSON 字符串（真机序列化差异防御）
  assert.equal(typeof b.kv.get('timetable_data_v1'), 'string')

  // 模拟应用重启：重新 load
  const r = load()
  assert.equal(r.notice, '')
  assert.deepEqual(getData().courses['2'], [{ subjectId: 'math', periodId: 'p01' }])
})

test('store: 主存为空 + 快照有效 → 从备份恢复（异步预热语义）', async () => {
  const b = makeBackends()
  b.files.set('internal://files/timetable_snapshot.json', JSON.stringify(SAMPLE))
  _resetInternal()
  _setBackends(b)
  // 预热：readText 是异步回调，等待完成
  primeSnapshot()
  await new Promise(function (r2) { setTimeout(r2, 5) })

  const r = load()
  assert.equal(r.notice, '数据已从备份恢复')
  assert.equal(getData().semesterStart, '2026-08-31')
  // 恢复后回写主存
  assert.equal(typeof b.kv.get('timetable_data_v1'), 'string')
})

test('store: getSync 抛异常（瞬态故障）→ 不重置主存', async () => {
  const b = makeBackends()
  b.kv.set('timetable_data_v1', JSON.stringify(SAMPLE))
  let broken = false
  b.storage.getSync = function () {
    if (broken) throw new Error('transient')
    return JSON.stringify(SAMPLE)
  }
  _resetInternal()
  _setBackends(b)
  load()
  // 注入新课程并保存
  const st = getData()
  st.courses['3'] = [{ subjectId: 'math', periodId: 'p01' }]
  save(st)

  // 瞬态故障发生
  broken = true
  const r = load()
  assert.equal(r.notice, '') // 不提示重置
  // 主存未被默认数据覆盖
  assert.equal(typeof b.kv.get('timetable_data_v1'), 'string')
  assert.ok(b.kv.get('timetable_data_v1').includes('"3"'))
})

test('store: 主存损坏 JSON → 快照缺失 → 重置为默认', async () => {
  const b = makeBackends()
  b.kv.set('timetable_data_v1', '{broken json')
  _resetInternal()
  _setBackends(b)
  const r = load()
  assert.equal(r.notice, '课表数据已重置')
  assert.ok(getData().periods.length > 0)
  // 重置结果已回写主存
  assert.ok(b.kv.get('timetable_data_v1').includes('semesterStart'))
})

test('store: 兼容旧对象形态主存（历史版本写入）', async () => {
  const b = makeBackends()
  b.kv.set('timetable_data_v1', SAMPLE) // 直接放对象（旧行为）
  _resetInternal()
  _setBackends(b)
  const r = load()
  assert.equal(r.notice, '')
  assert.equal(getData().semesterStart, '2026-08-31')
})
