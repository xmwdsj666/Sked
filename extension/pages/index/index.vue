<template>
  <k-page>
    <k-block-header>
      在手机上编辑课表，手表一键拉取；也可把手表数据备份到这里导出存档。
    </k-block-header>

    <k-block-title>当前基准数据</k-block-title>
    <k-block strong inset>
      <div v-if="loading" class="flex items-center gap-3 text-sm text-black/55 dark:text-white/55">
        <k-preloader class="k-preloader" />
        <span>正在读取…</span>
      </div>
      <template v-else-if="meta">
        <div class="text-base font-medium">{{ meta.subjects }} 门课程 · {{ meta.periods }} 个时段</div>
        <div class="mt-1 text-sm text-black/55 dark:text-white/55">
          排课 {{ meta.courses }} 节 · 更新于 {{ updatedAtText }}
        </div>
      </template>
      <template v-else>
        <div class="text-base font-medium">还没有数据</div>
        <div class="mt-1 text-sm text-black/55 dark:text-white/55">
          直接开始编辑，或先在手表「设置 → 手机同步 → 备份到手机」把现有课表传过来
        </div>
      </template>
    </k-block>

    <k-block-title>开始使用</k-block-title>
    <k-block strong inset>
      <div class="grid gap-2">
        <k-button rounded large @click="go('/pages/courses/courses')">编辑课程（科目与颜色）</k-button>
        <k-button rounded large tonal @click="go('/pages/timetable/timetable')">编辑课表（周课程表）</k-button>
        <k-button rounded large tonal @click="go('/pages/periods/periods')">编辑作息（时段与时间）</k-button>
        <k-button rounded large outline :disabled="!meta" @click="exportJson">导出 JSON 文件</k-button>
      </div>
    </k-block>

    <k-block-footer>
      手表端：设置 → 手机同步。导入/备份时请保持本扩展程序页面打开（页面关闭后手表无法连接）。
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
  kPreloader,
} from 'konsta/vue'
import { getOrbitV } from '../../common/orbitv.js'
import { loadBase, formatUpdatedAt } from '../../common/skedData.js'

export default {
  name: 'SkedHome',

  components: {
    kBlock,
    kBlockFooter,
    kBlockHeader,
    kBlockTitle,
    kButton,
    kPage,
    kPreloader,
  },

  data() {
    return {
      loading: true,
      meta: null,
      updatedAtText: '从未',
    }
  },

  activated() {
    this.refresh()
  },

  mounted() {
    this.refresh()
  },

  methods: {
    async refresh() {
      this.loading = true
      try {
        const [base, ov] = await Promise.all([loadBase(), getOrbitV()])
        if (base) {
          let courses = 0
          for (const day in base.courses) {
            if (Array.isArray(base.courses[day])) courses += base.courses[day].length
          }
          this.meta = {
            subjects: base.subjects.length,
            periods: base.periods.length,
            courses,
          }
          const iso = await ov.storage.get('sked.timetable.updatedAt')
          this.updatedAtText = formatUpdatedAt(iso)
        } else {
          this.meta = null
        }
      } catch (error) {
        console.error('[Sked] 读取基准失败', error)
        this.meta = null
      } finally {
        this.loading = false
      }
    },

    go(path) {
      this.$router.push(path)
    },

    async exportJson() {
      try {
        const base = await loadBase()
        if (!base) return
        const ov = await getOrbitV()
        const result = await ov.file.export({
          data: JSON.stringify(base, null, 2),
          name: 'sked-backup.json',
          mimeType: 'application/json',
        })
        if (result && result.saved) {
          await ov.ui.toast({ type: 'success', message: '已导出 ' + (result.name || 'sked-backup.json') })
        }
      } catch (error) {
        console.error('[Sked] 导出失败', error)
        try {
          const ov = await getOrbitV()
          await ov.ui.toast({ type: 'error', message: error.message || '导出失败' })
        } catch (_) { /* 浏览器预览无 toast */ }
      }
    },
  },
}
</script>
