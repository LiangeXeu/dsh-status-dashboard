/**
 * 热度层：聚合 DeepSeek 相关公开提及，折算成声量、情绪、热度与话题。
 * 全部源失败时回退上次完整快照；部分失败不覆盖完整快照；URL 只接受 http/https。
 * @module dsh-status-dashboard/lib/heat
 */

const UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0 Safari/537.36';
const MATCH = /deepseek|深度求索/i;
const AGG_TTL = 60_000;
const SOURCE_TTL = 15 * 60_000;
const FETCH_TIMEOUT = 9_000;
const DAY = 86_400_000;

const RSS_SOURCES = [
  { id: 'ithome', name: 'IT之家', url: 'https://www.ithome.com/rss/', weight: 0.7 },
  { id: 'qbitai', name: '量子位', url: 'https://www.qbitai.com/feed', weight: 0.7 },
  { id: 'solidot', name: 'Solidot', url: 'https://www.solidot.org/index.rss', weight: 0.7 },
  { id: 'oschina', name: '开源中国', url: 'https://www.oschina.net/news/rss', weight: 0.7 },
  { id: 'ifanr', name: '爱范儿', url: 'https://www.ifanr.com/feed', weight: 0.7 },
  { id: 'abc', name: 'ABC News', url: 'https://abcnews.go.com/abcnews/topstories', weight: 1.0 },
  { id: 'cbs', name: 'CBS News', url: 'https://www.cbsnews.com/latest/rss/main', weight: 1.0 },
  { id: 'npr', name: 'NPR', url: 'https://feeds.npr.org/1001/rss.xml', weight: 1.0 },
  { id: 'sky', name: 'Sky News', url: 'https://feeds.skynews.com/feeds/rss/world.xml', weight: 1.0 },
  { id: 'france24', name: 'France 24', url: 'https://www.france24.com/en/rss', weight: 1.0 },
  { id: 'nhk', name: 'NHK', url: 'https://www.nhk.or.jp/rss/news/cat0.xml', weight: 1.0 },
  { id: 'asahi', name: '朝日新闻', url: 'https://www.asahi.com/rss/asahi/newsheadlines.rdf', weight: 1.0 },
  { id: 'yonhap', name: '韩联社', url: 'https://en.yna.co.kr/RSS/news.xml', weight: 1.0 },
  { id: 'cgtn', name: 'CGTN', url: 'https://www.cgtn.com/subscribe/rss/section/world.xml', weight: 1.0 },
  { id: 'xinhua', name: '新华网', url: 'http://www.xinhuanet.com/english/rss/worldrss.xml', weight: 1.0 },
  { id: 'peoples', name: '人民网', url: 'http://en.people.cn/rss/90777.xml', weight: 1.0 },
  { id: 'techmeme', name: 'Techmeme', url: 'https://www.techmeme.com/feed.xml', weight: 0.9 },
  { id: 'ars', name: 'Ars Technica', url: 'https://feeds.arstechnica.com/arstechnica/index', weight: 0.9 },
  { id: 'wired', name: 'Wired', url: 'https://www.wired.com/feed/rss', weight: 0.9 },
  { id: 'lobsters', name: 'Lobsters', url: 'https://lobste.rs/rss', weight: 0.8 },
  { id: 'slashdot', name: 'Slashdot', url: 'https://slashdot.org/index.rss', weight: 0.8 },
];

function hnUrl() {
  const since = Math.floor((Date.now() - 30 * DAY) / 1000);
  return 'https://hn.algolia.com/api/v1/search_by_date?query=DeepSeek&tags=story&hitsPerPage=100&numericFilters=created_at_i%3E' + since;
}
const GH_URL =
  'https://api.github.com/search/issues?q=deepseek+in:title+created:%3E{from}&sort=created&order=desc&per_page=30';

