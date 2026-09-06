<template>
  <k-page>
    <k-block-header>
      时段是一天的骨架（早读、第一节、午休…），课表按时段排课。开始需早于结束，且不跨午夜。
    </k-block-header>

    <k-block-title>时段列表（{{ periods.length }}）</k-block-title>
    <k-block strong inset>
      <div v-if="!periods.length" class="py-2 text-sm text-black/55 dark:text-white/55">
        还没有时段，从下方预设快速添加。
      </div>
      <div
        v-for="(p, idx) in periods"
        :key="p.id"
        class="border-b border-black/5 last:border-0 dark:border-white/10"
      >
        <button class="flex w-full items-center gap-3 py-3 text-left" @click="toggleEdit(p.id)">
          <span
            class="h-2.5 w-2.5 shrink-0 rounded-full"
            :class="p.type === 'class' ? 'bg-blue-500' : 'bg-black/25 dark:bg-white/30'"
          />
          <span class="w-28 shrink-0 truncate text-base font-medium">{{ p.name }}</span>
          <span class="flex-1 text-sm text-black/55 dark:text-white/55">{{ p.start }}–{{ p.end }}</span>
          <span class="text-sm text-black/40 dark:text-white/40">{{ expanded === p.id ? '收起' : '编辑' }}</span>
        </button>

        <div v-if="expanded === p.id" class="pb-4">
          <k-list inset strong>
            <k-list-input
              label="名称"
              :value="draft.name"
              placeholder="时段名称"
              @input="draft.name = $event.target.value"
            />
            <k-list-item
              label
              title="开始"
            >
              <template #after>
                <input
                  v-model="draft.start"
                  type="time"
                  class="rounded-md bg-black/5 px-2 py-1 text-base dark:bg-white/10"
                />
              </template>
            </k-list-item>
            <k-list-item
              label
              title="结束"
            >
              <template #after>
                <input
                  v-model="draft.end"
                  type="time"
                  class="rounded-md bg-black/5 px-2 py-1 text-base dark:bg-white/10"
                />
              </template>
            </k-list-item>
          </k-list>
          <div class="mt-2 flex gap-2 px-2">
            <button
              class="flex-1 rounded-lg py-2 text-sm font-medium"
              :class="draft.type === 'class'
                ? 'bg-blue-500 text-white'
                : 'bg-black/5 text-black/60 dark:bg-white/10 dark:text-white/60'"
              @click="draft.type = 'class'"
            >
              课程
            </button>
            <button
              class="flex-1 rounded-lg py-2 text-sm font-medium"
              :class="draft.type === 'break'
                ? 'bg-blue-500 text-white'
                : 'bg-black/5 text-black/60 dark:bg-white/10 dark:text-white/60'"
              @click="draft.type = 'break'"
            >
              休息
            </button>
          </div>
          <div class="mt-3 grid grid-cols-2 gap-2">
            <k-button rounded large tonal @click="applyEdit">保存修改</k-button>
            <k-button rounded large clear class="text-red-500" @click="removePeriod">删除时段</k-button>
          </div>
          <div class="mt-2 text-xs text-black/40 dark:text-white/40">
            改为休息或删除会同时清掉课表里该时段的排课。
          </div>
        </div>
      </div>
    </k-block>

    <k-block-title>快速添加（点名称即加入）</k-block-title>
    <k-block strong inset>
      <div class="flex flex-wrap gap-2">
        <button
          v-for="preset in presets"
          :key="preset"
          class="rounded-full bg-black/5 px-3 py-1.5 text-sm dark:bg-white/10"
          :class="usedPresetNames.includes(preset) ? 'opacity-40' : ''"
          @click="addPreset(preset)"
        >
          {{ preset }}
        </button>
      </div>
    </k-block>

    <k-block-footer>
      保存修改即时生效；手表端「从手机导入」后覆盖手表作息。
    </k-block-footer>
  </k-page>
</template>

