# dsh-remedy 稳定性 / 轻量性审计（2026-11-10）

> **性质**：只读审计，仅落本文件。未改源码、未跑 `build` / `verify` / `gate` / `npm pack`。
> **基线**（按 Lead 口述与仓库文档）：审计开始时 `pnpm run verify` = 97 tests / 5 gates、`--mutate` = 5-5；
> 审计结束时 Lead 已把计数推到 111 tests（`docs/HANDOFF.md:12`）。本报告两处口径都标注，不自作主张合并。
> **证据方式**：逐行读源码 + 读 `packages/plugin/dist/` 与 `.tmp/pack/live5/dsh-remedy-0.1.1.tgz` 的
> 文件清单（`tar -tzvf` 只读列举，未解包执行）。
> **受限项**：本机 `.npmrc` 读取被安全网拦截；`ops_bash` 在本会话多次 `EXECUTOR_UNAVAILABLE`
> （Niubash 执行树链接数不匹配），因此若干逐字节比较（如 tarball 内 `.sha256` 内容）未做，
> 相关结论只基于文件清单与源码。
> **审计期间源码在动**：Lead 同步改写了 `repair-stream.ts`（415 → 561 行）与 `toolcall-repair.ts`
> （153 → 162 行）并补了 8 条测试。因此 §0 的摘要表是 07:56Z 快照，**§0.1 才是当前状态**；
> §1.1–§1.6 保留旧行号是为了给因果链，§1.7/§1.8 与 §2 用新行号。

严重度定义：**S1 = 会把错误派发出去或让“全有或全无”失效**；**S2 = 会让计数器/证据失真，或让可修复变成不可修复**；
**S3 = 可维护性 / 体积 / 门禁脆性**。

---

## 0. 结论摘要

> 下表是**审计开始（约 07:56Z）**的快照，保留是为了记录“当时的源码确实有这些问题”以及它们的位置。
> Lead 在审计期间重写了两个核心文件并补了 8 条测试，**多数条目已修**；当前状态与最新行号见 §0.1，
> §1.7/§2/§4 用新行号。第 1-3 节凡与 §0.1 冲突处，以 §0.1 为准。
> **仍然成立的**：下表 #4（合成 index / 配对 `block-start`）、#6（`recordRejected` 计入 `fused`）、
> #8（重复 `finish` 静默吞掉）、#5b 的计数口径（见 §1.7 N2）、#14（测试写盘）、#15（`workspace:*`），
> 外加 §1.7 新增的 N1（撤销不回退 `maxCalls` 预算）与 §1.9 的 N4（`finish{error}` 不计 `errors`）。#13（sourcemap 体积）与 #16（快照排序）
> 已在审计期间修掉。其余各条也已修，逐条状态见 §0.1。

| # | 级别 | 问题（07:56Z 时的形态） | 位置（旧行号） |
|---|------|------|------|
| 1 | S1 | “全有或全无”只在 `finish` 路径成立；`block-end` 路径是逐块立即修复，可发布半修复的 turn | `packages/plugin/src/repair-stream.ts:340-368` vs `:251-309` |
| 2 | S1 | 修复后的 `finish{stop}` **丢弃 `replayState`**，且合成 id 无上游身份，transcript 回放未验证 | `packages/plugin/src/repair-stream.ts:384`、`:411`、`packages/core/src/toolcall-repair.ts:140` |
| 3 | S1 | `name` 缺失 / 中途变化没有守卫，拆分结果整段沿用**最后一个 name**（真实夹具正是 `ops_bash` + `read` 混粘） | `packages/plugin/src/repair-stream.ts:327`、`packages/core/src/toolcall-repair.ts:141`、`packages/plugin/src/repair-stream.ts:198` |
| 4 | S1 | 合成 block 的 `index` 取 `highestIndex+1`，越过中间的 text block，且没有配对的 `block-start` | `packages/plugin/src/repair-stream.ts:236-239`、`:295`、`:353` |
| 5 | S2 | 截断承诺两个漏洞：(a) `open` 已空时 `recordTruncated()` 不执行，截断零留痕；(b) `block-end` 先于 `finish{max-tokens}` 时修复已派出，与“截断绝不修复”的文档措辞冲突 | `packages/plugin/src/repair-stream.ts:376-379`、`:346-354`；`README.md:86`、`SECURITY.md:29` |
| 6 | S2 | `recordRejected` 同时 `fused += 1`，把“非粘连的坏 JSON”记成粘连，verdict 误降 `degraded`（并削弱 BS-01 的证据基础） | `packages/plugin/src/repair-stream.ts:118-122`、`:355-357` |
| 7 | S2 | `argumentsDelta` 缺失时 `text += undefined` 把字面量 `"undefined"` 拼进缓冲 | `packages/plugin/src/repair-stream.ts:328` |
| 8 | S2 | 重复 `finish` 只认第一个并 `return`；`finish` 之后的任何 chunk 被吞 | `packages/plugin/src/repair-stream.ts:374-390` |
| 9 | S2 | consumer 提前 `return` 时未决缓冲被静默丢弃，但 `streams` 仍 +1，verdict 会显示 `quiet` | `packages/plugin/src/repair-stream.ts:412-413`、`:223` |
| 10 | S2 | `maxCalls` 只按“单个 fuse block”计，单条流内聚合无上限 | `packages/core/src/toolcall-repair.ts:116-119` |
| 11 | S2 | 两个不同 index 复用了同一 `call.id` 时会产出重复合成 id（`taken` 在每个 candidate 内重建） | `packages/plugin/src/repair-stream.ts:278-281`、`packages/core/src/toolcall-repair.ts:136-142` |
| 12 | S2 | `planRescue` / `block-end` 路径合成出的 id 都没回写 `seenIds`，后续同 id 再合成会撞车 | `packages/plugin/src/repair-stream.ts:345-354`、`:278-281` |
| 13 | S3 | dist 携带 10 个 sourcemap（41 926 字节，占未压缩载荷 42.6%），且无 `sourcesContent` | `tsconfig.base.json:16-18` |
| 14 | S3 | `pnpm test` 会写 `packages/plugin/fixtures/`（测试并非只读），并可能遮蔽陈旧副本 | `tests/unit/fixtures-sync.test.ts:14,29`、`packages/plugin/src/cli.ts:110-118` |
| 15 | S3 | `dependencies: workspace:*` 发布时被擦成精确版本，core 被硬钉在同一版本 | `packages/plugin/package.json:60-62` |
| 16 | S3 | `gate_registry` 用文件名字典序取 “latest”，不同精度 stamp 会选错快照 | `scripts/gate_registry.mjs:42-47` |

其余（当时未被列进上表、但同样成立）：`engines.dsh` 窗口过窄、`prepack` 在只读签出下会失败、
`fixtureDir()` 在源码检出里优先读“生成副本”而非 canonical、测试解析到 `dist` 而非 `src`。
根目录遗留 scratch 文件这一条已在审计期间删掉（见 §3.5 末尾的现状块）。
详见 §3.5、§5、§6。

---

## 0.1 审计期间的状态变化（复核时间 2026-11-10T08:25Z 前后）

Lead 在审计进行中已把两个核心文件改写：`packages/plugin/src/repair-stream.ts`
从 415 行 → **561 行**（18 848 B），`packages/core/src/toolcall-repair.ts` 153 行 → **162 行**（5 635 B），
并补了负对照测试：`tests/unit/repair-stream.test.ts` 从 213 → 356 行（新增段 `:215-356`，8 条）、
`tests/unit/toolcall-repair.test.ts` +2 条、新增 `tests/unit/package-files.test.ts` 4 条，合计 **14 条**。

> **一处台账小出入**：`docs/HANDOFF.md:63-64` 写“新增 12 条负对照测……总计 97 → 111”，
> 但 8+2+4=14，且 97→111 正是 +14 —— 数字“12”应为 14。没有门禁校验测试计数，所以不影响被判绿，
> 但下一位对账时会卡一下，建议顺手改掉。

下表的状态以 08:40Z 之后读到的源码为准，行号也换成新版本（561 行）的行号。
**已修**是源码可见；**残留**是本次审计仍然成立。

