# dsh-remedy

[![CI](https://github.com/jjjjjjjjnnjnn/dsh-remedy/actions/workflows/ci.yml/badge.svg)](https://github.com/jjjjjjjjnnjnn/dsh-remedy/actions) [![npm](https://img.shields.io/npm/v/dsh-remedy)](https://www.npmjs.com/package/dsh-remedy) [![license](https://img.shields.io/badge/license-MIT-blue)](LICENSE) [![node](https://img.shields.io/badge/node-%3E%3D22.19-brightgreen)](package.json) [![status: verified](https://img.shields.io/badge/status-verified-brightgreen)](data/results/)

[English](README.md)

dsh-remedy 是 DeepSeek Harness（DSH）的常驻处置层。当上游中继将多个工具调用粘连进同一个流索引时，DSH 会因不可恢复的 MALFORMED_RESPONSE 错误中止当前轮次。dsh-remedy 接入 llm/stream Cordis 接缝，切分可证的顶层 JSON 对象，并在 agent 循环失败前将其作为独立调用重新发出。若任意片段无法被证明，插件对流不做修改并原样重新抛出原始失败。

## 它修什么

在工具调用流式传输过程中，上游中继可能将多个工具调用输出到同一个流索引。上游参数解析接收到粘连的 JSON 对象后抛出异常，触发致命的 MALFORMED_RESPONSE 轮次崩溃。该缺陷族记录于 deepseek-ai/deepseek-harness discussion #4427。

```
Tool call "<name>": Unexpected non-whitespace character after JSON at position N
Received arguments: {"command":"pwd"}{"command":"ls"}
```

在 48 个会话文件、包含 120 次 turn/end 事件的实测样本中，有 40 次以 MALFORMED_RESPONSE 失败告终。在这 40 次失败中，37 次是可证且可修复的两个顶层 JSON 对象粘连，2 次在对象内部被截断，1 次为其他切分失败。

## 安装

安装包已发布至 npm。

将插件安装至 DSH profile：

```bash
dsh plugin --profile <name> add dsh-remedy
```

作为库依赖安装：

```bash
pnpm add dsh-remedy dsh-remedy-core
```

面向从源码构建的贡献者：

```bash
git clone https://github.com/jjjjjjjjnnjnn/dsh-remedy.git
cd dsh-remedy
pnpm install
pnpm run verify
```

## 工作方式

插件包装了 llm/stream waterfall。它缓冲工具调用 delta，并捕获终止的错误 finish 或异常：

```
Raw stream:      block-start(id="call_0") -> delta('{"cmd":"pwd"}{"cmd":"ls"}') -> finish(error: MALFORMED_RESPONSE)
Repaired output: block-start(id="call_0") -> delta('{"cmd":"pwd"}') -> block-end
                 block-start(id="call_0#remedy-1") -> delta('{"cmd":"ls"}') -> block-end
                 finish(kind: 'stop')
```

修复遵循全有或全无原则。每个未关闭的缓冲区都必须完整切分为可解析的完整 JSON 对象。若任意缓冲区无法被证明，则不发出任何内容，原样重新抛出原始失败。

## 安全保证

- 除非配置了 journalPath，否则不向磁盘写入任何内容。
- 单个无法解析的对象直接拒绝，绝不切分。
- JSON 字符串内部的 `}{` 不是边界。
- 首个调用保留原始 id；合成 id 为 `<id>#remedy-N`。
- max-tokens 截断绝不修复，且只记为 truncated，不算未修复的粘连。
- 工具名从未到达的调用直接拒绝，绝不分发给空名称。
- 同一索引内发生变更的工具名会中止救援，原样重新抛出原始失败。
- 修复后的 finish 保留适配器的 replayState。
- block-end 修复暂扣至工具调用阶段结束；同流后续若出现无效 block 则回滚修复。
- 合成 call 一定带 block-start 与 block-end，而不是裸 block-end。
- maxCalls 限制整条流合成调用的总预算，而非按单个 block 限制。
- 撤回的修复把预算还给整条流的 maxCalls 预算。
- 消费者提前停止记录为 consumer-abort 并增加 withdrawn。
- 透传的 provider 错误计入 errors。
- 纯拒绝只加 refused，不加 fused。
- 预算拒绝同时加 unrepaired，所以“拒了也没修”的流不会读成 repaired。
- 消费者提前停止保留 fused 与 unrepaired，并另加 withdrawn。
- 四个 verdict 词（unmeasured、quiet、degraded、repaired）保持不变，只有计数行从 6 个名称扩展到 8 个名称。

## 它不做什么

| 限制 | 说明 |
|---|---|
| 归因边界 | 归因止步于组装后的文本；无法证明是中继还是适配器粘连了对象。 |
| Headless 流 | Headless profile 不持久化 assistant attempt 流；证明由 journal 计数器承载。 |
| 身份持久性 | 合成 id 仅用于追溯辅助，不是持久身份。 |
| 宿主本地化 | 错误消息回退逻辑解析英文 `Received arguments:`；本地化消息会使该回退失效，但 delta 路径仍正常工作。 |
| 截断流 | max-tokens 截断不予修复。 |
| 桌面中止 | 桌面轮次在产出答案后由操作员停止；产物记录为 turn_end=aborted。 |
| 宿主缓存 | 验证仅适用于已记录的 tarball sha256 哈希，而非正在运行的应用内存缓存。 |
| 判定精度 | verdict 状态词无法表达“观测到并正确拒绝”；只有计数行可以体现。 |
| 日志迁移 | 已有的 journal 记录行不进行迁移；status --json 汇报末行的结构。 |
| 非标准适配器 | 自行关闭 block 并维护自身索引记账的适配器仍未实测（BS-11）。 |
| 重试策略 | 重试 agent/request-error 默认为 0；93 组失败中有 84 组已由上游重试。 |
| 样本范围 | 0.3.0 样本来自单一机器和单一账户在固定截止时间窗口内的数据。 |

## 自己验证

在本地运行验证与门禁突变检查：

```bash
pnpm run verify
node scripts/gate.mjs --mutate
dsh-remedy verify
```

附带对应 sha256 sidecar 的真机宿主验证产物位于：
- `data/results/live-2026-11-10T14-45-00.000Z.json`
- `data/results/live-2026-11-10T16-30-00.000Z.json`

## 状态

0.3.x 已发布至 npm（`dsh-remedy` 与 `dsh-remedy-core`）。P-0001、P-0002 与 P-0003 均已在真实宿主上完成验证（verified）：P-0001 在 headless profile 与桌面 App 上完成验证；P-0002 在 2026-11-10 的 headless 真机运行中修复了一次真实的两调用粘连，并确认合成 id 被实际派发执行；P-0003 在 2026-11-10 的另一次 headless 运行中，代码拒绝修复一次预算超限的粘连，journal 中 refused 计数器首次非零。

发行的 0.3.0 tarball 为 22418 字节压缩体积（20 个条目）与 74014 字节解包体积。解包内容包括 52247 字节的 `dist/*.js`、13797 字节的 `dist/*.d.ts`、2694 字节的 `fixtures/` 以及 5276 字节的包根目录文件。包内不再随附 sourcemap，移除了 41926 字节的解包载荷。`dist/*.js` 的字节预算为 52247 字节，处于 53000 字节的工作上限之内。

## 开发

运行开发与诊断命令：

```bash
pnpm install
pnpm run verify
node scripts/gate.mjs --mutate
dsh-remedy status
dsh-remedy repair [file]
dsh-remedy scan <session.jsonl>
dsh-remedy verify
```

## 贡献

欢迎提交 issue 与 pull request。变更行为前必须先编写失败的测试。必须通过 `pnpm run verify`，且 `node scripts/gate.mjs --mutate` 必须捕获所有门禁。门禁仅使用 Node 内置模块；新门禁必须在 `audit/gate_ledger.json` 中登记。不得为 `dsh-remedy-core` 引入新的运行时依赖。未提供 `data/results/live-*` 产物的补丁不能标记为 verified。

## 安全

安全漏洞报告请通过公开仓库的 GitHub 私密漏洞报告（private vulnerability reporting）渠道提交。

## 许可证

MIT。独立项目；与 DeepSeek 无隶属关系。
