# dsh-remedy（插件）

DeepSeek Harness 的处置层。挂在 `llm/stream` 与 `agent/request-error` 两个接缝上：
**把粘连的工具调用拆开；证不出来的原样抛回；没东西可修时一个字都不说。**

**别让一次粘连吃掉整个 turn。** 模型偶尔会把两个工具调用粘成一段 JSON，适配器解析失败，
整个 turn 就死了。这个插件在流接缝上把它拆成两个可执行的调用；拆不动的（被截断的、
只有一个对象的、证据不足的）保持原始错误，绝不把失败包装成成功。

## 安装

```sh
dsh plugin --profile web add dsh-remedy
```

装上它就会一起装上引擎 `dsh-remedy-core`（插件钉的是精确版本，一次安装解析两包）。

## 配置

| 键 | 默认 | 含义 |
|---|---|---|
| `repair` | `true` | 包装 `llm/stream` |
| `retryOnMalformed` | `0` | 每个 step 在 `MALFORMED_RESPONSE` 后的重试次数；这是权宜，不是修复 |
| `maxCalls` | `8` | 一段粘连最多拆成几个调用 |
| `journalPath` | 未设 | 把脱敏后的修复事件追加成 JSONL；不设则不写盘 |
| `log` | `true` | 挂载时打一行日志 |

## 命令

```
dsh-remedy status  [--json] [--journal <file>]
dsh-remedy repair  [<file>] [--name <tool>] [--id <call-id>] [--max-calls <n>] [--truncated] [--json]
dsh-remedy scan    <session.jsonl|directory> [--since <iso>] [--max-files <n>] [--json] [--out <file>]
dsh-remedy explain [--sessions <dir>] [--profile-file <cordis.patch.yml>]
dsh-remedy verify  [--json]
```

`scan` 读一份普通 `.jsonl`、一个多帧 `session.v4.jsonl.zstd`、或整个目录；`--since` 丢掉更早的事件
并报告丢了多少，`--max-files` 限制遍历。它还会打印每种 turn 结束方式与每个错误码。
`explain` 按失败类回答：本机命中多少次、哪个补丁覆盖它、以及它在你指定的 profile 里是否启用；
**没给 `--profile-file` 时那一列写 `unknown`、退出码是 0**——没测过的 profile 不算发现。
`repair` 不给文件就读 stdin，给 `.json` 夹具则读它的 `arguments` 字段。

退出码：`0` 正常 · `1` 有发现 · `2` 用法 · `3` 读不了这个输入。

`scan --out` 写报告与 `.sha256` 旁车。报告发现粘连时退出 `1`——文件合法，但死的 turn 就是发现。

## 这个包装器会发出什么

证明是粘连时，它把终态错误换成：

```
block-end(index=0, id=<原始>)
block-end(index=<下一个>, id=<原始>#remedy-1)
...
finish{kind:'stop'}
```

如果一段粘连的两半属于**不同工具**，流里只有一个工具名，第二个片段无法被证明：它会以
`remedy_unattributed` 发出，运行时回 `UNKNOWN_TOOL` 并继续，而不会拿别的工具名去执行。

其余一切原样通过。