| 摘要 # | 状态 | 复核依据（新行号） |
|---|---|---|
| 1 全有或全无 | **部分修**：block-end 改为 `pending` 缓冲 + `flushPending()` + `blockRejected` 全流回滚 | `repair-stream.ts:186-192`、`:374-399`、`:481` |
| 2 `replayState` | **已修**：`stopFinish(replayState)` + 新测试 | `:282-286`、`:513`；`tests/unit/repair-stream.test.ts:217-239` |
| 3 name 缺失/变化 | **已修**：`nameConflict`、`argumentsFromFailure` 不再回落 `'unknown'`、core `missing-name` | `:262`、`:426-438`、`:215-216`；`toolcall-repair.ts:101-103` |
| 4 合成 index 越过 text 块 | **残留** | `:264-271`、`:352`、`:472` |
| 5a 截断零留痕 | **已修**：`recordTruncated()` 不再有 `open.size > 0` 条件 | `:503-506` |
| 5b 截断仍被修复 | **行为已修，计数未修**：`withdrawPending()` 让截断轮次回滚，但回滚记成 `rolled-back` 的 rejected（`fused+unrepaired` 各 +1）→ verdict 变成 `degraded` 而非 `quiet`+truncated 提示。见 §1.7 的 N2 | `:507`、`:379-384` |
| 6 `recordRejected` 计入 `fused` | **残留，且更失真**：新增 `name-changed` / `consumer-abort` / `rolled-back` 三个调用点 | `:122-126`、`:429-434`、`:552-557`、`:379-384` |
| 7 `argumentsDelta` 缺失 | **已修**：非 string 时只 `recordError()`，不拼 `undefined` | `:439-444` |
| 8 重复 `finish` 被吞 | **残留** | `:517-518` |
| 8b `pending` 与 text 块交错 | **已修**：`holding` 后所有 chunk 统一进 `pending`，顺序保持；仅剩 flush 中途退出少记 `pending.length`（S3） | `:288-292`、`:447`、`:490-492`、`:376`、`:547` |
| 8c（审计时才看清）`finish{error}` 不计 `errors` | **残留**：`:511-515` 救活路径正确不计；但 `:517` 原样透传时也没有 `recordError()`，而 `judgeRemedy` 根本不读 `errors` | `:509-518`、`:132-134`；`packages/core/src/verdict.ts:34-54` |
| 9 consumer 提前退出 | **已修**：`finally` 记 `consumer-abort` | `:546-557` |
| 10 `maxCalls` 只按单块计 | **已修**：`ceilingOf` + 全流 `synthesized` 预算 | `:224-228`、`:249`、`:273-274`、`:358`、`:465` |
| 11 合成 id 跨 candidate 重复 | **已修**：`seenIds` 回写 | `:342` |
| 12 合成 id 不回写 `seenIds` | **已修**（同上） | `:342`、`:390`、`:471` |
| 13-16 体积 / 测试写盘 / `workspace:*` / 快照排序 | **混合**：#13 体积（map 不进包）**已修**、#16 快照排序**已修**；#14 测试写盘、#15 `workspace:*` **仍残留** | 见 §3.2、§3.3、§5 |

四条**在本次审计期间**出现（或审计时才看清）、并且值得单独记住的风险（其中两条已自愈/半修，但结构仍在）：

- **N1**：`withdrawPending()`（`:507`）撤销修复时只回退 `blockRejected`，**不回退 `synthesized` 预算**
  （`:474` 已累加），于是被撤销的片数永久占着这条流的 `maxCalls` 名额（§1.7）。
- **N2**：`finish{max-tokens}` 走 `withdrawPending()` → `flushPending()` 记 `rolled-back` 的 rejected，
  这条**正常截断**的流被计成 `fused+unrepaired` → `judgeRemedy` 给出 `degraded`，
  文档承诺的“截断不修”在行为上成立、在**计数口径**上不成立（§1.7）。
- **N3（已自愈，但结构风险留存）**：审计中途 `packages/core/dist` 与 `packages/plugin/dist` 曾是**旧构建**
  （`dist/toolcall-repair.js` 无 `missing-name`、`dist/repair-stream.js` 无 `nameConflict`）。
  复核时 Lead 已重建：`packages/plugin/dist/repair-stream.js`（18 128 B，mtime 晚于 `src/repair-stream.ts`）
  已含 `nameConflict:301`、`withdrawPending:275,389`、`consumer-abort:440`；
  `packages/core/dist/toolcall-repair.js:52` 已含 `missing-name`。**但成因没消失**：全部测试
  `import 'dsh-remedy-core'` / `'dsh-remedy'`，解析到 `dist`，所以只跑 `pnpm test`（不先 `build`）
  仍会静默测旧代码。见 §5。
- **N4（审计时新看清的一条）**：`finish{kind:'error'}` 的原样透传路径（`repair-stream.ts:517`）
  **不计 `errors`**，而 `judgeRemedy` 又完全不读 `errors`（`verdict.ts:34-54`）—— 于是一次真实的
  provider 失败只留下 `streams += 1`，verdict 仍是 `quiet`。行为没被掩盖（原 chunk 照常透传），
  但“失败即失败”在**证据层**少了一条记录（§1.9）。

---

## 1. 健壮性：`repair-stream.ts` 状态机逐项

> **读法**：1.1–1.6 的引用行号属于**审计开始时**的 415 行版本，它们记录的是“当时确实存在的问题”；
> 每条开头标注的 S1/S2 指的是**当时**的严重度。当前是否还成立，看 §0.1 的状态表与 §1.7。
> 这样保留原文是为了给出可复核的因果链，而不是让它们冒充最新事实。
> **1.9 例外**：那一节用的是**当前 561 行版本**的行号（它描述的是这一版仍有、且旧版同样有的缺口）。

### 1.1 “全有或全无”并不真的全有或全无（S1，现已部分修复）

文件头注释（`packages/plugin/src/repair-stream.ts:247-250`）承诺：

> All-or-nothing: one unrepairable buffer aborts the rescue, so a turn never runs with a silently dropped call.

这个承诺只在 **`finish{kind:'error'}` 路径**成立：`planRescue()`（`:251-309`）先把所有 open 候选算完，
任一个 `rejected` 就 `return null`（`:282-285`），原始 finish 原样放行。

但 **`block-end` 路径**（`:340-368`）是**逐块、立即、互不关联**的：

```ts
} else if (result.status === 'rejected') {
  monitor.recordRejected(chunk.block.name, chunk.block.id, result.code, result.detail)
  yield chunk            // :355-357
} else {
  yield chunk            // :361-362
}
```

即：block 0 的粘连被拆成 2 个 call 并**已经 yield 出去**，随后 block 1 判定为 `rejected` 时，
没有任何回滚机制。结果是一个 turn 里“一个 call 被拆、另一个 call 原样带着坏 JSON 往下走”。

- **触发条件**：适配器在某条流里先发 `block-end`（正常的适配器就会），且流里有多于一个 tool-call block，
  其中一个可拆、另一个不可拆（例如 `max-tokens` 截断 + 粘连同时出现，或单对象语法错误）。
- **后果**：agent-loop 会先派发 2 个工具，再在后续 block 上抛 `MALFORMED_RESPONSE`；因为工具已经执行，
  失败不再是“原子失败”，而是**部分副作用 + 报错**。项目对外的“turn 不会带着被静默丢弃的 call 运行”被打破。
- **最小修法**：把 block-end 的修补延迟到流结束（或至少把已修补的 chunk 先缓存在 `pending` 数组里，
  遇到 `finish`/抛错时再决定 flush 还是丢弃并重放原始 block-end）。不要写成“再扫一遍流”的重构，
  只需在 `:350-354` 把 `yield` 换成 `pending.push(...)`，在 `finish`/`catch` 的收尾里 flush。

> **现状（08:40Z 复核）**：上面这条修法**已按原样落地** —— `PendingBlock`（`:186-192`）、
> `hold()`（`:288-292`）、`flushPending()`（`:374-399`）、`blockRejected` 全流回滚（`:481`）。
> 新测试 `tests/unit/repair-stream.test.ts:293-307` 钉住了“后一块 rejected 会撤销前一块的修复”。
> 所以 §1.1 从 S1 降为**部分修**：剩下的是 §1.7 的两个预算/计数问题，而不是“没有回滚机制”。

### 1.2 `block-end` 先到、`index` 跳变、重复 `finish`、空 `argumentsDelta`

| 异常序列 | 当前行为 | 结论 |
|---|---|---|
| `block-end` 无前置 `block-start` | `open.delete()` 空操作；`seenIds.add` + 立即判定，正常 yield（`:340-368`） | 不崩，但也没有任何计数/日志证明发生过“孤儿 block-end” |
| `block-start` 缺失、`tool-call-delta` 先到 | `open.get(...) ?? {id:'',name:'',text:''}` 现场造一个（`:325`），后续 `open.set` | 不崩；但 `name` 会留在 `''`（见 1.3） |
| `index` 跳变（0 → 7） | `highestIndex = 7`；合成块从 8 开始（`:232-239`） | 不崩；但合成块 index 与原始序列脱节（见 1.4） |
| 同一 `index` 两个 `block-end` | 第一个可能被拆成 2 块并 `open.delete`；第二个再走一遍，`seenIds` 里已有原 id | 不崩；第二次若也粘连，产出 `id#remedy-1` 可能和第一次撞（见 2.2） |
| 重复 `finish` | 第一个 `finish` 走 `yield chunk; return`（`:388-389`），第二个**永远不会被读** | 第二个被静默丢弃；若两个 finish 语义不同（先 error 后 stop），修复判定只看第一个 |
| `finish` 之后还有 chunk（如迟到的 `usage`） | 已 `return`，source 迭代器被关闭 | token 记账丢失；顺序假设未被任何断言保护 |
| `argumentsDelta` 为 `undefined`（字段缺失的畸形 chunk） | `call.text += chunk.argumentsDelta`（`:328`）→ 追加字面量 `"undefined"` | 缓冲被污染 → 拆分判定 `not-an-object-sequence` → 整条 rescue 失败 → **本可修复的修复变成不可修复** |
| 流中途 `throw`（已 `finished`） | `monitor.recordError(); throw`（`:397-399`） | 正确：失败即失败 |
| 流中途 `throw`（未 finished，非融合错误） | `planRescue` 返回 null → `recordError(); throw`（`:406-409`） | 正确 |
| consumer 提前 `return`（`for await` 里 `break`） | 生成器被 `return()`，`finally` 里 `recordStreamEnd()`（`:412-413`） | `open` 里的粘连缓冲被丢弃且**不计 `fused`/`unrepaired`**，但 `streams` 已经 +1 → verdict 从 `degraded` 变成 `quiet` |

