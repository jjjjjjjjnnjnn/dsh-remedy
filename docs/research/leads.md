# External leads — dsh-remedy

> 读取日期：**2026-11-14**。来源：GitHub GraphQL（`search(type: DISCUSSION, ...)`）与 REST。
> **所有行默认 `status: lead`（未复现）**；`decision` 是下一步动作，不是结论。
> 复现之后才允许改状态，规则见 `README.md` §0 / §3。

## 采样方法（可重复）

```bash
# 该仓库 issue 关闭，只有 Discussions；用 issues API 会得到 0 条
gh api graphql -f query='{ repository(owner:"deepseek-ai", name:"deepseek-harness") { discussions(first:15, orderBy:{field:UPDATED_AT, direction:DESC}) { nodes { number title url comments { totalCount } category { name } } } } }'

# 关键词（替换 MALFORMED）
gh api graphql -f query='{ search(type: DISCUSSION, query: "repo:deepseek-ai/deepseek-harness MALFORMED", first: 10) { nodes { ... on Discussion { number title url comments { totalCount } } } } }'
```

本轮用了四组关键词：`MALFORMED`、`tool call`、`stream`、`JSON`；返回的都是 Discussions。
下一次可以加：`STREAM_CLOSED`、`parallel tool`、`bundle patch`、`session resume`、`BOM`、
`cleanup`、`retry`、`empty tool`。

## A. 直接命中 `llm/stream`（最高优先）

| id | source | source_kind | read_depth | reported | version | class | seam | status | decision |
|---|---|---|---|---|---|---|---|---|---|
| L-0001 | <https://github.com/deepseek-ai/deepseek-harness/discussions/12901> | `dsh` | `full` | 2026-11 | ? | `MALFORMED_RESPONSE`? | `llm/stream` | **rejected (dup)** | R43：与 P-0001 同形状——报告里两条都是同一个工具（`bash`），粘连文本在 `block-end`/`finish` 被拆成两个调用，用户可见的失败已由 P-0001 的夹具与 live 产物覆盖。第二个调用的真 id 在 `pi-ai` 的 `ensureToolCallBlock`（本机 `@earendil-works/pi-ai@0.82.1` 副本逐字确认：先按 index 找 block，没有结构闭合守卫）里就丢了，属上游；我们修不到那一半。适配器边界回放留作下一步（未在本轮重测，见 decision 的诚实边界）。 |
| L-0002 | <https://github.com/deepseek-ai/deepseek-harness/discussions/13211> | `dsh` | `full` | 2026-11 | **0.2.2-rc.3** | `MALFORMED_RESPONSE`? | `llm/stream` | **patched** | R43：本机接缝复现了同一形状（`block {id:'', name:'', arguments:'{}'}` + 正常 finish），旧构建只记 `refused` 然后原样放行，宿主把空 callId 写进 V4、会话不可 resume。**P-0033** 改为合成可追踪 id + `remedy_unattributed`；四条新测试先红后绿，见 `docs/patches/P-0033-empty-identity.md`。上游「提交前校验完整调用」的部分仍是 out-of-seam。 |
| L-0003 | <https://github.com/deepseek-ai/deepseek-harness/discussions/11843> | `dsh` | `full` | 2026-11 | ? | `MALFORMED_RESPONSE` | `llm/stream` | lead | 大参数导致 invalid JSON；抽最小形状，确认是截断、粘连还是裸值（P-0005 已覆盖后者）。 |
| L-0004 | <https://github.com/deepseek-ai/deepseek-harness/discussions/12819> | `dsh` | `full` | 2026-11 | 0.2.2-rc.1 | `MALFORMED_RESPONSE` | `llm/stream` | lead | 尾部多一个 `"]"`；这是「单个坏对象」还是「粘连后截断」？前者 P-0003 拒绝、后者 P-0001 拆——先归类。 |
| L-0005 | <https://github.com/deepseek-ai/deepseek-harness/discussions/10195> | `dsh` | `full` | 2026-11 | 0.2.1-rc.2 (Windows) | `MALFORMED_RESPONSE` | `llm/stream` | lead | Windows 流式参数损坏；在 0.2.2-rc.3 上重试，记录工具名与 index。 |
| L-0006 | <https://github.com/deepseek-ai/deepseek-harness/discussions/11577> | `dsh` | `full` | 2026-11 | 0.2.1-rc.5 | `MALFORMED_RESPONSE` | `llm/stream` | lead | 汇总帖（#7705/#8920/#8976/#9402/#9503/#10406），附补丁建议；先读它引用的六条，去重后再复现。 |
| L-0007 | <https://github.com/deepseek-ai/deepseek-harness/discussions/8976> | `dsh` | `full` | 2026-11 | ? | `MALFORMED_RESPONSE` / `STREAM_CLOSED` | `llm/stream` + `agent/request-error` | lead | 46 turns lost；对照我们本机 census 的 47 次 `MALFORMED_RESPONSE`，看是不是同一类。 |
| L-0008 | <https://github.com/deepseek-ai/deepseek-harness/discussions/12628> | `dsh` | `full` | 2026-11 | ? | `MALFORMED_RESPONSE` | `llm/stream` | lead | 提议「降级为工具错误」；我们的立场是「修不了就抛」，评估能否用 `remedy_unattributed` 或命名诊断表达，而不是吞掉。 |
| L-0009 | <https://github.com/deepseek-ai/deepseek-harness/discussions/12769> | `dsh` | `full` | 2026-11 | ? | `UNKNOWN_TOOL` | `llm/stream` | lead | relay 改工具名大小写；检查我们的名字/声明查找是否大小写敏感，以及 P-0027 的归因会不会误判。 |
| L-0010 | <https://github.com/deepseek-ai/deepseek-harness/discussions/12064> | `dsh` | `full` | 2026-11 | ? | `MALFORMED_RESPONSE`（被吞） | **out-of-seam**（adapter） | watching | R43：`dsh-agent-loop` 的 `parseArguments` 逐字确认是 `catch { return raw }`，宿主把字符串交给工具——不修宿主。我们这条接缝能看到的下半截是「参数能 parse 但不是对象」（字符串/数组/null），可以命名并送去 `remedy_unattributed`；那是独立补丁（P-0034 候选），不塞进 P-0033。 |

