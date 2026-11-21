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
| L-0003 | <https://github.com/deepseek-ai/deepseek-harness/discussions/11843> | `dsh` | `full` | 2026-11-02 | 0.2.2-rc.1 桌面 | `MALFORMED_RESPONSE` | **out-of-seam**（adapter） | **rejected (out-of-seam)** | R49：从本机 `app.asar` 逐行读到 `dsh-llm-deepseek/lib/index.js` 的 `catch (_invalidProviderToolJson) { return malformed("tool input is invalid JSON") }`——**出错的那段参数文本不在失败消息里**（同一文件全库搜 `Received arguments` 为 0 命中），所以本接缝拿不到可修的字节。它要的「默认重试 MALFORMED_RESPONSE」已由 P-0011 的有界重试覆盖（`retryOnMalformed`，默认 0、按 `(turn,step)` 计数）。剩下的只有上游改写；`fixes` 里不写补丁号。 |
| L-0004 | <https://github.com/deepseek-ai/deepseek-harness/discussions/12819> | `dsh` | `full` | 2026-11-10 | 0.2.2-rc.1（pi-ai 路由） | `MALFORMED_RESPONSE` | `llm/stream` | **patched** | R49：报告的尾部形状是「`components` 少一个 `]`，报错位置 = 长度 − 1」，本机 `pi-ai/dist/utils/json-parse.js` 逐字确认它把原文写进 `argumentsError`（`…\n\nReceived arguments:\n${json}`），也就是 P-0001 已经在读的那个标记——所以字节到得了接缝。**P-0037**：只在「恰好一个内部插入点能 parse」时补一个闭合符，末尾插入一律拒（切尾与它形状相同）。实测 1 687 个生成形状里 604 个（35.8 %）有两个以上合法插入点，全部拒绝。 |
| L-0005 | <https://github.com/deepseek-ai/deepseek-harness/discussions/10195> | `dsh` | `full` | 2026-10 | 0.2.1-rc.2 (Windows) | `MALFORMED_RESPONSE` | **out-of-seam**（adapter） | **rejected (out-of-seam)** | R53：报告原文就指向 adapter 的 `JSON.parse(content.arguments)` + `catch (_invalidProviderToolJson) { return malformed("tool input is invalid JSON") }`。R53 在本机 `app.asar`（0.2.2-rc.3）的 `dsh-llm-deepseek/lib/index.js` 第 2057–2066 行逐字读到同一段：**抛出的句子不带参数原文**（同一文件里 `Received arguments` 命中 0 次，实测），所以本接缝拿不到可修的字节——与 L-0003 同一个结论。报告的三个建议里，`retryHints` / 降级为 tool result / raw SSE 留痕都在 adapter 侧；本接缝已有的杠杆是 P-0011 的有界重试，而本机默认路由是 pi-ai，不是 Messages。 |
| L-0006 | <https://github.com/deepseek-ai/deepseek-harness/discussions/11577> | `dsh` | `full` | 2026-11 | 0.2.1-rc.5 | `MALFORMED_RESPONSE` | `llm/stream` | **rejected (dup)** | 汇总帖（#7705/#8920/#8976/#9402/#9503/#10406），附补丁建议；先读它引用的六条，去重后再复现。 R64：汇总帖引用的六条已逐条读回（#7705/#8920/#8976/#9402/#9503/#10406）：四条是同一段 adapter 代码（`dsh-llm-deepseek` 的 `catch (_invalidProviderToolJson)`，原文不进失败消息），与 L-0003 / L-0005 的结论相同；#8976 的「默认不重试」那一半由 P-0011 覆盖；#9503 是同类平台的横评，不新增形状。没有新形状可复现，所以不成补丁。 |
| L-0007 | <https://github.com/deepseek-ai/deepseek-harness/discussions/8976> | `dsh` | `full` | 2026-10 | 0.2.0-rc.2 (macOS 审计) | `MALFORMED_RESPONSE` / `STREAM_CLOSED` | `agent/request-error` + **out-of-seam**（adapter） | **rejected (out-of-seam)** | R53：报告的两句主张分开判。**「46 turns lost」**的那一半是 adapter 抛 `MALFORMED_RESPONSE` 且默认 `retryableCodes` 不含它——这与 L-0005 是同一段代码（本机 0.2.2-rc.3 的 `dsh-llm-deepseek/lib/index.js:2057-2066` 逐字确认），原文同样不在失败消息里，所以「修参数」这一半修不到。**「默认不重试」**那一半由 P-0011 的有界重试（`retryOnMalformed`，默认 0）与宿主自己的 `retryPolicy.retryableCodes` 覆盖，报告里的 workaround 就是这个配置。改宿主默认策略不是本项目的接缝：那等于替所有部署改一条重试语义。 |
| L-0008 | <https://github.com/deepseek-ai/deepseek-harness/discussions/12628> | `dsh` | `full` | 2026-11 | ? | `MALFORMED_RESPONSE` | `llm/stream` | **rejected (no defect)** | 提议「降级为工具错误」；我们的立场是「修不了就抛」，评估能否用 `remedy_unattributed` 或命名诊断表达，而不是吞掉。 R64：报告提议「把坏调用降级为工具错误」。本项目的立场是「修不了就抛」：把 `MALFORMED_RESPONSE` 改成一次工具错误会让可见失败变成静默成功，违反 PROJECT_RULES §1。`remedy_unattributed` 已有（P-0027 / P-0033），它处理的是「名字证不出来」的片段，不是「整轮参数坏了」；后者只能由 adapter 改。判 `rejected (no defect)`：不是本接缝能做的取舍。 |
| L-0009 | <https://github.com/deepseek-ai/deepseek-harness/discussions/12769> | `dsh` | `full` | 2026-11 | ? | `UNKNOWN_TOOL` | `llm/stream` | **rejected (no defect)** | R49：R49 读 `repair-stream.ts` 的 `tools.find((tool) => tool.name === call.name)` 与 `core/attribute.ts`：名字大小写不同只会得到 `unproven`（片段照流里给的名字发出、记账 `unproven`），**不会**把片段挂到别的工具名下——最坏情况和转发原名一样，是我们能给出的最保守答案。本机 census 里也没有「名字只差大小写」的形状可复现，`unreproduced` 与 `no defect` 同时成立，按更窄的那条记。 |
| L-0010 | <https://github.com/deepseek-ai/deepseek-harness/discussions/12064> | `dsh` | `full` | 2026-11 | ? | `MALFORMED_RESPONSE`（被吞） | **out-of-seam**（adapter） | watching | R43：`dsh-agent-loop` 的 `parseArguments` 逐字确认是 `catch { return raw }`，宿主把字符串交给工具——不修宿主。我们这条接缝能看到的下半截是「参数能 parse 但不是对象」（字符串/数组/null），可以命名并送去 `remedy_unattributed`；`remedy_unattributed` 已在 P-0027 / P-0033 里，等本机出现这个下半截的形状再判是否另立规则（R64：本机 114 文件 / 396 attempts 里没有它，保持 watching）。 |

