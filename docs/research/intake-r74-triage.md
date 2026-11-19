# R74 intake triage — 2026-11-19

> Source: `data/results/intake-2026-11-19T07-00-00.000Z.json` (S-DSH / S-SELF / S-NPM / S-CENSUS all answered).
> 65 candidates were not in `leads.md`. They were bucketed by title (each row exactly once), and three
> that could touch a seam this project uses were read in full. **No shape returned to `llm/stream`,
> `agent/request-error`, `cli` or `profile`; no patch was opened.** The next patch number stays P-0055.

The host moved to DSH 0.2.2-rc.5 this round; the new desktop turn and the neighbour re-check are in
`docs/HANDOFF.md` (R73). This pass only asks whether the upgrade brought new external feedback.

### session (16)

Session writer handles, cold resume, cross-profile resume, persistence formats and the GUI resume flow. Our readers (`scan`/`explain`) observe these sessions but never write them (L-0021/L-0022). #13336 read in full: an empty user message after Continue makes strict gateways 400 — a writer defect, out-of-seam.

- 13336 | [Bug] "Continue" after a failed turn persists an empty user message → session permanently 400s on strict gateways
- 12939 | Windows desktop: first tool call in a new session (or after ~1 min idle) takes 20–30 s — tool runtime cold start
- 10210 | Google Gemini-Argon-4 tool-call replay drops thought_signature in openai-completions
- 12829 | session/writer-held: leaked session write handle blocks resume after a turn ends (zombie session)
- 13598 | dsh-session-persistence-jsonl: write open and historical-format migration hold every Session event in memory; large Sessions need several GB
- 13165 | GUI "New Session" silently resumes an old blank draft, making "settings apply to new Sessions" unreachable
- 13639 | Feature request: bound session memory on small-RAM cloud hosts (full-history restore + repeated structuredClone makes one long session cost hundreds of MB)
- 12566 | ACP server: compose a configured agent preset for new and resumed sessions
- 10006 | Feature request: move an existing session to another workspace (`dsh session move`)
- 13221 | [Bug] 0.2.2-rc.3: opening a historical session removes it from the sidebar and disables the composer
- 12654 | Support ACP session/load so Paseo can restore conversation history
- 13103 | Cold resume decodes the entire Session log: a 179 MB Session costs ~9 s per resume and blocks the event loop / 冷恢复会解码整份日志：179MB 会话每次恢复约 9 秒并阻塞事件循环
- 12454 | 0.2.2-rc.1: opening a session silently disposes it — input "Session unavailable", row disappears
- 10602 | dsh-sdk-jsonrpc-server: resume a session that already exists in session persistence instead of always creating
- 11568 | [Bug] Resume right after a restart can fail with "Unknown agent preset: standard" although the preset exists (transient preset-roster window surfaced as gateway/internal)
- 12810 | [Bug] 0.1.0-rc.7 → 0.2.2-rc.1 upgrade: seeded sessions show "Untitled" — projection-cache identity migration drops isSeeded

### preStepSubagent (12)

Third-party `agent/pre-step` listeners, subagent model selection and forking. This project measures the seam (P-0015) but mounts nothing on it; #13153 read in full is an unguarded `message.source.kind` in another plugin, not our code. Out-of-seam.

- 10877 | [Bug] agent.inject() accepts malformed messages: one missing `role` permanently breaks the session (422, no recovery)
- 13153 | [Bug] repeat-tool-reminder reads message.source.kind without a guard in agent/pre-step — same crash family as #7363
- 11919 | Treat empty optional delegation selections as omission in the executor tool
- 13449 | Subagent model-selection policy snapshot diverges from the live configuration
- 13450 | subagent_fork cannot specify a model route (context and route are orthogonal)
- 13426 | Parallel dsh sessions on one Git workspace: writer coordination and external subagent visibility
- 11793 | [Bug + tested fix] dsh-superagent-prototype: nested subagents past depth 8 keep their tools
- 12737 | agent-teams: spawn_teammate cannot select a model/provider
- 13461 | [Plugin] OmAgents: 33 skills, background subagents, and a durable Web Job Board
- 12175 | DSH | dsh-kimicode-swarm | Kimi Code 风格的批量并行子 Agent / Kimi-Code-style batch-parallel subagents
- 13751 | Docs proposal: fork / resume / replay semantics of the append-only session log
- 13293 | Subagent model-selection preference only applies to new sessions; resume can never adopt changes

### other (12)

Tool-protocol, gateway and provider-specific reports that do not name a seam this plugin mounts. Recorded by title; no local reproduction, no patch.

- 6783 | Degraded response generation and poor compatibility with Gemini models
- 6725 | 【bug】一次会话中出现两次"卡住"：界面在数分钟内没有任何输出，用户无法区分"在跑"还是"已死"
- 3677 | 调用第三方key存在异常中断问题
- 6580 | deepseek harness一直在输出思考的内容，没有任何工作内容的产出
- 2203 | 无法连接到 z.ai 海外coding plan
- 8501 | 动态插件缺少可在 workspace-write 下合法落盘的「全局设置」通道
- 10531 | Model misreads delivered messages as empty/zero-width-space messages and replies "empty message, maybe a mis-touch"
- 12521 | [Solved] PTC mode fails on the next step after any successful tool call (reading 'length')
- 11345 | Proposal: A Unified Runtime Policy Pipeline for Tool Calls
- 10832 | 一次调用该装几个动作：行为纪律 A/B 实测（PTC step −39.5%）与 pwsh 缺 isConcurrencySafe 的连锁效应 — Measured: how many actions per call, and why native mode stops paying
- 12102 | 感觉dsh写代码 越来越慢了 大家装什么插件 或者是配置什么 能保证速度也能保证质量的呢？
- 12596 | [Bug] dsh web auto-exits with SIGSEGV (signal 11) while idle on 0.2.2-rc.1

