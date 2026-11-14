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

| id | source | reported | version | class | seam | status | decision |
|---|---|---|---|---|---|---|---|
| L-0001 | <https://github.com/deepseek-ai/deepseek-harness/discussions/12901> | 2026-11 | ? | `MALFORMED_RESPONSE`? | `llm/stream` | **rejected (dup)** | R43：与 P-0001 同形状——报告里两条都是同一个工具（`bash`），粘连文本在 `block-end`/`finish` 被拆成两个调用，用户可见的失败已由 P-0001 的夹具与 live 产物覆盖。第二个调用的真 id 在 `pi-ai` 的 `ensureToolCallBlock`（本机 `@earendil-works/pi-ai@0.82.1` 副本逐字确认：先按 index 找 block，没有结构闭合守卫）里就丢了，属上游；我们修不到那一半。适配器边界回放留作下一步（未在本轮重测，见 decision 的诚实边界）。 |
| L-0002 | <https://github.com/deepseek-ai/deepseek-harness/discussions/13211> | 2026-11 | **0.2.2-rc.3** | `MALFORMED_RESPONSE`? | `llm/stream` | **patched** | R43：本机接缝复现了同一形状（`block {id:'', name:'', arguments:'{}'}` + 正常 finish），旧构建只记 `refused` 然后原样放行，宿主把空 callId 写进 V4、会话不可 resume。**P-0033** 改为合成可追踪 id + `remedy_unattributed`；四条新测试先红后绿，见 `docs/patches/P-0033-empty-identity.md`。上游「提交前校验完整调用」的部分仍是 out-of-seam。 |
| L-0003 | <https://github.com/deepseek-ai/deepseek-harness/discussions/11843> | 2026-11 | ? | `MALFORMED_RESPONSE` | `llm/stream` | lead | 大参数导致 invalid JSON；抽最小形状，确认是截断、粘连还是裸值（P-0005 已覆盖后者）。 |
| L-0004 | <https://github.com/deepseek-ai/deepseek-harness/discussions/12819> | 2026-11 | 0.2.2-rc.1 | `MALFORMED_RESPONSE` | `llm/stream` | lead | 尾部多一个 `"]"`；这是「单个坏对象」还是「粘连后截断」？前者 P-0003 拒绝、后者 P-0001 拆——先归类。 |
| L-0005 | <https://github.com/deepseek-ai/deepseek-harness/discussions/10195> | 2026-11 | 0.2.1-rc.2 (Windows) | `MALFORMED_RESPONSE` | `llm/stream` | lead | Windows 流式参数损坏；在 0.2.2-rc.3 上重试，记录工具名与 index。 |
| L-0006 | <https://github.com/deepseek-ai/deepseek-harness/discussions/11577> | 2026-11 | 0.2.1-rc.5 | `MALFORMED_RESPONSE` | `llm/stream` | lead | 汇总帖（#7705/#8920/#8976/#9402/#9503/#10406），附补丁建议；先读它引用的六条，去重后再复现。 |
| L-0007 | <https://github.com/deepseek-ai/deepseek-harness/discussions/8976> | 2026-11 | ? | `MALFORMED_RESPONSE` / `STREAM_CLOSED` | `llm/stream` + `agent/request-error` | lead | 46 turns lost；对照我们本机 census 的 47 次 `MALFORMED_RESPONSE`，看是不是同一类。 |
| L-0008 | <https://github.com/deepseek-ai/deepseek-harness/discussions/12628> | 2026-11 | ? | `MALFORMED_RESPONSE` | `llm/stream` | lead | 提议「降级为工具错误」；我们的立场是「修不了就抛」，评估能否用 `remedy_unattributed` 或命名诊断表达，而不是吞掉。 |
| L-0009 | <https://github.com/deepseek-ai/deepseek-harness/discussions/12769> | 2026-11 | ? | `UNKNOWN_TOOL` | `llm/stream` | lead | relay 改工具名大小写；检查我们的名字/声明查找是否大小写敏感，以及 P-0027 的归因会不会误判。 |
| L-0010 | <https://github.com/deepseek-ai/deepseek-harness/discussions/12064> | 2026-11 | ? | `MALFORMED_RESPONSE`（被吞） | **out-of-seam**（adapter） | watching | R43：`dsh-agent-loop` 的 `parseArguments` 逐字确认是 `catch { return raw }`，宿主把字符串交给工具——不修宿主。我们这条接缝能看到的下半截是「参数能 parse 但不是对象」（字符串/数组/null），可以命名并送去 `remedy_unattributed`；那是独立补丁（P-0034 候选），不塞进 P-0033。 |

## B. 流 / 会话稳定性（相邻，先判断是否本接缝）