## B. 流 / 会话稳定性（相邻，先判断是否本接缝）

| id | source | source_kind | read_depth | reported | version | class | seam | status | decision |
|---|---|---|---|---|---|---|---|---|---|
| L-0011 | <https://github.com/deepseek-ai/deepseek-harness/discussions/12688> | `dsh` | `full` | 2026-11 | ? | `STREAM_CLOSED` | `agent/request-error` | watching | 流被截断不重试；我们的 request-error 接缝能否看到 `STREAM_CLOSED`？先查 census 词汇。 R64：本机 114 个会话文件的 `error_codes` 里没有 `STREAM_CLOSED`（词表：MALFORMED_RESPONSE 47、UNSUPPORTED_REASONING_EFFORT 37、SERVER 16、INVALID_REQUEST 1、MISSING_CREDENTIAL 1、UNKNOWN 1）；无 finish 的流由 R50 的两个探针判过（L-0036）。在同一个宿主上造出 `STREAM_CLOSED` 之前不改词表，也不加计数。 |
| L-0012 | <https://github.com/deepseek-ai/deepseek-harness/discussions/13069> | `dsh` | `full` | 2026-11 | ? | unknown | `agent/request-error` | **rejected (no defect)** | 总是重试 / 无 finish 的流被当正常结束；与 P-0011 的有界重试对照，读它的 watchdog 设计。 R64：与 L-0036 合并判读——无 finish 的流在本机不静默成功（`TRANSPORT`、退出 1、`turn/end error`），默认重试是 0 且由 P-0011 拥有；报告里的「总是重试」是宿主策略，不是本接缝的决定。 |
| L-0013 | <https://github.com/deepseek-ai/deepseek-harness/discussions/12352> | `dsh` | `full` | 2026-11 | ? | unknown | out-of-seam | watching | `tool_use` 没有 `tool_result` 的会话不能续；判断 scan 能否识别为 unreadable/坏会话。 R64：本机 0 个「`tool_use` 没有 `tool_result`」的会话形状（114 文件、396 attempts 里 `unreadable_lines: 0`）；`scan` 的 unreadable 计数已覆盖读不出的字节，但覆盖不到语义缺口。等形状出现再判，不预先加计数。 |
| L-0014 | <https://github.com/deepseek-ai/deepseek-harness/discussions/13215> | `dsh` | `full` | 2026-11 | ? | unknown | `cli` | **rejected (out-of-seam)** | session-search 多词查询；与我们的 scan 无关，但可能借它的索引设计。 |
| L-0015 | <https://github.com/deepseek-ai/deepseek-harness/discussions/12104> | `dsh` | `full` | 2026-11 | ? | unknown | out-of-seam | **rejected (out-of-seam)** | 等槽位的流空闲超时；记录，不碰。 |
| L-0016 | <https://github.com/deepseek-ai/deepseek-harness/discussions/11271> | `dsh` | `full` | 2026-11 | ? | unknown | out-of-seam | **rejected (out-of-seam)** | 终端流冻结（并发 dispose）；与插件无关，只记录。 |

## C. profile / 插件加载（可能直接解释「装了没挂」）

