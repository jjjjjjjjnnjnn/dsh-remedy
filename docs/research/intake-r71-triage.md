# R71 intake triage — 2026-11-18

> 产物：`data/results/intake-2026-11-18T22-20-00.000Z.json`（S-DSH 92 条去重 discussion、
> 68 条新候选、24 条已在账本；S-SELF 4 个 open（全是 bot PR）；S-NPM 上月下载 5 704 / 5 556；
> S-REDDIT 读不到（`ECONNRESET`，记 null）；S-CENSUS 115 文件 / 397 attempts / 47 fusion failures）。
> 判读口径与 R66 相同：**没有本机复现的形状不发补丁**；只有落回四个接缝的候选才逐条下结论。

## 1. 分桶（68 条，按标题）

| 桶 | 条数 | 处理 |
|---|---|---|
| 会话持久化 / resume / 打开历史会话 | 18 | out-of-seam（`dsh-session-*`、UI 投影缓存）；不碰 |
| UI / 渲染 / 前端交互 | 12 | out-of-seam |
| 性能 / 冷启动 / 大仓库 | 9 | out-of-seam |
| 市场 / 插件 / 配置（profile 层） | 7 | `profile` 接缝只实测未挂载；其中 #12348 已在 P-0050/P-0051 |
| 模型接入 / 网关 / adapter（含 STREAM_CLOSED 家族） | 10 | out-of-seam（失败字节到不了本接缝），读了两条，见 §2 |
| 工具调用 / 流 / 空身份 | 8 | **本接缝**；读全文两条，本地复现一条 |
| 子 agent / 工作流 / 并发 | 4 | out-of-seam |

## 2. 读全文的三条

### #11151 / #10732 — 空 tool identity 让 V4 会话写入失败（同一形状，两条报告）

报告给出完整链条：网关在 reasoning 里误判 DSML 标记 → `tool_use` 的 `id` 与 `name` 都是空串 →
`llm-pi-ai` 原样透传 → `tool/call` 的 `callId` 为空 → `tool/result` 写入被
`assertV4ToolResultMessage` 拒绝（`format v4 tool/result at seq N requires toolCallId matching its
tool source`），turn 无 `turn/end` 直接终止；同一份日志里「占位名 + 非空 id」不崩，是干净的对照。

**本机复现（R71）**：邻居插件在真 turn 里递一个 `id="" name=""` 的 `block-end`：

| arm | 结果 |
|---|---|
| control（无插件） | `dsh: format v4 tool/result at seq 19 requires toolCallId matching its tool source`，退出 1，无 `turn/end` —— 与报告逐字一致 |
| 0.4.9 | turn `completed`，调用以 `remedy_unattributed` 发出、宿主回 `UNKNOWN_TOOL` |
| 本树（0.4.19） | 同上，`refused: 2`（空 id + 缺名字各记一次） |

结论：**这条报告的形状已经被 P-0033（铸 id，空身份不落盘）与 P-0027（无名字用兜底名）覆盖**，
判 `patched`。报告自己的修复方案（在 `llm-pi-ai` 的 `toolcall_end` 补一道空身份校验）属于 adapter，
out-of-seam，本项目不改；ADR 0002 的「不替邻居造结局」也适用于这里——我们只保证不把空身份写进会话。
证据：`data/results/live-identity-2026-11-18T22-40-00.000Z.json`。

### #13611 — `stopReason()` 拒绝 `refusal`

标题即结论：适配器把合法 stop reason 当未知、抛 `MALFORMED_RESPONSE`，turn 结束且无法继续。
这正是 P-0034 命名的那一类（本机 47 个 `MALFORMED_RESPONSE`、37 个 `UNSUPPORTED_REASONING_EFFORT`），
而 `stopReason()` 本身在 adapter，out-of-seam。判 `rejected (dup)`——不重复入场。

## 3. 明确不碰的（本机没有形状或不在接缝上）

- **STREAM_CLOSED 家族**（#4972 / #388 / #2374）：都在 `parseSse` / 网关侧；本机 census 仍是 0 个
  `STREAM_CLOSED`，按 L-0011 的规则不改词表、不加计数。
- **#13336**「Continue 之后写入空 user message → 会话永久 400」：会话写入 / UI 半，out-of-seam。
- **#12829**「session write handle 泄漏挡住 resume」：`dsh-session-persistence` 的句柄生命周期，out-of-seam。
- **#13153**「`repeat-tool-reminder` 在 `agent/pre-step` 读 `message.source.kind` 没判空」：守着
  `agent/pre-step` 会替别人兜住自己的崩溃，违反 ADR 0002；记下不碰。
- **#10115**（截断输出的信号）：本机仍无形状，与 R66 的结论一致。
- **#12741 / #12348**：已分别由 P-0052 与 P-0050/P-0051 覆盖（前者 R71 的 census 里 0 例）。

## 4. 这一轮的 intake 结论

68 条候选里，**1 个形状在本机复现并被现有补丁覆盖**（#11151/#10732 → P-0033 + P-0027），
1 条判 dup（#13611 → P-0034），其余按上表归桶。**没有需要新补丁的形状**，所以这一轮不发补丁、
不花运行时字节；台账只加三条线索行与一个证据路径。