## B. 流 / 会话稳定性（相邻，先判断是否本接缝）

| id | source | source_kind | read_depth | reported | version | class | seam | status | decision |
|---|---|---|---|---|---|---|---|---|---|
| L-0011 | <https://github.com/deepseek-ai/deepseek-harness/discussions/12688> | `dsh` | `full` | 2026-11 | ? | `STREAM_CLOSED` | `agent/request-error` | lead | 流被截断不重试；我们的 request-error 接缝能否看到 `STREAM_CLOSED`？先查 census 词汇。 |
| L-0012 | <https://github.com/deepseek-ai/deepseek-harness/discussions/13069> | `dsh` | `full` | 2026-11 | ? | unknown | `agent/request-error` | lead | 总是重试 / 无 finish 的流被当正常结束；与 P-0011 的有界重试对照，读它的 watchdog 设计。 |
| L-0013 | <https://github.com/deepseek-ai/deepseek-harness/discussions/12352> | `dsh` | `full` | 2026-11 | ? | unknown | out-of-seam | lead | `tool_use` 没有 `tool_result` 的会话不能续；判断 scan 能否识别为 unreadable/坏会话。 |
| L-0014 | <https://github.com/deepseek-ai/deepseek-harness/discussions/13215> | `dsh` | `full` | 2026-11 | ? | unknown | `cli` | lead | session-search 多词查询；与我们的 scan 无关，但可能借它的索引设计。 |
| L-0015 | <https://github.com/deepseek-ai/deepseek-harness/discussions/12104> | `dsh` | `full` | 2026-11 | ? | unknown | out-of-seam | lead | 等槽位的流空闲超时；记录，不碰。 |
| L-0016 | <https://github.com/deepseek-ai/deepseek-harness/discussions/11271> | `dsh` | `full` | 2026-11 | ? | unknown | out-of-seam | lead | 终端流冻结（并发 dispose）；与插件无关，只记录。 |

## C. profile / 插件加载（可能直接解释「装了没挂」）

