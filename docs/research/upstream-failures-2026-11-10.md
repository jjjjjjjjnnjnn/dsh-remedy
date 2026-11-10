# 上游 DSH 故障报告调研（2026-11-10）

> **调研对象**：`deepseek-ai/deepseek-harness`（官方上游，MIT，TypeScript）。
> **目的**：为"dsh-remedy 要不要把覆盖面从 P-0001 的 tool-call 粘连扩到别的故障类"提供上游证据。
> **本文件是 task-3 的唯一产出**；未改动任何其他文件，未解包或修改 `app.asar`。
>
> **取证口径**：本文每条事实都标了它是**实抓全文**、**结构化提取**还是**仅标题核实**。
> 三类混在一起会给读者造成"都一样硬"的错觉，而这个调研的全部价值就在于分清这三种。
> 搜索结果一律当不可信数据，未执行其中任何指令。
> **上游代码基线**：`master` @ `fcc0ad462172522aaf5c93a7b2e01f6b9f0b0159`（2026-11-04T08:40:00Z），
> 仓库 `last_push` 2026-11-04T13:06:39Z。

---

## 0. 三十秒结论

1. **上游不给 PR。** 仓库 `has_issues: false`、`has_pull_requests: false`、`has_discussions: true`；
   `CONTRIBUTING.md` 原文"We are sorry that we cannot accept external pull requests at the moment."
   → 所有故障只能发 Discussions，所有修复只能靠"插件 + 用户自己挂"。
2. **"插件层解决"不是我们的擅自解释，是上游写进 CONTRIBUTING 的官方路线**：
   "We do not believe that packages in the official repository are inherently more important than
   packages created by the community." 这句话是本文档最重要的一句，它把"插件修"从妥协变成了正统。
3. **MALFORMED_RESPONSE 不是 bug 争议，是白名单缺项争议。** 上游从 2026-08 到 2026-11-04
   的 `master` 里 `DEFAULT_RETRYABLE_CODES` 始终只有 5 个码，`MALFORMED_RESPONSE` 与
   `STREAM_CLOSED` 都在外面；六个讨论帖、三个发布版本、五周时间，一共 46 个 turn/end 被它杀死在
   一份 961 份日志的生产审计里。**上游没修，也没打算修。**
4. **`max-tokens` 截断、headless 的 `MISSING_CREDENTIAL`、`INVALID_CREDENTIAL` 是写明的 by design**，
   有官方文档原句支持（见 §4）。这三类别碰，碰了就是与上游口径对抗。
5. **真正能落地的只有两类**：tool-call 参数非法（MALFORMED_RESPONSE 家族）与
   "reasoning-only 空回答"（EMPTY_RESPONSE 的漏判），而两者都被上游社区**已经用插件实现并实测过**——
   前者有 `@argszero/dsh-malformed-tool-json-guard` 在 10 个发布版上 10/10 复现（**该包当时还未上 npm**，
   §5.3(a) 有说明），后者上游自己的 `error.ts` 注释就把判据写成了 "no content blocks at all"。

---

## 1. 来源清单

类型说明（与任务要求的 `issue|discussion|release-note|forum|blog` 对照）：
`discussion` = GitHub Discussions 帖（**上游唯一故障渠道**，本表 22 条）；
`release` = Release Notes（对应 `release-note`，本表 2 条）；
`src` / `doc` / `meta` / `npm` = 一手代码、一手文档、仓库元数据、npm 发布产物——这四类不是"故障报告"，
而是**裁决证据**（用来判定"上游是没看到还是不改"），本表 17 条（S01–S17）。
**`issue` 类为 0 条**，不是遗漏：仓库元数据 `has_issues: false`（S01），上游根本没有 issue 通道。
`forum` / `blog` 类为 0 条：上游没有官方论坛，也没有官方博客；社区博客未纳入本次取证范围（见 §8）。
`npm` 与 `master` 有版本差，见 §7。

