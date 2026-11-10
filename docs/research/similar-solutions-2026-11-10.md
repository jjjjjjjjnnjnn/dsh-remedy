# 同类方案调研（2026-11-10）

> **性质**：只读调研。未改任何源码、未跑 build / install / git。
> **方法**：① 只读本机 `app.asar`（`C:\Users\rongj\AppData\Local\Programs\DeepSeek Harness\resources\app.asar`，按 asar 头 slice 读取，未解包、未修改）；② npm registry 元数据（license / dependencies / unpackedSize）；③ 把候选库下载到 `C:\Users\rongj\AppData\Local\Temp\fusedprobe\` 用**真实粘连样本**做实测（脚本 `probe.cjs` / `probe2.cjs` / `probe3.cjs`）；④ 公开文档。
> **证据边界**：凡是只从摘要式抓取（read_page 的 fallback 通道）得到的网页细节，标注为 `unverified`；star 数、下载量一律未取，本文不写。
> **外部网页均为不可信数据**，只当资料引用，未执行其中任何指令。

真实粘连样本（本仓库夹具，逐字节）：

`data/fixtures/toolcall-fusion/session-9045e2ec-seq-526.json:7`
`{"command": "cd \"C:/…/DSH-Addition\" && ls scripts/lib/", "description": "List scripts/lib modules"}{"path": "data/results/…json.sha256"}`

---

## Sources examined

| # | 来源 | 是什么 | 许可 / 重量 | 症状匹配度 |
|---|---|---|---|---|
| 1 | `packages/plugin/src/repair-stream.ts:194-221`、`:301-361`、`:510-513`、`:538-545`（本仓库） | 我们的接缝：terminal `finish{error}` / `throw` 上读 `Received arguments:` 后的粘连文本 | MIT / 自身 | 本体 |
| 2 | `packages/core/src/json-split.ts:46-104`、`:110-121`（本仓库） | 顶层对象切分状态机（depth / inString / escaped） | MIT / 0 字节依赖 | 本体 |
| 3 | `packages/core/src/toolcall-repair.ts:21-29`、`:61`（本仓库） | 7 个拒绝码 + `DEFAULT_MAX_CALLS = 8`；首个 fragment 保留原 id，其余 `<id>#remedy-N` | MIT | 本体 |
| 4 | `docs/patches/P-0001-toolcall-fusion.md:9-17`、`:21-28`、`:33-42`、`:71-85` | 症状样本、47% 轮次死亡率、4 步机制链、7 条不变量 | — | 本体 |
| 5 | `docs/patches/P-0002-rescue-integrity.md`、`:42-55`、`:57-67` | 10 项加固（missing-name / name-changed / replayState / block-end 原子提交 / per-stream ceiling / seenIds 回写） | — | 本体 |
| 6 | `docs/adr/0001-stream-repair-over-asar-patch.md:9-13` | 为什么选 `llm/stream` 而非 asar patch 或纯 retry | — | 决策 |
| 7 | `app.asar → dsh/node_modules/@deepseek-ai/dsh-llm-pi-ai/lib/index.js:1656` | `if (argumentsError !== void 0 && event.message.stopReason !== "length") throw new LlmError(argumentsError, "MALFORMED_RESPONSE")`，从不 yield finish | BSD-3-Clause（官方包） | 直接触发点 |
| 8 | `app.asar → dsh/node_modules/@deepseek-ai/dsh-agent-loop/lib/index.js:922-938` | `finish.kind === "error"` 时先 settle，再 `waterfall("agent/request-error", …)`；`action?.kind !== "retry"` 才 `throw`，否则 `continue` 重跑本 step | BSD-3-Clause | retry 的唯一接缝 |
| 9 | `app.asar → dsh/node_modules/@deepseek-ai/dsh-llm/lib/index.js:251-257`、`:263-268`、`:274` | `DEFAULT_RETRYABLE_CODES = [EMPTY_RESPONSE, RATE_LIMIT, SERVER, TIMEOUT, TRANSPORT]`，**不含 MALFORMED_RESPONSE**；`DEFAULT_MAX_RETRIES = 5` | BSD-3-Clause | 解释了为什么整轮必死 |
| 10 | `app.asar → dsh/node_modules/@deepseek-ai/dsh-llm/lib/index.js:954-1073` | `BlockAssembler`：`:986-988` tool-call-delta 里 `id` 每次覆盖、`name` 只在非空时覆盖、arguments 字符串裸拼接；`:1031-1035` 无 `block-end` 时 `id: partial.toolCallId ?? call-${index}`、`name: partial.toolCallName ?? ""`、`arguments` 原样；`:1051-1070` 只有 `max-tokens` 会丢弃 tool-call | BSD-3-Clause | (c) assembler 改 id 的接缝 |
| 11 | `app.asar → dsh/node_modules/@deepseek-ai/dsh-llm/lib/index.js:1150-1170` | 每个 chunk 入账前 `snapshotChunk` + `deepFreeze({ time, chunk })` | BSD-3-Clause | 证明「事后改 chunk」不可行 |
| 12 | `app.asar → dsh/node_modules/@deepseek-ai/dsh-llm/README.zh.md:12`、`:109`、`:135` | 「Loop 构建的请求以深度冻结状态到达，因此监听器与适配器只能读取，绝不能改写」「每个流只尝试调用提供方一次」「模型可见 ⟺ 已记录」 | 文档 | 约束 |
| 13 | `app.asar → dsh/node_modules/@deepseek-ai/dsh-llm-retry/README.zh.md:12`、`:49`、`:72` | 官方 retry 执行器：normal mode 5 次、退避 500ms–10s +10% 抖动；「先持久、后等待，打开步骤边界」；**明确拒绝包装 `ctx.llm.stream()`**，因为原始流无法持久区分已发出的分片 | BSD-3-Clause / 50 505 B / 1 dep | (b) 的官方答案 |
| 14 | `app.asar → dsh/node_modules/@earendil-works/pi-ai/dist/utils/json-parse.js:1`、`:28`、`:71`、`:91-106`、`:115-135` | `parseToolCallArguments` 定稿后**故意不容错**（注释：Unlike parseStreamingJson, this never keeps a partially parsed prefix）；流式 `parseStreamingJson` 才有 `partial-json` 三级 fallback | pi-ai 自身许可 | 上游行为 |
| 15 | `https://github.com/vercel/ai/blob/83877a1e/packages/ai/src/generate-text/tool-call-repair-function.ts` | AI SDK 的 `ToolCallRepairFunction` 类型：入参含 `error: NoSuchToolError \| InvalidToolInputError`、`inputSchema`，返回 `Promise<LanguageModelV4ToolCall \| null>`；`null` = 交回默认处理 | Apache-2.0（`vercel/ai`） | 高 |
| 16 | `https://sdk.vercel.ai/docs/ai-sdk-core/tools-and-tool-calling`（raw: `https://raw.githubusercontent.com/vercel/ai/main/content/docs/03-ai-sdk-core/15-tools-and-tool-calling.mdx`） | `repairToolCall`（原 `experimental_repairToolCall`）是**显式可选**钩子：默认不修，把错误作为 tool error 回灌给模型下一步；钩子里抛错会被包成 `ToolCallRepairError` | Apache-2.0 | 高（机制层） |
| 17 | `https://github.com/openai/openai-agents-python/issues/2061` | Anthropic 路径下坏 `tool_call.arguments` 被原样写进会话历史，回放时 `json.loads()` 崩 → **整个 session 变砖**；修复方向是在 `chatcmpl_converter.py` 里 sanitize | MIT（`openai/openai-agents-python`） | 高（我们也有「坏块持久化」风险） |
| 18 | `https://github.com/openai/openai-agents-python/pull/3166` | 收紧：非 object 的 tool input（array/string/number/null/bool）一律抛 `ModelBehaviorError "expected a JSON object"` | MIT | 中 |
| 19 | `https://reference.langchain.com/python/langchain-core/messages/ai/AIMessage/invalid_tool_calls` | LangChain 不抛：坏参数的调用进 `AIMessage.invalid_tool_calls`（`args` 保留原始字符串 + `error`），valid 的进 `tool_calls` | MIT | 高（"不让一轮死掉"的另一条路） |
| 20 | `https://platform.claude.com/docs/en/agents-and-tools/tool-use/fine-grained-tool-streaming` | `eager_input_streaming` 下 `input_json_delta` 分片是**未校验的裸 JSON 前缀**；文档要求客户端累积 + 容忍式解析；解析不了时**不要静默丢弃**，把原始串包成 `{"INVALID_JSON": "…"}` 回灌 `tool_result{is_error:true}` | Anthropic 文档 | 高 |
| 21 | `https://github.com/josdejong/jsonrepair`（README，`raw.githubusercontent.com/josdejong/jsonrepair/master/README.md`） | 能修截断、能「newline delimited JSON → 数组」，有 streaming API | ISC / 583 060 B / 0 deps / 70 files | 中（但语义与"全有或全无"冲突） |
| 22 | `https://registry.npmjs.org/partial-json/latest` + 本地实测 | `partial-json@0.1.7`：`parse(text)` 对未闭合输入补全，**对粘连输入静默只返回第一个对象** | MIT / 21 852 B / 0 deps / 9 files | 高（且是 pi-ai 已在用的那一个） |
| 23 | `https://registry.npmjs.org/best-effort-json-parser/latest` + 本地实测 | 1.5.1：`parse()` 返回第一个完整对象，把剩余文本放在 `parse.lastParseReminding`（并 `console.error` 一条 "parsed json with extra tokens"） | BSD-2-Clause / 73 227 B / 0 deps / 8 files | 最高（它字面上就在做"首个对象 + 余量"） |
| 24 | `https://registry.npmjs.org/@streamparser/json/latest`、`https://registry.npmjs.org/stream-json/latest`、`https://registry.npmjs.org/streaming-json-parser/latest`、`https://registry.npmjs.org/json-stream/latest`、`https://registry.npmjs.org/@cacheplane/partial-json/latest`、`https://registry.npmjs.org/json-repair-js/latest` | 其余流式/修复候选（见下表重量） | 见下 | 低（多为 NDJSON 或整文档流式，不是"切污染文本"） |
| 25 | `https://registry.npmjs.org/dsh-healer/latest`（repo `https://github.com/viztor/dsh-healer`） | DSH 同类插件：`agent/request-error` 上删空 name 的 tool-call 块 + 删孤立 `role:tool`，内存里改 `surfaceManager._state.projectedMessages`，返回 `{kind:'retry'}`，不写盘 | MIT / 205 951 B / 0 deps | 中高（retry 派） |
| 26 | `https://registry.npmjs.org/dsh-tool-call-guard/latest`（repo `https://github.com/alchemistwu/dsh-tool-call-guard`） | DSH 同类插件：主张 `llm/stream` **只读**（deepFreeze + waterfall next 丢参），真正改写只能在 adapter wire 序列化层；把坏 args 的 tool-call 改写成诚实文本 + 配对结果降级为普通 user 消息，保持协议平衡 | MIT / 20 995 B / 0 deps | 高（对"能不能在 stream 上修"是关键反证） |
| 27 | `https://registry.npmjs.org/pi-tool-repair/latest`（repo `https://github.com/monotykamary/pi-tool-repair`） | pi 扩展（非 DSH）：`message_end` 上 validate-then-repair，读 live tool schema，只修声明字段，修完**必须 re-validate**，失败就丢弃候选让原错误暴露；含 `recoverMangledToolName`（`bash_1_234456789 → bash`，仅当唯一匹配） | MIT / 111 825 B / 0 deps | 高（"修完要复验"的范式） |
| 28 | `https://registry.npmjs.org/dsh-param-repair/latest`（repo `https://github.com/PerryLink/dsh-param-repair`） | `tools/post-execute` 层修工具结果里的坏 JSON，多策略直到过 schema，修不了保留原值 | Apache-2.0 / 305 160 B / 0 deps | 低（不同接缝） |
| 29 | `https://registry.npmjs.org/dsh-session-log-repair/latest`、`https://registry.npmjs.org/dsh-session-conductor/latest` | 离线会话日志修复（事后改 jsonl），不是流上修复 | MIT / 151 927 B、1 248 708 B | 低（不同接缝） |
| 30 | `https://registry.npmjs.org/@deepseek-ai/dsh-llm-retry` | 官方 retry 包：`0.0.1-rc.1`，BSD-3-Clause，50 505 B，仅依赖 `@deepseek-ai/schemastery` | BSD-3-Clause | (b) 的现成实现 |