| id | source | source_kind | read_depth | reported | version | class | seam | status | decision |
|---|---|---|---|---|---|---|---|---|---|
| L-0017 | <https://github.com/deepseek-ai/deepseek-harness/discussions/13316> | `dsh` | `full` | 2026-11 | ? | unknown | `profile` | lead | 「带 dsh.bundle.patch 的依赖被渲染成 bundle，但 patch 从未加载」——**先查我们自己的 `cordis.patch.yml` 在 desktop 清单里是哪一行**；若同形状，可能是「装了没挂」的外部证据。 |
| L-0018 | <https://github.com/deepseek-ai/deepseek-harness/discussions/13320> | `dsh` | `full` | 2026-11 | ? | unknown | out-of-seam | lead | `--dump-config` 会静默改写 package.json；记录，不碰。 |
| L-0019 | <https://github.com/deepseek-ai/deepseek-harness/discussions/12675> | `dsh` | `full` | 2026-11 | ? | unknown | `profile` | lead | profile `package.json` 带 BOM 导致桌面崩溃；检查我们写 profile 的脚本（copy_record / switch）是否可能写 BOM（应为 UTF-8 无 BOM）。 |
| L-0020 | <https://github.com/deepseek-ai/deepseek-harness/discussions/11182> | `dsh` | `full` | 2026-11 | ? | unknown | `profile` | lead | 同 L-0019（中文帖）；合并处理，不重复计。 |
| L-0021 | <https://github.com/deepseek-ai/deepseek-harness/discussions/13324> | `dsh` | `full` | 2026-11 | **0.2.2-rc.3** | unknown | out-of-seam（session） | lead | 写路径把非法 system/message 追加进 legacy 会话；`scan` 能否识别？只做读取器，不改宿主。 |
| L-0022 | <https://github.com/deepseek-ai/deepseek-harness/discussions/10619> | `dsh` | `full` | 2026-11 | 0.2.1-rc.2 | `SessionFormatError` | out-of-seam（session） | lead | L-0021 的前序；判断我们的 `scan` 的 unreadable 计数是否覆盖这个形状。 |

## D. 安全 / 参数类型 / 其他（记录，不碰或只做诊断）

| id | source | source_kind | read_depth | reported | version | class | seam | status | decision |
|---|---|---|---|---|---|---|---|---|---|
| L-0023 | <https://github.com/deepseek-ai/deepseek-harness/discussions/10569> | `dsh` | `full` | 2026-11 | 0.2.1-rc.2 | — | out-of-seam | lead | `cleanup` 扩到 `C:/` 删用户文件；**安全类，不属于本插件**；记录，必要时在 README 边界里提示。 |
| L-0024 | <https://github.com/deepseek-ai/deepseek-harness/discussions/11190> | `dsh` | `full` | 2026-11 | ? | unknown | `llm/stream`? | **rejected (no defect)** | R45：读到 `packages/core/src/attribute.ts:73-76`——`valueFits` 只有在声明了 `type` 时才判类型，`type:'json'` 编译出的无类型 schema 一律返回 `true`（判为「不可判定」），所以 P-0030 的判据不会被这个形状误导，反而正是它要的那种保守方向。读取器没有第二处读 `type`。不改代码。 |
| L-0025 | <https://github.com/deepseek-ai/deepseek-harness/discussions/13035> | `dsh` | `full` | 2026-11 | ? | unknown | out-of-seam | lead | reviewer 用散文回答；记录。 |
| L-0026 | <https://github.com/deepseek-ai/deepseek-harness/discussions/13325> | `dsh` | `full` | 2026-11 | ? | unknown | out-of-seam | lead | `notifySettlement` 不唤醒空闲父级；记录。 |
| L-0027 | <https://github.com/deepseek-ai/deepseek-harness/discussions/12601> | `dsh` | `full` | 2026-11 | ? | unknown | `profile` | lead | 磁盘清理 + 装插件后 App 静默不启动；与 L-0019 一起看，可能是 profile 损坏类。 |

## E. Reddit（只读到摘要）

> 2026-11-14 实查：`www.reddit.com` / `api.reddit.com` / `old.reddit.com` 三种入口都 `ECONNRESET`，
> 只有 `websearch` 返回标题与一两句摘要。**这四行 `read_depth: summary`，不得升到 `reproduced` 以上**，
> 除非本机复现了它描述的类。规则见 `sources.md` §2。

