window.__AI_FEED = {
  ok: true,
  fetchedAt: Date.now(),
  windowHours: 24,
  limit: 30,
  stale: false,
  sources: [
    { id: 'techcrunch', name: 'TechCrunch', ok: true, count: 12 },
    { id: 'verge', name: 'The Verge', ok: true, count: 8 },
    { id: 'wired', name: 'Wired', ok: true, count: 7 },
    { id: 'ithome', name: 'IT之家', ok: true, count: 19 },
    { id: 'qbitai', name: '量子位', ok: true, count: 6 },
    { id: 'deepmind', name: 'DeepMind', ok: false, count: 0, error: 'HTTP 500' }
  ],
  items: [
    { id: 'm1', title: 'Nvidia CEO Jensen Huang resigns amid spy, affair scandals', url: 'https://example.com/m1', summary: '', at: Date.now() - 6 * 60000, source: 'verge', sourceName: 'The Verge', weight: 0.9 },
    { id: 'm2', title: '黄仁勋辞任英伟达 CEO，公司美股盘前跌幅扩大至 10%', url: 'https://example.com/m2', summary: '', at: Date.now() - 12 * 60000, source: 'ithome', sourceName: 'IT之家', weight: 0.8 },
    { id: 'm3', title: 'Anthropic 被曝为 Claude 加入限制：禁止生成宝可梦相关游戏素材', url: 'https://example.com/m3', summary: '', at: Date.now() - 45 * 60000, source: 'ithome', sourceName: 'IT之家', weight: 0.8 },
    { id: 'm4', title: "China's Nvidia Honeypot Isn't Surprising. Jensen Huang Fell for It Anyway", url: 'https://example.com/m4', summary: '', at: Date.now() - 3 * 3600000, source: 'wired', sourceName: 'Wired', weight: 0.9 },
    { id: 'm5', title: 'Anthropic启动IPO路演，估值已缩水6000亿美元', url: 'https://example.com/m5', summary: '', at: Date.now() - 5 * 3600000, source: 'qbitai', sourceName: '量子位', weight: 0.8 },
    { id: 'm6', title: 'OpenAI DevDay 2026：20+ 项发布完整复盘', url: 'https://example.com/m6', summary: '', at: Date.now() - 8 * 3600000, source: 'techcrunch', sourceName: 'TechCrunch', weight: 0.95 },
    { id: 'm7', title: 'Google DeepMind 发布 Gemini 新版本，推理能力大幅提升', url: 'https://example.com/m7', summary: '', at: Date.now() - 11 * 3600000, source: 'deepmind', sourceName: 'DeepMind', weight: 1.0 },
    { id: 'm8', title: 'AI 芯片短缺加剧，数据中心建设被迫延期', url: 'https://example.com/m8', summary: '', at: Date.now() - 14 * 3600000, source: 'techcrunch', sourceName: 'TechCrunch', weight: 0.95 }
  ]
};
