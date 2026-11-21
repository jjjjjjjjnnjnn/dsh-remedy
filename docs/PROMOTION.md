# Promotion — dsh-remedy

> **发布与渠道状态已统一到本地知识库 `Promotion/` 总线**
> （`C:\Users\rongj\Desktop\本地知识库\知识库内容\Promotion\`）。
> 本文件保留事实卡与历史记录；新的排期、七道门禁与发布台账在总线里，这里不再新增渠道状态。

> 流程、判据与验证见 [PROMOTION-PLAYBOOK.md](PROMOTION-PLAYBOOK.md)。
> 本文件只放**本项目的**事实卡、草稿与本机现场记录。
> 数字唯一来源是 `docs/copy/facts/public-repo-facts.md`；对外文字必须经 `scripts/copy_record.mjs` 登记。

## 0. 与本机知识库宣传总线的边界

负责 Agent 的完整工作顺序见 `docs/AGENT-WORKFLOW.md`；本节只讲宣传状态的归属。

**唯一宣传状态机在** `C:\Users\rongj\Desktop\本地知识库\知识库内容\Promotion`（知识库宣传总线）。
本仓库只负责两件事：**提供事实与读数**（`docs/copy/facts/` 与 `scripts/daily-reach.mjs --json`），
以及**记录本机实际动作**（`docs/reach/` 是 signal，不是第二份渠道状态）。
排期（`queue/`）、发布台账（`ledger/`）、事实卡（`facts/`）、评论回收（`inbound/`）与
每日汇总（`reach/`）都在知识库，由 `kb promo status / plan / record / collect` 统一查询。

总线契约见知识库 `Promotion/SIGNALS.md`：本仓库的命令必须输出 `promotion-snapshot/v1` 到 stdout，
读不到写 `unreachable`，绝不伪造数字。本文件下面的「渠道状态」与「发布记录」只是本机可复核的现场，
与总线不一致时**以总线为准**并修正本文件。

## 0. 人与自动化的分工

- 自动化可做：事实卡现取、目录状态查询、截图生成、表单填写、上传、发布后验证、每日触达记录。
- **必须本人**：X / Reddit / DSH Discussions 的登录与 2FA；**HN / V2EX 的正文**（平台禁止 AI 生成内容）。
- 自动化在 HN / V2EX 只交事实卡与结构提纲，不写正文、不代发。

## 1. 事实卡（每次现取，不沿用）

| 项 | 来源命令 |
|---|---|
| 版本与 latest | `npm view dsh-remedy version` / `npm view dsh-remedy-core version` |
| 补丁与状态 | `node packages/plugin/dist/cli.js status --json` / 事实包 |
| 测试与门禁 | `pnpm run verify`（输出 `tests N` / `ALL GREEN · 6 gates`） |
| 包体与 sha1 | `npm pack` 或事实包的 tarball 行 |
| 字节账 | `node scripts/gate_size.mjs` 与事实包字节段 |
| 平台边界 | `docs/compatibility.md`（Windows / Linux 实测，macOS 只有 CI job） |
| 分发状态 | `node scripts/catalog-status.mjs` |
| 外部印证（新增 2026-11-21） | `docs/research/intake-r85-triage.md` / `docs/research/negative-feedback-2026-11-21.md`：公开 #13983 在 0.2.2-rc.5 上给出 P-0001 的粘连参数原文；本机 `data/results/live-external-fusion-2026-11-21T16-25-00.000Z.json` 证明 shipped engine 把两段各自 parse 成两个调用 |

**三条诚实边界**（每一版都要带）：
1. 不改宿主 `app.asar`，只在声明的接缝上改 chunk。
2. 不做插件市场，不替用户决定装哪个包。
3. macOS 只有 CI job，没有本机实测；外部报告只是线索，本机复现才有补丁。

## 2. 渠道状态（读数写进 `docs/distribution/README.md` 与 `docs/reach/`）

| 渠道 | 形式 | 当前状态（2026-11-19） | 下一步 |
|---|---|---|---|
| npm（两包） | 发布 | `latest = 0.4.20`，冷装 `OK 8 fixture(s)` | 每次发版后核对 |
| GitHub Releases | tag + release | `v0.4.20`，正文与 notes 逐字节相同 | 每次发版后核对 |
| awesome-dsh-plugin | PR + 目录条目 | #14942 / #15072 已合并，条目在 `main` | `catalog-status.mjs` 查是否仍 current |
| imsai-sh | PR + 商店 | #928 已合并；商店巡检曾停摆（它的 #19） | 只读复查，不重复提 PR |
| dshopen | issue | #472 已关闭（收录 0.4.4） | 有新版可回帖，不重开 |
| AllDSH | issue | #3 仍 open | 等人工审，不刷 |
| dsh.so | 站上表单 | 已用 `0.4.20` 提交：FORMAT / SECURITY 全 Pass，页面 `✓ Submitted` | 等维护者合并；只读复查，不重复提 |
| DSH Discussions | Show Your Plugins! | #13206 已追加 `0.4.20` 回帖（[comment](https://github.com/deepseek-ai/deepseek-harness/discussions/13206#discussioncomment-19729583)） | 有新回复时再回 |
| X / Reddit / dev.to | 社交帖 | X 英/中根帖、Reddit r/SideProject（站级过滤）/r/DeepSeekHarness、dev.to 文章均已发 | 以总线 `ledger/` 为准，不重发 |
| Hacker News / V2EX | 发帖 | 未发 | 只交事实卡，本人写 |
| 自动采集（radar / marketplace 等） | topic 扫描 | 等下一次采集 | 不申请 |

## 3. 草稿

### 3.1 X（英文根帖，≤270 字符）

```
dsh-remedy 0.4.20 is out. It repairs tool-call arguments on the DSH llm/stream seam, names refusals, and ships an offline scan/explain. 54 patches, all with a live or build/host witness. It never changes app.asar and never turns a failed turn into a fake success.
Repo: <URL>
```

### 3.2 X（中文根帖）

```
dsh-remedy 0.4.20 已发布：在 DSH 的 llm/stream 接缝上拆开已证实的粘连调用，读不懂的原样放行；附带离线 scan/explain。五十五个补丁全部有见证，但不改 app.asar、不制造假成功。仓库：<URL>
```

### 3.3 Reddit（标题 + 正文骨架，按版规改写）

标题：`dsh-remedy — a repair layer for DSH tool-call streams that refuses to fake a fix`

正文骨架：一次粘连调用会让整个 turn 失败；这个插件在接缝上只在能证明时拆分，否则原样抛回。
给出一条现取数字与一条限制；结尾问「你觉得『原样抛回』比『假装修好』更可取吗？」不要求投票。

### 3.4 dev.to（文章提纲，非 AI 代发）

场景 → 机制（接缝与判据）→ 一条实测数字 → 三条边界 → 一个问题。正文由本人写。

### 3.5 HN / V2EX

**不代写**。只把本文件 §1 事实卡 + §3 骨架交给本人。

## 4. 发布记录

| 日期 | 渠道 | URL / 产物 | 验证 | 结论 |
|---|---|---|---|---|
| 2026-11-13 | DSH Discussions | [#13206](https://github.com/deepseek-ai/deepseek-harness/discussions/13206) | 已发布 | 见 distribution 台账 |
| 2026-11-19 | npm / GitHub | `dsh-remedy@0.4.20` / release `v0.4.20` | `exact_ok` + `latest_ok`、正文逐字节相同 | 已发布 |
| 2026-11-19 | X / @JJjj1955714 | 英文根帖 + 中文根帖（各一条，中文重复的一条已删除） | profile 读回文本一致 | 已发布 |
| 2026-11-19 | GitHub social preview | `docs/distribution/social-preview.png`（1280×640，41 543 B） | DOM `repository-images.githubusercontent.com/...`；下载 41 543 B / 1280×640 与本地一致 | 已上传 |
| 2026-11-19 | dsh.so | npm 通道 `dsh-remedy@0.4.20` | FORMAT VALIDATION Pass、SECURITY SCAN Pass（0 Critical / 0 Warnings / 0 Info、29 files）、`✓ Submitted` | 已提交，等维护者合并 |
| 2026-11-19 | DSH Discussions #13206 | [回帖](https://github.com/deepseek-ai/deepseek-harness/discussions/13206#discussioncomment-19729583) | GraphQL `addDiscussionComment` 返回 URL | 已发布 |
| 2026-11-19 | dev.to | [What a repair layer can and cannot do on DSH's llm/stream seam](https://dev.to/jjjjjjjjnnjnn/what-a-repair-layer-can-and-cannot-do-on-dshs-llmstream-seam-2ejm) | 页面读回标题、四标签、AI 披露 `Fully Autonomous` | 已发布 |
| 2026-11-19 | Reddit r/SideProject | 帖子 [1y044lf](https://www.reddit.com/r/SideProject/comments/1y044lf/) | JSON `removed_by_category: "reddit"` = 站级过滤；**不重发**，已尝试 modmail（界面未返回确认，记为未确认） | 被过滤 |
| 2026-11-19 | HN / V2EX | 无 | 平台禁止 AI 生成正文，只交事实卡 | 未发（本人写） |
| 2026-11-19 | Reddit r/DeepSeekHarness | [文本帖 1y04d7f](https://www.reddit.com/r/DeepSeekHarness/comments/1y04d7f/) | JSON `removed_by_category: null`，正常显示 | 已发布 |
| 2026-11-19 | Reddit 排期 | `docs/reddit-outreach.md` | 每版定制文案 + 发后 JSON 验证 + 站级过滤不重发 | 队列，逐日最多两版 |

> 本轮新增记录由 `scripts/daily-reach.mjs` 写入 `docs/reach/<date>.md`；人工渠道的回帖与结论写回本表，并在总线 `ledger/` 登记。两处不一致时以总线为准。

**2026-11-21 推广动作**：`kb promo facts dsh-remedy`（事实卡已刷新）、`kb promo plan`（今日 `post: 0`，无新版本就不发帖）、`kb promo collect dsh-remedy`（`stale: false`）；新证据经工单 `TSK-20261121-017-dsh-remedy…` 派给 `agent-promotion`，要求写进事实卡但等下一个发布版本或本人确认后再排期。HN / V2EX 仍只交事实卡，本人写本人发；r/SideProject 停投至 2026-12-19。