| id | source | source_kind | read_depth | reported | version | class | seam | status | decision |
|---|---|---|---|---|---|---|---|---|---|
| L-0028 | <https://www.reddit.com/r/DeepSeek/comments/1w0qu8q/deepseek_harness_is_frustrating_is_it_just_me/> | `reddit` | `summary` | 2026-11 | ? | unknown | out-of-seam? | lead | 摘要句："When a tool report is empty, or straight up fails, DSH moves on and claims the job is done" —— **最该命名的静默类**。只读到摘要（正文被 TLS 拒），先与 census/explain 对照，不据此发补丁。 |
| L-0029 | <https://www.reddit.com/r/LLMDevs/comments/1vyaxxw/i_built_a_deepseek_harness_plugin_that_proves_why/> | `reddit` | `summary` | 2026-11 | ? | unknown | out-of-seam | lead | 竞品：把"为什么 agent 做错了"做成归因插件。摘要句："the real cause was the error message itself"。只作同类项目读法，不抄设计。 |
| L-0030 | <https://www.reddit.com/r/rust/comments/1x3xp42/does_reusing_pi_extensions_and_deepseek_harness/> | `reddit` | `summary` | 2026-11 | ? | unknown | out-of-seam | lead | 摘要句："what happens when a TS plugin hangs in the middle of a tool call" —— 插件挂起/超时类，先查 census 有没有同类，再判是否本接缝。 |
| L-0031 | <https://www.reddit.com/r/DeepSeek/comments/1vvlnml/switched_to_deepseek_harness_your_context_didnt/> | `reddit` | `summary` | 2026-11 | ? | unknown | `profile` | lead | 摘要提到 `- insert:` 与裸行被拒（"a bare row is rejected with entry mcp-deja not found"）—— 与我们 `cordis.patch.yml` 的规则同族，可作外部印证。 |

## F. R45 / R46 新读的（S-DSH 的 83 条候选里挑出来的五条）

| id | source | source_kind | read_depth | reported | version | class | seam | status | decision |
|---|---|---|---|---|---|---|---|---|---|
| L-0032 | <https://github.com/deepseek-ai/deepseek-harness/discussions/11337> | `dsh` | `full` | 2026-10-28 | Messages 路由（rc.3 之前） | `MALFORMED_RESPONSE`（`unsupported stop reason refusal`） | `llm/stream` | **patched** | R45：报告里有逐字 chunk 序列——reasoning 块正常结束，随后 `finish{kind:'error'}`，message 是 `DeepSeek Messages stream: unsupported stop reason refusal`。宿主半截已从 `app.asar` 逐行确认：`dsh-llm-deepseek/lib/index.js` 的 `stopReason()` 只接受 `end_turn` / `stop_sequence` / `tool_use` / `max_tokens`，其余走 `malformed()`。旧代码把「code 是 MALFORMED」当成「已被拒绝记账过」，于是这一整轮失败在 journal 里是 `errors: 0`。**P-0034** 修的是记账，不改派发、不改 verdict；两条红测试见 `docs/patches/P-0034-unbooked-failure.md`。适配器那一半仍是上游的。 |
| L-0033 | <https://github.com/deepseek-ai/deepseek-harness/discussions/6035> | `dsh` | `full` | 2026-09-09 | 0.1.2-rc.1（0.1.5-alpha.1 未修） | `UNKNOWN_TOOL` | `llm/stream` | **rejected (dup)** | R45：报告里的会话证据是 `tool-call` 的 `id` 与 `name` 都是空字符串，adapter 的 `closeBlock()` 把 `block.name ?? ""` 原样写出——与本机 P-0033 的形状同族（#13211，rc.3 实测）。P-0033 已经把这种调用改成 `call_remedy_<n>` + `remedy_unattributed`，并把 turn 留在可继续的状态；报告版本更早，不额外发补丁。 |
| L-0034 | <https://github.com/deepseek-ai/deepseek-harness/discussions/9066> | `dsh` | `full` | 2026-10-07 | 0.2.0-rc.2（pi-ai 0.87.x） | `MALFORMED_RESPONSE`（被吞） | out-of-seam（adapter） | **rejected (out-of-seam)** | R45：报告描述的是 **adapter 在我们看见之前**就把坏参数换成 `{}`（`pi-ai` 的 `arguments` 解析把它们编成空对象），于是工具带空输入运行。接缝这一侧收到的已经是合法的 `{}`——那是模型可能真的发过的形状，我们无法诚实地指认它。修法只能在上游（携带 `rawArguments`），不在这里假装。**同时记下边界**：P-0033 的 limits 已经写明「解析成非对象的 arguments 不动」，本轮不改。 |
| L-0035 | <https://github.com/deepseek-ai/deepseek-harness/discussions/12318> | `dsh` | `full` | 2026-11-05 | **0.2.2-rc.1** | unknown | `profile` | **patched** | R46：`cordis.patch.yml` 里指向已被删除的子路径导出（`…/list-agents`），插件加载失败报 `never started`，于是**每一次 resume 都失败**，而界面看起来只是「某个会话坏了」。我们的 patch 层现在只挂裸包名，但没有任何判据检查这条承诺。**P-0035** 把「每个 row 的 `name:` 必须能在 manifest 的 exports 里解析、目标文件必须已构建」变成测试，并用这条上游 row 做负对照；0 运行时字节。 |
| L-0036 | <https://github.com/deepseek-ai/deepseek-harness/discussions/13069> | `dsh` | `full` | 2026-11 | ? | unknown（无 finish 的流） | `agent/request-error` | watching | R45：报告说「无 finish 的流被当正常结束」。本机 9 401 条 attempt 记录里确有 **6 条无 finish**（`docs/research/failure-map-2026-11-10.md`），但我们**没能证明**宿主把这种流当成功——上游 `translate()` 在 `message_stop` 之前结束会抛 `STREAM_CLOSED`，那会走 throw 路径（已记 `errors`）。还缺的证据：一个脚本化 provider 在发完 `block-end` 后直接关连接，看 `turn/end` 是 `completed` 还是 `error`。没有这条证据就不发补丁。 |