| id | source | reported | version | class | seam | status | decision |
|---|---|---|---|---|---|---|---|
| L-0011 | <https://github.com/deepseek-ai/deepseek-harness/discussions/12688> | 2026-11 | ? | `STREAM_CLOSED` | `agent/request-error` | lead | 流被截断不重试；我们的 request-error 接缝能否看到 `STREAM_CLOSED`？先查 census 词汇。 |
| L-0012 | <https://github.com/deepseek-ai/deepseek-harness/discussions/13069> | 2026-11 | ? | unknown | `agent/request-error` | lead | 总是重试 / 无 finish 的流被当正常结束；与 P-0011 的有界重试对照，读它的 watchdog 设计。 |
| L-0013 | <https://github.com/deepseek-ai/deepseek-harness/discussions/12352> | 2026-11 | ? | unknown | out-of-seam | lead | `tool_use` 没有 `tool_result` 的会话不能续；判断 scan 能否识别为 unreadable/坏会话。 |
| L-0014 | <https://github.com/deepseek-ai/deepseek-harness/discussions/13215> | 2026-11 | ? | unknown | `cli` | lead | session-search 多词查询；与我们的 scan 无关，但可能借它的索引设计。 |
| L-0015 | <https://github.com/deepseek-ai/deepseek-harness/discussions/12104> | 2026-11 | ? | unknown | out-of-seam | lead | 等槽位的流空闲超时；记录，不碰。 |
| L-0016 | <https://github.com/deepseek-ai/deepseek-harness/discussions/11271> | 2026-11 | ? | unknown | out-of-seam | lead | 终端流冻结（并发 dispose）；与插件无关，只记录。 |

## C. profile / 插件加载（可能直接解释「装了没挂」）

| id | source | reported | version | class | seam | status | decision |
|---|---|---|---|---|---|---|---|
| L-0017 | <https://github.com/deepseek-ai/deepseek-harness/discussions/13316> | 2026-11 | ? | unknown | `profile` | lead | 「带 dsh.bundle.patch 的依赖被渲染成 bundle，但 patch 从未加载」——**先查我们自己的 `cordis.patch.yml` 在 desktop 清单里是哪一行**；若同形状，可能是「装了没挂」的外部证据。 |
| L-0018 | <https://github.com/deepseek-ai/deepseek-harness/discussions/13320> | 2026-11 | ? | unknown | out-of-seam | lead | `--dump-config` 会静默改写 package.json；记录，不碰。 |
| L-0019 | <https://github.com/deepseek-ai/deepseek-harness/discussions/12675> | 2026-11 | ? | unknown | `profile` | lead | profile `package.json` 带 BOM 导致桌面崩溃；检查我们写 profile 的脚本（copy_record / switch）是否可能写 BOM（应为 UTF-8 无 BOM）。 |
| L-0020 | <https://github.com/deepseek-ai/deepseek-harness/discussions/11182> | 2026-11 | ? | unknown | `profile` | lead | 同 L-0019（中文帖）；合并处理，不重复计。 |
| L-0021 | <https://github.com/deepseek-ai/deepseek-harness/discussions/13324> | 2026-11 | **0.2.2-rc.3** | unknown | out-of-seam（session） | lead | 写路径把非法 system/message 追加进 legacy 会话；`scan` 能否识别？只做读取器，不改宿主。 |
| L-0022 | <https://github.com/deepseek-ai/deepseek-harness/discussions/10619> | 2026-11 | 0.2.1-rc.2 | `SessionFormatError` | out-of-seam（session） | lead | L-0021 的前序；判断我们的 `scan` 的 unreadable 计数是否覆盖这个形状。 |

## D. 安全 / 参数类型 / 其他（记录，不碰或只做诊断）

| id | source | reported | version | class | seam | status | decision |
|---|---|---|---|---|---|---|---|
| L-0023 | <https://github.com/deepseek-ai/deepseek-harness/discussions/10569> | 2026-11 | 0.2.1-rc.2 | — | out-of-seam | lead | `cleanup` 扩到 `C:/` 删用户文件；**安全类，不属于本插件**；记录，必要时在 README 边界里提示。 |
| L-0024 | <https://github.com/deepseek-ai/deepseek-harness/discussions/11190> | 2026-11 | ? | unknown | `llm/stream`? | lead | 参数声明 `type:'json'` 编译成无类型 schema，值以字符串到达；**可能影响 P-0030 的 `type` 判据**——先读，再决定要不要放宽/收紧。 |
| L-0025 | <https://github.com/deepseek-ai/deepseek-harness/discussions/13035> | 2026-11 | ? | unknown | out-of-seam | lead | reviewer 用散文回答；记录。 |
| L-0026 | <https://github.com/deepseek-ai/deepseek-harness/discussions/13325> | 2026-11 | ? | unknown | out-of-seam | lead | `notifySettlement` 不唤醒空闲父级；记录。 |
| L-0027 | <https://github.com/deepseek-ai/deepseek-harness/discussions/12601> | 2026-11 | ? | unknown | `profile` | lead | 磁盘清理 + 装插件后 App 静默不启动；与 L-0019 一起看，可能是 profile 损坏类。 |

## 下一会话的前三条（按优先级）

> **R43 已处理前两条，第三条判定为 out-of-seam。** 结论在 A 表的 decision 列：
> L-0001 = P-0001 的 dup（上游丢 id），L-0002 = P-0033（已修），L-0010 = watching。
> 下一条候选：L-0003（大参数 invalid JSON，先判截断/粘连/裸值）、L-0004（尾部多 `"]"`）、
> L-0009（relay 改工具名大小写，查 P-0027 归因是否大小写敏感）。

1. **L-0001（#12901，reused index 合并）**：已结案为 dup；剩余动作只有适配器边界回放（可选）。
2. **L-0002（#13211，rc.3 空 tool call）**：已由 P-0033 覆盖，`patched`。
3. **L-0010（#12064，adapter 静默吞错）**：out-of-seam，保留 `watching`；接缝内的下半截
   （非对象参数）是下一个候选补丁。

复现任何一条之前，先看**字节账**：plugin 82 872 / 83 000（只剩 128 B），core 98 824 / 104 000，
registry 64 937 / 68 000。新的常驻字节必须先付账（压散文或去重），不许抬 cap。
