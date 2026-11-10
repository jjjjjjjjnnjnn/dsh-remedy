# dsh-remedy

[![CI](https://github.com/jjjjjjjjnnjnn/dsh-remedy/actions/workflows/ci.yml/badge.svg)](https://github.com/jjjjjjjjnnjnn/dsh-remedy/actions)
[![npm](https://img.shields.io/npm/v/dsh-remedy.svg)](https://www.npmjs.com/package/dsh-remedy)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](https://github.com/jjjjjjjjnnjnn/dsh-remedy/blob/main/LICENSE)
[![Node](https://img.shields.io/badge/node-%3E%3D%2022.19-brightgreen)](https://nodejs.org)
[![Status](https://img.shields.io/badge/status-verified-brightgreen)](https://github.com/jjjjjjjjnnjnn/dsh-remedy)

[English](README.md) | [中文说明](README.zh-CN.md)

DeepSeek Harness 的常驻处置层。当上游模型中继将两个工具调用推入同一个 delta 索引时，DeepSeek Harness 会以 `MALFORMED_RESPONSE` 中断当前轮次。dsh-remedy 拦截该流，证明各个顶层 JSON 对象的边界，分发拆分后的干净工具调用，使轮次正常完成。若任意载荷无法被证明，dsh-remedy 拒绝猜测并原样重新抛出原始失败。

## 它修什么

缺陷 `P-0001`：工具调用粘连。

上游中继将两个工具调用推入同一个索引。`@earendil-works/pi-ai` 的 `parseToolCallArguments` 接收到 `{...}{...}` 并抛出异常。`dsh-llm-pi-ai` 将其转换为 `LlmError(..., 'MALFORMED_RESPONSE')`。由于 `MALFORMED_RESPONSE` 不在默认的 `retryableCodes` 中，`dsh-agent-loop` 重新抛出该异常，轮次随之中止。

```text
Tool call "<name>": Unexpected non-whitespace character after JSON at position N
Received arguments: {"param":"val"}{"param2":"val2"}
```

在包含 48 个会话文件与 120 次 `turn/end` 事件的实测样本中，共有 40 次 `MALFORMED_RESPONSE` 失败，其中 37 次是顶层粘连的两个 JSON 对象（可证明且可修复）。2 次失败是在对象内部截断，1 次是其他切分失败。

反证表明，有 1 次成功尝试携带了 2 个独立 id，证实该缺陷是偶发的。上游讨论 deepseek-ai/deepseek-harness #4427 描述了同类粘连问题。

## 安装

安装包已发布至 npm。

将插件安装至 DeepSeek Harness profile：

```bash
dsh plugin --profile <name> add dsh-remedy
```

作为库依赖安装：

```bash
pnpm add dsh-remedy dsh-remedy-core
```

对于从源码构建的贡献者：

```bash
git clone https://github.com/jjjjjjjjnnjnn/dsh-remedy.git
cd dsh-remedy
pnpm install
pnpm run verify
```

## 工作方式

dsh-remedy 包装了 `llm/stream` Cordis waterfall。它会缓冲传入的工具调用 delta。当遇到携带 `MALFORMED_RESPONSE` 的终止块 `finish{kind:'error'}`（或抛出具有相同签名的错误）时，引擎在顶层 JSON 对象边界处切分未关闭的缓冲区。已携带粘连参数的 `block-end` 也以相同方式修复。

```text
Incoming stream:
  delta:  {"command":"pwd"}{"command":"ls"}
  finish: { kind: 'error', error: MALFORMED_RESPONSE }

Repaired stream:
  call 0: id="call_1", arguments={"command":"pwd"} -> block-end
  call 1: id="call_1#remedy-1", arguments={"command":"ls"} -> block-end
  finish: { kind: 'stop' }
```

首个调用保留原始 id。合成 id 格式化为 `<id>#remedy-N`。错误的 finish 被替换为 `{kind:'stop'}`。

全有或全无原则：若任意缓冲区无法被证明，则不分发任何内容，原样重新抛出原始失败。单个无法解析的对象直接拒绝，绝不切分。

## 安全保证

- 若任意缓冲区无法被证明，不分发任何内容并原样重新抛出原始失败。
- 单个无法解析的对象直接拒绝，绝不切分。
- JSON 字符串内部的 `}{` 不会被视作边界。
- 工具名从未到达的调用直接拒绝，绝不分发给空名称（`missing-name`）。
- 同一个索引内发生变更的工具名会中止救援，原样重新抛出原始失败（`name-changed`）。
- 修复后的 `finish` 保留适配器的 `replayState`。
- `block-end` 修复会暂扣至工具调用阶段结束；同流后续若出现拒绝则整体撤回（`rolled-back`）并吐出原始 chunk。
- `maxCalls` 限制整条流合成调用的总预算，而非单个 block 的上限。
- 消费者提前停止的流记录为消费者中止（`consumer-abort`），而非记为 quiet。
- 合成 call 一定带 `block-start` 与 `block-end`，绝不分发裸 `block-end`。
- 撤回的修复将调用额度返还给整条流的 `maxCalls` 预算。
- `max-tokens` 截断绝不修复，且只记为 truncated，不算未修复的粘连。
- 透传的 provider 错误计入 `errors`。
- 除非配置了 `journalPath`，插件不向磁盘写入任何内容。
- 插件仅挂载 1 行（`remedy-stream`），不增加任何路由、工具或 UI。
- 首个调用保留原始 id；合成 id 使用 `<id>#remedy-N`。
- `retryOnMalformed` 默认为 0：重试只是权宜之计，不是修复。
- 纯拒绝只增加 `refused`，绝不增加 `fused`。
- 预算拒绝（`too-many-calls`）同时增加 `fused`、`refused` 与 `unrepaired`，因此拒了也没修的流绝不会读成 `repaired`。
- 消费者提前停止的流（`consumer-abort`）保留 `fused` 与 `unrepaired`，并另加 `withdrawn`。
- 截断流只增加 `withdrawn`，绝不增加 `fused`。
- 四个 verdict 词保持不变（`unmeasured`、`quiet`、`degraded`、`repaired`），仅计数行从六个名字长到八个（`streams=`、`fused=`、`repaired=`、`unrepaired=`、`truncated=`、`errors=`、`refused=`、`withdrawn=`）。
- `unrepaired` 现在仅代表 1 件事：证实了粘连且未被修复。

## 它不做什么

| 限制 | 说明 |
| --- | --- |
| 根因归因 | 归因止步于组装后的文本：插件无法证明是中继还是适配器粘连了对象。 |
| 截断流 | `max-tokens` 截断不予修复。 |
| Headless 会话持久化 | Headless profile 不持久化 `assistant/attempt` 流，因此实机产物中的 `session.fused_calls` 为 0；证明由 journal 计数器与合成 id 承载。 |
| 宿主消息本地化 | 错误消息回退逻辑解析英文 `Received arguments:` 文本；若宿主消息被本地化，该回退失效，但 delta 缓冲区路径仍正常工作。 |
| 合成身份 | 合成 id 仅作为追溯辅助，不是持久身份。 |
| 桌面轮次状态 | 桌面轮次在产出答案后由操作员停止；产物记录 `turn_end=aborted`，而非宣称完成。 |
| 桌面 App 缓存 | 验证仅针对已记录的 tarball sha256，而非正在运行的桌面 App 所缓存的内容。 |
| 拒绝判定 | verdict 词无法表达“观测到并正确拒绝”；只有计数行可以。唯一缺陷为非法 JSON 的流现在读为 `quiet`。 |
| 日志迁移 | 已有的 journal 记录行不予迁移；在混合日志中，`status --json` 汇报末行的结构。 |
| 下游 block 接受度 | 合成工具调用现在会开启独立的 `block-start`，但下游是否接受该合成 block 尚未在实机上得到证实（盲区 `BS-11`）。 |
| 错误重试 | `agent/request-error` 上的重试回退默认为 0，仅是权宜之计而非修复；`0.3.0` 样本显示宿主已对服务端错误家族进行了重试（93 组失败中有 84 组在同轮次内随后尝试成功）。 |
| 样本范围 | `0.3.0` 数字背后的样本来自单一机器和单一账户在固定截止时间前的数据；不同的截止时间会得出不同的总量。 |

## 自己验证

运行验证命令：

```bash
pnpm run verify
node scripts/gate.mjs --mutate
```

运行 CLI 命令（退出码：0 正常，1 发现问题，2 用法错误，3 不可用）：

```bash
dsh-remedy status
dsh-remedy verify
```

实机验证证据产物：

```text
data/results/live-2026-11-09T17-00-00.000Z.json
data/results/live-desktop-2026-11-09T19-10-00.000Z.json
```

## 状态

`0.3.x` 已发布至 npm（`dsh-remedy` 与 `dsh-remedy-core`）。补丁 `P-0001` 已在真机上通过验证（`verified`），覆盖 headless profile 与桌面 App。补丁 `P-0002` 与 `P-0003` 处于测试状态（`tested`），仅有单元测试与负对照，尚无实机 live 证据产物。

Headless 验证（`remedy-live` profile，Windows）：
- 运行次数: 2
- 观测流数: 10
- 粘连调用: 1
- 已修复: 1
- 拒绝或未修复: 0
- 截断: 0
- 其他流错误: 0
- 轮次结果: `completed`
- 工具调用: 5，工具结果: 5
- 合成 id: `call_00_82805lrla1dhndlzpv1cakrx#remedy-1`

桌面 App 验证（`desktop` profile，App 重启后）：
- 观测流数: 39
- 粘连调用: 2
- 已修复: 2
- 拒绝或未修复: 0
- 合成 id: `call_00_eurpysgrncrqocrhr4ao3uvi#remedy-1`
- 轮次结果: `turn_end=aborted`（产出答案后由操作员停止）

测试套件与门禁：
- 测试: 126 通过，0 失败
- 门禁: 5 通过（`ssot`、`registry`、`namespace`、`step-review`、`copy`），负对照捕获 5/5
- 夹具: 5（包含 1 次真实粘连调用与 1 次反证调用）

包体积与字节预算：
发行的 `0.3.0` tarball：压缩体积 22418 字节，20 个条目，解包体积 74014 字节（在 `0.1.1` 上进行瘦身前：压缩体积 26345 字节，解包体积 98424 字节，包含 30 个文件，含 10 个 sourcemap 文件）。解包细分：`dist/*.js` 占 52247 字节，`dist/*.d.ts` 占 13797 字节，`fixtures/` 占 2694 字节，包根目录文件占 5276 字节。移除 sourcemap 减去了 41926 字节的解包载荷（测量记录于 `docs/research/stability-audit-2026-11-10.md`）。发行包包含 `dist/*.js`、`dist/*.d.ts`、`fixtures/`、`cordis.patch.yml`、`README.md`、`LICENSE`，且不含 sourcemap。在 `P-0003` 之后，`dist/*.js` 占 52247 字节，处于 53000 字节的工作上限之内。

## 开发

要求 Node `>= 22.19` 与 pnpm。

```bash
pnpm install
pnpm run verify
node scripts/gate.mjs --mutate
```

仓库布局：
- `packages/core`：纯引擎：切分器、修复决策、注册表、脱敏与判定。
- `packages/plugin`：DSH 加载器、`llm/stream` 包装器、CLI、会话扫描器与 zstd 日志读取器。
- `scripts/`：门禁与记录脚本，仅使用 Node 内置模块。
- `tests/`：单元测试、治理测试与端到端测试。
- `data/fixtures`：真实粘连文本、反证与负对照。
- `data/results`：带 sha256 sidecar 的脚本产出证据。
- `audit/`：门禁台账、补丁台账、步骤评审、盲区记录与 AI 披露。
- `docs/`：交接文档、补丁记录、ADR 与文案通道。

## 贡献

欢迎提交 issue 与 pull request。

- 变更行为前必须先编写失败的测试。
- 必须通过 `pnpm run verify`。
- `node scripts/gate.mjs --mutate` 必须捕获所有门禁（5/5）。
- 门禁脚本必须仅使用 Node 内置模块；新门禁必须在 `audit/gate_ledger.json` 中登记。
- `dsh-remedy-core` 不得引入新的运行时依赖。
- 未提供 `data/results/live-*` 证据产物的补丁不能标记为 `verified`。

## 安全

安全报告请使用公开仓库上的 GitHub 私密漏洞报告（private vulnerability reporting，已于 2026-11-09 启用）。

## 许可证

MIT

与 DeepSeek 无隶属关系。
