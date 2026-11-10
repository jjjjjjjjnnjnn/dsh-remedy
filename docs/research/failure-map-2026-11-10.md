# 本机 DSH 故障地图（2026-11-10）

> **数字来源**：`scripts/record_session_sample.mjs` 的产物
> `data/results/session-sample-2026-11-10T11-20-00.000Z.json`
> （sha256 `1741b77594852d2425932541c2cec2e4a6405640c128f15ad055273fcb1c94a3`，见同名 `.sha256`）。
> 本文的计数与分布全部逐字照抄该 JSON，未四舍五入、未换算、未复测；重试与自愈的归组由脚本完成，不在本文重算。
> 例外只有 §5 的字节数：那是 lead 侧对 `dist/*.js` 的独立实测，该节逐项标明，不属本产物字段。
> 本文是 P-0003 与 README 的**唯一数字来源**；别处引用这些数字时应指回本文。
>
> **样本**：会话文件 **48**，turn/end 总数 **120**，不可读 **0**，
> 时间窗 `2026-11-08T08:35:56.956Z` → `2026-11-10T10:27:17.272Z`，
> 采样截断 `--until 2026-11-10T10:30:00.000Z`。

---

## 1. 一句话结论

- **值得修**的只有一类：`error:MALFORMED_RESPONSE` 里的 **37 条 `trailing-objects(fusion)`**。
  它们在产物中被标记为 `proven-2-objects` 且 `repairable: true`，修的是"拆完能不能被运行时执行"，
  不是"能不能拆"。这一类在上游**从来没有被重试过**（40 次失败 = 40 个失败 group，1 group = 1 attempt），
  所以它既不会自愈，也不该指望上游自愈。
- **上游已经自愈**的是 502 家族：`error:SERVER` 的 147 次失败 attempt 落在 93 个失败 group 里，
  其中 84 个 group 以 `stop` / `tool-calls` 收尾，9 个 group 以 SERVER 收尾
  （这 9 个 group 合计 **45 次**失败 attempt）。这 9 个 group 的 turn/end 是 8 条 `error:SERVER`
  加 1 条 `aborted`。`TRANSPORT` 10 次失败落在 10 个 group，6 个最后成功，
  4 个最后以"另一个失败"（SERVER）收尾；`TIMEOUT` 1 次、`EMPTY_RESPONSE` 2 次、
  `IMAGE_OFFLOAD_REQUIRED` 2 次全部自愈。插件在这一层再加 retry 只是重复上游已有的动作。
- **永远不修**的是四类：`MISSING_CREDENTIAL`（配置问题）、`max-tokens`（口径定义就是不修）、
  模型自身吐出的非法 JSON（40 条里的 3 条，切分器只能拒绝）、上游按 design 的 502 重试。

判定这一切的前提是重试单元为 **(会话文件, turn, step)**，不是 turn；口径差的原因见 §2.4。

---

## 2. 方法

### 2.1 数据来源（`source` 与 `totals` 字段）

| 项 | 值 |
|---|---|
| 样本位置 | 本机 `~/.dsh/sessions` |
| 会话文件 `source.files` | 48 |
| 不可读 `source.unreadable` | 0 |
| 时间窗 `source.window` | `2026-11-08T08:35:56.956Z` → `2026-11-10T10:27:17.272Z` |
| 采样截断 | `--until 2026-11-10T10:30:00.000Z`：只采 mtime ≤ until 的 48 个文件，更新的文件不进样本 |
| 样本指纹 `fingerprint_sha256` | `7689d019…` |
| 账号 | 单机单账号 |
| attempt 记录 `totals.attempt_records` | 9401 |
| 其中无 finish `attempt_records_without_finish` | 6 |
| turn/end `totals.turn_end` | 120 |
| 有 turn/end 但没有 attempt `turns_without_attempt` | 1 |
| `tool_call_delta` chunk 总数 | 0 |
| `block-start` 总数 | 17484 |
| `block-end` 总数 | 17423 |
| 同一 turn 内没有对应 start 的 block-end | 10 |

