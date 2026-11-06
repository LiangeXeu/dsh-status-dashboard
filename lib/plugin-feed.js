/**
 * GitHub DSH 插件流：独立于热度聚合，避免插件仓库把 24h 声量/热度算歪。
 *
 * 只读 GitHub Search API（topic:dsh-plugin，按 pushed_at 倒序），10 分钟缓存；
 * 403/限流时回退上次快照并标记 stale，不把错误抛给整个 HUD。
 * @module dsh-status-dashboard/lib/plugin-feed
 */

const SEARCH_URL =
  'https://api.github.com/search/repositories?q=topic:dsh-plugin+fork:false+archived:false&sort=updated&order=desc&per_page=30';

const UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0 Safari/537.36';

const CACHE_MS = 10 * 60_000;
const WINDOW_MS = 60 * 60_000;
const LIMIT = 30;
const FORCE_COOLDOWN_MS = 60_000;
const TIMEOUT_MS = 9_000;

let cache = { at: 0, data: null };
let inflight = null;

function safeUrl(url) {
  const value = String(url || '');
  return /^https?:\/\//i.test(value) ? value : '';
}

function mapItem(item) {
  const at = Date.parse(item.pushed_at) || 0;
  const url = safeUrl(item.html_url);
  const title = String(item.full_name || '').trim();
  if (!url || !title || !at) return null;
  return {
    id: 'ghp-' + item.id,
    title,
    url,
    summary: String(item.description || '').replace(/\s+/g, ' ').trim().slice(0, 200),
    at,
    stars: Number(item.stargazers_count) || 0,
    language: String(item.language || ''),
    topics: Array.isArray(item.topics) ? item.topics.slice(0, 5) : [],
  };
}

/**
 * 拉取 GitHub 上的 DSH 插件更新。
 * @param {{force?: boolean}} [options]
 * @returns {Promise<{ok: boolean, fetchedAt: number, items: object[], stale: boolean, error?: string}>}
 */
export async function getGithubPlugins(options = {}) {
  const now = Date.now();
  if (cache.data && !options.force && now - cache.at < CACHE_MS) return cache.data;
  if (cache.data && options.force && now - cache.at < FORCE_COOLDOWN_MS) return cache.data;
  if (inflight) return inflight;

  inflight = (async () => {
    try {
      const response = await fetch(SEARCH_URL, {
        headers: {
          'user-agent': UA,
          accept: 'application/vnd.github+json',
          'x-github-api-version': '2022-11-28',
        },
        signal: AbortSignal.timeout(TIMEOUT_MS),
      });
      if (!response.ok) throw new Error('GitHub HTTP ' + response.status);
      const json = await response.json();
      const cutoff = Date.now() - WINDOW_MS;
      const items = (json.items || [])
        .map(mapItem)
        .filter((item) => item && item.at >= cutoff)
        .sort((a, b) => b.at - a.at)
        .slice(0, LIMIT);
      const data = { ok: true, fetchedAt: Date.now(), windowMinutes: 60, limit: LIMIT, items, stale: false };
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

export function peekGithubPlugins() {
  return cache.data;
}

export function __resetGithubPluginsForTests() {
  cache = { at: 0, data: null };
  inflight = null;
}