| id | source | source_kind | read_depth | reported | version | class | seam | status | decision |
|---|---|---|---|---|---|---|---|---|---|
| L-0017 | <https://github.com/deepseek-ai/deepseek-harness/discussions/13316> | `dsh` | `full` | 2026-11 | ? | unknown | `profile` | **rejected (no defect)** | 「带 dsh.bundle.patch 的依赖被渲染成 bundle，但 patch 从未加载」——**先查我们自己的 `cordis.patch.yml` 在 desktop 清单里是哪一行**；若同形状，可能是「装了没挂」的外部证据。 |
| L-0018 | <https://github.com/deepseek-ai/deepseek-harness/discussions/13320> | `dsh` | `full` | 2026-11 | ? | unknown | out-of-seam | **rejected (out-of-seam)** | `--dump-config` 会静默改写 package.json；记录，不碰。 |
| L-0019 | <https://github.com/deepseek-ai/deepseek-harness/discussions/12675> | `dsh` | `full` | 2026-11 | ? | unknown | `profile` | **rejected (no defect)** | profile `package.json` 带 BOM 导致桌面崩溃；检查我们写 profile 的脚本（copy_record / switch）是否可能写 BOM（应为 UTF-8 无 BOM）。 |
| L-0020 | <https://github.com/deepseek-ai/deepseek-harness/discussions/11182> | `dsh` | `full` | 2026-11 | ? | unknown | `profile` | **rejected (dup)** | 同 L-0019（中文帖）；合并处理，不重复计。 |
| L-0021 | <https://github.com/deepseek-ai/deepseek-harness/discussions/13324> | `dsh` | `full` | 2026-11 | **0.2.2-rc.3** | unknown | out-of-seam（session） | watching | 写路径把非法 system/message 追加进 legacy 会话；`scan` 能否识别？只做读取器，不改宿主。 R64：与本机 census 对照，0 个「非法 system/message 被写进 legacy 会话」的形状；`scan` 只读、不改宿主，等形状出现再判。 |
| L-0022 | <https://github.com/deepseek-ai/deepseek-harness/discussions/10619> | `dsh` | `full` | 2026-11 | 0.2.1-rc.2 | `SessionFormatError` | out-of-seam（session） | watching | L-0021 的前序；判断我们的 `scan` 的 unreadable 计数是否覆盖这个形状。 R64：L-0021 的前序判读；本机 `unreadable_lines: 0`，没有可对照的坏会话。保持 `watching`，不据此发补丁。 |

## D. 安全 / 参数类型 / 其他（记录，不碰或只做诊断）

| id | source | source_kind | read_depth | reported | version | class | seam | status | decision |
|---|---|---|---|---|---|---|---|---|---|
| L-0023 | <https://github.com/deepseek-ai/deepseek-harness/discussions/10569> | `dsh` | `full` | 2026-11 | 0.2.1-rc.2 | — | out-of-seam | **rejected (out-of-seam)** | `cleanup` 扩到 `C:/` 删用户文件；**安全类，不属于本插件**；记录，必要时在 README 边界里提示。 |
| L-0024 | <https://github.com/deepseek-ai/deepseek-harness/discussions/11190> | `dsh` | `full` | 2026-11 | ? | unknown | `llm/stream`? | **rejected (no defect)** | R45：读到 `packages/core/src/attribute.ts:73-76`——`valueFits` 只有在声明了 `type` 时才判类型，`type:'json'` 编译出的无类型 schema 一律返回 `true`（判为「不可判定」），所以 P-0030 的判据不会被这个形状误导，反而正是它要的那种保守方向。读取器没有第二处读 `type`。不改代码。 |
| L-0025 | <https://github.com/deepseek-ai/deepseek-harness/discussions/13035> | `dsh` | `full` | 2026-11 | ? | unknown | out-of-seam | **rejected (out-of-seam)** | reviewer 用散文回答；记录。 |
| L-0026 | <https://github.com/deepseek-ai/deepseek-harness/discussions/13325> | `dsh` | `full` | 2026-11 | ? | unknown | out-of-seam | **rejected (out-of-seam)** | `notifySettlement` 不唤醒空闲父级；记录。 |
| L-0027 | <https://github.com/deepseek-ai/deepseek-harness/discussions/12601> | `dsh` | `full` | 2026-11 | ? | unknown | `profile` | **rejected (out-of-seam)** | 磁盘清理 + 装插件后 App 静默不启动；与 L-0019 一起看，可能是 profile 损坏类。 |

## E. Reddit（只读到摘要）

> 2026-11-14 实查：`www.reddit.com` / `api.reddit.com` / `old.reddit.com` 三种入口都 `ECONNRESET`，
> 只有 `websearch` 返回标题与一两句摘要。**这四行 `read_depth: summary`，不得升到 `reproduced` 以上**，
> 除非本机复现了它描述的类。规则见 `sources.md` §2。

| id | source | source_kind | read_depth | reported | version | class | seam | status | decision |
|---|---|---|---|---|---|---|---|---|---|
| L-0028 | <https://www.reddit.com/r/DeepSeek/comments/1w0qu8q/deepseek_harness_is_frustrating_is_it_just_me/> | `reddit` | `summary` | 2026-11 | ? | unknown | out-of-seam? | watching | 摘要句："When a tool report is empty, or straight up fails, DSH moves on and claims the job is done" —— **最该命名的静默类**。只读到摘要（正文被 TLS 拒），先与 census/explain 对照，不据此发补丁。 R64：只读到摘要（正文被 TLS 拒），无法把摘要句与一个具体形状对上；本机 `completed_without_answer`（P-0047）已把「结束却没回答」命名，但报告说的「tool report 为空/失败后继续」是另一条规则（工具结果侧的静默）。没有全文就不能判，保持 `watching`。 |
| L-0029 | <https://www.reddit.com/r/LLMDevs/comments/1vyaxxw/i_built_a_deepseek_harness_plugin_that_proves_why/> | `reddit` | `summary` | 2026-11 | ? | unknown | out-of-seam | **rejected (out-of-seam)** | 竞品：把"为什么 agent 做错了"做成归因插件。摘要句："the real cause was the error message itself"。只作同类项目读法，不抄设计。 |
| L-0030 | <https://www.reddit.com/r/rust/comments/1x3xp42/does_reusing_pi_extensions_and_deepseek_harness/> | `reddit` | `summary` | 2026-11 | ? | unknown | out-of-seam | watching | 摘要句："what happens when a TS plugin hangs in the middle of a tool call" —— 插件挂起/超时类，先查 census 有没有同类，再判是否本接缝。 R64：本机 census 里没有「插件在工具调用中间挂起」的形状（aborted 11 个是人工停止）；与插件无关的那一半是宿主 watchdog，记录在 `BS-20` 之外，不碰。 |
| L-0031 | <https://www.reddit.com/r/DeepSeek/comments/1vvlnml/switched_to_deepseek_harness_your_context_didnt/> | `reddit` | `summary` | 2026-11 | ? | unknown | `profile` | **rejected (dup)** | 摘要提到 `- insert:` 与裸行被拒（"a bare row is rejected with entry mcp-deja not found"）—— 与我们 `cordis.patch.yml` 的规则同族，可作外部印证。 |

