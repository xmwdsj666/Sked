# Sked 手机端扩展程序（OrbitV 轻腕）

Sked 手表应用的官方配套扩展程序，运行在 vivo 手机「轻腕 (OrbitV)」App 内，
通过包名 `com.qwq.sked` 与手表端 hap 配对。

## 功能

| 功能 | 手机端 | 手表端 |
| --- | --- | --- |
| 课程管理（科目/颜色/新建/删除） | 扩展程序「编辑课程」 | — |
| 周课表编辑（7 天 × 每节排课） | 扩展程序「编辑课表」 | — |
| 作息时段编辑（名称/起止/类型/预设） | 扩展程序「编辑作息」 | — |
| 从手机导入（以手机为准覆盖手表） | 保持页面打开 | 设置 → 手机同步 → 从手机导入 |
| 备份到手机（手表快照上传） | 保持页面打开 | 设置 → 手机同步 → 备份到手机 |
| 导出 JSON 存档 | 主页「导出 JSON 文件」 | — |

## 通信架构（与 OrbitV 平台约定一致）

- 手机端 `service.js` 注册被动 HTTP 接口；**一切数据传输由手表主动发起**，手机不能推送。
- `GET /api/sked/timetable`：手表拉取手机编辑基准（404 = 手机端暂无数据）。
- `POST /api/sked/timetable`：手表上传快照，作为手机端编辑底稿。
- 数据存于 `ov.storage('sked.timetable')`，与手表 store 完全同构
  （`version/semesterStart/subjects/periods/courses/countdowns`），手表导入时统一过
  `core/timetable.js` 的 `sanitize` 清洗，双端 id/颜色全程稳定。
- 时段语义对齐手表端：改为「休息」或删除时段会同时清掉课表引用；
  开始时间必须早于结束时间、不跨午夜。

## 手机端工程（本目录）

```text
service.js          被动接口（运行在 OrbitV 服务环境，不参与 Vue 打包）
pages.json          页面注册（第一项为首页）+ 顶部栏样式
orbitv.json         包信息：appId=com.qwq.sked，entry=index.html，service=service.js
common/skedData.js  双端共享常量（课程预设/颜色/时段预设）+ 基准读写
pages/index         主页：基准状态 + 导出
pages/courses       课程管理
pages/timetable     周课表编辑
pages/periods       作息编辑
scripts/            vite 构建后同步运行时文件 + .ovpkg 打包
```

命令：`npm install` → `npm run dev`（浏览器仅预览布局，原生能力走模板内置 mock）→
`npm run package`（产出 `release/com.qwq.sked-<version>.ovpkg`）。

## 安装与使用

1. 手机安装「轻腕 (OrbitV)」App，并连接 vivo 手表。
2. 把 `.ovpkg` 放到手机文件管理器，点击 → 选择用轻腕打开 → 确认安装
   （本地安装免审核，允许升级/重装/降级，按 appId 保留数据）。
3. 手表端 Sked 需为含「手机同步」的版本（manifest 含 blueos.network.fetch / request）。
4. 使用时**保持扩展程序页面在手机上打开**，手表端操作才能连接。

## 排错表

| 现象（手表端提示） | 原因与处理 |
| --- | --- |
| 请先在手机上打开 Sked 扩展程序 | `APP_PAGE_NOT_OPEN`：扩展页面未打开，打开后再试 |
| 无法连接手机：确认手表与手机已连接 | `NETWORK_*`：蓝牙未连接或轻腕进程不在运行 |
| 手机端暂无数据 | 手机端还没编辑过、也没收到过手表备份 |
| 手机端错误：... | `HTTP_*`：看手机端 service 日志，多为数据结构问题 |
| 当前设备不支持手机同步 | 手表在模拟器或引擎过旧，缺 network 模块 |

## 开发注意

- 手表端 SDK 位于 `src/common/orbitv/index.js`（官方 BlueOS SDK 1.0.0）；
  app.ux 用 try/catch 防御性创建客户端（模拟器降级为 null）。
- `common/skedData.js` 与手表 `src/core/defaults.js` 的人工同步关系：
  `PRESET_SUBJECTS / CUSTOM_COLORS / PERIOD_NAME_PRESETS / DEFAULT_PERIODS` 改任一侧必须同步。
- Vue 页面是 Options API：模板不能直接引用 import 绑定，需经 computed 暴露
  （本项目已在 `dayNames/colors/presets` 上踩过此坑）。
- `ov.storage` 仅适合小型 JSON；课表数据几 KB 在安全范围内，大文件必须走 `ov.fs`。
