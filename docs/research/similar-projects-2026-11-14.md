# 同类项目与上游源码：2026-11-14 读到的六件事

> 触发：交接后按用户要求「去互联网上找信息、可以学别人的项目、继续加补丁」。
> 规则不变（`docs/research/README.md` §0）：**别人的 README 是线索，不是证据**；
> 下面每一条「我们确认的」都指回了本机 `app.asar` 的行号，或者指回了别人的原文位数。
> **一律不抄代码**：只借机制，且每个借来的想法都在补丁文档里写清「来自哪里、我们复现了哪一半」。

## 1. 生态里已经有五个同接缝的插件

| 项目 | 接缝 | 它修什么 | 许可证 |
|---|---|---|---|
| `udsy19/dsh-toolcall-stream-repair` 0.1.0 | `llm/stream` | 11 个 repair code：`unrecoverable-name`、`synthesized-id`、`empty-id-clobber`、`id-collision-split`、`corrected-block-end`、`synthesized-block-start`、`duplicate-block-start`、`straggler-dropped`、`synthesized-block-end` 等 | MIT |
| `monotykamary/dsh-tool-repair` 0.1.1 | `llm/stream`（`block-end` 上按请求的 schema 校验） | 用 `jsonrepair` 修复「平衡但非法」的 JSON，再按本次请求的 JSON Schema 校验；带 GLM `<arg_key>`/`<arg_value>` 解码 | MIT |
| `alchemistwu/dsh-tool-call-guard` | `llm/stream`（请求侧） | 把 `JSON.parse` 失败的 tool call 在**线上**换成诚实文本记录，并把配对的 tool result 改写成用户消息（避免 vLLM 400） | 未标注（按其讨论帖） |
| `hbgdjb/dsh-session-shield` | `llm/stream` | 空 id → `call-guard-<token>-<index>`，空 name → `guard_malformed_tool_call`，非法 arguments 转成 JSON 字符串 | MIT |
| `Zn-Dk/dsh-session-repair` / `zzdhsxk/dsh-session-migration-repair` | 会话日志（离线） | 已落盘的污染历史：v0→v3 迁移链上的空 id / 空 name，就地修复 + 备份 + 回滚 | MIT |

**我们和它们的关系**：同一块地。但我们的差异点是硬的，而且每一条都有产物：
① **拒绝而不是猜测**（P-0001/P-0003/P-0005：拆不开就原样抛回，`single-object` 与 `bare-value` 各有一支判据）；
② **归因证明**（P-0027/P-0030：片段的名字要么被 schema 证明，要么叫 `remedy_unattributed`，要么把 `unproven` 记进 journal）；
③ **记账契约**（P-0003/P-0033/P-0034：`unmeasured` ≠ `quiet`，一条失败只记一次）；
④ **零依赖 + 字节预算**（脚本门禁 6 道，`--mutate` 6/6）。

**明确不学的一件**：`dsh-tool-repair` 依赖 `jsonrepair`。我们不加依赖（PROJECT_RULES §7：门禁与插件零依赖），
而且「平衡但非法的 JSON」在我们看来正是 **P-0005 的 `ambiguous-bare-value`**：两个候选就不许挑，
这不是能力不足，是我们认为「挑一个」等于编造。

## 2. 上游源码里确认的四行（本机 `app.asar`，DSH 0.2.2-rc.3）

| 位置 | 原文 | 它意味着什么 |
|---|---|---|
| `dsh-llm/src/assembler.ts:72` | `partial.toolCallId = chunk.id` | **无条件赋值**。同一 index 的后续 delta 带 `id: ""` 时，会把先到的真 id **擦掉** |
| `dsh-llm/src/assembler.ts:73` | `if (chunk.name) partial.toolCallName = chunk.name` | name 有守卫，id 没有 —— 这行和上一行不对称，正是缺陷形状 |
| `dsh-llm/src/assembler.ts:115` | `id: partial.toolCallId ?? brandString(...call-${index})` | `??` 只兜 `null`/`undefined`，**空字符串不触发** |
| `dsh-llm/src/assembler.ts:187` | `get finish() { return this._finish ?? { kind: 'stop' } }` | **没有 `finish` 的流被读成干净的 `stop`** —— L-0036 的宿主半边，至此有源码 |
| `dsh-llm-deepseek/lib/index.js:2082` | `throw new LlmError("… stream ended before message_stop", "STREAM_CLOSED")` | Messages 路由不会安静结束；安静结束只可能来自别的适配器 |
| `dsh-llm/src/assistant-stream.ts:138` | `if (chunk.id.length === 0 \|\| chunk.name === '') push 原始 chunk` | 空身份的 delta **原样进持久日志**，所以「线上修」和「离线修」是两种东西 |