> **现状（08:40Z）**：表里 10 行中有 2 行已修 —— `argumentsDelta` 类型守卫（`:439-444`）、
> consumer 提前退出（`:546-557` 的 `consumer-abort`）。其余仍按旧行号描述的形态存在：
> 重复 `finish` 仍是“先到先返回”（`:517-518`）、`index` 跳变仍取全局 `highestIndex+1`（`:268-271`）、
> 孤儿 `block-end` 仍无计数。逐行对照见 §0.1。

`argumentsDelta` 的最小修法（`:328`）：

```ts
call.text += typeof chunk.argumentsDelta === 'string' ? chunk.argumentsDelta : ''
```

或者在 `:328` 处改成拒绝：

```ts
if (typeof chunk.argumentsDelta !== 'string') { monitor.recordError(); throw new TypeError('tool-call-delta without argumentsDelta') }
```

二选一，不要两头都写（两头都写会让“畸形 chunk”既被静默容忍又被计数）。

consumer 提前退出的最小修法：在 `finally` 里补一笔

```ts
if (open.size > 0) { monitor.recordRejected('<abandoned>', '', 'consumer-abort', `${open.size} open call(s)`) }
```

只在 `finally` 里加，不动主流程。

### 1.3 `name` 缺失 / 变化：会派发到错误的工具（S1）

- `packages/plugin/src/repair-stream.ts:327`：

  ```ts
  if (chunk.name) call.name = chunk.name
  ```

  这是“**后写覆盖**”：如果一条流里两个 call 粘在一起、delta 携带不同 name，缓冲只保留**最后一个** name。

- `packages/core/src/toolcall-repair.ts:141`：

  ```ts
  calls.push({ id, name: call.name, arguments: JSON.stringify(value) })
  ```

  拆分出的 N 个 call **全部沿用同一个 name**。真实夹具
  `data/fixtures/toolcall-fusion/session-9045e2ec-seq-526.json:7` 恰是
  `{"command": ...}`（`ops_bash`）粘 `{"path": ...}`（`read`）——两个不同工具的调用。当前实现会把
  `{"path": "..."}` 也派发给 `ops_bash`。

- **触发条件**：粘连的两个对象本来属于不同工具（这是最自然的情形，因为粘连来自两段独立生成）。
- **后果**：第二个 call 用错误工具 + 该工具的 schema 去执行。`ops_bash` 收到一个只有 `path` 的对象，
  可能被当成“没给 command”而报参数错误，也可能被宽松 schema 接受后做错事。**这比报错更坏**。
- **最小修法**（不引入推断）：在 `repairToolCallArguments` 里增加一个拒绝码，当 `call.name.trim() === ''`
  时 `reject('missing-name', ...)`；同时在 `repair-stream.ts` 记录“本轮出现过多 name”（
  `if (chunk.name && call.name && call.name !== chunk.name) monitor.recordRejected(call.name, call.id, 'name-changed', ...)`）
  并让 `planRescue` 对 name 冲突的候选返回 null（宁可抛原始错误）。**不要**猜工具名。

- 另有一处隐式 `unknown`：`packages/plugin/src/repair-stream.ts:198`
  `const name = /Tool call "([^"]+)"/.exec(message)?.[1] ?? 'unknown'` —— 消息回退路径在解析不出工具名时，
  会以 `name: 'unknown'` 合成 block-end。下游将派发一个不存在的工具。最小修法：拿不到 name 就
  `return null`（等同 `argumentsFromFailure` 失败），而不是给 `'unknown'`。

`repairToolCallArguments` 目前**完全不检查 `name`**（`packages/core/src/toolcall-repair.ts:92-99` 只查 `id` 与空 arguments），
所以上面每条都能“成功 repaired”。这是 S1 的根因。

> **现状（08:40Z）**：已修。`toolcall-repair.ts:101-103` 新增 `reject('missing-name', ...)`；
> `repair-stream.ts:426-438` 有 `nameConflict` 守卫（`call.name !== '' && call.name !== chunk.name` → 置 flag +
> `recordRejected(..., 'name-changed', ...)`）；`argumentsFromFailure`（`:209-218`）解析不出 name 就 `return null`
> （`:215-216`），不再回落 `'unknown'`。三条都有测试：`tests/unit/repair-stream.test.ts:241-254`、`:256-272`、`:345-356`。
> **仍残留一点**：core 拆分出的 N 个 call 仍共用**同一个 name**（`toolcall-repair.ts:150`），
> 这是设计选择（不猜工具名），已由 `nameConflict` 在流层拦住，不再是 S1。

### 1.4 合成 block 的 index 与“孤儿 block-end”（S1）

```ts
const nextIndex = (): number => { highestIndex += 1; return highestIndex }   // :236-239
...
const index = offset === 0 ? (decision.index === -1 ? nextIndex() : decision.index) : nextIndex()  // :295
```

- 第一个片段保留原 index（通常是 `0` 或 `2`），**第二、第三个片段拿到 `highestIndex + 1, +2`**。
- 如果这条流里原 index 是 `0`（tool-call）、`1`（text），`highestIndex = 1`，那么拆分出的第二个 call
  得到 **index 2** —— 排在 text block **之后**。
- **后果**：(a) transcript 里工具调用的顺序被改写，紧随其后的 text/reasoning 内容位置错乱；
  (b) 那个新 index 上**从来没有 `block-start`**，只发 `block-end`。assemble 端若按
  “block-end 必须有已打开的 block” 处理，会报错或吞掉这个 call。
- **没有任何测试断言过输出的 `index` 值**：`tests/unit/repair-stream.test.ts:39-42` 只断言 `chunk.type` 序列，
  `:90-91` 只数 `block-end` 个数。
- **最小修法**：拆分时用“紧接原 index 的空位”，而不是全局最高位。即先算出本轮所有已占用 index 的集合，
  取 `decision.index + 1, +2 …`，若被占用再顺延；并在发 `block-end` 前补一个对应的 `block-start`
  （`{type:'block-start', index, blockType:'tool-call'}`）。这两处各 3-5 行，不是重构。

> **现状（08:40Z）**：**未修**，这是 §0.1 里唯一仍然成立的 S1。新行号：`nextIndex` 在 `:268-271`，
> 合成 index 计算在 `:352`（`offset === 0 ? (decision.index === -1 ? nextIndex() : decision.index) : nextIndex()`），
> block-end 的 `closeCall` 在 `:472`。新测试仍然**没有**一条断言 index（`tests/unit/repair-stream.test.ts`
> 里 `assert` 与 `.index`/`highestIndex` 同时出现的匹配数为 0）。

### 1.5 截断承诺的两个漏洞（S2）

**（a）`recordTruncated()` 只在 `open.size > 0` 时执行** —— `packages/plugin/src/repair-stream.ts:376-379`：

```ts
truncated = true
if (open.size > 0) monitor.recordTruncated()
```

- **触发条件**：被 `max-tokens` 截断的轮次里，tool-call block 已经用 `block-end` 收尾
  （`:344` 的 `open.delete` 把 `open` 清空），`finish{max-tokens}` 到达时 `open.size === 0`。
- **后果**：`truncated` 计数器保持 0；`judgeRemedy`（`packages/core/src/verdict.ts:44-49`）不会给出截断提示，
  `dsh-remedy status` 与 `data/results` 产物会把一个被截断的轮次报成正常。“截断不留痕”与本项目
  “失败即失败、证据由脚本产出”的原则相反。
- **已有测试**恰好绕过了这个缺口：`tests/unit/repair-stream.test.ts:132-142` 的截断用例
  **没有 `block-end`**，`open` 非空，所以 `truncated === 1` 是通过的。缺口是“block-end 已收尾”的序列。

**（b）`block-end` 路径的修复发生在“截断可知”之前，文档承诺因此不成立**：

