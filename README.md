# 高中课表 · BlueOS 手表应用

为 vivo BlueOS（蓝河 OS）圆屏手表打造的高中生课表应用。iOS 深色质感，纯本地离线运行。

## 功能

- **今日课程**：周一至周日切换，进行中的课程高亮
- **下节课倒计时**：上课中显示距下课剩余时间（圆环进度），课间显示距上课倒计时
- **自定义作息**：早读到晚自习全部时段可增删改（课程/休息两类）
- **编辑课表**：「‹ 周X ›」按天编辑，点节次弹出「选择课程」面板；支持自定义科目（自动配色）
- **考试与假期倒计时**：首页胶囊展示距关键日期天数
- **数据可靠**：本地主存 + 文件快照双保险，损坏自动恢复

## 环境要求

1. [BlueOS Studio](https://studio.blueos.com.cn)（已验证 2.2.1）
2. Node.js（Studio 内置；本机单测需 Node >= 18）

## 快速开始（BlueOS Studio 模拟器）

1. 打开 BlueOS Studio → `文件 → 打开文件夹` → 选择本目录 `blueos-timetable`。
2. 首次打开点预览区「安装依赖」（或终端执行 `pnpm i` / `npm i`；官方推荐 pnpm）。
3. 按 `Ctrl+Shift+R` 重新启动编译 → 模拟器实时预览（Watch 模板内置模拟器，无需真机）。
4. 修改代码保存后自动增量编译；`Ctrl+R` 仅重新编译。

### 方案 B：Studio 新建工程 + 覆盖 src/（回退方案）

若直接打开本工程出现工具链版本报错：

1. Studio → 新建工程 → 终端类型选 **Watch** → 任意模板（如 Demo）→ 填包名。
2. 用本工程 `src/` 整体覆盖新工程的 `src/`。
3. 确认新工程 `src/manifest.json` 为本工程的版本（覆盖时保留）。

## 真机调试（蓝牙侧载）

1. 手表要求 WATCH 3 及之后版本（含 WATCH GT / WATCH 5 / WATCH GT2 等），开启蓝牙且未连接其他蓝牙设备。
2. PC 开启蓝牙（无蓝牙可插 USB 蓝牙适配器）；Windows 首次连接需在系统设置中允许配对。
3. Studio 顶部下拉框 →「连接蓝牙设备」→ 选择手表 → 「设置构建参数」默认 → 点「调试」。
4. 等待编译安装完成，输出面板切换到对应设备查看日志。

## 打包

- debug 包：Studio 打包（调试用），自用侧载无需 release 证书即可长期使用。
- release 包：需在 Studio「工具 → 生成证书」，证书存于工程 `sign/` 目录；产物在 `dist/*.rpk`。
- 也可用命令行出包（BlueOS Studio 内置工具链）：

```bash
node "%LOCALAPPDATA%/Programs/BlueOSStudio/resources/app/extensions/node_modules/hap-toolkit/bin/index.js" build
```

## 开发

```bash
# 核心逻辑单元测试（22 项：周次/时段状态/数据容错）
npm test

# 全部 .ux 脚本语法检查
node scripts/check-ux-script.mjs

# 工程一致性检查（manifest 路由/页面/import/危险样式）
node scripts/check-consistency.mjs

# 重新生成应用图标（114x114）
node scripts/gen-icon.mjs
```

### 工程结构

```
├── src
│   ├── core/            # 纯 JS 数据核心（可被 Node 单测，禁 Feature 依赖）
│   │   ├── defaults.js  #   预设科目/自定义科目色板/默认作息/常量
│   │   └── timetable.js #   周次/时段状态/数据校验纯函数
│   ├── store/           # 存取层（localstorage 主存 + 文件快照容错）
│   ├── helper/sys.js    # Feature 兼容层（@blueos.* / @system.* 双命名空间）
│   ├── pages/           # Home / Week / Edit / Settings / Periods / Countdowns
│   ├── app.ux           # 入口
│   └── manifest.json    # 路由/feature/设计基准 466
├── tests/               # Node 内置 test runner 单测
├── scripts/             # 检查与生成脚本
├── docs/                # 设计系统 + 技术决策笔记
├── memory_bank/         # 需求合同与开发状态记录
└── attic/               # 已撤销功能的归档（BLE 课表导入通道）
```

### 关键约定（改代码前必读）

- 所有 Feature API 调用必须在页面生命周期内（onReady 之后），禁止模块加载期调用。
- 定时器必须 onShow/onDestroy 配对清理。
- 禁用样式：`flex: N`、`box-shadow`、`backdrop-filter`、`transition`（一致性检查会拦截）。
- 视觉规范见 `docs/DESIGN.md`；命名空间兼容层原理与引擎踩坑记录见 `docs/TECH-NOTES.md`。

## 数据模型

```jsonc
{
  "version": 1,
  "semesterStart": "2026-08-31",       // 自动归一化到该周周一
  "subjects":  [{ "id": "math", "name": "数学", "color": "#0A84FF" },
                { "id": "c_abc123", "name": "信息技术", "color": "#BF5AF2", "custom": true }],
  "periods":   [{ "id": "p02", "name": "第一节", "start": "08:00", "end": "08:45", "type": "class" }],
  "courses":   { "1": [{ "subjectId": "math", "periodId": "p02" }] },  // 周一=1
  "countdowns": [{ "id": "c1", "kind": "exam", "name": "月考", "date": "2026-10-01" }]
}
```

## 已知边界

- 首次使用需在「设置」选择学期起始日（默认当天所在周）。
- 假期倒计时按「起始日后 7 天」的简化模型显示。
- 单双周（大小周）功能已移除：同一节次全周统一安排；旧数据中的单双周标记会被忽略并按普通课程显示。
- 自定义科目名输入依赖手表输入法，真机输入体验因机型而异。
