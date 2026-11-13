# 分发台账 — dsh-remedy

> 每一条 = 一次提交 / 一个 URL。**「已提交」不等于「已收录」**。本文件只写已经发生过的事，
> 以及当天读到的事实。任何数字都必须出现在 `docs/copy/facts/public-repo-facts.md`。

## 0. 投出去的（2026-11-13）

| 渠道 | 形式 | URL | 状态（当天读数） |
|---|---|---|---|
| [awesome-dsh-plugin](https://github.com/awesome-dsh-plugin/awesome-dsh-plugin)（24.5k stars） | PR，**一个条目文件** | [#14942](https://github.com/awesome-dsh-plugin/awesome-dsh-plugin/pull/14942) | `open` / `MERGEABLE` / `UNSTABLE`（等 CI）/ `+7 -0` / **changed_files 1** |
| [imsai-sh/awesome-deepseek-harness-plugins](https://github.com/imsai-sh/awesome-deepseek-harness-plugins)（392 stars） | PR，**一个 JSON 文件** | [#928](https://github.com/imsai-sh/awesome-deepseek-harness-plugins/pull/928) | `open` / `mergeable` / `unstable` / `+12 -0` / **changed_files 1** |
| [polang233/dsh-plugin-index](https://github.com/polang233/dsh-plugin-index)（dshopen，233 stars） | issue 模板 | [#472](https://github.com/polang233/dsh-plugin-index/issues/472) | open |
| [alldsh/submissions](https://github.com/alldsh/submissions) | issue 模板 | [#3](https://github.com/alldsh/submissions/issues/3) | open |

## 1. 不需要申请的（按 topic 自动采集）

| 渠道 | 机制 | 我们的现状 |
|---|---|---|
| [AdamPlatin123/dsh-plugin-radar](https://github.com/AdamPlatin123/dsh-plugin-radar)（1.5k stars） | 每日 02:00 全量扫描带 `dsh-plugin` topic 的仓库；也可在 `PLUGINS.md` 追加一行提 PR | topic 已在 → 等下一次扫描 |
| [YELEBAI/dsh-plugin-marketplace](https://github.com/YELEBAI/dsh-plugin-marketplace) | 按 topic 自动采集 | **读到的 registry（18 746 条）里暂时没有我们** → 等下一次采集 |
| [bradeGithub/DSH-Plugins-Marketplace](https://github.com/bradeGithub/DSH-Plugins-Marketplace) | 按 topic 自动采集 | **已采集到**，但读数是 `installable: "non-plugin"`、`pkg_name: "dsh-remedy-workspace"`、`version: "0.3.8"` |

**最后一行是别人的扫描器读错了，记在这里以免误读成「已收录为插件」**：它读的是仓库根的
`package.json`，那是私有的 workspace 壳（`dsh-remedy-workspace`，不带 `dsh.bundle`）；
真正可安装的清单在 `packages/plugin/package.json`。我们改不了它的扫描逻辑，
但两家人工评审的目录（上面 PR #14942 / #928）都是指向子目录的，所以那两个方向是对的。

## 2. 还没投的两家（需要人判断）

| 渠道 | 为什么没投 |
|---|---|
| [dsh-so/dsh-plugin-submissions](https://github.com/dsh-so/dsh-plugin-submissions) | 仓库自 2026-09-08 之后无 push，也没有 issue 模板；表单在站上（人工动作） |
| [deepseek-ai/deepseek-harness Discussions](https://github.com/deepseek-ai/deepseek-harness/discussions)「Show Your Plugins!」 | 发帖必须由人决定；它有六条规则（一贴一项目、标题格式、显著标注非官方、禁无关推广） |

## 3. 描述的红线（每一家都适用）

- 不写「安全 / 无恶意 / 100% 兼容 / 提升速度」这类没有证据的话；
- 不写下载量、不写「多少人在用」；
- **描述里不放数字**：awesome-dsh-plugin 与 imsai 都把每句描述当作对代码的声明；
- 每一句都要能指到实现：`llm/stream` 的修复、`agent/request-error` 的命名、
  `explain` 的覆盖回答、`scan` 的离线普查。

## 4. 可被市场直接消费的产物

| 文件 | 用途 |
|---|---|
| `docs/market-index.json` | format 1 索引源，钉在公开仓提交 |
| `docs/distribution/awesome-dsh-plugin-entry.yml` | 那张表的条目文件本体 |
| `docs/distribution/awesome-dsh-plugin-pr.md` | PR 正文（四条断言各自指到代码） |
| `docs/distribution/imsai-catalog-entry.json` | imsai 的 `catalog/plugins/*.json` 本体 |

`docs/market-index.json` 的 `publishTimestamp` 是**实测值**（`npm view dsh-remedy time` 读到
0.3.8 在 `2026-11-12T17:40:02.359Z` 落地 → `1794505202`），不是占位符。

## 5. 为什么「先发版再铺渠道」更好

渠道铺开之后，从列表点进来的人会读到「十九个补丁」的 README（仓库是新的），
却装到只带十三个补丁的 `0.3.8`（registry 是旧的）。README 已明写这件事，所以不算说假话；
但一次 `bump → pack → 翻事实包 → 重登记` 之后再铺，落差就不存在了。