- `truncated` 只在 `finish` 时置位，而 `block-end`（`:340-368`）通常**先于** `finish` 到达，
  该分支（`:346-349`）不传 `truncated`。所以“先 `block-end`（携带一个完整可拆的粘连对），
  随后 `finish{kind:'max-tokens'}`”这条序列会**真的把调用拆开并 yield 出去**，
  而 `README.md:86` / `README.zh-CN.md:86` / `SECURITY.md:29` / `packages/core/src/registry.ts:45`
  写的是“A `max-tokens` truncation is never repaired”。
- 需要说清界限（避免过度归因）：**半截文本不会被拆**。`splitTopLevelJsonObjects` 对不完整 tail 返回
  `unbalanced` / `not-an-object`（`packages/core/src/json-split.ts:44-70`），所以“把模型没写完的对象发出去”
  不会发生。真正发生的是“一个**已完整成形**的粘连对，处在一条最终被截断的流里，被当成正常轮次修复了”。
- **最小修法（一行 + 一条测试）**：`(a)` 删掉 `if (open.size > 0)`；`(b)` 给 `RepairEvent` 的 `repaired`
  加可选 `provisional?: true`，`finish{max-tokens}` 到达时把本轮 `provisional` 事件升级为带
  `truncated: true` 的备注；`judgeRemedy` 不变（`truncated` 已经进 counters）。约 10 行。
  若不愿碰计数器语义，退一步：把文档改成“被 `finish{max-tokens}` 标记的流不修”，
  并在 `audit/blind_spots.json` 补一条 BS-11 记录这条顺序依赖。

> **现状（08:40Z）**：`(a)` **已修** —— `recordTruncated()` 的 `open.size > 0` 守卫已删除，
> 现在是 `:503-506` 的 `if (chunk.reason.kind === 'max-tokens') { truncated = true; monitor.recordTruncated() }`。
> `(b)` **行为已修** —— `:507` 的 `if (chunk.reason.kind !== 'stop') withdrawPending()` 会把截断轮次的
> 修复回滚。**但计数口径没修**：回滚在 `flushPending()` 里记成 `recordRejected(..., 'rolled-back', ...)`，
> 于是 `fused += 1`、`unrepaired += 1` → verdict 变 `degraded`（§1.7 N2）。

### 1.6 `recordRejected` 把“非粘连的坏 JSON”记成粘连（S2）

```ts
recordRejected(...) { this.fused += 1; this.unrepaired += 1; ... }   // :118-122
```

- **触发条件**：`block-end` 携带一个本来就坏的单个对象（`{"a":1`），或流里任何既非粘连也无法 parse 的 call。
- **后果**：`fused` 被加 1，但这次根本不是 fusion。`judgeRemedy` 只要 `unrepaired > 0` 就返回
  `degraded`。于是与 P-0001 无关的语法错误会把 verdict 打成 `degraded`；而 `audit/blind_spots.json:7`
  （BS-01）声称“能证明粘连发生过”，其证据就是 `fused` 计数——现在它不再只表示粘连。
  已有测试 `tests/unit/toolcall-repair.test.ts:62`（`one broken object is a different defect and is rejected`）
  在 core 层区分了这两种缺陷，但**流层把区分抹掉了**。
- **最小修法**：`recordRejected` 不动 `fused`；拆成 `recordRejected`（只加 `unrepaired`）与
  `recordFusedRejected`（加两者）。调用点按 `isFusionFailure` 或“split 曾成功”判定，约 5 行，
  `RemedyCounters` 形状不变。

> **现状（08:40Z）**：**残留且更严重**。新代码在 `:122-126` 一处 `recordRejected` 上新增了三个调用点
> （`name-changed` `:429-434`、`consumer-abort` `:552-557`、`rolled-back` `:379-384`），
> 每一次都不代表“粘连被检出”，却都让 `fused += 1`。于是 `fused` 现在至少表示四类事件，
> BS-01 的证据基础被进一步稀释。这是 §0.1 里**没有随修复一起收口**的唯一计数器问题。

### 1.7 新版本的“撤销”语义有两个漏洞（S1）

这是本次审计**最重要的一条**：它由“全有或全无”的修复动作本身引入，而且新加的 8 条负对照
**一条都没有覆盖**这条路径（见 §4.2）。

新代码在 `finish` 分支里的顺序是（`packages/plugin/src/repair-stream.ts:501-519`）：

```ts
case 'finish': {
  finished = true
  if (chunk.reason.kind === 'max-tokens') {
    truncated = true
    monitor.recordTruncated()                        // :505
  }
  if (chunk.reason.kind !== 'stop') withdrawPending()  // :507
  yield* flushPending()                              // :508  ← 先派发
  if (chunk.reason.kind === 'error') {
    const plan = blockEndsSeen > 0 ? null : planRescue(chunk.reason.failure)  // :510
    ...
  }
  yield chunk                                        // :517
  return                                             // :518
}
```

**N1：撤销修复时，`synthesized` 预算没有回退。**
`:507` 的 `withdrawPending()` 只置 `blockRejected`（`:405-407`），`:508` 的 `flushPending()` 于是走
“撤销”分支（`:378-387`），把每个 `entry.synthesized` 退化成 `entry.original`。但 `synthesized`
在**派发前就已累加**（`:474` `synthesized += result.calls.length`，`:358` 同理），撤销时**没有任何减法**。
于是被撤销的片数永久占着这条流的 `maxCalls` 名额。

- 触发条件：流里先出现一个可拆的 block-end（用掉若干名额），随后任意非 stop 的 `finish`
  （`max-tokens` / `error` / `aborted`）触发撤销，之后同一条流还有第二个 block-end。
- 后果：第二个块被判 `too-many-calls`，而它其实完全在预算内。证据里出现“第二个块超预算”，
  真实原因却是“前一块的预算没退”。
- **最小修法**：让 `withdrawPending()` 返回被撤销的片数，`flushPending()` 的撤销分支把它减回
  `synthesized`（约 4 行）。**注意顺序**：`flushPending()` 在 `:508` 才执行，所以
  后续 block-end 的 `remaining()` 会立刻看到回退后的值。

> 顺带澄清一个容易误读的点：`blockRejected` 一旦置真，`:510` 的 `planRescue` 会在 `:302`
> `if (nameConflict || blockRejected) return null` 直接返回 null，所以“撤销后又把流救活”
> 这种错配**不会发生**。这一条比初稿判断的窄。

**N2：`flushPending()` 在 `finish{max-tokens}` 之后仍按“成功轮次”派发。**
`:504-505` 置了 `truncated = true` 并计数，`:507` 的 `withdrawPending()` 会置 `blockRejected`，
`:508` 于是走撤销分支 —— 从“会不会修”的角度看**这一版已经对上了文档**。
但仍有两点没对上：
- `flushPending()` 的撤销分支会 `monitor.recordRejected(..., 'rolled-back', ...)`（`:379-384`），
  于是 `unrepaired += 1`、`fused += 1`（见 §1.6）。一条**正常截断**的流会被记成“融合修复失败”，
  `judgeRemedy` 给出 `degraded` 而不是“quiet + truncated 提示”（`verdict.ts:41-53` 的 `quiet` 分支
  永远到不了，因为 `fused` 已被加过）。
  → **这一条比 N1 更会影响证据可信度**：它把“截断”（预期内、不该修）和“修复失败”（真问题）
  记成同一个计数器。
- 文档承诺 “A `max-tokens` truncation is never repaired”（`README.md:86`、`README.zh-CN.md:86`、
  `SECURITY.md:29`、`registry.ts:45`）—— 行为上成立，**计数上不成立**。
- **最小修法**：`flushPending()` 的撤销分支区分“因 reject 撤销”与“因截断撤销”，
  后者只 `yield entry.original` 不 `recordRejected`（约 3 行，新增一个 `let withdrawnForTruncation`）。
  或者：把 `withdrawPending()` 从 `:507` 移进 `:509` 的 error 分支，截断路径直接 `flushPending()`
  （截断的块本来就是“原样放行”，且 `truncated` 已进 counters）。

> 两条都指向同一处：`:507-508` 的“判定/派发顺序 + 预算回滚”。把判定全部前移到 flush 之前、
> 并让撤销同时回退 `synthesized`，是这一版最省的结构性修法（约 8-10 行，不动 core、不动类型）。

### 1.8 `pending` 缓冲让“非 tool-call 块”与修复块交错（S2 → 现降级为 S3）

`holding` 一旦为真（`:288-292` 第一次 `hold()` 之后），**所有**后续 chunk 都进 `pending`（`:447`、`:454`、
`:418`、`:497`、`:521`），所以顺序本身不会被打乱 —— 这一版比 415 行版好。
但有一处例外：非 tool-call 的 `block-end`（`:490-492`）走 `open.delete` + `hold()`，
与 tool-call 一样进队列，顺序保持。**因此 §1.8 的旧结论不再成立**，降级为 S3 备注：

