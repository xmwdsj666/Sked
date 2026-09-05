# attic/ble-import — 已撤销的 BLE 课表导入通道

2026-09-05 用户决定：**不再做「手机端（orbitV App）→ 手表」的课表推送，课表编辑全部在手表端完成**。整条 BLE 导入链路从工程中移除并归档于此，以备将来反悔时恢复。

## 归档内容

| 文件 | 原位置 | 说明 |
| --- | --- | --- |
| `src/core/bleproto.js` | 同左 | 纯函数协议层：CRC16-CCITT、UTF-8 编解码、begin/chunk/end 会话状态机、mergeImport 合并 |
| `src/ble/bleServer.js` | 同左 | GATT Server（外设）生命周期：广播、写订阅、回执 notify |
| `src/pages/Import/index.ux` | 同左 | 导入确认页（应用/忽略） |
| `tests/sync-protocol.test.mjs` | 同左 | 16 项协议单测（归档时全绿） |
| `docs/ORBITV-PROTOCOL.md` | 同左 | orbitV 对接规范（UUID、GATT 表、JSON Schema、流程） |

同步从工程中摘除的接线（未归档，恢复时需重写）：

- `src/manifest.json`：`blueos.bluetooth.ble` feature、`blueos.permission.BLUETOOTH` 权限、`config.background.features`、`pages/Import` 路由
- `src/app.ux`：onCreate 启动 bleServer + 订阅 import 事件拉起确认页、onDestroy 停止
- `src/helper/sys.js`：`ble()` accessor（双命名空间探测 `createGattServer`）
- `src/pages/Settings/index.ux`：「课表导入」卡片与 goImport handler
- `package.json` test 脚本中的 sync-protocol.test.mjs

## 若要恢复

1. 把 `src/**` 各文件放回原位（Import 页需在 manifest router 重新注册）
2. 重做上面「同步摘除」清单里的 5 处接线
3. `npm test` 应为 38 项（22 课表 + 16 协议）
4. 协议细节直接看 `docs/ORBITV-PROTOCOL.md`，UUID/分片/回执定义未变