## G. 同接缝的其他项目与上游源码（2026-11-14 读到的）

| id | source | source_kind | read_depth | reported | version | class | seam | status | decision |
|---|---|---|---|---|---|---|---|---|---|
| L-0037 | <https://dshplugin.online/plugins/udsy19--dsh-toolcall-stream-repair> | `market` | `full` | 2026-11 | ? | `MALFORMED_RESPONSE` | `llm/stream` | **patched** | R47：竞品 0.1.0 有 11 个 repair code，其中 `empty-id-clobber` 与我们的 P-0033 边界正好拼上——它修的是「同一 index 的后续 delta 带 `id: ""` 把先到的真 id 擦掉」。本机 `app.asar` 逐行确认（`assembler.ts:72` 无守卫、`:73` 有守卫、`:115` 的 `??` 不兜空串），于是做成 **P-0036**。**只借机制，不抄代码**；它的 `jsonrepair` 路线不采用（见 L-0038 的同类理由）。 |
| L-0038 | <https://sandbaseai.github.io/deepseek-harness-handbook/streamed-tool-call-identity.html> | `code` | `full` | 2026-08-28 | `b150a55` + `cd5ef81` | unknown | `llm/stream` | **rejected (dup)** | R47：这份手册把我们已知的两件事写全了——空身份链（已由 P-0033/P-0036 覆盖）与 `assembler.ts:187` 的「没有 finish 就读成 `stop`」。后者就是 **L-0036** 缺的宿主半边，现在**有源码**了；但补 `stop` 是重复宿主的假设、补 `error` 是编造，所以 L-0036 保持 `watching`，本轮只把它的证据等级从「需要脚本化 provider」升到「读过宿主源码」。 |

## 下一会话的前三条（按优先级）

> **R43 结案 L-0001 / L-0002 / L-0010；R45 结案 L-0032（P-0034）与 L-0033 / L-0034 / L-0024；
> R46 结案 L-0035（P-0035）。** 下一条候选从 A 表与 F 表里取：
> L-0003（大参数 invalid JSON，先判截断/粘连/裸值）、L-0004（尾部多 `"]"`）、L-0009（relay 改工具名大小写）。

1. **L-0001（#12901，reused index 合并）**：已结案为 dup；剩余动作只有适配器边界回放（可选）。
2. **L-0002（#13211，rc.3 空 tool call）**：已由 P-0033 覆盖，`patched`。
3. **L-0010（#12064，adapter 静默吞错）**：out-of-seam，保留 `watching`；接缝内的下半截
   （非对象参数）仍是候选，但 L-0034 已经说明为什么它和「被 adapter 换成 `{}`」不是同一件事。
4. **L-0036（#13069，无 finish 的流）**：`watching`，缺一个脚本化 provider 的实测。

复现任何一条之前，先看**字节账**：plugin 82 957 / 83 000（只剩 43 B），core 101 597 / 104 000，
registry 67 710 / 68 000（只剩 290 B）。新的常驻字节必须先付账（压散文或去重），不许抬 cap。
