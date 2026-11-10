# 裸值 reseal：哪些畸形参数可以修，哪些必须拒

`2026-11-10` · 只读取证 · 数据来源是三个一次性探针（脚本在 `.tmp/`，未进仓库）与两个会话文件窗。

## 1. 一句话结论

在 69 个会话文件的窗口里，**43 条 `MALFORMED_RESPONSE` 全部带回显**，其中 38 条是两个对象粘连（P-0001 已覆盖），
**只有 1 条（run_code 的裸 JS 源码）能被「最小变换」安全救回**；其余 4 条（重复 key、双冒号、缺右花括号、
尾截断）**一条都救不回来**，因此 P-0005 只做「唯一候选的裸值 reseal」，其余形状保持拒绝。

## 2. 方法

- 样本：本机 `~/.dsh/sessions/**/session.v4.jsonl.zstd` 的 69 个会话文件（单机、单账号、2026-11-08 → 2026-11-10）。
- 读取路径：多帧 zstd 解帧 + 行 JSON.parse（`.tmp/probe-failure-map.mjs` 的自研循环，
  **不要用** `decompressSessionLog`——它返回的对象形状与裸 JSONL 行不同，第一次探针就是因此把 43 条读成 0 条）。
- 三个探针：
  1. `.tmp/probe-args-shapes2.mjs` —— 统计形状、回显特征、工具分布。
  2. `.tmp/probe-salvage.mjs` —— 对每条回显做「最小变换分类」：是否已可解析 / 拆成 N 对象后每片是否可解析 / 单对象是否可修。
  3. `.tmp/probe-quote-literal.mjs` —— 暴力枚举「成员头 × 逗号」候选边界，检验有几种读法能把整段重建为一个 plain object。
- 口径：`MALFORMED_RESPONSE` 的判定沿用 adapter 的 error code，不额外分类；回显指错误消息里
  `Received arguments:\n` 之后的原文。

## 3. 逐条证据

### 3.1 形状与次数

| 形状 | 次数 | 典型首行 | 可修性 |
|---|---|---|---|
| `fusion(trailing-objects)` | 38 | `Unexpected non-whitespace character after JSON at position 296 (line 1 column 297)` | P-0001 已覆盖（拆成多个 call） |
| `unexpected-token`（裸值/非法字面量） | 2 | `Unexpected token 'c', ..."{"code": ` | **P-0005**（仅当唯一候选） |
| `other`（`Expected ',' or '}' after property value`） | 2 | 缺右花括号 | 拒 |
| `end-of-json`（尾截断） | 1 | `Unexpected end of JSON input` | 拒（截断绝不修） |

### 3.2 回显特征（同一条可重叠计数）

| 特征 | 次数 |
|---|---|
`starts-object` | 43 |
`duplicate-key` | 25 |
`does-not-end-with-brace` | 4 |
`unquoted-value` | 3 |

### 3.3 工具分布（合计 43）

`ops_bash` 13 · `read_page` 8 · `ops_inspect_local_file` 4 · `ops_read_files` 3 · `list_agents` 3 ·
`send_message` 3 · `run_code` 2 · `ops_grep` 2 · `web_search` 2 · `edit` 1 · `read` 1 · `spawn_teammate` 1。

### 3.4 最小变换分类（`probe-salvage`）

| 分类 | 次数 |
|---|---|
`fusion/2-objects/all-parse` | 38 |
`unsalvageable/unbalanced` | 4 |
`unsalvageable/single-unparsable-object` | 1 |
`without a readable echo` | 0 |

### 3.5 逐条非融合回显

| # | 工具 | 回显长度 | 缺陷 | 候选数 |
|---|---|---|---|---|
| 1 | `run_code` | 349 | `"code": ` 后跟裸多行 JS 源码（值未加引号） | **1**（`key=code raw=280B boundary@289`，`byte-identical payload: true`） |
| 2 | `run_code` | 26 | `{"code": "false", "code": ` ——重复 key + 字符串中间断开 | 0 |
| 3 | `ops_grep` | 115 | `"context":: ` 双冒号 | 0 |
| 4 | `ops_bash` | 186 | 缺右花括号（`split` 报 `unbalanced: input ends at depth 1`） | 0 |
| 5 | `ops_bash` | 186 | 同 #4（同一段文本的第二次出现） | 0 |

## 4. 为什么不做得更多

- **转义修复是死路。** 先假设「孤立反斜杠」是主因（`grep -n "a\|b"` 这种 shell 转义进了 JSON），
  写了「把字符串内非法转义改写成 `\\`」的算法并实测：`escapes-doubled` 对 4 条非融合回显**全部仍失败**，
  总计 **zero rescued of 5 non-fusion echoes**。原因是 #4/#5 的真实缺陷是缺右花括号而不是转义；
  加这条分支只会增加一条"看起来修好了"的路径。
- **截断不可修。** 上游 `docs/subsystems/llm-streaming.md:368` 的原话是
  "truncated call is unsafe to execute"；`max-tokens` 与「字符串中间断开」都属于这一类，必须拒。
- **两个读法等于没有读法。** #2 的重复 key 至少有两种合法重建（取第一个或取第二个），
  这也是为什么 P-0005 的判据是「**恰好一个**候选」，0 个与 ≥2 个都拒。
- **不猜语义。** 裸文本既可能是代码、也可能是散文；P-0005 只把它当字符串原样搬运
  （`JSON.stringify`，字节级 round-trip 才算过），绝不做任何"理解"。

## 5. P-0005 的定义域（据以上证据）

接受当且仅当：文本 parse 失败且不是融合 · 裸段含换行且长度 ≥2 · 有搜索上限（8 个成员头 / 256 个逗号）·
**恰好一个**候选能重建为一个 plain object · 该成员值经 `JSON.stringify` 后与原文**逐字节相同** ·
未标记 `truncated`。其余一律 `bare-value-unproven` 或 `ambiguous-bare-value`。

派发时保持原 call id、不合成新 call、**不占 `maxCalls`**（因为它不是第二个调用）。

## 6. Unverified

- 这 69 个文件窗与 48 个文件窗（`session-sample-2026-11-10T11-20-00.000Z.json`）是两次不同截断时点，
  数字不能互换引用；本文只用 69 文件窗的 43 条。
- 只有 1 条真实裸值样本，因此"唯一候选"这条判据的**误判率无法估计**；它只能靠负对照（11 条）与
  一条实测夹具支撑，所以 P-0005 记 `tested`，不记 `verified`。
- 形状占比会随模型与工具变化，本文的百分比不应被当作稳定率。
