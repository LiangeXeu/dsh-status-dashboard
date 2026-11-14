/**
 * 全球 AI 媒体流：纯 RSS 聚合，不调用任何计费接口。
 *
 * 与热度层完全隔离：这些条目只进 aiFeed，不参与 DeepSeek 的声量/热度/情绪/话题统计，
 * 否则全球 AI 新闻会把 counts.total 灌到几百条，热度指数直接失真。
 * 窗口 24 小时、上限 30 条，与 GitHub 插件流同口径。
 * @module dsh-status-dashboard/lib/ai-feed
 */

const UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0 Safari/537.36';

const CACHE_MS = 10 * 60_000;
const FORCE_COOLDOWN_MS = 60_000;
const TIMEOUT_MS = 9_000;
const WINDOW_MS = 24 * 60 * 60_000;
const LIMIT = 30;
/** 单源上限，避免 DeepMind 这类高产源把整条流刷满。 */
const PER_SOURCE = 4;

/** 只保留与 AI 相关的标题；宁可少，不要灌无关新闻。 */
const AI_MATCH =
  /openai|anthropic|claude|gemini|deepmind|chatgpt|copilot|gpt-?\d|llm|large language model|大模型|人工智能|\bai\b|agi|nvidia|英伟达|算力|gpu|agent|智能体|开源模型|transformer|diffusion|多模态|推理模型|deepseek|qwen|通义|文心|豆包|kimi|mistral|llama|sora|midjourney|stable diffusion|机器人|robotaxi|自动驾驶|具身智能|芯片|训练集群|数据中心/i;

/**
 * 实测可用的 AI 媒体源（2026-11 逐个验证 200 且含 AI 条目）。
 * weight 用于同时间下的排序加权，不影响窗口。
 */
const SOURCES = [
  { id: 'techcrunch', name: 'TechCrunch', url: 'https://techcrunch.com/category/artificial-intelligence/feed/', weight: 0.95 },
  { id: 'verge', name: 'The Verge', url: 'https://www.theverge.com/rss/ai-artificial-intelligence/index.xml', weight: 0.9 },
  { id: 'wired', name: 'Wired', url: 'https://www.wired.com/feed/tag/ai/latest/rss', weight: 0.9 },
  { id: 'mittr', name: 'MIT Tech Review', url: 'https://www.technologyreview.com/feed/', weight: 1.0 },
  { id: 'ieee', name: 'IEEE Spectrum', url: 'https://spectrum.ieee.org/feeds/topic/artificial-intelligence.rss', weight: 1.0 },
  { id: 'zdnet', name: 'ZDNet', url: 'https://www.zdnet.com/topic/artificial-intelligence/rss.xml', weight: 0.85 },
  { id: 'aibusiness', name: 'AI Business', url: 'https://aibusiness.com/rss.xml', weight: 0.8 },
  { id: 'decoder', name: 'The Decoder', url: 'https://the-decoder.com/feed/', weight: 0.85 },
  { id: 'bdtechtalks', name: 'TechTalks', url: 'https://bdtechtalks.com/feed/', weight: 0.7 },
  { id: 'lastweekai', name: 'Last Week in AI', url: 'https://lastweekin.ai/feed', weight: 0.75 },
  { id: 'ars', name: 'Ars Technica', url: 'https://feeds.arstechnica.com/arstechnica/index', weight: 0.9 },
  { id: 'googleai', name: 'Google AI', url: 'https://blog.google/technology/ai/rss/', weight: 1.0 },
  { id: 'deepmind', name: 'DeepMind', url: 'https://deepmind.google/blog/rss.xml', weight: 1.0 },
  { id: 'openai', name: 'OpenAI', url: 'https://openai.com/news/rss.xml', weight: 1.0 },
  { id: 'simonw', name: 'Simon Willison', url: 'https://simonwillison.net/atom/everything/', weight: 0.8 },
  { id: 'techmeme', name: 'Techmeme', url: 'https://www.techmeme.com/feed.xml', weight: 0.9 },
  { id: 'synced', name: 'Synced', url: 'https://syncedreview.com/feed/', weight: 0.7 },
  { id: 'ithome', name: 'IT之家', url: 'https://www.ithome.com/rss/', weight: 0.8 },
  { id: 'infoq', name: 'InfoQ 中文', url: 'https://www.infoq.cn/feed', weight: 0.8 },
  { id: 'qbitai', name: '量子位', url: 'https://www.qbitai.com/feed', weight: 0.8 },
  { id: 'ifanr', name: '爱范儿', url: 'https://www.ifanr.com/feed', weight: 0.7 },
  { id: 'leiphone', name: '雷锋网', url: 'https://www.leiphone.com/feed', weight: 0.7 },
  { id: 'tmtpost', name: '钛媒体', url: 'https://www.tmtpost.com/rss', weight: 0.7 },
  { id: 'geekpark', name: '极客公园', url: 'https://www.geekpark.net/rss', weight: 0.7 },
  { id: 'sspai', name: '少数派', url: 'https://sspai.com/feed', weight: 0.6 },
];

