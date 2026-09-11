# orbitV ↔ 高中课表（BlueOS 手表）BLE 对接规范

> 版本 1.0（2026-09-05）。本文档供 orbitV（Android 手机 App）开发者实现课表推送。
> 手表侧实现见本工程 `src/ble/bleServer.js` 与 `src/core/bleproto.js`（协议纯函数已单测覆盖）。

## 1. 角色与链路

| 角色 | 设备 | BLE 角色 |
| ---- | ---- | ---- |
| 接收端 | vivo 手表（BlueOS 蓝河应用「高中课表」） | 外设 Peripheral / GATT Server |
| 发送端 | orbitV App | 中心 Central / GATT Client |

- 使用标准 Android BLE API（`BluetoothLeScanner` + `BluetoothGatt`），无需任何 vivo SDK/资质。
- 手表应用需处于运行状态（前台或后台驻留；应用启动即开始广播）。
- 手表不支持同时被多台手机连接；已有连接期间 orbitV 应等待。

## 2. 广播（Advertising）

| 项 | 值 |
| ---- | ---- |
| 可连接 | 是（connectable） |
| 服务 UUID（主） | `8e400001-f2b3-4f5e-9a1c-3d7a9c5b1e01` |
| 广播名前缀 | `TTBL`（扫描响应 manufacture data 中亦携带 ASCII "TTBL"） |

orbitV 扫描建议：按服务 UUID `8e400001-…` 过滤；名字辅助校验（`ScanRecord.getDeviceName()` 以 TTBL 开头或 manufactureId 为 "TTBL"）。

## 3. GATT 服务定义

Service UUID：`8e400001-f2b3-4f5e-9a1c-3d7a9c5b1e01`

| 特征 | UUID | 属性 | 用途 |
| ---- | ---- | ---- | ---- |
| 控制 | `8e400002-f2b3-4f5e-9a1c-3d7a9c5b1e01` | Write | 会话指令（JSON 文本，UTF-8） |
| 数据 | `8e400003-f2b3-4f5e-9a1c-3d7a9c5b1e01` | Write Without Response | 课表 JSON 分片（UTF-8 字节流） |
| 状态 | `8e400004-f2b3-4f5e-9a1c-3d7a9c5b1e01` | Read + Notify + Indicate | 手表回执（JSON 文本，UTF-8） |

状态特征带 CCCD（`00002902-0000-1000-8000-00805f9b34fb`），orbitV 连接后应**先订阅状态特征 Notify** 再开始传输。

## 4. 传输会话流程

```
orbitV                                   手表
  │ ① Write 控制  {"op":"begin","size":N,"crc":C}      │
  │ ←Notify 状态  {"code":0}                            │
  │ ② WriteNoRsp 数据特征 × K 片（顺序发送）             │
  │ ←Notify 状态  {"code":0}（每片可选，片失败立即停）    │
  │ ③ Write 控制  {"op":"end","crc":C}                  │
  │   （手表整包 CRC16-CCITT 校验 + JSON 解析 + 结构校验）│
  │ ←Notify 状态  {"code":0,"message":"awaiting confirm"}│
  │   …手表弹出确认页，用户选择后…                        │
  │ ←Notify 状态  {"code":7}（应用）或 {"code":6}（忽略） │
  │ ④（可选）Write 控制 {"op":"abort"} 中止当前会话       │
```

- 单片建议 ≤ 200 字节（MTU 未知时的保守值；整包通常 < 8KB，即 ≤ 40 片）。
- 会话期间若收到新 `begin`，手表重置会话重新接收。
- 超时与重试由 orbitV 负责：手表侧会话无超时（保持等待 `end`/`abort`），orbitV 应在 10s 无进展时 `abort` 重来。
- 断连：手表清空会话并重新广播；orbitV 重连后从头传输。

## 5. 指令定义（控制特征）

### begin
```json
{"op":"begin","size":12345,"crc":41873}
```
- `size`：整包（完整 JSON 文本）UTF-8 字节数。
- `crc`：整包 CRC16-CCITT（poly 0x1021，初值 0xFFFF；校验向量："123456789" → 0x29B1）。

### end
```json
{"op":"end","crc":41873}
```
`crc` 必须与 begin 一致；不符回 `code:4`。

### abort
```json
{"op":"abort"}
```

## 6. 手表回执（状态特征 Notify/Read）

```json
{"code":0,"message":"begin ok"}
```