const POSITIVE = [
  '强劲', '领先', '突破', '发布', '开源', '惊艳', '好用', '稳定', '增长', '第一', '超越', '便宜', '免费',
  '认可', '优秀', '提升', '成功', '热门', '推荐', '好评', '创新', '高效', '重磅',
  'best', 'great', 'fast', 'impressive', 'awesome', 'strong', 'leading', 'breakthrough', 'stable',
  'cheap', 'free', 'love', 'good', 'win', 'powerful',
];
const NEGATIVE = [
  '故障', '崩溃', '中断', '延迟', '卡顿', '掉线', '失败', '错误', '争议', '质疑', '封禁', '限制',
  '涨价', '昂贵', '很差', '缓慢', '投诉', '泄露', '风险', '宕机', '不可用', '异常',
  'outage', 'down', 'fail', 'error', 'bug', 'slow', 'expensive', 'banned', 'lawsuit', 'risk',
  'complaint', 'broken', 'crash', 'unavailable', 'degraded', 'issue',
];
const KEYWORDS = [
  ['DeepSeek-V4', /deepseek[\s-]?v4/i],
  ['DeepSeek-R2', /deepseek[\s-]?r2/i],
  ['DeepSeek-V3', /deepseek[\s-]?v3/i],
  ['开源权重', /开源|open[\s-]?source|权重|weights/i],
  ['API 价格', /\bapi\b|价格|定价|pricing|price/i],
  ['算力/芯片', /芯片|英伟达|nvidia|gpu|算力|h100|ascend/i],
  ['评测/跑分', /评测|跑分|benchmark|sota|榜单/i],
  ['发布/上线', /发布|上线|release|launch|announce/i],
  ['服务故障', /故障|中断|宕机|不可用|outage|down|degraded/i],
  ['论文/研究', /论文|paper|arxiv|研究|research/i],
];

const sourceCache = new Map();
const sourceInflight = new Map();
let aggCache = { at: 0, data: null };
let inflight = null;

function safeUrl(raw) {
  try {
    const url = new URL(String(raw || '').trim());
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return '';
    return url.toString();
  } catch (error) {
    return '';
  }
}

function decodeXml(input) {
  return String(input)
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&amp;/g, '&')
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)))
    .replace(/<[^>]+>/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function pickTag(xml, tag) {
  const match = xml.match(new RegExp('<' + tag + '[^>]*>([\\s\\S]*?)</' + tag + '>', 'i'));
  return match ? decodeXml(match[1]) : '';
}

function parseRss(xml) {
  const items = [];
  const blocks = xml.match(/<item[\s>][\s\S]*?<\/item>|<entry[\s>][\s\S]*?<\/entry>/gi) || [];
  for (const block of blocks) {
    const title = pickTag(block, 'title');
    let link = pickTag(block, 'link');
    if (!link) {
      const href = block.match(/<link[^>]+href="([^"]+)"/i);
      link = href ? href[1] : '';
    }
    const desc = pickTag(block, 'description') || pickTag(block, 'summary') || pickTag(block, 'content');
    const date = pickTag(block, 'pubDate') || pickTag(block, 'dc:date') || pickTag(block, 'published') || pickTag(block, 'updated');
    const at = Date.parse(date) || 0;
    const url = safeUrl(link);
    if (title && url) items.push({ title, url, summary: desc.slice(0, 400), at });
  }
  return items;
}

function canonicalUrl(raw) {
  const safe = safeUrl(raw);
  if (!safe) return '';
  try {
    const url = new URL(safe);
    const keep = [];
    url.searchParams.forEach((value, key) => {
      if (/^(id|p|story|t)$/i.test(key)) keep.push(key + '=' + value);
    });
    return url.origin + url.pathname + (keep.length ? '?' + keep.join('&') : '');
  } catch (error) {
    return '';
  }
}

function normalizeTitle(title) {
  return String(title || '').toLowerCase().replace(/[\s\p{P}\p{S}]+/gu, '').slice(0, 120);
}

function escapeRegExp(text) {
  return String(text).replace(/[.*+?^$(){}|[\]\\]/g, '\\$&');
}

function scoreText(text) {
  const haystack = String(text || '').toLowerCase();
  const hit = (term) => {
    const word = String(term).toLowerCase();
    if (/^[a-z0-9][a-z0-9 -]*$/.test(word)) {
      return new RegExp('\\b' + escapeRegExp(word) + '\\b').test(haystack);
    }
    return word.length >= 2 && haystack.includes(word);
  };
  let score = 0;
  for (const word of POSITIVE) if (hit(word)) score += 1;
  for (const word of NEGATIVE) if (hit(word)) score -= 1;
  return Math.max(-1, Math.min(1, score / 3));
}