## F. R45 / R46 新读的（S-DSH 的 83 条候选里挑出来的五条）

| id | source | source_kind | read_depth | reported | version | class | seam | status | decision |
|---|---|---|---|---|---|---|---|---|---|
| L-0032 | <https://github.com/deepseek-ai/deepseek-harness/discussions/11337> | `dsh` | `full` | 2026-10-28 | Messages 路由（rc.3 之前） | `MALFORMED_RESPONSE`（`unsupported stop reason refusal`） | `llm/stream` | **patched** | R45：报告里有逐字 chunk 序列——reasoning 块正常结束，随后 `finish{kind:'error'}`，message 是 `DeepSeek Messages stream: unsupported stop reason refusal`。宿主半截已从 `app.asar` 逐行确认：`dsh-llm-deepseek/lib/index.js` 的 `stopReason()` 只接受 `end_turn` / `stop_sequence` / `tool_use` / `max_tokens`，其余走 `malformed()`。旧代码把「code 是 MALFORMED」当成「已被拒绝记账过」，于是这一整轮失败在 journal 里是 `errors: 0`。**P-0034** 修的是记账，不改派发、不改 verdict；两条红测试见 `docs/patches/P-0034-unbooked-failure.md`。适配器那一半仍是上游的。 |
| L-0033 | <https://github.com/deepseek-ai/deepseek-harness/discussions/6035> | `dsh` | `full` | 2026-09-09 | 0.1.2-rc.1（0.1.5-alpha.1 未修） | `UNKNOWN_TOOL` | `llm/stream` | **rejected (dup)** | R45：报告里的会话证据是 `tool-call` 的 `id` 与 `name` 都是空字符串，adapter 的 `closeBlock()` 把 `block.name ?? ""` 原样写出——与本机 P-0033 的形状同族（#13211，rc.3 实测）。P-0033 已经把这种调用改成 `call_remedy_<n>` + `remedy_unattributed`，并把 turn 留在可继续的状态；报告版本更早，不额外发补丁。 |
| L-0034 | <https://github.com/deepseek-ai/deepseek-harness/discussions/9066> | `dsh` | `full` | 2026-10-07 | 0.2.0-rc.2（pi-ai 0.87.x） | `MALFORMED_RESPONSE`（被吞） | out-of-seam（adapter） | **rejected (out-of-seam)** | R45：报告描述的是 **adapter 在我们看见之前**就把坏参数换成 `{}`（`pi-ai` 的 `arguments` 解析把它们编成空对象），于是工具带空输入运行。接缝这一侧收到的已经是合法的 `{}`——那是模型可能真的发过的形状，我们无法诚实地指认它。修法只能在上游（携带 `rawArguments`），不在这里假装。**同时记下边界**：P-0033 的 limits 已经写明「解析成非对象的 arguments 不动」，本轮不改。 |
| L-0035 | <https://github.com/deepseek-ai/deepseek-harness/discussions/12318> | `dsh` | `full` | 2026-11-05 | **0.2.2-rc.1** | unknown | `profile` | **patched** | R46：`cordis.patch.yml` 里指向已被删除的子路径导出（`…/list-agents`），插件加载失败报 `never started`，于是**每一次 resume 都失败**，而界面看起来只是「某个会话坏了」。我们的 patch 层现在只挂裸包名，但没有任何判据检查这条承诺。**P-0035** 把「每个 row 的 `name:` 必须能在 manifest 的 exports 里解析、目标文件必须已构建」变成测试，并用这条上游 row 做负对照；0 运行时字节。 |
| L-0036 | <https://github.com/deepseek-ai/deepseek-harness/discussions/13069> | `dsh` | `full` | 2026-11 | ? | unknown（无 finish 的流） | `agent/request-error` | **rejected (no defect)** | R50：在 Linux 真机（WSL2 + DSH 0.2.2-rc.3）上做了两个脚本化 provider 探针。**A**：发完 tool-call delta 后直接关流（无 `finish_reason`）——适配器在 `toStreamChunks` 末尾抛 `LlmError(..., "STREAM_CLOSED")`，这一轮被转成 `finish{kind:'error', failure:{code:"TRANSPORT"}}`，`turn/end` 仍是 `completed`（这是「静默」的一半，但不是 #13069 说的那一种）。**B**：每次请求都无 `finish_reason`、永不恢复——宿主重试 6 次后放弃，stderr `dsh: TRANSPORT: Stream ended without finish_reason`、退出码 1、`turn/end` `error`、journal `errors: 7`。所以「无 finish 的流被当成成功」**不成立**：它要么变成显式的 error finish，要么以 error 收尾。剩下一半（一轮静默成功）不是本接缝能修的；证据见 `data/results/live-linux-2026-11-15T10-00-00.000Z.json`。 |

## G. 同接缝的其他项目与上游源码（2026-11-14 读到的）

