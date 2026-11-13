# 分发台账 — dsh-remedy

> 每一条 = 一次提交 / 一个 URL。**「已提交」不等于「已收录」**，本文件只写已经发生过的事，
> 以及当天读到的事实。任何数字都必须出现在 `docs/copy/facts/public-repo-facts.md`
> （或本文件明确标注为「本台账自己的读数」）。

## 0. 这次准备投出去的渠道（按权重）

| 渠道 | 机制 | 我们要交什么 | 状态 |
|---|---|---|---|
| [awesome-dsh-plugin](https://github.com/awesome-dsh-plugin/awesome-dsh-plugin) | **一个插件一个 YAML 文件**，README 由脚本生成，所以 PR 不会与别人相撞；门禁机器可验（`dsh.bundle`、仓库年龄、`dsh-plugin` topic、描述与代码一致、一个 PR ≤ 3 条） | `data/plugins/jjjjjjjjnnjnn__dsh-remedy--packages-plugin.yml`（内容见 `awesome-dsh-plugin-entry.yml`） | **待提交**（entry 写好了，未开 PR） |
| [AdamPlatin123/dsh-plugin-radar](https://github.com/AdamPlatin123/dsh-plugin-radar) | 开源生态雷达，PR 提交候选 | 一条 PR | 未提交 |
| [polang233/dsh-plugin-index](https://github.com/polang233/dsh-plugin-index)（dshopen） | 索引源 + issue/PR 提交 | 一条 issue | 未提交 |
| [YELEBAI/dsh-plugin-marketplace](https://github.com/YELEBAI/dsh-plugin-marketplace) | **自动按 topic 采集**，无需申请 | 只需仓库带 `dsh-plugin` topic | 无需动作（topic 已在） |
| [bradeGithub/DSH-Plugins-Marketplace](https://github.com/bradeGithub/DSH-Plugins-Marketplace) | 同上，自动采集 | 同上 | 无需动作 |
| [imsai-sh/awesome-deepseek-harness-plugins](https://github.com/imsai-sh/awesome-deepseek-harness-plugins) | 目录文件（一个插件一个 JSON） | 一条 PR | 未提交 |
| [dsh-so/dsh-plugin-submissions](https://github.com/dsh-so/dsh-plugin-submissions) | issue 表单 | 一条 issue | 未提交 |
| [alldsh/submissions](https://github.com/alldsh/submissions) | issue 表单 | 一条 issue | 未提交 |
| [dsh-community-plugins](https://github.com/dsh-community-plugins/…) | `community.json`，按 id 升序插入 | 一条 PR | 未提交 |
| [deepseek-ai/deepseek-harness Discussions](https://github.com/deepseek-ai/deepseek-harness/discussions) | 「Show Your Plugins!」专区的单帖，六条规则 | 一个帖子（**由人发**） | 未发 |

**先说清两件事，避免把「提交」读成「收录」**：

1. 这些平台里只有两家是**机器自动采集**（YELEBAI、bradeGithub），其余都要人工评审；
2. 评审的门槛各不相同，**没有任何一家承诺收录**。本台账只记「我们提交了什么」。

## 1. 描述的红线（每一家都适用）

- 不写「安全 / 无恶意 / 100% 兼容 / 提升速度」这类没有证据的话；
- 不写下载量、不写「多少人在用」；
- **描述里不放数字**（awesome-dsh-plugin 把每句描述当作对代码的声明逐条核对；放数字就要能对账）；
- 每一句都要能在代码里指出实现：`llm/stream` 的修复、`agent/request-error` 的命名、
  `explain` 的覆盖回答、`scan` 的离线普查。

## 2. 可被市场直接消费的两个文件

| 文件 | 用途 |
|---|---|
| `docs/market-index.json` | format 1 索引源，钉在公开仓提交 `39cc358e`，`source.git.path = packages/plugin` |
| `docs/distribution/awesome-dsh-plugin-entry.yml` | 那张表的条目文件本体，可直接复制成 `data/plugins/jjjjjjjjnnjnn__dsh-remedy--packages-plugin.yml` |

`docs/market-index.json` 的 `versions[].publishTimestamp` 是**实测值**（`npm view dsh-remedy time`
读到 0.3.8 在 `2026-11-12T17:40:02.359Z` 落地 → `1794505202`），不是占位符。

## 3. 为什么要先发版再铺渠道

现在仓库里的一切都指向 **0.3.8**（registry 的 `latest`），而 P-0014…P-0019 六个补丁
**合并且 `tested`、但未发布**。渠道铺开之后，从列表点进来的人会：

1. 读到「十九个补丁」的 README（仓库是新的）；
2. 装到只带十三个补丁的 0.3.8（registry 是旧的）。

这个落差本身不算错（README 已明写「P-0014…P-0019 未发布」），但**先把版本发出去再铺渠道**更干净：
一次 bump → `pnpm pack` → 翻事实包「published」段 → 重登记全部对外文件 → 再提交列表。

## 4. 已经发生过的事（如实记）

- 2026-11-13：写好了 `awesome-dsh-plugin` 的条目文件与 `docs/market-index.json`，
  加了 `dsh.catalog` / `dsh.marketplace` 两个块，仓库 topics 增至 10 个（含 `patch-set`、`seam`）。
- 尚未：开任何 PR / issue，也未发帖。
