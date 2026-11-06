import test from 'node:test';
import assert from 'node:assert/strict';

process.env.DSH_STATUS_DISABLE_WARMUP = '1';
const { apply } = await import('../lib/index.js');

let handler;
const ctx = {
  effect: (fn) => fn(),
  webServer: { register: (spec) => { handler = spec.handler; return () => {}; } },
  get: () => undefined,
};
apply(ctx);

function makeRes() {
  return {
    statusCode: 0, headers: {}, body: '',
    setHeader(key, value) { this.headers[key] = value; },
    end(text) { this.body = text; },
  };
}

test('health 返回 200 与源快照字段', async () => {
  const res = makeRes();
  await handler({ method: 'GET', url: '/dsh-status-2417/health' }, res);
  assert.equal(res.statusCode, 200);
  const payload = JSON.parse(res.body);
  assert.equal(payload.ok, true);
  assert.ok('heat' in payload);
});

test('github-plugins 路由返回 200 与插件条目', async () => {
  const old = globalThis.fetch;
  globalThis.fetch = async () => new Response(JSON.stringify({
    items: [{ id: 9, full_name: 'a/dsh-x', html_url: 'https://github.com/a/dsh-x', description: 'x', pushed_at: new Date().toISOString(), stargazers_count: 1, language: 'TypeScript', topics: ['dsh-plugin'] }],
  }), { status: 200 });
  try {
    const res = makeRes();
    await handler({ method: 'GET', url: '/dsh-status-2417/github-plugins?force=1' }, res);
    assert.equal(res.statusCode, 200);
    const payload = JSON.parse(res.body);
    assert.equal(payload.ok, true);
    assert.equal(payload.data.items.length, 1);
    assert.equal(payload.data.items[0].title, 'a/dsh-x');
  } finally {
    globalThis.fetch = old;
  }
});

test('未知路由 404，非 GET 405', async () => {
  const res = makeRes();
  await handler({ method: 'GET', url: '/dsh-status-2417/nope' }, res);
  assert.equal(res.statusCode, 404);

  const res2 = makeRes();
  await handler({ method: 'POST', url: '/dsh-status-2417/summary' }, res2);
  assert.equal(res2.statusCode, 405);
  assert.equal(res2.headers.allow, 'GET, HEAD');
});