async function fetchJson(url, timeout = FETCH_TIMEOUT) {
  const response = await fetch(url, {
    headers: { 'user-agent': UA, accept: 'application/json' },
    signal: AbortSignal.timeout(timeout),
  });
  if (!response.ok) throw new Error('HTTP ' + response.status);
  return response.json();
}

async function fetchText(url, timeout = FETCH_TIMEOUT) {
  const response = await fetch(url, {
    headers: { 'user-agent': UA, accept: 'application/rss+xml, application/xml, text/xml, */*' },
    signal: AbortSignal.timeout(timeout),
  });
  if (!response.ok) throw new Error('HTTP ' + response.status);
  return response.text();
}

async function loadHn() {
  const json = await fetchJson(hnUrl());
  return (json.hits || [])
    .map((hit) => {
      const title = String(hit.title || hit.story_title || '').trim();
      const url = safeUrl(hit.url) || 'https://news.ycombinator.com/item?id=' + hit.objectID;
      return {
        id: 'hn-' + hit.objectID,
        source: 'hn',
        sourceName: 'Hacker News',
        title,
        url,
        at: Number(hit.created_at_i) * 1000 || 0,
        weight: 0.8,
        engagement: (Number(hit.points) || 0) + (Number(hit.num_comments) || 0) * 2,
        summary: '',
      };
    })
    .filter((item) => item.title && MATCH.test(item.title));
}

async function loadGithub() {
  const from = new Date(Date.now() - 7 * DAY).toISOString().slice(0, 10);
  const json = await fetchJson(GH_URL.replace('{from}', from));
  return (json.items || [])
    .map((issue) => ({
      id: 'gh-' + issue.id,
      source: 'github',
      sourceName: 'GitHub',
      title: String(issue.title || '').trim(),
      url: safeUrl(issue.html_url),
      at: Date.parse(issue.created_at) || 0,
      weight: 0.4,
      engagement: (Number(issue.comments) || 0) * 2 + (Number(issue.reactions?.total_count) || 0),
      summary: '',
    }))
    .filter((item) => item.title && item.url && MATCH.test(item.title));
}

async function loadRss(source) {
  const xml = await fetchText(source.url);
  return parseRss(xml)
    .filter((item) => MATCH.test(item.title + ' ' + item.summary))
    .map((item, index) => ({
      id: source.id + '-' + index + '-' + normalizeTitle(item.title).slice(0, 24),
      source: source.id,
      sourceName: source.name,
      title: item.title,
      url: item.url,
      at: item.at,
      engagement: 1,
      weight: source.weight || 0.6,
      summary: item.summary,
    }));
}

function sourceDefs() {
  return [
    { id: 'hn', name: 'Hacker News', weight: 0.8, load: loadHn },
    { id: 'github', name: 'GitHub', weight: 0.4, load: loadGithub },
    ...RSS_SOURCES.map((source) => ({ id: source.id, name: source.name, weight: source.weight, load: () => loadRss(source) })),
  ];
}

async function loadSource(def, force) {
  const now = Date.now();
  const cached = sourceCache.get(def.id);
  if (!force && cached && now - cached.at < SOURCE_TTL) return { ...cached, cached: true };
  if (sourceInflight.has(def.id)) return sourceInflight.get(def.id);
  const task = (async () => {
    try {
      const items = await def.load();
      const record = { id: def.id, name: def.name, ok: true, count: items.length, at: Date.now(), items, error: '' };
      sourceCache.set(def.id, record);
      return record;
    } catch (error) {
      const message = error && error.message ? error.message : String(error);
      const record = { id: def.id, name: def.name, ok: false, count: 0, at: Date.now(), items: [], error: message };
      sourceCache.set(def.id, record);
      return record;
    }
  })();
  sourceInflight.set(def.id, task);
  task.finally(() => sourceInflight.delete(def.id));
  return task;
}

function dedupe(items) {
  const map = new Map();
  for (const item of items) {
    const key = normalizeTitle(item.title);
    const urlKey = canonicalUrl(item.url);
    if (!urlKey) continue;
    const existing = map.get(key) || map.get(urlKey);
    if (!existing) {
      const next = { ...item, sources: [item.sourceName], sourceIds: [item.source], url: urlKey };
      map.set(key, next);
      map.set(urlKey, next);
      continue;
    }
    existing.engagement = Math.max(existing.engagement, item.engagement);
    existing.weight = Math.max(existing.weight || 0, item.weight || 0);
    if (!existing.sources.includes(item.sourceName)) existing.sources.push(item.sourceName);
    if (!existing.sourceIds.includes(item.source)) existing.sourceIds.push(item.source);
    if (item.at > existing.at) existing.at = item.at;
  }
  const seen = new Set();
  const out = [];
  for (const item of map.values()) {
    if (seen.has(item)) continue;
    seen.add(item);
    out.push(item);
  }
  return out;
}