**为什么要截断**：会话目录是只追加的，当前活跃会话在脚本运行期间还在长大，
同一脚本连跑几次总数都会变（历史读数：52 / 54 / 48 个文件，124 / 128 条 turn/end，
这些都不是本文样本，只用来说明"不截断就没有稳定分母"）。
`--until` 把"采到哪一刻"固定下来，`source.files` 是**实际采样数**，不是目录里现有的文件数。

**可复现性**：用不同 `--stamp` 复跑两次（`--out` 写到 `.tmp`），除 `generated_at` 外**逐字节相同**。

`totals` 里的两个分项可以互相校验：finish 分布逐项相加为 **9395**，
加上 `attempt_records_without_finish` 的 **6** 等于 `attempt_records` 的 **9401**。

### 2.2 脚本与产物

| 项 | 值 |
|---|---|
| 脚本 | `scripts/record_session_sample.mjs`（只读，读 `~/.dsh/sessions`） |
| 产物 | `data/results/session-sample-2026-11-10T11-20-00.000Z.json` + 同名 `.sha256`（sha256 `1741b77594852d2425932541c2cec2e4a6405640c128f15ad055273fcb1c94a3`） |
| 跑法 | `node scripts/record_session_sample.mjs --stamp 2026-11-10T11:10:00.000Z --until 2026-11-10T10:30:00.000Z`（产物内的 `generated_at` 是 `2026-11-10T11:20:00.000Z`，因此文件名用的是 11-20-00） |
| 解压路径 | `dsh-remedy decompressSessionLog (packages/plugin/dist)`——用产品自己发布的读取路径，不是脚本里另抄的一份 |
| 自描述字段 | `produced_by: scripts/record_session_sample.mjs`、`generated_at`、`schema_version: 1` |
| 门禁 | 过 `gate_ssot`（`data/results` 必须可溯源并带 sha256） |

早期三个临时探针（`.tmp/probe-failure-map.mjs` / `.tmp/probe-attempt-retry.mjs` /
`.tmp/probe-malformed-shapes.mjs`）**已退役**，仅作过程记录。它们按 turn 归组重试，
正是 §2.4 那处口径差的来源，本文不再引用其输出数字。

### 2.3 口径定义

- **重试单元**：`(会话文件, turn, step)`。同一 step 的多次 attempt 组成一个 **group**。
  换会话文件、换 turn、换 step 都算另一个 group。这是本产物唯一采用的归组方式（`retry_unit` 字段）。
- **turn/end 口径**：每一轮对话结束时落下的那一条状态，每轮最多 1 条，合计 **120**。
  它回答"用户最终看到的是什么"。
- **finish 口径**：每一次 attempt 的 `finish` 事件，同一轮可以有多条，合计 **9395**。
  它回答"上游实际失败了多少次"。
- **自愈**：某个 group 里以签名 X 失败后，**同一 group** 后续 attempt 成功，
  即该 group 最后一条 finish 是 `stop` 或 `tool-calls`。
- **终局**：group 最后一条 finish 仍是非成功。产物把它再分成三种收尾：
  以本码收尾（`groups_ending_in_this_code`）、以**另一个**失败收尾
  （`groups_ending_in_another_failure`）、以及以成功收尾（`groups_ending_in_success`）。

三个口径的分母不同（轮 / attempt / group），所以它们的数字不要求相等，见 §2.4。

### 2.4 已裁决：三个口径的分母不同

早期探针按 **turn** 归组：turn 号是会话内部的，一个 turn 里有很多 step，
按 turn 归组会把"同一 turn 里另一个 step 的成功"记到本次失败头上。
直接后果是"终局 group 里的失败 attempt 数"与 turn/end 的计数被摆在一起比较，产生过一个假矛盾
（45 / 194 属已删除的旧样本，只作口径差示例，本文任何计数都不引用它们）。
产物改用 `(会话文件, turn, step)` 归组后，三处数字各自成立：