**由此得到一条我们自己的缺口**（不是别人的）：

P-0033 只重写了 `block-end` 上的空身份。但 `assembler.ts:69-75` 那条路径是**纯 delta 协议**：
适配器从头到尾不发 `block-end` 时，宿主直接用 delta 拼出调用，而我们**把 `id: ""` 的 delta 原样放行** ——
于是 `partial.toolCallId` 从真 id 被擦成 `''`，`??` 不兜空串，落盘就是空 callId，会话不可 resume。
这一半在 P-0033 的 limits 里写着「fused + 空身份」与「非对象参数」，**没有写这一条**，因为它确实没被覆盖。

复现（本机，接缝级）：

```
block-start {index:0, tool-call}
tool-call-delta {index:0, id:'call_8f2', name:'read', argumentsDelta:'{"file_path":'}
tool-call-delta {index:0, id:'', argumentsDelta:'"a.ts"}'}
finish {kind:'stop'}
```

我们的包装器输出里，第二条 delta 的 `id` 仍然是 `''`（`.tmp/probe-identity.mjs` 的打印）。
宿主对这两条 delta 的组装结果按 `assembler.ts:72` 是 `id: ''` → 不可 resume。**这就是 P-0036。**

## 3. L-0036（无 finish 的流）的宿主半边，现在有源码了

`assembler.ts:187` 把「没有 finish」读成 `{kind:'stop'}`。所以「宿主把它当成功」**已经是读过源码的事实**，
不再需要脚本化 provider 才能定性。仍然不做补丁，理由是**诚实**：我们分不出「干净结束」与「被截断」，
补 `stop` 是重复宿主的假设，补 `error` 是编造。它只能被**命名**（一个不移动 verdict 的计数），
而这属于下一轮要不要付字节的决策，本轮先记进账本。

## 4. 别人的两个「我们不做」的决定（写下来免得下一轮重新想）

- **不在请求侧改写历史**（`dsh-tool-call-guard`）：它把坏调用换成文本、把 tool result 换成用户消息。
  对话协议因此保持平衡，但**模型看到的历史不再是自己发出的样子**。我们的立场是「接缝上修，修不了就抛」，
  不改写消息序列 —— 这也是我们和它的主要分歧，写在这里当边界。
- **不做离线会话修复器**（`dsh-session-shield`/`dsh-session-repair`）：它们改已经落盘的 `.zstd`。
  我们的 `scan` 只**读**，从不写会话目录（PROJECT_RULES §4：本机只读）。

## 5. 从它们那里借来的一条判据（借机制，不借代码）

`udsy19` 的 README 有一条值得我们抄的**测试形状**：每个 repair code 都配一个 fixture 和一条负对照，
「删掉修复，配对的断言必须翻转」。我们已经有这个形状（P-0001…P-0034 每条的「先红」），
但它把「11 个 code ↔ 11 条负对照」写成一张表 —— 下一轮做 `explain`/`status` 的读者界面时，
这张表可以直接当模板（**只借排版，不借文本**）。

## 6. 本轮结论

- 加 **P-0036**：纯 delta 协议下，空 `id` 的 delta 不许擦掉流里已经证明过的 id。
- 台账加 L-0037（`udsy19` 的 `empty-id-clobber` 与我们 P-0033 的边界）与 L-0038（L-0036 的宿主半边有源码了）。
- 不借任何代码；`jsonrepair` 不引入；请求侧改写与离线修复两条路**明确不做**。