### 本地实测（真实粘连样本，可直接复跑）

| 库 | `parse(粘连文本)` | `parse(截断文本)` |
|---|---|---|
| `JSON.parse` | 抛 `Unexpected non-whitespace character after JSON at position 124` | 抛 `Unterminated string` |
| pi-ai `repairJson`（内联复刻 1.3.0 逻辑） | 仍抛同一条错误；`repairJson(fused) === fused`（对本症状**完全无效**） | 仍抛 `Unterminated string` |
| `partial-json@0.1.7` | **不抛**，只返回 `{command, description}`，`{"path": …}` **静默消失** | 返回 `{command:"ls", description:"list"}`（补了引号） |
| `best-effort-json-parser@1.5.1` | **不抛**，返回第一个对象，`parse.lastParseReminding` = `{"path": "…"}`（并把原文 `console.error`） | 返回 `{command:"ls", description:"list"}` |
| `jsonrepair@3.15.0` | **抛** `JSONRepairError Unexpected character "{" at position 124`；但**中间加一个换行**就返回两个对象的数组 | 补全为 `{"command": "ls", "description": "list"}` |
| 本仓库 `splitTopLevelJsonObjects` | 2 个 fragment，分别 parse 成功 | 抛 `unterminated-string` |

结论：只有我们自己的状态机做到了「切成 N 片且每片都必须 parse」；四个库要么**丢尾部**，要么**把不可证明的输入补成能跑的 JSON**。

