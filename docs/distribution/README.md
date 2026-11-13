# 分发台账 — dsh-remedy

> 每一条 = 一次提交 / 一个 URL。**「已提交」≠「已收录」≠「已渲染」**，三者是不同的事，
> 本文件分开写。任何数字都必须出现在 `docs/copy/facts/public-repo-facts.md`。

## 0. 已提交（2026-11-13）

| 渠道 | 形式 | URL | 状态 |
|---|---|---|---|
| [imsai-sh/awesome-deepseek-harness-plugins](https://github.com/imsai-sh/awesome-deepseek-harness-plugins) | PR，一个 `catalog/plugins/*.json` | [#928](https://github.com/imsai-sh/awesome-deepseek-harness-plugins/pull/928) | ✅ **已合并**（`github-actions[bot]` 09:12:12Z 自动 squash；静态检查全过、Codex 复查 0 findings）。条目已在 `main` 上。**渲染成「仅浏览」**：它的商店只从 npm 装，`dsh-remedy` 虽然已发布，但它判定「直到带 `dsh.bundle` 的包发到 npm 才显示安装命令」 |
| [awesome-dsh-plugin](https://github.com/awesome-dsh-plugin/awesome-dsh-plugin) | PR，一个 `data/plugins/*.yml` | [#14942](https://github.com/awesome-dsh-plugin/awesome-dsh-plugin/pull/14942) | `open` / `MERGEABLE` / `UNSTABLE`（`check` 在跑）/ `+7 -0` / **changed_files 1** |
| [polang233/dsh-plugin-index](https://github.com/polang233/dsh-plugin-index)（dshopen） | issue 模板 | [#472](https://github.com/polang233/dsh-plugin-index/issues/472) | open（人工审） |
| [alldsh/submissions](https://github.com/alldsh/submissions) | issue 模板 | [#3](https://github.com/alldsh/submissions/issues/3) | open（人工审） |

## 1. 自动采集，不需要申请

| 渠道 | 机制 | 我们的现状 |
|---|---|---|
| [AdamPlatin123/dsh-plugin-radar](https://github.com/AdamPlatin123/dsh-plugin-radar) | 每日 02:00 全量扫 `dsh-plugin` topic；也可在 `PLUGINS.md` 追加一行提 PR | topic 已在 → 等下一次扫描 |
| [YELEBAI/dsh-plugin-marketplace](https://github.com/YELEBAI/dsh-plugin-marketplace) | 按 topic 自动采集 | 读到的 registry（18 746 条）里**暂时没有我们** → 等下一次采集 |
| [bradeGithub/DSH-Plugins-Marketplace](https://github.com/bradeGithub/DSH-Plugins-Marketplace) | 按 topic 自动采集 | **已采集到，但读错了清单**：`installable: "non-plugin"`、`pkg_name: "dsh-remedy-workspace"`、`version: "0.3.8"`。它读的是仓库根那个私有 workspace 壳；真正可安装的清单在 `packages/plugin/package.json`。改不了它的扫描逻辑，但记在这里以免被读成「已收录为插件」 |

## 2. 还要人做

| 渠道 | 为什么 |
|---|---|
| [deepseek-ai/deepseek-harness Discussions](https://github.com/deepseek-ai/deepseek-harness/discussions)「Show Your Plugins!」 | 发帖由人决定；六条规则（一贴一项目 / 标题格式 / 显著标注非官方 / 禁无关推广 / 正文含地址+简介+截图+集成方式 / 建议模板） |
| [dsh-so/dsh-plugin-submissions](https://github.com/dsh-so/dsh-plugin-submissions) | 自 2026-09-08 无 push、无 issue 模板；表单在站上，是人工动作 |

## 3. 描述红线（每一家都适用）

- 不写「安全 / 无恶意 / 100% 兼容 / 提升速度」这类无证据的话；
- 不写下载量、不写「多少人在用」；
- **描述里不放数字**（awesome-dsh-plugin 与 imsai 都把每句描述当作对代码的声明）；
- 每一句都要能指到实现：`llm/stream` 的修复、`agent/request-error` 的命名、
  `explain` 的覆盖回答、`scan` 的离线普查。

## 4. 可被市场直接消费的产物

| 文件 | 用途 |
|---|---|
| `docs/market-index.json` | format 1 索引源，钉在公开仓提交 |
| `docs/distribution/awesome-dsh-plugin-entry.yml` | 那张表的条目文件本体 |
| `docs/distribution/awesome-dsh-plugin-pr.md` | PR 正文（四条断言各自指到代码） |
| `docs/distribution/imsai-catalog-entry.json` | imsai 的 `catalog/plugins/*.json` 本体（已合并进它的 main） |

`docs/market-index.json` 的 `publishTimestamp` 是**实测值**（`npm view dsh-remedy time` 读到
0.3.8 在 `2026-11-12T17:40:02.359Z` 落地 → `1794505202`），不是占位符。

## 5. 下一步的顺序（发布优先于铺渠道）

从列表点进来的人会读到「十九个补丁」的 README（仓库是新的），却装到只带十三个补丁的
`0.3.8`（registry 是旧的）。README 已明写这件事（「P-0014…P-0019 未发布」），所以不算说假话；
但把版本发出去之后再铺渠道，这个落差就不存在了 —— 而 **imsai 那条正是要等 npm 上的包才算
「可安装」**，所以发布本身就是让那条从「仅浏览」变成「可安装」的唯一方式。
