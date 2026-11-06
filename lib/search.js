/**
 * AI 话题：DSH 账号 token + 官方 Search API（失败回退 ctx.web）。
 * 只接受 7 天内的新闻；7–30 天仅高热度条目（>=6 分，最多 2 条）；无日期/超 30 天丢弃。
 * 偏好不参与外部查询：查询只用公共角度词与静态种子，个人点击/停留数据不出本机。
 * @module dsh-status-dashboard/lib/search
 */

const SEARCH_ENDPOINT = 'https://api.deepseek.com/v1/tools/search';
const USER_AGENT = 'dsh-status-dashboard/0.3.0-alpha.1';
const TOTAL_BUDGET = 35_000;
const DAY = 86_400_000;
const HOUR = 3_600_000;

const ANGLES = [
  'DeepSeek 最新动态',
  'DeepSeek 新模型 发布',
  'DeepSeek 开源 项目 更新',
  'DeepSeek API 价格 变化',
  'DeepSeek 评测 对比',
  'DeepSeek 论文 研究 进展',
  'DeepSeek 应用 落地 案例',
  'DeepSeek 与 OpenAI 对比',
];

/** 公共种子，只用于查询轮换；这不是用户偏好。 */
const SEED_INTERESTS = [
  { label: '模型发布', weight: 3 },
  { label: '开源', weight: 2 },
  { label: 'API 价格', weight: 2 },
  { label: '算力', weight: 2 },
  { label: '评测', weight: 1 },
];

const REPUTABLE = /bbc|cnn|abcnews|cbsnews|npr|skynews|france24|nhk|asahi|yna|yonhap|cgtn|xinhuanet|people\.cn|reuters|apnews|techmeme|arstechnica|wired|theverge|techcrunch|ithome|qbitai|solidot|oschina|ifanr|36kr|jiqizhixin|huxiu|tmtpost/i;

function hash(text) {
  let value = 0;
  for (let i = 0; i < text.length; i += 1) value = (value * 31 + text.charCodeAt(i)) | 0;
  return Math.abs(value);
}

function safeUrl(raw) {
  try {
    const url = new URL(String(raw || '').trim());
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return '';
    return url.toString();
  } catch (error) {
    return '';
  }
}

function hostOf(url) {
  try { return new URL(url).hostname.replace(/^www\./, ''); }
  catch (error) { return ''; }
}

/** 解析发布时间：数字时间戳、ISO/RFC、YYYY-MM-DD、中文日期。解析不了返回 0。 */
function parsePublished(raw) {
  if (typeof raw === 'number' && Number.isFinite(raw)) {
    return raw > 10_000_000_000 ? raw : raw * 1000;
  }
  const text = String(raw || '').trim();
  if (!text) return 0;
  if (/^\d{10,13}$/.test(text)) return parsePublished(Number(text));
  const chinese = text.match(/(\d{4})年(\d{1,2})月(\d{1,2})日/);
  if (chinese) {
    return Date.parse(chinese[1] + '-' + String(chinese[2]).padStart(2, '0') + '-' + String(chinese[3]).padStart(2, '0') + 'T00:00:00+08:00');
  }
  const parsed = Date.parse(text);
  return Number.isFinite(parsed) ? parsed : 0;
}

function bucketFor(ageMs) {
  if (!Number.isFinite(ageMs)) return -1;
  const age = Math.max(0, ageMs);
  if (age <= DAY) return 0;
  if (age <= 3 * DAY) return 1;
  if (age <= 7 * DAY) return 2;
  if (age <= 30 * DAY) return 3;
  return -1;
}

/** 7–30 天条目的热度分：官方 3 + 发布词 2 + 排名 2 + 可信媒体 1 + 标题含 DeepSeek 1。 */
function hotScore(item, rank) {
  let score = 0;
  if (/deepseek\.com|github\.com\/deepseek-ai/i.test(item.url)) score += 3;
  if (/发布|上线|开源|版本|release|launch|announce|breakthrough|重磅/i.test(item.title)) score += 2;
  if (rank < 2) score += 2;
  if (REPUTABLE.test(hostOf(item.url))) score += 1;
  if (/deepseek/i.test(item.title)) score += 1;
  return score;
}

function domainWeight(url) {
  const host = hostOf(url);
  if (/deepseek\.com|github\.com\/deepseek-ai/.test(url)) return 1.0;
  if (/bbc|cnn|abcnews|cbsnews|npr|skynews|france24|nhk|asahi|yna|yonhap|cgtn|xinhuanet|people\.cn|reuters|apnews/i.test(host)) return 1.0;
  if (/techmeme|arstechnica|wired|theverge|techcrunch/i.test(host)) return 0.9;
  if (/hackernews|ycombinator|lobste|slashdot/i.test(host)) return 0.8;
  if (/ithome|qbitai|solidot|oschina|ifanr|36kr|jiqizhixin|huxiu|tmtpost/i.test(host)) return 0.7;
  return 0.6;
}

function buildQuery(seed, variant) {
  const now = new Date();
  const stamp = now.getFullYear() + '年' + (now.getMonth() + 1) + '月';
  const angle = ANGLES[hash(String(seed) + ':' + variant) % ANGLES.length];
  const seedWord = SEED_INTERESTS[hash(String(seed) + 's' + variant) % SEED_INTERESTS.length].label;
  return angle + ' ' + stamp + ' ' + seedWord;
}

