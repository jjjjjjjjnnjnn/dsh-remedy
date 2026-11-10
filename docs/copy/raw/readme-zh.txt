# dsh-remedy

[![CI](https://github.com/jjjjjjjjnnjnn/dsh-remedy/actions/workflows/ci.yml/badge.svg)](https://github.com/jjjjjjjjnnjnn/dsh-remedy/actions)
[![npm version](https://img.shields.io/npm/v/dsh-remedy)](https://www.npmjs.com/package/dsh-remedy)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![Node](https://img.shields.io/badge/node-%3E%3D22.19-brightgreen)](https://nodejs.org)
[![Status: verified](https://img.shields.io/badge/status-verified-brightgreen)](data/results)

[English](README.md)

`dsh-remedy` 是 DeepSeek Harness 的常驻处置层。它介入 `llm/stream` Cordis 级联接缝，将粘连的工具调用拆分为独立调用，并交付干净的终止状态。它不修改 `app.asar`，除非显式配置 journal 否则不写入磁盘，并在任意载荷无法完成证明时原样重新抛出原始错误。

## 它修什么

当上游中继将多个工具调用流式输出到同一个响应索引时，`@earendil-works/pi-ai` 接收到拼接的 JSON 对象并抛出解析错误。`dsh-llm-pi-ai` 将流标记为 `MALFORMED_RESPONSE`，而 `dsh-agent-loop` 将其视为不可重试错误，直接终止该轮次。

```
Tool call "<name>": Unexpected non-whitespace character after JSON at position N
Received arguments: {"path":"..."}{"path":"..."}
```

在 48 个包含 120 次 `turn/end` 事件的会话文件实测样本中，这导致了 40 次 `MALFORMED_RESPONSE` 失败。在这 40 次失败中，37 次是顶层粘连的两个 JSON 对象且可证可修复；2 次在对象内部被截断；1 次为其他切分失败。上游讨论 deepseek-ai/deepseek-harness #4427 记录了同类粘连缺陷。

## 安装

将插件安装至 DSH 配置预设（profile）：

```bash
dsh plugin --profile <name> add dsh-remedy@0.3.1
```

作为库依赖安装：

```bash
pnpm add dsh-remedy@0.3.1 dsh-remedy-core@0.3.1
```

注：plugin 的 0.3.0 版本在 registry 中无法安装，因为 npm 直接发布了包含字面量 `workspace:*` 依赖的原始 workspace manifest（导致 `EUNSUPPORTEDPROTOCOL`）；0.3.1 使用 pnpm 打包的 tarball 重新发布了同一份代码。

面向从源码构建的贡献者：

```bash
git clone https://github.com/jjjjjjjjnnjnn/dsh-remedy.git
cd dsh-remedy
pnpm install
pnpm run verify
```

## 工作方式

`dsh-remedy` 在 `llm/stream` 上缓冲工具调用增量（delta）。当终止的 `finish` 携带 `MALFORMED_RESPONSE`（或抛出对应错误）到达时，它会在顶层 JSON 边界处切分未关闭的缓冲区：

```
Measured chunk sequence:
  block-start(id="call_0") -> delta('{"path":"a"}{"path":"b"}') -> finish(kind="error", code="MALFORMED_RESPONSE")

Repaired output:
  block-start(id="call_0") -> delta('{"path":"a"}') -> block-end
  block-start(id="call_0#remedy-1") -> delta('{"path":"b"}') -> block-end
  finish(kind="stop")
```

修复遵循全有或全无（all-or-nothing）原则。每个切分片段都必须能成功解析为合法 JSON。若任意缓冲区未能通过证明，则不发出任何修复 chunk，并原样重新抛出原始失败。

## 安全保证

- 仅介入 `llm/stream` Cordis 级联接缝；仅挂载一行（`remedy-stream`），不新增路由、工具或 UI。
- 除非显式配置 `journalPath`，否则不向磁盘写入任何内容。
- 全有或全无修复：若任意缓冲区无法被证明，则不发出任何内容，并原样重新抛出原始失败。
- 单个解析失败的对象直接拒绝，绝不切分。
- JSON 字符串内部的 `}{` 不被视为边界。
- 首个调用保留原始 id；合成 id 格式为 `<id>#remedy-N`。
- `retryOnMalformed` 默认为 0，因为重试只是权宜之计，不是根本修复。
- 工具名为空的调用直接拒绝（`missing-name`），绝不分发。
- 同一索引内发生变更的工具名（`name-changed`）会中止救援，原样重新抛出原始失败。
- 修复后的 `finish` 保留适配器的 `replayState`。
- 原子的 `block-end` 提交：暂扣至工具调用阶段结束；同流后续若有 block 被拒绝，则撤回修复并发出原始 chunk。
- `maxCalls` 限制整条流合成调用的总预算，而非按单个 block 限制。
- 消费者提前停止的流记录为 `consumer-abort`（放弃），不计为 quiet。
- 合成 call 一定带 `block-start` 与 `block-end`，绝不发出裸 `block-end`。
- 撤回的修复把已分配的调用数归还给整条流的 `maxCalls` 预算。
- `max-tokens` 截断只记为 truncated，绝不修复，也不算作未修复的粘连。
- 透传的 provider 错误计入 `errors`。
- 纯拒绝只加 `refused`，绝不加 `fused`。
- 预算拒绝（`too-many-calls`）同时增加 `fused`、`refused` 与 `unrepaired`，因此“拒了也没修”的流绝不会读成 `repaired`。
- 消费者提前停止（`consumer-abort`）保留 `fused` 与 `unrepaired`，并另加 `withdrawn`。
- 截断只增加 `withdrawn`，绝不增加 `fused`。
- 四个 verdict 词（`unmeasured`、`quiet`、`degraded`、`repaired`）一个没变，只有计数行从六个名字扩展到八个（`streams=`、`fused=`、`repaired=`、`unrepaired=`、`truncated=`、`errors=`、`refused=`、`withdrawn=`）。
- `unrepaired` 仅表示唯一含义：粘连已被证明且未被修复。

## 它不做什么

| 领域 | 限制 |
|---|---|
| 归因边界 | 归因止步于组装后的文本；无法证明是中继还是适配器粘连了对象。 |
| 截断情况 | `max-tokens` 截断绝不修复。 |
| Headless 会话 | headless profile 不持久化 `assistant/attempt` 流；实测产物中的 `session.fused_calls` 为 0（由 journal 计数器与合成 id 承载证明）。 |
| 合成 id | 合成 id 仅用于追溯辅助，不是持久身份。 |
| 本地化消息 | 错误消息回退逻辑解析英文 `Received arguments:` 文本；本地化的宿主消息会使该回退失效，但 delta 缓冲区路径仍正常工作。 |
| 桌面轮次结果 | 桌面轮次在产出任务答案后由操作员停止；产物记录 `turn_end=aborted` 而非声称完成。 |
| 验证范围 | 验证仅适用于已记录的 tarball sha256，而非运行中桌面应用可能缓存的内容。 |
| Verdict 表达力 | verdict 状态词无法表达“观测到并正确拒绝”；仅计数行可体现（唯一缺陷为无效 JSON 的流现在读作 `quiet`）。 |
| Journal 迁移 | 现存 journal 行不进行迁移；在混合版本的 journal 中，`status --json` 汇报末行的结构。 |
| 索引记账 | 自行关闭 block 并维护自身索引记账的适配器仍未实测（`BS-11`）。 |
| 请求重试 | 针对 `agent/request-error` 的重试回退默认为 0 且仅为权宜之计；宿主已自行重试服务端错误族（93 个失败组中有 84 组在同轮次内随后的尝试中成功）。 |
| 样本截断时间 | 数字背后的样本反映单一机器和单一账户在固定截止时间前的数据；不同的截止点会产生不同的总量。 |

## 自己验证

使用夹具套件验证已安装的副本或本地检出：

```bash
# 从已安装的副本验证夹具
npx dsh-remedy verify

# 本地验证套件（build、typecheck、test、gate）
pnpm run verify

# 负对照（断言所有 5 个门禁在注入突变时均失败）
node scripts/gate.mjs --mutate
```

带有 sha256 sidecar 的真实验证产物已提交至 `data/results/`：
- Headless 运行（P-0001）：`data/results/live-2026-11-09T17-00-00.000Z.json`
- 桌面运行（P-0001）：`data/results/live-desktop-2026-11-09T19-10-00.000Z.json`
- 真实粘连修复（P-0002）：`data/results/live-2026-11-10T14-45-00.000Z.json`
- 预算超限拒绝运行（P-0003）：`data/results/live-2026-11-10T16-30-00.000Z.json`

## 状态

0.3.1 是两个包（`dsh-remedy` 与 `dsh-remedy-core`）唯一可安装的发布版本。plugin 的 0.3.0 是坏发布，registry 无法完成安装。

补丁 P-0001、P-0002 与 P-0003 均已在真实宿主上完成验证（`verified`）：
- P-0001：在 headless profile 与桌面 App 上完成验证。
- P-0002：在 2026-11-10 的 headless 真机运行中完成验证，修好了一次真实的两调用粘连，并确认合成 id 被实际派发执行。
- P-0003：在 2026-11-10 的另一次 headless 运行中完成验证，代码拒绝修复一次预算超限的粘连，journal 中 `refused` 计数器首次非零。

0.3.1 plugin 的 tarball 压缩体积为 22418 字节（20 个条目，解包体积 74014 字节）。解包内容包含 52247 字节的 `dist/*.js`、13797 字节的 `dist/*.d.ts`、2694 字节的 `fixtures/` 以及 5276 字节的包根目录文件。包内不再包含 sourcemap，从解包载荷中移除了 41926 字节。`dist/*.js` 使用了其 53000 字节预算中的 52247 字节。0.3.1 core 的 tarball 压缩体积为 11585 字节（17 个条目，解包体积 38582 字节）。

## 开发

```bash
pnpm install
pnpm run verify
node scripts/gate.mjs --mutate
```

`pnpm run verify` 执行构建、类型检查、测试（131 通过，0 失败）以及 5 个门禁（`ssot`、`registry`、`namespace`、`step-review`、`copy`）。`node scripts/gate.mjs --mutate` 验证所有 5 个门禁均能捕获注入的突变。

## 贡献

欢迎提交 issue 与 pull request。

- 变更行为必须先编写失败的测试。
- 必须通过 `pnpm run verify`；`node scripts/gate.mjs --mutate` 必须捕获所有门禁。
- 门禁仅使用 Node 内置模块；任何新门禁必须在 `audit/gate_ledger.json` 中登记。
- 不得为 `dsh-remedy-core` 引入新的运行时依赖。
- 未提供对应 `data/results/live-*` 产物的补丁不能声明为 `verified`。

## 安全

安全漏洞报告请通过公开仓库的 GitHub 私密漏洞报告（private vulnerability reporting）渠道提交（于 2026-11-09 启用）。

## 许可证

MIT。独立开源项目；与 DeepSeek 无隶属关系。