### known (7)

Already in `leads.md` or already a patch: #12741 → P-0052, #10115 watching, #12348 → P-0050, #11189 dup of L-0024, #9503/#10406 cross-platform comparators, #13611 dup of P-0034/L-0051. No new lead.

- 9503 | How other agent platforms handle malformed tool-call arguments — and the two layers this repo is missing
- 10406 | [bug] 单条 tool-call 的 arguments 非法即整轮失败（MALFORMED_RESPONSE），建议隔离坏调用或自动重试
- 12741 | Long tool loops can finish a turn with no visible reply
- 11189 | [Withdrawn] Duplicate of #11190 — type:'json' tool params are not parsed to JSON values (see maintained thread)
- 13024 | Desktop host exits with an uncatchable undici assertion when a fetch is aborted (Node 24.21 / Electron 44.7)
- 10115 | Feature request — signal truncated output from workflow / subagent returns
- 12348 | 跨 profile resume 时的 capability drift：想确认设计边界和推荐做法

### streamClosed (5)

STREAM_CLOSED / no-finish / vague transport messages. Local census has no such class (L-0011/L-0045/L-0036), and R50 measured both probe branches. No new patch until the shape appears here.

- 4972 | llm-deepseek: STREAM_CLOSED on providers that send finish_reason but no trailing [DONE] sentinel
- 2374 | [Bug] Configuring third-party OpenAI-compatible gateways: STREAM_CLOSED error message is too vague to root-cause
- 388 | Bugfix: parseSse raises STREAM_CLOSED when a compatible gateway closes right after data: [DONE]
- 8423 | DSH | dsh-reconnect | retry failed model requests with backoff instead of losing the turn
- 12639 | [Idea] Start concurrency-safe tool calls while the response is still streaming

### uiDesktop (5)

Rendering, LiveShare, sidebar/composer and desktop-window issues. Out-of-seam; P-0015/P-0045 already record what a rejected turn looks like in the UI.

- 13397 | [Bug][LiveShare] viewer 点「继续生成」发出的 retry 不计入 viewer turn，续跑那一轮不受共享限制（0.2.2-rc.2 / rc.3）
- 13261 | [Bug] run_code child processes start with an empty process.env on Windows; shell APIs can write %SystemDrive%\ProgramData\... into the cwd
- 13472 | Render per-reply web sources outside tool cards (opt-in, hideable, copy stays clean)
- 12744 | [Bug][Windows][0.2.1-rc.5] Every tool dispatch fails with "Cannot read properties of undefined (reading 'prepare')" — duplicate dsh-tools instances yield unequal Symbol keys
- 12331 | ACP: reopening an agent loses the conversation; tool calls render as "Other"

### adapterMalformed (3)

Malformed arguments / content_filter / signature loss are adapter-side (`dsh-llm-deepseek`, `llm-pi-ai`); the failing bytes never reach `llm/stream` (L-0003/L-0005/L-0046 family). #13637 read in full: the adapter maps `content_filter` to `PI_AI_ERROR`, which P-0034 already names on our side. No new patch.

- 6303 | ld: tapi error: malformed file
- 8997 | Two defects that end agent turns: malformed tool arguments, and unpriced request images
- 13637 | 上游内容审核（content_filter）只显示英文原文且无法继续：建议独立失败码 + 本地化文案 + 继续入口

### plugins (3)

Third-party plugin announcements and market listings. Read as competitor/adjacent design only (L-0037/L-0038 precedent), never copied.

- 12057 | dsh-parallel-tools-prompt：并行工具调度提示插件（多调用轮占比 3.2% → 22.6% 实测）
- 13137 | dsh-native-mode-router —— Autonomous Runtime Engine Switching (Standard, PTC, Team, Minimal) with In-Flight Auto-Wakeup
- 13097 | vmware-console-mcp: VM console + lifecycle control for agents (VMware Player/Workstation + multi-host ESXi, 59 tools)

### performance (2)

Cold starts, git snapshots and memory. R68 measured this wrapper’s own overhead (+1.5 ms / 4 003 text chunks, +5.9 ms / 5 251 tool chunks); these reports concern host code we do not own.

- 13245 | [P0 Performance] `workspace-changes` git snapshot blocks the first tool of every turn for 27–29 s in large repositories (tested on all 4 releases, including 0.2.2-alpha.3)
- 12728 | Simple "did DSH update?" lookup took 9m43s: timeout-promotion UX + missing self-budget signals

## Read in full

- **#13153** — an unguarded `message.source.kind` in `dsh-repeat-tool-reminder`'s `agent/pre-step` listener.
  The plugin fails the whole turn when a pre-step message has no `source`. This project does not mount
  `agent/pre-step` (P-0015 is a measurement of the seam, not a product on it), so the same crash in a
  third-party listener is out of seam. Recorded as L-0052, `rejected (out-of-seam)`.
- **#13336** — clicking Continue after a failed turn writes an empty user message into the session;
  strict OpenAI-compatible gateways then 400 every later request. The defect is in the host's session
  writer and continuation policy, not in the stream bytes this plugin can read. Recorded as L-0053,
  `rejected (out-of-seam)`.
- **#13637** — `content_filter` is mapped by the adapter to `PI_AI_ERROR`, which is neither retryable
  nor continuable. This is L-0046's adapter boundary again; P-0034 already books the same class on our
  side when it reaches `agent/error`. Recorded as L-0054, `rejected (dup)`.

## What was not done

No new patch, no runtime byte, no new version. The census in this intake read 125 files / 407 attempts
with 0 unreadable lines, which is consistent with the R73 reader re-check.
