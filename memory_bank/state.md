阶段:八/八 | 任务:删单双周+编辑页按天视图重构 | 进度:5/5 | 下步:真机侧载验证新编辑页 | 暂停:无

## 快照
- 项目：sked（BlueOS 手表课表应用，原名高中课表/blueos-timetable，圆屏+方屏 466）
- 新周期：修正案 #3——单双周删除、编辑页改「‹周X›切换 + 第N节列表 + 选择课程面板」（轻课表风格）

## 已冻结决策（含新增）
1. API 双命名空间兼容层（helper/sys.js），manifest 双套 feature 并行声明。
2. designWidth 466；deviceTypeList watch-round + watch-square。
3. storage 主存 + internal://files 快照；sanitize 校验链。
4. 页面 6 个：Home(singleTask)/Week/Edit/Settings/Periods/Countdowns。
5. 手写 store 零依赖；core 纯函数 Node 可单测。
6. 【撤销】BLE 导入通道：实现整体归档 attic/ble-import/（修正案 #2）。
7. 【新】单双周功能整体删除（修正案 #3）：courses 条目={subjectId,periodId}；旧 weekType 字段容忍但忽略；周次「第 N 周」计算保留；weekParity/isOddWeek 已从 core 移除。
8. 【新】subjects 支持自定义科目：{id:'c_'+genId, name, color: CUSTOM_COLORS[总数%10], custom:true}；同名复用不重建；不可删除只能清空节次。
9. 【新】Edit 页交互：‹›切天（循环）、点行弹底部面板（absolute 覆盖 .page，非 fixed）、面板内‹返回键关闭、预设/自定义分组、input type=text+确定新增、清空当前红色按钮；选完科目即存即关面板。

## 完成证据
- 单测 22/22（coursesForDay/sanitize 用例已按无单双周语义重写）
- check-ux-script / check-consistency 全绿；hap build 出 rpk（82KB）
- 产物 grep：weekType/单周/双周 0 残留

## 遗留（需真机）
- [ ] 真机验证新编辑页：面板弹出/收起、input 拉起手表输入法、‹›切天
- [ ] 真机回归：主页/周视图/倒计时/设置（旧数据含 weekType 时是否正常显示）

## 遗留（需真机）
- [ ] 真机验证新编辑页：面板弹出/收起、input 拉起手表输入法、‹›切天
- [ ] 真机回归：主页/周视图/倒计时/设置（旧数据含 weekType 时是否正常显示）

## 错误模式清单（维护时规避）
- 禁 flex:1 / box-shadow / backdrop-filter / CSS transition；渐变只支持方向语法
- for 循环内事件传参必须 $idx（$item 是 undefined）；handler 按 this.rows[idx] 取条目
- progress 的 type 枚举只有 horizontal|circular（无 arc）；start-angle/total-angle 不支持
- Feature API 禁止模块加载期调用；setInterval/onDestroy 配对；picker type 不可动态改；require 必须字面量
- router.pages 键=src 相对路径（pages/Xxx）；跳转 uri 用 /pages/Xxx
- picker 实际渲染高>声明高：面板内单 picker 展开（subMode 模式）；Countdowns 页按用户要求保持双 picker 直显
- 定宽大数字按长度自适应字号；时间列 lines:1
- npm test 指向具体文件列表；字符串替换注意保留媒体查询闭合 }
- 覆盖层用 absolute + .page position:relative（fixed/text-align/flex-grow 未验证勿用）；事件冒泡无法阻断，面板不放遮罩点击关闭，用面板内返回键
- npm test 指向具体文件列表；字符串替换注意保留媒体查询闭合 }
