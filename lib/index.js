/**
 * 宿主半侧：把状态页抓取、热度聚合与 AI 话题包成同源 JSON 路由。
 *
 * 为什么需要宿主：状态页与多数新闻源不带 Access-Control-Allow-Origin，浏览器直连会被 CORS 拦。
 * 必须始终成立：路由只读；URL 只接受 GET/HEAD；错误统一 JSON 化并带可读原因。
 * web 搜索服务不是硬依赖：没有它时只降级 AI 话题，状态与热度照常工作。
 * @module dsh-status-dashboard/lib/index
 */
import { getSummary } from './status.js';
import { getHeat, peekHeat } from './heat.js';
import { getAiTopics } from './search.js';

/** 与 client.js 里的 ROUTE_SEGMENT 保持一致。 */
const ROUTE_SEGMENT = '/dsh-status-2417';
const AI_MIN_INTERVAL_MS = 3_000;

/** Cordis 插件名（与 cordis.patch.yml 的 name 对应）。 */
export const name = 'status-dashboard';

/** 只依赖 webServer；web 搜索按需通过 ctx.get('web') 取。 */
export const inject = ['webServer'];

function sendJson(res, status, body) {
  const text = JSON.stringify(body);
  res.statusCode = status;
  res.setHeader('content-type', 'application/json; charset=utf-8');
  res.setHeader('cache-control', 'no-store');
  res.setHeader('x-content-type-options', 'nosniff');
  res.end(text);
}

export function apply(ctx) {
  let lastAiAt = 0;

  // 预热：启动后抓一轮，之后每 10 分钟一次；timer unref，测试/退出不被挂住。
  if (process.env.DSH_STATUS_DISABLE_WARMUP !== '1') ctx.effect(() => {
    let alive = true;
    const tick = () => {
      if (!alive) return;
      getSummary().catch(() => {});
      getHeat().catch(() => {});
    };
    const first = setTimeout(tick, 3_000);
    const timer = setInterval(tick, 10 * 60_000);
    if (typeof first.unref === 'function') first.unref();
    if (typeof timer.unref === 'function') timer.unref();
    return () => {
      alive = false;
      clearTimeout(first);
      clearInterval(timer);
    };
  }, 'dsh-status: warmup');

  ctx.effect(
    () =>
      ctx.webServer.register({
        kind: 'prefix',
        path: ROUTE_SEGMENT,
        handler: async (req, res) => {
          const method = req.method || 'GET';
          if (method !== 'GET' && method !== 'HEAD') {
            res.setHeader('allow', 'GET, HEAD');
            sendJson(res, 405, { ok: false, error: 'method not allowed' });
            return;
          }
          let url;
          try {
            url = new URL(req.url || '/', 'http://localhost');
          } catch {
            sendJson(res, 400, { ok: false, error: 'bad request' });
            return;
          }
          const rest = url.pathname.slice(ROUTE_SEGMENT.length).replace(/\/+$/, '') || '/';
          if (rest !== '/summary' && rest !== '/heat' && rest !== '/ai-topics' && rest !== '/health') {
            sendJson(res, 404, { ok: false, error: 'not found' });
            return;
          }
          if (rest === '/health') {
            sendJson(res, 200, {
              ok: true,
              service: 'dsh-status-dashboard',
              time: Date.now(),
              heat: peekHeat(),
            });
            return;
          }
          const force = url.searchParams.get('force') === '1';
          const hard = url.searchParams.get('hard') === '1';
          try {
            if (rest === '/ai-topics') {
              const now = Date.now();
              if (now - lastAiAt < AI_MIN_INTERVAL_MS) {
                sendJson(res, 429, { ok: false, error: '请求过于频繁，请稍后重试' });
                return;
              }
              lastAiAt = now;
              const seed = url.searchParams.get('seed') || String(now);
              const interests = (url.searchParams.get('interests') || '')
                .split(',')
                .map((item) => item.trim())
                .filter(Boolean)
                .slice(0, 3);
              const data = await getAiTopics(ctx, { seed, interests });
              sendJson(res, 200, { ok: true, data });
              return;
            }
            const data = rest === '/heat' ? await getHeat({ force, hard }) : await getSummary(hard);
            sendJson(res, 200, { ok: true, data });
          } catch (error) {
            const message = error && error.message ? error.message : String(error);
            console.warn('[dsh-status] ' + rest + ' 失败：' + message);
            sendJson(res, 502, { ok: false, error: message });
          }
        },
      }),
    'dsh-status: http route',
  );
}
