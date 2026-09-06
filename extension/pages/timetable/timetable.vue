<template>
  <k-page>
    <k-block-header>
      选星期，点时段格选课。type=break 的时段（自习/午休等）显示为灰色，一般不排课。
    </k-block-header>

    <div class="px-4">
      <div class="flex gap-1">
        <button
          v-for="(label, i) in dayNames"
          :key="label"
          class="flex-1 rounded-lg py-2 text-sm font-medium"
          :class="day === i + 1
            ? 'bg-blue-500 text-white'
            : 'bg-black/5 text-black/70 dark:bg-white/10 dark:text-white/70'"
          @click="day = i + 1"
        >
          {{ label }}
        </button>
      </div>
    </div>

    <k-block strong inset>
      <div v-if="!periods.length" class="py-2 text-sm text-black/55 dark:text-white/55">
        还没有作息时段，请先到「编辑作息」添加。
      </div>
      <div
        v-for="p in periods"
        :key="p.id"
        class="border-b border-black/5 last:border-0 dark:border-white/10"
      >
        <button
          class="flex w-full items-center gap-3 py-3 text-left"
          :class="p.type === 'break' ? 'opacity-45' : ''"
          @click="openPicker(p)"
        >
          <span class="w-24 shrink-0">
            <span class="block text-sm font-medium">{{ p.name }}</span>
            <span class="block text-xs text-black/45 dark:text-white/45">{{ p.start }}–{{ p.end }}</span>
          </span>
          <span
            v-if="cellOf(p.id)"
            class="flex flex-1 items-center gap-2 rounded-lg px-3 py-2"
            :style="{ backgroundColor: cellOf(p.id).color + '2E' }"
          >
            <span class="h-3 w-3 shrink-0 rounded-full" :style="{ backgroundColor: cellOf(p.id).color }" />
            <span class="flex-1 truncate text-sm font-medium">{{ cellOf(p.id).name }}</span>
          </span>
          <span
            v-else
            class="flex-1 rounded-lg border border-dashed border-black/15 px-3 py-2 text-sm text-black/40 dark:border-white/15 dark:text-white/40"
          >
            未安排
          </span>
        </button>
      </div>
    </k-block>

    <k-block-title>为「{{ pickingPeriodName }}」选择课程</k-block-title>
    <k-block strong inset v-if="picking">
      <div class="grid gap-1">
        <button
          v-for="s in subjects"
          :key="s.id"
          class="flex items-center gap-3 rounded-lg px-2 py-2 text-left active:bg-black/5 dark:active:bg-white/10"
          @click="pick(s)"
        >
          <span class="h-4 w-4 shrink-0 rounded-full" :style="{ backgroundColor: s.color }" />
          <span class="flex-1 text-base">{{ s.name }}</span>
        </button>
      </div>
      <div class="mt-2">
        <k-button rounded large clear class="text-red-500" @click="clearCell">清空该时段</k-button>
      </div>
    </k-block>
    <k-block strong inset v-else>
      <div class="py-1 text-sm text-black/55 dark:text-white/55">点击上方时段开始安排。</div>
    </k-block>

    <k-block-footer>
      修改即时保存到本机，手表端「从手机导入」后生效。
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
  kPage,
} from 'konsta/vue'
import {
  loadBase,
  saveBase,
  makeEmptyTimetable,
  clone,
  DAY_NAMES as dayNames,
} from '../../common/skedData.js'

export default {
  name: 'SkedTimetable',

  components: {
    kBlock,
    kBlockFooter,
    kBlockHeader,
    kBlockTitle,
    kButton,
    kPage,
  },

  data() {
    return {
      base: null,
      day: 1,
      picking: false,
      pickingPeriodId: '',
      pickingPeriodName: '',
    }
  },

  computed: {
    /** 模板无法直接访问 import 绑定（Options API），经 computed 暴露 */
    dayNames() {
      return dayNames
    },
    subjects() {
      return this.base ? this.base.subjects : []
    },
    periods() {
      return this.base ? this.base.periods : []
    },
    dayCourses() {
      if (!this.base) return []
      if (!Array.isArray(this.base.courses[String(this.day)])) return []
      return this.base.courses[String(this.day)]
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

    cellOf(periodId) {
      const c = this.dayCourses.find((x) => x.periodId === periodId)
      if (!c) return null
      const s = this.base.subjects.find((x) => x.id === c.subjectId)
      return s ? { name: s.name, color: s.color } : null
    },

    openPicker(p) {
      if (p.type === 'break') {
        this.picking = false
        return
      }
      this.pickingPeriodId = p.id
      this.pickingPeriodName = p.name
      this.picking = true
    },

    async persist() {
      await saveBase(clone(this.base))
    },

    async pick(subject) {
      const day = String(this.day)
      const rest = this.base.courses[day].filter((c) => c.periodId !== this.pickingPeriodId)
      rest.push({ subjectId: subject.id, periodId: this.pickingPeriodId })
      // 与手表一致：按 periodId 对齐时段顺序
      rest.sort((a, b) => {
        const ia = this.base.periods.findIndex((p) => p.id === a.periodId)
        const ib = this.base.periods.findIndex((p) => p.id === b.periodId)
        return ia - ib
      })
      this.base.courses[day] = rest
      await this.persist()
      this.picking = false
    },

    async clearCell() {
      const day = String(this.day)
      this.base.courses[day] = this.base.courses[day].filter((c) => c.periodId !== this.pickingPeriodId)
      await this.persist()
      this.picking = false
    },
  },
}
</script>
