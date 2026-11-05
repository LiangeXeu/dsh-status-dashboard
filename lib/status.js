/**
 * 数据层：抓取 status.deepseek.com 并解析成插件自用的摘要结构。
 *
 * 状态页是 Flashcat 的 Next.js 应用，没有公开 JSON API（/api/v2 全 404），
 * 但首屏 HTML 的 RSC flight 流里带着完整数据：initialPageConfig（组件与分组定义）、
 * {"section_impacts":...}（90 天可用率与故障区间）、initialCalendarData（事件日历）。
 * 这里只做三件事：取 HTML、从 flight 流里抠出这三段 JSON、按天折算成摘要。
 * 必须始终成立：任何解析失败都抛错，由调用方决定回退到旧快照还是报错。
 * @module dsh-status-dashboard/lib/status
 */

/** 状态页地址。 */
const PAGE_URL = 'https://status.deepseek.com/';

/** 摘要缓存有效期：状态页本身分钟级更新，60 秒足够。 */
const CACHE_MS = 60_000;

/** 东八区偏移（秒）。状态页按用户本地时间分天，这里固定按北京时间。 */
const TZ_OFFSET_SECONDS = 8 * 3600;

/** 90 天柱状图的天数。 */
const BAR_DAYS = 90;

/** 严重度排序：数值越大越严重。 */
const SEVERITY = {
  operational: 0,
  maintenance: 1,
  degraded: 2,
  partial_outage: 3,
  full_outage: 4,
};

/** 浏览器 UA：状态页对无 UA 的请求也会应答，但带上更稳妥。 */
const UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0 Safari/537.36';

/**
 * 把 RSC flight 流拼回完整文本。
 * @param {string} html - 状态页 HTML。
 * @returns {string} 拼接后的 flight 文本。
 */