- 仍然存在的风险是 `flushPending()` 使用 `pending.splice(0, pending.length)`（`:376`）一次性清空，
  若 `yield*` 期间消费者 `throw`，剩余 entry 已经离开 `pending`，`finally`（`:547`）看不到它们，
  `consumer-abort` 事件里的 `pending.length` 会是 0 → 少记。
- **最小修法**：`flushPending()` 用 `while (pending.length > 0) { const entry = pending[0]!; ... yield...; pending.shift() }`，
  每派发一条才出队（约 2 行）。

### 1.9 未被修复的 `finish{error}` 不计 `errors`（S2，新发现）

`repair-stream.ts:509-518` 的 `finish` 分支只有两条出口：

```ts
if (chunk.reason.kind === 'error') {
  const plan = blockEndsSeen > 0 ? null : planRescue(chunk.reason.failure)   // :510
  if (plan !== null) { ...; yield stopFinish(chunk.replayState); return }    // :511-515
}
yield chunk                                                                   // :517
return                                                                        // :518
```

`:511-515` 的“救活”路径不计 `errors`（正确，属于 repaired/fused）；但 `:517` 的**原样透传**路径
也没有 `monitor.recordError()`。对比 `catch` 分支（`:540`）在同样“修不了”的情形下会 `recordError()` 再抛/放行。
全文件 `recordError()` 只有三处：`:443`（非 string `argumentsDelta`）、`:531`（已 finished 后抛错）、`:540`（catch 内修不了）。

- **触发条件**：流以 `finish{kind:'error'}` 结束（例如 provider 返回 `SERVER` / `overloaded`），
  且没有 open 候选可救（`blockEndsSeen > 0`，或 `planRescue` 返回 null）。
- **后果（说准确一点）**：`finished = true` 让 `finally`（`:549`）的 `consumer-abort` 不触发，
  `open` 与 `pending` 也都为空，于是这一轮**只贡献 `streams += 1`**、`errors` 保持不变。
  `judgeRemedy` **完全不看 `errors`**（`verdict.ts:34-54` 只读 `streams` / `fused` / `unrepaired` / `truncated`），
  所以 verdict 仍是 `quiet`（"seam live, defect not seen"）—— 但这一条不该记在“缺 recordError”的账上：
  **即使补了 `recordError()`，verdict 也不会变**，只有 `formatRemedyVerdict`（`:57-66`）的
  `errors=N` 那一行会多记一次。这才是真正的结构问题：`errors` 计数存在、却不参与判定。
- **两个独立的最小修法（都很小，但别混为一谈）**：
  1. `:517` 前补一行 `if (chunk.reason.kind === 'error') monitor.recordError()`，
     并在 `tests/unit/repair-stream.test.ts:94-101` 补 `assert.equal(monitor.counters().errors, 1)`
     —— 让证据链里“provider 真的失败了”留痕（约 2 行，不动 verdict）。
  2. 若要让 verdict 反映失败，得在 `judgeRemedy` 的 `quiet` 分支上加一条
     `if (counters.errors > 0) reasons.push(...)`（**只加 reason、不改 `state`**，否则会动 verdict 词汇，
     属于另一接缝，与 BS-12 同类）。建议先做 1，2 等 P-0003 决策时一起定。
- **已有测试没钉住它**：`tests/unit/repair-stream.test.ts:94-101` 只断言
  `assert.deepEqual(output, chunks)`，**没有**断言 counters（该用例的 `errors` 期望值缺席）。
- **它还会影响对外文案**：`README.md:144` 与 `docs/copy/facts/public-repo-facts.md:74` 都写着
  “- Other stream errors: 0.”，这是 live 证据里 `errors=0` 的转述。只要这条路径不计 `errors`，
  “0” 就永远是 0 —— 一个**恒真**的数字被写进了事实包（`gate_copy` 只校验字数是否出自事实包，
  不校验事实是否可能恒真）。这属于“证据看起来在证，其实不证”的一类，比单个计数器更难发现。


---

## 2. 边界：maxCalls / id 冲突 / `#remedy-N` / existingIds

### 2.1 `maxCalls`（S2 → 现仅剩“配置透传”这一半）

- 默认 8：`packages/core/src/toolcall-repair.ts:64`（`const DEFAULT_MAX_CALLS = 8`）、`:67`（`export { DEFAULT_MAX_CALLS }`）、
  `:125`（`options.maxCalls ?? DEFAULT_MAX_CALLS`）；插件侧 `RepairStreamOptions.maxCalls`
  （`packages/plugin/src/repair-stream.ts:175-178`）与 `cordis.patch.yml:21`。
- **旧问题已修**：现在有 `ceilingOf()`（`:224-228`，非整数或 `<1` 回落默认 8）与全流预算
  `remaining()`（`:273-274`，`ceiling - synthesized`），`planRescue` 传 `maxCalls: remaining() - planned`（`:332`），
  新测试 `tests/unit/repair-stream.test.ts:309-328` 钉住了“每流上限而非每块”。
- **残留（小）**：`packages/plugin/src/index.ts:116` 把 `config.maxCalls` 直接透传，类型上不是 number 时
  靠 `ceilingOf` 兜底（行为正确，但**没有任何测试**覆盖“配置写错 → 回落默认”）。最小修法就是加一条断言：
  `repairStream(..., { maxCalls: 0 as unknown as number })` 等价于默认 8。
- **残留（中）**：撤销修复时预算**不回退**（§1.7 N1），这是新代码引入的预算侧漏洞。
- **残留（文档，S3）**：`packages/plugin/cordis.patch.yml:20` 的注释仍写 “Ceiling on calls synthesized from **one fused block**”，
  与现在的“**整条流**”语义（`repair-stream.ts:176` 的注释与 `:273-274` 的 `remaining()`）不一致。
  下一位按配置注释推理时会误以为每个 block 都有 8 个名额。最小修法：改那一行注释（1 行，无代码风险）。

### 2.2 id 冲突（S2 → 已修，仅剩 `#` 外形）

- **跨 candidate**：`planRescue` 在 `:342` 把每个 `decision.calls[*].id` 回写 `seenIds`，
  下一个 candidate 的 `taken` 因此能看到它（core 的 `new Set(existingIds)` 拷贝语义不变，但输入已更新）。
- **block-end 路径**：`:463` 先 `seenIds.add(chunk.block.id)`，`:471` 再对内联片 `seenIds.add(call.id)`，
  与 `:474` 的 `synthesized += result.calls.length` 一起，保证同一流里不重复、预算不漏算。
- **残留**：`#` 仍出现在合成 id 里（`uniqueId(`${call.id}#remedy-${index}`)`，`toolcall-repair.ts:149`）。
  `#` 不在 provider 常见 id 字符集；DSH 自身按不透明串处理，风险低，但**任何把 id 塞进 URL/path/文件名
  的宿主端都会踩坑**。这是 S3 级，不建议现在改（改了会动夹具与 5 个测试里的 id 断言）。

### 2.3 `#remedy-N` 会不会被 agent-loop 当成真实 provider id（S1 → 部分降级）

**结论分两半，不能合并说“已修”**：

1. **协议层**：仍然是**未被证明**的一条。同 turn 内 id 只要唯一即可；下一 turn 回放时 assistant 消息带着
   模型从未生成的 `call_x#remedy-1`。`data/results/live-*.json` 与 `live-desktop-*.json` 都是
   “修复计数”类证据，**没有一条**证明“修复后的 turn 在下一轮回放仍能通过 provider 校验”。
   仓库也把它记成 known issue（`audit/blind_spots.json` 的 BS-04，status `accepted`）。
   → 本次审计不改结论：**没有 live 证据，就不要在文档里写“transcript 一致”**。
2. **`replayState` 已修**：`stopFinish(replayState)`（`repair-stream.ts:282-286`）用条件展开，
   `:513` 的 error 路径带上它，`catch` 路径（`:545`）传 `undefined`（本来就拿不到）。
   新测试 `tests/unit/repair-stream.test.ts:217-239` 断言 `finish.replayState` 深等原值。
   → 旧 §2.3 的第 3 点失效，可以划掉。

### 2.4 `existingIds` 传递是否正确（新版）

| 路径 | 传递 | 判定 |
|---|---|---|
| `tool-call-delta` 逐条 | `if (call.id !== '') seenIds.add(call.id)`（`:445`） | ✅ 覆盖“首块带 id、后续重复 id”的形态；`id === ''` 不污染 |
| `block-end`（tool-call） | `:463` 先 add 原 id，`:471` 再 add 每个合成 id | ✅ 回写完整 |
| `finish` 的 `planRescue` | `existingIds: seenIds`（`:332`），结束后 `:342` 回写 | ✅ 语义与回写都正确 |
| 空 id 回退 | `while (seenIds.has('call_remedy_N')) serial++`（`:324-329`） | ⚠️ 编号在 plan 被拒绝时也已被消耗（无害，但同一进程内编号会漂移；不影响唯一性） |
| CLI | `cmdRepair` 不传 `existingIds`（`cli.ts:200`） | ✅ 无流语境，可接受 |

