# dsh-remedy

[![CI](https://github.com/jjjjjjjjnnjnn/dsh-remedy/actions/workflows/ci.yml/badge.svg)](https://github.com/jjjjjjjjnnjnn/dsh-remedy/actions)
[![npm](https://img.shields.io/npm/v/dsh-remedy)](https://www.npmjs.com/package/dsh-remedy)
[![license](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)
[![node](https://img.shields.io/badge/node-%3E%3D22.19-brightgreen.svg)](package.json)
[![status: verified](https://img.shields.io/badge/status-verified-brightgreen.svg)](data/results)

[English](README.md)

DeepSeek Harness 的常驻处置层，只修复一项已度量的缺陷并拒绝掩盖其余异常。它在 `llm/stream` 接缝处修复工具调用粘连，不修改 `app.asar`，也不吞没上游失败。

## 它修什么

该缺陷为工具调用粘连（P-0001）。中继可能将两个工具调用流式传输到同一个 delta 缓冲区或索引中。`@earendil-works/pi-ai` 接收到粘连的 JSON 对象并抛出错误，`dsh-llm-pi-ai` 将其转换为 `MALFORMED_RESPONSE`。由于默认的 `retryableCodes` 中不包含 `MALFORMED_RESPONSE`，`dsh-agent-loop` 会重新抛出该错误，当前轮次随即终止。

```
Tool call "<name>": Unexpected non-whitespace character after JSON at position N
Received arguments: {"path":"README.md"}{"path":"CHANGELOG.md"}
```

在 48 个会话文件与 120 次 `turn/end` 事件的实测样本中，共发生 40 次 `MALFORMED_RESPONSE` 失败，其中 37 次是顶层可证且可修复的两个 JSON 对象粘连。上游讨论 deepseek-ai/deepseek-harness discussion #4427 记录了同类粘连问题。

## 安装

```bash
dsh plugin --profile <name> add dsh-remedy
```

```bash
pnpm add dsh-remedy dsh-remedy-core
```

plugin 的 0.3.0 版本在 registry 里装不上，因为 npm 直接发布了原始 workspace manifest，依赖写成字面 `workspace:*`；其后的发布用 pnpm 打出的 tarball 修掉这个 manifest；0.3.1 用了同样的 manifest 修法，但在上市前就被取代，从未到达 registry。

面向从源码构建的贡献者：

```bash
git clone https://github.com/jjjjjjjjnnjnn/dsh-remedy.git
cd dsh-remedy
pnpm install
pnpm run verify
```

## 工作方式

插件在 `llm/stream` Cordis 瀑布流上缓冲工具调用增量（delta）。当终止的 `finish` 携带 `MALFORMED_RESPONSE`（或抛出相同签名的错误）时，它会在顶层对象边界处切分每一个未闭合的缓冲区。

```
Input stream:
  delta:       '{"path":"README.md"}{"path":"CHANGELOG.md"}'
  finish:      kind="error", code="MALFORMED_RESPONSE"

Repaired stream:
  block-end:   arguments='{"path":"README.md"}'
  block-start: id="<id>#remedy-1"
  block-end:   arguments='{"path":"CHANGELOG.md"}'
  finish:      kind="stop"
```

修复遵循全有或全无（all-or-nothing）规则：若任意缓冲区无法完成证明，则不发出任何内容，并将原始失败重新抛出。

## 安全保证

- 单个解析失败的对象直接拒绝，绝不切分。
- JSON 字符串内部的 `}{` 不被视为边界。
- 首个调用保留原始 id；合成 id 格式为 `<id>#remedy-N`。
- 若任意缓冲区无法完成证明，则不发出任何内容，并将原始失败重新抛出。
- 空工具名直接拒绝（`missing-name`）。
- 同一索引内变更的工具名会中止救援，并将原始失败重新抛出（`name-changed`）。
- 修复后的 `finish` 保留适配器的 `replayState`。
- `block-end` 修复暂扣至工具调用阶段结束；同流后续若有拒绝则撤回修复（`rolled-back`）并发出原始 chunk。
- 流级 `maxCalls` 限制整条流合成调用的总预算，而非按单个 block 限制。
- 消费者提前停止的流记录为放弃（`consumer-abort`），不记为 quiet。
- 合成 call 一定带 `block-start` 与 `block-end`，而不是裸 `block-end`。
- 撤回的修复把预算还给整条流的 `maxCalls` 预算。
- `max-tokens` 流只计入 truncated，不算未修复的粘连。
- 透传的 provider 错误计入 `errors`。
- 纯拒绝只加 `refused`，不加 `fused`。
- 预算拒绝（`too-many-calls`）同时加 `unrepaired`，所以“拒了也没修”的流不会读成 `repaired`。
- 消费者提前停止保留 `fused` 与 `unrepaired`，并另加 `withdrawn`。
- 截断只加 `withdrawn`，不加 `fused`。
- 四个 verdict 词一个没变（`unmeasured`、`quiet`、`degraded`、`repaired`），只有计数行从六个名字长到八个。
- 只有当恰好一段能把整段文本还原成一个 plain object 且 payload 字节一致时才给裸值加引号。
- reseal 后的 call 保留自己的 id 与 name。
- reseal 不合成新 call，也不占用流级的 `maxCalls` 预算。
- 0 个候选（`bare-value-unproven`）或 2 个以上候选（`ambiguous-bare-value`）一律拒绝而不是猜。
- 只因 reseal 而修好的流读 `repaired`，绝不读 `quiet`。
- 第九个计数器 `resealed` 在类型里故意可选，旧版本录下的计数对象仍然渲染原来那一行。
- `scan` 用插件自己发布的同一个读取器读多帧 zstd 日志。
- 目录扫描每个文件留一行可审计记录。
- `scan --since` 把丢弃的事件记成 `before_since` 而不是藏起来。
- 一个解不开的文件是一条 failure 行与非零退出码，绝不是 0 报告。
- 脱敏能匹配单反斜杠、双反斜杠与把 home 路径编码进目录名这三种形状。

## 它不做什么

| 限制 | 说明 |
|---|---|
| 归因边界 | 止步于组装后的文本；无法证明是中继还是适配器粘连了对象。 |
| Headless 会话存储 | headless profile 不持久化 `assistant/attempt` 流，因此 `session.fused_calls` 为 0；journal 计数器与合成 id 承载证明。 |
| 合成标识符 | 合成 id 仅用于追溯辅助，不是持久身份。 |
| 消息本地化 | 消息回退逻辑解析英文 `Received arguments:`；本地化的宿主消息会使该回退失效，但 delta 缓冲路径仍正常工作。 |
| 截断修复 | `max-tokens` 截断绝不修复。 |
| 轮次完成度 | 操作员在回答后停止了桌面运行；产物记录 `turn_end=aborted`，而非声称已完成。 |
| 验证范围 | 验证仅适用于已记录的 tarball sha256，而非运行中的桌面应用可能缓存的内容。 |
| Verdict 粒度 | verdict 状态词无法表达“观测到并正确拒绝”；仅计数行可体现，因此仅存在无效 JSON 的流读作 `quiet`。 |
| Journal 迁移 | 现存 journal 行不进行迁移；在混合版本的 journal 中，`status --json` 汇报末行的结构。 |
| 自定义适配器记账 | 适配器自行闭合 block 并维护独立记账尚未经过实测（`BS-11`）。 |
| 请求错误重试 | 针对 `agent/request-error` 的重试回退默认为 0 且仅为权宜之计；宿主已自行重试服务端错误族（93 组失败中有 84 组在同轮次内随后重试成功）。 |
| 样本范围 | 0.3.0 数字背后的样本反映单一机器和单一账户在固定截止时间前的数据。 |

## 自己验证

`scan` 工具可读取单个会话文件或整个会话目录，支持纯文本 `.jsonl` 与多帧 `.jsonl.zstd`，每个文件输出一行，并支持 `--since`。

```bash
pnpm run verify
node scripts/gate.mjs --mutate
dsh-remedy verify
dsh-remedy scan <session.jsonl|directory>
```

已记录的证据产物与校验文件：
- 修复真机运行：`data/results/live-2026-11-10T14-45-00.000Z.json`
- 拒绝真机运行：`data/results/live-2026-11-10T16-30-00.000Z.json`
- 桌面 profile 运行：`data/results/live-desktop-2026-11-09T19-10-00.000Z.json`
- 初始 headless 运行：`data/results/live-2026-11-09T17-00-00.000Z.json`

## 状态

两个包（`dsh-remedy` 与 `dsh-remedy-core`）最新发布的版本在 npm 上均标记为 `latest`，待发布的版本已准备就绪但尚未发布；plugin 的 0.3.0 是坏发布。

- P-0001、P-0002 与 P-0003 在真实宿主上均为 `verified`：P-0001 在 headless profile 与桌面 App 上完成验证；P-0002 在 2026-11-10 的 headless 真机运行里修好了一次真实的两调用粘连，并确认合成 id 被实际派发执行；P-0003 在 2026-11-10 的另一次 headless 运行里，代码拒绝修复一次预算超限的粘连，journal 中 `refused` 首次非零。
- P-0005 与 P-0004 是 `tested` 而不是 `verified`：均包含单测、负对照，以及一条实测夹具或一次实测扫描，但还没有真机产生过 P-0005 修复的裸值形状，P-0004 修改的是离线读取器而非常驻接缝。

已发布的 plugin tarball 压缩体积为 24689 字节（25 个条目，解包体积 81904 字节：56344 字节 `dist/*.js`、16701 字节 `dist/*.d.ts`、3583 字节 `fixtures/`、5276 字节包根文件）。已发布的 core tarball 压缩体积为 15864 字节（19 个条目，解包体积 52828 字节：32537 字节 `dist/*.js`、16994 字节 `dist/*.d.ts`）。sourcemap 不再进包，移除了 41926 字节的解包载荷。在 P-0005 之后，`dist/*.js` 达到 55815 字节，越过了 53000 字节的上限，这正是将接缝拆入 `stream-types.ts` 与 `failure-text.ts` 的原因：此举将 `repair-stream.js` 从 28955 字节降至 27925 字节，但因导入导出脚手架开销使 `dist/*.js` 总量变为 56344 字节。工作上限为：生成的 `repair-stream.js` 为 28000 字节，生成的 `cli.js` 为 10000 字节，插件总量为 68000 字节。

## 开发

```bash
pnpm install
pnpm run verify
pnpm run gate
node scripts/gate.mjs --mutate
```

## 贡献

欢迎提交 issue 与 pull request。
- 行为变更必须先编写失败的测试。
- `pnpm run verify` 必须通过；`node scripts/gate.mjs --mutate` 必须捕获所有门禁。
- 门禁仅使用 Node 内置模块；任何新门禁必须在 `audit/gate_ledger.json` 中登记。
- 不得为 `dsh-remedy-core` 引入新的运行时依赖。
- 未提供 `data/results/live-*` 产物的补丁不能声明为 `verified` 状态。

## 安全

安全漏洞报告请通过公开仓库的 GitHub 私密漏洞报告（private vulnerability reporting）渠道提交（于 2026-11-09 启用）。

## 许可证

MIT。与 DeepSeek 无隶属关系。