function flightOf(html) {
  const chunks = [];
  const re = /self\.__next_f\.push\(\[1,("(?:[^"\\]|\\.)*")\]\)/g;
  let match;
  while ((match = re.exec(html)) !== null) {
    try {
      chunks.push(JSON.parse(match[1]));
    } catch {
      // 单段坏掉不影响其它段；拼完仍能解析出数据。
    }
  }
  return chunks.join('');
}

/**
 * 从 flight 文本里截取从指定位置开始的平衡 JSON 对象。
 * @param {string} text - flight 文本。
 * @param {number} start - 对象左花括号的下标。
 * @returns {object|null} 解析结果；括号不平衡时返回 null。
 */
function readObjectAt(text, start) {
  if (start < 0) return null;
  let depth = 0;
  let inString = false;
  let escaped = false;
  for (let i = start; i < text.length; i += 1) {
    const ch = text[i];
    if (inString) {
      if (escaped) escaped = false;
      else if (ch === '\\') escaped = true;
      else if (ch === '"') inString = false;
      continue;
    }
    if (ch === '"') {
      inString = true;
      continue;
    }
    if (ch === '{') depth += 1;
    else if (ch === '}') {
      depth -= 1;
      if (depth === 0) {
        try {
          return JSON.parse(text.slice(start, i + 1));
        } catch {
          return null;
        }
      }
    }
  }
  return null;
}

/**
 * 取某个键后面的对象。
 * @param {string} text - flight 文本。
 * @param {string} key - 含双引号的键，如 "initialPageConfig"。
 * @returns {object|null} 解析结果。
 */
function objectAfterKey(text, key) {
  const at = text.indexOf(key + ':');
  if (at < 0) return null;
  return readObjectAt(text, text.indexOf('{', at + key.length));
}

/**
 * 解析状态页 HTML。
 * @param {string} html - 页面内容。
 * @returns {{config: object, detail: object, calendar: object}} 三段原始数据。
 */
function parsePage(html) {
  const flight = flightOf(html);
  if (flight.length === 0) throw new Error('状态页结构无法识别（未找到 RSC 数据）');
  const config = objectAfterKey(flight, '"initialPageConfig"');
  // 状态详情对象以 {"section_impacts": 开头，flight 里只出现一次。
  const detail = readObjectAt(flight, flight.indexOf('{"section_impacts":'));
  const calendar = objectAfterKey(flight, '"initialCalendarData"');
  if (!config || !detail || !calendar) throw new Error('状态页数据不完整');
  return { config, detail, calendar };
}

/**
 * 某天的起点（秒，UTC）。
 * @param {number} dayIndex - 自 1970-01-01 起按东八区分的天序号。
 * @returns {number} 当天 00:00 +08:00 的 UTC 秒。
 */
function dayStart(dayIndex) {
  return dayIndex * 86400 - TZ_OFFSET_SECONDS;
}

/**
 * 事件是否在给定时刻处于活动状态。
 * @param {object} change - 日历事件。
 * @param {number} now - 当前秒。
 * @returns {boolean} 活动返回 true。
 */
function isActiveChange(change, now) {
  if (change.status === 'resolved' || change.status === 'completed' || change.status === 'cancelled') {
    return false;
  }
  const start = Number(change.start_at_seconds) || 0;
  const close = Number(change.close_at_seconds) || 0;
  if (start > now) return false;
  return close === 0 || close > now;
}

/**
 * 组件在 now 时刻的状态：取覆盖当前时刻的 impact 里最严重的一个。
 * @param {object[]} impacts - 该组件的 impact 列表。
 * @param {number} now - 当前秒。
 * @returns {string} 状态名。
 */
function statusAt(impacts, now) {
  let status = 'operational';
  let rank = 0;
  for (const impact of impacts) {
    const start = Number(impact.start_at_seconds) || 0;
    const end = Number(impact.end_at_seconds) || 0;
    if (start > now) continue;
    if (end !== 0 && end <= now) continue;
    const next = String(impact.status || 'operational');
    const nextRank = SEVERITY[next] ?? 0;
    if (nextRank > rank) {
      rank = nextRank;
      status = next;
    }
  }
  return status;
}

/**
 * 生成 90 天逐日色块：每天取当天最严重的 impact 状态。
 * @param {object[]} impacts - 该组件的 impact 列表。
 * @param {number} now - 当前秒。
 * @returns {{bars: number[], startDate: string, dates: number[]}} 色块序列与起始日。
 */
function barSeries(impacts, now) {
  const todayIndex = Math.floor((now + TZ_OFFSET_SECONDS) / 86400);
  const firstIndex = todayIndex - BAR_DAYS + 1;
  const bars = new Array(BAR_DAYS).fill(0);
  const dates = [];
  for (let i = 0; i < BAR_DAYS; i += 1) {
    const index = firstIndex + i;
    dates.push(dayStart(index));
  }
  for (const impact of impacts) {
    const start = Number(impact.start_at_seconds) || 0;
    let end = Number(impact.end_at_seconds) || 0;
    if (end === 0 || end > now) end = now;
    const rank = SEVERITY[String(impact.status || '')] ?? 0;
    if (rank === 0) continue;
    for (let i = 0; i < BAR_DAYS; i += 1) {
      const from = dates[i];
      const to = from + 86400;
      if (end <= from || start >= to) continue;
      if (rank > bars[i]) bars[i] = rank;
    }
  }
  const startDate = new Date(dates[0] * 1000);
  const label = new Intl.DateTimeFormat('zh-CN', {
    timeZone: 'Asia/Shanghai',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(startDate);
  return { bars, startDate: label, dates };
}

/**
 * 名称拆成主名与括号里的副名。
 * @param {string} name - 原始名称。
 * @returns {{title: string, sub: string}} 主名与副名（副名可能为空）。
 */
function splitName(name) {
  const text = String(name || '').trim();
  const match = text.match(/^(.*?)\s*\(([^()]*)\)\s*$/);
  if (!match) return { title: text, sub: '' };
  return { title: match[1].trim(), sub: match[2].trim() };
}

/**
 * 把三段原始数据折算成插件摘要。
 * @param {{config: object, detail: object, calendar: object}} raw - 原始数据。
 * @param {number} nowMs - 当前毫秒时间戳。
 * @returns {object} 摘要。
 */
function buildSummary(raw, nowMs) {
  const now = Math.floor(nowMs / 1000);
  const { config, detail, calendar } = raw;
  const pageConfig = config;
  const components = Array.isArray(pageConfig.components) ? pageConfig.components : [];
  const sections = Array.isArray(pageConfig.sections) ? pageConfig.sections : [];
  const impactsByComponent = new Map();
  for (const impact of detail.component_impacts || []) {
    const key = String(impact.component_id);
    if (!impactsByComponent.has(key)) impactsByComponent.set(key, []);
    impactsByComponent.get(key).push(impact);
  }
  const uptimeByComponent = new Map();
  for (const row of detail.component_uptimes || []) {
    uptimeByComponent.set(String(row.component_id), Number(row.uptime));
  }
  const uptimeBySection = new Map();
  for (const row of detail.section_uptimes || []) {
    uptimeBySection.set(String(row.section_id), Number(row.uptime));
  }

  const barStart = barSeries([], now).startDate;

  const built = components.map((component) => {
    const impacts = impactsByComponent.get(String(component.component_id)) || [];
    const status = statusAt(impacts, now);
    const { title, sub } = splitName(component.name);
    const series = barSeries(impacts, now);
    return {
      id: String(component.component_id),
      name: String(component.name || ''),
      title,
      sub,
      sectionId: component.section_id ? String(component.section_id) : '',
      order: Number(component.order_id) || 0,
      status,
      uptime: uptimeByComponent.has(String(component.component_id))
        ? uptimeByComponent.get(String(component.component_id))
        : null,
      bars: series.bars,
      availableSince: Number(component.available_since_seconds) || 0,
    };
  });

  const byStatus = (items) =>
    items.reduce((worst, item) => (SEVERITY[item.status] > SEVERITY[worst] ? item.status : worst), 'operational');

  const sectionRows = sections
    .map((section) => {
      const id = String(section.section_id);
      const members = built.filter((c) => c.sectionId === id).sort((a, b) => a.order - b.order);
      return {
        id,
        name: String(section.name || ''),
        title: splitName(section.name).title,
        sub: splitName(section.name).sub,
        order: Number(section.order_id) || 0,
        status: byStatus(members),
        uptime: uptimeBySection.has(id) ? uptimeBySection.get(id) : null,
        hideUptime: Boolean(section.hide_uptime),
        hideAll: Boolean(section.hide_all),
        components: members,
      };
    })
    .sort((a, b) => a.order - b.order);

  const standalone = built
    .filter((c) => !c.sectionId || !sectionRows.some((s) => s.id === c.sectionId))
    .sort((a, b) => a.order - b.order);

  // 页面上的行序：独立组件与分组按 order_id 混排。
  const items = [
    ...standalone.map((component) => ({ type: 'component', order: component.order, component })),
    ...sectionRows.map((section) => ({ type: 'section', order: section.order, section })),
  ].sort((a, b) => a.order - b.order);

  const changes = Array.isArray(calendar.changes) ? calendar.changes : [];
  const incidents = changes
    .filter((change) => change.type === 'incident')
    .map((change) => ({
      id: String(change.change_id),
      type: 'incident',
      title: String(change.title || ''),
      status: String(change.status || ''),
      startAt: Number(change.start_at_seconds) * 1000 || 0,
      closeAt: Number(change.close_at_seconds) * 1000 || 0,
      updates: Array.isArray(change.updates) ? change.updates.length : 0,
      affected: (change.affected_components || []).map((c) => splitName(c.name).title),
      url: 'https://status.deepseek.com/incidents/' + change.change_id,
    }))
    .sort((a, b) => b.startAt - a.startAt);

  const maintenance = changes
    .filter((change) => change.type === 'maintenance')
    .map((change) => ({
      id: String(change.change_id),
      type: 'maintenance',
      title: String(change.title || ''),
      status: String(change.status || ''),
      startAt: Number(change.start_at_seconds) * 1000 || 0,
      closeAt: Number(change.close_at_seconds) * 1000 || 0,
      updates: Array.isArray(change.updates) ? change.updates.length : 0,
      affected: (change.affected_components || []).map((c) => splitName(c.name).title),
      url: 'https://status.deepseek.com/incidents/' + change.change_id,
    }))
    .sort((a, b) => a.startAt - b.startAt);

  const activeIncidents = changes.filter((change) => change.type === 'incident' && isActiveChange(change, now));
  const activeMaintenance = changes.filter((change) => change.type === 'maintenance' && isActiveChange(change, now));
  const upcomingMaintenance = maintenance.filter((change) => change.startAt / 1000 > now);

  const statuses = [
    ...built.map((c) => c.status),
    ...sectionRows.map((s) => s.status),
    ...activeIncidents.map(() => 'degraded'),
  ];
  const overall = statuses.reduce(
    (worst, status) => (SEVERITY[status] > SEVERITY[worst] ? status : worst),
    'operational',
  );

  return {
    ok: true,
    fetchedAt: nowMs,
    page: {
      name: String(pageConfig.name || 'DeepSeek'),
      url: 'https://status.deepseek.com',
      logo: String(pageConfig.logo || ''),
      updatedAt: nowMs,
    },
    overall,
    barStart,
    barDays: BAR_DAYS,
    items,
    components: standalone,
    sections: sectionRows,
    incidents: incidents.slice(0, 12),
    maintenance: maintenance.slice(0, 6),
    activeIncidents: activeIncidents.map((change) => ({
      id: String(change.change_id),
      title: String(change.title || ''),
      status: String(change.status || ''),
      startAt: Number(change.start_at_seconds) * 1000 || 0,
      url: 'https://status.deepseek.com/incidents/' + change.change_id,
    })),
    activeMaintenance: activeMaintenance.map((change) => ({
      id: String(change.change_id),
      title: String(change.title || ''),
      status: String(change.status || ''),
      startAt: Number(change.start_at_seconds) * 1000 || 0,
      url: 'https://status.deepseek.com/incidents/' + change.change_id,
    })),
    upcomingMaintenance: upcomingMaintenance.slice(0, 3).map((change) => ({
      id: change.id,
      title: change.title,
      status: change.status,
      startAt: change.startAt,
      url: change.url,
    })),
    counts: {
      components: built.length,
      operational: built.filter((c) => c.status === 'operational').length,
      incidents: incidents.length,
    },
  };
}

/** 进程内缓存：{at, data}。 */
let cache = { at: 0, data: null };
/** 并发去重：同时到达的请求共用一个抓取。 */
let inflight = null;

/**
 * 抓取并解析状态页。
 * @param {boolean} force - 为 true 时跳过缓存。
 * @returns {Promise<object>} 摘要。
 */
async function getSummary(force = false) {
  const nowMs = Date.now();
  if (!force && cache.data && nowMs - cache.at < CACHE_MS) return cache.data;
  if (inflight) return inflight;
  inflight = (async () => {
    try {
      const response = await fetch(PAGE_URL, {
        headers: { 'user-agent': UA, 'accept-language': 'zh-CN,zh;q=0.9,en;q=0.8' },
        signal: AbortSignal.timeout(15_000),
      });
      if (!response.ok) throw new Error('状态页返回 HTTP ' + response.status);
      const html = await response.text();
      const data = buildSummary(parsePage(html), nowMs);
      cache = { at: nowMs, data };
      return data;
    } catch (error) {
      if (cache.data) return { ...cache.data, stale: true, error: String(error && error.message ? error.message : error) };
      throw error;
    } finally {
      inflight = null;
    }
  })();
  return inflight;
}

export { PAGE_URL, buildSummary, parsePage, getSummary, SEVERITY, barSeries, splitName };
