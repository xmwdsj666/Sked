// 将各页面按 $item 取参的 handler 改为按 $idx 定位
import fs from 'node:fs'
const edits = [
  {
    f: 'src/pages/Home/index.ux',
    from: `  onDayTap(item) {
    if (!item) return
    this.selDay = item.dayIdx
    sys.vibrateShort()
    this.refresh()
  }`,
    to: `  onDayTap(idx) {
    if (idx === undefined || !this.dayChips[idx]) return
    this.selDay = this.dayChips[idx].dayIdx
    sys.vibrateShort()
    this.refresh()
  }`
  },
  {
    f: 'src/pages/Week/index.ux',
    from: `  pickDay(item) {
    if (!item) return
    sys.vibrateShort()
    sys.router().push({ uri: '/pages/Home', params: { day: String(item.day) } })
  }`,
    to: `  pickDay(idx) {
    if (idx === undefined || !this.rows[idx]) return
    sys.vibrateShort()
    sys.router().push({ uri: '/pages/Home', params: { day: String(this.rows[idx].day) } })
  }`
  },
  {
    f: 'src/pages/Periods/index.ux',
    from: `  onRowTap(item) {
    if (!item) return
    if (this.openId === item.id) {`,
    to: `  onRowTap(idx) {
    if (idx === undefined || !this.rows[idx]) return
    const item = this.rows[idx]
    if (this.openId === item.id) {`
  },
  {
    f: 'src/pages/Periods/index.ux',
    from: `  onRowDelete(item) {
    if (!item) return
    const st = getData()
    for (let i = st.periods.length - 1; i >= 0; i--) {
      if (st.periods[i].id === item.id) st.periods.splice(i, 1)
    }`,
    to: `  onRowDelete(idx) {
    if (idx === undefined || !this.rows[idx]) return
    const item = this.rows[idx]
    const st = getData()
    for (let i = st.periods.length - 1; i >= 0; i--) {
      if (st.periods[i].id === item.id) st.periods.splice(i, 1)
    }`
  },
  {
    f: 'src/pages/Countdowns/index.ux',
    from: `  onRowDelete(item) {
    if (!item) return
    const st = getData()
    for (let i = st.countdowns.length - 1; i >= 0; i--) {`,
    to: `  onRowDelete(idx) {
    if (idx === undefined || !this.rows[idx]) return
    const item = this.rows[idx]
    const st = getData()
    for (let i = st.countdowns.length - 1; i >= 0; i--) {`
  }
]
for (const e of edits) {
  let s = fs.readFileSync(e.f, 'utf8')
  if (!s.includes(e.from)) { console.log('NOT FOUND in', e.f, '->', e.from.split('\n')[0]); continue }
  s = s.replace(e.from, e.to)
  fs.writeFileSync(e.f, s)
  console.log('OK:', e.f, '->', e.to.split('\n')[0])
}