| code | 含义 | orbitV 处置 |
| ---- | ---- | ---- |
| 0 | OK / 阶段性成功 | 继续 |
| 1 | 忙碌（保留） | 稍后重试 |
| 2 | 未 begin 就发数据 | 重新 begin |
| 3 | 超过 64KB 上限 / 分片超限 | 缩减数据 |
| 4 | 整包 CRC 不符 | 重传 |
| 5 | 结构校验失败 | 修正 JSON |
| 6 | 用户在手表上选择「忽略」 | 结束，不重试 |
| 7 | 用户已「应用」，导入成功 | 结束（可提示用户） |
| 8 | 控制/数据 JSON 解析失败 | 修正 JSON |

## 7. 课表 JSON 格式（信封 + 数据）

整包 JSON 结构：

```json
{
  "proto": 1,
  "app": "orbitV",
  "exportedAt": "2026-09-05T12:00:00+08:00",
  "data": { ... 课表数据 ... }
}
```

- `proto`：协议版本，当前固定 `1`。不符回 `code:5`。
- `data` 字段（全部可选，但**全空会被拒绝**——避免误清空；至少要有一项有效内容）：

| 字段 | 类型 | 说明 |
| ---- | ---- | ---- |
| semesterStart | "YYYY-MM-DD" | 学期起始日（任意一天，手表自动对齐周一）；缺省沿用手表本地值 |
| subjects | [{id?, name, color?}] | 科目；name 必填（≤8 字），id 可省（自动生成），color 可省（自动配色板）；同名去重 |
| periods | [{id?, name, start, end, type?}] | 作息时段；name ≤10 字，start/end "H:MM" 或 "HH:MM"（自动归一化补零），type "class"（默认）或 "break"；同名去重；同 id 重复剔除 |
| courses | {"1".."7": [条目]} | 键为周一..周日（"1"=周一）；条目见下；同 时段+周次 重复剔除 |
| countdowns | [{kind, name, date}] | kind "exam"/"holiday"；name ≤10 字；date "YYYY-MM-DD"，非法日期剔除 |

课程条目（科目/时段支持按名称引用，手表端自动匹配或建档）：

```json
{
  "subjectId": "sx01",        // 与 subjectName 二选一；名称不存在时自动建科目
  "subjectName": "物理",       // ≤8 字
  "periodId": "p1",           // 与 periodName 二选一；名称不存在时自动建 08:00-08:45 时段
  "periodName": "第二节",      // ≤10 字
  "weekType": "all"           // "all"（默认）| "odd" 单周 | "even" 双周
}
```

### 最小可用示例

```json
{
  "proto": 1,
  "app": "orbitV",
  "data": {
    "semesterStart": "2026-08-31",
    "subjects": [{"name": "语文"}, {"name": "数学"}, {"name": "英语"}],
    "periods": [
      {"name": "早读", "start": "07:20", "end": "07:50"},
      {"name": "第一节", "start": "08:00", "end": "08:45"},
      {"name": "第二节", "start": "08:55", "end": "09:40"}
    ],
    "courses": {
      "1": [
        {"subjectName": "语文", "periodName": "早读"},
        {"subjectName": "数学", "periodName": "第一节"},
        {"subjectName": "英语", "periodName": "第二节"}
      ],
      "2": [{"subjectName": "数学", "periodName": "第一节", "weekType": "odd"}]
    },
    "countdowns": [{"kind": "exam", "name": "月考", "date": "2026-10-09"}]
  }
}
```

## 8. 导入语义（手表端行为）

1. CRC 校验通过 → JSON 解析 → 结构归一化（去重/补 id/配色/时间归一化）。
2. **有科目但无合法时段 → 拒绝**（code 5）；**完全空载荷 → 拒绝**（防误清空；清空请用手表设置页「恢复默认数据」）。
3. 校验通过后手表**弹出确认页**，展示摘要（学期起始/科目数/时段数/课程数/倒计时数），用户选择：
   - 应用：覆盖本地全部数据，回 `code:7`；
   - 忽略：不动本地数据，回 `code:6`。
4. 导入不影响手表上正在进行的其他操作；应用在下一次打开各页面时加载新数据。

## 9. 限制与注意事项

- 单包上限 64KB（`MAX_PAYLOAD`）；超出回 `code:3`。
- 手表 BLE GATT 无 MTU 协商 API 文档——分片严格按 ≤200 字节；`Write Without Response` 不保证送达，orbitV 可按片间隔 20ms 保守发送。
- 手表应用被用户手动结束后广播停止；orbitV 扫描不到时提示用户先打开手表上的「高中课表」。
- 后台驻留依赖系统策略（manifest 已声明 `background.features: ["blueos.bluetooth.ble"]`）；若真机后台仍暂停，则退化为「打开应用期间可接收」模式。
- 协议版本升级（`proto` 2+）未来兼容由手表端 `migrate` 钩子处理；orbitV 当前固定上报 1。
