# 技术笔记 — 关键决策与实证依据

> 记录开发过程中的关键技术决策，供后续维护者理解"为什么这样写"。

## 1. API 命名空间：双轨兼容层（最重要的决策）

### 背景
- 官方 205 页手表文档（developers.vivo.com，2026-09 提取）全部使用 `@blueos.*` 导入与 feature 声明，如 `import storage from '@blueos.storage.storage'`。
- 本机 BlueOS Studio 2.2.1（hap-toolkit 1.9.14）内嵌证据：
  - 自带 watch 工程模板（`@hap-toolkit/dsl-xvm/templates/app/demo`）使用旧命名 `@system.*`（`import router from '@system.router'`，features 声明 `system.prompt/system.router`）。
  - 模拟器引擎（watch.exe / cross.exe，2026-09 构建）的 FeatureChannelManager 注册的 JS 特性桶为 `_system/_service/_vivo`，通道名单含 `system.storage/prompt/router/file/vibrator` 等 57 个 `system.*`；`blueos.*` 仅注册了少数宿主通道（schedule/datePicker/ai 等）。
  - 引擎 `requireFeature` 对未注册名**静默返回空对象**（`s['_'+first] ? ... : {}`），不抛错。

### 结论（写代码的规则）
- manifest features：**两套名字同时声明**（blueos.* 给真机、system.* 给模拟器；schema 中 feature 名为自由字符串，官方模板即 system.*）。
- JS 导入：统一走 `src/helper/sys.js` 兼容层——同时 `require` 两个字面量命名空间，用功能探测（`typeof a.get === 'function'`）选择可用实现。
- 禁止页面直接 `import '@blueos.*' / '@system.*'`（一致性检查脚本会拦截）。

## 2. 编译期静态预渲染限制

官方文档明确：BlueOS Toolkit 编译时做页面预渲染，此刻调用 Feature API（如 `storage.getSync`）会编译失败。因此：
- 所有 Feature 调用延后到页面生命周期（本项目统一 onReady 之后）。
- store 的 `load()` 只在页面 onReady/onShow 触发，绝不在模块顶层执行。

## 3. 定时器纪律

官方文档强制：setInterval/setTimeout 必须与 clearTimeout/clearInterval 配对（内存泄漏排查工具会检测）。本项目：
- Home 页 1 秒 tick：onReady/onShow 启动、onHide/onDestroy 清理。
- tick 内用 liveSig（状态+时段 id 签名）判断——只有状态切换才全量 refresh，否则仅更新倒计时文本，避免后台渲染堆积。

## 4. 数据可靠性与迁移

- 主存：`storage.set({key:'timetable_data_v1', value: <对象>})`（官方支持直接存对象）。
- 快照：`internal://files/timetable_snapshot.json`（files 目录长期有效、随应用卸载删除）。写前比对 JSON 串，内容无变化不重复写。
- 读取链：主存 getSync → sanitize 结构校验修复 → 失败则读快照 → 再失败重置默认 + toast。
- `version` 字段预留迁移（migrate 函数入口）。

## 5. vw-alert 事件契约（实证）

从模拟器内置组件包（com.vivo.component）编译产物中确认：
- props：`title/content/des/buttons`（无 icon 必填）。
- 按钮 `eventType` 即事件名：`onBtnClick` 实现为 `this.$emit(data.eventType, data)`。
- 因此监听写法为 `onconfirm="..."` / `oncancel="..."`（对应 buttons 数组里的 eventType 值），不是 onbtnclick。

## 6. 布局引擎限制清单（写样式前必读）

- 仅 flex 布局；`flex: 1` 等未列入文档的属性禁止（会产生未定义布局问题）。
- border-radius 必须同时有 border-width + border-color 才生效。
- box-shadow / backdrop-filter / CSS transition 均不支持。
- scroll 容器不支持 margin/padding（内边距给内层 content div）。
- picker 的 type 不可动态修改；时间选择器 format="HH:mm"，change 返回 {hour,minute}；日期返回 {year,month,day}。
- router.push 的 params 值统一转 String；接收方在 data 中声明同名字段（本页 `day`）后框架自动映射。