- **`error:SERVER`**：**147** 次失败 attempt 落在 **93 个失败 group**。
  其中 **84 个 group 最后以 `stop` / `tool-calls` 收尾**；
  **9 个 group 最后仍以 SERVER 收尾**，这 9 个 group 合计 **45 次失败 attempt**
  （`attempts_in_groups_ending_in_this_code`，平均每个终局 group 试了 5 次）。
  这 9 个 group 的 turn/end 是 **8 条 `error:SERVER` + 1 条 `aborted`**。
  剩余 147 − 45 = **102** 次失败 attempt 落在最终成功的 group 里。
  所以 147 是 attempt 口径、8 是 turn/end 口径、45 是"终局 group 里的失败 attempt 数"，
  三者不是同一个分母，**不矛盾**。
- **`error:TRANSPORT`**：10 次失败在 10 个 group 里，6 个 group 最后成功，
  **4 个 group 最后以"另一个失败"收尾**（`groups_ending_in_another_failure = 4`，那个别的失败就是 SERVER）。
  所以 turn/end 分布里没有 `error:TRANSPORT` 这个签名，不是探针漏了，而是那一组最终落成了 SERVER。
- **`error:UNKNOWN`**：只有 turn/end 1 条，没有对应的 attempt finish；
  `turns_without_attempt = 1` 就是它。因此它的自愈情况只能记为"未测"，不能默认成"已自愈"。
- **`error:MALFORMED_RESPONSE`**：turn/end 40、finish 40、终局 group 40，三处一致，
  不存在分母差，处置只依赖任意一个口径即可。

以上不改变任何处置决定：`MALFORMED_RESPONSE` 的结论不依赖换算；
SERVER 家族的结论只依赖"147 次失败里 45 次落在 9 个终局 group、102 次落在最终成功的 group"这一条。

---

## 3. 故障地图总表

### 3.1 主表

| 故障签名 | turn/end | finish | 失败 attempt | 失败 group | group 收尾：成功 / 本码 / 另一失败 | 本码终局 group 内 attempt | 可修性 | 我们的处置 |
|---|---:|---:|---:|---:|---|---:|---|---|
| `completed` | 49 | — | — | — | — | — | 不适用 | 不碰（正常结束） |
| `error:MALFORMED_RESPONSE` | 40 | 40 | 40 | 40 | 0 / 40 / 0 | 40 | 部分可修（37 可证、3 不可证） | **修**（37 条）**+ 只诊断**（3 条） |
| `max-tokens` | 14 | 14 | 14 | 14 | 0 / 14 / 0 | 14 | 不可修 | 不碰 |
| `error:SERVER` | 8 | 147 | 147 | 93 | 84 / 9 / 0 | **45** | 不修（上游已重试） | 不碰 |
| `aborted` | 7 | — | — | — | — | — | 不适用 | 不碰（人工停止） |
| `error:TRANSPORT` | — | 10 | 10 | 10 | 6 / 0 / 4 | 0 | 不修 | 不碰 |
| `error:EMPTY_RESPONSE` | — | 2 | 2 | 2 | 2 / 0 / 0 | 0 | 不修 | 不碰 |
| `error:IMAGE_OFFLOAD_REQUIRED` | — | 2 | 2 | 2 | 2 / 0 / 0 | 0 | 不修 | 不碰 |
| `error:TIMEOUT` | — | 1 | 1 | 1 | 1 / 0 / 0 | 0 | 不修 | 不碰 |
| `error:MISSING_CREDENTIAL` | 1 | 1 | 1 | 1 | 0 / 1 / 0 | 1 | 不可修（配置） | 不碰 |
| `error:UNKNOWN` | 1 | — | — | — | — | — | 只诊断 | 只诊断 |
| 正常结束（finish） | — | `tool-calls` 9118、`stop` 60 | — | — | — | — | 不适用 | 不碰（作为分母） |