| # | 来源 | 类型 | 日期 | 可访问性 / 核实程度 |
|---|---|---|---|---|
| S01 | [repo: deepseek-ai/deepseek-harness](https://github.com/deepseek-ai/deepseek-harness) | meta | — | 实抓 API：`has_issues:false` / `has_pull_requests:false` / `has_discussions:true` / `open_issues:0` |
| S02 | [CONTRIBUTING.md](https://github.com/deepseek-ai/deepseek-harness/blob/master/CONTRIBUTING.md) | doc | master | 实抓全文，含"cannot accept external pull requests"与插件鼓励段 |
| S03 | [llm/README.md](https://github.com/deepseek-ai/deepseek-harness/blob/master/packages/llm/llm/README.md) | doc | master | 实抓全文，21 046 B；含重试归属与 IMAGE_OFFLOAD_REQUIRED 口径 |
| S04 | [llm-retry/README.md](https://github.com/deepseek-ai/deepseek-harness/blob/master/packages/llm/llm-retry/README.md) | doc | master | 实抓全文，10 140 B；含默认五码与"out of eligible set → delegates" |
| S05 | [llm-deepseek/README.md](https://github.com/deepseek-ai/deepseek-harness/blob/master/packages/llm/llm-deepseek/README.md) | doc | master | 实抓全文，29 077 B；SSE 失败码映射表 |
| S06 | [llm-pi-ai/README.md](https://github.com/deepseek-ai/deepseek-harness/blob/master/packages/llm/llm-pi-ai/README.md) | doc | master | 实抓全文，35 518 B；含 MALFORMED_RESPONSE "before tool dispatch" |
| S07 | [compaction-image-offload/README.md](https://github.com/deepseek-ai/deepseek-harness/blob/master/packages/compaction/compaction-image-offload/README.md) | doc | master | 实抓全文，6 868 B；含 `next()`/delegate 契约 |
| S08 | [bundle/headless/README.md](https://github.com/deepseek-ai/deepseek-harness/blob/master/packages/bundle/headless/README.md) | doc | master | 实抓全文，22 046 B；凭据默认禁用 + 三行恢复 patch |
| S09 | [docs/subsystems/llm-streaming.md](https://github.com/deepseek-ai/deepseek-harness/blob/master/docs/subsystems/llm-streaming.md) | doc | master | 实抓全文，73 296 B；`max-tokens` 丢弃 tool call 的唯一权威表述 |
| S10 | [docs/agent-lifecycle.md](https://github.com/deepseek-ai/deepseek-harness/blob/master/docs/agent-lifecycle.md) | doc | master | 实抓；`agent/request-error` 契约与 empty content 处置 |
| S11 | [docs/capability-seams.md](https://github.com/deepseek-ai/deepseek-harness/blob/master/docs/capability-seams.md) | doc | master | 实抓，71 028 B；`ctx.llm` 接缝登记 |
| S12 | [docs/config-catalog.md](https://github.com/deepseek-ai/deepseek-harness/blob/master/docs/config-catalog.md) | doc | master | 实抓，244 648 B；`maxRequestImageBytes` / `retryPolicy` / `maxTokensAsSuccess` JSDoc |
| S13 | [llm/src/retry-policy.ts](https://github.com/deepseek-ai/deepseek-harness/blob/master/packages/llm/llm/src/retry-policy.ts) | src | master | 实抓全文；`DEFAULT_RETRYABLE_CODES` 五码，`DEFAULT_MAX_RETRIES = 5` |
| S14 | [llm-deepseek/src/translate.ts](https://github.com/deepseek-ai/deepseek-harness/blob/master/packages/llm/llm-deepseek/src/translate.ts) | src | master | 实抓全文；`malformed()`、message_stop 校验、STREAM_CLOSED |
| S15 | [llm-pi-ai/src/stream.ts](https://github.com/deepseek-ai/deepseek-harness/blob/master/packages/llm/llm-pi-ai/src/stream.ts) | src | master | 实抓全文，11 336 B；`content.length === 0` 判空与 `argumentsError` |
| S16 | [@deepseek-ai/dsh-llm@0.0.1-rc.1 `lib/types/error.js`](https://unpkg.com/@deepseek-ai/dsh-llm@0.0.1-rc.1/lib/types/error.js)（[包页](https://www.npmjs.com/package/@deepseek-ai/dsh-llm/v/0.0.1-rc.1)） | npm | 发布版 | 实抓全文 7 888 B；EMPTY_RESPONSE / INVALID_CREDENTIAL 的 JSDoc 定义 |
| S17 | [@deepseek-ai/dsh-llm@0.0.1-rc.1 `lib/types/retry-policy.js`](https://unpkg.com/@deepseek-ai/dsh-llm@0.0.1-rc.1/lib/types/retry-policy.js)（[包页](https://www.npmjs.com/package/@deepseek-ai/dsh-llm/v/0.0.1-rc.1)） | npm | 发布版 | 实抓全文；`DEFAULT_MAX_RETRIES = 2`（与 master 的 5 不一致） |
| S18 | [release dsh-v0.2.2-rc.1](https://github.com/deepseek-ai/deepseek-harness/releases/tag/dsh-v0.2.2-rc.1) | release | 2026-11-04 | 实抓 API body；含 pi-ai 1.3.0 的 malformed 行为条目 |
| S19 | [release dsh-v0.2.2-alpha.2](https://github.com/deepseek-ai/deepseek-harness/releases/tag/dsh-v0.2.2-alpha.2) | release | 2026-10-28 | 实抓 API body；同一条目重复出现 |
| D01 | [#7705](https://github.com/deepseek-ai/deepseek-harness/discussions/7705) | discussion | 2026-09-24 | **实抓全文**；作者结论"是 billion-context 插件问题" |
| D02 | [#8920](https://github.com/deepseek-ai/deepseek-harness/discussions/8920) | discussion | — | **仅标题核实**（HTTP 200 + title）；正文未抓 |
| D03 | [#8976](https://github.com/deepseek-ai/deepseek-harness/discussions/8976) | discussion | 2026-10-06 | **实抓全文**；961 份日志 / 46 turn 的生产审计 |
| D04 | [#9037](https://github.com/deepseek-ai/deepseek-harness/discussions/9037) | discussion | — | **仅标题核实**（HTTP 200 + title）；正文未抓 |
| D05 | [#9402](https://github.com/deepseek-ai/deepseek-harness/discussions/9402) | discussion | 2026-10-11 | **结构化提取**（非逐字）；标题已核实为中文同题帖 |
| D06 | [#9503](https://github.com/deepseek-ai/deepseek-harness/discussions/9503) | discussion | 2026-10 | **结构化提取**（非逐字）；跨平台对比与"缺两层" |
| D07 | [#9981](https://github.com/deepseek-ai/deepseek-harness/discussions/9981) | discussion | 2026-10-17 | **结构化提取**（非逐字）；>8 图 400 楔死会话 |
| D08 | [#10195](https://github.com/deepseek-ai/deepseek-harness/discussions/10195) | discussion | 2026-10-18 | **实抓全文**；argszero 的插件 + 10/10 实测 |
| D09 | [#10406](https://github.com/deepseek-ai/deepseek-harness/discussions/10406) | discussion | 2026-10-20 | **实抓全文**；一条坏调用作废整轮（含已执行的那条） |
| D10 | [#10714](https://github.com/deepseek-ai/deepseek-harness/discussions/10714) | discussion | 2026-10-22 | **结构化提取**（非逐字） |
| D11 | [#11051](https://github.com/deepseek-ai/deepseek-harness/discussions/11051) | discussion | 2026-10-26 | **实抓全文**；含官方口径回答"Not a regression, it's a documented change" |
| D12 | [#11055](https://github.com/deepseek-ai/deepseek-harness/discussions/11055) | discussion | 2026-10-26 | **实抓全文**；retry 插件违约截走 IMAGE_OFFLOAD_REQUIRED |
| D13 | [#11258](https://github.com/deepseek-ai/deepseek-harness/discussions/11258) | discussion | 2026-10-28 | **实抓全文**；timeout 只通知不执行 |
| D14 | [#11298](https://github.com/deepseek-ai/deepseek-harness/discussions/11298) | discussion | 2026-10-28 | **实抓全文**；max-tokens 静默截断 |
| D15 | [#11577](https://github.com/deepseek-ai/deepseek-harness/discussions/11577) | discussion | 2026-10-30 | **实抓全文**；rc.5 汇总帖 + 行号 + 对照实验 |
| D16 | [#11843](https://github.com/deepseek-ai/deepseek-harness/discussions/11843) | discussion | 2026-11-02 | **结构化提取**（非逐字）；标题已核实 |
| D17 | [#12308](https://github.com/deepseek-ai/deepseek-harness/discussions/12308) | discussion | 2026-11-05 | **实抓全文**；reasoning-only 击败 EMPTY_RESPONSE 判空 |
| D18 | [#12673](https://github.com/deepseek-ai/deepseek-harness/discussions/12673) | discussion | 2026-11-08 | **结构化提取**（非逐字）；标题已核实 |
| D19 | [#12819](https://github.com/deepseek-ai/deepseek-harness/discussions/12819) | discussion | 2026-11 初 | **仅标题核实**（HTTP 200 + title）；正文未抓 |
| D20 | [#2410](https://github.com/deepseek-ai/deepseek-harness/discussions/2410) | discussion | 2026-08-16 | **结构化提取**（非逐字）；max-tokens 破坏 pi-ai replay |
| D21 | [#3685](https://github.com/deepseek-ai/deepseek-harness/discussions/3685) | discussion | 2026-08-20 | **实抓全文**；`stopReason: length` 是 by-design turn-end |
| D22 | [#8947](https://github.com/deepseek-ai/deepseek-harness/discussions/8947) | discussion | 2026-10-05 | **实抓全文**；undici 300 s bodyTimeout 冒充 TRANSPORT |

合计 **41 条来源**（S01–S19 共 19 条一手，D01–D22 共 22 条讨论帖）。其中：

- **一手全文/整份产物**：S01–S19 全部（其中 S01 是 API 元数据、S18/S19 是 release body 全文，其余是文件全文或整份 npm 产物）；
  D01、D03、D08、D09、D11、D12、D13、D14、D15、D17、D21、D22（12 条）。
- **结构化提取（可能非逐字）**：D05、D06、D07、D10、D16、D18、D20（7 条）。
  本文件**不逐字引用**它们的句子；它们只用于"这一故障类还存在别的报告"与标题级旁证，
  被它们支撑的主张在 §8 逐条列了置信度（`[提取]` 只出现在 §8 与本节，正文引证一律来自一手来源）。
- **仅标题核实**：D02、D04、D19（3 条）。本文件**不引用其正文**，只把标题作为"同类故障还存在别的报告"的旁证。

访问性说明：`app.asar` 单文件 213 MB、无 `app.asar.d`、无 `dsh` 子路径；`resources/runtime/primary-runtime/dependencies`
只有 node/pnpm/python，无 `@deepseek-ai/dsh-llm`。→ 本机安装包**读不到 LLM 层源码**，
全部代码引证改由 GitHub raw（master）与 npm registry（发布版）两路取得，均成功。
`docs` 站 `https://deepseek-harness.github.io/deepseek-harness/` 是 JS 渲染，
`read_page` 拿不到正文（返回 "Very little text came back"）→ **本文不引用 docs 站任一页面**。

---

## 2. 故障类表

列义：**签名** = 错误码或原文报错串；**上游是否已修** = 截至 `master` @ `fcc0ad4`（2026-11-04）；
**我们是否可复现** = 本机证据（`docs/research/failure-map-2026-11-10.md`）+ 上游离线复现手段。

| # | 签名 | 触发场景 | 上游已修？ | 上游修法（一句话 + 文件/PR） | 我们能复现？ |
|---|---|---|---|---|---|
| 1 | `MALFORMED_RESPONSE` + `DeepSeek Messages stream: tool input is invalid JSON` | message_stop 时任一 tool-call 的 `arguments` 不是合法 JSON（缺 `}`、多 `}`、裸 `"`、截断） | **未修** | 无 PR（不接受外部 PR）；`master` 的 `DEFAULT_RETRYABLE_CODES` 仍五码，`translate.ts` 仍在 message_stop 硬抛 | **能**：本机 40 条（37 条 `proven-2-objects` + 3 条不可修）；离线可用 mock SSE 6/6（D15 cloveric 的 `repro.mjs`） |
| 2 | `MALFORMED_RESPONSE`（pi-ai 路径）：`Tool call "X": Expected ',' or '}' after property value in JSON at position N` | pi-ai 报"completed arguments 非法"，`argumentsError` 在 `done` 事件抛出 | **未修**（但失败点提前了） | `llm-pi-ai/src/stream.ts:217-219`：`if (argumentsError !== undefined && event.message.stopReason !== 'length') throw new LlmError(argumentsError, 'MALFORMED_RESPONSE')`；README 明说 "before tool dispatch"；`release dsh-v0.2.2-rc.1` 的条目只说"fail before any tool executes"，**没说不再失败** | **形态能**：本机 3 条不可修非法（`cut-inside-object` 2 + `other` 1，均 `repairable: false`）属同一语法形态，但本机产物未按路由（deepseek / pi-ai）拆分，故不能断言这 3 条走的是 pi-ai；pi-ai 路径的直证来自 D15 Roshenn（裸 `"`，第 480 字符） |
| 3 | tool-call 粘连家族：`Unexpected non-whitespace character after JSON at position 394` / `Unterminated string in JSON at position 671` / `Unexpected token ':'` / `Expected ',' or '}' ...` | 长 CJK 参数、多对象串联、流式片段拼串 | **未修** | 同上；`docs/subsystems/llm-streaming.md` 只说"截断的 tool JSON 保留在流里，交给共享装配器剪枝"——**只覆盖 max-tokens**，不覆盖"非截断但语法坏" | **能**：本机 37 条 `trailing-objects(fusion)` 被标 `repairable: true`（另 1 条 `Unexpected token ':'` 型 `other` 不可修）；D15 三次复现同一形态 |
| 4 | `EMPTY_RESPONSE` | 正常 `stop` 但**零内容块**（degenerate completion） | **部分修 / 部分未修** | `translate.ts:148-149`（`blocks.size === 0`）与 `pi-ai/src/stream.ts:99`（`message.content.length === 0`）**仍按块数判空** → reasoning-only 仍漏判（D17/D18 未采纳） | **部分**：本机 2 次、均自愈；reasoning-only 形态本机未观测到，只能靠 D17 的构造 |
| 5 | `SERVER`（502/`Service is too busy`） | 上游网关过载 | **设计内自动重试，不算缺陷** | `DEFAULT_RETRYABLE_CODES` 含 `SERVER`；`llm-deepseek` README：非 2xx → `SERVER` | **能**：本机 147 次失败 attempt / 93 group，84 group 自愈 |
| 6 | `TRANSPORT`（`DeepSeek Messages transport failed`） | 连接中断、socket destroy、**以及被 undici 300 s 超时冒充的挂死** | **未修**（伪装问题未修） | D22 指出适配器裸 `fetch()` 走进程级 undici dispatcher，`bodyTimeout` 默认 300 s 先于 `streamIdleTimeoutMs` 触发，落进 catch-all 的 `TRANSPORT` | **能**（逻辑可复现）：本机 10 次 / 10 group，6 自愈；D22 用 loopback SSE 做了确定性矩阵 |
| 7 | `TIMEOUT`（`DeepSeek Messages stream idle timeout`） | 流空闲超过 `streamIdleTimeoutMs`（默认 300 000 ms） | **未修**（D22：>300 000 是"惰性旋钮"） | `llm-deepseek/README.md:122`：`stream-idle expiry throws TIMEOUT`；但 undici 300 s 先到 → 实际报成 `TRANSPORT` | **能**：本机 1 次；D22 的 watchdog-first 子例 4 020 ms 报 TIMEOUT |
| 8 | `MISSING_CREDENTIAL`（`dsh: MISSING_CREDENTIAL: llm-pi-ai: no credential for provider route "X"`） | headless profile 默认禁用凭据存储；或引用解析不到 | **by design / documented，不修** | `bundle/headless/README.md`：默认关 `credentials`/`authorization`/`deepseek-account`，给三行恢复 patch；D11 答"Not a regression, it's a documented change since 0.2.1-alpha.3" | **能**：本机 1 次（与项目 HANDOFF 已知坑一致） |
| 9 | `IMAGE_OFFLOAD_REQUIRED`（`...exceed the 20971520-byte base64 bound; 4 more oldest occurrence(s) must be offloaded.`） | 保留图像超出 `maxRequestImages` / `maxRequestImageBytes` | **by design 的控制信号，不修** | `llm/README.md` + `compaction-image-offload/README.md`：设计内的控制错误，正确消费者是内置 image-offload 插件，记 `image/offload` 后重试；违规者是第三方 retry 插件（D12） | **能**：本机 2 次、均自愈；D12 用 `retryUnknown: false` 绕行后 25.1 MiB → 678 KiB |
| 10 | `max-tokens` 截断（`finish: {kind:'max-tokens'}` / pi-ai `stopReason: 'length'`） | 输出触顶 | **by design，明确不修** | `llm-streaming.md:368`：`max-tokens` finish "drops every tool call because a truncated call is unsafe to execute"；`config-catalog` 的 `maxTokensAsSuccess` 甚至允许把它报成成功 | **能**：本机 14 次 / 14 group / 0 自愈 |
| 11 | `STREAM_CLOSED` | SSE 在 `message_stop` 之前结束 | **未修** | `translate.ts` 末尾 `throw new LlmError('DeepSeek Messages stream ended before message_stop', 'STREAM_CLOSED')`；**不在**默认重试码里（D03 已点名，D15 cloveric 说可能被 `transport-recovery.spec.ts:178` 钉死，未核实） | **可疑但未证**：本机 0 次；`dsh-llm-pi-ai/lib/index.js:1601` 同码（D03 评论转述） |

**必需覆盖核对**：任务点名的 9 个（MALFORMED_RESPONSE / EMPTY_RESPONSE / SERVER / TRANSPORT / TIMEOUT /
MISSING_CREDENTIAL / IMAGE_OFFLOAD_REQUIRED / max-tokens 截断 / tool-call 粘连家族）全部在表内（#1、#3、#4–#7、#8、#9、#10）。
表额外收了 **`STREAM_CLOSED`（#11）** 与 **pi-ai 路径的 MALFORMED 变体（#2）**，因为前者与 MALFORMED 同属
"缺白名单"家族、后者是同一签名的另一条代码路径——不列会让"上游说这是同一个缺陷"这句话失去依据。

---

## 3. 上游到底有没有认这个缺陷

这一节回答一个容易含糊的问题：**上游是"没看到"还是"看到了但不改"**。答案是后者，而且有行号级证据。

### 3.1 白名单的五码，从 2026-08 到 11-04 没动过

`packages/llm/llm/src/retry-policy.ts`（master，实抓）：

```ts
const DEFAULT_RETRYABLE_CODES = Object.freeze([
  EMPTY_RESPONSE_CODE, 'RATE_LIMIT', 'SERVER', 'TIMEOUT', 'TRANSPORT',
] as const)
```

`packages/llm/llm-retry/README.md`（master，实抓原文）：

> "Omission of `retryPolicy` uses normal mode: five retries for `EMPTY_RESPONSE`, `RATE_LIMIT`,
> `SERVER`, `TIMEOUT`, and `TRANSPORT`, with bounded exponential backoff from 500 ms to 10 seconds
> and 10 percent jitter."

`docs/subsystems/llm-streaming.md`（73 296 B）**全文没出现过** `MALFORMED_RESPONSE`、`EMPTY_RESPONSE`、
`STREAM_CLOSED`、`IMAGE_OFFLOAD_REQUIRED` 任一字符串（grep 零命中）。这些码的权威定义只存在于
`@deepseek-ai/dsh-llm` 的 `src/error.ts` 注释与各包 README 里 —— 这本身就是一个文档缺口：
**上游把最重要的失败语义放在了包 README 和代码注释里，而子系统文档没写。**

### 3.2 上游自己承认的不对称

`packages/llm/llm-deepseek/src/translate.ts` 的 message_stop 分支（master，实抓），注释与代码连着读：

```ts
if (blocks.size === 0 && reason.kind === 'stop')
  throw new LlmError('DeepSeek Messages returned no content', 'EMPTY_RESPONSE')
// Truncated tool JSON is retained in the stream, then pruned by the shared assembler.
if (reason.kind !== 'max-tokens') {
  for (const { content } of blocks.values()) {
    if (content.type !== 'tool-call') continue
    let parsed: unknown
    try { parsed = JSON.parse(content.arguments) }
    catch (_invalidProviderToolJson) { return malformed('tool input is invalid JSON') }
    object(parsed)
  }
}
```

读法：**空回答要重试（`EMPTY_RESPONSE` 在五码里），但"携带了一个解析不出来的请求"一次就放弃。**
D08（`#10195`）里 argszero 把这句写成原文："That asymmetry is the bug, and it is worth fixing here
regardless of what the plugin below does."；D09（`#10406`）的 PerryLink 走的是同一条推理。
两个不同帖子的不同作者独立得出同一结论，而**上游代码本身用 `_invalidProviderToolJson` 这个形参名
证明了它是预料到这种输入的**（D09 PerryLink 观察），只是选了整轮失败。

### 3.3 六帖、五周、三个版本

D15 的 TL;DR 原文（实抓）：

> "one malformed tool_use arguments string still aborts the entire turn with MALFORMED_RESPONSE and no
> retry, because MALFORMED_RESPONSE is still missing from DEFAULT_RETRYABLE_CODES. This is the same defect
> as #7705 (2026-09-24), #8920, #8976, #9402, #9503 and #10406 — five weeks, six threads and three
> released versions later..."

D03 的生产审计数字（961 份压缩会话日志、dsh 0.2.0-rc.2、provider `deepseek-account`、macOS）：
**43 个会话含该错、220 次 `tool input is invalid JSON`、46 个 turn/end 被它杀死、0 条 `llm/retry` 事件。**
"0 条 `llm/retry`"是整份报告里最有说服力的一个数字：不是重试失败，是**重试器从来不知道有这件事**。

D15 的对照实验把这一点做成了干净的单因子对比：同一会话同一日，连续 5 次 `Service is too busy`（SERVER）
被 `dsh-llm-retry` 自动重试并恢复（5 条 `llm/retry`），两次参数错误前后 **0 条** `llm/retry`
→ 结论"重试器没坏，是错误码不在白名单"。

`master` @ 2026-11-04 仍是五码 → **不是没修完，是没开始修。**
`release dsh-v0.2.2-rc.1`（S18，实抓 body）唯一相关条目是 pi-ai 1.3.0：
> "malformed completed tool arguments fail the response before any tool executes."

注意这句话的落点：它把失败**提前到工具派发之前**（这确实改善了副作用安全），
但**没有**让它可重试。上游在这一版里做的是"更早地失败"，不是"不再失败"。

---

## 4. 上游明确裁决为 wontfix / by design 的（我们绝不修）

这一节是本文最该被 lead 直接采用的部分：**这五条不是"暂时没修"，是写进文档的设计决定。**
把它们当 bug 修，等于与上游口径对着干，而且大概率被上游在下一版改回来。

### 4.1 `max-tokens` 截断：明确丢弃 tool call，明确当作正常结束

**一手原文**（`docs/subsystems/llm-streaming.md:368`，实抓）：

> "One keep/drop decision covers content and metadata together: a `max-tokens` finish drops every tool call
> because **a truncated call is unsafe to execute**, and the same decision prunes the replay envelope's
> per-block entry at each dropped position. `blocks()` and `replayState` therefore cannot disagree, whatever
> assembly removes."

第二处一手原文（`docs/config-catalog.md`，`dsh-sdk-jsonrpc-server` 的配置项）：

> `maxTokensAsSuccess?: boolean` — "Report max-token turn/subagent termination as a successful SDK result."

也就是说上游连"把截断报成成功"都做成了可选配置。第三处（D21，实抓）是社区侧的裁决句：

> "The silent no-op is by-design turn-end, but invisible"

并且 `stopReason: length` 是 **sticky** 的（`agent.ts:285-290, :410` 的转述）：一旦某步触顶，
回合结束，后续步骤保持 max-tokens。D21 的作者提出的小改进**只是"给用户一个提示"**，不是改变行为。

**对我们的意义**：与项目 HANDOFF「截断与粘连不同 | `finish{kind:'max-tokens'}` 一律不修」完全一致。
P-0002 若打算碰 max-tokens 分支，必须停手——那是上游明写的安全和正确性决定，不是遗漏。

### 4.2 headless 的 `MISSING_CREDENTIAL`：documented change

**一手原文**（`packages/bundle/headless/README.md`，实抓）：

> "The shipped headless profile disables the managed credential store and its authorization and DeepSeek
> account consumers. API-key routes use the launch environment, then `<invocation cwd>/.env`, then
> `$DSH_HOME/.env`. Keys and sign-ins saved by the GUI are ignored without changing their file."

官方同时给了三行恢复 patch：

```yaml
- id: credentials
  disabled: false
- id: authorization
  disabled: false
- id: deepseek-account
  disabled: false
```

社区侧对应（D11，实抓，回答者 ChangkeunJ）：

> "Not a regression, it's a documented change since 0.2.1-alpha.3. The shipped headless profile disables
> the credentials, authorization and deepseek-account services in its cordis.patch.yml, so llm-pi-ai never
> gets a store and only checks the launch environment: process env, then /.env, then ~/.dsh/.env."

**对我们的意义**：HANDOFF 已知坑里那条"headless credentials 默认 disabled → MISSING_CREDENTIAL"是
**配置事实，不是流上的缺陷**。插件层不该拦这条错误——它既不可重试，也不该被"修好"。

### 4.3 `INVALID_CREDENTIAL`：写明了"故意不在默认可重试集合里"

**一手原文**（`@deepseek-ai/dsh-llm@0.0.1-rc.1/lib/types/error.js` 的 JSDoc，实抓）：

> "Canonical provider-neutral code for a credential that was supplied but cannot be used — malformed rather
> than absent. Distinct from `MISSING_CREDENTIAL` because the fix differs: correct the stored value rather
> than supply one. **Deliberately outside the default retryable set** — a malformed credential fails
> identically on every attempt."

这是本文里**最强的一条 by-design 引证**：上游用的词是 "Deliberately"。
它同时给了我们判据模板：**"每次尝试都会一模一样地失败" ⇒ 不该重试。**

### 4.4 `IMAGE_OFFLOAD_REQUIRED`：设计内的控制信号，不是错误

**一手原文**（`packages/llm/llm/README.md`，实抓）：

> "An image-capable route whose retained occurrences exceed its `LlmImageRequestBudget` at their exact bytes
> fails with `IMAGE_OFFLOAD_REQUIRED` naming the additional oldest occurrences (`requiredImageOffload()`),
> never with an unlogged projection; `dsh-compaction-image-offload` logs the selected occurrences in one
> `image/offload` event and retries."

`compaction-image-offload/README.md`（实抓）把契约写到了实现级：

> "The plugin acts only on `IMAGE_OFFLOAD_REQUIRED` failures that carry `offloadImages`. ... When nothing
> remains to offload it delegates on the `agent/request-error` waterfall, so downstream recovery or the
> ordinary turn error applies. The retry spends no provider retry budget and logs no `llm/retry` event."

**对我们的意义**（这条最重要）：这是一个**上游自己示范了"插件层正确姿势"的样本**——
把结构化控制码交给内置插件消费、消费不了才 `next()` 交给下游。D12 记录的失败模式正是有人违反了这个契约
（第三方 retry 插件抢在 `agent/request-error` 截走，把它当未知错误重试，耗尽预算）；
`retryUnknown: false` 后立刻出现 1 条 `image/offload`、回合完成、出站请求 25.1 MiB → 678 KiB。
**任何 dsh-remedy 的 retry 逻辑都必须先过这一关：不能把控制码当未知错误重试。**

### 4.5 `SERVER` / `TRANSPORT` / `TIMEOUT`：上游已在做，我们再加一层是重复

三条都在 `DEFAULT_RETRYABLE_CODES` 里，`maxRetries = 5`、退避 500 ms → 10 s、10% 抖动。
本机数据（`docs/research/failure-map-2026-11-10.md`）：SERVER 147 次失败 attempt 落在 93 个 group，
**84 个 group 自愈**；TRANSPORT 10 次 / 10 group、6 自愈；TIMEOUT 1 次；EMPTY_RESPONSE 2 次、全自愈；
IMAGE_OFFLOAD_REQUIRED 2 次、全自愈。

→ **自愈率已经很高**，插件层在这一层再加 retry 只是把同一件事做两遍，还会与上游争抢 `agent/request-error` 的
waterfall 位置（D12 就是这么坏的）。D13 的 argszero 对此有一句自评："this is a mitigation, not your fix"。

### 4.6 一条诚实附注：`TIMEOUT` 的 by-design 边界并不干净

D22（实抓）证明 `streamIdleTimeoutMs > 300000` 是"惰性旋钮"：

> "So a timeout is reported as a transport failure, and streamIdleTimeoutMs > 300000 is an inert knob."

原因是适配器发裸 `fetch()`，走进程级 undici dispatcher（`installProxyFromEnvironment()` →
`createPolicyDispatcher()`），undici 默认 `bodyTimeout = headersTimeout = 300_000`，
在 `streamIdleTimeoutMs` 之前就触发，`error` 落进 catch-all 变成 `TRANSPORT`。
**这不是设计决定，这是实现泄漏。** 但它落在适配器/传输层（`dsh-llm-deepseek` 的 fetch 装配），
不在 `llm/stream` 的 chunk 接缝上 → **不是 dsh-remedy 能改的接缝**，只能进"上游修"清单。

---

## 5. 上游赞成（甚至示范）在插件层解决的（这是我们该做的）

### 5.1 官方路线：不接受 PR，鼓励插件

`CONTRIBUTING.md`（master，实抓原文）：

> "We are sorry that we cannot accept external pull requests at the moment."

> "We do not believe that packages in the official repository are inherently more important than packages
> created by the community. You may consider this repository an idea, an official showcase, and a source of
> inspiration, but not a mandate from us."

仓库元数据佐证（S01）：`has_issues: false`、`has_pull_requests: false`、`has_discussions: true`、`open_issues: 0`。
D13 的 argszero 也把这条当既定事实写进回复："issues and pull requests are disabled on this repository,
so a Discussion reply is the only channel available to me."

**读法**：这不是"上游懒得修"，是"上游把扩展点留给了插件，并且明确说社区包不比官方包低一等"。
dsh-remedy 恰好就是这种包。

### 5.2 重试这件事，上游自己就是"用插件做的"

`packages/llm/llm/README.md`（实抓）：

> "This service never re-runs a request: retrying is the job of `dsh-llm-retry` at the agent's failed-step
> extension point."

`llm-retry/README.md`（实抓）：

> "Mount this plugin when agent runs should recover from transient model-request failures"

> "Recovery runs on the agent loop's `agent/request-error` waterfall, the open-step extension point, rather
> than wrapping `ctx.llm.stream()` — a raw stream cannot separate already-emitted chunks durably, while the
> loop can re-run the failed step inside the same open turn."

`config-catalog.md` 里 `@deepseek-ai/dsh-llm-retry` 的 `Config` 是 `Readonly<Record<string, never>>`，
注释 "This policy executor has no config; providers own `retryPolicy`."

**读法**：`dsh-llm-retry` **本身就是可挂可不挂的插件**，其哲学原句是 "**durable before wait, open-step
boundaries**"——先落盘 `llm/retry` 事件再等待。这给我们两条硬约束：
(a) 恢复必须发生在 `agent/request-error`（open step）上，不是包 `llm/stream`；
(b) 任何重试必须先在会话日志里留下可重建的证据，否则崩溃后会出现"看不见的待重试"。

这与 dsh-remedy 目前选 `llm/stream` 做 chunk 级修复的分工**不冲突**：我们是 chunk 级、同步、不改已有 chunk；
重试是 step 级、异步、会重跑整个请求。两者叠在一起时要小心，别把同一件事做两遍（见 §4.5）。

### 5.3 社区已经用插件验证过的方向（两条修法 + 一条只是兜底）

**(a) tool-call 参数非法 → 用"有界重试"而不是"修 JSON"**

D08（`#10195`，实抓全文）里 argszero 给出 `@argszero/dsh-malformed-tool-json-guard`，
其设计要点逐条对我们有直接参考价值：

- 挂在 `agent/assistant-stream` + `agent/request-error`，"adapter-agnostic and holds no reference to the llm service"；
- "It retries only when the same attempt both carried a tool-call block whose arguments are not a JSON object
  and ended with MALFORMED_RESPONSE — one half alone would fire on attempts that are not this shape."
  （**双条件**，单条件会误伤）；
- "The retry is bounded to one per step by default and does not consume the provider's own retry budget."；
- **为什么是 retry 不是 repair**："the harness cannot see where the corruption happened, and inventing a
  repair would be guessing."
- **重试成本与副作用**："It costs tokens: the discarded attempt was already billed."；"Repeating the step
  has no side effect to undo: JSON.parse fails before the assistant message exists, so no tool ran and no
  assistant message was appended."
- **实测**：把 0.1.7-rc.2 到 0.2.1-rc.2 共 10 个发布行，"10/10 produce MALFORMED_RESPONSE after emitting
  the tool-call block-end"；三个对照（参数能闭合 / 同一截断但 `stop_reason: max_tokens` / 纯文本回答）
  "claimed on none of them"；变异套件 21/21。

**但这条证据有个缺口必须写明**：截至该帖发帖，这个包**还没有发布到 npm**（几个发布行上的 `npx` 安装
会 404），只能在 GitHub 仓库 `argszero/dsh-malformed-tool-json-guard` 上读到源码与测试。
→ "社区已用插件验证过"这句话的准确含义是"**方案已被实现并有实测**"，不是"用户现在能装上"。
本文不把它当"现成可用的替代品"，只当"同一接缝上的设计参考"。

同一帖里还有一条**否证链**，正好替我们省掉三条死路：

> "A Chinese character split across SSE frames. Not it. `parseSse` runs a `TextDecoderStream` ..."
> "content_block_start.input overwriting the accumulated arguments. Not it either. ..."
> "A truncated stream. A stream that ends early raises `STREAM_CLOSED` from the last line of the same file,
> not MALFORMED_RESPONSE. Your code therefore proves that message_stop arrived and the block closed — the bad
> JSON was assembled upstream of the harness, on the gateway, in the SSE framing, or at the provider."

→ **"消息到了、块闭合了、但拼出来是坏 JSON"** 这三件同时成立，就把嫌疑全部推到网关/SSE 分帧/提供方。
本地解析器只能拒绝，不能定位。这对 P-0001/P-0002 的边界陈述是硬支撑。

**(b) `MALFORMED_RESPONSE` 的替代修法：先改策略，而不是改解析**

D09（`#10406`）给出的优先级：隔离坏调用（把解析失败转成"参数无效"的工具结果回灌模型）> 自动重试 1–2 次 >
最低限度把工具名与字节位置补进错误信息。
D15 的 cloveric 把边界写得最清楚，且明确排除了"顺手修 JSON"：

> "Emitting a block-end is not evidence that a tool has executed."

> 建议：保持拒绝非法参数，但用窄分类 `invalid-tool-arguments` + **有界**模型修正，
> 且仅当执行层保证该步无调用已启动；**不要静默修标点、不要替换成 `{}`、不要重放整个用户任务。**（本文中译自该评论英文原文）

D15 的 Roshenn 追加了一条我们**必须**知道的负结果：运行时已有 repair 层
（`parseToolCallArguments → parseJsonWithRepair → repairJson`，`packages/**/utils/json-parse.ts`），
但它只做两件事——转义字符串内的裸控制字符、把非法转义符前的反斜杠翻倍——对**裸 `"` 无效**
（`repair changed? false`）。→ **"顺手修一下 JSON"不是可选项**，只剩"可重试"或"非致命错误 + 同轮自我修订"。

**(c) 用户侧兜底：改 profile patch 就能加码**（不是修复，是缓解）

D15 给出可在桌面版直接生效的配置（D08 的作者 ltmroberthk915 在真机上验证过 live reload）：

```yaml
- id: llm-deepseek-account
  name: '@deepseek-ai/dsh-llm-deepseek-account'
  config:
    retryPolicy:
      mode: normal
      maxRetries: 2
      retryableCodes: [EMPTY_RESPONSE, RATE_LIMIT, SERVER, TIMEOUT, TRANSPORT, MALFORMED_RESPONSE]
```

注意两个坑：(i) profile 的 config 行**整体替换** provider 的 config 对象而不是合并，所以必须把每个字段重述
（D08 argszero 原话："A profile's config entry replaces the provider config object as a whole rather than
merging into it"）；(ii) `mode: always` 会让**所有**失败都可重试（含确定性 400、坏 key、被取消的回合），
是一个大锤。**这只能写进文档当兜底，不能算 dsh-remedy 的修复能力。**

### 5.4 上游给插件作者的"契约级"要求：控制码必须 `next()`

D12（`#11055`，实抓）提了五条，其中三条是可直接实现的设计约束：

- "文档化 `agent/request-error` 契约——`IMAGE_OFFLOAD_REQUIRED` 等结构化 `HarnessError` 控制码必须
  `next()` 而非 retry"；
- "导出共享分类 `NON_RETRYABLE_CONTROL_CODES` / `isControlFailure(failure)`"；
- "加假 retry 插件的集成测试"。

→ dsh-remedy 若要挂 `agent/request-error`（目前 P-0002 是可选项），**默认必须是 `next()`**，
只在"确认是本补丁认识的形态"时才 retry。这与 §5.3(a) 的"双条件"是同一条纪律。

---

## 6. 对我们（dsh-remedy）的直接映射

### 6.1 最该做的三件

1. **把 P-0001 的修复面从"能拆"收到"能拆且拆完能被执行"**，并在文档里写明"拒绝非法参数"是上游的坚持
   （D15 cloveric：保持拒绝，不要静默修标点/不要替换成 `{}`/不要重放整个任务）。
2. **把"MALFORMED_RESPONSE 不重试"写成一个已知的上游事实**，附 `master` 的五码源码行与 D03/D15 的审计数字，
   让后续任何人想加"重试兜底"时先看到这条不对称；若真要做，只能按 §5.3(a) 的双条件 + 每步一次上界，
   且必须承认"确定性损坏会白花一次请求"。
3. **`agent/request-error` 若要挂，默认 `next()`**，并显式忽略 `IMAGE_OFFLOAD_REQUIRED` / `INVALID_CREDENTIAL` /
   `MISSING_CREDENTIAL` 等控制码（§5.4 + §4.3/4.4）。这一条现在写进代码注释比写进文档更重要，
   因为 D12 的坏例正是"未知码一律重试"。

### 6.2 最不该做的三件

1. **不碰 `max-tokens` 截断**（§4.1，上游两处一手 + 一处社区裁决；项目 HANDOFF 也已写"一律不修"）。
2. **不把 `SERVER`/`TRANSPORT`/`TIMEOUT` 的 retry 再包一层**（§4.5，本机自愈率 84/93、6/10，且会与上游争
   `agent/request-error` 的 waterfall——D12 的失败就是抢位造成的）。
3. **不把 `MISSING_CREDENTIAL` / `INVALID_CREDENTIAL` / `IMAGE_OFFLOAD_REQUIRED` 当故障修**
   （§4.2/4.3/4.4，前者是 documented change、中者是 "Deliberately outside the default retryable set"、
   后者是设计内的控制信号）。

### 6.3 灰区，需要 lead 决定（本文不给结论）

- **EMPTY_RESPONSE 的 reasoning-only 漏判**（D17/D18）：上游 `error.ts` 的判据是 "no content blocks at all"，
  代码实现是"块数 > 0 即算有内容"。这是**真缺陷**（判据与实现不一致），但修复点在适配器
  （`translate.ts:149` 与 `stream.ts:99`），不在 `llm/stream` 的 chunk 上。dsh-remedy 若要在 chunk 层做，
  只能"把 reasoning-only + stop 的 finish 改成 error"，那是**改上游语义**，风险高于 P-0001。
- **`STREAM_CLOSED` 不可重试**（D03/D15，本文未核实其测试钉死情况）：与 MALFORMED 同族，
  但本机 0 次样本，无法证明值得做。

---

## 7. 版本差异（写报告时才发现的坑，别在代码里踩）

| 项 | `master`（源码） | npm `@deepseek-ai/dsh-llm@0.0.1-rc.1`（编译产物） | 后果 |
|---|---|---|---|
| `DEFAULT_MAX_RETRIES` | **5**（`retry-policy.ts`） | **2**（`lib/types/retry-policy.js`） | 引用"默认重试 5 次"时必须说清是 master 还是发布版 |
| `ALWAYS_POLICY_KEYS` | 允许 `maxRetries`/`retryableCodes`（注释说会忽略非激活值） | 只允许 `['mode','backoff']` | 按发布版写 `mode: always` + 其他字段会**校验失败** |
| `maxRequestImages` 默认 | 50（README S06 表格） | 同（发布版 README 与 master 一致） | — |

这一节存在的意义：如果有人照着 `master` 文档写配置、装的是 npm 发布版，会得到一个**校验错误**而不是行为差异。
D08 里那句"config 行整体替换而非合并"是同一类坑的另一面。

---

## 8. Unverified

逐条写原因，不用"待补充"糊过去。

1. **`#8920`、`#9037`、`#12819` 的正文未抓。** 只拿到 HTTP 200 与 `<title>`。
   三者标题分别是"出现'本轮运行失败…'报错"、"子代理一轮内两次流式异常：先 TRANSPORT 自动重试，随后工具参数以
   MALFORMED_RESPONSE 终止整轮"、"ui_render 参数尾部漏 `]` → MALFORMED_RESPONSE 整轮丢弃（0.2.2-rc.1，
   llm-pi-ai 路径；该码仍不在默认重试表）"。
   → 本文**只用标题**作为"同类报告不止一帖"的旁证，**不引用其正文任何句子**。
   原因：`read_page` 在 firecrawl 429（keyless 限额，`retry_after_seconds ≈ 70 000`）与 agy 2 分钟打印超时
   两条回退路径上都拿不到完整正文，且我没有为了三帖去换抓取通道（换通道属绕过，不做）。
2. **D05 `#9402`、D06 `#9503`、D07 `#9981`、D10 `#10714`、D16 `#11843`、D18 `#12673`、D20 `#2410` 为结构化提取，非逐字。**
   本文**没有逐字引用**这 7 条的任何句子；它们只在来源清单、Unverified 与"同类报告存在性"三处出现。
   涉及具体行号/数字的主张（如 `#11843` 的"长 CJK 参数"、`#2410` 的 `INVALID_REPLAY_STATE`）
   **未逐字核对**，当二手中等置信使用；任何要写进代码注释或 README 的主张都必须先用 `read_page` 重抓原文。
   `#9503` 的结构化提取还把 `#9402`/`#10406`/`#11577` 写成 issue 链接，实际是 discussions ——
   这是提取产物不可全信的实证，也是 §9 那条"先确认是 discussion 不是 issue"的来源。
3. **`docs` 站（`deepseek-harness.github.io`）全部未核实。** JS 渲染，`read_page` 返回 "Very little text
   came back"。本文因此**零引用** docs 站，全部一手引证改走 raw GitHub 与 npm。
4. **`app.asar` 未解包、未读取。** 213 MB 单文件，无 `app.asar.d`，`resources/runtime/.../dependencies`
   无 `@deepseek-ai/dsh-llm`。→ 本机安装包内的实际代码与 `master`/npm 的差异**未知**；
   本文所有代码引证都是 `master` 或 npm 发布版，不代表本机 0.2.2-rc.1 桌面版逐字相同。
   若将来需要"本机实际行为"的证据，只能靠会话日志（`data/results/`），不能靠反编译。
5. **`STREAM_CLOSED` 是否被测试钉死未核实。** D03 提到 `transport-recovery.spec.ts:178` 可能断言了它的不可重试性，
   但该 spec 未随 npm 包发布，`/search/code` 需认证（401），无法确认。
6. **`#10406` 的 `agent.ts:587` / `surface.ts:141` / `continuation.ts` 行号来自 D17 正文**，本文未在 `master`
   上逐行复核（只复核了 `retry-policy.ts`、`translate.ts`、`stream.ts` 三个文件）。行号随版本漂移，引用时应重查。
7. **D21 `#3685` 的 "by-design turn-end" 出自 argszero 的校准评论**，不是上游维护者发的 release note。
   本文把它当"社区对上游行为的复述"使用，**没有**把它当官方裁决；§4.1 的官方裁决用的是
   `llm-streaming.md:368` 与 `config-catalog` 的 `maxTokensAsSuccess` 两处一手。
8. **`#8976` 的 961 份日志审计是单机单账号**（macOS、`deepseek-account`、0.2.0-rc.2），
   `#11577` 的 rc.5 复现也是单机。**不能外推到其他路由/模型/平台**；本文只当"存在性证明"用，
   不当频率估计用。
9. **`master` 只到 2026-11-04。** `last_push` 2026-11-04T13:06:39Z，`commits/master` 的 sha 是
   `fcc0ad4`。此后如果有新提交，§3.1 的"五码没动过"需要重查。
10. **本文没有对任何一条做本机端到端复现。** "我们能复现"一列的依据是
    `docs/research/failure-map-2026-11-10.md` 的既有产物 + 上游各帖的离线复现脚本，
    **不是**本轮新跑的实验。要升级成"已复现"，必须另起一次带凭据/无凭据的实录。
11. **`@argszero/dsh-malformed-tool-json-guard` 未在 npm 上核实。** D08 发帖时作者自述
    "publish token pending"，本文沿用了这一陈述但**没有重新查 npm**。→ §5.3(a) 引用的是它的**源码与实测**，
    不是"可安装的产物"；若 lead 要依赖它，需先 `npm view` 一次。
12. **`forum` / `blog` 类来源为 0 条，且未做主动检索。** 上游没有官方论坛与官方博客；
    第三方博客、知乎/掘金/V2EX 转述**未纳入本次取证**（本次只取"上游自己说的"与"上游仓库里的"）。
    因此本文不声称"已覆盖全网讨论"，只声称"已覆盖上游仓库内全部可命中的报告渠道"。

---

## 9. 引用规范（给后续引用本文的人）

- **故障码的语义**引用 `@deepseek-ai/dsh-llm` 的 `src/error.ts` 注释，**不要**引用 `docs/subsystems/*`
  ——后者全文没有这些码（这是 §3.1 的文档缺口）。
- **`max-tokens` 的处置**只引用 `docs/subsystems/llm-streaming.md:368` 那一句，别转述成"上游不打算修截断"
  ——上游说的是"截断的调用不安全、所以丢弃"，这是安全论证不是懒惰论证。
- **上游"不接受 PR"**引用 `CONTRIBUTING.md` 原句 + 仓库元数据 `has_pull_requests: false`，
  不要写成"上游拒绝合作"——同一份文件下一段就是鼓励插件。
- **讨论帖编号必须先确认是 discussion 不是 issue**（`#9503` 的提取产物就把两者混淆过）。
- **链接可用性已实测**：把本文件里抽出的 **43 个唯一 URL** 逐个 `curl -L` 复查，**42 个返回 200**，
  唯一例外是 `https://www.npmjs.com/package/@deepseek-ai/dsh-llm/v/0.0.1-rc.1` 返回 **403**
  （npm 站对非浏览器 UA 的反爬），故 S16/S17 的**可核验直链已改为 unpkg 源码地址**（实测 200），
  npm 包页降为副链接。`https://deepseek-harness.github.io/deepseek-harness/` 返回 200，
  但正文是 JS 渲染（见 §8 第 3 条，本文因此不引用它任一页面内容）。
  另做一个负对照：`/discussions/999999` 返回 404，说明"能打开"不是无条件为真。
- **22 个讨论帖全部返回 200 是"帖子存在"的证明，不是"正文已读"的证明。**
  区分二者见 §1 的「实抓全文 / 结构化提取 / 仅标题核实」三档。引用任何一句英文原文前，
  先回到 §1 确认该帖属于"实抓全文"。
