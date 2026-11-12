# dsh-remedy

[![CI](https://github.com/jjjjjjjjnnjnn/dsh-remedy/actions/workflows/ci.yml/badge.svg)](https://github.com/jjjjjjjjnnjnn/dsh-remedy/actions)
[![npm version](https://img.shields.io/npm/v/dsh-remedy.svg)](https://www.npmjs.com/package/dsh-remedy)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Node](https://img.shields.io/badge/node-%3E%3D22.19-brightgreen.svg)](https://nodejs.org)
[![Status](https://img.shields.io/badge/status-verified-blue.svg)](#status)

[English](README.md)

dsh-remedy 是 DeepSeek Harness（DSH）的常驻处置层。当上游中继流把多个工具调用粘连进同一个 delta 索引时，DSH 会因 `MALFORMED_RESPONSE` 错误直接终止该轮次。dsh-remedy 拦截 `llm/stream` 接缝，缓冲工具调用 delta，在经过验证的边界处切分粘连的 JSON 载荷，并发出合法的工具调用块。它纯在内存中运行，除非显式配置否则不写磁盘；只要参数载荷无法被证明，就会原样重新抛出原始错误。

## 它修什么

当上游中继将两个工具调用打包进同一个索引时，`@earendil-works/pi-ai` 接收到 `{...}{...}` 并抛出异常。`dsh-llm-pi-ai` 将其转换为 `LlmError(..., 'MALFORMED_RESPONSE')`，而 `dsh-agent-loop` 因 `MALFORMED_RESPONSE` 不在默认的 `retryableCodes` 中而终止该轮次（上游讨论：deepseek-ai/deepseek-harness discussion #4427）。

```text
Tool call "<name>": Unexpected non-whitespace character after JSON at position N
Received arguments: {...}{...}
```

宿主会话日志的实测样本：78 个会话文件、393 次 attempt、38 次粘连调用、44 次 `MALFORMED_RESPONSE` 失败（其中 39 条可修复）、0 行不可读。

在同一宿主 293 个 turn 的普查中，记录到 94 个 completed、88 个 `max_tokens`、100 个 error 与 11 个 aborted。记录到的六个错误码为：`MALFORMED_RESPONSE` 44、`UNSUPPORTED_REASONING_EFFORT` 37、`SERVER` 16、`UNKNOWN` 1、`MISSING_CREDENTIAL` 1 与 `INVALID_REQUEST` 1。

离线 `scan` 命令支持读取单个会话文件或整个会话目录，同时支持纯文本 `.jsonl` 与多帧 `.jsonl.zstd`，每个文件输出一行可审计记录，支持 `--since`，并打印包含所统计错误码的 turn 普查报告。

## 安装

安装插件到 DSH 配置方案（profile）：

```bash
dsh plugin --profile <name> add dsh-remedy
```

作为项目依赖引入：

```bash
pnpm add dsh-remedy dsh-remedy-core
```

plugin 的 0.3.0 在 registry 里装不上（npm 直接发布了原始 workspace manifest，依赖写成字面 `workspace:*`），其后的发布用 pnpm 打出的 tarball 修掉这个 manifest；0.3.1 用了同样的 manifest 修法，但在上市前就被取代，从未到达 registry。

面向贡献者的源码工作流：

```bash
git clone https://github.com/jjjjjjjjnnjnn/dsh-remedy.git
cd dsh-remedy
pnpm install
pnpm run verify
```

## 工作方式

dsh-remedy 在 `llm/stream` Cordis 接缝处缓冲传入的工具调用 delta：

```text
Input chunks:
  block-start { id: "call_01", name: "ops_bash" }
  tool-call-delta '{"command":"ls"}{"command":"pwd"}'
  finish { kind: 'error', error: LlmError('MALFORMED_RESPONSE') }

Repaired output:
  block-start { id: "call_01", name: "ops_bash" }
  block-end   { arguments: '{"command":"ls"}' }
  block-start { id: "call_01#remedy-1", name: "ops_bash" }
  block-end   { arguments: '{"command":"pwd"}' }
  finish      { kind: 'stop' }
```

修复遵循全有或全无（all-or-nothing）规则。所有打开的缓冲区都必须能够解析为合法的顶层 JSON 对象。如果所有缓冲区均完成证明，每个调用将获得各自的 `block-start` 与 `block-end`，且错误的 finish 会被替换为 `{kind:'stop'}`。只要有任何一个缓冲区无法被证明，就不会发出任何内容，并将原始失败重新抛出。

## 安全保证

- 顶层 JSON 对象严格在深度 0 处切分；字符串内部的 `}{` 不被视为边界。
- 首个切分出的调用保留原始 id；合成调用获得 `<id>#remedy-N`。
- 若任意缓冲区无法完成证明，则不发出任何内容，并将原始失败重新抛出。
- 单个解析失败的对象直接拒绝，绝不切分。
- 插件仅挂载 `remedy-stream`，不添加路由、工具或 UI。
- 除非配置了 `journalPath`，否则插件不向磁盘写入任何内容。
- `retryOnMalformed` 默认为 0，因为重试是权宜之计，不是根治方案。
- 空工具名直接拒绝（`missing-name`），绝不派发给空名称。
- 同一索引内变更的工具名会中止救援（`name-changed`）并重新抛出。
- 修复后的 `finish` 保留适配器的 `replayState`。
- `block-end` 修复保持原子性直至工具调用阶段结束；同流后续若有 block 被拒绝，则撤回修复（`rolled-back`）并发出原始 chunk。
- `maxCalls` 限制整条流合成调用的总预算，而非按单个 block 限制。
- 消费者提前停止记录为 `consumer-abort`，绝不记为 quiet。
- 合成 call 一定带 `block-start` + `block-end`，绝不是裸 `block-end`。
- 撤回的修复把预算还给整条流的 `maxCalls` 预算。
- `max-tokens` 流只计为 truncated，不算作未修复的粘连。
- 透传的 provider 错误计入 `errors`。
- 纯拒绝只增加 `refused`，绝不增加 `fused`。
- 预算拒绝（`too-many-calls`）同时增加 `fused`、`refused` 与 `unrepaired`，确保拒了也没修的流绝不会读成 `repaired`。
- 消费者提前停止保留 `fused` 与 `unrepaired`，并另行增加 `withdrawn`。
- 流截断增加 `withdrawn`，绝不增加 `fused`。
- 四个 verdict 词保持不变（按顺序求值：`unmeasured`、`quiet`、`degraded`、`repaired`），计数行打印八项指标：`streams=`、`fused=`、`repaired=`、`unrepaired=`、`truncated=`、`errors=`、`refused=`、`withdrawn=`。
- 只有当恰好一段能把整段文本还原成一个 plain object 且 payload 字节一致时才给裸值加引号。
- reseal 修复的 call 保留自己的 id 与工具名，不合成新 call，不消耗整条流的 `maxCalls` 预算。
- 0 个候选片段作为 `bare-value-unproven` 拒绝；2 个或更多候选片段作为 `ambiguous-bare-value` 拒绝，绝不猜测。
- 仅因 reseal 而修复的流判定为 `repaired`，绝不读为 `quiet`。
- 第九个计数器 `resealed` 在类型定义中故意保持可选，让旧版本记录的计数对象仍能逐字节渲染原始输出。
- `scan` 通过插件发布的同一个 `decompressSessionLog` 读取器读取多帧 `.jsonl.zstd` 日志。
- 目录扫描为每个文件保留一行可审计记录。
- `--since` 将丢弃的记录记为 `before_since`，而不是静默忽略。
- 一个无法解压的文件产生一行 failure 记录与退出码 3，绝不是 0 报告。
- 脱敏规则同时匹配单反斜杠转义、双反斜杠转义以及编码进会话目录名中的 home 路径。
- 扫描器统计每一个 `turn/end`（completed、`max_tokens`、aborted、error），并点名每个 `reason.error.code`，而非只报告 `MALFORMED_RESPONSE`。
- turn census 纯属信息性普查，绝不改变退出码；退出码严格取决于 `fused_calls` 与 `fusion_failures`。
- 维护者文案通道：构建侧 copy 通道将超出 Windows 命令行限制的请求移至 stdin 传输，从最终的 `result` 事件中读取回答，并按原因代码报告启动错误；它不触碰常驻接缝，也不改变对外文案。

## 它不做什么

| 限制 | 说明 |
|---|---|
| 归因边界 | 止步于组装后的文本；无法证明是中继还是适配器粘连了对象。 |
| 截断错误 | `max-tokens` 截断缺失的是字节，不进行修复。 |
| 本地化文本 | 错误信息回退解析英文 `Received arguments:`；非英文消息会使该回退失效，但 delta 缓冲路径仍正常工作。 |
| Headless 会话文件 | headless profile 不持久化 `assistant/attempt` 流；实测产物中的 `session.fused_calls` 为 0，证明由 journal 计数器与合成 id 承载。 |
| 合成 ID | 类似 `<id>#remedy-N` 的 id 仅用于追溯辅助，并非持久标识。 |
| 桌面端完成判定 | 桌面端验证产物记录 `turn_end=aborted`，因为操作员在回答完成后终止了轮次。 |
| 应用缓存 | 验证严格针对记录的 tarball sha256，而非运行中的桌面应用所缓存的内容。 |
| 判定词粒度 | 单个 verdict 单词无法表达“已观测并正确拒绝”；仅损坏的 JSON 读为 `quiet`。 |
| 日志迁移 | 既有 journal 行不进行结构迁移；`status --json` 报告最后一行的模式。 |
| 自定义索引跟踪 | 自行闭合 block 并维护独立索引记账的适配器尚未经过实测（`BS-11`）。 |
| 请求重试 | `retryOnMalformed` 默认为 0 且仅为权宜之计；宿主已针对服务器错误进行重试。 |

## 自己验证

```bash
dsh-remedy verify
dsh-remedy scan ~/.dsh/sessions --json
pnpm run verify
node scripts/gate.mjs --mutate
```

带 sha256 sidecar 的产物已提交在 `data/results/` 中，包括真机运行记录 `data/results/live-2026-11-12T12-20-00.000Z.json` 与会话扫描记录 `data/results/scan-full-2026-11-11T18-15-00.000Z.json`。

## 状态

P-0001、P-0002 与 P-0003 均已在真实宿主上完成验证（`verified`）：P-0001 在 headless profile 与桌面 App；P-0002 在 2026-11-10 的 headless 真机运行里修好了一次真实的两调用粘连，并看到合成 id 被真的派发执行；P-0003 在 2026-11-10 的另一次 headless 运行里，代码拒绝修复一次预算超限的粘连，journal 里 `refused` 第一次非零。

P-0005、P-0004、P-0006、P-0007、P-0008、P-0009 与 P-0010 是 `tested` 而不是 `verified`：都有单测与负对照，以及一条实测夹具或一次实测扫描，但还没有真机产生过 P-0005 修的裸值形状；P-0004、P-0006 与 P-0009 改的是离线读取器，而非常驻接缝；P-0007 改的是构建侧的 copy 通道；P-0008 是构建侧的门；P-0010 改的只是 CLI 的用法文本与包内 README。

发布状态：`0.3.7` 是 `dsh-remedy` 与 `dsh-remedy-core` 两个包已发布的 `latest`。上一个版本是 `0.3.6`。plugin 的 0.3.0 是坏发布。

FACTS 中未记录 0.3.4 的 tarball 尺寸。已发布的 0.3.7 plugin：29462 字节压缩体积，29 个文件，解包 98001 字节（67883 字节 `dist/*.js`、20835 字节 `dist/*.d.ts`、3583 字节 `fixtures/`、5700 字节包根文件）。Core 0.3.7：20000 字节压缩体积，19 个文件，解包 65961 字节（45670 字节 `dist/*.js`、16994 字节 `dist/*.d.ts`）。上一个版本 0.3.6 的 plugin：29445 字节压缩体积，29 个文件，解包 97807 字节；core 0.3.6：19247 字节压缩体积，19 个文件，解包 63408 字节。更早的 0.3.3 plugin：28378 字节压缩体积，29 个文件，解包 94769 字节；core 0.3.3：16776 字节压缩体积，19 个文件，解包 55684 字节。sourcemap 不再进包，移除了 41926 字节的解包体积。

字节预算历史：`dist/*.js` 在 P-0005 后达到 55815 字节。P-0006 最初冲至 70389 字节超标，将辅助函数内联后落回 67908 字节。P-0008 将这些上限转化为门禁（`gate_size.mjs`），针对插件总量（68000 字节）、`repair-stream.js`（28000 字节）、`session-scan.js`（14000 字节）与 `cli.js`（10000 字节）。P-0009 落地后为 68000 字节中的 67997 字节（距上限还剩 3 字节），P-0010 通过单行命令说明将插件总量带回 67883 字节。

## 开发

```bash
pnpm install
pnpm run verify
pnpm run gate
node scripts/gate.mjs --mutate
```

## 贡献

- 欢迎提交 issue 与 pull request。
- 行为变更必须先编写失败的测试。
- `pnpm run verify` 必须通过，且 `node scripts/gate.mjs --mutate` 必须捕获每个门禁。
- 门禁仅使用 Node 内置模块；新门禁必须在 `audit/gate_ledger.json` 中登记。
- 不得为 `dsh-remedy-core` 引入新的运行时依赖。
- 未提供 `data/results/live-*` 产物的补丁不能声称 `verified`。

## 安全

安全漏洞报告请通过公开仓库（https://github.com/jjjjjjjjnnjnn/dsh-remedy）的 GitHub 私密漏洞报告（private vulnerability reporting）渠道提交（于 2026-11-09 启用）。

## 许可证

MIT 许可证。独立项目；与 DeepSeek 无隶属关系。