turn/end 合计：49 + 40 + 14 + 8 + 7 + 1 + 1 = **120**，与 `totals.turn_end` 一致。
finish 合计：9118 + 147 + 60 + 40 + 14 + 10 + 2 + 2 + 1 + 1 = **9395**，
加 `attempt_records_without_finish` 6 = **9401**，与 `totals.attempt_records` 一致。

`error:TRANSPORT` / `error:EMPTY_RESPONSE` / `error:IMAGE_OFFLOAD_REQUIRED` / `error:TIMEOUT`
四行的 turn/end 列为"——"：产物里这四个码只出现在 finish 口径（成因见 §2.4）。
`error:UNKNOWN` 相反，只有 turn/end。`completed` 与 `aborted` 只有 turn/end，没有 finish 签名。

两点说明：

1. 旧表的"会话数"列已删除。本产物只记录样本总文件数 48，**不按签名拆分会话数**；
   需要这一列时应扩产物 schema，而不是在文档里另算一个来源不同的数字。
2. `aborted` 7 与 `error:SERVER` 8 是两个不同签名，数字接近但不是同一件事，不合并、不相加。

### 3.2 `MALFORMED_RESPONSE` 的 40 条细分（`malformed_response_shapes`）

| 形状 `kind` | 判定 `verdict` | 条数 `failures` | `repairable` | 可修性 | 处置 |
|---|---|---:|---|---|---|
| `trailing-objects(fusion)` | `proven-2-objects` | 37 | `true` | **可修** | 修（P-0001 / P-0002 已在同一接缝上做） |
| `cut-inside-object` | `split-failed` | 2 | `false` | 不可修 | 只诊断：拒绝，不假装修好 |
| `other` | `split-failed` | 1 | `false` | 不可修 | 只诊断：拒绝，不假装修好 |

37 + 2 + 1 = **40**，与 `error:MALFORMED_RESPONSE` 的 40 条一致。

这一节现在是**机器产物**：`kind`、`verdict`、`failures`、`repairable` 都是
`malformed_response_shapes` 的字段，不再是退役探针的输出。

两条 detail 文本不属于产物字段，此处仅作阅读辅助，来自过程记录：
`cut-inside-object` 那 2 条的坏点是 `unbalanced: input ends at depth 1`；
`other` 那 1 条是 `Unexpected token ':'`（样本里出现 `"context":: `）。
它们不参与任何计数或判定，产物只保证上面四个字段。

### 3.3 粘连工具分布（`fused_call_tool_names`）

| 工具 | 次数 |
|---|---:|
| `ops_bash` | 13 |
| `read_page` | 8 |
| `ops_inspect_local_file` | 4 |
| `list_agents` | 3 |
| `ops_read_files` | 3 |
| `send_message` | 3 |
| `ops_grep` | 2 |
| `web_search` | 2 |
| `edit` | 1 |
| `spawn_teammate` | 1 |

逐项相加 = **40**，与 40 条 `MALFORMED_RESPONSE` 一致。分布偏向参数里带长 shell 命令或长文本的
工具（最前两项是 `ops_bash` 13 与 `read_page` 8）。这不是某个工具的 bug，而是模型在一条流里
连写两个对象的后果。产物没有说明粘连的是"首个"还是"最后一个"工具，故不作排名解读。

### 3.4 finish 分布（`finish_outcomes`，共 10 个签名）

| finish 签名 | 次数 |
|---|---:|
| `tool-calls` | 9118 |
| `error:SERVER` | 147 |
| `stop` | 60 |
| `error:MALFORMED_RESPONSE` | 40 |
| `max-tokens` | 14 |
| `error:TRANSPORT` | 10 |
| `error:EMPTY_RESPONSE` | 2 |
| `error:IMAGE_OFFLOAD_REQUIRED` | 2 |
| `error:MISSING_CREDENTIAL` | 1 |
| `error:TIMEOUT` | 1 |