function toItems(sources, now) {
  const seenUrl = new Set();
  const seenTitle = new Set();
  const items = [];
  const meta = { kept: 0, droppedByAge: 0, droppedNoDate: 0, buckets: [0, 0, 0, 0] };
  for (let rank = 0; rank < sources.length; rank += 1) {
    const source = sources[rank] || {};
    const url = safeUrl(source.url);
    const title = String(source.title || '').trim();
    const key = title.toLowerCase().replace(/[\s\p{P}\p{S}]+/gu, '').slice(0, 80);
    if (!url || !title || seenUrl.has(url) || (key && seenTitle.has(key))) continue;
    const at = parsePublished(source.publishedAt || source.date);
    if (!at) { meta.droppedNoDate += 1; continue; }
    if (at > now + 5 * 60_000) { meta.droppedByAge += 1; continue; }
    const age = now - at;
    const bucket = bucketFor(age);
    if (bucket < 0) { meta.droppedByAge += 1; continue; }
    const hot = bucket === 3 ? hotScore({ title, url }, rank) : 0;
    if (bucket === 3 && hot < 6) { meta.droppedByAge += 1; continue; }
    seenUrl.add(url);
    if (key) seenTitle.add(key);
    const snippet = String(source.snippet || source.summary || '').replace(/\s+/g, ' ').slice(0, 200);
    items.push({
      id: 'ai-' + items.length,
      title,
      url,
      snippet,
      domain: hostOf(url),
      at,
      bucket,
      hot,
      weight: domainWeight(url),
      score: (/deepseek/i.test(title) ? 2 : 0) + (/deepseek/i.test(snippet) ? 1 : 0),
    });
    meta.buckets[bucket] += 1;
  }
  items.sort((a, b) => a.bucket - b.bucket || b.weight - a.weight || b.at - a.at || b.score - a.score);
  let hotKept = 0;
  const out = [];
  for (const item of items) {
    if (item.bucket === 3) {
      if (hotKept >= 2) continue;
      hotKept += 1;
    }
    out.push(item);
  }
  const final = out.slice(0, 10).map((item) => { delete item.score; return item; });
  meta.kept = final.length;
  meta.oldest = final.length ? Math.min(...final.map((item) => item.at)) : 0;
  meta.newest = final.length ? Math.max(...final.map((item) => item.at)) : 0;
  return { items: final, meta };
}

async function searchViaAccount(ctx, query, signal) {
  const account = ctx && typeof ctx.get === 'function' ? ctx.get('deepseekAccount') : undefined;
  if (!account || typeof account.resolveToken !== 'function') return null;
  const token = await account.resolveToken(SEARCH_ENDPOINT);
  if (typeof token !== 'string' || token.length === 0) return null;
  const response = await fetch(SEARCH_ENDPOINT, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      accept: 'application/json',
      'x-dsh-auth-token': token,
      'user-agent': USER_AGENT,
    },
    body: JSON.stringify({ query, count: 20, need_content: false }),
    signal,
  });
  const text = await response.text();
  let payload = null;
  try { payload = JSON.parse(text); } catch (error) { payload = null; }
  if (!response.ok) {
    throw new Error('Search API HTTP ' + response.status + (payload && payload.message ? '：' + payload.message : ''));
  }
  if (!payload || !Array.isArray(payload.results)) throw new Error('Search API 返回结构异常');
  return payload.results;
}

async function searchViaWeb(ctx, query, signal) {
  const web = ctx && (typeof ctx.get === 'function' ? ctx.get('web') : undefined);
  if (!web || typeof web.search !== 'function') throw new Error('DSH web 搜索服务不可用');
  const result = await web.search({ query, maxResults: 20 }, signal);
  return (result && result.sources) || [];
}

function remaining(deadline) {
  return Math.max(0, deadline - Date.now());
}

export async function getAiTopics(ctx, options) {
  const seed = String((options && options.seed) || Date.now());
  const now = Date.now();
  const deadline = now + TOTAL_BUDGET;
  const queries = [buildQuery(seed, 0), buildQuery(seed, 1)];
  const sources = [];
  let via = 'account';

  try {
    const first = await searchViaAccount(ctx, queries[0], AbortSignal.timeout(Math.min(15_000, remaining(deadline))));
    if (first) sources.push(...first);
  } catch (error) {
    console.warn('[dsh-status] 账号搜索失败（' + queries[0] + '）：' + (error && error.message ? error.message : error));
  }

  let mapped = toItems(sources, now);
  if (mapped.items.length < 6 && remaining(deadline) > 3_000) {
    try {
      const second = await searchViaAccount(ctx, queries[1], AbortSignal.timeout(Math.min(15_000, remaining(deadline))));
      if (second) sources.push(...second);
      mapped = toItems(sources, now);
    } catch (error) {
      console.warn('[dsh-status] 账号搜索失败（' + queries[1] + '）：' + (error && error.message ? error.message : error));
    }
  }

  if (mapped.items.length === 0) {
    via = 'web';
    try {
      const web = await searchViaWeb(ctx, queries[0], AbortSignal.timeout(Math.max(1_000, remaining(deadline))));
      sources.push(...web);
      mapped = toItems(sources, now);
    } catch (error) {
      console.warn('[dsh-status] web 搜索失败（' + queries[0] + '）：' + (error && error.message ? error.message : error));
    }
  }

  if (mapped.items.length === 0) {
    throw new Error('7 天内没有可用的搜索结果（查询：' + queries[0] + '）');
  }

  return {
    ok: true,
    query: queries[0],
    queries,
    via,
    seed,
    fetchedAt: now,
    meta: mapped.meta,
    items: mapped.items,
  };
}

export { parsePublished, bucketFor, hotScore, toItems };
