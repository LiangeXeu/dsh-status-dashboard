import test from 'node:test';
import assert from 'node:assert/strict';
import { getGithubPlugins, peekGithubPlugins, __resetGithubPluginsForTests } from '../lib/plugin-feed.js';

const payload = {
  items: [
    {
      id: 1,
      full_name: 'alice/dsh-older',
      html_url: 'https://github.com/alice/dsh-older',
      description: 'older plugin',
      pushed_at: '2026-11-05T10:00:00Z',
      stargazers_count: 3,
      language: 'TypeScript',
      topics: ['dsh-plugin'],
    },
    {
      id: 2,
      full_name: 'bob/dsh-newer',
      html_url: 'https://github.com/bob/dsh-newer',
      description: 'newer plugin',
      pushed_at: '2026-11-06T05:00:00Z',
      stargazers_count: 42,
      language: 'JavaScript',
      topics: ['dsh-plugin', 'dashboard'],
    },
    {
      id: 3,
      full_name: 'carol/no-date',
      html_url: 'https://github.com/carol/no-date',
      description: 'missing pushed_at',
      stargazers_count: 0,
    },
  ],
};

test('GitHub 插件流只保留有效仓库，按 pushed_at 倒序', async () => {
  __resetGithubPluginsForTests();
  let calls = 0;
  globalThis.fetch = async () => {
    calls += 1;
    return new Response(JSON.stringify(payload), { status: 200 });
  };
  const data = await getGithubPlugins({ force: true });
  assert.equal(data.ok, true);
  assert.equal(data.items.length, 2);
  assert.equal(data.items[0].title, 'bob/dsh-newer');
  assert.equal(data.items[0].stars, 42);
  assert.equal(data.items[0].language, 'JavaScript');
  assert.deepEqual(data.items[0].topics, ['dsh-plugin', 'dashboard']);
  assert.ok(data.items[0].at > data.items[1].at);
  assert.equal(data.stale, false);
  assert.equal(calls, 1);
  assert.equal(peekGithubPlugins().items.length, 2);
});

test('非 force 命中 10 分钟缓存，不重复请求', async () => {
  __resetGithubPluginsForTests();
  let calls = 0;
  globalThis.fetch = async () => {
    calls += 1;
    return new Response(JSON.stringify(payload), { status: 200 });
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