<script>
import {
  kBlock,
  kBlockFooter,
  kBlockHeader,
  kBlockTitle,
  kButton,
  kList,
  kListItem,
  kListInput,
  kPage,
} from 'konsta/vue'
import {
  loadBase,
  saveBase,
  makeEmptyTimetable,
  clone,
  genId,
  PERIOD_NAME_PRESETS as presets,
} from '../../common/skedData.js'

const TIME_RE = /^\d{2}:\d{2}$/

function toMin(hm) {
  if (!TIME_RE.test(hm || '')) return NaN
  const h = parseInt(hm.slice(0, 2), 10)
  const m = parseInt(hm.slice(3, 5), 10)
  if (h > 23 || m > 59) return NaN
  return h * 60 + m
}

export default {
  name: 'SkedPeriods',

  components: {
    kBlock,
    kBlockFooter,
    kBlockHeader,
    kBlockTitle,
    kButton,
    kList,
    kListItem,
    kListInput,
    kPage,
  },

  data() {
    return {
      base: null,
      expanded: '',
      draft: { name: '', start: '08:00', end: '08:45', type: 'class' },
    }
  },

  computed: {
    /** 模板无法直接访问 import 绑定（Options API），经 computed 暴露 */
    presets() {
      return presets
    },
    periods() {
      return this.base ? this.base.periods : []
    },
    usedPresetNames() {
      return this.periods.map((p) => p.name)
    },
  },

  activated() {
    this.load()
  },

  mounted() {
    this.load()
  },

  methods: {
    async load() {
      const existing = await loadBase()
      this.base = existing || makeEmptyTimetable()
      if (!existing) await saveBase(clone(this.base))
    },

    toggleEdit(id) {
      if (this.expanded === id) {
        this.expanded = ''
        return
      }
      const p = this.base.periods.find((x) => x.id === id)
      this.draft = p
        ? { name: p.name, start: p.start, end: p.end, type: p.type }
        : { name: '', start: '08:00', end: '08:45', type: 'class' }
      this.expanded = id
    },

    async persist() {
      await saveBase(clone(this.base))
    },

    validDraft() {
      const name = this.draft.name.trim()
      if (!name) return '请填写名称'
      const s = toMin(this.draft.start)
      const e = toMin(this.draft.end)
      if (Number.isNaN(s)) return '开始时间格式不正确'
      if (Number.isNaN(e)) return '结束时间格式不正确'
      if (s >= e) return '开始时间需早于结束时间'
      return null
    },

    async applyEdit() {
      const p = this.base.periods.find((x) => x.id === this.expanded)
      if (!p) return
      const bad = this.validDraft()
      if (bad) {
        this.warn(bad)
        return
      }
      const prevType = p.type
      p.name = this.draft.name.trim()
      p.start = this.draft.start
      p.end = this.draft.end
      p.type = this.draft.type
      // 与手表保存逻辑一致：变成休息的时段不再承载课程
      if (prevType === 'class' && p.type === 'break') {
        for (const day in this.base.courses) {
          this.base.courses[day] = this.base.courses[day].filter((c) => c.periodId !== p.id)
        }
      }
      await this.persist()
      this.expanded = ''
    },

    async removePeriod() {
      const id = this.expanded
      this.base.periods = this.base.periods.filter((x) => x.id !== id)
      for (const day in this.base.courses) {
        this.base.courses[day] = this.base.courses[day].filter((c) => c.periodId !== id)
      }
      await this.persist()
      this.expanded = ''
    },

    async addPreset(name) {
      if (this.usedPresetNames.includes(name)) return
      this.base.periods.push({
        id: 'p_' + genId(),
        name,
        start: '08:00',
        end: '08:45',
        type: 'class',
      })
      await this.persist()
    },

    async warn(message) {
      try {
        const { getOrbitV } = await import('../../common/orbitv.js')
        const ov = await getOrbitV()
        await ov.ui.toast({ type: 'error', message })
      } catch (_) { /* 浏览器预览无 toast */ }
    },
  },
}
</script>
