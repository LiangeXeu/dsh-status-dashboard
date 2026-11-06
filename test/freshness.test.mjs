import test from 'node:test';
import assert from 'node:assert/strict';
import { parsePublished, bucketFor, hotScore, toItems } from '../lib/search.js';

const NOW = Date.parse('2026-11-06T00:00:00Z');
const DAY = 86_400_000;

test('parsePublished 支持 ISO / RFC / 中文日期 / 时间戳', () => {
  assert.equal(parsePublished('2026-11-05T10:00:00Z'), Date.parse('2026-11-05T10:00:00Z'));
  assert.equal(parsePublished('Thu, 05 Nov 2026 10:00:00 GMT'), Date.parse('2026-11-05T10:00:00Z'));
  assert.equal(parsePublished('2026年11月5日'), Date.parse('2026-11-05T00:00:00+08:00'));
  assert.equal(parsePublished(1762336800), 1762336800000);
  assert.equal(parsePublished('not a date'), 0);
});

test('bucketFor 按 24h / 3d / 7d / 30d 分桶', () => {
  assert.equal(bucketFor(1 * 3600_000), 0);
  assert.equal(bucketFor(26 * 3600_000), 1);
  assert.equal(bucketFor(5 * DAY), 2);
  assert.equal(bucketFor(10 * DAY), 3);
  assert.equal(bucketFor(40 * DAY), -1);
});

test('hotScore 只让官方/发布类旧闻过 6 分', () => {
  const official = hotScore({ title: 'DeepSeek 发布新版本', url: 'https://github.com/deepseek-ai/x' }, 0);
  assert.ok(official >= 6);
  const random = hotScore({ title: 'A blog about caching', url: 'https://example.com/a' }, 9);
  assert.ok(random < 6);
});

test('toItems 丢弃超 7 天与无日期，保留 7–30 天高分，并按桶/权重/时间排序', () => {
  const sources = [
    { title: '24h ABC', url: 'https://abcnews.go.com/a', publishedAt: new Date(NOW - 1 * 3600_000).toISOString() },
    { title: '2d blog', url: 'https://example.com/b', publishedAt: new Date(NOW - 2 * DAY).toISOString() },
    { title: '5d IT之家', url: 'https://www.ithome.com/c', publishedAt: new Date(NOW - 5 * DAY).toISOString() },
    { title: 'DeepSeek 发布重磅版本', url: 'https://github.com/deepseek-ai/d', publishedAt: new Date(NOW - 10 * DAY).toISOString() },
    { title: '10d random', url: 'https://example.com/e', publishedAt: new Date(NOW - 10 * DAY).toISOString() },
    { title: '40d old', url: 'https://example.com/f', publishedAt: new Date(NOW - 40 * DAY).toISOString() },
    { title: 'no date', url: 'https://example.com/g' },
    { title: 'future', url: 'https://example.com/h', publishedAt: new Date(NOW + 2 * DAY).toISOString() },
  ];
  const out = toItems(sources, NOW);
  assert.equal(out.items.length, 4);
  assert.deepEqual(out.items.map((item) => item.bucket), [0, 1, 2, 3]);
  assert.equal(out.items[3].url, 'https://github.com/deepseek-ai/d');
  assert.equal(out.items[0].url, 'https://abcnews.go.com/a');
  assert.ok(out.meta.droppedByAge >= 2);
  assert.ok(out.meta.droppedNoDate >= 1);
});
