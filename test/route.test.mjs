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

test('未知路由 404，非 GET 405', async () => {
  const res = makeRes();
  await handler({ method: 'GET', url: '/dsh-status-2417/nope' }, res);
  assert.equal(res.statusCode, 404);

  const res2 = makeRes();
  await handler({ method: 'POST', url: '/dsh-status-2417/summary' }, res2);
  assert.equal(res2.statusCode, 405);
  assert.equal(res2.headers.allow, 'GET, HEAD');
});
