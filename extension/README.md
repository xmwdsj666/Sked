# Sked OrbitV 扩展程序

vivo 手机「轻腕 (OrbitV)」内运行的 Sked 配套程序，appId `com.qwq.sked`，
与手表端 Sked hap 按包名配对。

- 手机端编辑：课程（科目/颜色）、周课表、作息时段
- 备份导出：手表数据备份到手机后可导出 JSON 文件
- 手表端入口：设置 → 手机同步（从手机导入 / 备份到手机）

通信方向：一切由手表主动发起；本扩展程序页面必须保持打开。

开发：`npm install` → `npm run dev`（浏览器预览布局）→ `npm run package`
（产出 `release/com.qwq.sked-<version>.ovpkg`，手机文件管理器点击安装进轻腕）。
