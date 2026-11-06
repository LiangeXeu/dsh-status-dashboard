/**
 * 浏览器半侧：标题栏状态按钮 + 三皮肤 HUD 仪表盘。
 *
 * 数据来自同源路由：/summary（官方状态）与 /heat（声量/热度/话题）。
 * 三套皮肤只换 token（CSS 变量）与质感参数，共用同一棵组件树；切换即时、持久化到 localStorage。
 * 必须始终成立：整个文件是普通副作用脚本，不能有顶层 import/export；react 一律经 factory 的 require 取得。
 * @module dsh-status-dashboard/client
 */
;(function () {
  'use strict';

  var PACKAGE = 'dsh-status-dashboard';
  var VERSION = '0.3.0-alpha.1';
  var ROUTE_SEGMENT = '/dsh-status-2417';
  var SKIN_KEY = 'dsh.status.skin';

  function mountPrefixOf(baseURI) {
    if (!baseURI) return '';
    try {
      var url = new URL(baseURI);
      if (url.protocol !== 'http:' && url.protocol !== 'https:') return '';
      return url.pathname.replace(/\/+$/, '');
    } catch (error) {
      return '';
    }
  }

  var ROUTE_PATH = mountPrefixOf(document.baseURI) + ROUTE_SEGMENT;

  var SKINS = [
    {
      id: 'abyss', name: '深渊', en: 'ABYSS', tagline: '深海玻璃 · 青绿荧光',
      preview: { bg: '#060c0e', panel: '#0b1a1d', line: 'rgba(52,245,197,.35)', accent: '#34f5c5', text: '#dcfff4' },
    },
    {
      id: 'console', name: '终端', en: 'CONSOLE', tagline: '琥珀单色 · 机械刻度',
      preview: { bg: '#0b0803', panel: '#191307', line: 'rgba(255,180,84,.35)', accent: '#ffb454', text: '#f2dcb6' },
    },
    {
      id: 'paper', name: '纸面', en: 'PAPER', tagline: '编辑排版 · 朱红点缀',
      preview: { bg: '#f2efe7', panel: '#ffffff', line: 'rgba(20,20,20,.2)', accent: '#e0004d', text: '#141414' },
    },
  ];

  var CUSTOM_KEY = 'dsh.status.custom.v1';
  var CUSTOM_DEFAULT = {
    bg: '#05090b', panel: '#0b1d20', text: '#dcfff4', accent: '#34f5c5', ok: '#34f5c5', warn: '#ffd166', bad: '#ff5d7a', image: '',
    modules: {
      kpi: { image: '', opacity: 0.45 },
      status: { image: '', opacity: 0.62 },
      trend: { image: '', opacity: 0.62 },
      heat: { image: '', opacity: 0.62 },
      topics: { image: '', opacity: 0.62 },
      feed: { image: '', opacity: 0.62 }
    }
  };
  var MODULE_DEFS = [
    { id: 'kpi', label: '顶部 KPI' },
    { id: 'status', label: '组件矩阵' },
    { id: 'trend', label: '声量趋势' },
    { id: 'heat', label: '热度' },
    { id: 'topics', label: '话题推荐' },
    { id: 'feed', label: '实时信息流' }
  ];

  function hexToRgb(hex) {
    var value = String(hex || '').trim().replace('#', '');
    if (value.length === 3) value = value.charAt(0) + value.charAt(0) + value.charAt(1) + value.charAt(1) + value.charAt(2) + value.charAt(2);
    var num = parseInt(value, 16);
    if (Number.isNaN(num)) return { r: 0, g: 0, b: 0 };
    return { r: (num >> 16) & 255, g: (num >> 8) & 255, b: num & 255 };
  }

  function mix(a, b, t) {
    var x = hexToRgb(a), y = hexToRgb(b);
    var f = Math.max(0, Math.min(1, t));
    var to = function (v, w) { return Math.round(v + (w - v) * f); };
    var hx = function (v) { return ('0' + v.toString(16)).slice(-2); };
    return '#' + hx(to(x.r, y.r)) + hx(to(x.g, y.g)) + hx(to(x.b, y.b));
  }

  function alpha(hex, a) {
    var rgb = hexToRgb(hex);
    return 'rgba(' + rgb.r + ',' + rgb.g + ',' + rgb.b + ',' + a + ')';
  }

  function mergeCustom(raw) {
    var out = JSON.parse(JSON.stringify(CUSTOM_DEFAULT));
    if (!raw || typeof raw !== 'object') return out;
    ['bg', 'panel', 'text', 'accent', 'ok', 'warn', 'bad', 'image'].forEach(function (key) {
      if (typeof raw[key] === 'string') out[key] = raw[key];
    });
    if (raw.modules && typeof raw.modules === 'object') {
      MODULE_DEFS.forEach(function (def) {
        var source = raw.modules[def.id];
        if (!source) return;
        if (typeof source.image === 'string') out.modules[def.id].image = source.image;
        if (typeof source.opacity === 'number') out.modules[def.id].opacity = Math.min(1, Math.max(0.2, source.opacity));
      });
    }
    return out;
  }

  function loadCustom() {
    try { return mergeCustom(JSON.parse(localStorage.getItem(CUSTOM_KEY) || 'null')); }
    catch (error) { return mergeCustom(null); }
  }

  var CUSTOM_STORE_KEY = 'dsh.status.customStore.v1';
  var CUSTOM_STORE_LIMIT = 4_200_000;

  function newPresetId() {
    return 'p' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
  }

  function normalizePreset(raw, index) {
    var source = raw && typeof raw === 'object' ? raw : {};
    var config = source.config && typeof source.config === 'object' ? source.config : source;
    return {
      id: String(source.id || newPresetId()),
      name: String(source.name || ('自定义 ' + (index + 1))).trim().slice(0, 24) || ('自定义 ' + (index + 1)),
      config: mergeCustom(config),
      updatedAt: Number(source.updatedAt) || Date.now(),
    };
  }

  function loadCustomStore() {
    try {
      var raw = JSON.parse(localStorage.getItem(CUSTOM_STORE_KEY) || 'null');
      if (raw && Array.isArray(raw.presets) && raw.presets.length) {
        var presets = raw.presets.map(normalizePreset);
        var active = presets.some(function (item) { return item.id === raw.activeId; }) ? raw.activeId : presets[0].id;
        return { activeId: active, presets: presets };
      }
    } catch (error) { /* 损坏则回退到迁移逻辑 */ }
    var legacy = null;
    try { legacy = JSON.parse(localStorage.getItem(CUSTOM_KEY) || 'null'); } catch (error) { legacy = null; }
    var first = normalizePreset({
      id: 'preset-' + Date.now().toString(36),
      name: legacy ? '我的自定义' : '默认自定义',
      config: legacy,
      updatedAt: Date.now(),
    }, 0);
    return { activeId: first.id, presets: [first] };
  }

  function saveCustomStore(store) {
    var text = JSON.stringify(store);
    if (text.length > CUSTOM_STORE_LIMIT) {
      try { window.alert('自定义皮肤总大小超过约 4MB，未保存。请减少模块背景图数量或换更小的图。'); } catch (error) {}
      return false;
    }
    try { localStorage.setItem(CUSTOM_STORE_KEY, text); return true; }
    catch (error) {
      console.warn('[dsh-status] 自定义皮肤保存失败', error);
      try { window.alert('自定义皮肤保存失败：浏览器存储已满。请减少背景图后再试。'); } catch (ignored) {}
      return false;
    }
  }

  function activePresetOf(store) {
    if (!store || !Array.isArray(store.presets) || !store.presets.length) return null;
    return store.presets.filter(function (item) { return item.id === store.activeId; })[0] || store.presets[0];
  }

  function downloadPresets(store) {
    try {
      var text = JSON.stringify({ app: 'dsh-status-dashboard', version: 1, exportedAt: new Date().toISOString(), presets: store.presets }, null, 2);
      var blob = new Blob([text], { type: 'application/json' });
      var url = URL.createObjectURL(blob);
      var link = document.createElement('a');
      link.href = url;
      link.download = 'dsh-status-skins-' + new Date().toISOString().slice(0, 10) + '.json';
      document.body.appendChild(link);
      link.click();
      link.remove();
      setTimeout(function () { URL.revokeObjectURL(url); }, 1000);
    } catch (error) {
      window.alert('导出失败：' + (error && error.message ? error.message : error));
    }
  }

  function importPresetFile(file, done) {
    if (!file) return;
    if (file.size > 6_000_000) { window.alert('导入文件太大（上限 6MB）'); return; }
    var reader = new FileReader();
    reader.onload = function () {
      try {
        var raw = JSON.parse(String(reader.result || ''));
        var list = Array.isArray(raw) ? raw : raw && Array.isArray(raw.presets) ? raw.presets : null;
        if (!list || !list.length) throw new Error('文件里没有皮肤方案');
        done(list.map(normalizePreset));
      } catch (error) {
        window.alert('导入失败：' + (error && error.message ? error.message : error));
      }
    };
    reader.readAsText(file);
  }

  function customVars(custom) {
    return {
      '--h-bg': custom.bg,
      '--h-bg2': mix(custom.bg, '#ffffff', 0.05),
      '--h-panel': alpha(custom.panel, 0.72),
      '--h-panel2': alpha(custom.panel, 0.4),
      '--h-text': custom.text,
      '--h-dim': mix(custom.text, custom.bg, 0.45),
      '--h-mute': mix(custom.text, custom.bg, 0.3),
      '--h-accent': custom.accent,
      '--h-accent2': mix(custom.accent, '#39b7ff', 0.55),
      '--h-ok': custom.ok || custom.accent,
      '--h-warn': custom.warn || '#ffd166',
      '--h-bad': custom.bad || '#ff5d7a',
      '--h-partial': mix(custom.warn || '#ffd166', custom.bad || '#ff5d7a', 0.55),
      '--h-line': alpha(custom.accent, 0.16),
      '--h-line2': alpha(custom.accent, 0.36),
      '--h-glow': '0 0 30px ' + alpha(custom.accent, 0.2),
      '--h-radius': '14px'
    };
  }

  function hoverVars(skin, custom) {
    if (skin === 'custom') return customVars(custom);
    var found = SKINS.filter(function (item) { return item.id === skin; })[0];
    if (!found) return {};
    var preview = found.preview;
    return {
      '--h-bg': preview.bg,
      '--h-panel': preview.panel,
      '--h-text': preview.text,
      '--h-accent': preview.accent,
      '--h-accent2': preview.accent,
      '--h-ok': preview.accent,
      '--h-warn': '#ffd166',
      '--h-bad': '#ff5d7a',
      '--h-partial': '#f0883e',
      '--h-dim': mix(preview.text, preview.bg, 0.45),
      '--h-mute': mix(preview.text, preview.bg, 0.3),
      '--h-line': preview.line,
      '--h-line2': preview.line
    };
  }

  function hudBackground(custom) {
    if (!custom.image) return {};
    return {
      backgroundImage: 'linear-gradient(' + alpha(custom.bg, 0.5) + ',' + alpha(custom.bg, 0.8) + '), url("' + custom.image + '")',
      backgroundSize: 'cover',
      backgroundPosition: 'center',
      backgroundColor: custom.bg
    };
  }

  function panelStyle(custom, skin, id) {
    if (skin !== 'custom') return undefined;
    var module = (custom.modules && custom.modules[id]) || { opacity: 0.72 };
    var opacity = typeof module.opacity === 'number' ? module.opacity : 0.72;
    var base = alpha(custom.panel, opacity);
    if (module.image) {
      return {
        backgroundImage: 'linear-gradient(' + base + ',' + base + '), url("' + module.image + '")',
        backgroundSize: 'cover',
        backgroundPosition: 'center',
        backgroundColor: 'transparent'
      };
    }
    return { background: base };
  }

  function pickJsonFile(done) {
    var input = document.createElement('input');
    input.type = 'file';
    input.accept = 'application/json,.json';
    input.onchange = function () {
      var file = input.files && input.files[0];
      if (file) done(file);
    };
    input.click();
  }

  function pickImage(done) {
    var input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/*';
    input.onchange = function () {
      var file = input.files && input.files[0];
      if (!file) return;
      if (file.size > 8_000_000) { window.alert('图片太大（上限 8MB）'); return; }
      var reader = new FileReader();
      reader.onload = function () {
        var img = new Image();
        img.onload = function () {
          var max = 1280;
          var scale = Math.min(1, max / Math.max(img.width, img.height));
          var canvas = document.createElement('canvas');
          canvas.width = Math.max(1, Math.round(img.width * scale));
          canvas.height = Math.max(1, Math.round(img.height * scale));
          canvas.getContext('2d').drawImage(img, 0, 0, canvas.width, canvas.height);
          var data = canvas.toDataURL('image/jpeg', 0.78);
          if (data.length > 1_200_000) data = canvas.toDataURL('image/jpeg', 0.6);
          if (data.length > 1_800_000) { window.alert('图片压缩后仍然过大（上限约 1.8MB），换一张小一点的'); return; }
          done(data);
        };
        img.src = reader.result;
      };
      reader.readAsDataURL(file);
    };
    input.click();
  }

  var INTEREST_KEY = 'dsh.status.interests';

  function readInterestEntries() {
    try {
      var raw = JSON.parse(localStorage.getItem(INTEREST_KEY) || '[]');
      if (!Array.isArray(raw)) return [];
      return raw.map(function (entry) {
        if (typeof entry === 'string') return { label: entry, count: 1, at: 0 };
        if (entry && typeof entry.label === 'string') {
          return { label: entry.label, count: Math.max(1, Number(entry.count) || 1), at: Number(entry.at) || 0 };
        }
        return null;
      }).filter(Boolean);
    } catch (error) { return []; }
  }

  function readInterests() {
    return readInterestEntries()
      .sort(function (a, b) { return b.count - a.count || b.at - a.at; })
      .map(function (entry) { return entry.label; });
  }

  var READS_KEY = 'dsh.status.reads.v1';
  var CONSENT_KEY = 'dsh.status.readsConsent.v1';
  var PENDING_KEY = 'dsh.status.pendingRead.v1';
  var READ_MIN_MS = 20_000;
  var READ_MAX_MS = 20 * 60_000;
  var READ_WEAK_MS = 40 * 60_000;

  function getConsent() {
    try { var value = localStorage.getItem(CONSENT_KEY); return value === 'granted' || value === 'denied' ? value : null; }
    catch (error) { return null; }
  }

  function setConsent(value) { try { localStorage.setItem(CONSENT_KEY, value); } catch (error) {} }

  function readReads() {
    try { var raw = JSON.parse(localStorage.getItem(READS_KEY) || '[]'); return Array.isArray(raw) ? raw : []; }
    catch (error) { return []; }
  }

  var PREF_STOP = new Set(['deepseek','the','and','for','with','from','this','that','have','will','are','was','were','not','but','you','your','our','they','their','its','has','had','can','may','new','now','how','why','what','when','who','all','one','two','get','got','use','using','into','over','after','before','about','more','than','then','also','just','like','said','says']);
  var PREF_ZH_STOP = new Set(['我们','你们','他们','这个','那个','一个','没有','可以','就是','什么','已经','还是','因为','所以','但是','如果','以及','并且','而且','进行','通过','对于','关于','目前','现在','今天','昨天','明天','表示','认为','相关','消息','报道','记者','编辑','来源','标题']);

  function readPreferenceProfile() {
    var weights = new Map();
    function addText(text, weight) {
      var lower = String(text || '').toLowerCase();
      var words = lower.match(/[a-z][a-z0-9.+-]{2,}/g) || [];
      words.forEach(function (word) {
        if (PREF_STOP.has(word)) return;
        weights.set(word, (weights.get(word) || 0) + weight);
      });
      var runs = lower.match(/[一-龥]{2,}/g) || [];
      runs.forEach(function (run) {
        if (run.length <= 4 && !PREF_ZH_STOP.has(run)) weights.set(run, (weights.get(run) || 0) + weight);
        for (var i = 0; i < run.length - 1; i += 1) {
          var bigram = run.slice(i, i + 2);
          if (PREF_ZH_STOP.has(bigram)) continue;
          weights.set(bigram, (weights.get(bigram) || 0) + weight * 0.35);
        }
      });
    }
    readInterestEntries().forEach(function (entry) {
      addText(entry.label, Math.min(3, Number(entry.count) || 1));
    });
    readReads().forEach(function (entry) {
      addText(entry.label, (Number(entry.weight) || 0.3) * 1.4);
    });
    return Array.from(weights.entries())
      .sort(function (a, b) { return b[1] - a[1]; })
      .slice(0, 70)
      .map(function (pair) { return { token: pair[0], weight: pair[1] }; });
  }

  function preferenceScore(item, profile) {
    if (!profile.length) return 0;
    var text = (String(item.title || '') + ' ' + String(item.snippet || '')).toLowerCase();
    var score = 0;
    for (var i = 0; i < profile.length; i += 1) {
      if (text.indexOf(profile[i].token) >= 0) score += profile[i].weight;
    }
    return score;
  }

  function rankByPreference(items, profile) {
    if (!profile.length) return items;
    return items.map(function (item, index) {
      return { item: item, index: index, score: preferenceScore(item, profile) };
    }).sort(function (a, b) {
      return (a.item.bucket || 0) - (b.item.bucket || 0) || b.score - a.score || a.index - b.index;
    }).map(function (row) { return row.item; });
  }

  function finalizePendingRead() {
    if (getConsent() !== 'granted') return;
    try {
      var raw = localStorage.getItem(PENDING_KEY);
      if (!raw) return;
      localStorage.removeItem(PENDING_KEY);
      var pending = JSON.parse(raw);
      if (!pending || !pending.startedAt || !pending.label) return;
      var dwell = Date.now() - Number(pending.startedAt);
      var weight = dwell >= READ_MIN_MS && dwell <= READ_MAX_MS ? 1 : dwell > READ_MAX_MS && dwell <= READ_WEAK_MS ? 0.3 : 0;
      if (!weight) return;
      var list = readReads();
      list.unshift({ label: String(pending.label).slice(0, 40), dwellMs: dwell, weight: weight, at: Date.now() });
      localStorage.setItem(READS_KEY, JSON.stringify(list.slice(0, 50)));
    } catch (error) {}
  }

  function trackRead(label) {
    if (getConsent() !== 'granted') return;
    finalizePendingRead();
    try { localStorage.setItem(PENDING_KEY, JSON.stringify({ label: String(label || '').slice(0, 40), startedAt: Date.now() })); }
    catch (error) {}
  }

  function rememberInterest(label) {
    if (getConsent() !== 'granted') return;
    var text = String(label || '').trim().slice(0, 40);
    if (!text) return;
    try {
      var map = new Map();
      readInterestEntries().forEach(function (entry) { map.set(entry.label, entry); });
      var existing = map.get(text);
      map.set(text, { label: text, count: (existing ? existing.count : 0) + 1, at: Date.now() });
      var list = Array.from(map.values())
        .sort(function (a, b) { return b.count - a.count || b.at - a.at; })
        .slice(0, 24);
      localStorage.setItem(INTEREST_KEY, JSON.stringify(list));
    } catch (error) {}
  }

  function clearPrivacyData() {
    try { localStorage.removeItem(READS_KEY); localStorage.removeItem(PENDING_KEY); localStorage.removeItem(INTEREST_KEY); }
    catch (error) {}
  }

  if (typeof window !== 'undefined') {
    window.addEventListener('focus', finalizePendingRead);
    window.addEventListener('pagehide', finalizePendingRead);
    document.addEventListener('visibilitychange', function () { if (!document.hidden) finalizePendingRead(); });
    finalizePendingRead();
  }

  var STATUS_LABEL = {
    operational: '正常', degraded: '性能下降', partial_outage: '部分中断',
    full_outage: '服务中断', maintenance: '维护中', unknown: '未知',
  };
  var STATUS_LONG = {
    operational: '所有系统运行正常', degraded: '部分服务性能下降', partial_outage: '部分服务中断',
    full_outage: '服务大面积中断', maintenance: '正在进行维护', unknown: '状态未知',
  };
  var SEVERITY = { operational: 0, maintenance: 1, degraded: 2, partial_outage: 3, full_outage: 4 };

  function colorOf(status) {
    // 悬停卡/标题栏在皮肤作用域之外，必须带真实颜色兜底，否则 --h-* 未定义会显示成灰色。
    if (status === 'degraded') return 'var(--h-warn, #d97706)';
    if (status === 'partial_outage' || status === 'full_outage') return 'var(--h-bad, #e5484d)';
    if (status === 'maintenance') return 'var(--h-accent2, #4d6bfe)';
    if (status === 'operational') return 'var(--h-ok, #22a06b)';
    return 'var(--h-dim, #8a8f98)';
  }

  function statusLabel(status) { return STATUS_LABEL[status] || '未知'; }

  function heatErrorText(error) {
    var text = String(error || '');
    if (/404|not found/i.test(text)) return '宿主仍是旧版本：/heat 未注册，重启 DSH 后生效';
    return '热度源暂时不可用：' + text;
  }

  function fmtClock(ms) {
    if (!ms) return '--:--';
    try {
      return new Intl.DateTimeFormat('zh-CN', { hour: '2-digit', minute: '2-digit', hour12: false, timeZone: 'Asia/Shanghai' }).format(new Date(ms));
    } catch (error) { return '--:--'; }
  }

  function fmtDate(ms) {
    if (!ms) return '';
    try {
      return new Intl.DateTimeFormat('zh-CN', { month: '2-digit', day: '2-digit', timeZone: 'Asia/Shanghai' }).format(new Date(ms)).replace('/', '.');
    } catch (error) { return ''; }
  }

  function timeAgo(ms) {
    if (!ms) return '';
    var diff = Date.now() - ms;
    if (diff < 60_000) return '刚刚';
    if (diff < 3_600_000) return Math.floor(diff / 60_000) + ' 分钟前';
    if (diff < 86_400_000) return Math.floor(diff / 3_600_000) + ' 小时前';
    return Math.floor(diff / 86_400_000) + ' 天前';
  }

  function pct(value) {
    if (value === null || value === undefined || Number.isNaN(Number(value))) return '—';
    return Number(value).toFixed(2);
  }

  function pctText(value) {
    var text = pct(value);
    return text === '—' ? '—' : text + '%';
  }

  function barColor(rank) {
    if (rank >= 4) return 'var(--h-bad, #e5484d)';
    if (rank === 3) return 'var(--h-partial, #f0883e)';
    if (rank === 2) return 'var(--h-warn, #d97706)';
    if (rank === 1) return 'var(--h-accent2, #4d6bfe)';
    return 'var(--h-ok, #2ea043)';
  }

  function dayLabel(startDate, index) {
    var parts = String(startDate || '').split(/[\/\-]/).map(Number);
    if (parts.length !== 3 || !parts[0]) return '';
    var date = new Date(Date.UTC(parts[0], parts[1] - 1, parts[2]));
    date.setUTCDate(date.getUTCDate() + index);
    return (date.getUTCMonth() + 1) + '月' + date.getUTCDate() + '日';
  }

  function domainOf(url) {
    try { return new URL(url).hostname.replace(/^www\./, ''); } catch (error) { return ''; }
  }

  function sourceShort(name) {
    if (!name) return '?';
    if (name === 'Hacker News') return 'HN';
    if (name === 'GitHub') return 'GH';
    if (name === 'IT之家') return 'IT';
    if (name === '量子位') return 'QB';
    if (name === 'Solidot') return 'SD';
    if (name === '开源中国') return 'OSC';
    return String(name).slice(0, 3).toUpperCase();
  }

  var CSS = [
    '.dss-root{position:fixed;z-index:60;display:flex;align-items:center;top:calc((var(--dsh-windows-titlebar-height, var(--dsh-frame-top-clearance, 40px)) - 24px) / 2);right:calc(100vw - env(titlebar-area-x, 0px) - env(titlebar-area-width, calc(100vw - 138px)) + 8px);font:inherit;-webkit-app-region:no-drag}',
    '.dss-trigger{display:inline-flex;align-items:center;gap:7px;height:24px;padding:0 9px;border-radius:7px;border:1px solid transparent;background:transparent;color:var(--dsw-alias-label-secondary,#6b7280);font-size:12px;line-height:1;cursor:pointer;transition:background .12s,border-color .12s,color .12s;-webkit-app-region:no-drag}',
    '.dss-trigger:hover,.dss-trigger[aria-expanded="true"]{background:var(--dsw-alias-interactive-bg-hover,rgba(127,127,127,.12));border-color:var(--dsw-alias-border-l3,rgba(127,127,127,.2));color:var(--dsw-alias-label-primary,#111)}',
    '.dss-trigger:focus-visible{outline:2px solid var(--dsw-alias-brand-primary,#4d6bfe);outline-offset:2px}',
    '.dss-dot{position:relative;width:7px;height:7px;border-radius:50%;flex:0 0 auto;background:var(--dss-color,#8a8f98)}',
    '.dss-dot[data-pulse="true"]:after{content:"";position:absolute;inset:-3px;border-radius:50%;border:1px solid var(--dss-color,#8a8f98);opacity:.55;animation:dss-pulse 2s ease-out infinite}',
    '@keyframes dss-pulse{0%{transform:scale(.7);opacity:.6}70%{transform:scale(1.6);opacity:0}100%{opacity:0}}',
    '.dss-pop{position:absolute;top:calc(100% + 8px);right:0;width:330px;max-height:min(460px,calc(100vh - 80px));overflow:auto;padding:12px;border-radius:12px;border:1px solid var(--h-line2,var(--dsw-alias-border-l2,rgba(127,127,127,.22)));background:var(--h-bg,var(--dsw-alias-bg-layer-2,var(--dsw-alias-bg-base,#fff)));box-shadow:0 18px 44px rgba(0,0,0,.32);color:var(--h-text,var(--dsw-alias-label-primary,#111))}',
    '.dss-pop-head{display:flex;align-items:center;justify-content:space-between;gap:8px;margin-bottom:6px;font-size:12.5px;font-weight:600}',
    '.dss-pop-sub{font-size:10px;color:var(--h-dim,var(--dsw-alias-label-tertiary,#8a8f98));margin-bottom:9px}',
    '.dss-pop-foot{display:flex;justify-content:space-between;gap:8px;margin-top:9px;padding-top:8px;border-top:1px solid var(--h-line,var(--dsw-alias-border-l2,rgba(127,127,127,.18)));font-size:10px;color:var(--h-mute,var(--dsw-alias-label-tertiary,#8a8f98))}',
    '.dss-link{color:var(--h-accent,var(--dsw-alias-link,#4d6bfe));cursor:pointer;text-decoration:none}',
    '.dss-link:hover{text-decoration:underline}',

    '.hud-backdrop{position:fixed;inset:0;z-index:80;display:flex;align-items:center;justify-content:center;padding:18px;background:rgba(2,4,6,.66);backdrop-filter:blur(4px);-webkit-app-region:no-drag}',
    '.hud{position:relative;display:flex;flex-direction:column;width:min(1240px,96vw);height:min(880px,calc(100vh - 12px));border-radius:20px;overflow:hidden;border:1px solid var(--h-line2);background:radial-gradient(130% 120% at 0% 0%, var(--h-bg2) 0%, var(--h-bg) 62%);box-shadow:0 28px 70px rgba(0,0,0,.55), var(--h-glow);color:var(--h-text);font-family:"Segoe UI Variable Text","Segoe UI","PingFang SC","Microsoft YaHei",sans-serif;font-size:12px;line-height:1.45}',
    '.hud[data-skin="abyss"]{--h-bg:#05090b;--h-bg2:#081619;--h-panel:rgba(9,25,27,.72);--h-panel2:rgba(12,34,36,.55);--h-line:rgba(52,245,197,.14);--h-line2:rgba(52,245,197,.34);--h-text:#dcfff4;--h-dim:#6f9c93;--h-mute:#436a63;--h-accent:#34f5c5;--h-accent2:#39b7ff;--h-ok:#34f5c5;--h-warn:#ffd166;--h-bad:#ff5d7a;--h-partial:#ff8a5c;--h-mag:#b388ff;--h-glow:0 0 18px rgba(52,245,197,.10);--h-radius:16px}',
    '.hud[data-skin="console"]{--h-bg:#0b0803;--h-bg2:#171007;--h-panel:rgba(28,21,9,.8);--h-panel2:rgba(38,29,13,.55);--h-line:rgba(255,180,84,.16);--h-line2:rgba(255,180,84,.4);--h-text:#f6e3c2;--h-dim:#b08a55;--h-mute:#7a5f3a;--h-accent:#ffb454;--h-accent2:#ff7a45;--h-ok:#ffb454;--h-warn:#ffd166;--h-bad:#ff5d5d;--h-partial:#ff7a45;--h-mag:#d0a2ff;--h-glow:0 0 16px rgba(255,180,84,.10);--h-radius:6px}',
    '.hud[data-skin="paper"]{--h-bg:#f2efe7;--h-bg2:#e9e4d8;--h-panel:rgba(255,255,255,.72);--h-panel2:rgba(255,255,255,.5);--h-line:rgba(20,20,20,.12);--h-line2:rgba(20,20,20,.3);--h-text:#141414;--h-dim:#5c574d;--h-mute:#8b8578;--h-accent:#e0004d;--h-accent2:#1b1b1b;--h-ok:#0d7a52;--h-warn:#b06a00;--h-bad:#c2185b;--h-partial:#d9480f;--h-mag:#6b2bd9;--h-glow:0 0 0 rgba(0,0,0,0);--h-radius:4px}',
    '.hud:after{content:"";pointer-events:none;position:absolute;inset:0;background:repeating-linear-gradient(0deg, rgba(255,255,255,.028) 0 1px, transparent 1px 3px);opacity:.22;mix-blend-mode:overlay}',
    '.hud[data-skin="paper"]:after{display:none}',
    '.hud[data-skin="console"]:after{opacity:.14}',
    '.hud[data-skin="custom"]:after{display:none}',
    '.hud-top{position:relative;z-index:2;display:flex;align-items:center;gap:14px;padding:16px 20px 12px;border-bottom:1px solid var(--h-line)}',
    '.hud-brand{display:flex;align-items:baseline;gap:8px;letter-spacing:.08em;font-size:11px;color:var(--h-dim)}',
    '.hud-brand b{color:var(--h-text);font-size:14px;font-weight:650;letter-spacing:.2em}',
    '.hud-brand span{color:var(--h-mute)}',
    '.hud-live{display:flex;align-items:center;gap:6px;color:var(--h-dim);font-size:10px;letter-spacing:.08em}',
    '.hud-live i{width:6px;height:6px;border-radius:50%;background:var(--h-accent);box-shadow:0 0 8px var(--h-accent);animation:hud-breathe 2.4s ease-in-out infinite}',
    '.hud-live.is-stale i{background:var(--h-warn);box-shadow:0 0 8px var(--h-warn);animation:none}',
    '@keyframes hud-breathe{0%,100%{opacity:.5;transform:scale(.85)}50%{opacity:1;transform:scale(1)}}',
    '.hud-actions{margin-left:auto;display:flex;align-items:center;gap:7px}',
    '.hud-btn{height:27px;padding:0 10px;border-radius:calc(var(--h-radius) - 6px);border:1px solid var(--h-line2);background:transparent;color:var(--h-dim);font-size:11px;cursor:pointer;transition:color .15s,border-color .15s,box-shadow .15s}',
    '.hud-btn:hover{color:var(--h-text);border-color:var(--h-accent);box-shadow:0 0 14px color-mix(in srgb,var(--h-accent) 22%,transparent)}',
    '.hud-btn[data-on="true"]{color:var(--h-accent);border-color:var(--h-accent)}',
    '.hud-close{width:27px;padding:0;font-size:15px;line-height:1}',
    '.hud-kpis{display:grid;grid-template-columns:repeat(6,1fr);gap:8px;padding:12px 20px}',
    '.kpi{position:relative;padding:8px 12px;border:1px solid var(--h-line);border-radius:var(--h-radius);background:var(--h-panel2)}',
    '.kpi-label{font-size:9px;letter-spacing:.14em;color:var(--h-mute);text-transform:uppercase}',
    '.kpi-value{margin-top:3px;font-family:inherit;font-weight:600;letter-spacing:-.01em;font-size:23px;line-height:1.1;letter-spacing:.02em;font-variant-numeric:tabular-nums}',
    '.kpi-value small{font-size:11px;color:var(--h-dim);margin-left:3px;letter-spacing:0}',
    '.kpi-sub{margin-top:3px;font-size:10px;color:var(--h-dim);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}',
    '.kpi[data-tone="ok"] .kpi-value{color:var(--h-ok)}',
    '.kpi[data-tone="warn"] .kpi-value{color:var(--h-warn)}',
    '.kpi[data-tone="bad"] .kpi-value{color:var(--h-bad)}',
    '.hud-body{position:relative;z-index:2;flex:1;min-height:0;display:flex;flex-direction:column;gap:12px;padding:0 20px 12px}',
    '.hud-main{display:grid;grid-template-columns:1fr 1.5fr .9fr;gap:12px;flex:.97;min-height:0}',
    '.hud-bottom{display:grid;grid-template-columns:1.42fr 1fr;gap:12px;flex:1.12;min-height:0}',
    '.p{position:relative;display:flex;flex-direction:column;min-width:0;min-height:0;border:1px solid var(--h-line);border-radius:var(--h-radius);background:var(--h-panel);overflow:hidden}',
    '.p-head{display:flex;align-items:center;justify-content:space-between;gap:8px;padding:8px 12px 4px;font-size:10px;letter-spacing:.06em;text-transform:uppercase;color:var(--h-dim)}',
    '.p-head b{font-weight:600;color:var(--h-text);letter-spacing:.12em}',
    '.p-head .hud-link{font-size:10px;letter-spacing:0;text-transform:none;color:var(--h-accent);cursor:pointer}',
    '.p-body{flex:1;min-height:0;overflow:auto;padding:0 12px 8px}',
    '.p-body::-webkit-scrollbar{width:6px}.p-body::-webkit-scrollbar-thumb{background:var(--h-line2);border-radius:3px}',
    '.comp-row{display:grid;grid-template-columns:7px 1fr auto;gap:8px;align-items:center;padding:3px 0 2px;border-bottom:1px solid color-mix(in srgb,var(--h-line) 70%,transparent)}',
    '.comp-row:last-child{border-bottom:0}',
    '.comp-name{font-size:11px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}',
    '.comp-sub{font-size:9px;color:var(--h-mute);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}',
    '.comp-pct{font-family:inherit;font-size:11px;color:var(--h-dim);font-variant-numeric:tabular-nums}',
    '.comp-bars{grid-column:2 / 4;display:flex;gap:1px;height:5px;margin-top:1px}',
    '.comp-bars i{flex:1 1 0;min-width:1px;border-radius:.5px;background:var(--h-ok);opacity:.62;transition:opacity .15s}',
    '.comp-bars i:hover{opacity:1}',
    '.comp-note{margin-top:7px;font-size:9px;color:var(--h-mute);letter-spacing:.03em}',
    '.chart-wrap{position:relative;flex:1;min-height:90px;padding:2px 8px 0 10px}',
    '.chart{width:100%;height:100%;display:block;overflow:visible}',
    '.chart-line{fill:none;stroke:var(--h-accent);stroke-width:1.6;stroke-linejoin:round;stroke-linecap:round;filter:drop-shadow(0 0 3px color-mix(in srgb,var(--h-accent) 30%,transparent))}',
    '.chart-dot{fill:var(--h-bg);stroke:var(--h-accent);stroke-width:1.4}',
    '.chart-grid{stroke:var(--h-line);stroke-width:.6;stroke-dasharray:2 4}',
    '.chart-axis{fill:var(--h-mute);font-size:9px;font-family:inherit}',
    '.chart-legend{display:flex;gap:10px;align-items:center;padding:4px 12px 8px;font-size:9px;color:var(--h-mute)}',
    '.seg{display:inline-flex;border:1px solid var(--h-line);border-radius:6px;overflow:hidden}',
    '.seg button{appearance:none;border:0;background:transparent;color:var(--h-dim);font-size:9px;padding:2px 7px;cursor:pointer}',
    '.seg button[data-on="true"]{background:color-mix(in srgb,var(--h-accent) 30%,transparent);color:var(--h-accent);box-shadow:inset 0 0 0 1px color-mix(in srgb,var(--h-accent) 35%,transparent)}',
    '.ring-wrap{position:relative;display:flex;align-items:center;justify-content:center;padding:6px 0 2px}',
    '.ring{display:block;outline:none}',
    '.ring-wrap{outline:none}',
    '.ring-center{position:absolute;text-align:center}',
    '.ring-score{font-family:inherit;font-size:34px;line-height:1;font-variant-numeric:tabular-nums}',
    '.ring-label{font-size:10px;letter-spacing:.18em;color:var(--h-dim);margin-top:4px}',
    '.ring-track{stroke:color-mix(in srgb,var(--h-line) 80%,transparent)}',
    '.ring-bar{stroke:var(--h-accent);transition:stroke-dashoffset 1s cubic-bezier(.2,.8,.2,1);filter:drop-shadow(0 0 4px color-mix(in srgb,var(--h-accent) 35%,transparent))}',
    '.sent{display:flex;height:6px;border-radius:3px;overflow:hidden;margin:8px 0 5px;background:color-mix(in srgb,var(--h-line) 50%,transparent)}',
    '.sent i{display:block;height:100%}',
    '.sent-legend{display:flex;justify-content:space-between;font-size:9px;color:var(--h-dim);margin-bottom:8px}',
    '.src-chips{display:flex;flex-wrap:wrap;gap:5px;padding:0 12px 8px}',
    '.chip{display:inline-flex;align-items:center;gap:4px;height:16px;padding:0 6px;border-radius:4px;border:1px solid var(--h-line);font-size:9px;color:var(--h-dim);letter-spacing:.04em}',
    '.chip i{width:4px;height:4px;border-radius:50%;background:var(--h-ok)}',
    '.chip[data-off="true"] i{background:var(--h-bad)}',
    '.topic{display:grid;grid-template-columns:22px 1fr auto;gap:8px;align-items:center;padding:2px 2px;border-bottom:0;cursor:pointer}',
    '.topic:last-child{border-bottom:0}',
    '.topic:hover .topic-label{color:var(--h-accent)}',
    '.topic-rank{font-family:inherit;font-size:10px;color:var(--h-mute)}',
    '.topic-label{font-size:12px;font-weight:600;transition:color .15s;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}',
    '.topic-sample{font-size:9px;line-height:1.2;color:var(--h-mute);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:100%}',
    '.topic-count{font-family:inherit;font-size:11px;color:var(--h-accent)}',
    '.topic-right{display:flex;align-items:center;gap:4px;justify-content:flex-end}',
    '.topic-src{display:flex;gap:3px;justify-content:flex-end;margin-top:2px}',
    '.feed-row{display:flex;gap:8px;padding:6px 2px;border-bottom:1px solid color-mix(in srgb,var(--h-line) 65%,transparent);text-decoration:none;color:inherit}',
    '.feed-row:hover{background:color-mix(in srgb,var(--h-accent) 6%,transparent)}',
    '.feed-badge{flex:0 0 auto;font-size:9px;letter-spacing:.06em;padding:1px 4px;border:1px solid var(--h-line2);border-radius:3px;color:var(--h-dim);height:16px}',
    '.feed-main{min-width:0;flex:1}',
    '.feed-title{font-size:11px;line-height:1.35;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden}',
    '.feed-meta{font-size:9px;color:var(--h-mute);margin-top:2px;display:flex;gap:8px}',
    '.feed-head{gap:6px}',
    '.feed-tabs{flex:0 0 auto}',
    '.feed-tabs button{padding:2px 6px}',
    '.feed-count{font-size:9px;color:var(--h-mute);white-space:nowrap}',
    '.feed-desc{font-size:9px;line-height:1.35;color:var(--h-dim);margin-top:2px;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden}',
    '.feed-plugin .feed-title{font-weight:600}',
    '.feed-note{margin:2px 0 4px;font-size:9px;color:var(--h-warn)}',
    '.hud-version{color:var(--h-mute);font-variant-numeric:tabular-nums}',
    '.hud-foot{position:relative;z-index:2;display:flex;align-items:center;flex-wrap:wrap;row-gap:4px;gap:12px;padding:0 18px 10px;font-size:9px;color:var(--h-mute)}',
    '.hud-foot .spacer{flex:1}',
    '.hud-foot i{width:4px;height:4px;border-radius:50%;display:inline-block;margin-right:4px;background:var(--h-ok)}',
    '.hud-foot i[data-off="true"]{background:var(--h-bad)}',
    '.hud-note{color:var(--h-mute);font-size:9px}',
    '.topic-time{font-size:9px;color:var(--h-mute);font-variant-numeric:tabular-nums;white-space:nowrap}',
    '.topic-new{font-size:9px;color:var(--h-accent);border:1px solid var(--h-line2);border-radius:3px;padding:0 3px;line-height:1.4}',
    '.consent-mask{position:absolute;inset:0;z-index:9;display:flex;align-items:center;justify-content:center;padding:16px;background:rgba(0,0,0,.45);backdrop-filter:blur(3px)}',
    '.consent-card{width:min(440px,100%);max-height:82%;overflow:auto;padding:18px;border:1px solid var(--h-line2);border-radius:12px;background:var(--h-bg);box-shadow:0 24px 60px rgba(0,0,0,.45)}',
    '.consent-title{font-size:14px;font-weight:650;margin-bottom:8px}',
    '.consent-note{font-size:11px;line-height:1.6;color:var(--h-dim)}',
    '.consent-list{margin:8px 0;padding-left:16px;font-size:10.5px;line-height:1.7;color:var(--h-dim)}',
    '.consent-more{align-self:flex-start;background:none;border:0;color:var(--h-accent);font-size:10px;cursor:pointer;padding:0}',
    '.consent-detail{margin:8px 0;padding:8px;border:1px solid var(--h-line);border-radius:6px;font-size:10px;line-height:1.7;color:var(--h-mute)}',
    '.consent-actions{display:flex;gap:8px;justify-content:flex-end;flex-wrap:wrap;margin-top:12px}',
    '.skin-drawer{position:absolute;top:0;right:0;bottom:0;width:340px;z-index:6;display:flex;flex-direction:column;gap:9px;padding:16px 14px;overflow-y:auto;border-left:1px solid var(--h-line2);background:color-mix(in srgb,var(--h-bg) 92%,transparent);backdrop-filter:blur(14px);animation:hud-slide .18s ease-out}',
    '@keyframes hud-slide{from{transform:translateX(18px);opacity:0}to{transform:none;opacity:1}}',
    '.skin-title{font-size:10px;letter-spacing:.16em;text-transform:uppercase;color:var(--h-dim)}',
    '.skin-card{display:flex;gap:10px;align-items:center;padding:9px;border:1px solid var(--h-line);border-radius:calc(var(--h-radius) - 4px);cursor:pointer;transition:border-color .15s,background .15s}',
    '.skin-card:hover{border-color:var(--h-line2);background:color-mix(in srgb,var(--h-accent) 5%,transparent)}',
    '.skin-card[data-on="true"]{border-color:var(--h-accent);background:color-mix(in srgb,var(--h-accent) 10%,transparent);box-shadow:0 8px 22px rgba(0,0,0,.28), inset 0 0 0 1px color-mix(in srgb,var(--h-accent) 45%,transparent);transform:translateY(-1px)}',
    '.skin-prev{position:relative;width:64px;height:44px;border-radius:6px;overflow:hidden;flex:0 0 auto}',
    '.skin-prev i{position:absolute;bottom:7px;width:6px;border-radius:1px;opacity:.9}',
    '.skin-meta{min-width:0}',
    '.skin-name{font-size:12px;font-weight:600}',
    '.skin-name em{font-style:normal;font-size:9px;color:var(--h-mute);margin-left:5px;letter-spacing:.1em}',
    '.skin-tag{font-size:9px;color:var(--h-dim);margin-top:2px}',
    '.skin-foot{margin-top:auto;font-size:9px;line-height:1.5;color:var(--h-mute);border-top:1px solid var(--h-line);padding-top:8px}',
    '.skin-sec-title{margin-top:6px;font-size:9px;letter-spacing:.14em;text-transform:uppercase;color:var(--h-mute)}',
    '.skin-new{border-style:dashed;color:var(--h-dim)}',
    '.skin-new-plus{width:64px;height:44px;display:flex;align-items:center;justify-content:center;flex:0 0 auto;border:1px dashed var(--h-line2);border-radius:6px;font-size:20px;color:var(--h-accent)}',
    '.skin-new:hover .skin-new-plus{border-color:var(--h-accent)}',
    '.cust-preset{display:flex;gap:6px}',
    '.cust-select{flex:0 0 118px;height:24px;border:1px solid var(--h-line);border-radius:5px;background:var(--h-bg);color:var(--h-text);font-size:10px}',
    '.cust-actions{display:flex;flex-wrap:wrap;gap:5px}',
    '.cust-actions .cust-btn{flex:1 1 auto}',
    '.cust-thumb{height:46px;border-radius:6px;border:1px solid var(--h-line);background-size:cover;background-position:center;margin:6px 0 2px}',
    '.dss-heat{display:flex;align-items:center;gap:0;margin:6px 0 8px;padding:6px 8px;border-radius:7px;background:color-mix(in srgb,var(--h-accent) 7%,transparent);border:1px solid var(--h-line)}',
    '.dss-heat-label{font-size:9px;letter-spacing:.08em;color:var(--h-dim)}',
    '.dss-heat-score{margin-left:6px;font-size:15px;font-weight:650;font-variant-numeric:tabular-nums}',
    '.dss-heat-divider{width:1px;height:12px;background:var(--h-line2);margin:0 8px}',
    '.dss-heat-topic{flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-size:10px;color:var(--h-text)}',
    '.dss-heat-meta{flex:0 0 auto;font-size:9px;color:var(--h-mute);margin-left:6px}',
    '.hud-skel{height:10px;border-radius:4px;background:color-mix(in srgb,var(--h-line) 70%,transparent);animation:hud-skel 1.4s ease-in-out infinite;margin:8px 0}',
    '@keyframes hud-skel{0%,100%{opacity:.4}50%{opacity:.9}}',
    '.hud-empty{padding:18px 8px;text-align:center;font-size:10px;color:var(--h-dim)}',
    '.hud-err{color:var(--h-bad)}',
    '.topic-note{margin-top:5px;font-size:9px;color:var(--h-mute);text-align:center}',
    '.skin-drawer.custom{width:360px;overflow:auto}',
    '.cust-sec{margin-top:10px;padding-top:9px;border-top:1px solid var(--h-line)}',
    '.cust-sec-title{font-size:9px;letter-spacing:.14em;color:var(--h-mute);text-transform:uppercase;margin-bottom:6px}',
    '.cust-row{display:flex;align-items:center;gap:8px;margin:7px 0}',
    '.cust-label{width:58px;flex:0 0 58px;font-size:10px;color:var(--h-dim)}',
    '.cust-color{width:30px;height:24px;padding:0;border:1px solid var(--h-line2);border-radius:5px;background:transparent;appearance:none;-webkit-appearance:none}',
    '.cust-color::-webkit-color-swatch-wrapper{padding:2px}',
    '.cust-color::-webkit-color-swatch{border:0;border-radius:3px}',
    '.cust-color::-moz-color-swatch{border:0;border-radius:3px}',
    '.cust-hex{font-family:inherit;font-size:9px;color:var(--h-mute)}',
    '.cust-input{flex:1;min-width:0;height:24px;padding:0 6px;border:1px solid var(--h-line);border-radius:5px;background:transparent;color:var(--h-text);font-size:10px}',
    '.cust-input:focus{outline:none;border-color:var(--h-accent)}',
    '.cust-btn{height:22px;padding:0 7px;border:1px solid var(--h-line2);border-radius:5px;background:transparent;color:var(--h-dim);font-size:9px;cursor:pointer;white-space:nowrap}',
    '.cust-btn:hover{color:var(--h-text);border-color:var(--h-accent)}',
    '.cust-mod{border:1px solid var(--h-line);border-radius:6px;margin:5px 0;overflow:hidden}',
    '.cust-mod-head{display:flex;align-items:center;justify-content:space-between;padding:6px 8px;font-size:11px;cursor:pointer}',
    '.cust-mod-head span:last-child{font-family:inherit;font-size:9px;color:var(--h-mute)}',
    '.cust-mod-body{padding:6px 8px 9px;border-top:1px solid var(--h-line);display:flex;flex-direction:column;gap:6px}',
    '.cust-range{width:100%;accent-color:var(--h-accent)}',
    '.cust-eq{display:flex;gap:4px;align-items:center}',
    '.cust-foot{display:flex;gap:8px;margin-top:auto;padding-top:10px;border-top:1px solid var(--h-line)}',
    '.cust-note{font-size:9px;line-height:1.55;color:var(--h-mute)}',
    '.topic-sep{display:flex;align-items:center;justify-content:space-between;gap:8px;margin:4px 0 1px;padding-top:4px;border-top:1px solid var(--h-line2);font-size:9px;letter-spacing:.12em;color:var(--h-mute);text-transform:uppercase}',
    '.topic-ai{padding:4px 2px}',
    '.topic-star{color:inherit;margin-right:6px;font-size:10px;opacity:1}',
    '.topic-ai .topic-label{font-weight:500;font-size:11px}',
    '.topic-ai .topic-sample{color:var(--h-mute)}',
    '.ai-badge{display:inline-block;font-size:9px;letter-spacing:.08em;padding:1px 4px;border:1px solid var(--h-line2);border-radius:3px;color:var(--h-accent)}',
    '@media (max-height:780px){.hud-top{padding:10px 14px 8px}.hud-kpis{padding:9px 14px;gap:8px}.kpi{padding:7px 9px 6px}.kpi-value{font-size:19px}.hud-body{padding:0 14px 8px;gap:9px}.hud-main{gap:9px}.hud-bottom{gap:9px}.comp-row{padding:2px 0 1px}.comp-name{font-size:10px}.comp-bars{height:4px}.comp-note{display:none}.p-head{padding:7px 10px 4px}.p-body{padding:0 10px 6px}.topic{padding:4px 2px}.feed-row{padding:4px 2px}.topic-note{display:block}}',
    '@media (max-width:900px){.hud-kpis{grid-template-columns:repeat(3,1fr)}.hud-main{grid-template-columns:1fr 1fr}.hud-main .p:last-child{display:none}.hud-bottom{grid-template-columns:1fr}}',
    '@media (prefers-reduced-motion: reduce){.hud *,.hud *:before,.hud *:after{animation:none!important;transition:none!important}.hud-backdrop,.skin-drawer{backdrop-filter:none}}',
  ].join('\n');

  function installStyle() {
    var tagId = PACKAGE + '/client.css';
    if (document.querySelector('style[data-plugin-css="' + tagId + '"]')) return function () {};
    var tag = document.createElement('style');
    tag.dataset.plugin = PACKAGE;
    tag.dataset.pluginCss = tagId;
    tag.textContent = CSS;
    document.head.appendChild(tag);
    return function () {};
  }

  function makeModule(React) {
    var h = React.createElement;
    var useState = React.useState;
    var useEffect = React.useEffect;
    var useRef = React.useRef;
    var useCallback = React.useCallback;

    var chartSeq = 0;

    function useApi(path, auto) {
      var tuple = useState({ data: null, error: null, loading: true, fetching: false });
      var state = tuple[0];
      var setState = tuple[1];
      var alive = useRef(true);
      var abort = useRef(null);

      var load = useCallback(function (force, hard) {
        if (abort.current) abort.current.abort();
        var controller = new AbortController();
        abort.current = controller;
        setState(function (prev) {
          return { data: prev.data, error: prev.error, loading: prev.data === null, fetching: true };
        });
        fetch(ROUTE_PATH + path + (force ? '?force=1' : '') + (hard ? (force ? '&' : '?') + 'hard=1' : ''), {
          headers: { accept: 'application/json' },
          signal: controller.signal,
          cache: 'no-store',
        })
          .then(function (response) {
            return response.text().then(function (text) {
              var payload = null;
              try { payload = JSON.parse(text); } catch (error) { payload = null; }
              if (!response.ok) throw new Error((payload && payload.error) || ('HTTP ' + response.status));
              return payload;
            });
          })
          .then(function (payload) {
            if (!alive.current) return;
            if (!payload || payload.ok !== true || !payload.data) throw new Error((payload && payload.error) || '数据格式异常');
            setState({ data: payload.data, error: null, loading: false, fetching: false });
          })
          .catch(function (error) {
            if (!alive.current || (error && error.name === 'AbortError')) return;
            setState(function (prev) {
              return { data: prev.data, error: String((error && error.message) || error), loading: false, fetching: false };
            });
          });
      }, [path]);

      useEffect(function () {
        alive.current = true;
        if (auto !== false) load(false);
        return function () {
          alive.current = false;
          if (abort.current) abort.current.abort();
        };
      }, [load, auto]);

      return { state: state, load: load };
    }

    function useAiTopics() {
      var tuple = useState({ data: null, error: null, loading: false, limited: false });
      var state = tuple[0];
      var setState = tuple[1];
      var abort = useRef(null);
      var lastOk = useRef(0);
      var hasData = useRef(false);
      var retry = useRef(0);

      var load = useCallback(function (seed, force) {
        // 宿主 3 秒限流：自动刷新时刚成功过就复用；手动刷新允许强制重试。
        if (!force && hasData.current && Date.now() - lastOk.current < 3000) return;
        if (abort.current) abort.current.abort();
        clearTimeout(retry.current);
        var controller = new AbortController();
        abort.current = controller;
        setState(function (prev) {
          return { data: prev.data, error: null, loading: prev.data === null, limited: false };
        });
        var url = ROUTE_PATH + '/ai-topics?seed=' + encodeURIComponent(String(seed || Date.now()));
        fetch(url, { headers: { accept: 'application/json' }, signal: controller.signal, cache: 'no-store' })
          .then(function (response) {
            return response.text().then(function (text) {
              var payload = null;
              try { payload = JSON.parse(text); } catch (error) { payload = null; }
              if (!response.ok) {
                var failure = new Error((payload && payload.error) || ('HTTP ' + response.status));
                failure.status = response.status;
                failure.retryAfterMs = payload && payload.retryAfterMs;
                throw failure;
              }
              return payload;
            });
          })
          .then(function (payload) {
            if (!payload || payload.ok !== true || !payload.data) throw new Error((payload && payload.error) || '数据格式异常');
            lastOk.current = Date.now();
            hasData.current = true;
            setState({ data: payload.data, error: null, loading: false, limited: false });
          })
          .catch(function (error) {
            if (!error || error.name === 'AbortError') return;
            var message = String(error.message || error);
            var limited = error.status === 429 || /频繁/.test(message);
            if (hasData.current) {
              // 有旧结果就保留，别让一次限流把整列话题清空。
              setState(function (prev) { return { data: prev.data, error: null, loading: false, limited: limited }; });
            } else {
              setState({ data: null, error: limited ? '搜索太频繁，稍后自动重试' : message, loading: false, limited: limited });
            }
            if (limited) {
              var wait = Math.max(1200, Math.min(5000, Number(error.retryAfterMs) || 3200));
              retry.current = setTimeout(function () { load(String(seed) + '-r', true); }, wait);
            }
          });
      }, []);
      useEffect(function () {
        return function () {
          clearTimeout(retry.current);
          if (abort.current) abort.current.abort();
        };
      }, []);
      return { state: state, load: load };
    }

    function useGithubPlugins() {
      var tuple = useState({ data: null, error: null, loading: false, stale: false, fetchedAt: 0 });
      var state = tuple[0];
      var setState = tuple[1];
      var abort = useRef(null);
      var dataRef = useRef(null);
      var fetchedRef = useRef(0);

      var load = useCallback(function (force) {
        if (!force && dataRef.current && Date.now() - fetchedRef.current < 5 * 60_000) return;
        if (!force && dataRef.current) force = true;
        if (abort.current) abort.current.abort();
        var controller = new AbortController();
        abort.current = controller;
        setState(function (prev) {
          return { data: prev.data, error: null, loading: prev.data === null, stale: prev.stale, fetchedAt: prev.fetchedAt };
        });
        fetch(ROUTE_PATH + '/github-plugins' + (force ? '?force=1' : ''), {
          headers: { accept: 'application/json' },
          signal: controller.signal,
          cache: 'no-store',
        })
          .then(function (response) {
            return response.text().then(function (text) {
              var payload = null;
              try { payload = JSON.parse(text); } catch (error) { payload = null; }
              if (!response.ok) throw new Error((payload && payload.error) || ('HTTP ' + response.status));
              return payload;
            });
          })
          .then(function (payload) {
            if (!payload || payload.ok !== true || !payload.data) throw new Error((payload && payload.error) || '数据格式异常');
            dataRef.current = payload.data;
            fetchedRef.current = Date.now();
            setState({ data: payload.data, error: null, loading: false, stale: false, fetchedAt: fetchedRef.current });
          })
          .catch(function (error) {
            if (!error || error.name === 'AbortError') return;
            var message = String(error.message || error);
            setState(function (prev) {
              return { data: prev.data, error: prev.data ? null : message, loading: false, stale: Boolean(prev.data), fetchedAt: prev.fetchedAt };
            });
          });
      }, []);
      useEffect(function () { return function () { if (abort.current) abort.current.abort(); }; }, []);
      return { state: state, load: load };
    }

    function Dot(props) {
      return h('span', { className: 'dss-dot', 'data-pulse': props.pulse ? 'true' : undefined, style: { '--dss-color': props.color } });
    }

    function Ring(props) {
      var size = props.size || 150;
      var stroke = props.stroke || 9;
      var value = Math.max(0, Math.min(100, Number(props.value) || 0));
      var r = (size - stroke) / 2;
      var c = 2 * Math.PI * r;
      var offset = c * (1 - value / 100);
      return h('div', { className: 'ring-wrap' },
        h('svg', { className: 'ring', width: size, height: size, viewBox: '0 0 ' + size + ' ' + size },
          h('circle', { className: 'ring-track', cx: size / 2, cy: size / 2, r: r, fill: 'none', strokeWidth: stroke }),
          h('circle', {
            className: 'ring-bar', cx: size / 2, cy: size / 2, r: r, fill: 'none', strokeWidth: stroke,
            strokeLinecap: 'round', strokeDasharray: c, strokeDashoffset: offset,
            transform: 'rotate(-90 ' + size / 2 + ' ' + size / 2 + ')',
          }),
        ),
        h('div', { className: 'ring-center' },
          h('div', { className: 'ring-score' }, Math.round(value)),
          h('div', { className: 'ring-label' }, props.label || 'HEAT'),
        ),
      );
    }

    function AreaChart(props) {
      var data = props.data || [];
      var gradientId = useRef('hud-g-' + (++chartSeq)).current;
      var box = useRef(null);
      var sizeTuple = useState({ w: 560, h: 160 });
      var size = sizeTuple[0];
      var setSize = sizeTuple[1];
      useEffect(function () {
        var node = box.current;
        if (!node) return;
        var host = node.parentElement;
        if (!host || typeof ResizeObserver === 'undefined') return;
        var observer = new ResizeObserver(function () {
          var rect = host.getBoundingClientRect();
          setSize({ w: Math.max(240, Math.round(rect.width)), h: Math.max(120, Math.round(rect.height)) });
        });
        observer.observe(host);
        return function () { observer.disconnect(); };
      }, []);
      var w = size.w;
      var ht = size.h;
      var padTop = 10;
      var padBottom = 22;
      var max = 1;
      data.forEach(function (item) { if (item.count > max) max = item.count; });
      var root = Math.sqrt(max);
      var n = Math.max(2, data.length);
      var points = data.map(function (item, index) {
        var x = 6 + (index / (n - 1)) * (w - 12);
        var y = ht - padBottom - (Math.sqrt(item.count) / root) * (ht - padBottom - padTop);
        return [x, y];
      });
      var line = points.map(function (point, index) {
        return (index === 0 ? 'M' : 'L') + point[0].toFixed(1) + ' ' + point[1].toFixed(1);
      }).join(' ');
      var area = line + ' L ' + (w - 6) + ' ' + (ht - padBottom) + ' L 6 ' + (ht - padBottom) + ' Z';
      var grid = [0.25, 0.5, 0.75].map(function (fraction, index) {
        var y = padTop + fraction * (ht - padBottom - padTop);
        return h('line', { key: index, className: 'chart-grid', x1: 0, x2: w, y1: y, y2: y });
      });
      var labels = props.labels || [];
      var ticks = [];
      if (labels.length) {
        var count = labels.length > 12 ? 3 : 4;
        for (var k = 0; k < count; k += 1) {
          var idx = Math.round((k / (count - 1)) * (labels.length - 1));
          ticks.push({ x: 6 + (idx / (labels.length - 1)) * (w - 12), text: labels[idx], anchor: k === 0 ? 'start' : k === count - 1 ? 'end' : 'middle' });
        }
      }
      return h('svg', { ref: box, className: 'chart', viewBox: '0 0 ' + w + ' ' + ht, preserveAspectRatio: 'none' },
        h('defs', null,
          h('linearGradient', { id: gradientId, x1: '0', y1: '0', x2: '0', y2: '1' },
            h('stop', { offset: '0%', stopColor: 'var(--h-accent)', stopOpacity: '0.34' }),
            h('stop', { offset: '100%', stopColor: 'var(--h-accent)', stopOpacity: '0' }),
          ),
        ),
        grid,
        h('path', { d: area, fill: 'url(#' + gradientId + ')' }),
        h('path', { className: 'chart-line', d: line }),
        points.map(function (point, index) {
          return h('circle', { key: index, className: 'chart-dot', cx: point[0], cy: point[1], r: 2 });
        }),
        ticks.map(function (tick, index) {
          return h('text', { key: 't' + index, className: 'chart-axis', x: tick.x, y: ht - 4, textAnchor: tick.anchor }, tick.text);
        }),
      );
    }

    function skinPreview(preview) {
      return h('div', { className: 'skin-prev', style: { background: preview.bg, border: '1px solid ' + preview.line } },
        h('i', { style: { left: '8px', height: '16px', background: preview.accent } }),
        h('i', { style: { left: '18px', height: '26px', background: preview.accent, opacity: '.55' } }),
        h('i', { style: { left: '28px', height: '10px', background: preview.text, opacity: '.35' } }),
        h('i', { style: { left: '38px', height: '21px', background: preview.accent, opacity: '.8' } }),
        h('i', { style: { left: '48px', height: '13px', background: preview.accent, opacity: '.4' } }),
        h('span', { style: { position: 'absolute', right: '5px', top: '4px', width: '5px', height: '5px', borderRadius: '50%', background: preview.accent } }),
      );
    }

    function SkinDrawer(props) {
      var skin = props.skin;
      var onPick = props.onPick;
      var onClose = props.onClose;
      var store = props.store;
      var onEditCustom = props.onEditCustom;
      var onSelectPreset = props.onSelectPreset;
      var onCreatePreset = props.onCreatePreset;
      var presets = store && Array.isArray(store.presets) ? store.presets : [];
      var activeId = store ? store.activeId : '';

      return h('div', { className: 'skin-drawer', role: 'dialog', 'aria-label': '皮肤库' },
        h('div', { className: 'skin-title' }, '皮肤库 / SKINS'),
        SKINS.map(function (item) {
          return h('div', {
            key: item.id, className: 'skin-card', 'data-on': item.id === skin ? 'true' : 'false',
            role: 'button', tabIndex: 0, 'aria-pressed': item.id === skin ? 'true' : 'false',
            onClick: function () { onPick(item.id); },
            onKeyDown: function (event) { if (event.key === 'Enter' || event.key === ' ') onPick(item.id); },
          },
            skinPreview(item.preview),
            h('div', { className: 'skin-meta' },
              h('div', { className: 'skin-name' }, item.name, h('em', null, item.en)),
              h('div', { className: 'skin-tag' }, item.tagline),
            ),
          );
        }),
        h('div', { className: 'skin-sec-title' }, '自定义方案 / CUSTOM'),
        presets.map(function (preset) {
          var config = preset.config || {};
          var preview = { bg: config.bg || '#05090b', line: alpha(config.accent || '#34f5c5', 0.4), accent: config.accent || '#34f5c5', text: config.text || '#dcfff4' };
          var on = skin === 'custom' && activeId === preset.id;
          return h('div', {
            key: preset.id, className: 'skin-card', 'data-on': on ? 'true' : 'false',
            role: 'button', tabIndex: 0,
            onClick: function () { onSelectPreset(preset.id); onEditCustom(); },
            onKeyDown: function (event) { if (event.key === 'Enter' || event.key === ' ') { onSelectPreset(preset.id); onEditCustom(); } },
          },
            skinPreview(preview),
            h('div', { className: 'skin-meta' },
              h('div', { className: 'skin-name' }, preset.name, h('em', null, 'CUSTOM')),
              h('div', { className: 'skin-tag' }, '编辑于 ' + (fmtDate(preset.updatedAt) || '刚刚')),
            ),
          );
        }),
        h('div', {
          className: 'skin-card skin-new', role: 'button', tabIndex: 0,
          onClick: function () { onCreatePreset(false); onEditCustom(); },
          onKeyDown: function (event) { if (event.key === 'Enter' || event.key === ' ') { onCreatePreset(false); onEditCustom(); } },
        },
          h('span', { className: 'skin-new-plus' }, '+'),
          h('div', { className: 'skin-meta' },
            h('div', { className: 'skin-name' }, '新建自定义方案'),
            h('div', { className: 'skin-tag' }, '从默认外观开始'),
          ),
        ),
        h('div', { className: 'skin-foot' },
          '切换立即生效，选择会记住。按 1 / 2 / 3 切换内置皮肤。',
          h('br'),
          '自定义方案可命名、复制、删除、导入导出；每个方案独立保存。',
        ),
        h('button', { className: 'hud-btn', style: { marginTop: '4px' }, onClick: onClose }, '收起皮肤库'),
      );
    }

    function CustomDrawer(props) {
      var custom = props.custom;
      var preset = props.preset;
      var store = props.store;
      var onChange = props.onChange;
      var onRename = props.onRename;
      var onSelect = props.onSelect;
      var onCreate = props.onCreate;
      var onDuplicate = props.onDuplicate;
      var onDelete = props.onDelete;
      var onExport = props.onExport;
      var onImport = props.onImport;
      var onBack = props.onBack;
      var onReset = props.onReset;
      var openTuple = useState('colors');
      var open = openTuple[0];
      var setOpen = openTuple[1];

      function patch(next) { onChange(Object.assign({}, custom, next)); }
      function patchModule(id, next) {
        var modules = Object.assign({}, custom.modules);
        modules[id] = Object.assign({}, modules[id], next);
        onChange(Object.assign({}, custom, { modules: modules }));
      }
      function colorRow(key, label) {
        return h('div', { className: 'cust-row', key: key },
          h('span', { className: 'cust-label' }, label),
          h('input', {
            className: 'cust-color', type: 'color', value: custom[key],
            onChange: function (event) {
              var next = {};
              next[key] = event.target.value;
              patch(next);
            },
          }),
          h('span', { className: 'cust-hex' }, custom[key]),
        );
      }

      return h('div', { className: 'skin-drawer custom', role: 'dialog', 'aria-label': '自定义皮肤' },
        h('div', { className: 'skin-title' }, '自定义皮肤 / CUSTOM'),
        h('div', { className: 'cust-preset' },
          h('input', {
            key: preset.id, className: 'cust-input', defaultValue: preset.name, 'aria-label': '方案名称',
            onBlur: function (event) {
              var value = String(event.target.value || '').trim();
              if (!value) { event.target.value = preset.name; return; }
              onRename(preset.id, value);
            },
            onKeyDown: function (event) { if (event.key === 'Enter') event.target.blur(); },
          }),
          h('select', {
            className: 'cust-select', value: preset.id, 'aria-label': '切换方案',
            onChange: function (event) { onSelect(event.target.value); },
          }, store.presets.map(function (item) {
            return h('option', { key: item.id, value: item.id }, item.name);
          })),
        ),
        h('div', { className: 'cust-actions' },
          h('button', { className: 'cust-btn', onClick: function () { onCreate(false); } }, '新建'),
          h('button', { className: 'cust-btn', onClick: function () { onDuplicate(preset.id); } }, '复制'),
          h('button', { className: 'cust-btn', onClick: function () { onDelete(preset.id); } }, '删除'),
          h('button', { className: 'cust-btn', onClick: onExport }, '导出'),
          h('button', { className: 'cust-btn', onClick: function () { pickJsonFile(function (file) { onImport(file); }); } }, '导入'),
        ),
        h('div', { className: 'cust-note' }, '改动即时生效，保存在本机；同名方案会被覆盖。图片会压缩后存入 localStorage。'),

        h('div', { className: 'cust-sec' },
          h('div', { className: 'cust-sec-title' }, '配色'),
          colorRow('bg', '背景'),
          colorRow('panel', '面板'),
          colorRow('text', '文字'),
          colorRow('accent', '主色'),
          colorRow('ok', '正常'),
          colorRow('warn', '警告'),
          colorRow('bad', '故障'),
        ),

        h('div', { className: 'cust-sec' },
          h('div', { className: 'cust-sec-title' }, '全局背景图'),
          h('div', { className: 'cust-row' },
            h('span', { className: 'cust-label' }, '图片'),
            h('input', {
              className: 'cust-input', value: custom.image || '', placeholder: 'https:// 图片地址',
              onChange: function (event) { patch({ image: event.target.value }); },
            }),
          ),
          custom.image ? h('div', { className: 'cust-thumb', style: { backgroundImage: 'url("' + custom.image + '")' } }) : null,
          h('div', { className: 'cust-row' },
            h('button', { className: 'cust-btn', onClick: function () { pickImage(function (data) { patch({ image: data }); }); } }, '上传'),
            h('button', { className: 'cust-btn', onClick: function () { patch({ image: '' }); } }, '清除'),
            h('span', { className: 'cust-note', style: { marginLeft: 'auto' } }, custom.image && custom.image.indexOf('data:') === 0 ? '已压缩存储' : ''),
          ),
        ),

        h('div', { className: 'cust-sec' },
          h('div', { className: 'cust-sec-title' }, '单模块背景与透明度'),
          MODULE_DEFS.map(function (def) {
            var module = custom.modules[def.id] || { image: '', opacity: 0.72 };
            var opened = open === def.id;
            return h('div', { className: 'cust-mod', key: def.id },
              h('div', {
                className: 'cust-mod-head',
                onClick: function () { setOpen(opened ? '' : def.id); },
              },
                h('span', null, def.label),
                h('span', null, Math.round((module.opacity || 0.72) * 100) + '% ' + (opened ? '▴' : '▾')),
              ),
              opened ? h('div', { className: 'cust-mod-body' },
                h('input', {
                  className: 'cust-input', value: module.image || '', placeholder: '该模块背景图 URL',
                  onChange: function (event) { patchModule(def.id, { image: event.target.value }); },
                }),
                h('div', { className: 'cust-row' },
                  h('button', { className: 'cust-btn', onClick: function () { pickImage(function (data) { patchModule(def.id, { image: data }); }); } }, '上传'),
                  h('button', { className: 'cust-btn', onClick: function () { patchModule(def.id, { image: '' }); } }, '清除'),
                ),
                h('div', { className: 'cust-row' },
                  h('span', { className: 'cust-label' }, '透明度'),
                  h('input', {
                    className: 'cust-range', type: 'range', min: '20', max: '100',
                    value: String(Math.round((module.opacity || 0.72) * 100)),
                    onChange: function (event) { patchModule(def.id, { opacity: Number(event.target.value) / 100 }); },
                  }),
                ),
              ) : null,
            );
          }),
        ),

        h('div', { className: 'cust-foot' },
          h('button', { className: 'cust-btn', onClick: onReset }, '恢复默认'),
          h('button', { className: 'hud-btn', style: { marginLeft: 'auto' }, onClick: onBack }, '返回皮肤库'),
        ),
      );
    }

    function PrivacyModal(props) {
      var detailsTuple = useState(false);
      var details = detailsTuple[0];
      var setDetails = detailsTuple[1];
      var granted = props.consent === 'granted';
      var prompt = props.consent === null;
      return h('div', { className: 'consent-mask', onClick: props.onClose },
        h('div', { className: 'consent-card', onClick: function (event) { event.stopPropagation(); } },
          h('div', { className: 'consent-title' }, prompt ? '开启阅读偏好记录？' : '阅读偏好记录'),
          h('div', { className: 'consent-note' }, '为了把话题推荐调得更适合你，插件可以在本机记录你点开话题后的停留时长。'),
          h('ul', { className: 'consent-list' },
            h('li', null, '只存在本机 localStorage，不上传、不出售、不公开；'),
            h('li', null, '只记录话题标签与估算停留时长，不记录 URL、页面内容、账号信息；'),
            h('li', null, '不开也能正常使用全部功能；可随时关闭并清除；'),
            h('li', null, '没有服务器校准，切窗口/挂机会影响估算，仅作软信号。'),
          ),
          h('button', { className: 'consent-more', onClick: function () { setDetails(!details); } }, details ? '收起完整说明' : '查看完整说明'),
          details ? h('div', { className: 'consent-detail' },
            '为什么提示：阅读偏好属于个人数据，插件选择先询问再记录。记录内容是“话题标签 + 点开后的停留时长”，用于在本地调整推荐顺序；不开启不影响任何功能。数据仅保存在当前浏览器 localStorage，插件没有服务器，不会上传、出售或公开。你可以随时关闭记录，并一键清除已有记录。停留时长由窗口焦点/可见性估算，可能因切窗口、挂机、手改本地存储而不准确。'
          ) : null,
          h('div', { className: 'consent-actions' },
            prompt
              ? h('button', { className: 'hud-btn', onClick: props.onEnable }, '开启记录')
              : h('button', { className: 'hud-btn', onClick: granted ? props.onDisable : props.onEnable }, granted ? '关闭记录' : '开启记录'),
            prompt ? h('button', { className: 'hud-btn', onClick: props.onDecline }, '暂不开启') : null,
            h('button', { className: 'hud-btn', onClick: props.onClear }, '清除本地记录'),
            h('button', { className: 'hud-btn', onClick: props.onClose }, '关闭'),
          ),
        ),
      );
    }

    function Hud(props) {
      var status = props.status;
      var heat = props.heat;
      var skin = props.skin;
      var onSkin = props.onSkin;
      var onClose = props.onClose;
      var onRefresh = props.onRefresh;
      var custom = props.custom;
      var onCustomChange = props.onCustomChange;
      var store = props.store;
      var activePreset = props.activePreset;
      var onSelectPreset = props.onSelectPreset;
      var onCreatePreset = props.onCreatePreset;
      var onDuplicatePreset = props.onDuplicatePreset;
      var onDeletePreset = props.onDeletePreset;
      var onRenamePreset = props.onRenamePreset;
      var onExportPresets = props.onExportPresets;
      var onImportPresets = props.onImportPresets;
      var ai = props.ai;
      var plugins = props.plugins;
      var consentTuple = useState(getConsent());
      var consent = consentTuple[0];
      var setConsentState = consentTuple[1];
      var privacyTuple = useState(getConsent() === null);
      var privacyOpen = privacyTuple[0];
      var setPrivacyOpen = privacyTuple[1];
      var privacyTickTuple = useState(0);
      var bumpPrivacyTick = privacyTickTuple[1];
      var drawerTuple = useState(false);
      var drawer = drawerTuple[0];
      var setDrawer = drawerTuple[1];
      var drawerModeTuple = useState('list');
      var drawerMode = drawerModeTuple[0];
      var setDrawerMode = drawerModeTuple[1];
      var kpiStyle = panelStyle(custom, skin, 'kpi');
      var statusStyle = panelStyle(custom, skin, 'status');
      var trendStyle = panelStyle(custom, skin, 'trend');
      var heatStyle = panelStyle(custom, skin, 'heat');
      var topicsStyle = panelStyle(custom, skin, 'topics');
      var feedStyle = panelStyle(custom, skin, 'feed');
      var hudStyle = skin === 'custom' ? Object.assign({}, customVars(custom), hudBackground(custom)) : undefined;
      var rangeTuple = useState('24h');
      var range = rangeTuple[0];
      var setRange = rangeTuple[1];
      var feedTabTuple = useState(function () {
        try {
          var saved = localStorage.getItem('dsh.status.feedTab');
          return saved === 'hn' || saved === 'plugins' ? saved : 'all';
        } catch (error) { return 'all'; }
      });
      var feedTab = feedTabTuple[0];
      var setFeedTab = feedTabTuple[1];
      var pluginState = plugins ? plugins.state : { data: null, error: null, loading: false, stale: false, fetchedAt: 0 };
      var hnFeed = heat.state.data
        ? (heat.state.data.hnFeed || heat.state.data.feed.filter(function (item) { return item.sourceId === 'hn' || item.source === 'Hacker News'; }))
        : [];
      useEffect(function () {
        if (feedTab === 'plugins' && plugins) plugins.load(false);
      }, [feedTab]);
      var selectFeedTab = useCallback(function (tab) {
        setFeedTab(tab);
        try { localStorage.setItem('dsh.status.feedTab', tab); } catch (error) {}
        if (tab === 'plugins' && plugins) plugins.load(false);
      }, [plugins]);

      useEffect(function () {
        function onKey(event) {
          var target = event.target;
          if (target && typeof target.closest === 'function' && target.closest('input, textarea, select, [contenteditable=""], [contenteditable="true"]')) return;
          if (event.key === 'Escape') {
            if (drawer) setDrawer(false);
            else onClose();
            return;
          }
          if (drawer && (event.key === '1' || event.key === '2' || event.key === '3')) {
            var index = Number(event.key) - 1;
            if (SKINS[index]) onSkin(SKINS[index].id);
          }
        }
        document.addEventListener('keydown', onKey, true);
        var previous = document.body.style.overflow;
        document.body.style.overflow = 'hidden';
        return function () {
          document.removeEventListener('keydown', onKey, true);
          document.body.style.overflow = previous;
        };
      }, [drawer, onClose, onSkin]);

      var s = status.state.data;
      var q = heat.state.data;
      var heatError = !q && heat.state.error ? String(heat.state.error) : '';
      var staleStatus = Boolean(s && s.stale);
      var staleHeat = Boolean(q && (q.stale || q.partial));
      var stale = staleStatus || staleHeat;
      var overall = s ? s.overall : 'unknown';
      var components = [];
      if (s) {
        (s.items || []).forEach(function (item) {
          if (item.type === 'section') components.push.apply(components, item.section.components);
          else components.push(item.component);
        });
      }
      var total = components.length;
      var operational = components.filter(function (item) { return item.status === 'operational'; }).length;
      var uptimeSum = 0;
      var uptimeCount = 0;
      components.forEach(function (item) {
        var value = Number(item.uptime);
        if (Number.isFinite(value)) { uptimeSum += value; uptimeCount += 1; }
      });
      var avgUptime = uptimeCount ? uptimeSum / uptimeCount : 0;
      var heatScore = q ? q.heat.score : 0;
      var topics = q ? q.topics : [];
      var feed = q ? q.feed : [];
      var sentiment = q ? q.sentiment : { positive: 0, neutral: 100, negative: 0 };
      var sentimentTone = !q ? undefined : (sentiment.negative > sentiment.positive ? 'bad' : sentiment.positive >= 25 ? 'ok' : 'warn');
      var trend = q ? (range === '7d' ? q.daily : q.hourly) : [];
      var labels = trend.map(function (point) {
        return range === '7d' ? fmtDate(point.at) : fmtClock(point.at).slice(0, 5);
      });
      var heatTone = heatScore >= 72 ? 'bad' : heatScore >= 48 ? 'warn' : 'ok';
      var aiState = ai ? ai.state : { data: null, error: null, loading: false };
      var aiData = aiState.data;
      var aiLoading = aiState.loading;
      var aiError = aiState.error;
      var need = Math.max(0, 10 - topics.length);
      var aiItems = ((aiData && aiData.items) || []).slice(0, need);
      var usedUrls = new Set();
      var usedTitles = new Set();
      topics.forEach(function (topic) { if (topic.sample && topic.sample.url) usedUrls.add(topic.sample.url); });
      aiItems.forEach(function (item) { usedUrls.add(item.url); usedTitles.add(String(item.title || '').toLowerCase()); });
      var fillItems = [];
      if (aiItems.length < need && q && q.feed) {
        var nowMs = Date.now();
        var DAY_MS = 86_400_000;
        fillItems = q.feed.filter(function (item) {
          if (!item.at || !item.url || item.sourceId === 'github' || item.source === 'GitHub') return false;
          var age = nowMs - item.at;
          if (age < -300000 || age > 7 * DAY_MS) return false;
          if (usedUrls.has(item.url) || usedTitles.has(String(item.title || '').toLowerCase())) return false;
          return true;
        }).map(function (item) {
          var bucket = item.at > nowMs - DAY_MS ? 0 : item.at > nowMs - 3 * DAY_MS ? 1 : 2;
          return { item: item, bucket: bucket };
        }).sort(function (a, b) {
          return a.bucket - b.bucket || (b.item.weight || 0) - (a.item.weight || 0) || b.item.at - a.item.at;
        }).slice(0, need - aiItems.length).map(function (row) {
          var item = row.item;
          return { id: 'fill-' + item.id, title: item.title, url: item.url, snippet: item.source ? sourceShort(item.source) : '', domain: domainOf(item.url), at: item.at, bucket: row.bucket, source: item.source, fill: true };
        });
      }
      var displayItems = aiItems.concat(fillItems);
      var prefProfile = getConsent() === 'granted' ? readPreferenceProfile() : [];
      displayItems = rankByPreference(displayItems, prefProfile);
      var prefActive = prefProfile.length > 0 && getConsent() === 'granted';

      function renderFeedRow(item) {
        return h('a', { key: item.id, className: 'feed-row', href: item.url, target: '_blank', rel: 'noreferrer', title: item.title },
          h('span', { className: 'feed-badge' }, sourceShort(item.source)),
          h('div', { className: 'feed-main' },
            h('div', { className: 'feed-title' }, item.title),
            h('div', { className: 'feed-meta' },
              h('span', null, timeAgo(item.at)),
              item.engagement > 0 ? h('span', null, '互动 ' + item.engagement) : null,
              item.sources && item.sources.length > 1 ? h('span', null, item.sources.length + ' 源') : null,
            ),
          ),
        );
      }

      function renderPluginRow(item) {
        return h('a', { key: item.id, className: 'feed-row feed-plugin', href: item.url, target: '_blank', rel: 'noreferrer', title: item.title },
          h('span', { className: 'feed-badge' }, 'GH'),
          h('div', { className: 'feed-main' },
            h('div', { className: 'feed-title' }, item.title),
            item.summary ? h('div', { className: 'feed-desc', title: item.summary }, item.summary) : null,
            h('div', { className: 'feed-meta' },
              h('span', null, '更新 ' + timeAgo(item.at)),
              item.stars > 0 ? h('span', null, '★ ' + item.stars) : null,
              item.language ? h('span', null, item.language) : null,
            ),
          ),
        );
      }

      function renderPluginBody() {
        if (pluginState.loading && !pluginState.data) {
          return Array.from({ length: 5 }).map(function (_, index) {
            return h('div', { key: 'plugin-skel-' + index, className: 'feed-row' },
              h('span', { className: 'feed-badge' }, 'GH'),
              h('div', { className: 'feed-main' },
                h('div', { className: 'hud-skel', style: { width: index % 2 ? '58%' : '72%', margin: '4px 0' } }),
              ),
            );
          });
        }
        if (pluginState.error && !pluginState.data) {
          return h('div', { className: 'hud-empty hud-err' },
            'GitHub 暂不可用',
            h('span', { className: 'dss-link', style: { marginLeft: '8px' }, onClick: function () { plugins.load(true); } }, '重试'),
          );
        }
        var data = pluginState.data;
        if (!data || !data.items || !data.items.length) return h('div', { className: 'hud-empty' }, 'GitHub 暂无 DSH 插件更新');
        return h('div', null,
          pluginState.stale ? h('div', { className: 'feed-note' }, 'GitHub 暂不可用 · 显示上次缓存') : null,
          data.items.map(renderPluginRow),
        );
      }

      return h('div', { className: 'hud-backdrop', onMouseDown: function (event) { if (event.target === event.currentTarget) onClose(); } },
        h('div', { className: 'hud', 'data-skin': skin, style: hudStyle, role: 'dialog', 'aria-modal': 'true', 'aria-label': 'DeepSeek 运行与热度' },
          h('div', { className: 'hud-top' },
            h('div', { className: 'hud-brand' }, h('b', null, 'DEEPSEEK'), h('span', null, '运行与热度 · RUNTIME / HEAT')),
            h('div', { className: 'hud-live' + (stale ? ' is-stale' : '') }, h('i', null), stale ? '缓存快照 · 抓取失败' : 'LIVE · 点开即刷新'),
            h('div', { className: 'hud-actions' },
              h('button', {
                className: 'hud-btn', 'data-on': drawer ? 'true' : 'false',
                onClick: function () { var next = !drawer; setDrawer(next); if (next) setDrawerMode('list'); },
              }, '◐ 皮肤'),
              h('button', { className: 'hud-btn', onClick: function () { setPrivacyOpen(true); } }, '隐私'),
              h('button', {
                className: 'hud-btn',
                onClick: function () { onRefresh(); if (feedTab === 'plugins' && plugins) plugins.load(true); },
                disabled: status.state.fetching || heat.state.fetching,
              }, (status.state.fetching || heat.state.fetching) ? '刷新中…' : '刷新'),
              h('button', { className: 'hud-btn hud-close', onClick: onClose, 'aria-label': '关闭' }, '×'),
            ),
          ),
          h('div', { className: 'hud-kpis' },
            h('div', { className: 'kpi', 'data-mod': 'kpi', style: kpiStyle, 'data-tone': overall === 'operational' ? 'ok' : overall === 'degraded' ? 'warn' : overall === 'maintenance' ? undefined : overall === 'unknown' ? undefined : 'bad' },
              h('div', { className: 'kpi-label' }, '运行状态'),
              h('div', { className: 'kpi-value' }, s ? statusLabel(overall) : '—'),
              h('div', { className: 'kpi-sub' }, s ? STATUS_LONG[overall] : '读取官方状态…'),
            ),
            h('div', { className: 'kpi', 'data-mod': 'kpi', style: kpiStyle },
              h('div', { className: 'kpi-label' }, '90 天可用率'),
              h('div', { className: 'kpi-value' }, s ? pct(avgUptime) : '—', h('small', null, '%')),
              h('div', { className: 'kpi-sub' }, s ? '官方口径 · ' + total + ' 个组件' : '—'),
            ),
            h('div', { className: 'kpi', 'data-mod': 'kpi', style: kpiStyle, 'data-tone': s ? (operational === total ? 'ok' : 'warn') : undefined },
              h('div', { className: 'kpi-label' }, '组件在线'),
              h('div', { className: 'kpi-value' }, s ? operational + '/' + total : '—'),
              h('div', { className: 'kpi-sub' }, s ? (operational === total ? '全部正常' : '有组件异常') : '—'),
            ),
            h('div', { className: 'kpi', 'data-mod': 'kpi', style: kpiStyle, 'data-tone': heatTone },
              h('div', { className: 'kpi-label' }, '热度指数'),
              h('div', { className: 'kpi-value' }, q ? heatScore : '—', h('small', null, q ? q.heat.label : '')),
              h('div', { className: 'kpi-sub' }, q ? '2h 速度 ' + q.heat.velocity.toFixed(1) + '×' : heatError ? '接口未加载 · 重启 DSH' : '聚合公开提及…'),
            ),
            h('div', { className: 'kpi', 'data-mod': 'kpi', style: kpiStyle },
              h('div', { className: 'kpi-label' }, '24h 声量'),
              h('div', { className: 'kpi-value' }, q ? q.counts.items : '—', h('small', null, '条')),
              h('div', { className: 'kpi-sub' }, q ? '7 天共 ' + q.counts.total + ' 条 · ' + q.counts.sources + ' 个源' : '—'),
            ),
            h('div', { className: 'kpi', 'data-mod': 'kpi', style: kpiStyle, 'data-tone': sentimentTone },
              h('div', { className: 'kpi-label' }, '情绪估算'),
              h('div', { className: 'kpi-value' }, q ? sentiment.positive + '%' : '—', h('small', null, '正向')),
              h('div', { className: 'kpi-sub' }, q ? '负向 ' + sentiment.negative + '% · 中性 ' + sentiment.neutral + '%' : '词表估算'),
            ),
          ),
          h('div', { className: 'hud-body' },
            h('div', { className: 'hud-main' },
              h('div', { className: 'p', 'data-mod': 'status', style: statusStyle },
                h('div', { className: 'p-head' }, h('b', null, '组件矩阵'), h('span', null, 'COMPONENTS / 90D')),
                h('div', { className: 'p-body' },
                  s ? components.map(function (item) {
                    return h('div', { key: item.id, className: 'comp-row' },
                      h('span', { className: 'dss-dot', style: { '--dss-color': colorOf(item.status) } }),
                      h('div', { style: { minWidth: 0 } },
                        h('div', { className: 'comp-name', title: item.name + ' · ' + statusLabel(item.status) }, item.title),
                      ),
                      h('span', { className: 'comp-pct' }, pctText(item.uptime)),
                      h('div', { className: 'comp-bars' },
                        (item.bars || []).map(function (rank, index) {
                          return h('i', {
                            key: index,
                            style: { background: barColor(rank) },
                            title: dayLabel(s.barStart, index) + ' · ' + (rank === 0 ? '正常' : rank === 1 ? '维护' : rank === 2 ? '性能下降' : rank === 3 ? '部分中断' : '服务中断'),
                          });
                        }),
                      ),
                    );
                  }) : h('div', null, h('div', { className: 'hud-skel', style: { width: '80%' } }), h('div', { className: 'hud-skel', style: { width: '65%' } }), h('div', { className: 'hud-skel', style: { width: '74%' } })),
                  s ? h('div', { className: 'comp-note' }, '每格 = 1 天 · 最近 90 天 · 颜色为该日最差状态') : null,
                  s && s.incidents && s.incidents.length ? h('a', {
                    className: 'comp-note', href: s.incidents[0].url, target: '_blank', rel: 'noreferrer',
                    style: { display: 'block', marginTop: '3px', color: 'inherit', textDecoration: 'none' },
                    title: s.incidents[0].title,
                  }, '最近事故 · ' + fmtDate(s.incidents[0].startAt) + ' · ' + String(s.incidents[0].title).slice(0, 18)) : null,
                ),
              ),
              h('div', { className: 'p', 'data-mod': 'trend', style: trendStyle },
                h('div', { className: 'p-head' },
                  h('b', null, '声量趋势'),
                  h('div', { className: 'seg' },
                    h('button', { 'data-on': range === '24h' ? 'true' : 'false', onClick: function () { setRange('24h'); } }, '24 时'),
                    h('button', { 'data-on': range === '7d' ? 'true' : 'false', onClick: function () { setRange('7d'); } }, '7 天'),
                  ),
                ),
                h('div', { className: 'chart-wrap' },
                  q ? h(AreaChart, { data: trend, labels: labels }) : heatError ? h('div', { className: 'hud-empty hud-err' }, heatErrorText(heatError)) : h('div', { className: 'hud-empty' }, '聚合中…'),
                ),
                h('div', { className: 'chart-legend' },
                  h('span', null, '公开提及 · 去重后'),
                  h('span', { style: { marginLeft: 'auto', color: 'var(--h-accent)' } }, q ? '峰值 ' + Math.max.apply(null, trend.map(function (point) { return point.count; }).concat([0])) + ' 条' : ''),
                ),
              ),
              h('div', { className: 'p', 'data-mod': 'heat', style: heatStyle },
                h('div', { className: 'p-head' }, h('b', null, '热度'), h('span', null, 'HEAT')),
                h('div', { style: { opacity: heatError ? 0.35 : 1, display: 'flex', justifyContent: 'center' } }, h(Ring, { value: heatScore, label: q ? q.heat.label : '—' })),
                heatError ? h('div', { className: 'hud-empty hud-err', style: { padding: '4px 12px' } }, '接口未加载') : null,
                h('div', { style: { padding: '0 12px' } },
                  h('div', { className: 'sent' },
                    h('i', { style: { width: sentiment.positive + '%', background: 'var(--h-ok)' } }),
                    h('i', { style: { width: sentiment.neutral + '%', background: 'color-mix(in srgb,var(--h-dim) 45%,transparent)' } }),
                    h('i', { style: { width: sentiment.negative + '%', background: 'var(--h-bad)' } }),
                  ),
                  h('div', { className: 'sent-legend' },
                    h('span', null, '正 ' + sentiment.positive + '%'),
                    h('span', null, '中 ' + sentiment.neutral + '%'),
                    h('span', null, '负 ' + sentiment.negative + '%'),
                  ),
                ),
                h('div', { className: 'src-chips' },
                  (q ? q.sources : []).map(function (source) {
                    return h('span', { key: source.id, className: 'chip', 'data-off': source.ok ? undefined : 'true' },
                      h('i', null), sourceShort(source.name) + ' ' + source.count,
                    );
                  }),
                ),
              ),
            ),
            h('div', { className: 'hud-bottom' },
              h('div', { className: 'p', 'data-mod': 'topics', style: topicsStyle },
                h('div', { className: 'p-head' },
                  h('b', null, '话题推荐'),
                  h('span', null, q ? '聚合于 ' + fmtClock(q.fetchedAt) + ' · 7 天时效 · 点开即刷新' + (prefActive ? ' · 本地偏好' : '') : 'TOPICS'),
                ),
                h('div', { className: 'p-body' },
                  heat.state.loading && !q ? h('div', null, h('div', { className: 'hud-skel', style: { width: '45%' } }), h('div', { className: 'hud-skel', style: { width: '70%' } }), h('div', { className: 'hud-skel', style: { width: '55%' } })) : null,
                  heatError ? h('div', { className: 'hud-empty hud-err' }, heatErrorText(heatError)) : null,
                  q && topics.length === 0 ? h('div', { className: 'hud-empty' }, '暂时没有可推荐的话题') : null,
                  topics.map(function (topic, index) {
                    var sampleUrl = topic.sample && topic.sample.url ? topic.sample.url : '';
                    return h(sampleUrl ? 'a' : 'div', {
                      key: 'agg-' + topic.label,
                      className: 'topic',
                      href: sampleUrl || undefined,
                      target: sampleUrl ? '_blank' : undefined,
                      rel: sampleUrl ? 'noreferrer' : undefined,
                      style: { color: 'inherit', textDecoration: 'none' },
                      onClick: function () { if (sampleUrl) { trackRead(topic.label); rememberInterest(topic.label); } },
                    },
                      h('span', { className: 'topic-rank' }, String(index + 1).padStart(2, '0')),
                      h('div', { style: { minWidth: 0 } },
                        h('div', { className: 'topic-label', title: topic.label }, h('span', { className: 'topic-star' }, '★'), topic.label),
                        h('div', { className: 'topic-sample', title: topic.sample ? topic.sample.title : '' }, topic.sample ? topic.sample.title : '来自公开提及'),
                      ),
                      h('div', { className: 'topic-right' },
                        h('span', { className: 'topic-count' }, '×' + topic.count),
                        topic.sources.slice(0, 2).map(function (name) {
                          return h('span', { key: name, className: 'chip', style: { height: '16px', padding: '0 4px' } }, sourceShort(name));
                        }),
                      ),
                    );
                  }),
                  displayItems.map(function (item, index) {
                    return h('a', {
                      key: item.id, className: 'topic topic-ai',
                      href: item.url, target: '_blank', rel: 'noreferrer',
                      style: { color: 'inherit', textDecoration: 'none' },
                      onClick: function () { trackRead(item.title); rememberInterest(item.title); },
                    },
                      h('span', { className: 'topic-rank' }, String(topics.length + index + 1).padStart(2, '0')),
                      h('div', { style: { minWidth: 0 } },
                        h('div', { className: 'topic-label', title: item.title }, item.title),
                        h('div', { className: 'topic-sample', title: item.title }, item.snippet || ''),
                      ),
                      h('div', { className: 'topic-right' },
                        h('span', { className: 'topic-time', title: new Date(item.at).toLocaleString() }, timeAgo(item.at)),
                        item.at > Date.now() - 86400000 ? h('span', { className: 'topic-new' }, '新') : null,
                        h('span', { className: 'chip', style: { height: '16px', padding: '0 4px' } }, (item.domain || '').slice(0, 14)),
                      ),
                    );
                  }),
                  aiLoading ? Array.from({ length: Math.max(0, need - displayItems.length) }).map(function (_, index) {
                    return h('div', { key: 'ai-skel-' + index, className: 'topic topic-ai' },
                      h('span', { className: 'topic-rank' }, '··'),
                      h('div', { style: { minWidth: 0 } },
                        h('div', { className: 'hud-skel', style: { width: index % 2 ? '52%' : '66%', margin: '5px 0' } }),
                      ),
                      h('div', null),
                    );
                  }) : null,
                  !aiLoading && displayItems.length < need ? h('div', { className: 'topic-note', style: { textAlign: 'left', padding: '4px 2px' } }, '仅 7 天内 · 今日新话题不足') : null,
                  aiState.limited && aiData ? h('div', { className: 'topic-note', style: { textAlign: 'left', padding: '4px 2px' } }, '搜索限流 · 暂显示上次结果') : null,
                  aiError && !aiData ? h('div', { className: 'topic-note', style: { textAlign: 'left', padding: '4px 2px' }, title: aiError },
                    '推荐补充失败',
                    h('span', { className: 'dss-link', style: { marginLeft: '8px' }, onClick: function () { if (ai) ai.load(Date.now()); } }, '重试'),
                  ) : null,
                ),
              ),
              h('div', { className: 'p', 'data-mod': 'feed', style: feedStyle },
                h('div', { className: 'p-head feed-head' },
                  h('b', null, '实时信息流'),
                  h('div', { className: 'seg feed-tabs' },
                    [['all', '全部'], ['hn', 'HN'], ['plugins', 'GitHub']].map(function (tab) {
                      return h('button', {
                        key: tab[0], 'data-on': feedTab === tab[0] ? 'true' : 'false',
                        title: tab[0] === 'plugins' ? 'DSH 插件更新' : tab[0] === 'hn' ? 'Hacker News 最新' : '全部来源',
                        onClick: function () { selectFeedTab(tab[0]); },
                      }, tab[1]);
                    }),
                  ),
                  feedTab === 'plugins'
                    ? h('a', { className: 'hud-link', href: 'https://github.com/topics/dsh-plugin', target: '_blank', rel: 'noreferrer', title: 'GitHub DSH 插件主题' }, 'GitHub →')
                    : feedTab === 'hn'
                      ? h('a', { className: 'hud-link', href: 'https://hn.algolia.com/?q=DeepSeek', target: '_blank', rel: 'noreferrer', title: '在 Hacker News 搜索 DeepSeek' }, 'HN →')
                      : h('span', { className: 'feed-count' }, q ? q.sources.length + ' 源' : ''),
                ),
                h('div', { className: 'p-body' },
                  feedTab === 'plugins'
                    ? renderPluginBody()
                    : feedTab === 'hn'
                      ? (q
                        ? (hnFeed.length ? hnFeed.map(renderFeedRow) : h('div', { className: 'hud-empty' }, 'HN 暂无新动态'))
                        : heatError ? h('div', { className: 'hud-empty hud-err' }, heatErrorText(heatError)) : h('div', { className: 'hud-empty' }, '聚合中…'))
                      : (q
                        ? feed.map(renderFeedRow)
                        : heatError ? h('div', { className: 'hud-empty hud-err' }, heatErrorText(heatError)) : h('div', { className: 'hud-empty' }, '聚合中…')),
                ),
              ),
            ),
          ),
          h('div', { className: 'hud-foot' },
            h('span', null, '官方状态 status.deepseek.com'),
            h('span', { className: 'hud-version' }, 'v' + VERSION),
            h('span', null, '·'),
            h('span', null, '公开提及 HN / GitHub / 全球与中国媒体 RSS'),
            h('span', { className: 'spacer' }),
            q ? (function () {
              var live = q.sources.filter(function (source) { return source.ok && source.count > 0; });
              var failed = q.sources.filter(function (source) { return !source.ok; });
              return h('span', {
                title: failed.length
                  ? '失败：' + failed.map(function (source) { return source.name; }).join('、')
                  : '全部源正常',
              }, h('i', { 'data-off': failed.length && !live.length ? 'true' : undefined }), '源 ' + live.length + '/' + q.sources.length);
            })() : null,
            h('span', { style: { marginLeft: '10px' } }, '皮肤 ' + (skin === 'custom' ? (activePreset ? activePreset.name : '自定义') : ((SKINS.filter(function (item) { return item.id === skin; })[0] || {}).name || skin))),
            h('span', { className: 'dss-link', style: { marginLeft: '10px' }, onClick: function () { setPrivacyOpen(true); } }, '隐私'),
          ),
          privacyOpen ? h(PrivacyModal, {
            consent: consent,
            onEnable: function () { setConsent('granted'); setConsentState('granted'); setPrivacyOpen(false); },
            onDisable: function () { setConsent('denied'); setConsentState('denied'); },
            onDecline: function () { setConsent('denied'); setConsentState('denied'); setPrivacyOpen(false); },
            onClose: function () { if (getConsent() === null) { setConsent('denied'); setConsentState('denied'); } setPrivacyOpen(false); },
            onClear: function () {
              if (!window.confirm('清除本机保存的阅读偏好与停留记录？')) return;
              clearPrivacyData();
              bumpPrivacyTick(function (value) { return value + 1; });
            },
          }) : null,
          drawer
            ? drawerMode === 'custom'
              ? h(CustomDrawer, {
                  custom: custom,
                  preset: activePreset,
                  store: store,
                  onChange: onCustomChange,
                  onRename: onRenamePreset,
                  onSelect: onSelectPreset,
                  onCreate: onCreatePreset,
                  onDuplicate: onDuplicatePreset,
                  onDelete: onDeletePreset,
                  onExport: onExportPresets,
                  onImport: onImportPresets,
                  onBack: function () { setDrawerMode('list'); },
                  onReset: function () {
                    if (window.confirm('恢复当前方案的默认外观？颜色和模块背景都会重置，且不可撤销。')) onCustomChange(mergeCustom(null));
                  },
                })
              : h(SkinDrawer, {
                  skin: skin,
                  store: store,
                  onPick: onSkin,
                  onSelectPreset: onSelectPreset,
                  onCreatePreset: onCreatePreset,
                  onEditCustom: function () { setDrawerMode('custom'); },
                  onClose: function () { setDrawer(false); },
                })
            : null,
        ),
      );
    }

    function HoverCard(props) {
      var status = props.status;
      var heat = props.heat;
      var onOpen = props.onOpen;
      var skin = props.skin;
      var custom = props.custom;
      var s = status.data;
      var q = heat.data;
      var overall = s ? s.overall : 'unknown';
      return h('div', { className: 'dss-pop', style: hoverVars(skin, custom), role: 'dialog', 'aria-label': '状态摘要' },
        h('div', { className: 'dss-pop-head' },
          h('span', null, 'DeepSeek 运行与热度'),
          h('span', { style: { display: 'inline-flex', alignItems: 'center', gap: '6px', color: 'var(--h-dim, var(--dsw-alias-label-secondary,#666))', fontWeight: 500 } },
            h(Dot, { color: colorOf(overall), pulse: SEVERITY[overall] > 0 }), s ? statusLabel(overall) : '读取中',
          ),
        ),
        h('div', { className: 'dss-pop-sub' },
          s ? s.counts.operational + '/' + s.counts.components + ' 个组件正常 · 更新于 ' + fmtClock(s.fetchedAt) + (s.stale ? ' · 缓存快照' : '') : '读取官方状态…',
        ),
        q ? h('div', { className: 'dss-heat' },
          h('span', { className: 'dss-heat-label' }, '热度'),
          h('span', { className: 'dss-heat-score' }, q.heat.score),
          h('span', { className: 'dss-heat-divider' }),
          h('span', { className: 'dss-heat-topic' }, q.topics.length ? '#' + q.topics[0].label : '暂无聚合话题'),
          h('span', { className: 'dss-heat-meta' }, q.counts.items + ' 条 / 24h'),
        ) : null,
        s ? h('div', { style: { display: 'flex', flexDirection: 'column', gap: '2px' } },
          (function () {
            var comps = [];
            (s.items || []).forEach(function (item) {
              if (item.type === 'section' && item.section && item.section.components) comps.push.apply(comps, item.section.components);
              else if (item.component) comps.push(item.component);
            });
            comps.sort(function (a, b) { return (SEVERITY[b.status] || 0) - (SEVERITY[a.status] || 0); });
            return comps.slice(0, 5).map(function (entry) {
              return h('div', { key: entry.id, style: { display: 'flex', alignItems: 'center', gap: '8px', fontSize: '12px', padding: '3px 2px' } },
                h(Dot, { color: colorOf(entry.status) }),
                h('span', { style: { flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' } }, entry.title),
                h('span', { style: { fontSize: '10px', color: 'var(--dsw-alias-label-tertiary,#888)', fontVariantNumeric: 'tabular-nums' } }, pctText(entry.uptime)),
              );
            });
          })(),
        ) : null,
        h('div', { className: 'dss-pop-foot' },
          h('span', null, q ? q.sources.filter(function (source) { return source.ok && source.count > 0; }).length + ' 个源有内容' : '聚合公开提及'),
          h('span', { className: 'dss-link', onClick: onOpen }, '打开仪表盘 →'),
        ),
      );
    }

    function App() {
      var status = useApi('/summary', true);
      var heat = useApi('/heat', false);
      var ai = useAiTopics();
      var plugins = useGithubPlugins();
      var storeTuple = useState(loadCustomStore);
      var store = storeTuple[0];
      var setStore = storeTuple[1];
      var activePreset = activePresetOf(store);
      var custom = activePreset ? activePreset.config : mergeCustom(null);
      var saveTimer = useRef(0);
      var updateCustom = useCallback(function (next) {
        setStore(function (prev) {
          var presets = prev.presets.map(function (preset) {
            return preset.id === prev.activeId
              ? Object.assign({}, preset, { config: next, updatedAt: Date.now() })
              : preset;
          });
          return { activeId: prev.activeId, presets: presets };
        });
      }, []);
      useEffect(function () {
        clearTimeout(saveTimer.current);
        saveTimer.current = setTimeout(function () { saveCustomStore(store); }, 250);
        return function () { clearTimeout(saveTimer.current); };
      }, [store]);
      var openTuple = useState(false);
      var open = openTuple[0];
      var setOpen = openTuple[1];
      var hoverTuple = useState(false);
      var hover = hoverTuple[0];
      var setHover = hoverTuple[1];
      var skinTuple = useState(function () {
        try { return localStorage.getItem(SKIN_KEY) || 'abyss'; } catch (error) { return 'abyss'; }
      });
      var skin = skinTuple[0];
      var setSkinState = skinTuple[1];
      var timer = useRef(0);

      var applySkin = useCallback(function (id) {
        setSkinState(id);
        try { localStorage.setItem(SKIN_KEY, id); } catch (error) { /* 忽略隐私模式 */ }
      }, []);

      var selectPreset = useCallback(function (id) {
        setStore(function (prev) {
          if (!prev.presets.some(function (preset) { return preset.id === id; })) return prev;
          return { activeId: id, presets: prev.presets };
        });
        applySkin('custom');
      }, [applySkin]);

      var createPreset = useCallback(function (fromCurrent) {
        setStore(function (prev) {
          var active = activePresetOf(prev);
          var source = fromCurrent && active ? JSON.parse(JSON.stringify(active.config)) : mergeCustom(null);
          var preset = {
            id: newPresetId(),
            name: '自定义 ' + (prev.presets.length + 1),
            config: mergeCustom(source),
            updatedAt: Date.now(),
          };
          return { activeId: preset.id, presets: prev.presets.concat([preset]) };
        });
        applySkin('custom');
      }, [applySkin]);

      var duplicatePreset = useCallback(function (id) {
        setStore(function (prev) {
          var source = prev.presets.filter(function (preset) { return preset.id === id; })[0];
          if (!source) return prev;
          var copy = {
            id: newPresetId(),
            name: (source.name + ' 副本').slice(0, 24),
            config: JSON.parse(JSON.stringify(source.config)),
            updatedAt: Date.now(),
          };
          return { activeId: copy.id, presets: prev.presets.concat([copy]) };
        });
        applySkin('custom');
      }, [applySkin]);

      var deletePreset = useCallback(function (id) {
        var target = store.presets.filter(function (preset) { return preset.id === id; })[0];
        if (!target) return;
        if (store.presets.length <= 1) { window.alert('至少保留一个自定义方案'); return; }
        if (!window.confirm('删除自定义方案「' + target.name + '」？此操作不可撤销。')) return;
        var left = store.presets.filter(function (preset) { return preset.id !== id; });
        setStore({ activeId: store.activeId === id ? left[0].id : store.activeId, presets: left });
      }, [store]);

      var renamePreset = useCallback(function (id, name) {
        var trimmed = String(name || '').trim().slice(0, 24);
        if (!trimmed) return;
        setStore(function (prev) {
          return {
            activeId: prev.activeId,
            presets: prev.presets.map(function (preset) {
              return preset.id === id ? Object.assign({}, preset, { name: trimmed, updatedAt: Date.now() }) : preset;
            }),
          };
        });
      }, []);

      var exportPresets = useCallback(function () { downloadPresets(store); }, [store]);

      var importPresets = useCallback(function (file) {
        importPresetFile(file, function (list) {
          setStore(function (prev) {
            var additions = list.map(function (preset) {
              return Object.assign({}, preset, { id: newPresetId(), name: preset.name.slice(0, 24), updatedAt: Date.now() });
            });
            return { activeId: additions[0].id, presets: prev.presets.concat(additions) };
          });
          applySkin('custom');
        });
      }, [applySkin]);

      var show = useCallback(function () {
        clearTimeout(timer.current);
        timer.current = setTimeout(function () {
          setHover(true);
          // 悬停也要能看到热度：首次悬停时顺手拉一次（命中宿主缓存，通常几十毫秒）。
          if (!heat.state.data && !heat.state.fetching) heat.load(false);
        }, 150);
      }, [heat]);
      var hide = useCallback(function () {
        clearTimeout(timer.current);
        timer.current = setTimeout(function () { setHover(false); }, 180);
      }, []);
      useEffect(function () { return function () { clearTimeout(timer.current); }; }, []);

      var openHud = useCallback(function () {
        setOpen(true);
        setHover(false);
        heat.load(true, true);
        status.load(false);
        ai.load(Date.now());
      }, [heat, status, ai]);

      var closeHud = useCallback(function () { setOpen(false); }, []);

      var refresh = useCallback(function () {
        status.load(true, true);
        heat.load(true, true);
        ai.load(Date.now(), true);
      }, [status, heat, ai]);

      var overall = status.state.data ? status.state.data.overall : 'unknown';
      var label = status.state.data ? statusLabel(overall) : status.state.error ? '状态未知' : '状态…';

      return h('div', { className: 'dss-root', onMouseEnter: show, onMouseLeave: hide },
        h('button', {
          className: 'dss-trigger', type: 'button', 'aria-haspopup': 'dialog',
          'aria-expanded': open ? 'true' : 'false', 'aria-label': 'DeepSeek 运行与热度',
          title: 'DeepSeek 运行与热度', onClick: openHud,
        },
          h(Dot, { color: status.state.data ? (overall === 'operational' ? 'var(--dsw-alias-state-success-primary,#22a06b)' : overall === 'degraded' ? 'var(--dsw-alias-state-warn-primary,#d97706)' : overall === 'maintenance' ? 'var(--dsw-alias-brand-primary,#4d6bfe)' : 'var(--dsw-alias-state-error-primary,#e5484d)') : 'var(--dsw-alias-state-idle-primary,#8a8f98)', pulse: SEVERITY[overall] > 0 }),
          h('span', { style: { whiteSpace: 'nowrap' } }, label),
        ),
        hover && !open ? h(HoverCard, { status: status.state, heat: heat.state, onOpen: openHud, skin: skin, custom: custom }) : null,
        open ? h(Hud, {
          status: status, heat: heat, skin: skin, onSkin: applySkin,
          custom: custom, onCustomChange: updateCustom, ai: ai, plugins: plugins,
          store: store, activePreset: activePreset,
          onSelectPreset: selectPreset, onCreatePreset: createPreset,
          onDuplicatePreset: duplicatePreset, onDeletePreset: deletePreset,
          onRenamePreset: renamePreset, onExportPresets: exportPresets,
          onImportPresets: importPresets,
          onClose: closeHud, onRefresh: refresh,
        }) : null,
      );
    }

    var module = { exports: {} };
    var name = 'status-dashboard';
    var inject = ['slots'];

    function apply(ctx) {
      ctx.effect(function () { return installStyle(); }, 'dsh-status: styles');
      ctx.slots.inject('shell.overlay', function* () {
        yield ctx.slots.register({ name: 'shell.overlay', id: 'status-dashboard', order: 900 }, function () {
          return h(App, {});
        });
      });
    }

    module.exports = { apply: apply, inject: inject, name: name };
    return module.exports;
  }

  window.__ModuleLoader__.load({
    id: PACKAGE,
    factory: function (require) { return makeModule(require('react')); },
  });
})();
