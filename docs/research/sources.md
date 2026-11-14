# 社区来源登记 — dsh-remedy

> 从 0.4.9 起，外部反馈不再只来自 DSH Discussions。这份文件登记**每个来源能不能读、怎么读、
> 多久读一次、读不到时怎么记**。读法本身要可重复；"我翻了几页"不算来源。
>
> 最后一次实查：**2026-11-14**（0.4.8 发布当天）。下面每行的"实测"都是当天的结果，不是推测。

## 1. 一手来源（报告发生的地方）

| id | 来源 | 回答什么问题 | 读法（实测） | 频率 | 边界 |
|---|---|---|---|---|---|
| S-DSH | `deepseek-ai/deepseek-harness` **Discussions** | 宿主自身的失败、修复讨论、版本差异 | `gh api graphql` 的 `search(type: DISCUSSION, ...)`：`MALFORMED` 命中 **294** 条；issue 关闭，用 issues API 会得到 0 条 | 每周 + 发版前 | 只有 Discussions；GraphQL 有速率限制，结果先落文件再解析 |
| S-REDDIT | Reddit（`r/DeepSeek`、`r/LLMDevs`、`r/CommandCode` 等） | "装了但坏了"、真实使用抱怨、竞品口碑 | **直接 `fetch` 在本机被 `ECONNRESET` 拒绝**（`www.reddit.com` / `api.reddit.com` / `old.reddit.com` 三种都试过）；`websearch` 可用，返回的是**摘要**不是讨论正文 | 每周 | 只能引用摘要时必须在行里写清"只读到摘要"；不能据此写补丁 |
| S-NPM | npm registry / downloads API | 真实安装量、版本分布、依赖我们的包 | `https://api.npmjs.org/downloads/point/last-month/dsh-remedy` 实测 **2 720**；core **2 692**（2026-10-15 → 2026-11-13） | 每次发版 | 下载量不是用户数；不发版时不看 |
| S-SELF | 本仓库 issues / PR | 装了我们的包的人直接反馈 | `gh api repos/.../issues`：**0 个用户 issue**，4 个全是 dependabot PR | 每天 | 没有 issue ≠ 没有反馈，只说明没人在这里写 |
| S-MARKET | dshopen（polang233/dsh-plugin-index）、awesome-dsh-plugin、AllDSH、dsh.so、DSH Store、dsh-plugin-marketplace | 收录状态、描述是否过时、评论区里的"装坏了" | 各自的 issue/PR/站点；dshopen #472 已关闭，AllDSH #3 仍 open，dsh.so 0.4.7 等合并 | 每次发版后 | 对方合并节奏不可控；不重复提同一 PR |
| S-CODE | `dsh-triage`（同级）、`ai-terminal-pet`、`dsh-remote-connect`、社区插件源码 | 设计对照：同一个接缝别人怎么挂、怎么避开同样的问题 | 只读源码与 README；不整段抄 | 需要时 | GPL/AGPL 不碰；借用必须写来源与许可证 |
| S-CENSUS | 本机 `dsh-remedy scan` | **镜像**：报告里的类本机是否也出现 | `node packages/plugin/dist/cli.js scan ~/.dsh/sessions --json` | 每周 | 只读离线；不写 `~/.dsh` |

## 2. 为什么把 Reddit 单列

它是唯一一个**大量用户抱怨但机器读不到正文**的来源。2026-11-14 的实测：

```
$ node -e "fetch('https://www.reddit.com/r/DeepSeek/search.json?...')"
ECONNRESET  (TLS 握手前断开，三种域名都一样)
$ websearch "site:reddit.com DeepSeek Harness ..."
→ 返回 8 条摘要，可用但只有标题 + 一两句正文
```

所以 Reddit 的规则是三条：

1. 摘要能读，就登记为 `lead`，并在 `source` 后写 `（摘要，未读正文）`；
2. 需要正文时走浏览器（`browse` 扩展）或由人贴进来，**不假装读到**；
3. 摘要里出现的类，仍然要回到 S-DSH 或 S-CENSUS 去对照，不能直接成为补丁的依据。

## 3. 一条线索的字段（`leads.md` 的行）

沿用 `docs/research/README.md` §2 的字段，加两个只在新来源上用的：

| 字段 | 取值 | 用途 |
|---|---|---|
| `source_kind` | `dsh` / `reddit` / `npm` / `self` / `market` / `code` / `census` | 统计每个来源产出多少条、多少条被拒 |
| `read_depth` | `full` / `summary` / `title` | 让读者知道这条有没有被真正读过 |

`read_depth != full` 的行**不得**升到 `reproduced` 以上，除非本机复现了它描述的类。

## 4. 采集的产物

- `data/results/intake-<stamp>.json`：一次巡检的**计数**（每个来源、每个关键词各命中多少、
  新增多少、重复多少），由 `scripts/collect_leads.mjs` 写出，带 `produced_by` / `generated_at` /
  `schema_version` 与 `.sha256`。
- `docs/research/leads.md` 仍是**唯一**的线索账本；采集脚本只追加候选行，不删行、不改状态。

## 5. 读不到的时候

| 情况 | 记录方式 |
|---|---|
| 来源需要登录 / 被 TLS 拒 / 返回验证页 | 在 `leads.md` 的 `decision` 写 `source unreadable on <date> via <method>`，并标 `watching` |
| 报告版本早于当前宿主、且本机复现不出 | `unreproduced`，写清版本差 |
| 报告与本项目已修的类重复 | `rejected (dup of P-NNNN)` |
| 报告在别的接缝（宿主/适配器） | 只做命名/诊断，不假装修（`out-of-seam`） |