let cache = { at: 0, data: null };
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
    const date =
      pickTag(block, 'pubDate') ||
      pickTag(block, 'dc:date') ||
      pickTag(block, 'published') ||
      pickTag(block, 'updated');
    const at = Date.parse(date) || 0;
    const url = safeUrl(link);
    if (title && url) items.push({ title, url, summary: desc.slice(0, 200), at });
  }
  return items;
}

function normalizeTitle(title) {
  return String(title || '')
    .toLowerCase()
    .replace(/[\s\p{P}\p{S}]+/gu, '')
    .slice(0, 120);
}

async function loadSource(source) {
  const response = await fetch(source.url, {
    headers: {
      'user-agent': UA,
      accept: 'application/rss+xml, application/xml, text/xml, */*',
    },
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  if (!response.ok) throw new Error('HTTP ' + response.status);
  const xml = await response.text();
  return parseRss(xml)
    .filter((item) => item.at && AI_MATCH.test(item.title))
    .map((item) => ({
      id: source.id + '-' + normalizeTitle(item.title).slice(0, 24),
      title: item.title,
      url: item.url,
      summary: item.summary,
      at: item.at,
      source: source.id,
      sourceName: source.name,
      weight: source.weight,
    }));
}

/**
 * 拉取全球 AI 媒体流（24 小时窗口，上限 30 条）。
 * 源全挂时回退上次快照并标记 stale；从未成功过则抛错交给路由 502。
 * @param {{force?: boolean}} [options]
 */
export async function getAiFeed(options = {}) {
  const now = Date.now();
  if (cache.data && !options.force && now - cache.at < CACHE_MS) return cache.data;
  if (cache.data && options.force && now - cache.at < FORCE_COOLDOWN_MS) return cache.data;
  if (inflight) return inflight;

  inflight = (async () => {
    try {
      const settled = await Promise.all(
        SOURCES.map(async (source) => {
          try {
            return { id: source.id, name: source.name, ok: true, items: await loadSource(source) };
          } catch (error) {
            return { id: source.id, name: source.name, ok: false, items: [], error: error && error.message ? error.message : String(error) };
          }
        }),
      );
      const ok = settled.filter((source) => source.ok);
      if (ok.length === 0) throw new Error('AI 媒体源全部不可用');

      const cutoff = Date.now() - WINDOW_MS;
      const seen = new Set();
      const merged = [];
      for (const source of ok) {
        const fresh = source.items
          .filter((item) => item.at >= cutoff)
          .sort((a, b) => b.at - a.at)
          .slice(0, PER_SOURCE);
        for (const item of fresh) {
          const key = normalizeTitle(item.title);
          if (!key || seen.has(key)) continue;
          seen.add(key);
          merged.push(item);
        }
      }
      merged.sort((a, b) => b.at - a.at || (b.weight || 0) - (a.weight || 0));
      const items = merged.slice(0, LIMIT);

      const data = {
        ok: true,
        fetchedAt: Date.now(),
        windowHours: 24,
        limit: LIMIT,
        items,
        sources: settled.map((source) => ({
          id: source.id,
          name: source.name,
          ok: source.ok,
          count: source.items.length,
          error: source.error || '',
        })),
        stale: false,
      };
      cache = { at: data.fetchedAt, data };
      return data;
    } catch (error) {
      const message = error && error.message ? error.message : String(error);
      if (cache.data) return { ...cache.data, stale: true, error: message };
      throw error;
    } finally {
      inflight = null;
    }
  })();

  return inflight;
}

export function peekAiFeed() {
  return cache.data;
}

export function __resetAiFeedForTests() {
  cache = { at: 0, data: null };
  inflight = null;
}

export { SOURCES as AI_FEED_SOURCES, parseRss as parseAiRss };
