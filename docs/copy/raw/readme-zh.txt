# dsh-remedy

[![CI](https://github.com/jjjjjjjjnnjnn/dsh-remedy/actions/workflows/ci.yml/badge.svg)](https://github.com/jjjjjjjjnnjnn/dsh-remedy/actions)
[![npm version](https://img.shields.io/npm/v/dsh-remedy.svg)](https://www.npmjs.com/package/dsh-remedy)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Node](https://img.shields.io/badge/node-%3E%3D22.19-brightgreen.svg)](https://nodejs.org)
[![Status](https://img.shields.io/badge/status-verified-blue.svg)](#status)

[English](README.md)

dsh-remedy 是 DeepSeek Harness（DSH）的**补丁集**：五十一个缺陷，每一个都登记了它挂的接缝、它消掉的症状、实测到的机制，以及它不越过的边界。其中三个接缝是常驻的（`llm/stream`、`agent/request-error`，以及准备阶段被拒时真正抵达的 `agent/error`），其余在 CLI、构建侧，还有一个**测过但故意没挂**的接缝。

## 它修什么

当上游中继把两个工具调用塞进同一个索引时，`@earendil-works/pi-ai` 收到 `{...}{...}` 并抛错，`dsh-llm-pi-ai` 转成 `LlmError(..., 'MALFORMED_RESPONSE')`，而 `dsh-agent-loop` 因为该码不在 `retryableCodes` 里终止整轮。上游讨论 deepseek-ai/deepseek-harness #4427 记录的是同一类故障。

```text
Tool call "<name>": Unexpected non-whitespace character after JSON at position N
Received arguments: {...}{...}
```

本机会话目录实测：78 个会话文件、393 次 attempt、38 次粘连、44 次 `MALFORMED_RESPONSE`，其中 39 条可修，0 行不可读。

同一目录的 turn 普查是 293 个 turn：94 完成、88 `max_tokens`、100 error、11 aborted。被点名的 error code 是 `MALFORMED_RESPONSE` 44、`UNSUPPORTED_REASONING_EFFORT` 37、`SERVER` 16、`UNKNOWN` 1、`MISSING_CREDENTIAL` 1、`INVALID_REQUEST` 1。

这两类要分开处理，现在都可见了：

- `MALFORMED_RESPONSE` 是粘连，能证明切分就修；
- `UNSUPPORTED_REASONING_EFFORT` 是确定性拒绝：profile 请求了一个适配器不提供的档位（`provider "opendesign" model "deepseek-v4.1-flash-eco" does not support reasoning effort "xhigh"`）。重试它只会花掉一次请求再得到同样的答案，所以插件命名一次，然后不碰它。

## 补丁按接缝分类

注册表是唯一来源：`packages/core/src/registry.ts` 是断言本身，`dsh-remedy status` 打印它，`dsh-remedy explain` 回答「本机命中的这类故障由谁覆盖」。

| 接缝 | 补丁 | 各自解决什么 |
|---|---|---|
| `llm/stream`（常驻）| P-0001、P-0002、P-0003、P-0005、P-0027、P-0030、P-0033、P-0034、P-0036、P-0037 | 拆开已证实的粘连；救援必须可证、可归因、原子；拒绝必须可观测；裸值要么补引号要么拒绝；片段不许用没证出来的名字派发；证明按宿主真正发来的 schema；空身份的调用不许带空 id 进日志；失败的流不许被记成安静的一轮；纯 delta 的调用保留流里已经证过的 id；少一个闭合符的单个对象只在证明唯一时才补回 |
| `agent/request-error`（常驻）| P-0011 | 谁拥有决定的契约 + 有界重试预算 |
| `agent/error`（常驻）| P-0013、P-0045 | 确定性拒绝只命名、不重试；在准备阶段被拒的调用抵达的是这个接缝，而不是 `agent/request-error` |
| CLI | P-0004、P-0006、P-0009、P-0010、P-0016、P-0025、P-0041、P-0044、P-0047、P-0050、P-0051 | 扫描保真与脱敏形状；turn 普查；会话头记录按 `createdAt` 计时；用法文本必须与二进制一致；覆盖由补丁自己声明；没读到的 profile 不算发现；安装后的 `bin` 在 POSIX 上必须真的跑起来 |
| 构建侧 | P-0007、P-0008、P-0012、P-0014、P-0017、P-0018、P-0019、P-0020、P-0021、P-0022、P-0023、P-0024、P-0026、P-0028、P-0029、P-0031、P-0032、P-0035、P-0038、P-0039、P-0040、P-0043、P-0046、P-0048、P-0049 | copy 通道能按原因失败；字节预算有脚本检查；一个加载路径一个上限；项目自己的描述必须是真的；两个 npm 页面；Windows 退出码不是 registry 的答案；对外页面曾描述一个已经不存在的项目；一条"钉 git 字节却挂 registry 版本号"的市场条目；一个指向从未存在的模块的导出；一个自己把漂移修掉的漂移测试；一条没有门禁读的文档规则；两个包内页面终于进了 copy 通道；发布流程曾有两个家；随包样例曾带着本机路径；继任者读的活指针；引擎终于有预算；台账不再重复补丁文档；一条挂到已删除子路径导出的 patch 层 row；一条看不见它要保护的夹具的守卫；一页少一个补丁、落后一个发布的首页；把 macOS 那句话变成一个 CI job；事实包把它早已不再描述的那套补丁数了一遍 |
| 测过但没挂 | P-0015 | 被拒的 `agent/pre-step` 到底做什么，好让后来的补丁在实测过的基础上使用这个接缝 |

九个补丁是 `verified`：真机跑过并留下 `data/results/live-*` 产物。其余四十二个是 `tested`：单测、负对照，以及一条实测夹具 / 扫描 / 语料，但没有常驻 journal 能见证的东西。下面的「状态」逐条点名。

## 安装

装进 DSH profile：

```bash
dsh plugin --profile <name> add dsh-remedy
```

作为项目依赖：

```bash
pnpm add dsh-remedy dsh-remedy-core
```

plugin 的 0.3.0 在 registry 上装不上：npm 直接发布了原始 workspace manifest，依赖写成字面 `workspace:*`。它之后的每个发布都改用 pnpm 打出的 tarball。0.3.1 带着同样的 manifest 修复，但在到达 registry 之前就被取代了。

面向贡献者的源码工作流：

```bash
git clone https://github.com/jjjjjjjjnnjnn/dsh-remedy.git
cd dsh-remedy
pnpm install
pnpm run verify
```

## 工作方式

dsh-remedy 在 `llm/stream` 接缝上缓冲传入的工具调用 delta：

```text
输入 chunk：
  block-start { id: "call_01", name: "ops_bash" }
  tool-call-delta '{"command":"ls"}{"command":"pwd"}'
  finish { kind: 'error', error: LlmError('MALFORMED_RESPONSE') }

修复后的输出：
  block-start { id: "call_01", name: "ops_bash" }
  block-end   { arguments: '{"command":"ls"}' }
  block-start { id: "call_01#remedy-1", name: "ops_bash" }
  block-end   { arguments: '{"command":"pwd"}' }
  finish      { kind: 'stop' }
```

修复是全有或全无：每个打开的缓冲都必须能解析成顶层 JSON 对象。全部证明成立时，每个调用各自获得 `block-start` 与 `block-end`，error finish 变成 `{kind:'stop'}`；任何一个证不出来，就什么都不发，原始失败原样抛出。

第二个 listener 挂在 `agent/request-error` 上（loop 在一次尝试失败后调用它）：

```text
没有 code、code 为空、signal 已中止      → next()
UNSUPPORTED_REASONING_EFFORT、           → 每 (step, code) 命名一次，然后 next()
INVALID_REQUEST、MISSING_CREDENTIAL、
EMPTY_RESPONSE
IMAGE_OFFLOAD_REQUIRED、INVALID_CREDENTIAL → next()
MALFORMED_RESPONSE 且预算还有余额          → { kind: 'retry' }
其它，或预算用尽                            → next()
```

这个顺序来自运行时自己写下的契约：handler 返回 `{ kind: 'retry' }` 时**不调用** `next()`；不拥有决定的 listener 必须 `return next()`。先调用 `next()` 再覆盖它的答案会丢掉默认链的决定——上下文压缩恰好在那个位置授权它自己的重试。

重试默认关闭（`retryOnMalformed: 0`）。预算是一个有界缓存，每个进程 256 条，远多于一轮所需，又小到长驻会话也长不大。

## 问它现在在发生什么

`dsh-remedy explain` 读注册表、可选的 profile 层和可选的会话目录，按故障类逐行输出：本机命中多少次、哪个补丁覆盖它、在你指定的 profile 里这个补丁是否启用。

```bash
dsh-remedy explain --sessions ~/.dsh/sessions --profile-file ~/.dsh/profiles/<name>/cordis.patch.yml
```

```text
failure class                turns  covered by          enabled here
---------------------------  -----  -------------------  -------------------
completed                      124  (none)               (none)
max-tokens                      88  by design            no (by design)
MALFORMED_RESPONSE              47  P-0001…P-0005,P-0011 P-0001…P-0005
UNSUPPORTED_REASONING_EFFORT    37  P-0013               P-0013
SERVER                          16  by design            no (by design)
MISSING_CREDENTIAL               1  P-0013               P-0013
```

不给 `--sessions` 时它不输出计数，而不是输出一行零；不给 `--profile-file` 时它说答案未知，而不是假定默认值。某类故障本机命中、有补丁覆盖、但你的 profile 关掉了它，命令以退出码 1 结束。

## 安全保证

- 顶层 JSON 对象只在深度零处切分；字符串里的 `}{` 不是边界。
- 首个拆分调用保留原 id；合成调用得到 `<id>#remedy-N`。
- 任何一个缓冲证不出来，就什么都不发，原始失败原样抛出。
- 单个解析不成立的对象直接拒绝，不拆。
- 插件只挂自己那几行，不加 route、不加 tool、不加 UI。
- 除非配置了 `journalPath`，插件不写盘。
- `retryOnMalformed` 默认 0，因为重试只是兜底，不是修复。
- 空工具名被拒绝（`missing-name`），绝不派发。
- 同一索引内工具名变化会中止救援（`name-changed`）并原样抛出。
- 修复后的 finish 保留适配器的 `replayState`。
- `block-end` 的修复会被挂起到工具调用阶段结束；同一流里后续任一拒绝都会撤回它（`rolled-back`），原始 chunk 照常发出。
- `maxCalls` 约束的是整条流合成的调用数，不是单个 block。
- 消费者提前停止记为 `consumer-abort`，绝不记成 quiet。
- 合成调用一定以 `block-start` + `block-end` 发出，绝不发裸的 `block-end`。
- 被撤回的修复把调用额度还给流级 `maxCalls`。
- `max-tokens` 的流记为截断，绝不记成未修复的粘连。
- 原样透传的 provider 错误记进 `errors`。
- 纯拒绝只抬高 `refused`，绝不抬高 `fused`。
- 预算拒绝（`too-many-calls`）同时抬高 `fused`、`refused`、`unrepaired`，因为确实没有发生修复。
- 四个 verdict 词没有改动（`unmeasured`、`quiet`、`degraded`、`repaired`），评估顺序不变；只有计数行变长，到八个名字加可选的 `resealed`。
- 裸值只有在「恰好一段能把整段文本还原成一个普通对象、且载荷逐字节一致」时才加引号。
- 0 个候选拒绝为 `bare-value-unproven`；2 个或更多拒绝为 `ambiguous-bare-value`，绝不猜。
- 只有 reseal 一种缺陷的流读作 `repaired`，绝不读作 `quiet`。
- 重试 listener 对同一 `(step, code)` 只命名一次，所以宿主层面的一次重试不会把同一句话灌满 journal。
- 取消永不被重试覆盖。
- 控制码（`IMAGE_OFFLOAD_REQUIRED`、`INVALID_CREDENTIAL`、`MISSING_CREDENTIAL`）原样透传，绝不重试。
- `scan` 用插件自己发的 `decompressSessionLog` 读多帧 zstd 日志。
- 目录扫描每个文件一行可审计记录。
- `--since` 把丢掉的事件记成 `before_since`，不隐藏。
- 解不开的文件是一条 failure 行与退出码 3，绝不静默记零。
- 脱敏覆盖单反斜杠、双反斜杠以及会话目录把同一路径编码后的形状。
- 扫描统计每一种 `turn/end`（completed、`max_tokens`、aborted、error），并点名每一个 `reason.error.code`。
- 普查只报告，绝不升级成 finding：退出码仍只看 `fused_calls` 与 `fusion_failures`。
- 字节预算是一道门，不是一段散文：它分别量「挂载插件要加载的模块」（residency）、「只有命令才加载的模块」和总量，并要求每个发出的模块必须只属于前两者之一。

## 它不做什么

| 边界 | 事实 |
|---|---|
| 归因 | 停在对齐后的文本：插件无法证明是 relay 还是适配器把对象粘起来的。 |
| 截断 | `max-tokens` 截断缺的是字节，不修。 |
| 本地化消息 | 回退解析英文 `Received arguments:`；宿主消息一旦本地化，这条回退失效，但 delta 缓冲路径仍然有效。 |
| headless 会话文件 | headless profile 不持久化 `assistant/attempt`，所以产物里 fused calls 是 0；证据靠 journal 计数与合成 id。 |
| 合成 id | `<id>#remedy-N` 是追踪辅助，不是持久身份。 |
| 桌面完成度 | 桌面产物记 `turn_end=aborted`，因为答案是操作者手动停止的。 |
| App 缓存 | 验证针对记录下来的 tarball sha256，不针对运行中的 App 缓存了什么。 |
| verdict 粒度 | 一个 verdict 词无法表达「看见了并正确拒绝」，只有计数行能。 |
| journal 迁移 | 旧 journal 行不迁移；混合 journal 里 `status --json` 报告最后一行是什么形状。 |
| 自定义索引记账 | 自己关 block、自己维护索引的适配器仍未实测（`BS-11`）。 |
| 请求重试 | 默认关闭。`SERVER`、`TRANSPORT`、`TIMEOUT` 上游已在重试，所以本插件只重试 `MALFORMED_RESPONSE`，而且只在你给的预算内。 |
| reasoning effort | 插件能告诉你某个配置会被拒绝，但绝不为你去改它。`agent/pre-step` **没有挂**，而现在这是一个实测过的决定：P-0015 记录了拒绝会做什么——轮次以 `blocked` 结束、不开 step、被 claim 的输入被丢掉、CLI 退出码 `1`——所以后来的补丁可以用这个接缝，但必须用 `{kind:'enter'}` 改写消息而不是拒绝。桌面 UI 对 `blocked` 的渲染仍未测（`BS-17`）。 |
| 中途撤回 | 本机实测不可达：没有任何持久化的 attempt 流在 `block-end` 里带可证明的融合，而这正是 `rolled-back` 需要的（`BS-14`）。 |

## 自己验证

```bash
dsh-remedy verify
dsh-remedy scan ~/.dsh/sessions --json
dsh-remedy explain --sessions ~/.dsh/sessions
pnpm run verify
node scripts/gate.mjs --mutate
```

`data/results/` 里每份产物都由脚本产出并带 `.sha256`。建议先看两份：真机运行 `data/results/live-2026-11-12T12-20-00.000Z.json` 与语料回放 `data/results/malformed-replay-2026-11-12T11-30-00.000Z.json`。

本机全部 `MALFORMED_RESPONSE` 语料都回放过构建后的引擎：47 个 turn，39 修、8 拒，没有一条修好的调用其参数无法解析。另有一轮 300000 例的生成式压力测试用固定 seed 断言同一条不变量。

## 状态

九个补丁在真机上 `verified`：P-0001 在 headless profile 与桌面 App 上；P-0002 是 2026-11-10 的 headless 运行修好了一次真实两调用粘连并看到合成调用被派发；P-0003 是 2026-11-10 的 headless 运行里 journal 写出非零 `refused`（代码拒绝了修一次预算超限的粘连）；P-0033 在隔离 harness 上，本地 endpoint 重放上游 discussion #13211 的不完整 tool call——没有插件时 turn 死在 V4 准入，有插件时调用带着可追踪 id，同一会话还能续跑第二轮；P-0037 与 P-0041 是在 Linux（WSL2 Ubuntu 26.04）上验的——上游 discussion #12819 那种少一个闭合符的调用在真实宿主进程里被修好并派发，而安装后的 `bin`（在那边是符号链接）打出结果，不再什么都不打印却退出 0。P-0011、P-0013 与 P-0045 在一份 R56 探针里一起被验：本地 OpenAI 兼容端点只把 #12819 形状答一次，活 journal 里能看到两次主步骤请求、一次 `retry`、`completed` 的 turn 与退出 0，而没装插件的对照只有一次请求、退出 1；同一份产物里，被已发布字节留成空 journal 的 `xhigh` profile，现在在宿主真正用的接缝上写出恰好一条 `diagnosis`。

其余四十二个是 `tested`，不是 `verified`。每个都有单测、负对照，以及一条实测产物（有的话）：P-0004、P-0006、P-0009 与 P-0044 改的是离线读取器；P-0005 还没有真机产生过它修的裸值形状；P-0007、P-0008、P-0012、P-0014、P-0017、P-0018、P-0019、P-0020、P-0021、P-0022、P-0023、P-0024、P-0026、P-0028、P-0029、P-0031、P-0035、P-0038、P-0039 与 P-0040 是构建侧或语料；P-0010、P-0016 与 P-0025 改的是命令打印的文本；P-0015 是隔离 profile 上的一次实测，不是挂载；P-0027、P-0030、P-0034 与 P-0036 收窄了修复片段被派发时用的名字、失败流被记成什么，以及纯 delta 的调用还剩下什么身份，有单测和实测夹具，但没有自己的真机运行；P-0032 只搬了散文；P-0042 是 CLI 读者，指名接缝修不了的配置冲突；P-0044 数的是普查从没问过的那一半；P-0043 放宽随包样例的守卫并把夹具换成 `<home>`；P-0046 让首页点名它数到的每一个补丁；P-0047 把同一个问题问给 `completed` 的 turn；P-0048 把 macOS 那句话变成一个 CI 判据；P-0049 让事实包按注册表数它自己描述的补丁，并补回缺失的 CHANGELOG 小节；P-0050 数的是「resume 之后这个会话已经用过的工具不再被声明」那种形状；P-0051 让同一条计数在 `explain` 里变成一行 finding——不需要 profile，因为丢掉的工具属于会话而不是 profile。
发布状态：`0.4.17` 已发布，是两个包的 registry `latest`，带五十一个补丁，并在 **DSH 0.2.2-rc.3** 上（Windows 与 Linux）实测；这一页描述的就是已发布的这一版。空目录从 registry 单装 0.4.17 后 `dsh-remedy verify` 回 `OK 8 fixture(s)`。0.4.16 带四十六个补丁，发布的是 P-0045 与 P-0046。上一个发布是 `0.4.16`（四十六个补丁），再上一个是 `0.4.15`（四十四个补丁）、`0.4.14`（四十三个补丁）、`0.4.13`（四十二个补丁）、`0.4.11`（三十九个补丁）、`0.4.10`（三十六个）、`0.4.9`（三十五个）、`0.4.8`（三十三个）、`0.4.7`（三十一个）、`0.4.6`（三十个）、`0.4.5`（二十八个）、`0.4.4`（二十七个）、`0.4.3`（二十六个）、`0.4.2`（二十六个）、`0.4.1`（二十三个）。

包体积：

- 0.4.17 plugin：38348 字节压缩，38 个文件，125076 字节解包，shasum `5a8c1f95b6a3c6f059a33eaf0ef9770fc62efad7`。
- 0.4.17 core：41316 字节压缩，29 个文件，133257 字节解包，shasum `e5b2e00f4bcc53aedfb9fea6bd7c129bf0ba5454`。
- 0.4.16 plugin：38654 字节压缩，38 个文件，125107 字节解包，shasum `623c4cc7d380931e91826948f194ab3b0ac43d84`。
- 0.4.16 core：40979 字节压缩，27 个文件，133933 字节解包，shasum `43bde005968b4fa97131770d1fdef70aab188433`。
- 0.4.15 plugin：38600 字节压缩，38 个文件，124248 字节解包，shasum `cd717926bd9ecec01326d8bd1c055290341f665b`。
- 0.4.15 core：40675 字节压缩，27 个文件，134256 字节解包，shasum `c6577a61dd3af4df57bf234d5e6d9bb4dd2c2b84`。
- 0.4.14 plugin：38804 字节压缩，38 个文件，124177 字节解包，shasum `80fc4414a9997a467fffe2f51fdb7d771bff1bcd`。
- 0.4.14 core：39878 字节压缩，25 个文件，131758 字节解包，shasum `b2474efb54c1a9c9719422238e264656d16c35e7`。
- 0.4.13 plugin：38762 字节压缩，38 个文件，124050 字节解包，shasum `02d0747ac766408c0525bfcfb09df4581039af9d`。
- 0.4.13 core：39968 字节压缩，25 个文件，131617 字节解包，shasum `b825fe0b8b523411a17714abf41cc916c14e6273`。
- 0.4.12 plugin：39694 字节压缩，38 个文件，126181 字节解包，shasum `b9122c89b04a4c18a92b0404dfe939af3ba8f54e`。
- 0.4.12 core：40118 字节压缩，25 个文件，131670 字节解包，shasum `d58321d7ad1087b2937fad53f3f91231c7948fc8`。
- 0.4.11 plugin：39631 字节压缩，38 个文件，126185 字节解包，shasum `884693a5584eb2d8b39902b56296bb34ea1f130c`。
- 0.4.11 core：40354 字节压缩，25 个文件，131692 字节解包，shasum `2a528bb1c232fa287d3ea78cbb1babbcb57ac14b`。
- 0.4.10 plugin：39183 字节压缩，36 个文件，124916 字节解包，shasum `dcc33f65e7e0401800348c7f992830879f290ed7`。
- 0.4.10 core：40494 字节压缩，23 个文件，130919 字节解包，shasum `75b4744e4681ad1e752308671889312a5006c20e`。
- 0.4.9 plugin：39335 字节压缩，36 个文件，125349 字节解包，shasum `24eaaaf51169adbfcb7d59add2340993dcc4a6ee`。
- 0.4.9 core：40534 字节压缩，23 个文件，130634 字节解包，shasum `f2b5593d588d9a06d31afa9e13c3d143c858b470`。
- 0.4.8 plugin：39378 字节压缩，36 个文件，125434 字节解包，shasum `6f42b4423117c7f3fc79f5458b18f3c35e2004ad`。
- 0.4.8 core：39869 字节压缩，23 个文件，128145 字节解包，shasum `2567629d4c28766622d546d2a22519029611fde7`。
- 0.4.7 plugin：39878 字节压缩，36 个文件，126519 字节解包，shasum `6c1a19a8890d73916b0732983aa5d72096ee8bb9`。
- 0.4.7 core：40504 字节压缩，23 个文件，129511 字节解包，shasum `68931b34abaad1c40cc3e635584784585c6b951d`。
- 0.4.6 plugin：39877 字节压缩，36 个文件，126519 字节解包，shasum `1cd6d75a93620192be920ac5e76ba7353fef971c`。
- 0.4.6 core：39973 字节压缩，23 个文件，127568 字节解包，shasum `f18fb209e2d9aaf26a492424bf6019a0d7f88eb9`。
- 0.4.1 plugin：36906 字节压缩，35 个文件，119744 字节解包，shasum `dac640ea140aadf9249685ebcc98964db8a3adbf`。
- 0.4.1 core：33091 字节压缩，21 个文件，105353 字节解包，shasum `c9a081bf4e5f8c7ae82973e2a56d0bd93244e727`。
- 0.4.0 plugin：36928 字节压缩，35 个文件，119866 字节解包，shasum `dd3b764dd57d09d4cf85e312867da23360a4e06f`。
- 0.4.0 core：31773 字节压缩，21 个文件，100304 字节解包，shasum `48d449b75bb7fa06f4bc16181433e617d2ca5a66`。
- 0.3.8 plugin：35898 字节压缩，35 个文件，117750 字节解包，shasum `3bc47df12f21fe7d68336f595d397ff868b3d4d7`；core：26551 字节压缩，21 个文件，83461 字节解包，shasum `0df993f85589e101b15b830fa105e7ef8c66c5d5`。
- 不再发 sourcemap；去掉它省下 41926 字节解包体积。

发出插件的预算是三项检查：residency 40902 of 44000 字节（挂载插件要加载的模块）、cli 41560 of 42000 字节（只有命令才加载的模块）、总量 82462 of 83000 字节。单文件上限：`repair-stream.js` 28000、`session-scan.js` 14000、`cli.js` 12000。越线的补丁要拆那个文件，而不是把它吸收。 这三项是在这棵树上量的；已发布的 0.4.16 tarball 里是造它的那棵树的 82864 字节，所以核对已发布包的人会看到那个数，而这一页说清它描述的是哪棵树。引擎有自己的两项，按同一棵树量：core 103663 / 104000 字节，`registry.js` 64911 / 68000。

## 开发

```bash
pnpm install
pnpm run verify
pnpm run gate
node scripts/gate.mjs --mutate
```

每次改动跑六道门：`ssot`、`registry`、`namespace`、`step-review`、`copy`、`size`。`--mutate` 会故意破坏每一道并要求它变红，现在 6 抓 6。测试是 399 条，0 失败（Windows 与 Linux（WSL2 Ubuntu 26.04）同值）。

## 贡献

- 欢迎 issue 与 pull request。
- 行为变更必须先写一个会失败的测试。
- `pnpm run verify` 必须通过，`node scripts/gate.mjs --mutate` 必须抓到每一道门。
- 门只用 Node 内置模块；新门必须登记在 `audit/gate_ledger.json`。
- `dsh-remedy-core` 不引入任何运行时依赖。
- 没有 `data/results/live-*` 产物的补丁不能声明 `verified`。
- 对外文字是被校验出来的，不是随便写的：其中每一个数字都必须出现在 `docs/copy/facts/public-repo-facts.md`，字节必须与 `docs/copy/manifest.json` 一致。细节见 `CONTRIBUTING.md`。

## 安全

安全报告请用公开仓库的 GitHub 私密漏洞报告渠道：https://github.com/jjjjjjjjnnjnn/dsh-remedy/security/policy

## 许可证

MIT。独立项目，与 DeepSeek 无隶属关系。
