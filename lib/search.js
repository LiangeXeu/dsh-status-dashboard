/**
 * AI 话题：优先用 DSH 账号 token 调官方 Search API（无需 API key、不消耗模型轮次），
 * 拿不到 token 或结果为空时回退 ctx.web.search；整次调用有总预算，避免 70s 长尾。
 * URL 只接受 http/https；结果不落盘。
 * @module dsh-status-dashboard/lib/search
 */

const SEARCH_ENDPOINT = 'https://api.deepseek.com/v1/tools/search';
const USER_AGENT = 'dsh-status-dashboard/0.2.3';
const TOTAL_BUDGET = 35_000;
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

function cleanInterest(value) {
  return String(value || '')
    .replace(/[^\w\u4e00-\u9fa5.+-]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 18);
}

function buildQuery(seed, interests) {
  const now = new Date();
  const stamp = now.getFullYear() + '年' + (now.getMonth() + 1) + '月';
  const index = hash(String(seed || Date.now())) % ANGLES.length;
  if (interests.length && hash(String(seed) + 'i') % 2 === 0) return 'DeepSeek ' + interests[0] + ' 最新';
  return ANGLES[index] + ' ' + stamp;
}

function toItems(sources) {
  const seenUrl = new Set();
  const seenTitle = new Set();
  const items = [];
  for (const source of sources) {
    const url = safeUrl(source && source.url);
    const title = String((source && source.title) || '').trim();
    const key = title.toLowerCase().replace(/[\s\p{P}\p{S}]+/gu, '').slice(0, 80);
    if (!url || !title || seenUrl.has(url) || (key && seenTitle.has(key))) continue;
    seenUrl.add(url);
    if (key) seenTitle.add(key);
    const snippet = String((source && (source.snippet || source.summary)) || '').replace(/\s+/g, ' ').slice(0, 200);
    items.push({
      id: 'ai-' + items.length,
      title,
      url,
      snippet,
      domain: hostOf(url),
      at: source.publishedAt ? (Date.parse(source.publishedAt) || 0) : 0,
      score: (/deepseek/i.test(title) ? 2 : 0) + (/deepseek/i.test(snippet) ? 1 : 0),
    });
  }
  items.sort((a, b) => b.score - a.score || b.at - a.at);
  return items.slice(0, 10).map((item) => { delete item.score; return item; });
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
    body: JSON.stringify({ query, count: 12, need_content: false }),
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
  const result = await web.search({ query, maxResults: 12 }, signal);
  return (result && result.sources) || [];
}

function remaining(deadline) {
  return Math.max(0, deadline - Date.now());
}

export async function getAiTopics(ctx, options) {
  const interests = Array.isArray(options && options.interests)
    ? options.interests.map(cleanInterest).filter(Boolean).slice(0, 3)
    : [];
  let query = buildQuery(options && options.seed, interests);
  const deadline = Date.now() + TOTAL_BUDGET;
  let via = 'account';
  let items = [];

  try {
    const sources = await searchViaAccount(ctx, query, AbortSignal.timeout(Math.min(20_000, remaining(deadline))));
    if (sources) items = toItems(sources);
  } catch (error) {
    console.warn('[dsh-status] 账号搜索失败（' + query + '）：' + (error && error.message ? error.message : error));
  }

  if (items.length === 0) {
    via = 'web';
    try {
      const sources = await searchViaWeb(ctx, query, AbortSignal.timeout(Math.max(1_000, remaining(deadline))));
      items = toItems(sources);
    } catch (error) {
      console.warn('[dsh-status] web 搜索失败（' + query + '）：' + (error && error.message ? error.message : error));
    }
  }

  if (items.length === 0 && remaining(deadline) > 5_000) {
    try {
      query = 'DeepSeek 最新动态';
      const sources = await searchViaWeb(ctx, query, AbortSignal.timeout(remaining(deadline) - 1_000));
      items = toItems(sources);
    } catch (error) {
      console.warn('[dsh-status] web 稳定查询失败：' + (error && error.message ? error.message : error));
    }
  }

  if (items.length === 0) throw new Error('搜索没有返回可用结果（' + via + '，查询：' + query + '）');

  return { ok: true, query, via, fetchedAt: Date.now(), interests, items };
}