`tool-calls` 与 `stop` 是正常结束路径，是分母；其余 8 个签名是失败路径。

### 3.5 两个口径缺陷（BS-07 与 BS-11）

- **BS-07**：全样本 `tool_call_delta` chunk 总数是 **0**。持久化把 delta 收进了
  `tool-call-chunks`，所以"这一轮修了几次"不能从会话文件直接读出来，只能靠 journal 计数
  与合成 id 反推。因此本文的 37/40 是**失败分类**，不是**修复次数**，两者不能互相替代。
- **BS-11**：聚合口径下 `block-start` 17484、`block-end` 17423，其中 10 个 block-end
  在其 turn 内没有对应 start。这是聚合事实，不能用来推翻 P-0002 记录的单会话观察
  （那个会话从不发 `block-end`）；两个事实可以同时成立，本文不对单会话结论作裁定。

### 3.6 失败调度分布（`attempts_per_failing_group`）

| 签名 | 一个失败 group 里的失败 attempt 次数 → group 数 | 失败 group 合计 |
|---|---|---:|
| `error:SERVER` | 1 → 75、2 → 3、3 → 6、4 → 1、5 → 4、6 → 4 | 93 |
| `error:MALFORMED_RESPONSE` | 1 → 40 | 40 |
| `max-tokens` | 1 → 14 | 14 |
| `error:TRANSPORT` | 1 → 10 | 10 |
| `error:EMPTY_RESPONSE` | 1 → 2 | 2 |
| `error:IMAGE_OFFLOAD_REQUIRED` | 1 → 2 | 2 |
| `error:MISSING_CREDENTIAL` | 1 → 1 | 1 |
| `error:TIMEOUT` | 1 → 1 | 1 |

这一组数字比百分比更硬：`MALFORMED_RESPONSE` 与 `max-tokens` 都是**一个 group 只失败一次**，
从来没被重试过——上游根本不重试它们，所以这类失败只能由本插件这一层处置（或者不处置）。
`SERVER` 相反，同一个 group 内最多失败 6 次，说明上游确实在重试，只是重试的余额有限；
93 个失败 group 里有 75 个只失败 1 次，说明多数情况下上游一次就吃掉了。

---

## 4. 为什么不再扩修复面

### 4.1 切分器的能力边界是 37 : 3

40 条里 37 条能被切分器证明"确实是 2 个完整对象"（产物 `repairable: true`），这是可以修的部分；
剩下 3 条分别是 2 条 `cut-inside-object`（输入在深度 1 处就断了）与 1 条 `other`（JSON 语法本身坏掉），
产物都标 `repairable: false`。这 3 条连"几个对象"都判定不了，切分器能做的只有拒绝。

把修复面从 37 扩到 40，等于要求切分器从"证明两个对象"变成"猜出残缺对象原本长什么样"。
那不是同一条接缝上的加固，是换问题：猜错的输出会被当作正常调用派发出去，比拒绝更坏。
P-0001 到 P-0002 的所有约束——每个片段都能 parse、空工具名拒绝、名字冲突整轮放弃、
原子提交——都建立在"能证明"之上，这条线不能为了 3 条样本移动。

### 4.2 502 家族已经被上游吃掉，MALFORMED 则从未被重试

`error:SERVER` 147 次失败落在 93 个失败 group：84 个 group 最后成功，
这 84 个 group 里剩下 102 次失败 attempt（147 − 45 = 102）；9 个 group 以 SERVER 终局，
这 9 个 group 合计 45 次失败 attempt（平均每个终局 group 试了 5 次）；
`TRANSPORT` 10 次里 6 次自愈、4 次转成 SERVER 终局；
`TIMEOUT` 1/1、`EMPTY_RESPONSE` 2/2、`IMAGE_OFFLOAD_REQUIRED` 2/2 全部自愈。
上游的 retry 是按 design 做的，效果可以量化。