结论：`existingIds` 的传入与回写现在都对，**唯一实质残留是 §1.7 N1 的预算不回退**。

---

## 3. 轻量：tarball 里到底装了什么

### 3.1 实测清单（`tar -tzvf .tmp/pack/live5/dsh-remedy-0.1.1.tgz`，26 345 字节）

| 类别 | 文件数 | 未压缩字节 | 是否必要 |
|---|---|---|---|
| `dist/*.js`（运行时代码） | 5 | 38 278 | ✅ 必要 |
| `dist/*.js.map` | 5 | 35 169 | ❌ 无用（见 3.2） |
| `dist/*.d.ts.map` | 5 | 6 757 | ❌ 无用 |
| `dist/*.d.ts` | 5 | 10 272 | ✅ 类型入口（`exports` 指向） |
| `fixtures/toolcall-fusion/*.json` | 5 | 2 147 | ✅ `verify` 依赖（0.1.1 的修复点） |
| `fixtures/checksums.json` | 1 | 547 | ⚠️ 无人消费（见 3.3） |
| `package.json` / `LICENSE` / `README.md` / `cordis.patch.yml` | 4 | 5 254 | ✅ |
| **合计（常规文件）** | 25 | 98 424 | gzip 后 26 345 |
| `tar -tzf` 条目数（含 `package/` 等目录头） | 30 | — | 0.2.0 已降到 20 |

> 上表的 **25 是常规文件数**，`tar -tzf` 列出的**条目**是 **30**（多出 5 个目录头）。我最初把两者写混，
> `docs/research/lightweight-plan-2026-11-10.md:25` 与 `docs/HANDOFF.md:70` 用的是 30 这个口径，以此为准。

（逐文件：`cli.js` 12 667 / `index.js` 4 742 / `repair-stream.js` 11 710 / `session-log.js` 2 232 /
`session-scan.js` 6 927；map 合计 41 926 字节 = 未压缩载荷的 **42.6%**。）

**dist 里没有测试残留、没有 `src/`、没有 `.tsbuildinfo`** —— 这一点是干净的。
`files` 白名单（`packages/plugin/package.json:26-32`，0.1.1 时还没有 `!dist/**/*.map`）确实按预期工作，`dist` 整个目录被包含，
所以当时的 `files` 拦不住目录内的 sourcemap。

> **口径提醒（两条）**：
> 1. 上表的字节数是 **0.1.1 已发布 tarball** 的数字（`dist/repair-stream.js` = 11 710 B，415 行版）。
>    审计期间 `src/repair-stream.ts` 长到 18 848 B、重建后的 `dist/repair-stream.js` 是 18 128 B，
>    所以“下一次发布 js 会涨”成立；map 比例会略降，但“map ≈ 未压缩载荷的四成”这个结论在当时不变。
> 2. **条目数我原先写错了一个口径**：0.1.1 的 tarball 是 **30 个条目**（含目录条目），不是 25。
>    `docs/research/lightweight-plan-2026-11-10.md:25` 已指出这一点，此处更正。
>    **且上表已不再是当前事实**：0.2.0 的 `files` 加了 `!dist/**/*.map`（`packages/plugin/package.json:26-32`），
>    map 已不再进包，实测包体 **19 114 B / 20 条目**（同机 A/B：28 756 → 19 114，−33.5%；
>    `dsh-remedy-core` 17 492 → 10 518，−39.9%）。因此 §3.2 的修法**已落地**，
>    §3.1 保留为“瘦身前”的历史快照，`tests/unit/package-files.test.ts` 4 条测试已把这条钉住。

### 3.2 sourcemap / declarationMap 是纯粹的体积负担（S3）

- `tsconfig.base.json:16` `"declarationMap": true`、`:17` `"sourceMap": true`、`:18` `"composite": true`。
- 实测 `grep -c sourcesContent packages/plugin/dist/*.js.map` **全部为 0**：
  `repair-stream.js.map` 的 `sources` 是 `["../src/repair-stream.ts"]`，但 `.ts` 不在包里，
  也没有内联源码 → 消费端**无法**用这些 map 还原任何东西。
- 体量：map 合计 41 926 字节，占未压缩载荷 42.6%（gzip 后占比会低一些，但仍是白送的字节）。
- **最小修法**（三选一，都不引入新构建系统）：
  - **（推荐）改写 `files` 白名单**，不再整目录包含 `dist`，而是枚举：

    ```json
    "files": ["dist/*.js", "dist/*.d.ts", "fixtures", "cordis.patch.yml", "README.md"]
    ```

    `files` 支持 glob（npm-packlist 语义），这样 `.map` 从根上不会进包，且不需要额外构建配置。
  - 给发布构建加 `packages/plugin/tsconfig.publish.json`（`extends` 现 base、`sourceMap`/`declarationMap`
    置 `false`、`outDir: dist`），`pnpm publish` 前用它 build。
  - 在 `packages/plugin` 加 `.npmignore` 写 `dist/**/*.map` —— **这条不可靠**：npm 的 `package.json`
    文档明确写 “Files included with the `files` field cannot be excluded through `.npmignore` or
    `.gitignore`”，所以只要 `files` 里还有裸目录 `"dist"`，`.map` 就照样被打包。审计把它列出来是为了
    避免下一位踩同一个坑，而不是推荐它。

  另外建议加一条 `tests/unit/package-files.test.ts` 直接读 `package.json.files` 并断言
  `"dist"` 不在其中（纯字符串断言，不需要 pack），把“map 不进包”变成门禁可测的事实。

> **现状（08:40Z）**：**已修，但用的是第三种写法**。`packages/plugin/package.json:26-32` 的 `files` 是
> `["dist", "!dist/**/*.map", "fixtures", "cordis.patch.yml", "README.md"]`（core 同构）；
> `.npmignore` 4 行也写了 `dist/**/*.map` 作为“万一 `files` 被删”的兜底（注释已写明 npm 11 对白名单内路径
> 忽略 `.npmignore`）。实测 0.2.0 包体 **19 114 B / 20 条目**、`dist` 只剩 5 `.js` + 5 `.d.ts`。
> `tests/unit/package-files.test.ts` 4 条已钉住：两包 `.npmignore` 含规则、`files` 含否定项且仍含 `dist`、
> 入口都指向 `dist`、`declaration` 保持 true —— 但**断言的是“含 `!dist/**/*.map`”，不是“不含裸 `dist`”**，
> 所以上面这条建议的“断言 `dist` 不在其中”没有落地，两种写法等价，无需再改。

### 3.3 fixtures 是否必要进包

**必要**，且这是 0.1.0 的真实事故（`CHANGELOG.md:11`：0.1.0 缺 fixtures，安装副本 `verify` 退出 3）。
0.1.1 用 `prepack` → `scripts/sync_fixtures.mjs` 修复，包内 5 个夹具 2 147 B，代价可接受。
（本地复核：`data/fixtures/toolcall-fusion/` 5 个 JSON 与 `packages/plugin/fixtures/toolcall-fusion/`
5 个 JSON **字节数逐一相同**，334/644/323/308/538，mtime 也一致——生成副本当前没有漂移。）

但 `fixtures/checksums.json`（547 字节）目前**没有消费者**：`sync_fixtures.mjs:35-39` 写它，
`tests/unit/fixtures-sync.test.ts:28-38` 读它，而 `cli.ts` 的 `cmdVerify` 只 `readdirSync` 后逐个 `JSON.parse`，
**从不校验 checksum**。也就是说，在“安装副本”这个最需要自证的场景里，checksum 文件形同虚设。
- **最小修法（二选一，别都做）**：要么在 `cmdVerify` 里对每个 fixture 校验 `checksums.json` 的 sha256 并
  输出 `checksum: ok/invalid`（约 10 行，反而增加安装侧证据强度）；要么把它移出包（`files` 里去掉
  `fixtures/checksums.json`，测试仍可从源码检出读 `packages/plugin/fixtures/checksums.json`）。

### 3.4 启动路径的多余 IO

- `packages/plugin/src/index.ts:17` 只在模块顶层 `import { appendFileSync, mkdirSync } from 'node:fs'`，
  **没有在加载期做任何 IO**；`journalPath` 为空时整个 `journalWriter` 不会被构造（`:107-109`）。✅ 干净。
- `mount()` 的两处副作用都受开关控制：`ctx.on('llm/stream')`（`:116`）与可选 retry（`:121-137`），
  日志一行（`:147-149`）。✅
- **唯一的常驻负担**：`journalWriter` 的 `mkdirSync` + `appendFileSync` + `redactValue(event)`
  是**同步 IO，直接在 `emit()` 的监听链里执行**（`:87-103`），而 `emit` 在流的搬运路径上被调用
  （每次 repaired / rejected / 每条流一次 stream）。开了 journal 的部署里，这是每事件一次写盘。
  - **最小修法**：`ready` 标志已经做了 mkdir 去重；把 `appendFileSync` 换成 `appendFile`（异步，队列内自然保序）
    即可，不需要引入 logger 或缓冲池。失败路径已有 try/catch，语义不变。
