阶段:十/十 | 任务:作息编辑改独立路由页（真机卡死换实现）| 进度:5/5 | 下步:真机回归验证 | 暂停:无

## 快照
- 项目：sked（BlueOS 手表课表应用，原名高中课表/blueos-timetable，圆屏+方屏 466）
- 新周期：修正案 #3——单双周删除、编辑页改「‹周X›切换 + 第N节列表 + 选择课程面板」（轻课表风格）

## 已冻结决策（含新增）
1. API 双命名空间兼容层（helper/sys.js），require 一律 try/catch 双回退（真机可能抛错）；manifest 双套 feature 并行声明。
2. designWidth 466；deviceTypeList watch-round + watch-square。
3. 【加固】持久层：主存 value 一律 JSON 字符串（getSync 读出 parse，兼容旧对象）；storage.set 无同步形态、必须带 fail 上报；快照由 app.ux onCreate primeSnapshot 预热（readText 仅异步）；getSync 异常（瞬态）不重置主存。
4. 页面 7 个：Home(singleTask)/Week/Edit/Settings/Periods/PeriodEdit/Countdowns。
5. 【新】单双周功能已删除（修正案 #3）；courses 条目={subjectId,periodId}。
6. 【新】subjects 支持自定义科目（custom:true，同名复用，CUSTOM_COLORS 轮换取色）。
7. 【新】编辑交互统一『草稿+显式保存』：Edit 选择课程面板与 Periods 编辑时段面板均为底部面板（absolute+.page relative），点行弹面板→草稿修改→『保存』写入+toast；清空/删除即时生效。
8. 【新】picker 规则：编辑表单一律独立路由页 + 控件全静态常驻（PeriodEdit），禁遮罩面板条件挂载 picker（真机卡死）；遮罩面板仅放按钮/输入框（Edit 选择课程面板）。保存显式按钮 + isValidPeriodRange 校验。

## 完成证据
- 单测 29/29（新增 store 注入式 5 项：往返/快照恢复/瞬态异常不重置/损坏重置/旧对象兼容；核心时段校验 2 项）
- check-ux-script / check-consistency 全绿；hap build 出 rpk（97KB）
- 产物含 onSaveCourse/isValidPeriodRange/已保存 toast

## 遗留（需真机）
- [ ] 真机持久化验证：编辑→保存→杀 App 重开→数据还在
- [ ] 真机验证 Periods 面板：time picker 拉起、四段切换、保存校验 toast
- [ ] 真机验证自定义科目输入（手表输入法）+ 保存链路

## 错误模式清单（维护时规避）
- 禁 flex:1 / box-shadow / backdrop-filter / CSS transition / flex-grow / text-align 依赖 / position:fixed；覆盖层用 absolute + .page position:relative
- picker selected=初始位置语义，change 回调禁回写绑定字段；picker 禁 loop 属性、高度保持 300px（loop+260px 组合出现 deliverPositionEvent 投递失败，已回滚）；跨工程模拟器污染注意重启 Studio；$idx/$item 仅 for 循环内有效：静态元素 onclick 传 $idx 得 undefined（用独立无参 handler）；for 内传参必须 $idx，handler 按 this.rows[idx] 取条目
- Feature API 禁止模块加载期调用；setInterval/onDestroy 配对；picker type 不可动态改、声明高度必须 ≥300px（过小触发 PickerBoxRenderElement height too small + 偏移溢出）；require 必须字面量（不许抽函数传变量）
- file.readText 仅异步——同步流程等回调=必失效；storage.set 仅异步+字符串化+fail 上报
- getSync 异常≠数据损坏，禁止在 repaired 分支无条件重置主存
- 事件冒泡无法阻断：面板不放遮罩点击关闭，用面板内返回键
- npm test 指向具体文件列表；字符串替换注意保留媒体查询闭合 }
