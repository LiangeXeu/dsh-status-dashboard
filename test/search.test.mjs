import test from 'node:test';
import assert from 'node:assert/strict';
import { getAiTopics, TOPIC_LIMIT, DEEPSEEK_QUOTA, SEARCH_COUNT } from '../lib/search.js';

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
  assert.equal(captured.body.count, 40);
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

test('话题上限 20 条，DeepSeek 只占配额，其余给全球 AI', async (t) => {
  t.after(() => { globalThis.fetch = originalFetch; });
  const now = Date.now();
  const results = [];
  for (let index = 0; index < 18; index += 1) {
    results.push({
      url: 'https://global.com/' + index,
      title: ['OpenAI 发布新模型 ' + index, 'Anthropic 政策更新 ' + index, 'Nvidia 芯片新闻 ' + index][index % 3],
      snippet: '全球 AI 行业动态',
      date: new Date(now - index * 600_000).toISOString(),
    });
  }
  for (let index = 0; index < 6; index += 1) {
    results.push({
      url: 'https://deepseek.com/' + index,
      title: 'DeepSeek 官方更新 ' + index,
      snippet: '深度求索发布',
      date: new Date(now - index * 900_000).toISOString(),
    });
  }
  globalThis.fetch = async () => new Response(JSON.stringify({ results }), { status: 200 });
  const ctx = { get: (name) => name === 'deepseekAccount' ? { resolveToken: async () => 'tok-1' } : undefined };
  const out = await getAiTopics(ctx, { seed: 'quota' });
  assert.equal(TOPIC_LIMIT, 20);
  assert.equal(SEARCH_COUNT, 40);
  assert.equal(out.items.length, 20);
  const deepseek = out.items.filter((item) => /deepseek|深度求索/i.test(item.title + ' ' + item.snippet));
  assert.ok(deepseek.length <= DEEPSEEK_QUOTA + 1, 'DeepSeek 条目不应超过配额，实际 ' + deepseek.length);
  const global = out.items.filter((item) => !/deepseek|深度求索/i.test(item.title + ' ' + item.snippet));
  assert.ok(global.length >= 15, '全球条目应占多数，实际 ' + global.length);
});

test('候选充足时只请求一次，不重复计费', async (t) => {
  t.after(() => { globalThis.fetch = originalFetch; });
  let calls = 0;
  const now = Date.now();
  globalThis.fetch = async () => {
    calls += 1;
    return new Response(JSON.stringify({ results: Array.from({ length: 30 }, (_, index) => ({
      url: 'https://x.com/' + index,
      title: 'OpenAI 新闻 ' + index,
      snippet: '',
      date: new Date(now - index * 600_000).toISOString(),
    })) }), { status: 200 });
  };
  const ctx = { get: (name) => name === 'deepseekAccount' ? { resolveToken: async () => 'tok-1' } : undefined };
  const out = await getAiTopics(ctx, { seed: 'single' });
  assert.equal(out.items.length, 20);
  assert.equal(calls, 1);
});
