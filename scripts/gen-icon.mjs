// 生成 114x114 应用图标（manifest 要求：正方形、非圆角 PNG、无白边）
// 渲染：4x 超采样 + 盒式降采样；PNG 编码：纯 Node zlib
import fs from 'node:fs'
import zlib from 'node:zlib'

const SIZE = 114
const SS = 4
const W = SIZE * SS

// ---- 绘制辅助（SDF 覆盖度，返回 0..1） ----
function clamp01(x) { return x < 0 ? 0 : x > 1 ? 1 : x }

function roundedRectSDF(px, py, x0, y0, x1, y1, r) {
  const cx = Math.min(Math.max(px, x0 + r), x1 - r)
  const cy = Math.min(Math.max(py, y0 + r), y1 - r)
  // 距离圆角矩形边缘的近似符号距离
  const dx = px - cx
  const dy = py - cy
  const inside = px >= x0 && px <= x1 && py >= y0 && py <= y1
  if (inside) {
    const dist = Math.min(px - x0, x1 - px, py - y0, y1 - py)
    return dist >= r ? 1 : (r - dist) / r
  }
  const d = Math.sqrt(dx * dx + dy * dy)
  return d < r ? 1 - d / r : 0
}

// ---- 场景 ----
const BG = [10, 10, 12]
const CARD_C = [23, 23, 28]
const CARD_TOP = [32, 32, 39]

const CARD = { x0: 6, y0: 6, x1: 108, y1: 108, r: 26 }

// 课表格子：3 行 x 2 列圆角条
const BARS = [
  { x0: 22, y0: 24, x1: 50, y1: 40, r: 8, c: [10, 132, 255] },   // 蓝
  { x0: 60, y0: 24, x1: 92, y1: 40, r: 8, c: [48, 209, 88] },    // 绿
  { x0: 22, y0: 50, x1: 72, y1: 66, r: 8, c: [255, 159, 10] },   // 橙
  { x0: 82, y0: 50, x1: 92, y1: 66, r: 8, c: [191, 90, 242] },   // 紫
  { x0: 22, y0: 76, x1: 44, y1: 92, r: 8, c: [255, 69, 58] },    // 红
  { x0: 54, y0: 76, x1: 92, y1: 92, r: 8, c: [100, 210, 255] }   // 青
]

function pixel(sx, sy) {
  // sx, sy: 超采样坐标（0..W）
  const x = sx / SS
  const y = sy / SS
  // 背景
  let r = BG[0], g = BG[1], b = BG[2]
  // 卡片（垂直渐变）
  const cardCov = roundedRectSDF(x, y, CARD.x0, CARD.y0, CARD.x1, CARD.y1, CARD.r)
  if (cardCov > 0) {
    const t = (y - CARD.y0) / (CARD.y1 - CARD.y0)
    r = CARD_TOP[0] + (CARD_C[0] - CARD_TOP[0]) * t
    g = CARD_TOP[1] + (CARD_C[1] - CARD_TOP[1]) * t
    b = CARD_TOP[2] + (CARD_C[2] - CARD_TOP[2]) * t
    // 条格
    for (const bar of BARS) {
      const cov = roundedRectSDF(x, y, bar.x0, bar.y0, bar.x1, bar.y1, bar.r)
      if (cov > 0) {
        r = r + (bar.c[0] - r) * cov
        g = g + (bar.c[1] - g) * cov
        b = b + (bar.c[2] - b) * cov
      }
    }
  }
  return [Math.round(r * cardCov + BG[0] * (1 - cardCov)),
          Math.round(g * cardCov + BG[1] * (1 - cardCov)),
          Math.round(b * cardCov + BG[2] * (1 - cardCov))]
}

// ---- 超采样渲染 + 降采样 ----
const out = Buffer.alloc(SIZE * SIZE * 3)
for (let y = 0; y < SIZE; y++) {
  for (let x = 0; x < SIZE; x++) {
    let r = 0, g = 0, b = 0
    for (let sy = 0; sy < SS; sy++) {
      for (let sx = 0; sx < SS; sx++) {
        const p = pixel(x * SS + sx + 0.5, y * SS + sy + 0.5)
        r += p[0]; g += p[1]; b += p[2]
      }
    }
    const n = SS * SS
    const o = (y * SIZE + x) * 3
    out[o] = Math.round(r / n)
    out[o + 1] = Math.round(g / n)
    out[o + 2] = Math.round(b / n)
  }
}

// ---- PNG 编码 ----
function crc32(buf) {
  let c, table = []
  for (let n = 0; n < 256; n++) {
    c = n
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
    table[n] = c >>> 0
  }
  let crc = 0xffffffff
  for (let i = 0; i < buf.length; i++) crc = table[(crc ^ buf[i]) & 0xff] ^ (crc >>> 8)
  return (crc ^ 0xffffffff) >>> 0
}

function chunk(type, data) {
  const len = Buffer.alloc(4)
  len.writeUInt32BE(data.length)
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data])
  const crc = Buffer.alloc(4)
  crc.writeUInt32BE(crc32(body))
  return Buffer.concat([len, body, crc])
}

const ihdr = Buffer.alloc(13)
ihdr.writeUInt32BE(SIZE, 0)
ihdr.writeUInt32BE(SIZE, 4)
ihdr[8] = 8   // bit depth
ihdr[9] = 2   // color type: truecolor
// 原始数据：每行前置 filter byte 0
const raw = Buffer.alloc(SIZE * (SIZE * 3 + 1))
for (let y = 0; y < SIZE; y++) {
  raw[y * (SIZE * 3 + 1)] = 0
  out.copy(raw, y * (SIZE * 3 + 1) + 1, y * SIZE * 3, (y + 1) * SIZE * 3)
}
const png = Buffer.concat([
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
  chunk('IHDR', ihdr),
  chunk('IDAT', zlib.deflateSync(raw, { level: 9 })),
  chunk('IEND', Buffer.alloc(0))
])

const outPath = 'src/assets/images/icon.png'
fs.writeFileSync(outPath, png)
console.log('icon written:', outPath, png.length, 'bytes,', SIZE + 'x' + SIZE)
