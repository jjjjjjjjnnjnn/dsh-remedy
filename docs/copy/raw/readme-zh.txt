# dsh-remedy

[![CI](https://github.com/jjjjjjjjnnjnn/dsh-remedy/actions/workflows/ci.yml/badge.svg)](https://github.com/jjjjjjjjnnjnn/dsh-remedy/actions)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](https://github.com/jjjjjjjjnnjnn/dsh-remedy/blob/main/LICENSE)
[![Node](https://img.shields.io/badge/node-%3E%3D%2022.19-brightgreen)](https://nodejs.org)
[![Status](https://img.shields.io/badge/status-verified-brightgreen)](https://github.com/jjjjjjjjnnjnn/dsh-remedy)

[English](README.md) | [中文说明](README.zh-CN.md)

DeepSeek Harness 的常驻处置层。当上游模型中继将两个工具调用推入同一个 delta 索引时，DeepSeek Harness 会以 `MALFORMED_RESPONSE` 中断当前轮次。dsh-remedy 拦截该流，逐个证明顶层 JSON 对象的边界，分发拆分后的干净工具调用，使轮次正常完成。若任意载荷无法被严格证明，dsh-remedy 拒绝猜测并原样重新抛出原始失败。

## 它修什么

缺陷 `P-0001`：工具调用粘连（tool-call fusion）。

上游中继将两个工具调用输出到了同一个 delta 索引中。底层解析器接收到 `{...}{...}` 并抛出语法错误，适配器将其映射为 `LlmError(..., 'MALFORMED_RESPONSE')`。由于 `MALFORMED_RESPONSE` 不在默认的可重试状态码中，当前轮次立即中止。

```text
Tool call "<name>": Unexpected non-whitespace character after JSON at position N
Received arguments: {"param":"val"}{"param2":"val2"}
```

在包含 27 个会话与 79 次 `turn/end` 事件的实测样本中，工具调用粘连引发了 37 次失败（约 47%）。各工具的失败分布如下：

- `ops_bash`: 11
- `read_page`: 8
- `ops_inspect_local_file`: 4
- `ops_read_files`: 3
- `list_agents`: 3
- `send_message`: 3
- `web_search`: 2
- `edit`: 1
- `ops_grep`: 1
- `spawn_teammate`: 1

反证表明，有 1 次成功尝试携带了 2 个独立 id，证实该缺陷是偶发的。上游讨论 deepseek-ai/deepseek-harness #4427 描述了同类粘连问题。

## 安装

npm 尚未发布。当前请通过源码安装并构建：

```bash
git clone https://github.com/jjjjjjjjnnjnn/dsh-remedy.git
cd dsh-remedy
pnpm install
pnpm run verify
```

首次发布后，可直接安装至 DeepSeek Harness profile：

```bash
dsh plugin --profile <name> add dsh-remedy
```

首次发布后亦可作为库安装：

```bash
pnpm add dsh-remedy dsh-remedy-core
```

## 工作方式

dsh-remedy 包装了 `llm/stream` Cordis waterfall。它会缓冲传入的工具调用 delta。当流遇到包含 `MALFORMED_RESPONSE` 的终止块 `finish{kind:'error'}`（或抛出具有相同签名的错误）时，引擎在顶层 JSON 对象边界处切分未关闭的缓冲区。

```text
Incoming stream:
  delta:  {"command":"pwd"}{"command":"ls"}
  finish: { kind: 'error', error: MALFORMED_RESPONSE }

Repaired stream:
  call 0: id="call_1", arguments={"command":"pwd"} -> block-end
  call 1: id="call_1#remedy-1", arguments={"command":"ls"} -> block-end
  finish: { kind: 'stop' }
```

首个调用保留原始 id，后续调用使用 `<id>#remedy-N`。错误的 finish 被替换为 `{kind:'stop'}`。

全有或全无原则：若任意缓冲区无法被严格证明，则不分发任何内容，原样重新抛出原始失败。

## 安全保证

- 全有或全无：若任意缓冲区无法被严格证明，则不分发任何内容，原样重新抛出原始失败。
- 单个无法解析的对象直接拒绝，绝不切分。
- JSON 字符串内部的 `}{` 不会被视作对象边界。
- `max-tokens` 截断绝不修复。
- 除非显式配置 `journalPath`，插件不对磁盘写入任何内容。
- 插件仅挂载 1 行（`remedy-stream`），不新增任何路由、工具或 UI。
- 首个调用保留原始 id；合成 id 使用 `<id>#remedy-N`。
- `retryOnMalformed` 默认为 0：重试只是权宜之计，不是根治方案。

## 它不做什么

| 限制 | 说明 |
| --- | --- |
| 根因归因 | 归因止步于组装后的文本；无法证明是中继还是适配器粘连了对象。 |
| 截断流 | `max-tokens` 导致的截断绝不修复。 |
| Headless 会话持久化 | Headless profile 不持久化 `assistant/attempt` 流；实机产物中的 `session.fused_calls` 为 0，证据由 journal 计数器与合成 id 承载。 |
| 宿主消息本地化 | 错误消息回退逻辑解析英文 `Received arguments:` 文本；若宿主消息被本地化，该回退失效，但 delta 缓冲区路径仍正常工作。 |
| 合成身份 | 合成 id 仅作为追溯手段，不是持久身份。 |
| 桌面轮次状态 | 桌面轮次在产出答案后由操作员人工停止；产物如实记录 `turn_end=aborted`，而非宣称完成。 |
| 桌面 App 缓存 | 验证仅针对已记录的 tarball sha256，而非正在运行的桌面 App 所缓存的内容。 |

## 自己验证

在本地运行验证命令：

```bash
pnpm run verify
node scripts/gate.mjs --mutate
```

运行 CLI 命令检查状态与夹具（退出码：0 正常，1 发现问题，2 用法错误，3 不可用）：

```bash
dsh-remedy status
dsh-remedy verify
```

实机验证证据产物记录于：

```text
data/results/live-2026-11-09T17-00-00.000Z.json
data/results/live-desktop-2026-11-09T19-10-00.000Z.json
```

## 状态

版本 0.1.0。本地真机验证通过，npm 未发布。桌面 App 未重启时使用独立的 headless profile（`remedy-live`）验证；随后在已重启的桌面 App 进程中亦完成实机验证。

Headless 验证（`remedy-live`，DSH `>= 0.2.0-rc.1 < 0.3.0-0`，Windows）：
- 运行次数: 2
- 观测流数: 10
- 粘连调用: 1
- 已修复: 1
- 拒绝或未修复: 0
- 截断: 0
- 其他流错误: 0
- 轮次结果: `completed`
- 工具调用: 5，工具返回: 5
- 合成 id: `call_00_82805lrla1dhndlzpv1cakrx#remedy-1`

桌面 App 验证（`desktop` profile，App 已重启）：
- 观测流数: 39
- 粘连调用: 2
- 已修复: 2
- 拒绝或未修复: 0
- 合成 id: `call_00_eurpysgrncrqocrhr4ao3uvi#remedy-1`
- 轮次结果: `turn_end=aborted`（产出答案后由操作员人工停止）

测试套件与门禁：
- 测试: 95 通过，0 失败，覆盖 5 个门禁（负对照捕获 5/5）

## 开发

要求 Node `>= 22.19` 与 pnpm。

```bash
pnpm install
pnpm run verify
node scripts/gate.mjs --mutate
```

仓库布局：
- `packages/core`：纯引擎，包含切分器、修复决策、注册表、脱敏与判定。
- `packages/plugin`：DSH 加载器、`llm/stream` 包装器、CLI、会话扫描器与 zstd 日志读取器。
- `scripts/`：仅使用 Node 内置模块的门禁与记录脚本。
- `tests/`：单元测试、治理测试与端到端测试（5 个夹具）。
- `data/fixtures`：真实粘连文本、反证与负对照。
- `data/results`：带 sha256 sidecar 的脚本产出证据。
- `audit/`：门禁台账、补丁台账、步骤评审、盲区记录与 AI 披露。
- `docs/`：交接文档、补丁记录与 ADR。

## 贡献

欢迎提交 issue 与 pull request。

- 变更行为前必须先编写失败的测试。
- 必须通过 `pnpm run verify`。
- `node scripts/gate.mjs --mutate` 必须捕获所有门禁（5/5）。
- 门禁脚本必须仅使用 Node 内置模块；新门禁必须在 `audit/gate_ledger.json` 中登记。
- `dsh-remedy-core` 不得引入新的运行时依赖。
- 未提供 `data/results/live-*` 证据产物的补丁不能标记为 `verified` 状态。

## 安全

安全报告请使用公开仓库上的 GitHub 私密漏洞报告（private vulnerability reporting）。

## 许可证

MIT。

独立项目；与 DeepSeek 无隶属关系。
