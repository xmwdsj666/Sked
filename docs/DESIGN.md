# 设计系统 — Sked（BlueOS 手表 · 圆屏 466 · iOS 深色质感）

> 本文档固化视觉与交互规范。修改视觉前先读本文档。

## 1. 设计原则

1. 纯黑底（#000000）：OLED 省电 + iOS 手表原生观感，冗余背景色一律不声明。
2. 卡片是唯一容器语言：所有信息装在渐变圆角卡片中，层级靠亮度而非阴影。
3. 色彩即语义：科目色 / 状态色全部取自 iOS 深色系统色板，不作随意发挥。
4. 动效克制：只做入场渐显上移与按压反馈，无弹跳、无多余装饰。

## 2. 平台能力边界（决定"质感如何做"）

| 能力 | 状态 | 替代方案 |
| ---- | ---- | ---- |
| box-shadow | 不支持 | 卡片渐变 + 1px 半透明描边制造层次 |
| backdrop-filter 毛玻璃 | 不支持 | 高分层渐变模拟玻璃感 |
| CSS transition | 不支持 | @keyframes（仅 opacity/transform/background-color/宽高）|
| :active 伪类 | 支持 | 按压降透明度 0.72 |
| border-radius | 需同时声明 border-width + border-color | 全部卡片同时给 1px + 描边色 |
| 线性渐变 linear-gradient | 仅支持方向语法（`to bottom right` / `to right`），**角度语法 `165deg` 不支持**（引擎日志 RenderOp not supported the angle，实测踩坑） | 卡片统一用 `linear-gradient(to bottom right, A, B)` |

注意：引擎渐变**只支持方向语法**（`to bottom right` / `to right` 等），不支持 `165deg` 角度语法——实测模拟器日志报 `RenderOp not supported the angle 165deg` 且渐变不生效。全工程已统一 `to bottom right`。

## 3.5 方屏适配（watch-square）

- manifest `deviceTypeList: ["watch-round", "watch-square"]`。
- 全部 6 页 style 末尾带 `@media screen and (device: watch-square)` 块：`.content` 内边距恢复常规（40/40/40/60），卡片与列表宽度放宽到 386px（无弧形裁边）。
- 圆屏默认规则不变：内容列 370px、上下留弧 80~86px / 100px。

## 3. 色板

### 底色与卡片
- 页面底：`#000000`
- 卡片渐变：`linear-gradient(165deg, #1d1d22, #141418)`（层级 1）
- 主卡（Hero）：`linear-gradient(165deg, #232329, #151519)`（层级 2，更亮）
- 选中/高亮卡：`linear-gradient(165deg, #2c2c33, #191920)`
- 描边：`rgba(255,255,255,0.07)` 常规 / `0.09` 主卡 / `rgba(255,255,255,0.38)` 进行中
- 内嵌面板（编辑器）：`#101014`，描边 `rgba(10,132,255,0.4)`

### 文字
- 主文字：`#FFFFFF`
- 次要：`rgba(235,235,245,0.55)`
- 弱化：`rgba(235,235,245,0.40)`
- 极弱（提示/占位）：`rgba(235,235,245,0.30~0.35)`

### 语义色（iOS 深色系统色）
| 用途 | 色值 |
| ---- | ---- |
| 主色 / 链接 / 进行环 | `#0A84FF` |
| 假期 / 成功 | `#30D158` |
| 考试 / 危险 / 删除 | `#FF453A` |
| 警告 / 双单周差异 | `#FFD60A` |
| 中性 / 休息时段 | `#48484A` / `#8E8E93` |

### 科目色（预设科目库）
语文 `#FF453A` / 数学 `#0A84FF` / 英语 `#FF9F0A` / 物理 `#BF5AF2` / 化学 `#30D158` / 生物 `#66D4CF` / 政治 `#FFD60A` / 历史 `#AC8E68` / 地理 `#64D2FF` / 体育 `#32D74B` / 早读 `#98989D` / 自习 `#8E8E93` / 晚自习 `#6C6C70`

## 4. 字号与字重

| 元素 | 字号 | 字重 |
| ---- | ---- | ---- |
| 页面标题 | 34px | bold |
| Hero 主数字（倒计时） | 64px | bold |
| Hero 主文案 | 40px | bold |
| 卡片标题 / 课程名 | 24~27px | bold |
| 正文 / 芯片 | 19~22px | normal |
| 辅助说明 | 16~18px | normal |
| Hero 状态行 | 20px | normal |

（引擎 font-weight 仅 normal/bold 两档生效）

## 5. 布局与圆屏安全区

- 设计基准 466×466；内容列宽 370px 居中（左右留 48px 弧边）。
- 顶部起头 80~86px（圆弧区不放可点元素）；底部预留 100px（滚动尾部留白）。
- 圆角体系：卡片 24px / 主卡 36px / 胶囊按钮 = 高度一半。
- 间距体系：4 的倍数——卡片间 10~12px，分组间 16~22px。

## 6. 组件规范

### 星期芯片（Home / Edit）
- 44×44 圆、默认底 `#1c1c1e` + 描边 0.08 白；选中反白（`#ffffff` 底黑字加粗）；今天未选中态用蓝描边 + 蓝字。

### 课程行
- 高 84px；左时间列（开始 25px bold / 结束 17px 弱）+ 1px 竖分隔线 + 色点(13px) + 科目名 27px bold + 单双周角标。
- 进行中：描边升为 0.38 白 + 时间变主色蓝。
- 休息时段行：高 44px 无卡片，文字 0.35 弱。

### 编辑器面板（展开）
- 嵌入卡片下方，`#101014` 底 + 蓝描边、底部 24px 圆角；picker 高 150~240px；操作按钮为胶囊。

### 危险操作
- 红描边 + 暗红渐变底（`linear-gradient(165deg,#241416,#160d0e)`），文字 `#FF453A`；确认弹窗用 `vw-alert`。

## 7. 动效

| 场景 | 实现 |
| ---- | ---- |
| 卡片入场 | @keyframes rise：0%{opacity:0; translateY(18px)} 100%{opacity:1; translateY(0)}，340ms ease-out，fill forwards |
| 按压 | `.press:active { opacity: 0.72 }` |
| 切天/选中 | vibrator short 轻触反馈（helper/sys.js vibrateShort） |
| 页面转场 | 路由默认转场（未自定义，保持系统一致性与性能） |

## 8. 性能纪律（写页面时对照）

- data 嵌套 ≤ 3 层；列表 tid 用业务键（periodId+weekType），不用数组索引。
- 列表项内不放自定义组件；for+if 不叠加（数据预过滤）。
- 每页 timer 只在 onReady/onShow 启动、onHide/onDestroy 清理；tick 只改倒计时文本，不重建列表。
- 1 秒 tick 与全量 refresh 之间用 liveSig 状态签名判断是否需要重建。