| id | source | source_kind | read_depth | reported | version | class | seam | status | decision |
|---|---|---|---|---|---|---|---|---|---|
| L-0037 | <https://dshplugin.online/plugins/udsy19--dsh-toolcall-stream-repair> | `market` | `full` | 2026-11 | ? | `MALFORMED_RESPONSE` | `llm/stream` | **patched** | R47：竞品 0.1.0 有 11 个 repair code，其中 `empty-id-clobber` 与我们的 P-0033 边界正好拼上——它修的是「同一 index 的后续 delta 带 `id: ""` 把先到的真 id 擦掉」。本机 `app.asar` 逐行确认（`assembler.ts:72` 无守卫、`:73` 有守卫、`:115` 的 `??` 不兜空串），于是做成 **P-0036**。**只借机制，不抄代码**；它的 `jsonrepair` 路线不采用（见 L-0038 的同类理由）。 |
| L-0038 | <https://sandbaseai.github.io/deepseek-harness-handbook/streamed-tool-call-identity.html> | `code` | `full` | 2026-08-28 | `b150a55` + `cd5ef81` | unknown | `llm/stream` | **rejected (dup)** | R47：这份手册把我们已知的两件事写全了——空身份链（已由 P-0033/P-0036 覆盖）与 `assembler.ts:187` 的「没有 finish 就读成 `stop`」。后者就是 **L-0036** 缺的宿主半边，现在**有源码**了；但补 `stop` 是重复宿主的假设、补 `error` 是编造，所以 L-0036 保持 `watching`，本轮只把它的证据等级从「需要脚本化 provider」升到「读过宿主源码」。 |

## H. R55 新读的（2026-11-16 的巡检：3 源应答，79 个候选未进账本）

> 巡检产物 `data/results/intake-2026-11-16T10-10-00.000Z.json`（S-DSH / S-SELF / S-NPM 三源都答）。
> 下面两条是 79 个候选里**与本接缝真的相接**的；其余都是 adapter / 宿主 / 前端侧（STREAM_CLOSED 的 watchdog、
> 会话写句柄、冷恢复、goal 空转等），按 §3 的阶梯判为 out-of-seam，不逐条抄进账本。

| id | source | source_kind | read_depth | reported | version | class | seam | status | decision |
|---|---|---|---|---|---|---|---|---|---|
| L-0039 | <https://github.com/deepseek-ai/deepseek-harness/discussions/12347> | `dsh` | `full` | 2026-11-10 | 0.2.1-rc.2 | `max_tokens`（空回答） | `cli`（读取器） | **patched** | R55：报告的形状是「一步把预算全花在 reasoning 上，`finish_reason: "length"`，没有 text 也没有 tool call，整轮以 `{"kind":"max-tokens"}` 收尾，`final` 打空」。本机 114 个会话文件里 **88 个 `max-tokens` turn 全部**如此（71 个只剩 `reasoning` 块、17 个没有 assistant 消息），而普查只报了 88 这个数、没说有没有回答。**P-0044** 把「最后一步有没有 text 或 tool-call」变成报告字段 `truncated_without_answer`；宿主「该不该继续」的那一半仍是 out-of-seam。见 `docs/patches/P-0044-turn-answered.md`。 |
| L-0040 | <https://github.com/deepseek-ai/deepseek-harness/discussions/13169> | `dsh` | `full` | 2026-11-14 | 0.2.2-rc.1 | unknown（`completed` 的空回答） | `cli`（读取器） | **patched** | R57：本机原本 0 例，所以 R55 只把它记成 `watch`。本轮用本地 OpenAI 兼容端点复现了形状——两次 `reasoning_content` delta 后 `finish_reason: "stop"`，适配器的空回答守卫按 **block 数**而不是可用内容判定（`mapStopReason` 的 `message.content.length === 0`），于是 turn 以 `completed` 结束、assistant 消息只有 `reasoning`；同一端点同一提示的 `text` 对照以同样方式结束。**P-0047** 让 `scan` 报 `completed_without_answer`（与 P-0044 同一条 `answer.ts` 规则、同样只看最后一步），产物 `live-completed-2026-11-16T18-30-00.000Z.json` 与 `scan-r57-2026-11-16T18-30-00.000Z.json`。上游那一半（守卫按可用内容判定）仍是 out-of-seam；本补丁只命名后果，不改宿主。 |

## 下一会话的前三条（按优先级）

> **R43 结案 L-0001 / L-0002 / L-0010；R45 结案 L-0032（P-0034）与 L-0033 / L-0034 / L-0024；
> R46 结案 L-0035（P-0035）；R49 结案 L-0004（P-0037）、L-0003 与 L-0009；R50 结案 L-0036；
> R53 结案 L-0005 与 L-0007（两条同一段 adapter 代码，原文不进失败消息）。**
> **R55 巡检结案 L-0039（P-0044）并把 L-0040 标成 watch**：两条都是「turn 结束了却什么都没回答」，
> 前者本机复现（88/88 个 `max-tokens`），后者本机 0 例，所以只落了读取器那一半。
> **A 表仍无剩余线索**；新线索从一次巡检（`scripts/collect_leads.mjs`）开始，不要从这张表里挑。

1. **L-0003（#11843，deepseek 路由的非法参数）**：`rejected (out-of-seam)`，原文不在失败消息里；
   默认重试已由 P-0011 覆盖（R49 读宿主源码确认）。
2. **L-0004（#12819，少一个 `]`）**：已由 P-0037 覆盖，`patched` 并在 Linux 真机上 `verified`；
   实测 35.8 % 的同类形状是歧义的，所以唯一性证明不是装饰。
3. **L-0009（#12769，relay 改工具名大小写）**：`rejected (no defect)`。大小写不同只会让片段落到
   `unproven`（照原名发出 + 记账），不会误挂到别的工具；本机也没有该形状可复现。
