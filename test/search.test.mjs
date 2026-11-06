import test from 'node:test';
import assert from 'node:assert/strict';
import { getAiTopics } from '../lib/search.js';

const originalFetch = globalThis.fetch;

test('账号 token 搜索并过滤非 http/https', async (t) => {
  t.after(() => { globalThis.fetch = originalFetch; });
  let captured;
  globalThis.fetch = async (url, init) => {
    captured = { url: String(url), headers: init.headers, body: JSON.parse(init.body) };
    return new Response(JSON.stringify({ results: [
      { url: 'https://a.com/1', title: 'DeepSeek 新模型', snippet: '发布', date: new Date().toISOString() },
      { url: 'javascript:alert(1)', title: 'DeepSeek bad', snippet: '', date: new Date().toISOString() },
      { url: 'https://a.com/1', title: 'DeepSeek 新模型', snippet: 'dup' },
    ] }), { status: 200 });
  };
  const ctx = { get: (name) => name === 'deepseekAccount' ? { resolveToken: async () => 'tok-1' } : undefined };
  const out = await getAiTopics(ctx, { seed: 'abc', interests: [] });
  assert.equal(out.via, 'account');
  assert.equal(out.items.length, 1);
  assert.equal(out.items[0].url, 'https://a.com/1');
  assert.equal(captured.headers['x-dsh-auth-token'], 'tok-1');
  assert.equal(captured.body.count, 20);
});

test('账号结果为空时回退 web 搜索', async (t) => {
  t.after(() => { globalThis.fetch = originalFetch; });
  globalThis.fetch = async () => new Response(JSON.stringify({ results: [] }), { status: 200 });
  const ctx = {
    get: (name) => {
      if (name === 'deepseekAccount') return { resolveToken: async () => 'tok-1' };
      if (name === 'web') return { search: async () => ({ sources: [{ url: 'https://web.com/1', title: 'DeepSeek web', publishedAt: new Date().toISOString() }] }) };
      return undefined;
    },
  };
  const out = await getAiTopics(ctx, { seed: 'x', interests: [] });
  assert.equal(out.via, 'web');
  assert.equal(out.items.length, 1);
  assert.equal(out.items[0].url, 'https://web.com/1');
});