## 6b. router.pages 键格式陷阱（实测踩坑，code 4000）

- **key 是 `src/` 下的相对目录路径，不是裸页面名**。编译器解析规则（hap-toolkit/lib/utils.js 实证）：`path.join(key, component)` 后在 `src/` 下找文件——key 写 `Home` 会去找 `src/Home/index.ux`，报「编译失败：请确认manifest.json中配置的文件路径存在：Home/index.ux (4000)」。
- 官方 Studio 模板（dsl-xvm/templates/app/demo）的写法是 `entry: "pages/Demo"`、`pages: { "pages/Demo": { "component": "index" } }`，页面目录 `src/pages/Demo/`。
- schema 文档「key 为页面名称（对应页面目录名）」的说法有歧义——目录名指 src 相对路径。
- 页面跳转 uri 两种合法形式：绝对路径 `/pages/Xxx`（官方模板自用形式，推荐）或页面名称（= key）`pages/Xxx`。本工程统一用 `/pages/Xxx`。
- 防回归：`scripts/check-consistency.mjs` 已内置两条规则——key 必须含目录前缀、跳转 uri 必须命中 router.pages。

## 6c. for 循环内事件传参必须用 $idx（实测踩坑：点击/长按无反应）

- 自定义变量名形式 `for="{{row in rows}}"` 下，事件表达式 `onclick="fn($item)"` 的 `$item` 为 undefined → handler 被防御性 return 吞掉 → 表现为「点击/长按完全无反应」。
- 依据：官方文档《事件传参》示例只在默认形式 `for="{{list}}"` 下用 `$item`；《列表渲染》明确自定义变量形式「索引仍默认为 $idx」，通篇未说命名形式保留 `$item`；引擎字符串表证实事件表达式以 `function($item,$idx,...)` 签名求值但命名变量未注入事件作用域。
- 规则：**for 内事件传参一律 `$idx`，handler 首行按索引从数据数组取回条目**（`this.rows[idx]`）。无参函数（如固定按钮）不受影响。
- 防回归：grep `$item` 应为 0 命中。

## 6d. progress 组件的 type 枚举是 horizontal|circular，没有 arc（实测踩坑）

- 编译器校验表（compiler/lib/template/validator.js）：`progress:{attrs:{type:{enum:["horizontal","circular"]}}}`。写 `type="arc"` 被编译器**静默丢弃**回退 horizontal——截图上「缺口朝上的歪环」就是横条进度被绝对定位叠出来的效果。
- 官方文档汇总里的 `type: horizontal|arc` 描述与 Studio 2.2.1 工具链不一致，以工具链校验表为准。
- 引擎也不支持 `start-angle`/`total-angle` 样式（二进制 0 命中），不要写。
- 正确写法：`<progress type="circular" percent="{{pct}}" style="color:...; stroke-width:...; layer-color:...; width/height 等宽">`。
- 防回归：build 产物中 `"type":"horizontal"` 不应出现（除非真想用横条）。

## 6e. Studio「Cannot read properties of null (reading 'compile')」与工程无关

- 该错误出现在 Studio 编译日志，堆栈指向 `blueos-debugger/dist/extension.js` 的 `reportCompileTime`（编译耗时遥测上报）。renderer.log 中 63 次重复。
- 工程源码经 `hap build`（出 rpk）与 `hap server`（web 预览全页 200）双路径验证均编译正常；模拟器日志（`%APPDATA%/BlueOS Studio/logs/*/window*/output_*/project.log`）显示应用实际已运行。
- 遇到此报错先看模拟器是否已在运行，不要按编译失败排查。

## 6f. picker 声明高度 ≠ 渲染高度：一律「字段行 + 单 picker 展开」（实测踩坑）