function hourlyBuckets(items, now, hours = 24) {
  const buckets = new Array(hours).fill(0);
  const start = Math.floor(now / 3_600_000) * 3_600_000 - (hours - 1) * 3_600_000;
  for (const item of items) {
    const index = Math.floor((item.at - start) / 3_600_000);
    if (index >= 0 && index < hours) buckets[index] += 1;
  }
  return buckets.map((count, index) => ({ at: start + index * 3_600_000, count }));
}

function dailyBuckets(items, now, days = 7) {
  const buckets = new Array(days).fill(0);
  const start = Math.floor(now / DAY) * DAY - (days - 1) * DAY;
  for (const item of items) {
    const index = Math.floor((item.at - start) / DAY);
    if (index >= 0 && index < days) buckets[index] += 1;
  }
  return buckets.map((count, index) => ({ at: start + index * DAY, count }));
}

function buildTopics(items, now) {
  const recent = items.filter((item) => now - item.at < 7 * DAY);
  const topics = [];
  for (const [label, pattern] of KEYWORDS) {
    const hits = recent.filter((item) => pattern.test(item.title + ' ' + item.summary));
    if (hits.length === 0) continue;
    hits.sort((a, b) => b.engagement - a.engagement || b.at - a.at);
    const sources = [...new Set(hits.flatMap((item) => item.sources))];
    const sample = hits[0];
    topics.push({
      label,
      count: hits.length,
      engagement: hits.reduce((sum, item) => sum + item.engagement, 0),
      sources,
      sample: { title: sample.title, url: sample.url, source: sample.sources[0] || '' },
      latestAt: Math.max(...hits.map((item) => item.at)),
    });
  }
  topics.sort((a, b) => b.count - a.count || b.engagement - a.engagement);
  if (topics.length < 3) {
    const freq = new Map();
    for (const item of recent) {
      for (const token of String(item.title).toLowerCase().match(/[a-z0-9][a-z0-9.+-]{3,}|[\u4e00-\u9fa5]{2,4}/g) || []) {
        if (/^(deepseek|with|this|that|from|have|will|your|about|what|when|http|https)$/.test(token)) continue;
        freq.set(token, (freq.get(token) || 0) + 1);
      }
    }
    const extra = [...freq.entries()].sort((a, b) => b[1] - a[1]).slice(0, 3);
    for (const [token, count] of extra) {
      if (topics.some((topic) => topic.label.toLowerCase() === token)) continue;
      topics.push({ label: token, count, engagement: 0, sources: [], sample: null, latestAt: now });
    }
  }
  return topics.slice(0, 6);
}

function heatScore(items, now) {
  const day = items.filter((item) => now - item.at < DAY);
  const two = items.filter((item) => now - item.at < 2 * 3_600_000);
  const prev = items.filter((item) => {
    const age = now - item.at;
    return age >= 2 * 3_600_000 && age < 4 * 3_600_000;
  });
  const volume = day.length;
  const engagement = day.reduce((sum, item) => sum + item.engagement, 0);
  const velocity = Math.min(6, (two.length + 1) / (prev.length + 2));
  const negative = day.filter((item) => item.sentiment < -0.2).length;
  const negRatio = volume ? negative / volume : 0;
  const score = Math.round(
    100 * (
      0.34 * Math.min(1, Math.log10(1 + volume) / 2.1) +
      0.28 * Math.min(1, Math.log10(1 + engagement) / 2.6) +
      0.24 * Math.min(1, velocity / 3) +
      0.14 * negRatio
    ),
  );
  return { score: Math.max(0, Math.min(100, score)), volume, engagement, velocity, negRatio };
}

function heatLabel(score) {
  if (score >= 72) return '沸腾';
  if (score >= 48) return '升温';
  if (score >= 24) return '平稳';
  return '冷淡';
}