- `retry` 预算 `Map`（`:122-136`）**只增不删**：长会话里每个 `${turn}:${step}` 一条，单调增长。
  一条 `if (budget.size > 4096) budget.clear()` 就够（retry 本来就是 stop-gap，重置预算不改变默认行为 `retryMax=0`）。

### 3.5 仓库根目录的遗留物（S3，会影响公开仓库）

`.gitignore:1-24` 覆盖了 `node_modules/`、`**/dist/`、`.tmp/`，但**没有**覆盖：

| 文件 | 大小 | 说明 |
|---|---|---|
| `scratch_update_manifest.mjs` | 3 263 B | 一次性脚本，未忽略 |
| `scratch_check.mjs` | 0 B | 空文件 |
| `scratch_hash.mjs` | 0 B | 空文件 |
| `.tmp_check.js` | 0 B | 空文件 |

本目录是公开仓库根（`docs/HANDOFF.md:41`：`git subtree split --prefix=dsh-remedy`）。
这些文件会被 `subtree split` 带进公开仓库。**最小修法**：删掉（或挪进 `.tmp/`），
并在 `.gitignore` 补 `scratch_*`、`.tmp_check.*`。

> **现状（08:40Z）**：**已落地**。四个文件都已删除（本会话用 `ops_glob ["scratch*", ".tmp_check*"]`
> 复核得到 0 匹配）。`.gitignore` 是否补了那两条模式我没逐行再看，但既然文件已不在，
> `subtree split` 不会再带出它们；这条从“会污染公开仓库”降级为“已完成”。

---

## 4. 测试盲区（候选测试名 + 期望行为）

Lead 在审计期间补了 8 条负对照（`tests/unit/repair-stream.test.ts:215-356`），下表先列出**已被覆盖**的，
再列**仍然空着**的。空着的每一条都对应第 1-2 节里仍在的故障。

### 4.1 已覆盖（复核确认存在）

| 测试（`tests/unit/repair-stream.test.ts`） | 行号 | 钉住的承诺 |
|---|---|---|
| `a repaired finish keeps the adapter replayState` | `:217-239` | `replayState` 不丢 |
| `a tool name that changes mid-stream aborts the rescue` | `:241-254` | `nameConflict` |
| `a failure message without a tool name is never synthesized as unknown` | `:256-272` | 不合成 `unknown` |
| `a non-string argumentsDelta is never concatenated as undefined` | `:274-291` | `typeof` 守卫 |
| `a later rejected block-end withdraws an earlier committed repair` | `:293-307` | 全流回滚 |
| `maxCalls is a per-stream ceiling, not a per-block one` | `:309-328` | 全流预算 |
| `a consumer that stops early is not reported as a quiet stream` | `:330-343` | `consumer-abort` |
| `an empty tool name is never repaired into a dispatchable call` | `:345-356` | core `missing-name` |

### 4.2 仍然空着（建议新增，按优先级）

| 候选测试名 | 触发 | 期望行为 |
|---|---|---|
| `a withdrawn repair returns its budget to the stream` | block-end 可拆（5 片）→ `finish{max-tokens}` → 第二个 block-end（4 片，`maxCalls=8`） | 第二个块**应当**被判定为“预算足够”，而不是 `too-many-calls`（当前会被撤销的 5 片永久占额，§1.7 N1） |
| `a truncated stream is not counted as a failed repair` | block-end 携带完整粘连对 → `finish{max-tokens}` | `fused === 0 && unrepaired === 0`，`truncated === 1`，verdict 为 `quiet`（当前 `rolled-back` 事件把两者都 +1 → `degraded`，§1.7 N2） |
| `a second finish is not silently swallowed` | 两个 `finish`（第一个 `error`，第二个 `stop`） | 行为被测试钉死（当前第二个永远不被读，`:517-518`） |
| `a synthetic call id is never duplicated across two indices` | index 0 与 1 用同一 `call.id`、都可拆 | 两个 `block-end` 的 id 不同（`seenIds` 回写后应已成立，但没有测试） |
| `a repaired block is preceded by a block-start at the same index` | 单粘连块在 index 0，index 1 是 text | 输出 index 连续且每个新 index 有 `block-start`（当前仍是 `highestIndex+1`，§0.1 第 4 条） |
| `max-tokens after a closed block-end still records a truncation` | `block-start`→`block-end`（完整收尾）→`finish{max-tokens}` | `truncated === 1`；旧用例 `:132-142` 没有 block-end，恰好绕过了这个缺口 |
| `an orphan block-end without block-start is counted` | 只发 `block-end` | 至少有计数/事件（当前 `open.delete` 空操作、完全静默） |
| `an index jump does not leak into synthesized blocks` | index 0 → 跳到的 index 7，块可拆 | 合成块 index 不与既有 index 冲突 |
| `pending is emptied one entry at a time` | 消费者在 flush 中途 `throw` | `finally` 的 `consumer-abort` 事件里 `pending.length` 反映真实剩余（`splice` 已清空，`:376`） |
| `a configured maxCalls of zero falls back to the default` | `{ maxCalls: 0 as unknown as number }` | 等价于默认 8（`ceilingOf` 行为正确但无测试） |
| `a non-fusion error finish increments the error counter` | `block-start` → `finish{kind:'error', code:'SERVER'}`（`tests/unit/repair-stream.test.ts:94-101` 的现有序列） | `errors === 1`（当前为 0，§1.9）；顺带在该用例补 counters 断言即可，不需要新序列 |

另两条**不属于** repair-stream、但同样会让真实故障漏网：

| 测试 | 期望 |
|---|---|
| `tests/e2e/cli.test.ts:24` 直接断言 `OK 5 fixture(s)` 的固定条数 | 断言 `exit 0` + 每个夹具一行 PASS；否则加第 6 个夹具必红 |
| 新增 `tests/unit/session-log-jsonl.test.ts`：BOM / 前导空白的 JSONL | `decompressSessionLog` 应识别为明文并原样返回，而不是抛 `not a zstd session log`（`packages/plugin/src/session-log.ts:36-38` 只用 `buffer[0] === 0x7b`） |

---

## 5. 发布 / 门禁的结构性风险