---

## What they do that we do not

1. **best-effort-json-parser** — 机制：先按完整的第一个 top-level 对象 parse，把余量作为 `reminding` 交回调用方（`probe3.cjs` 输出 `lastParseReminding`）。我们当前：自己写状态机切分，余量**不是交回而是必须逐片 parse**，任一片失败即整轮拒绝（`toolcall-repair.ts:21-29` 的 `unparsable-fragment` / `fragment-not-object`）。
2. **partial-json（pi-ai 已在用）** — 机制：流式期间把未闭合前缀补成合法对象返回。我们当前：只在 terminal `finish{error}` 上动手，且**从不**把未闭合输入补成对象（截断一律不修，`docs/patches/P-0002-rescue-integrity.md:72-74`）。
3. **jsonrepair** — 机制：连截断都修，NDJSON 自动包成数组。我们当前：截断是显式禁区（P-0001 limits 第 1 条）；"全有或全无"要求每片可证明，而 jsonrepair 的目标是**尽量给出可运行结果**，方向相反。
4. **Vercel AI SDK `repairToolCall`** — 机制：修不修是**显式 opt-in**，钩子返回 `null` 就回落到默认（把错误作为 tool error 回灌模型、下一步自纠）；钩子内抛错包成 `ToolCallRepairError`。我们当前：修复默认开启但**没有"回灌给模型"这一档**——修不了就抛回原始 `LlmError`，整轮结束（`repair-stream.ts:538-545`）。
5. **LangChain `invalid_tool_calls`** — 机制：坏参数的调用**不抛**，放进 message 的独立字段（原始字符串 + error），valid 的照常执行。我们当前：坏参数直接结束这一轮（`planRescue` 返回 null → 原样抛）。
6. **Anthropic 细粒度工具流文档** — 机制：解析不了时把原始串包成 `{"INVALID_JSON": "<原样>"}` 用 `tool_result{is_error:true}` 回灌，而不是 fail silently 或丢 turn。我们当前：拒绝时只写本地计数 + `recordRejected`（`repair-stream.ts:122-126`），不产生任何可回灌的机器可读载体。
7. **openai-agents-python #2061 的教训** — 机制：坏 arguments 一旦被持久化，会在**后续回放**里把 session 弄砖；官方修法是在转换层 sanitize。我们当前：不写会话历史（journal 是独立 JSONL，`packages/plugin/src/index.ts:81-104`），但**合成 id 的 fragment 仍会被持久化到 assistant/attempt**，回放时如果某工具对 id 有预期就会踩到同样的坑。
8. **官方 `dsh-llm-retry`** — 机制：在 `agent/request-error` 上、**先持久后等待**、打开步骤边界重跑；明确说不能包装 `ctx.llm.stream()`。我们当前：`retryOnMalformed` 默认 0（`index.ts:120-137`），只有显式配置才在 `agent/request-error` 上返回 `{kind:'retry'}`；retry 与 repair 是两条互斥路径。
9. **dsh-healer** — 机制：只在 provider 报错后介入，删掉**空 name** 的 tool-call 块与孤立 tool 结果，内存里改 projected messages，返回 `{kind:'retry'}`。我们当前：P-0002 把空 name 变成**拒绝**（`missing-name`）而不是"删掉再 retry"——我们选择不失真，它选择让这一轮继续。
10. **dsh-tool-call-guard** — 机制：认定 `llm/stream` 只读，改写只能发生在 adapter wire 序列化层；改写后要维持**协议平衡**（不留悬挂 `tool_calls` / 孤儿 `role:"tool"`）。我们当前：在 `llm/stream` 上改 chunk（实测可行，因为我们是 waterfall 包装而非改写 request），但**没有做协议平衡检查**：拆分后若某个 fragment 的 id 与一个既有 tool 结果 id 撞车，或某个合成 id 永远没有结果，我们不会发现。
11. **pi-tool-repair** — 机制：validate-then-repair：读 live schema，只修 schema 声明的字段，修完 `re-validate`，失败丢弃候选。我们当前：只证明"每片是 JSON object"，**不证明它对该工具合法**——真实夹具里 `{"command":…}` 属 `ops_bash`、`{"path":…}` 属 `read`，两个对象被同一个 name 派发，第二片必然 schema 校验失败（`app.asar → dsh-tools/lib/index.js:338-341` 先 validate 再抛 `ToolArgsError`）。
12. **Vercel / pi-tool-repair 共同的"attempt budget"** — 机制：修复有明确尝试上限与"失败即暴露原始错误"的语义。我们当前已有等价物：`DEFAULT_MAX_CALLS = 8`（`toolcall-repair.ts:61`）+ P-0002 的 per-stream `ceilingOf`（`repair-stream.ts:224-228`）+ 全有或全无。

