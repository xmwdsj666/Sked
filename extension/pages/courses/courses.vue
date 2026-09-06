<template>
  <k-page>
    <k-block-header>
      课程是课表的基本单位：先在这里定义科目与颜色，再去编辑课表时直接选用。
    </k-block-header>

    <k-block-title>课程列表（{{ subjects.length }}）</k-block-title>
    <k-block strong inset>
      <div v-if="!subjects.length" class="py-2 text-sm text-black/55 dark:text-white/55">
        还没有课程，先在下方添加。
      </div>
      <div v-for="s in subjects" :key="s.id" class="border-b border-black/5 last:border-0 dark:border-white/10">
        <button
          class="flex w-full items-center gap-3 py-3 text-left"
          @click="toggleEdit(s.id)"
        >
          <span class="h-4 w-4 shrink-0 rounded-full" :style="{ backgroundColor: s.color }" />
          <span class="flex-1 text-base">{{ s.name }}</span>
          <span class="text-sm text-black/40 dark:text-white/40">{{ expanded === s.id ? '收起' : '编辑' }}</span>
        </button>
        <div v-if="expanded === s.id" class="pb-3">
          <k-list inset strong>
            <k-list-input
              label="名称"
              :value="draft.name"
              placeholder="课程名称"
              @input="draft.name = $event.target.value"
            />
          </k-list>
          <div class="mt-2 flex flex-wrap gap-2 px-2">
            <button
              v-for="c in colors"
              :key="c"
              class="h-8 w-8 rounded-full border-2"
              :class="draft.color === c ? 'border-black dark:border-white' : 'border-transparent'"
              :style="{ backgroundColor: c }"
              @click="draft.color = c"
            />
          </div>
          <div class="mt-3 grid grid-cols-2 gap-2">
            <k-button rounded large tonal @click="applyEdit">保存修改</k-button>
            <k-button rounded large clear class="text-red-500" @click="removeSubject">删除课程</k-button>
          </div>
          <div class="mt-2 text-xs text-black/40 dark:text-white/40">
            删除会同时清掉课表里该课程的所有排课引用。
          </div>
        </div>
      </div>
    </k-block>

    <k-block-title>新建课程</k-block-title>
    <k-block strong inset>
      <k-list inset strong>
        <k-list-input
          label="名称"
          :value="newName"
          placeholder="例如：信息技术"
          @input="newName = $event.target.value"
        />
      </k-list>
      <div class="mt-2 flex flex-wrap gap-2 px-2">
        <button
          v-for="c in colors"
          :key="c"
          class="h-8 w-8 rounded-full border-2"
          :class="newColor === c ? 'border-black dark:border-white' : 'border-transparent'"
          :style="{ backgroundColor: c }"
          @click="newColor = c"
        />
      </div>
      <div class="mt-3">
        <k-button rounded large :disabled="!newName.trim()" @click="addSubject">添加课程</k-button>
      </div>
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
  kList,
  kListInput,
  kPage,
} from 'konsta/vue'
import {
  loadBase,
  saveBase,
  makeEmptyTimetable,
  genId,
  clone,
  CUSTOM_COLORS as colors,
} from '../../common/skedData.js'

export default {
  name: 'SkedCourses',

  components: {
    kBlock,
    kBlockFooter,
    kBlockHeader,
    kBlockTitle,
    kButton,
    kList,
    kListInput,
    kPage,
  },

  data() {
    return {
      base: null,
      expanded: '',
      draft: { name: '', color: colors[0] },
      newName: '',
      newColor: colors[1],
    }
  },

  computed: {
    /** 模板无法直接访问 import 绑定（Options API），经 computed 暴露 */
    colors() {
      return colors
    },
    subjects() {
      return this.base ? this.base.subjects : []
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
      if (!existing) await saveBase(this.base)
    },

    toggleEdit(id) {
      if (this.expanded === id) {
        this.expanded = ''
        return
      }
      const s = this.base.subjects.find((x) => x.id === id)
      this.draft = { name: s ? s.name : '', color: s ? s.color : colors[0] }
      this.expanded = id
    },

    async persist() {
      await saveBase(clone(this.base))
    },

    async applyEdit() {
      const s = this.base.subjects.find((x) => x.id === this.expanded)
      if (!s) return
      const name = this.draft.name.trim()
      if (!name) return
      s.name = name
      s.color = this.draft.color
      await this.persist()
      this.expanded = ''
    },

    async removeSubject() {
      const id = this.expanded
      this.base.subjects = this.base.subjects.filter((x) => x.id !== id)
      for (const day in this.base.courses) {
        this.base.courses[day] = this.base.courses[day].filter((c) => c.subjectId !== id)
      }
      await this.persist()
      this.expanded = ''
    },

    async addSubject() {
      const name = this.newName.trim()
      if (!name) return
      this.base.subjects.push({ id: 'c_' + genId(), name, color: this.newColor })
      await this.persist()
      this.newName = ''
    },
  },
}
</script>
