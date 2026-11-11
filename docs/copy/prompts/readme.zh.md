Write the public `README.zh-CN.md` for the open-source repository `dsh-remedy`.

This is a faithful Chinese version of the English README, not a separate pitch.
Same structure, same numbers, same limits. Natural engineering Chinese; do not
translate word-for-word when it makes the sentence stiff.

Voice: 冷静、具体、工程化。不要口号，不要感叹号，不要“革命性”“极致性能”。

Required structure (use these exact H2 headings, in this order):

```
# dsh-remedy

<badge row>

<一段话：它是什么，为什么不一样>

## 它修什么
## 安装
## 工作方式
## 安全保证
## 它不做什么
## 自己验证
## 状态
## 开发
## 贡献
## 安全
## 许可证
```

Rules:

- Keep every number identical to FACTS. Do not add a percentage or a benchmark.
- Badges are the same as the English README; link the intended repository URL.
- "安装" must give `dsh plugin --profile <name> add dsh-remedy` first,
  then `pnpm add dsh-remedy dsh-remedy-core`（不要写死版本号，npm 会解析已发布的
  latest）；并用一句短注说明
  plugin 的 0.3.0 在 registry 里装不上（npm 直接发布了原始 workspace manifest，
  依赖写成字面 `workspace:*`），其后的发布用 pnpm 打出的 tarball 修掉这个 manifest；
  0.3.1 用了同样的 manifest 修法，但在上市前就被取代，从未到达 registry。
  keep the source workflow for contributors.
- "它修什么": the failure signature in a fenced block, the measured sample from
  FACTS (78 个会话文件 / 375 次 attempt / 38 次粘连 / 44 次 `MALFORMED_RESPONSE`，
  其中 39 条可修 / 0 行不可读)，并给出一次普查（287 个 turn 里 92 完成、88
  `max_tokens`、99 error、8 aborted）与六个 error code。旧的 77 文件样本与
  48 文件样本都不要再用。
- "工作方式": the chunk sequence and the all-or-nothing rule.
- "安全保证": one guarantee per line, covering P-0001、P-0002 与 P-0003：
  合成 call 一定带 `block-start` + `block-end` 而不是裸 `block-end`；撤回的修复把
  预算还给整条流；`max-tokens` 只记 truncated，不算未修复的粘连；透传的 provider
  错误计入 `errors`；纯拒绝只加 `refused` 不加 `fused`；预算拒绝同时加
  `unrepaired`，所以"拒了也没修"的流不会读成 `repaired`；消费者提前停止保留
  `fused` 与 `unrepaired` 并另加 `withdrawn`；四个 verdict 词一个没变，只有计数行
  从六个名字长到八个。再补 P-0005 的 reseal 保证：只有当恰好一段能把整段文本还原成
  一个 plain object 且 payload 字节一致时才给裸值加引号，call 保留自己的 id 与 name，
  reseal 不合成新 call、不占流级的 `maxCalls` 预算；0 个候选或 2 个以上候选一律拒绝
  而不是猜；只因 reseal 而修好的流读 `repaired` 绝不读 `quiet`；第九个计数器
  `resealed` 在类型里故意可选，旧版本录下的计数对象仍然渲染原来那一行。
  再补 P-0004 的保证：`scan` 用插件自己发布的同一个读取器读多帧 zstd 日志；目录扫描
  每个文件留一行可审计记录；`--since` 把丢弃的事件记成 `before_since` 而不是藏起来；
  一个解不开的文件是一条 failure 行与非零退出码，绝不是 0 报告；脱敏能匹配单反斜杠、
  双反斜杠与把 home 路径编码进目录名这三种形状。再补 P-0006 的保证：`scan` 统计
  每一个 `turn/end`（completed、`max_tokens`、aborted、error）并点名每个
  `reason.error.code`，而不是只报 `MALFORMED_RESPONSE`；census 只报告、绝不升级成
  finding，退出码仍只看 `fused_calls` 与 `fusion_failures`。
- "它不做什么": a table, one row per limit.
- "自己验证": commands plus the real artifact path.
- "状态": 从 FACTS 取发布状态：`0.3.5` 是两个包已发布的 `latest`，`0.3.4` 是上一个
  版本，就照 FACTS 这么写，不要把任何已发布版本说成待发布或已准备未发布；plugin 的 0.3.0 是坏发布。
  P-0001、P-0002 与 P-0003 都为 `verified`（P-0001 在
  headless profile 与桌面 App；P-0002 在 2026-11-10 的 headless 真机运行里修好了一次
  真实的两调用粘连，并看到合成 id 被真的派发执行；P-0003 在 2026-11-10 的另一次
  headless 运行里，代码拒绝修复一次预算超限的粘连，journal 里 `refused` 第一次非零）。
  P-0005、P-0004、P-0006、P-0007、P-0008 与 P-0009 是 `tested` 而不是 `verified`：都有单测、负对照，
  以及一条实测夹具或一次实测扫描，但还没有真机产生过 P-0005 修的裸值形状，P-0004 与
  P-0006 改的是离线读取器，P-0007 改的是构建侧的 copy 通道，三者都不动常驻接缝。
  加一小段
  包体积说明（已发布的 0.3.4 plugin 与 core 两个 tarball 的压缩/条目/解包/分量、上一个
  版本 0.3.3 的两个 tarball 字节、不再进包的
  sourcemap、`dist/*.js` 的字节预算历史，包括 P-0006 先冲到 70389 再落回 67908），
  数字只能来自 FACTS，不要给未发布的版本编 FACTS 没给的尺寸。
- Link back to `README.md` for English.
- End with MIT and "与 DeepSeek 无隶属关系".
- Keep the whole file under 220 lines.