---

## Adopt / do not adopt

**(a) 流式 partial-JSON 解析器（边收边 parse 前缀，容忍未闭合）——do not adopt（作为修复路径）；只 adopt 它的"首个对象 + 余量"这一检测思路的等价物（我们已有）。**

一句代码行为：**不要**在 `planRescue` 前用 `partial-json` / `parseStreamingJson` 把 buffer 补成对象；保持 `splitTopLevelJsonObjects` + 每片 `JSON.parse` 的"全有或全无"（`packages/core/src/toolcall-repair.ts:85-145`），因为实测 `partial-json` 对真实样本**静默丢弃第二个对象**，那会把"可修的 2 调用粘连"变成"少一个调用的静默成功"，比现在的拒绝更坏。

**(b) provider 层 retry（在 provider/adapter 上重试 MALFORMED_RESPONSE）——do not adopt 作为修复策略；仅保留为默认关闭的兜底，并把它做成可观测。**

一句代码行为：**不要**把 `MALFORMED_RESPONSE` 加进 `retryableCodes` 或改 `dsh-llm-retry` 的默认集（`app.asar → dsh-llm/lib/index.js:251-257` 是官方默认；`docs/adr/0001-stream-repair-over-asar-patch.md:11` 已判定 retry 只会重采样同一缺陷、还白烧 token）；保持 `retryOnMalformed` 默认 0（`packages/plugin/src/index.ts:120-137`），改为在 verdict/journal 里记一个 `refused-retryable` 计数，让"我们本可以重试但选择不重试"可见。

