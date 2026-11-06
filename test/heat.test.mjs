import test from 'node:test';
import assert from 'node:assert/strict';
import { getHeat, __resetHeatForTests, scoreText } from '../lib/heat.js';

const now = Date.now();
const rss = '<rss><channel><item><title>DeepSeek 发布新版本</title><link>https://example.com/a</link><description>DeepSeek 更新</description><pubDate>' + new Date(now).toUTCString() + '</pubDate></item></channel></rss>';

function stubFetch() {
  globalThis.fetch = async (url) => {
    const target = String(url);
    if (target.includes('hn.algolia.com')) {
      return new Response(JSON.stringify({ hits: [
        { objectID: '1', title: 'DeepSeek 新模型发布', url: 'https://example.com/hn1', created_at_i: Math.floor(now / 1000), points: 10, num_comments: 3 },
        { objectID: '2', title: 'DeepSeek 性能下降', url: 'https://example.com/hn2', created_at_i: Math.floor(now / 1000), points: 2, num_comments: 1 },
      ] }), { status: 200 });
    }
    if (target.includes('api.github.com')) {
      return new Response(JSON.stringify({ items: [
        { id: 3, title: 'DeepSeek issue', html_url: 'https://github.com/x/y/issues/1', created_at: new Date(now).toISOString(), comments: 1, reactions: { total_count: 2 } },
      ] }), { status: 200 });
    }
    return new Response(rss, { status: 200 });
  };
}

test('scoreText 使用英文词边界与多字中文', () => {
  assert.equal(scoreText('download the model'), 0);
  assert.equal(scoreText('breakfast menu'), 0);
  assert.equal(scoreText('差距很大'), 0);
  assert.ok(scoreText('服务故障') < 0);
  assert.ok(scoreText('性能强劲') > 0);
});

test('全部源失败时回退上次完整快照', async () => {
  __resetHeatForTests();
  stubFetch();
  const first = await getHeat({ hard: true, force: true });
  assert.ok(first.counts.items > 0);
  assert.equal(first.stale, false);
  assert.ok(first.feed.every((item) => typeof item.sourceId === 'string'));
  assert.ok(Array.isArray(first.hnFeed));
  assert.ok(first.hnFeed.every((item) => item.sourceId === 'hn'));
  assert.ok(first.feed.some((item) => item.sourceId === 'github'));

  globalThis.fetch = async () => { throw new Error('network down'); };
  const second = await getHeat({ hard: true, force: true });
  assert.equal(second.stale, true);
  assert.ok(second.counts.items > 0);
  assert.ok(second.error && second.error.includes('全部'));
});
