// 工程一致性检查：manifest 路由 ↔ 页面目录 ↔ 组件引用
import fs from 'node:fs'
import path from 'node:path'

const errors = []
const warnings = []

// 1. manifest JSON 合法
const mfPath = 'src/manifest.json'
let mf
try {
  mf = JSON.parse(fs.readFileSync(mfPath, 'utf8'))
  console.log('OK  manifest.json 合法 JSON')
} catch (e) {
  console.log('BAD manifest.json 解析失败:', e.message)
  process.exit(1)
}

// 2. router.pages 每项：key 是 src/ 下相对目录路径（如 pages/Home → src/pages/Home/index.ux）
for (const key of Object.keys(mf.router.pages)) {
  if (/^\/|\\/.test(key)) errors.push('router key 必须是相对路径且用 / 分隔: ' + key)
  const p = path.join('src', key, 'index.ux')
  if (fs.existsSync(p)) console.log('OK  页面', key)
  else errors.push('页面缺失: ' + p)
}

// 2b. 禁止裸页面名作为 key（编译器按 src/<key>/index.ux 解析，裸名会报 code 4000）
for (const key of Object.keys(mf.router.pages)) {
  if (!key.includes('/')) errors.push('router key 必须含目录前缀（如 pages/xxx）: ' + key)
}

// 3. entry 在 pages 中
if (!mf.router.pages[mf.router.entry]) errors.push('entry 不在 pages: ' + mf.router.entry)

// 3b. 跳转 uri 与路由键一致性：/pages/Xxx 必须存在于 router.pages（path 默认为 / + key）
function walkFiles(dir, out) {
  for (const it of fs.readdirSync(dir)) {
    const fp = path.join(dir, it)
    const st = fs.statSync(fp)
    if (st.isDirectory()) walkFiles(fp, out)
    else if (/\.(ux|js)$/.test(it)) out.push(fp)
  }
  return out
}
const files = walkFiles('src', [])
const pushRe = /uri:\s*'([^']+)'|uri:\s*"([^"]+)"/g
for (const f of files) {
  const s = fs.readFileSync(f, 'utf8')
  let m
  while ((m = pushRe.exec(s))) {
    const uri = m[1] || m[2]
    if (!uri || !uri.startsWith('/')) continue
    const key = uri.slice(1)
    if (!mf.router.pages[key]) errors.push(f + ' 跳转目标不存在于 router.pages: ' + uri)
  }
}
console.log('OK  跳转目标检查完成')

// 4. 反向：src/pages 下存在但未注册的页面
const pagesDir = 'src/pages'
for (const d of fs.readdirSync(pagesDir)) {
  if (!mf.router.pages['pages/' + d]) warnings.push('目录未注册路由: pages/' + d)
}

// 5. icon 存在且为 114x114 PNG
if (fs.existsSync('src/' + mf.icon)) {
  const b = fs.readFileSync('src/' + mf.icon)
  const okSig = b.slice(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))
  const w = b.readUInt32BE(16)
  const h = b.readUInt32BE(20)
  if (okSig && w === 114 && h === 114) console.log('OK  icon 114x114 PNG')
  else errors.push('icon 尺寸/格式异常: ' + w + 'x' + h)
} else {
  errors.push('icon 缺失: ' + mf.icon)
}

// 6. 所有 import 路径可解析（相对路径）——files 已在 3b 处遍历生成
const importRe = /(?:import\s[^;]*?from\s+|require\s*\()\s*['"]([^'"]+)['"]/g
for (const f of files) {
  const s = fs.readFileSync(f, 'utf8')
  let m
  while ((m = importRe.exec(s))) {
    const spec = m[1]
    if (!spec.startsWith('.')) continue // 包导入跳过
    const base = path.dirname(f)
    const resolved = path.resolve(base, spec)
    const candidates = [resolved, resolved + '.js', resolved + '.ux', path.join(resolved, 'index.ux'), path.join(resolved, 'index.js')]
    if (!candidates.some(function (c) { return fs.existsSync(c) && fs.statSync(c).isFile() })) {
      errors.push(f + ' -> 无法解析 import: ' + spec)
    }
  }
}
console.log('OK  import 解析检查完成 (' + files.length + ' 个文件)')

// 7. 命名空间合规：导入的 @system./@blueos. 模块必须在 helper/sys.js 兼容层中（页面禁止直接 import Feature）
const sysSrc = fs.readFileSync('src/helper/sys.js', 'utf8')
const whitelisted = [...sysSrc.matchAll(/require\('@([a-z.]+)'\)/g)].map(x => x[1])
for (const f of files) {
  if (f.replace(/\\/g, '/').endsWith('helper/sys.js')) continue
  const s = fs.readFileSync(f, 'utf8')
  for (const m of s.matchAll(/(?:from\s+|require\()\s*['"]@([a-z][a-zA-Z.]*)['"]/g)) {
    if (!whitelisted.includes(m[1])) {
      errors.push(f + ' 直接导入 Feature 模块（应走 helper/sys.js）: @' + m[1])
    }
  }
}
console.log('OK  Feature 导入合规检查完成')

// 8. 危险样式检查
for (const f of files) {
  if (!f.endsWith('.ux')) continue
  const s = fs.readFileSync(f, 'utf8')
  if (/flex\s*:\s*\d/.test(s)) errors.push(f + ' 使用了不支持的 flex: N')
  if (/box-shadow/.test(s)) errors.push(f + ' 使用了不支持的 box-shadow')
  if (/backdrop-filter/.test(s)) errors.push(f + ' 使用了不支持的 backdrop-filter')
  if (/\btransition\s*:/.test(s)) errors.push(f + ' 使用了不支持的 CSS transition')
}
console.log('OK  危险样式检查完成')

console.log('')
if (errors.length) {
  console.log('ERRORS:')
  errors.forEach(function (e) { console.log(' -', e) })
  process.exit(1)
}
if (warnings.length) {
  console.log('WARNINGS:')
  warnings.forEach(function (w) { console.log(' -', w) })
}
console.log('一致性检查全部通过')
