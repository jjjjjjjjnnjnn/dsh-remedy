# dsh-remedy

[![CI](https://github.com/jjjjjjjjnnjnn/dsh-remedy/actions/workflows/ci.yml/badge.svg)](https://github.com/jjjjjjjjnnjnn/dsh-remedy/actions) [![npm](https://img.shields.io/npm/v/dsh-remedy)](https://www.npmjs.com/package/dsh-remedy) [![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE) [![Node](https://img.shields.io/badge/node-%3E%3D22.19-brightgreen)](package.json) [![Status](https://img.shields.io/badge/status-verified-brightgreen)](#status)

[English](README.md)

dsh-remedy 是 DeepSeek Harness（DSH）的常驻处置层。当上游中继流把多个工具调用粘连进同一个索引，或在程序代码周围漏写引号时，DSH 会因 `MALFORMED_RESPONSE` 错误而中断。dsh-remedy 挂载在 `llm/stream` 接缝处，在流传输过程中修复已被证明的载荷，并将无法证明的失败原样重新抛出。

## 它修什么

当上游中继将多个工具调用流式传输到单个 delta 缓冲区，或输出未加引号的字符串值时，就会触发该缺陷（上游讨论：deepseek-ai/deepseek-harness discussion #4427）。

```text
Tool call "<name>": Unexpected non-whitespace character after JSON at position N
Received arguments: {"command":"..."}{"command":"..."}
```

在 78 个会话文件的实测样本中，发现 393 次 attempt、38 次粘连调用、44 次 `MALFORMED_RESPONSE` 失败，其中 39 条可修复，0 行不可读。在 293 个 turn 的普查中，94 个 completed、88 个 `max_tokens`、100 个 error 与 11 个 aborted。error 轮次点名了六个错误码：`MALFORMED_RESPONSE` 44、`UNSUPPORTED_REASONING_EFFORT` 37、`SERVER` 16、`UNKNOWN` 1、`MISSING_CREDENTIAL` 1 与 `INVALID_REQUEST` 1。

`dsh-remedy scan` 命令支持读取单个会话文件或整个会话目录，同时支持纯文本 `.jsonl` 与多帧 `.jsonl.zstd`，每个文件输出一行可审计记录，支持 `--since`，并打印包含所统计错误码的 turn 普查报告。

## 安装

安装到 DSH 配置方案（profile）：

```bash
dsh plugin --profile <name> add dsh-remedy
```

作为库引入：

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

dsh-remedy 在 `llm/stream` 接缝处拦截 chunk 事件，并缓冲工具调用的 delta。

```text
Input stream:
  block-start (index: 0, tool: "ops_bash", id: "call_00_xyz")
  delta       (arguments: '{"command":"echo 1"}{"command":"echo 2"}')
  finish      (kind: "error", error: "MALFORMED_RESPONSE")

Repaired stream:
  block-start (index: 0, tool: "ops_bash", id: "call_00_xyz")
  delta       (arguments: '{"command":"echo 1"}')
  block-end   (index: 0)
  block-start (index: 1, tool: "ops_bash", id: "call_00_xyz#remedy-1")
  delta       (arguments: '{"command":"echo 2"}')
  block-end   (index: 1)
  finish      (kind: "stop")
```

首个调用保留其原始 id；后续合成的调用获得 `<id>#remedy-N`。在全有或全无（all-or-nothing）规则下，流中的每个缓冲区都必须被证明是合法的 JSON 对象。只要有任意一个缓冲区无法被证明，就不会发出任何内容，合成调用会被撤回，原始失败被重新抛出。

## 安全保证

- 默认零写盘：除非配置了 `journalPath`，否则插件不向磁盘写入任何内容。
- 若任意缓冲区无法完成证明，则不发出任何内容，并将原始失败重新抛出。
- 单个解析失败的对象直接拒绝，绝不切分。
- JSON 字符串字面量内部的 `}{` 不被视为边界。
- 空工具名直接拒绝，绝不派发给空名称。
- 同一索引内变更的工具名会中止救援，并将原始失败重新抛出。
- 修复后的 `finish` 保留适配器的 `replayState`。
- 原子 `block-end` 提交：修复暂扣至工具调用阶段结束；同流后续若有 block 被拒绝，则撤回修复并发出原始 chunk。
- `maxCalls` 限制整条流合成调用的总预算，而非按单个 block 限制。
- 消费者提前停止的流记录为 `consumer-abort` 与放弃，不记为 `quiet`。
- 合成 call 一定带 `block-start` + `block-end` 而不是裸 `block-end`。
- 撤回的修复把预算还给整条流的 `maxCalls` 上限。
- `max-tokens` 只记 truncated，不算未修复的粘连。
- 透传的 provider 错误计入 `errors`。
- 纯拒绝只加 `refused` 不加 `fused`。
- 预算拒绝同时加 `unrepaired`，所以“拒了也没修”的流不会读成 `repaired`。
- 消费者提前停止保留 `fused` 与 `unrepaired` 并另加 `withdrawn`。
- 四个 verdict 词（`unmeasured`、`quiet`、`degraded`、`repaired`）一个没变，只有计数行从六个名字长到八个。
- 只有当恰好一段能把整段文本还原成一个 plain object 且 payload 字节一致时才给裸值加引号。
- call 保留自己的 id 与 name，reseal 不合成新 call、不占流级的 `maxCalls` 预算。
- 0 个候选或 2 个以上候选一律拒绝而不是猜。
- 只因 reseal 而修好的流读 `repaired` 绝不读 `quiet`。
- 第九个计数器 `resealed` 在类型里故意可选，旧版本录下的计数对象仍然渲染原来那一行。
- `scan` 用插件自己发布的同一个读取器读多帧 zstd 日志。
- 目录扫描每个文件留一行可审计记录。
- `--since` 把丢弃的事件记成 `before_since` 而不是藏起来。
- 一个解不开的文件是一条 failure 行与非零退出码，绝不是 0 报告。
- 脱敏能匹配单反斜杠、双反斜杠与把 home 路径编码进目录名这三种形状。
- `scan` 统计每一个 `turn/end`（completed、`max_tokens`、aborted、error）并点名每个 `reason.error.code`，而不是只报 `MALFORMED_RESPONSE`。
- census 只报告、绝不升级成 finding，退出码仍只看 `fused_calls` 与 `fusion_failures`。
- 维护者文案通道：构建侧通道将超出 Windows 命令行长度限制的请求移至 stdin 传输，从最终的 `result` 事件中读取回答，并按原因命名每次启动失败，而非输出 null 状态；它不改动任何运行时接缝与对外文案。

## 它不做什么

| 限制 | 说明 |
|---|---|
| 归因边界 | 止步于组装后的文本；无法证明是中继还是适配器粘连了对象 |
| Headless 尝试记录 | headless profile 不持久化 `assistant/attempt` 流，实测产物中的 `session.fused_calls` 为 0；journal 计数器与合成 id 承载证明 |
| 标识符持久性 | 合成 id 仅作为追溯辅助，不是跨会话的持久身份 |
| 本地化消息 | 报错信息回退路径解析英文 `Received arguments:`；本地化的宿主消息会使该回退失效，但 delta 缓冲路径仍正常工作 |
| 截断错误 | 不修复 `max-tokens` 截断；截断尾部缺失的是字节而非引号 |
| 轮次完成状态 | 桌面端的轮次在回答后由操作员终止（`turn_end=aborted`），并未声称已完成 |
| 验收范围 | 验证仅适用于已记录的 tarball sha256，而非未验证的运行中桌面应用缓存 |
| 判定词词表 | verdict 判定词无法表达“观测到并被正确拒绝”；错误的 JSON 读作 `quiet` |
| 日志迁移 | 现存 journal 行不进行结构迁移；在混合版本的日志中，`status --json` 报告最后一行的结构 |
| 自定义适配器 | 自行闭合 block 并维护独立索引记账的适配器尚未经过实测（盲点 `BS-11`） |
| 请求错误重试 | 针对 `agent/request-error` 的重试回退默认为 0 且仅为权宜之计，不能替代根因修复 |
| 样本窗口 | 实测样本反映单一机器和单一账户在固定截止时间前的数据 |

## 自己验证

```bash
# 运行测试套件、类型检查与治理门禁
pnpm run verify

# 验证全部门禁的负对照
node scripts/gate.mjs --mutate

# 从已安装的副本验证随包附带的夹具
dsh-remedy verify

# 查看已记录的真机验证证据
cat data/results/live-2026-11-10T14-45-00.000Z.json
```

## 状态

P-0001、P-0002 与 P-0003 均已在真实宿主上完成验证（`verified`）：
- P-0001 在 headless profile 与桌面 App 完成验证。
- P-0002 在 2026-11-10 的 headless 真机运行里修好了一次真实的两调用粘连，并看到合成 id 被真的派发执行。
- P-0003 在 2026-11-10 的另一次 headless 运行里，代码拒绝修复一次预算超限的粘连，journal 里 `refused` 第一次非零。

P-0005、P-0004、P-0006、P-0007、P-0008 与 P-0009 是 `tested` 而不是 `verified`：都有单测、负对照，以及一条实测夹具或一次实测扫描，但还没有真机产生过 P-0005 修的裸值形状；P-0004、P-0006 与 P-0009 改的是离线读取器，而非常驻接缝；P-0007 改的是构建侧的 copy 通道；P-0008 增加了构建侧门禁。

`0.3.6` 是两个包已发布的 `latest`。`0.3.5` 是上一个版本，`0.3.4` 是其前一个版本。plugin 的 0.3.0 是坏发布。

包体积与载荷说明：
- 已发布的 0.3.6 plugin tarball：29445 字节压缩体积，29 个文件，解包 97807 字节（67997 字节 `dist/*.js`、20951 字节 `dist/*.d.ts`、3583 字节 `fixtures/`、5276 字节包根文件），shasum `fe85d15a5e97e9956a8a899d993ec1122f0c8774`。
- 已发布的 0.3.6 core tarball：19247 字节压缩体积，19 个文件，解包 63408 字节（43117 字节 `dist/*.js`、16994 字节 `dist/*.d.ts`），shasum `76777609f4e3928af5ed591c01edb7ee1c2323f0`。
- 已发布的 0.3.5 tarball 保持为 29448 字节压缩体积，29 个文件，解包 97944 字节（shasum `c1b1b43185ea49347c394c987dd878c717d8f4f5`）以及 18723 字节压缩体积，19 个文件，解包 61553 字节（shasum `cc9895f826b56e9e7a5a1af2ed0886cb43514531`）；FACTS 中未记录 0.3.4 的 tarball 尺寸。
- 已发布的 0.3.3 plugin tarball：28378 字节压缩体积，29 个文件，解包 94769 字节（65521 字节 `dist/*.js`、20389 字节 `dist/*.d.ts`、3583 字节 `fixtures/`、5276 字节包根文件），shasum `46ad57ea718be732133979c4b0449f7221ee69c7`。
- 已发布的 0.3.3 core tarball：16776 字节压缩体积，19 个文件，解包 55684 字节（35393 字节 `dist/*.js`、16994 字节 `dist/*.d.ts`），shasum `6fbbeb060505cb80c7f454dbab5ea74acd463fdd`。
- sourcemap 不再进包，移除了 41926 字节的解包载荷。
- 字节预算：`dist/*.js` 在 P-0005 后达到 55815 字节，超出 53000 字节上限；0.3.2 将接缝拆分，将 `repair-stream.js` 削减至 27925 字节，插件总量增至 56344 字节；P-0004 随后使总量增至 64539 字节并对 CLI 进行相同拆分，`cli.ts` 降至 8503 字节，`cli-args.ts` 与 `scan-command.ts` 增加 9119 字节，总量增至 65521 字节；P-0006 先冲到 70389 字节超标，删除独立模块并将辅助函数内联后落回 67908 字节。当前工作上限为：生成的 `repair-stream.js` 28000 字节，生成的 `session-scan.js` 14000 字节，生成的 `cli.js` 10000 字节，插件总量 68000 字节。P-0008 将该上限转化为针对总量、`repair-stream.js`、`session-scan.js` 与 `cli.js` 的门禁。P-0009 落地后为 68000 字节中的 67997 字节，因此生成的插件当前距离上限还剩 3 字节空间。

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
- `pnpm run verify` 必须通过；`node scripts/gate.mjs --mutate` 必须捕获每个门禁。
- 门禁仅使用 Node 内置模块；任何新门禁必须在 `audit/gate_ledger.json` 中登记。
- 不得为 `dsh-remedy-core` 引入新的运行时依赖。
- 未提供 `data/results/live-*` 产物的补丁不能声明为 `verified` 状态。

## 安全

安全漏洞报告请通过公开仓库的 GitHub 私密漏洞报告（private vulnerability reporting）渠道提交（于 2026-11-09 启用）。

## 许可证

MIT。独立项目；与 DeepSeek 无隶属关系。
