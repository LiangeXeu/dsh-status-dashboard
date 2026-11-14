import test from 'node:test';
import assert from 'node:assert/strict';
import { getAiFeed, __resetAiFeedForTests, parseAiRss, AI_FEED_SOURCES } from '../lib/ai-feed.js';

const originalFetch = globalThis.fetch;
const HOUR = 3_600_000;

function rss(items) {
  return '<?xml version="1.0"?><rss><channel>' + items.map((item) =>
    '<item><title><![CDATA[' + item.title + ']]></title><link>' + item.url + '</link>' +
    '<pubDate>' + new Date(item.at).toUTCString() + '</pubDate>' +
    '<description><![CDATA[' + (item.summary || '') + ']]></description></item>'
  ).join('') + '</channel></rss>';
}

test('parseAiRss 解析 item 与时间', () => {
  const xml = rss([{ title: 'OpenAI 发布新模型', url: 'https://a.com/1', at: Date.now(), summary: '摘要' }]);
  const items = parseAiRss(xml);
  assert.equal(items.length, 1);
  assert.equal(items[0].title, 'OpenAI 发布新模型');
  assert.equal(items[0].url, 'https://a.com/1');
  assert.ok(items[0].at > 0);
});

test('只保留 24 小时内的 AI 条目，且每条流单源不超过 4 条', async (t) => {
  t.after(() => { globalThis.fetch = originalFetch; __resetAiFeedForTests(); });
  __resetAiFeedForTests();
  const now = Date.now();
  globalThis.fetch = async (url) => {
    const id = String(url);
    if (id.includes('techcrunch')) {
      return new Response(rss(Array.from({ length: 8 }, (_, i) => ({
        title: 'OpenAI 第 ' + i + ' 条新闻', url: 'https://tc.com/' + i, at: now - i * 600_000,
      }))), { status: 200 });
    }
    if (id.includes('verge')) {
      return new Response(rss([
        { title: 'Anthropic Claude 新政策', url: 'https://v.com/1', at: now - HOUR },
        { title: '无关的体育新闻', url: 'https://v.com/2', at: now - HOUR },
        { title: 'Nvidia 芯片旧闻', url: 'https://v.com/3', at: now - 48 * HOUR },
      ]), { status: 200 });
    }
    return new Response('', { status: 500 });
  };
  const data = await getAiFeed({ force: true });
  assert.equal(data.ok, true);
  assert.equal(data.windowHours, 24);
  assert.equal(data.limit, 30);
  assert.equal(data.items.filter((item) => item.source === 'techcrunch').length, 4);
  assert.equal(data.items.some((item) => /无关的体育/.test(item.title)), false);
  assert.equal(data.items.some((item) => /旧闻/.test(item.title)), false);
  assert.equal(data.stale, false);
});

test('按时间倒序且标题去重', async (t) => {
  t.after(() => { globalThis.fetch = originalFetch; __resetAiFeedForTests(); });
  __resetAiFeedForTests();
  const now = Date.now();
  globalThis.fetch = async (url) => {
    const id = String(url);
    if (id.includes('techcrunch')) return new Response(rss([{ title: 'OpenAI 同一条', url: 'https://tc.com/a', at: now - HOUR }]), { status: 200 });
    if (id.includes('verge')) return new Response(rss([{ title: 'OpenAI 同一条', url: 'https://v.com/b', at: now - 2 * HOUR }]), { status: 200 });
    if (id.includes('wired')) return new Response(rss([{ title: 'Gemini 更新', url: 'https://w.com/c', at: now - 30 * 60_000 }]), { status: 200 });
    return new Response('', { status: 500 });
  };
  const data = await getAiFeed({ force: true });
  const titles = data.items.map((item) => item.title);
  assert.equal(titles.filter((title) => title === 'OpenAI 同一条').length, 1);
  assert.equal(titles[0], 'Gemini 更新');
});

test('全部源失败且无缓存时抛出', async (t) => {
  t.after(() => { globalThis.fetch = originalFetch; __resetAiFeedForTests(); });
  __resetAiFeedForTests();
  globalThis.fetch = async () => { throw new Error('network down'); };
  await assert.rejects(() => getAiFeed({ force: true }), /AI 媒体源全部不可用/);
});

test('有缓存时全源失败回退上次快照并标记 stale', async (t) => {
  t.after(() => { globalThis.fetch = originalFetch; __resetAiFeedForTests(); });
  __resetAiFeedForTests();
  const realNow = Date.now;
  globalThis.fetch = async () => new Response(rss([{ title: 'OpenAI 正常', url: 'https://a.com/1', at: realNow() }]), { status: 200 });
  const good = await getAiFeed({ force: true });
  assert.equal(good.items.length, 1);
  globalThis.fetch = async () => { throw new Error('network down'); };
  Date.now = () => realNow() + 11 * 60_000;
  try {
    const stale = await getAiFeed({ force: true });
    assert.equal(stale.stale, true);
    assert.equal(stale.items.length, 1);
    assert.match(String(stale.error), /全部不可用/);
  } finally {
    Date.now = realNow;
  }
});

test('缓存命中不重复请求', async (t) => {
  t.after(() => { globalThis.fetch = originalFetch; __resetAiFeedForTests(); });
  __resetAiFeedForTests();
  let calls = 0;
  globalThis.fetch = async () => { calls += 1; return new Response(rss([{ title: 'OpenAI', url: 'https://a.com/1', at: Date.now() }]), { status: 200 }); };
  await getAiFeed({ force: true });
  const first = calls;
  await getAiFeed({ force: false });
  assert.equal(calls, first);
});

test('源清单稳定且都是 https', () => {
  assert.ok(AI_FEED_SOURCES.length >= 20);
  for (const source of AI_FEED_SOURCES) {
    assert.match(source.url, /^https:\/\//);
    assert.ok(source.id && source.name);
  }
});