- 现象：编辑面板里并排放 2-3 个小高度 picker（110~150px）时，滚轮实际渲染内容超出声明高度，视觉上与上下 label/按钮重叠。
- 规则：**一个面板同一时刻只显示一个 picker**。表单一律做成「字段行（label + 当前值，点击展开）+ `if` 控制的单个 picker，选完自动收起」模式（本工程 `subMode` 模式，见 Edit/Periods）。
- 例外：Countdowns 页经用户要求已回退为「label + 双 picker 直显」旧版（2026-09-05，用户偏好直显）——勿再擅自改回 subMode。
- 【2026-09-05 修正】picker 高度必须 ≥300px（官方滚轮默认字号 40px/选中 56px，滚轮盒需要大空间）。实测 130~160px 会触发引擎错误 `PickerBoxRenderElement height is too small`，伴随 `adjust_scroller initial:-2147483648`（初始偏移 int32 溢出）——表现为滚轮错位叠字、选中不生效、整块空白。此前记录的「130~180px 经验值」是错误结论。`selected-background-color` 设为半透明色块辅助聚焦。
- 防回归：模板中同时可见的 `<picker` 数量（不叠 if 的）每页 ≤ 2。

## 6g. 定宽文本溢出：大数字自适应字号

- 主页倒计时跨小时时为 `H:MM:SS` 8 字符，56px bold 在 250px 宽信息区放不下，末位被裁（`02:03:5`）。
- 规则：等宽感数字文本用 `style="font-size: {{ text.length >= 7 ? '42px' : '56px' }};"` 按长度切换字号；时间类短文本（如 `07:20`）显式 `lines: 1` 防在冒号处折行。

## 7. 环境事实（2026-09-05 实测）

- BlueOS Studio 2.2.1 安装于 `%LOCALAPPDATA%\Programs\BlueOSStudio`（VS Code 基座）。
- 内置工具链 hap-toolkit 1.9.14；模板 scripts：`hap server --watch` / `hap build` / `hap release` / `hap debug`。
- 模板 package.json 含 `"gen": "node ./scripts/gen/index.js"`（页面生成器，本工程未用——手工管理页面注册）。
- 模拟器支持 watch-round；宿主工程 designWidth 466。
## 6h. file.readText 只有异步形态：严禁在同步流程里等回调（实测踩坑）

- 现象：快照恢复在 load() 里同步调用 readText({uri, success})，随后立即读结果变量——回调尚未执行，恢复恒不生效；主存损坏时直接重置用户数据。
- 规则：涉及恢复/补偿的异步读取，在 app.ux onCreate 预热发起、回调落缓存，后续同步流程只读缓存（本工程 store.primeSnapshot）。

## 6i. storage 写入只有异步 set（无 setSync）：value 一律 JSON 字符串化 + 失败必须可见（实测决策）

- 官方 set/getSync 的 value 名义支持 Object/Array，但真机固件序列化行为不一；本工程统一 JSON.stringify 写入、读出后 parse（兼容旧对象形态）。
- set 需带 fail 回调；persist 返回成败，失败 toast『保存失败，请重试』，禁止静默吞错。
- getSync 抛异常≠数据损坏：瞬态故障时只用内存数据、不重置主存（防误清空放大）。
## 6j.  仅存在于 for 循环作用域：静态元素 onclick 传  = undefined（实测踩坑）

- 现象：作息面板的 名称/开始/结束/类型 四个静态按钮绑 onclick="onSeg()"，编译产物为 onSeg(this.)；非 for 元素上 this. 是 undefined，点击后 segSel=undefined，四个条件分支全灭、picker 整块卸载——表现为『点击无反应』『滚轮字段丢失』。
- 规则：/ 只在 for 循环内可用；静态多按钮一律用独立无参处理函数（onSegName/onSegStart/...，同 onPrevDay 模式），不做 onclick 字面量传参依赖。
## 6k. 编辑表单禁用「遮罩面板 + 条件挂载 picker」：一律独立路由页 + 控件全静态常驻（真机卡死换实现）

- 现象：作息编辑用 absolute 遮罩面板 + seg 切换 if 挂载 picker，真机点击即卡死（模拟器可复现层级/焦点异常）。
- 规则：编辑表单一律独立路由页（router.push 传 id 参数），picker 等控件全部静态常驻、无条件分支；草稿字段平铺在 data（pName/pStart/...），不用嵌套对象绑定；保存/删除后 router.back()。遮罩面板只允许放按钮/输入框等无滚轮控件（Edit 选择课程面板）。