| 风险 | 位置 | 说明与最小修法 |
|---|---|---|
| **`workspace:*` 被擦成精确版本** | `packages/plugin/package.json:60-62` | pnpm 发布时把 `workspace:*` 写成精确版本（当前两包都是 `0.2.0`）。以后只修 core（0.2.1）时，已安装的 plugin 不会升级 core → 用户拿到旧引擎。最小修法：发布前把依赖改成 `~0.2.0`（或 `^0.2.0`），并在 `record_publish.mjs` 的检查里加一条“plugin 的 core 约束是否为范围”。 |
| **`engines.dsh` 窗口过窄** | `packages/plugin/package.json:53` `">=0.2.0-rc.1 <0.3.0-0"` | DSH 一旦发 0.3，插件在所有 profile 里被拒装/拒载。这不是“更稳”，是发布结构风险。最小修法：确认上游对 engine 的强制程度后放宽到 `>=0.2.0-rc.1`，或至少在 `docs/PUBLISH.md` 写明升级纪律。 |
| **`latest` 快照取法** | ~~`scripts/gate_registry.mjs:42-47` `.sort()` 后 `.at(-1)`~~ → 现 `:42-53` | **已修**：现在读文件内的 `generated_at`（`stampOf`，`:85-87`）再按 `at` 排序（`:52`），并加了 `snapshot-present`/`snapshot-matches`/`snapshot-schema`/sidecar 四条 check（`:54-66`）。原风险（`isoStamp` 允许秒精度 `scripts/lib/kit.mjs:76-81`，字典序与时间序不一致）已消失。 |
| **copy manifest 字节锁 + 事实包耦合** | `scripts/gate_copy.mjs:48-53,82`、`docs/copy/manifest.json:117` | README 里任何人工改一个字符 = 红；改事实包 = 全部 8 个 entry 一起红，必须重跑 copy 通道。这是设计意图，但**每次 P-0002 改动涉及数字时都会连带打红**。建议在 HANDOFF 里显式写“改数字 = 重生成 8 文件”的清单，否则下一位会先怀疑门禁坏了。 |
| **`prepack` 在只读签出下失败（半修）** | `packages/plugin/package.json:65`（`"prepack": "node ../../scripts/sync_fixtures.mjs"`）、`scripts/sync_fixtures.mjs:17,21,37-88` | `prepack` 走的是**写模式**：`mkdirSync` + `cpSync` + `writeFileSync` 到工作树（`packages/plugin/fixtures/`，gitignored）。`--check` 模式现在**已经存在**（`:21`、`:37-88`，漂移退出 1、无 canonical 退出 3），但 `prepack` 没有用它。CI 若用只读 checkout，publish 仍会直接失败。最小修法：`prepack` 改成 `node ../../scripts/sync_fixtures.mjs --check \|\| node ../../scripts/sync_fixtures.mjs`，或在 `scripts/sync_fixtures.mjs` 里加“目标已存在且 checksum 一致则跳过写盘”（约 5 行）。 |
| **`pnpm test` 会写盘** | `tests/unit/fixtures-sync.test.ts:14,29` | 两个 test 都 `spawnSync(process.execPath, ['scripts/sync_fixtures.mjs'])`（**没有 `--check`**），每次运行都重写 `packages/plugin/fixtures/`。这既是“测试非只读”，也会让 `cli verify` 在源码检出里读到刚被重写的副本 → 这条“字节一致”测试在**修复**漂移，而不是**检测**漂移。最小修法：把这两个 `spawnSync` 的参数改成 `['scripts/sync_fixtures.mjs', '--check']` 并断言 `status === 0`（`--check` 已实现，改 2 行）。 |
| **`fixtureDir()` 的优先级** | `packages/plugin/src/cli.ts:110-118` | 安装副本路径 `../fixtures/toolcall-fusion/` 优先于源码 `../../../data/fixtures/…`。在源码检出里，只要有人 `pnpm pack` 过一次，`packages/plugin/fixtures/` 就存在且被**优先使用** → `dsh-remedy verify` 验证的是生成副本，不是 `data/fixtures` 的 canonical 字节。最小修法：源码检出时（存在 `../../data/`）优先读 canonical；或读 `fixtures/checksums.json` 并在启动时提示“当前验证的是生成副本”。 |
| **`record_publish` 的延迟与红产物（默认已修）** | `scripts/record_publish.mjs:44-55`、`audit/blind_spots.json:52`（BS-10） | 已知问题（0.1.1 的首份取证为红，因 registry 副本晚约 2 s）。结构上是“红产物保留 + 新 stamp 重记”，没问题。**`--retries` 默认已从 1 改为 3**（`:28` `Number.parseInt(flag('retries','3'),10) \|\| 3`），审计提出的 1 行修法已落地；剩余风险是 `sleep(60000)` 让一次失败取证至少多等 1 分钟（`:54`），可接受。 |
| **0.1.0 tarball 曾在使用（已改为 0.2.0）** | `docs/HANDOFF.md:16`、`:126-131`、`:205` | 桌面 profile 装的是 0.1.0（缺 fixtures），下一件事已改成“换到 0.2.0”（`docs/HANDOFF.md:16`）。运行时相同，但“装的就是发的那一份”不成立；任何以“安装副本能 verify”为前提的验收在这台机器上都是假绿。这不是代码问题，是**验收口径**问题：换 profile 之后才算 0.2.0 的装机验收覆盖桌面。 |
| **`gate_registry` 的 mutate 分支** | `scripts/gate_registry.mjs:56` `!mutate && expected === actual` | mutate 模式恒为 false，因此该 check 一定会红 —— 这是**故意**的（负对照），但它也意味着 `snapshot-matches` 这条断言在 mutate 下永远无法区分“注入生效”与“快照本来就不匹配”。属于门禁语义可读性问题，不改代码也可，仅建议在 ledger 的 `negative_control` 里写明这一点。 |
| **测试解析到 `dist`，不是 `src`** | 全部 `tests/**` 的 `import … from 'dsh-remedy-core'` / `'dsh-remedy'`（`tests/unit/repair-stream.test.ts:2-8` 等），经 `node_modules` 软链到 `packages/*`，再由 `package.json` 的 `main/exports` 指向 `dist` | 这是 N3 的成因：跑 `pnpm test` 不先 `build`，测的是**上一次构建**的代码。审计中途就出现过 dist 落后于 src 的窗口（`dist/repair-stream.js` 无 `nameConflict`），而 `pnpm test` 仍然全绿。最小修法：给 `verify` 之外的入口加护栏 —— 在 `tests/` 顶部加一条期时间比较（`assert(dist 的 mtime >= 对应 src 的 mtime)`），或把 `test` 脚本改成 `tsc -b && node --test …`（但那会让单测变慢）。成本最低的是在 `tests/governance` 里加一条“每个 `packages/*/dist/x.js` 不比 `src/x.ts` 旧”的断言，红了就提醒先 build。 |

---

## 6. 建议的落地顺序（每次只改一个接缝）

> **复议（08:40Z 之后）**：下表最初写于 07:56Z，现在是第 2 版。Lead 在审计期间已落地第 7 步的大部分
> （`files` 否定项、`sync_fixtures --check`、`record_publish` 默认 3、`gate_registry` 按 `generated_at`、
> 删 4 个 scratch 文件、双 bump 到 0.2.0）。**仍然值得做的只有第 1-6 步**，外加把 `--check` 真正接上。

1. **S1**：合成 index 取原 index 的紧邻空位并补 `block-start`（`repair-stream.ts:264-271`、`:352`、`:472`）
   —— 这是 §0.1 里**唯一仍然成立的 S1**（发出去的 block-end 没有配对的 block-start；仓库已记为 BS-11）。
2. **S1**：`withdrawPending()` 回退 `synthesized` 预算（§1.7 N1，约 4 行）—— 修“一次撤销污染整条流”。
3. **S2**：`flushPending()` 区分“reject 撤销”与“截断撤销”，后者不记 `recordRejected`
   （§1.7 N2，约 3 行）—— 让截断轮次的 verdict 回到 `quiet` + truncated 提示。
4. **S2**：`recordRejected` 不再无条件 `fused += 1`（§1.6 / BS-12，约 5 行）—— 让 `fused` 只表示粘连。
   **注意**：HANDOFF R6 已明确把这条记为「不修，属另一接缝」，因为它会改 verdict 词汇；
   若决定不修，应把 BS-12 从 `open` 改成 `accepted`，否则审计与台账对同一条给出两种口径。
5. **S2**：`finish{error}` 的原样透传路径补 `monitor.recordError()`（§1.9，1 行 + 1 条断言）
   —— 让“provider 真的失败了”在 counters 里留痕。**不要**顺手动 `judgeRemedy`：
   `errors` 目下不参与判定，改它等于改 verdict 词汇（与第 4 步同一个接缝，需要单独决策）。
6. **S3（门禁，半修）**：`--check` 已实现但**两个消费者都没接**——
   `packages/plugin/package.json:65` 的 `prepack` 仍走写模式；`tests/unit/fixtures-sync.test.ts:14,29`
   仍以写模式调用。各改 1-2 行即可让“测试只读 + prepack 只读安全”一次成立。
7. **S3（治理）**：加一条“`dist` 不比 `src` 旧”的断言（§5 最后一行，N3 的唯一护栏）。这是本轮**成本最低、
   收益最高**的 S3：它不会让现有 111 测试变红，只在有人忘了 build 时先提醒。
8. **S3（体积，已落地）**：`files` 否定项 + `.npmignore` 已把 map 挡在包外（0.2.0 = 19 114 B / 20 条目），
   无需再做。可选的下一步是把 `tsconfig.base.json:16-18` 的 `sourceMap`/`declarationMap` 在**发布构建**里
   置 false，让 dist 本身也变小，但那会动构建配置，收益远小于第 1-5 步。

---

## 7. 审计边界（本次没做的事）

- 未运行 `pnpm run verify` / `gate` / `gate.mjs --mutate`（Lead 正在改代码，避免竞争），
  因此“测试是否仍绿”**不是本报告的结论**，是前提。报告里引用的基线从“97 tests”起，
  而 Lead 中途已把计数推到 **111 tests**（`docs/HANDOFF.md:12`、`:63-64`）；
  本报告按 §0（07:56Z 快照）与 §0.1（当前）两个口径分别标注，未自行改口径。
- 未执行 `npm pack`（会触发 `prepack` 写文件）。tarball 结论全部来自既有产物：
  `.tmp/pack/live5/dsh-remedy-0.1.1.tgz`（26 345 B，瘦身前）与 `.tmp/pack6/`、`.tmp/packs-after/` 里
  0.2.0 的 19 114 B（均为只读列举/引用 `docs/research/lightweight-plan-2026-11-10.md` 的实测记录）。
- 未在真实 DSH 进程里验证“合成 id 进入 transcript 回放”——这需要一次 live 运行，属于本报告
  第 2.3 节明确标注的**未覆盖**项（仓库侧对应 BS-04 `accepted`）。
- 未验证 `workspace:*` 在真实 `pnpm publish` 下被擦成什么字符串（那需要一次发布）；
  §5 第 1 行是结构性判断 + 最小修法建议，不是实测结论。
- 本机 `.npmrc` 读取被安全网拒绝（secret 文件名规则），未检查 registry 配置是否影响 publish 复现性。
- 本会话 `ops_bash` 全程 `EXECUTOR_UNAVAILABLE`，因此所有“字节比较 / tarball 列举 / mtime 比较”
  要么来自先前的成功调用，要么来自 `ops_glob`/`ops_grep` 的 details 输出；未新跑任何 shell 命令。