function buildHeat(results, now) {
  const raw = results.flatMap((source) => source.items);
  const items = dedupe(raw).map((item) => ({ ...item, sentiment: scoreText(item.title + ' ' + item.summary) }));
  // HN 信息流放宽到 30 天，但热度/话题/声量仍只统计最近 7 天，避免旧闻污染。
  const metricItems = items.filter((item) => now - item.at < 7 * DAY);
  const recent24 = metricItems.filter((item) => now - item.at < DAY);
  const positive = recent24.filter((item) => item.sentiment > 0.2).length;
  const negative = recent24.filter((item) => item.sentiment < -0.2).length;
  const neutral = Math.max(0, recent24.length - positive - negative);
  const total = Math.max(1, recent24.length);
  const heat = heatScore(metricItems, now);
  const toFeedItem = (item) => ({
    id: item.id,
    title: item.title,
    url: item.url,
    source: item.sources[0] || '',
    sourceId: item.sourceIds[0] || '',
    sources: item.sources,
    at: item.at,
    weight: item.weight || 0.5,
    engagement: item.engagement,
    sentiment: item.sentiment,
  });
  const feed = [...metricItems]
    .map((item) => {
      const age = now - item.at;
      const recency = age < 6 * 3_600_000 ? 3 : age < DAY ? 2 : 1;
      return { item, score: (item.engagement + 1) * recency };
    })
    .sort((a, b) => b.score - a.score)
    .slice(0, 14)
    .map((row) => toFeedItem(row.item));
  const hnFeed = items
    .filter((item) => (item.sourceIds || []).includes('hn'))
    .sort((a, b) => b.at - a.at)
    .slice(0, 30)
    .map(toFeedItem);

  return {
    ok: true,
    fetchedAt: now,
    windowHours: 24,
    counts: {
      items: recent24.length,
      total: metricItems.length,
      engagement: Math.round(heat.engagement),
      sources: results.filter((source) => source.ok && source.count > 0).length,
    },
    heat: { score: heat.score, label: heatLabel(heat.score), velocity: Number(heat.velocity.toFixed(2)) },
    sentiment: {
      positive: Math.round((positive / total) * 100),
      neutral: Math.round((neutral / total) * 100),
      negative: Math.round((negative / total) * 100),
    },
    hourly: hourlyBuckets(metricItems, now),
    daily: dailyBuckets(metricItems, now),
    topics: buildTopics(metricItems, now),
    feed,
    hnFeed,
    sources: results.map((source) => ({
      id: source.id,
      name: source.name,
      ok: source.ok,
      empty: source.ok && source.count === 0,
      count: source.count,
      error: source.error,
      at: source.at,
    })),
    stale: false,
    partial: false,
  };
}

async function getHeat(options = {}) {
  const now = Date.now();
  if (!options.force && aggCache.data && now - aggCache.at < AGG_TTL) return aggCache.data;
  if (inflight) return inflight;

  inflight = (async () => {
    const defs = sourceDefs();
    const results = await Promise.all(defs.map((def) => loadSource(def, Boolean(options.hard))));
    const ok = results.filter((source) => source.ok);

    if (ok.length === 0) {
      if (aggCache.data) {
        return { ...aggCache.data, stale: true, partial: false, error: '全部热度源不可用，显示上次快照' };
      }
      throw new Error('热度源全部不可用：' + results.map((source) => source.id + ' ' + source.error).join('; '));
    }

    const data = buildHeat(results, now);
    if (ok.length < results.length) {
      if (aggCache.data && data.counts.items < aggCache.data.counts.items) {
        return { ...aggCache.data, stale: true, partial: true, error: '部分热度源不可用，沿用上次完整快照' };
      }
      data.partial = true;
      return data;
    }
    aggCache = { at: now, data };
    return data;
  })();

  try {
    return await inflight;
  } finally {
    inflight = null;
  }
}

function peekHeat() {
  if (!aggCache.data) return null;
  const data = aggCache.data;
  return { fetchedAt: data.fetchedAt, stale: Boolean(data.stale), counts: data.counts, sources: data.sources, heat: data.heat };
}

function __resetHeatForTests() {
  sourceCache.clear();
  sourceInflight.clear();
  aggCache = { at: 0, data: null };
  inflight = null;
}

export { getHeat, peekHeat, scoreText, __resetHeatForTests };