**(c) assembler 层改 id（组装 tool call 时给每个对象分配独立 index/id）——do not adopt "改 assembler"（物理不可行）；adopt "在 wrapper 里给每个 fragment 分配互不冲突的 index + id 台账双向登记"。**

一句代码行为：assembler 在 asar 里、且 chunk 入账前被 `deepFreeze`（`app.asar → dsh-llm/lib/index.js:1150-1170`），所以**不要**试图 patch `BlockAssembler.assemble` 的 `id: partial.toolCallId ?? call-${index}`（`:1031-1035`）；改在我们自己发 chunk 的地方：N 个 fragment 依次取**连续且未被占用的 index**（不是当前 `highestIndex+1` 全给同一个，见 `docs/research/stability-audit-2026-11-10.md:59` 的残留 #4），并让 `seenIds` 同时登记"合成 id"与"该 id 已有 tool 结果"两侧。

---

## Consequence for P-0002 / 0.2.0

- **进 0.2.0（三条，都是小改、零新依赖）**：① 合成 index 连续分配（修上表 (c) 指出的残留 #4，`repair-stream.ts:264-271`/`:352`/`:472`）；② id 台账双向（`seenIds` 同时防"合成 id 与既有 tool 结果 id 撞车"和"合成 id 无结果"，对应 dsh-tool-call-guard 的协议平衡不变量）；③ 拒绝可观测：`refused-retryable` / `name-unverified` 两个计数进 verdict/journal，默认仍不 retry（对应 (b) 的"保留但可见"）。
- **明确不进 0.2.0**：把 partial-json / best-effort / jsonrepair 任一个进 `dependencies`。理由：前者会**丢尾部**，后两者会**把截断补成可执行**——直接撞 P-0001 的"全有或全无"与"截断一律不修"两条硬约束，也撞 `dsh-remedy` 的零依赖承诺（现网 `dsh-remedy-core` 是唯一依赖）。
- **明确不进 0.2.0（需要新接缝，留作 P-0003 候选）**：pi-tool-repair 式 "live schema 复验"——它需要读工具注册表，而 `llm/stream` 的 `RemedyContext`（`packages/plugin/src/index.ts:35-42`）只给了 `on` / `logger` / `effect`，拿不到 schema；这属于"第二个接缝"，与 AGENTS.md 的"一次只改一个接缝"冲突。
- **与 P-0001/P-0002 的边界冲突点（写清以免被误读为拓宽）**：任何"从 provider 侧 retry 修好"的做法都绕过 P-0001/P-0002 的证据链（`data/results/live-*` 里记的是"粘连→拆分"），retry 成功会让 `fused_calls` 变 0 且无法归因；任何"回灌 `{"INVALID_JSON":…}` 给模型自纠"的做法则与 P-0002 的"原样抛回、绝不把失败变成成功"（`docs/patches/P-0002-rescue-integrity.md:63`、`docs/adr/0001-stream-repair-over-asar-patch.md:11`）正面冲突——两者都**不**进 0.2.0。
- **`unverified` 项**：Vercel AI SDK 文档页细节（`repairToolCall` 的默认回灌行为、`ToolCallRepairError` 包装）与 openai-agents-python #2061 的修复 commit / 版本号，均来自 read_page 的摘要式 fallback，未经原始文件逐字核对，标 **unverified**；LangChain `invalid_tool_calls` 字段语义来自 reference 页抽取，同样标 **unverified（字段存在与语义可信，具体版本行为未核）**。star 数、周下载量一律未取。
