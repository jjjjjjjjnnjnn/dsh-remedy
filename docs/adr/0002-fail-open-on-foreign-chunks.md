# ADR 0002 — 对读不懂的 chunk 失败开放（fail open）

> 状态：**已实施**（R69，随 0.4.19 发布）。记录轮：R68 收口后、R69 开工前。
> 证据：`data/results/hostile-neighbours-2026-11-18T10-00-00.000Z.json`，
> 探针 `scripts/probe_hostile_neighbours.mjs`。两者都在 R68 的树上跑（0.4.18 的 dist，R66–R68 零运行时字节）。

## 背景

`llm/stream` 是 Cordis waterfall：外层优先，任何一个 listener 不调用 `next()` 就否决整条链
（规则见 `docs/compatibility.md`）。remedy 是其中一层，而**用户装哪些插件不由我们决定**。

R68 的接缝盘点回答的是“谁在同一条链上”；这一份回答的是“如果邻居递给我们的东西不是我们预期的形状，会怎样”。

## 实测（R68 树，七个场景）

| 邻居给的东西 | 今天的结果 | 判定 |
|---|---|---|
| `null` chunk | `TypeError: Cannot read properties of null (reading 'type')`，turn 死 | **remedy 制造了自己的错误** |
| `block-end` 的 `arguments` 是对象 | `TypeError: text.trim is not a function` | 同上 |
| `block-end` 没有 `block` | `TypeError: Cannot read properties of undefined (reading 'type')` | 同上 |
| 自定义 chunk 类型 | 原样放行 | 安全 |
| 上游抛 `TRANSPORT` | 原样 rethrow | 正确 |
| `finish` 出现两次 | 第一个之后停止，输出正常 | 安全 |
| profile 已拥有 `remedy_unattributed` | 修复后的片段**以该名派发** | 命名空间风险 |

前三条的机制：主循环 `const chunk = raw as StreamChunk; switch (chunk.type)` 没有判空/判类型；
`block-end` 直接读 `chunk.block.type` 与 `chunk.block.arguments.trim()`；外层 `catch` 只判断
“这是不是可修的粘连”，不是 → 记账后 **rethrow**。于是任何形状错误都以 remedy 的异常身份抵达宿主。

这与 `PROJECT_RULES.md` §1 并不冲突：那条规则说的是**不把 provider 的失败改写成成功**，
它不要求把邻居的问题改写成自己的异常。两件事混在了同一条 catch 里。

## 决定

**remedy 对一条流只允许三种结局：原样放行、修复已证实的粘连、原样抛回原来的失败。它不制造第四种。**

具体两处（R69 实施，各一条补丁记录）：

1. **P-0053 fail open**：读到无法理解的 chunk 时，先 `flushPending()`（不丢掉已持有的尾），
   把该 chunk **原样放行**，并让这条流此后只放行、不再尝试修复；不把它记成 `errors`——
   错误不是我们造的。可理解的形状不变，修复判据不变。
2. **P-0054 保留名不兜底**：如果 `options.tools` 已经声明了 `remedy_unattributed`，
   `planRescue` 不使用这个兜底名，**整次救援放弃**，按 provider 的原样失败抛回；
   宁可失败，也不把片段派发到用户的同名工具上。

两处都只收窄“我们自己的行为”，不改变对已证实粘连的修复，也不改变“修不了就抛”。

## 为什么不选别的

- **catch 住再抛一个“原错误”**：形状错误根本没有原错误，编一个仍然是 remedy 在毁一轮；
  而且会把一个本来能继续的流变成失败。
- **静默关掉自己**：违反 `unmeasured ≠ quiet`；用户会得到“插件装了但没跑”且没有任何信号。
- **挂载时探测监听器/形状**：cordis 不暴露 listener 列表给插件，且形状只有运行时才知道。
- **替用户判断该装哪个插件**：那是 `dsh-triage` 的产品线（装得上），不是本接缝的活。

## 代价与付款

- 运行时字节：估计 250–400 B（plugin）。当前 total 余量只有 **141 B**，
  所以按老办法付款：压缩 `repair-stream.ts` / `answer.ts` 里长注释（长文已在 `docs/patches/`），
  **不抬 cap**（P-0032 的先例）。
- 运行时改动意味着**0.4.19**：两包发布、冷装、两个 profile、桌面真机 turn、Linux 同树同数。

## 这份决定不解决什么

- **顺序与否决**：邻居 `prepend` 插队、或者不调 `next()`，remedy 会静默不在链上；
  这仍然只由 `scan_plugin_seams.mjs` 与 `unmeasured` 检测路径回答。
- **邻居替换流**：一个外层 listener 返回自己的流而不调用 `next()`，remedy 看到的不是 adapter 的字节；
  fail open 只保证“我们不添乱”，不保证“我们还能修”。
- **动态注册**：扫描器读静态注册，运行时才知道的注册看不见。
- **macOS 硬件**：仍只有 CI job，没有真机。


## 实施结果（R69，0.4.19）

- 执行的是本文的两处，**外加读代码时找到的第三处**：ADR 只写了 `planRescue`，但
  `repair-stream.ts` 的 `missing-id` / `missing-name` 分支也直接写 `UNATTRIBUTED_NAME`。
  两处都改之后，profile 拥有该名字时，fused 救援放弃、无名字的 `block-end` 保留原字节。
- 探针从七行扩到九行：多了 `finish` 没有 `reason` 与「无名字 + 保留名」两个场景。
  修前产物 `data/results/hostile-neighbours-2026-11-18T10-00-00.000Z.json`，
  修后 `data/results/hostile-neighbours-2026-11-18T11-30-00.000Z.json`；修后没有一行是
  remedy 自己的异常。
- 契约没有变宽：读不懂的 chunk 不记 `errors`；之后可读的 `finish{error}` 仍记一次（P-0034）。
- 代价比估计高：代码净增约 2.2 KB，而不是 250–400 B。付款是压注释，plugin 从 82 859 降到
  81 589，core 103 560，registry 67 824（余量 176 B）。cap 一个没动。
- 仍未做：`verified` 需要一次带邻居插件的真实 turn；本轮两条都是 `tested`。
