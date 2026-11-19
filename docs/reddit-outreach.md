# Reddit outreach queue — dsh-remedy

> 规则来自 [PROMOTION-PLAYBOOK.md](PROMOTION-PLAYBOOK.md) §4.3：一个版一天最多一条，
> 同一天最多两个版，文案不能逐字相同。发后必须查 `removed_by_category`；
> `"reddit"` 是站级过滤 → modmail，**不重发、不换标题再试**。
> 账号 `Visible_Swim471` 只有 6 post karma / 0 comment karma，属于站级过滤高风险账号，
> 所以优先发**有技术内容的文本帖**，链接放正文，不刷票、不请求点赞。

## 已发（2026-11-19）

| 版 | 帖子 | 读数 | 结论 |
|---|---|---|---|
| r/SideProject | [1y044lf](https://www.reddit.com/r/SideProject/comments/1y044lf/) | `removed_by_category: "reddit"` | 站级过滤；不重发，已尝试 modmail（界面无确认） |
| r/DeepSeekHarness | [1y04d7f](https://www.reddit.com/r/DeepSeekHarness/comments/1y04d7f/) | `removed_by_category: null` | 正常显示；24h 内回每条评论 |

## 排除的版（已读当期规则）

- **r/programming**：`No LLM-Written Content`，明文禁止 LLM 正文 → 不发。
- **r/commandline**：`Post text or titles generated with AI are strictly prohibited`，且禁止生成式 AI 相关项目 → 不发。
- **r/DeepSeek**：1/10 self-promotion 限制；本账号近期几乎全是自己项目帖 → 暂缓，先发有实质内容的讨论再考虑。

## 排期与定制草稿

### 第 2 天：r/devtools + r/coolgithubprojects

**r/devtools**（规则要求「how you built it or why it matters」）
标题：`A stream repair layer that only fixes what it can prove`
正文：
```
I built a repair plugin for DeepSeek Harness's llm/stream seam. The design rule is narrow: split a fused tool-call text only when every fragment parses on its own; otherwise rethrow the provider's error. There is no "best effort" path that could turn a failed turn into a silent success.

The interesting part was hostile neighbours. Another plugin on the same waterfall can hand the wrapper a null chunk, non-string arguments, or a finish with no reason. Reading those fields unguarded made our own plugin throw. Now we check only the fields we read, flush what we hold, and pass the rest of that stream through.

Repo: https://github.com/jjjjjjjjnnjnn/dsh-remedy

For people who build devtools around agent streams: how do you decide when a malformed chunk is yours to fix versus the adapter's?
```

**r/coolgithubprojects**（无成文版规，曾成功发过帖）
标题：`dsh-remedy - 54 patches that keep a failed DSH turn from looking successful`
正文：
```
A fused tool call used to kill the whole turn. This project splits it only when each half parses on its own, and rethrows the provider's failure otherwise. It also ships an offline scan/explain that reads this host's real session logs instead of fixtures.

Repo: https://github.com/jjjjjjjjnnjnn/dsh-remedy

I would like to know whether the "rethrow rather than fake a fix" boundary is the right default for a repair tool.
```

### 第 3 天：r/LLMDevs + r/opensource

**r/LLMDevs**（禁止 disguised advertising；必须给出处与局限）
标题：`When a tool-call stream hands you a shape you cannot verify`
正文：
```
Sharing a pattern from maintaining a DeepSeek Harness plugin rather than a product pitch.

On llm/stream we only repair a fused tool call when every fragment can be parsed independently. If it cannot be proven, we rethrow the original provider failure. The alternative, dispatching a guess, calls a tool the model never asked for.

A second seam, agent/request-error, only names deterministic refusals; it never silently downgrades a model effort. Both rules are in the registry with their counter-evidence and limits: https://github.com/jjjjjjjjnnjnn/dsh-remedy

Limitation: this does not fix the adapter or the host UI, and macOS is only a CI job here.
```

**r/opensource**（需 `Promotional` flair，MIT 许可证已满足）
标题：`[Promotional] dsh-remedy: a patch set with per-patch evidence and limits`
正文：
```
An open-source patch set for DeepSeek Harness seams. Each of its 54 patches carries a symptom, a measured mechanism, counter-evidence and a written limit in one registry file. Nothing is claimed as verified without a live or build/host artifact.

The part I would like feedback on is the ledger itself: statuses are only allowed to move when a script produces a receipts file with a hash, and a report from outside stays a lead until the shape is reproduced locally.

MIT licensed: https://github.com/jjjjjjjjnnjnn/dsh-remedy
```

## 发帖后固定动作

1. `GET https://www.reddit.com/r/<sub>/comments/<id>.json?raw_json=1`（本机 `fetch` 会被 TLS 拒，用登录浏览器打开该 URL）。
2. 看 `removed_by_category`：`null` 正常；`"reddit"` → modmail 不重发；`"moderator"` → 读 `mod_reason_title`，不重发。
3. 24h 内回每条评论，把作者与结论追加进 `docs/reach/<date>.md`。
4. 结果同步写回 `docs/PROMOTION.md` 的发布记录表。

## 与总线的分工

本文件只放**每版的规则与定制文案**，不做全局排期/去重。真实发帖后用知识库总线登记：
`kb promo record --project dsh-remedy --channel reddit --url <post-url> --outcome visible|filtered --method reddit_json --result 'removed_by_category=...'`。
被站级过滤的帖子要同时写一条 `promotion_inbound`（`requires_reply: true`），由总线跟踪 modmail 回音；
本文件只记本机读数。