4. **L-0036（#13069，无 finish 的流）**：`rejected (no defect)`（R50）。两个脚本化 provider 探针：
   不恢复的那一支以 `dsh: TRANSPORT: Stream ended without finish_reason`、退出码 1、`turn/end error`
   收尾，而不是静默成功；能静默的只有「先失败一次、重试成功」那一支，那不是同一件事。

复现任何一条之前，先看**字节账**。它只有一个家：`docs/HANDOFF.md` 顶部的状态表
（`scripts/gate_size.mjs` 的 `handoff-bytes` 在读它）。本文件不复述那三个数：上一版复述的
R55 账在这张表里活了两轮没人发现，而它早已过期。
新的常驻字节必须先付账（压散文或去重），不许抬 cap。

## I. R66 新读的（2026-11-17 的巡检：3 源应答，76 个候选未进账本）

> 判读见 `docs/research/intake-r66-triage.md`：76 条里 68 条按标题归桶（UI / 会话持久化 / 子 agent / 性能 / 市场插件），
> 落不到本项目的四个接缝上；另外 8 条读全文，逐条在下面下结论。**没有新形状，本轮不发补丁。**

| id | source | source_kind | read_depth | reported | version | class | seam | status | decision |
|---|---|---|---|---|---|---|---|---|---|
| L-0041 | <https://github.com/deepseek-ai/deepseek-harness/discussions/13516> | `dsh` | `full` | 2026-11-16 | 0.2.0-rc.2 | `MALFORMED_RESPONSE` | **out-of-seam**（adapter） | **rejected (dup)** | R66：与 L-0003 / L-0005 是同一条 adapter 代码路径（`dsh-llm-deepseek` 的 `tool input is invalid JSON`，出错的那段参数文本不进失败消息），本接缝拿不到可修的字节；「把 `MALFORMED_RESPONSE` 纳入默认重试」那一半由 P-0011 的 `retryOnMalformed` 覆盖（默认 0、按 `(turn,step)` 计数）。判 dup。 |
| L-0042 | <https://github.com/deepseek-ai/deepseek-harness/discussions/12933> | `dsh` | `full` | 2026-11-11 | 0.2.2-rc.1 | unknown | **out-of-seam**（host bridge） | **rejected (out-of-seam)** | R66：宿主把对象参数串成字符串之后才交给工具校验（zod 报 `expected object, received string`），错在派发前的桥接，不在 `llm/stream` 读到的 arguments 文本；本项目的 `attribute.ts` 只判片段能否归因，不改桥接。记录，不碰。 |
| L-0043 | <https://github.com/deepseek-ai/deepseek-harness/discussions/12673> | `dsh` | `full` | 2026-11-08 | 0.2.1-rc.2 | unknown | **out-of-seam**（stop-reason） | **rejected (dup)** | R66：`mapStopReason` 用块数判空是宿主守卫；本项目问的是同一个问题的会话侧——P-0047 / P-0052 已经数「`completed` 却没回答」与「停在 tool-call」，`core/answer.ts` 也不把 reasoning 与空白算回答。改宿主的 stop 分支不是本接缝，判 dup。 |
| L-0044 | <https://github.com/deepseek-ai/deepseek-harness/discussions/9721> | `dsh` | `full` | 2026-10-15 | 0.2.0-rc.2 | `MALFORMED_RESPONSE` | **out-of-seam**（adapter） | **rejected (out-of-seam)** | R66：`SSE event type mismatch` 由 adapter 解析帧时抛出，失败消息不带原始帧，与 L-0003 同一条「字节到不了接缝」的边界；它的建议（默认重试）与 L-0007 同一取舍，由 P-0011 的有界重试应对。记录，不碰。 |
| L-0045 | <https://github.com/deepseek-ai/deepseek-harness/discussions/9789> | `dsh` | `full` | 2026-10-15 | 0.1.5-rc.3 | `STREAM_CLOSED` | `agent/request-error` | **rejected (dup)** | R66：与 L-0011 同一类；报告补上了两个 300 秒闸门（`LLM_STREAM_IDLE_TIMEOUT` 与 undici `bodyTimeout`），但本机 census 里仍是 0 个 `STREAM_CLOSED`（114 文件，词表见 L-0011）。同一个宿主上造出形状之前不改词表、不加计数，判 dup。 |
| L-0046 | <https://github.com/deepseek-ai/deepseek-harness/discussions/11123> | `dsh` | `full` | 2026-10-26 | 0.2.1-rc.3 | `PI_AI_ERROR` | **out-of-seam**（adapter） | **rejected (out-of-seam)** | R66：adapter 把多种上游终止原因压成 `content_filter` + `PI_AI_ERROR`，可诊断性差；但被抹掉的原始原因 `llm/stream` 看不到。本项目只命名本机真见过的类，而本机 census 没有这个形状（L-0011 的规则）。记录，不碰。 |
| L-0047 | <https://github.com/deepseek-ai/deepseek-harness/discussions/13135> | `dsh` | `full` | 2026-11-12 | 0.2.2-rc.1 | `UNKNOWN_TOOL` | `cli` | **rejected (dup)** | R66：与 P-0050 同族但触发不同——那边是 resume header 丢掉会话调过的工具，这边是 profile 的 baseline 工具全没了、请求变成全 defer；`core/capability.ts` 的规则要求「调过、后来不再声明」，本机没有这个形状，先不扩规则，判 dup。 |
| L-0048 | <https://github.com/deepseek-ai/deepseek-harness/discussions/8192> | `dsh` | `full` | 2026-09-29 | ? | `MALFORMED_RESPONSE` | `llm/stream` | **rejected (no defect)** | R66：提议对坏/截断的 DSML 调用做「临时恢复」；截断的尾巴缺失，补出来就是派发一个模型没做过的调用（PROJECT_RULES §1、P-0037 的边界）。与 L-0008 同一取舍，判 no defect。 |

