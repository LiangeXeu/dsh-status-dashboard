# 上架清单（0.2.2）

这份文件是给插件市场/仓库发布用的检查表，不参与运行时加载。

## 1. 包元数据

| 字段 | 值 | 状态 |
| --- | --- | --- |
| name | `dsh-status-dashboard` | ✅ |
| version | `0.2.2` | ✅ |
| description | 中文一句话，见 package.json | ✅ |
| icon | `assets/icon.svg`（64×64，346 B） | ✅ |
| license | MIT（`LICENSE`） | ✅ |
| keywords | dsh / deepseek-harness / status / dashboard / heat / theme / skin | ✅ |
| dsh.bundle.patch | `./cordis.patch.yml`，entry id = `dsh-status-dashboard` | ✅ |
| dsh.client | `platform: web`，`inject: []` | ✅ |
| dsh.compatibility | `0.2.1-rc.4: compatible` | ⚠️ 上架前核对当前发布版本 |
| repository / homepage | 未填写 | ⚠️ 需要仓库地址 |
| private | `false` | ✅ |

## 2. 产物与文件

- `lib/index.js`、`lib/status.js`、`lib/heat.js`、`client.js`、`cordis.patch.yml`、`assets/icon.svg`、`README.md`、`LICENSE`、`docs/*.png`；
- `files` 白名单已排除 `dev/`、`test/`、`install.ps1`、`restart-dsh-status.cmd`；
- 无构建步骤（纯 JS），`npm pack` 后可直接被 DSH 加载。

## 3. 截图

| 文件 | 用途 |
| --- | --- |
| `docs/skin-abyss.png` | 默认皮肤 |
| `docs/skin-console.png` | 终端皮肤 |
| `docs/skin-paper.png` | 纸面皮肤 |
| `docs/skin-library.png` | 皮肤库 |
| `docs/custom-editor.png` | 自定义编辑器 |
| `docs/custom-skin.png` | 自定义背景效果 |
| `docs/hover-card.png` | 标题栏悬停卡 |
| `docs/ai-topics.png` | 聚合 + AI 搜索话题 |

## 4. 上架前自检

- [ ] `package.json` 版本与 tag 一致（v0.2.0）；
- [ ] `cordis.patch.yml` 第一行 entry id 与包名一致，且 id 行没有行尾注释；
- [ ] 在干净 profile 中安装并重启，确认插件页显示图标/描述、HUD 正常；
- [ ] `/dsh-status-2417/summary`、`/heat`、`/health` 均 200；
- [ ] 断网/单源失败时 HUD 不崩，错误态可读；
- [ ] 自定义皮肤上传 2MB 图片后可保存、刷新后仍在；
- [ ] `npm test` 全绿，进程正常退出；
- [ ] 断网刷新：HUD 显示「缓存快照」而不是 0 条热度；
- [ ] `GET /ai-topics` 在配置了 DeepSeek 账号/Search API 的环境返回 4–6 条结果，未配置时降级为 502 且 UI 不崩；
- [ ] README 截图路径可访问；
- [ ] 隐私说明：仅出站请求公开源，不收集用户数据，自定义图片只存本机。

## 5. 发布步骤（建议）

1. 建仓库并提交本目录（保留 `dev/` 可选）；
2. `npm pack --dry-run` 检查文件清单；
3. 打 tag `v0.2.0`；
4. 按市场索引要求提交条目（name / versions / icon / description / repository / engines / compatibility）；
5. 用测试 profile 从市场源安装一次，走「安装 → 重启 → 打开 HUD」全流程；
6. 在 README 顶部补市场安装命令与仓库链接。

## 6. 已知风险

- 状态页/新闻源结构变化会打断解析；已做快照回退，但需要发版适配；
- `localStorage` 容量约 5MB，自定义图片会占空间；已压缩并在超限时放弃保存并告警；
- 中文社媒未接入，热度只能覆盖公开英文社区与四家中文科技媒体；
- 兼容性列表需要随 DSH 新版本更新。