反方向的证据同样清楚：`MALFORMED_RESPONSE` 40 次失败 = 40 个 group，`max-tokens` 14 次 = 14 个 group，
两者 `attempts_per_failing_group` 都只有 "1 → 全部"，也就是**上游一次都不重试**。
所以对它们，"等上游重试"不是一个可选项——插件不做，就永远不会被处置。

插件这一层的判断分两条：

1. 对 502 家族（SERVER / TRANSPORT / TIMEOUT / EMPTY_RESPONSE / IMAGE_OFFLOAD_REQUIRED），
   上游已经重试过，插件能碰到的只有终局那部分（SERVER 9 个 group、45 次失败 attempt）。
   在这些上面再重试一次，成功率不高于上游已尝试过的那几次，代价是把一次终局失败变成
   "多等一个 backoff 再失败"。收益是噪声，所以 `agent/request-error` 的 retry 保持默认关闭。
2. 对 `MALFORMED_RESPONSE`，插件就是唯一的处置方，但能处置的只有"能证明"的 37 条；
   余下 3 条只做可见的拒绝。

### 4.3 于是 P-0003 的范围

只做"拒绝可观测"：`refused-retryable` / `name-unverified` 进 verdict 与 journal，默认仍不 retry。
这条正好落在 37 条可证样本与 3 条不可证样本的交界上——两类都走拒绝路径，但它让拒绝**看得见**，
而不是让拒绝**变少**。

---

## 5. 字节预算

### 5.1 `P-0003` 落地前实测

`packages/plugin/dist/*.js` 合计 **46 459 B**：

| 文件 | 字节 |
|---|---:|
| `dist/cli.js` | 12 667 |
| `dist/index.js` | 4 742 |
| `dist/repair-stream.js` | 19 891 |
| `dist/session-log.js` | 2 232 |
| `dist/session-scan.js` | 6 927 |
| **合计** | **46 459** |

### 5.2 `P-0003` 落地后实测

同样是 `packages/plugin/dist/*.js`，合计 **52 247 B**：

| 文件 | 字节 |
|---|---:|
| `dist/cli.js` | 12 667 |
| `dist/index.js` | 4 742 |
| `dist/repair-stream.js` | 25 679 |
| `dist/session-log.js` | 2 232 |
| `dist/session-scan.js` | 6 927 |
| **合计** | **52 247** |

比本轮先前定的 52 000 B 上限**超 247 B**。增量全部落在 `repair-stream.js`
（19 891 → 25 679），其余四个文件字节不变。

### 5.3 处置决定

**接受这 247 B 的超支，把硬上限改为 53 000 B。**

依据是成本位置：`repair-stream.js` 25 661 B 的源码里注释占 8 579 B（33.4%）。
（25 661 与 5.2 表里的 25 679 是 lead 侧两次读数，两处都按原数保留，本文不解释差值。）
削注释能立刻省出约 12 KB，但注释是"为什么这样记账"的唯一载体——
为凑齐 247 B 去删注释，是拿可读性换一个假指标，下一次改动还得把这些账重记一遍。

**跨过 53 000 B 的下一个补丁必须先拆接缝，不再允许继续加长 `repair-stream.ts`。**
拆的方向有两个，任选其一：

1. 按接缝拆：把 `llm/stream` 的包装器（`repair-stream` + `toolcall-repair`）与离线部分
   （`session-scan` / `session-log`）分开，常驻加载的只有前者；
2. 按入口拆：`cli.js` 不在运行时路径上，单独成一个入口包，插件入口不再 import 它。

两个方向都不改变行为，只改变"谁被常驻加载"。如果两步都做完仍然超，说明新增的能力本身
不属于这个补丁层，应当先讨论要不要开第三个包，而不是把 `repair-stream.ts` 继续写长。

`53 000 B` 不是推导出来的数：它是从实测的 52 247 B 出发、按本轮处置把上限抬到 53 000，
中间没有"百分比 + 余量"这一步。
但 `P-0003` 落地后仍必须复测这一段，不能沿用这里的 52 247 B 当作后续补丁的起点。