| L-0049 | <https://github.com/deepseek-ai/deepseek-harness/discussions/11151> | `dsh` | `full` | 2026-10-27 | pi-ai v2（rc.2 起） | `SessionFormatError`（空 tool identity） | `llm/stream` | **patched（P-0033 + P-0027）** | R71 本机复现：邻居插件在真 turn 里递 `id="" name=""` 的 `block-end`，**无插件**的对照逐字死在 `format v4 tool/result at seq 19 requires toolCallId matching its tool source`（无 `turn/end`，退出 1）。本树铸 id（P-0033）并用兜底名（P-0027）发出，turn `completed`、宿主回 `UNKNOWN_TOOL`。证据 `data/results/live-identity-2026-11-18T22-40-00.000Z.json`；报告建议在 `llm-pi-ai` 的 `toolcall_end` 补空身份校验，那是 adapter，out-of-seam。 |
| L-0050 | <https://github.com/deepseek-ai/deepseek-harness/discussions/10732> | `dsh` | `full` | 2026-10-23 | pi-ai v2（rc.2 起） | `SessionFormatError`（空 tool identity） | `llm/stream` | **rejected (dup)** | 与 L-0049 同一条链路、同一份会话（`session-20fc753c…`），只是附了 fork 的修复；判 dup，结论与证据合并到 L-0049。 |
| L-0051 | <https://github.com/deepseek-ai/deepseek-harness/discussions/13611> | `dsh` | `title` | 2026-11-18 | ? | `MALFORMED_RESPONSE`（stop_reason `refusal`） | out-of-seam（adapter） | **rejected (dup)** | R71 只读摘要（标题级）：与 L-0043 / P-0034 是同一类——适配器把合法 stop reason 当未知、抛 `MALFORMED_RESPONSE`；P-0034 只负责「本接缝把它记成一次 error 而不是安静」，`stopReason()` 不在本接缝。 |

## J. R74 新读的（2026-11-19 的巡检：四源应答，65 个候选未进账本）

> 判读见 `docs/research/intake-r74-triage.md`：65 条按标题归九桶（每条恰好一次），
> 三条可能碰到本接缝的读了全文——都不落回本项目的四个接缝，所以没有新补丁。

| id | source | source_kind | read_depth | reported | version | class | seam | status | decision |
|---|---|---|---|---|---|---|---|---|---|
| L-0052 | <https://github.com/deepseek-ai/deepseek-harness/discussions/13153> | `dsh` | `full` | 2026-11 | 0.2.2-rc.2 | unknown (`Cannot read properties of undefined (reading 'kind')`) | `agent/pre-step` | **rejected (out-of-seam)** | R74：第三方 `dsh-repeat-tool-reminder` 的监听器无守卫地读 `message.source.kind`，pre-step 批次里没有 `source` 的消息会让整轮失败。本项目只在 P-0015 里**测量**这条接缝，没有挂载产品（桌面 UI 还把拒绝画成已完成），所以别的插件在这里崩溃修不到；与 #7363 同族，记录不碰。 |
| L-0053 | <https://github.com/deepseek-ai/deepseek-harness/discussions/13336> | `dsh` | `full` | 2026-11 | 0.2.2-rc.3 | `INVALID_REQUEST`（空 user message） | out-of-seam（session writer） | **rejected (out-of-seam)** | R74：失败轮点「继续」会把空内容 user message 写进会话，严格的 OpenAI 兼容网关随后每轮回 400，`INVALID_REQUEST` 又不可继续。缺的是宿主的写句柄与 continuation 策略；我们的 `scan`/`explain` 只读这些会话，不改宿主。属 L-0021/L-0022 同族，记录不碰。 |
| L-0054 | <https://github.com/deepseek-ai/deepseek-harness/discussions/13637> | `dsh` | `full` | 2026-11 | ? | `PI_AI_ERROR`（content_filter） | out-of-seam（adapter） | **rejected (dup)** | R74：adapter 把 `content_filter` 压成 `PI_AI_ERROR`，既不在 `DEFAULT_RETRYABLE_CODES` 也不在 `CONTINUABLE_FAILURES`。这与 L-0046 是同一条 adapter 边界；P-0034 只负责本接缝看到它时记成一次 error，不改 `classifyPiAiError`。判 dup。 |

## K. R85 新读的（2026-11-21 的巡检：四源应答，62 个候选未进账本）

> 判读见 `docs/research/intake-r85-triage.md`（62 条按标题归八桶、每条恰好一次）与
> `negative-feedback-2026-11-21.md`（web 半边当天没有新的负面文章）。
> 13 条读了全文；只有 #13983 的形状在本机复现，其余为已覆盖或 out-of-seam。没有新补丁。

