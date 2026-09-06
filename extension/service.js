// 这段脚本运行在 OrbitV 的扩展程序服务环境中，负责注册供手表调用的被动 HTTP 接口，不参与 Vue 页面打包。
// Sked 数据契约：'sked.timetable' 存与手表 store 同构的完整 JSON
// （version/semesterStart/subjects/periods/courses/countdowns），页面与手表共用这一个基准。
(function () {
  'use strict';

  const TIMETABLE_KEY = 'sked.timetable';
  const UPDATED_AT_KEY = 'sked.timetable.updatedAt';

  function json(value, status) {
    return ov.server.json(value, {
      status: status || 200,
      headers: { 'cache-control': 'no-store' },
    });
  }

  function route(method, path, handler) {
    ov.server.route(method, path, async (request) => {
      try {
        return await handler(request);
      } catch (error) {
        console.error('[Sked]', method, path, error);
        return json({
          ok: false,
          error: {
            code: error.code || 'INTERNAL_ERROR',
            message: error.message || '处理请求失败',
          },
        }, error.status || 500);
      }
    });
  }

  /** 基础结构校验：subjects/periods/courses 三要素存在即认为可保存，细节由手表端 sanitize 兜底 */
  function plausibleTimetable(value) {
    return Boolean(value)
      && typeof value === 'object'
      && Array.isArray(value.subjects)
      && Array.isArray(value.periods)
      && value.courses
      && typeof value.courses === 'object';
  }

  async function start() {
    // 手表拉取：手机端编辑基准（404 = 页面还没编辑过或没收到过备份）
    route('GET', '/api/sked/timetable', async () => {
      const value = await ov.storage.get(TIMETABLE_KEY);
      if (!plausibleTimetable(value)) {
        return json({
          ok: false,
          error: {
            code: 'NOT_READY',
            message: '手机端还没有课表数据，先在扩展程序里编辑或接收手表备份',
          },
        }, 404);
      }
      return json({
        ok: true,
        value,
        updatedAt: await ov.storage.get(UPDATED_AT_KEY),
      });
    });

    // 手表备份：整包快照写入手机基准
    route('POST', '/api/sked/timetable', async (request) => {
      const value = await request.json();
      if (!plausibleTimetable(value)) {
        const err = new Error('数据结构不符合课表契约');
        err.code = 'BAD_PAYLOAD';
        err.status = 400;
        throw err;
      }
      const receivedAt = new Date().toISOString();
      await ov.storage.set(TIMETABLE_KEY, value);
      await ov.storage.set(UPDATED_AT_KEY, receivedAt);
      return json({ ok: true, receivedAt });
    });

    // 手表侧连通性自检
    route('GET', '/api/sked/ping', async () => json({
      ok: true,
      now: new Date().toISOString(),
    }));

    await ov.server.ready();
  }

  const ready = window.ov
    ? start()
    : new Promise((resolve) =>
        window.addEventListener('ovready', resolve, { once: true })
      ).then(start);

  ready.catch(console.error);
})();
