// 语法校验：抽取每个 .ux 的 <script> 段，剥离 import（含多行）后 new Function 编译检查
import fs from 'node:fs'
import path from 'node:path'
function walk(dir, out) {
  for (const it of fs.readdirSync(dir)) {
    const fp = path.join(dir, it)
    const st = fs.statSync(fp)
    if (st.isDirectory()) walk(fp, out)
    else if (it.endsWith('.ux')) out.push(fp)
  }
  return out
}
const files = walk('src', [])
let bad = 0
for (const f of files) {
  const s = fs.readFileSync(f, 'utf8')
  const m = s.match(/<script>([\s\S]*?)<\/script>/)
  if (!m) continue
  // 逐行剥离：import 行可能包含 '{...}\n from' 结构，简单处理：删除以 import 开头到 from 行尾
  const lines = m[1].split('\n')
  const kept = []
  let skipping = false
  for (const ln of lines) {
    if (skipping) {
      kept.push('')
      if (ln.includes('from')) skipping = false
      continue
    }
    const t = ln.trimStart()
    if (t.startsWith('import ')) {
      if (!ln.includes(' from ')) { skipping = true; kept.push(''); continue }
      kept.push('')
      continue
    }
    kept.push(ln)
  }
  const body = kept.join('\n').replace(/export\s+default/, 'const __d =')
  try {
    new Function(body)
    console.log('OK ', f)
  } catch (e) {
    bad++
    console.log('BAD', f, e.message)
  }
}
process.exit(bad ? 1 : 0)