| id | source | source_kind | read_depth | reported | version | class | seam | status | decision |
|---|---|---|---|---|---|---|---|---|---|
| L-0055 | <https://github.com/deepseek-ai/deepseek-harness/discussions/13983> | `dsh` | `full` | 2026-11-21 | 0.2.2-rc.5 | `MALFORMED_RESPONSE`（粘连参数） | `llm/stream` | **patched（P-0001）** | R85：报告中的 `Received arguments:` 后是两个完整 JSON 对象；本机用 shipped engine 复现该形状——两段各自 parse、两个唯一 id，证据 `live-external-fusion-2026-11-21T16-25-00.000Z.json`。外部测到 18/39 轮挂掉与网关 index 冲突属上游；报告建议保留错误文本正是 P-0001 的输入契约。 |
| L-0056 | <https://github.com/deepseek-ai/deepseek-harness/discussions/13945> | `dsh` | `full` | 2026-11-20 | 0.2.1-rc.5（也查了 rc.5/master） | `SessionFormatError`（空 tool identity） | `llm/stream` | **patched（P-0033 + P-0027）** | R85：Kimi `openai-responses` 路由的空名与空 provider id 让 V4 replay 每轮 400；P-0033 铸可追踪 id、P-0027 给兜底名，本机已有 pi-ai 路由的 `live-identity-*` 见证，该路由特有的 replay 行为未在本机量。 |
| L-0057 | <https://github.com/deepseek-ai/deepseek-harness/discussions/13822> | `dsh` | `full` | 2026-11-19 | 0.2.1-rc.3 | `completed_without_answer`（reasoning-only） | `cli` | **patched（P-0047）** | R85：`completed` 的 assistant 只有 reasoning、没有 text 也没有 tool call，正是 P-0047 的形状；本机探针 `live-completed-*` 已证明 `scan` 能命名。宿主 `EMPTY_RESPONSE` 重试策略不归本接缝。 |
| L-0058 | <https://github.com/deepseek-ai/deepseek-harness/discussions/13787> | `dsh` | `full` | 2026-11-19 | 0.2.2-rc.5 | `PI_AI_ERROR`（未枚举的 stop reason） | out-of-seam（adapter） | **rejected (out-of-seam)** | R85：Vertex 返回的 finishReason 不在 `@google/genai` 枚举里，pi-ai `mapStopReason()` 直接 throw；P-0034 只命名本侧看到的失败，改不到 adapter 的映射表。 |
| L-0059 | <https://github.com/deepseek-ai/deepseek-harness/discussions/13803> | `dsh` | `full` | 2026-11-19 | 0.2.2-rc.2 | `MALFORMED_RESPONSE`（非法 JSON 转义） | out-of-seam（adapter） | **rejected (dup)** | R85：`input_json_delta` 里的 `\$` 让 Messages adapter 的 `JSON.parse` 整轮拒绝，失败消息不带原始参数文本；与 L-0003/L-0005 同一段 catch，本机 cense 也没有该形状。 |
| L-0060 | <https://github.com/deepseek-ai/deepseek-harness/discussions/13790> | `dsh` | `full` | 2026-11-19 | 0.2.2-rc.3 | `INVALID_REQUEST`（未完成的工具调用） | out-of-seam（session/adapter） | **rejected (out-of-seam)** | R85：进程被杀后 `tool_use` 没有 `tool_result`，DeepSeek Messages 的历史校验让该会话每轮失败；pi-ai 有补结果兜底而该 adapter 没有。宿主的补结果策略不归本接缝。 |
| L-0061 | <https://github.com/deepseek-ai/deepseek-harness/discussions/13916> | `dsh` | `full` | 2026-11-20 | 0.2.2-rc.1 | 会话日志坏行 | `cli`（离线读取器） | **rejected (out-of-seam)** | R85：一条截断的 `tool/result` 让宿主 resume exit 1。我们的 `scan` 只数 `unreadable_lines`（本机 0），不修宿主的逐行解析；不据此加补丁。 |
| L-0062 | <https://github.com/deepseek-ai/deepseek-harness/discussions/10877> | `dsh` | `full` | 2026-10-24 | nightly 44.7.0 | `INVALID_REQUEST`（消息缺 role） | out-of-seam（agent.inject） | **rejected (out-of-seam)** | R85：`agent.inject()` 不做运行时校验，坏消息被持久化后每轮 422。本项目只在 P-0015 里测量 `agent/pre-step`，没有挂 `inject`。 |
| L-0063 | <https://github.com/deepseek-ai/deepseek-harness/discussions/14003> | `dsh` | `full` | 2026-11-21 | 0.2.2-rc.5 | skill frontmatter 静默失败 | out-of-seam（skill 发现） | **rejected (out-of-seam)** | R85：YAML description 里未加引号的冒号让 skill 在斜杠菜单里消失且没有任何警告；不是本项目的四个接缝，只记录不碰。 |
| L-0064 | <https://github.com/deepseek-ai/deepseek-harness/discussions/12348> | `dsh` | `full` | 2026-11-05 | ? | `UNKNOWN_TOOL`（capability drift） | `cli` | **rejected (dup)** | R85：跨 profile resume 丢掉已调过的工具，与 L-0047 / P-0050 同族；本机 census 已有 9 对实测 drift，规则在 `core/capability.ts`，不重复开补丁。 |
| L-0065 | <https://github.com/deepseek-ai/deepseek-harness/discussions/12057> | `dsh` | `full` | 2026-11-03 | 0.2.1-rc.3（声明支持 rc.3+） | 同类插件（并行提示） | out-of-seam | **rejected (out-of-seam)** | R85：第三方并行调度提示插件，报告了多调用轮占比 3.2% → 22.6% 的自测。只读设计，不抄代码；本项目不注入提示，也没有调度接缝。 |
| L-0066 | <https://github.com/deepseek-ai/deepseek-harness/discussions/12102> | `dsh` | `full` | 2026-11-04 | ? | 性能抱怨（写代码越来越慢） | out-of-seam | **rejected (out-of-seam)** | R85：用户抱怨 DSH 变慢并求插件配置建议，没有可复现的形状，也没有落回四个接缝；只作推广语境，不据此扩张范围到性能或插件推荐。 |