---

## 6. 不可修清单

| 项 | 为什么不可修 | 处置 |
|---|---|---|
| `MISSING_CREDENTIAL`（turn/end 1、finish 1、1 个 group、0 自愈） | profile 的 `credentials` 默认 disabled，是配置状态，不是流上的缺陷 | 不碰；文档写清 profile 需要 `disabled: false` |
| `max-tokens`（14 次，14 个 group，0 自愈，1:1 未重试） | 口径定义：被截断的流一律不修。截断点之前的尾部如果"看起来完整"，与粘连在文本上不可区分 | 不碰；维持"标了 `max-tokens` 就绝不修" |
| 模型自身吐非法 JSON（`cut-inside-object` 2 条 + `other` 1 条，均 `repairable: false`） | 输入在深度 1 处断掉，或语法已经坏掉；切分器只能拒绝 | 只诊断：拒绝并留证据 |
| 上游按 design 的 502 重试（`error:SERVER` 147 次失败，9 个 group 终局，45 次失败 attempt） | 147 次里有 45 次落在 9 个终局 group（平均 5 次才放弃），另外 102 次落在最终成功的 group 里 | 不碰；retry 默认关闭 |

补充两条不属于"不可修"但同样不动的：`aborted` 7 次是人工停止；`completed` 49 次是正常结束。
`error:UNKNOWN` 1 次没有对应的 attempt finish（`turns_without_attempt = 1`），按规则只能停在"只诊断"。

---

## 7. Unverified

- 本机样本是**单机、单账号、48 个会话、时间窗 2026-11-08T08:35:56.956Z → 2026-11-10T10:27:17.272Z**，
  且被 `--until 2026-11-10T10:30:00.000Z` 截断；不能外推到其他机器、其他账号、其他时间窗，
  也不能外推到其他模型。
- 截断值本身是人为选的。换一个 `--until` 会得到另一套总数（会话目录只追加，
  实测同一脚本在不同时刻跑出过 52 / 54 / 48 个文件）；本文只对这一个截断时刻负责。
- 产物**不按签名统计会话数**，也不按会话拆分 turn/end；本文因此删掉了旧的"会话数"列。
  需要这两类数据时扩 `schema_version`，不能在文档里另算。
- `attempts_in_groups_ending_in_this_code` = 45 与 `groups_ending_in_this_code` = 9
  是两个不同分母（147 − 45 = 102 次失败 attempt 落在最终成功的 group 里）；
  这两个值都是产物字段，但"平均每个终局 group 试 5 次"是按 45 / 9 说出来的概括，
  原文没有这个平均值字段。
- 自愈定义依赖"同一 group 内后续 attempt 成功"这一条可观测链；如果上游改变 attempt 的记录方式，
  93 / 84 / 9 这个划分需要重跑脚本，不能沿用。
- 粘连工具分布按工具名计数（合计 40，与 40 条 `MALFORMED_RESPONSE` 对齐）；
  产物未说明是"首个"还是"最后一个"工具，当"哪些工具更容易被粘连"的排名是过度解读。
- `block-end` 无配对 start 的 10 是聚合差值，不能定位到具体会话或轮次。
- 字节预算的三组数（46 459 / 52 247 / 53 000）是 lead 侧的实测与本轮定下的处置，
  不属于本产物的任何字段，也不由本文复测；它们只对"这一次构建"负责。
  `53 000 B` 是在 52 247 B 之上做的决定，不是把 52 000 加余量得到的推导值。
  `P-0003` 落地后必须复测，不能把这里的数字当作后续补丁的起点。
- 本文所有数字都没有在第二台机器上复核。

数字来源：data/results/session-sample-2026-11-10T11-20-00.000Z.json（sha256 `1741b77594852d2425932541c2cec2e4a6405640c128f15ad055273fcb1c94a3`，完整值见同名 .sha256）
