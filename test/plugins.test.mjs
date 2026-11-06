import test from 'node:test';
import assert from 'node:assert/strict';
import { getGithubPlugins, peekGithubPlugins, __resetGithubPluginsForTests } from '../lib/plugin-feed.js';

function repo(id, name, minutesAgo, stars = 0) {
  return {
    id,
    full_name: name,
    html_url: 'https://github.com/' + name,
    description: name + ' plugin',
    pushed_at: new Date(Date.now() - minutesAgo * 60_000).toISOString(),
    stargazers_count: stars,
    language: 'TypeScript',
    topics: ['dsh-plugin'],
  };
}

test('GitHub 插件流只保留 1 小时内有效仓库，按 pushed_at 倒序', async () => {
  __resetGithubPluginsForTests();
  let calls = 0;
  globalThis.fetch = async () => {
    calls += 1;
    return new Response(JSON.stringify({
      items: [
        repo(1, 'alice/dsh-older', 45, 3),
        repo(2, 'bob/dsh-newer', 10, 42),
        repo(3, 'carol/too-old', 120, 5),
        { id: 4, full_name: 'dave/no-date', html_url: 'https://github.com/dave/no-date', description: 'missing' },
      ],
    }), { status: 200 });
  };
  const data = await getGithubPlugins({ force: true });
  assert.equal(data.ok, true);
  assert.equal(data.windowMinutes, 60);
  assert.equal(data.limit, 30);
  assert.equal(data.items.length, 2);
  assert.equal(data.items[0].title, 'bob/dsh-newer');
  assert.equal(data.items[0].stars, 42);
  assert.equal(data.items[0].language, 'TypeScript');
  assert.ok(data.items[0].at > data.items[1].at);
  assert.equal(data.stale, false);
  assert.equal(calls, 1);
  assert.equal(peekGithubPlugins().items.length, 2);
});

test('1 小时内超过 30 条时只保留最新 30 条', async () => {
  __resetGithubPluginsForTests();
  const items = Array.from({ length: 35 }, (_, index) => repo(100 + index, 'owner/dsh-' + index, index));
  globalThis.fetch = async () => new Response(JSON.stringify({ items }), { status: 200 });
  const data = await getGithubPlugins({ force: true });
  assert.equal(data.items.length, 30);
  assert.equal(data.items[0].title, 'owner/dsh-0');
  assert.equal(data.items[29].title, 'owner/dsh-29');
});

test('非 force 命中 10 分钟缓存，不重复请求', async () => {
  __resetGithubPluginsForTests();
  let calls = 0;
  globalThis.fetch = async () => {
    calls += 1;
    return new Response(JSON.stringify({ items: [repo(1, 'alice/dsh-one', 5)] }), { status: 200 });
  };
  await getGithubPlugins({ force: true });
  await getGithubPlugins();
  assert.equal(calls, 1);
});

test('无缓存时 GitHub 失败会抛出，交给路由返回 502', async () => {
  __resetGithubPluginsForTests();
  globalThis.fetch = async () => new Response('forbidden', { status: 403 });
  await assert.rejects(() => getGithubPlugins({ force: true }), /GitHub HTTP 403/);
});
