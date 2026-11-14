# 社区面现状（2026-11-14 实查）

> 这份文件是 `docs/research/plan-0.4.9.md` 的事实底稿：**每个数字都是当天读到的**，
> 读不到的地方写明读不到。不要把它当成"渠道都通了"的清单。

## 1. 我们自己的盘面

| 指标 | 实测 | 来源 |
|---|---|---|
| GitHub stars / forks / watchers | **1** / 0 / 0 | `gh api repos/jjjjjjjjnnjnn/dsh-remedy` |
| 用户 issue | **0**（4 个 open 全是 dependabot PR） | `gh api .../issues?state=open` |
| Discussions | 未开启（`has_discussions: false`） | 同上 |
| npm 月下载（plugin） | **2 720**（2026-10-15 → 2026-11-13） | `api.npmjs.org/downloads/point/last-month` |
| npm 月下载（core） | **2 692** | 同上 |
| 已发布版本 | 0.4.8（两包 `latest`） | `npm view` |
| 公开仓 CI | main 与 tag `v0.4.8` 都 **success** | `gh run list` |

**怎么读这组数**：有安装量（2 720）但没有反馈量（0 issue）。所以下一版的瓶颈不是"修得不够多"，
而是**装了的人没有一个便宜的地方说话**。

## 2. 宿主侧（报告真正发生的地方）

| 指标 | 实测 |
|---|---|
| `deepseek-ai/deepseek-harness` stars | **281 005** |
| forks | **34 702** |
| open issues | **0**（issue 关闭） |
| Discussions | **开启**；`MALFORMED` 一个关键词命中 **294** 条 |
| 最近活动 | 2026-11-13 |

**结论**：DSH Discussions 是唯一有量的报告池，而且量很大（单关键词 294 条）。
本轮 `leads.md` 只登记了 27 条，是**采样**不是穷举；下一版要用脚本做可复算的巡检。

## 3. Reddit（读不到正文）

| 入口 | 实测 |
|---|---|
| `https://www.reddit.com/r/DeepSeek/search.json?...` | **ECONNRESET**（TLS 握手前断开） |
| `https://api.reddit.com/...` | **ECONNRESET** |
| `https://old.reddit.com/...` | **ECONNRESET** |
| `websearch "site:reddit.com ..."` | 可用，返回标题 + 一两句摘要 |

当天摘要里出现的相关讨论（**只读到摘要**，未读正文）：

| 标题 | 摘要里的关键句 | 为什么值得登记 |
|---|---|---|
| *DeepSeek Harness is frustrating, is it just me?*（r/DeepSeek） | "When a tool report is empty, or straight up fails, DSH moves on and claims the job is done" | 这正是本项目最该命名的"静默把失败当成功"类；先登记，不据此发补丁 |
| *I built a DeepSeek Harness plugin that proves why your agent did something wrong*（r/LLMDevs / r/DeepSeek） | "the real cause was the error message itself" | 同期竞品在做归因；可作为"同类项目读法"的对照 |
| *Does reusing pi extensions and DeepSeek Harness ...*（r/rust） | "what happens when a TS plugin hangs in the middle of a tool call" | 插件挂起/超时类，可能 out-of-seam |
| *I made dsh read the logs your old harness already wrote*（r/DeepSeek） | 提到 `- insert:` 与裸行被拒绝 | 与我们的 `cordis.patch.yml` 规则同族，可作为外部印证 |

**边界**：这些行进 `leads.md` 时 `read_depth: summary`，**不得**升到 `reproduced`，
除非本机复现了它描述的类。

## 4. 市场 / 渠道

| 渠道 | 状态（2026-11-14） | 下一步 |
|---|---|---|
| dshopen（polang233/dsh-plugin-index） | #472 已关闭（收录，审的是 0.4.4） | 0.4.8 已发布，等它下一次抓取 |
| awesome-dsh-plugin | 页面已上线（`/p/jjjjjjjjnnjnn…`），PR #15072 已带 `tarball:` 兜底 | 等 nightly 探针更新版本号 |
| AllDSH（alldsh/submissions） | #3 仍 open | 等人工 |
| dsh.so | 0.4.7 已提交（`✓ Submitted`） | 0.4.8 需重提；浏览器通道上次是 disconnected |
| imsai（awesome-deepseek-harness-plugins） | 巡检停摆（它自己的 #19） | 不重复提 PR |
| DSH Store / dsh-plugin-marketplace | 有评论量，本轮未系统读 | 纳入 `collect_leads.mjs` 的 `--market` |

## 5. 缺口清单（0.4.9 要补的）

1. **采集不可复算**：27 条是手翻的，没有 `intake-*.json`。
2. **账本字段不够**：`leads.md` 分不清"读到摘要"与"读到全文"。
3. **Reddit 没有诚实通道**：要么走浏览器，要么承认只读摘要。
4. **装了的人不说话**：0 issue、1 star、2 720 下载 —— 需要一个便宜的回馈入口（issue 模板已有；
   考虑在 README 里放一行"装了坏了请开 issue，带 `dsh-remedy scan --json` 输出"）。
5. **市场评论没读**：DSH Store / dsh-plugin-marketplace 的评论区，是最接近"装了但坏了"的地方。
