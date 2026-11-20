# Compatibility — 谁和 remedy 在同一条接缝上

> R68。这份文件回答两个问题：**装了别的插件之后，remedy 还在不在链上**；以及**它每个 chunk 要花多少时间**。
> 两个答案都不是断言：拓扑由 `scripts/scan_plugin_seams.mjs` 扫出来
> （`data/results/seam-inventory-2026-11-18T08-10-00.000Z.json`），开销由
> `scripts/bench_repair_overhead.mjs` 量出来（`data/results/bench-repair-2026-11-18T08-20-00.000Z.json`）。
> 两条命令都能在本机重跑，数字过期时先重跑再引用。

## 1. 规则：waterfall 是「外层优先」，不调 `next()` 就否决

`llm/stream` 不是事件，是 waterfall：`@deepseek-ai/dsh-llm/lib/index.js` 里
`this.ctx.waterfall(this, "llm/stream", options, () => this.adapterStream(...))`。
链表语义写在 `@deepseek-ai/cordis/lib/index.js`：

> 「Listeners run **outermost-first**; a listener that does not call `next()` **vetoes the rest of the chain**,
> including the built-in behavior.」

注册侧同一文件：`register` 用 `prepend ? unshift : push`。于是有三条可推的结论：

1. **普通注册**：加载越早越靠外。桌面 profile 的 `dsh.profile.bundles` 顺序就是加载顺序。
2. **`prepend: true`**：每次 unshift 插到最前，所以**最后注册的 prepend 是最外层**。
3. **否决**：任何一个外层 listener 不调用 `next()`，它下面的（包括 remedy 和 adapter 本身）都不会跑。
   如果它返回自己的流而不是 `next()`，整轮看起来正常，**remedy 静默地不在链上**。

## 2. 本机拓扑（桌面 profile，2026-11-18 扫）

`dsh-remedy` 在 bundles 里第 16 位，`dsh-ops` 第 20 位；`dsh-session-title` 用
`{ global: true, prepend: true }` 注册，所以它在所有人外层。

| 接缝 | 从外到内 | 形态 | 结论 |
|---|---|---|---|
| `llm/stream` | **dsh-remedy → dsh-ops** | 两个都是 `on`（包装） | remedy 看原始 chunk 并修复；ops 只读不改，`yield* next()` 原样放行 |
| `agent/error` | **dsh-remedy → dsh-pet** | 都是观察者（不拦截） | 两边各收一份；pet 只推通知帧 |
| `agent/request-error` | dsh-remedy | 包装 | 独占 |
| `session/event` | billion-context → dsh-notify-me → dsh-ops → dsh-pet | 观察者 | 与 remedy 无关 |
| `system-prompt/assemble` / `tools/post-execute` / `settings/document-updated` / `session/disposed` | 见产物 | 混合 | 与 remedy 无关，但同一套顺序规则适用 |

宿主自带的两个 `llm/stream` listener（`dsh-session-title`、`dsh-session-checkpoint-policy`）都调用
`next()`，所以今天没有任何否决者。**这一条是扫描结果，不是保证**：装了新插件就重扫。

`billion-context`、`dsh-unlag`、`cc-safety-net`、`dsh-context` 都**不在** `llm/stream` 上；
`billion-context` 的源码里能搜到那个字符串，但那是压缩后长行里的文本，不是注册——分类器按
`on('…')` / `emit('…')` 的调用形状判定，不按子串。

## 3. 开销（同一台机器，中位数）

| 形状 | chunk 数 | 不挂插件 | 挂 remedy | 增量 |
|---|---|---|---|---|
| 纯文本一轮（4000 delta） | 4 003 | 见产物 | 见产物 | **+1.5 ms**（≈ 0.4 µs/chunk） |
| 工具密集（50 次调用 × 4 KB 参数） | 5 251 | 见产物 | 见产物 | **+5.9 ms**（≈ 1.1 µs/chunk） |
| 一次已证实的粘连修复 | 6 | 见产物 | 见产物 | **+0.12 ms** |

判别：真实 turn 是秒级，最坏 **+6 ms**。**没有可测的负优化**。绝对毫秒随机器变，比值才是主张；
产物里同时记了 node 版本与平台。

## 4. remedy 被跳过时，怎么发现

不是靠“感觉”：`record_live_mount.mjs` 在 `counters.streams === 0` 时判定 `unmeasured` 并 **`exit 4`**，
不会写一份“安静”的产物。`cli scan` 同样把没有 stream 的会话与有 stream 的会话分开数。
所以「装了新插件后 remedy 没跑」表现为**没有 stream**，而不是一条绿色的“未发现缺陷”。

## 5. 保留名

`remedy_unattributed` 是 P-0027 的兜底工具名（名字证不出来时用它派发，宿主回 `UNKNOWN_TOOL`）。
`dsh-remedy` 与 `dsh-remedy-core` 两个包都带着这个名字；扫描器把**第三方**对它的占用记为 warning。
今天没有第三方占用。

## 6. 与 `dsh-triage` 的分工（借口径，不搬代码）

| | `dsh-triage` | `dsh-remedy` |
|---|---|---|
| 问题 | **装得上吗**：entry id 撞车、service / tool / command / settings / slot 命名空间、升级日 | **跑得对吗**：流有没有被改、失败是不是被假装修好 |
| 时机 | 安装 / 升级前，隔离 `DSH_HOME` 里真装真启动 | 每一轮，`llm/stream` + 两个错误接缝 |
| 产物 | admission / namespace / boot 证据 | 修复事件、计数、`live-*` 产物 |

借来的只有**字段口径**：它 F3/F4 的分类（entry id / service / tool / command / settings / slot）
在这里变成 `conflicts[]` 的字段名，其中「slot」就是本文件的接缝名。**没有交叉引用产物**：
两边的 `data/results/` 各自为政，容器规则也要求一次只动一个项目。

## 7. 复跑

```powershell
node scripts/scan_plugin_seams.mjs --profile desktop --stamp <ISO>
node scripts/bench_repair_overhead.mjs --stamp <ISO>
dsh-remedy seams --profile desktop            # 已安装包版本，不需要仓库
```

第一条只读 `package.json` 与已构建的 JS，不加载插件、不启动 DSH、不写 profile，并落证据；
第三条是它的 shipped 版本（`packages/core/src/seams-{fs,}.ts` 里的同一套判据），
给不克隆仓库的人用：打印同一条接缝上的注册顺序，共用接缝时退出 1。
第二条在进程内挂一个最小 context，跑三组合成流。前两条都会先断言再写盘。

## 8. 这份文件不证明什么

- 它**读注册，不读行为**：一个 listener 会不会改 chunk、会不会否决，只有它自己的代码知道；
  扫描器只记录“谁在、什么顺序、有没有 `prepend`”。
- 它**只描述这一台机器的这个 profile**，不是兼容矩阵；`dsh-ops` 换一个版本、加一个 `prepend`，
  顺序就可能变，重扫才知道。
- **`cli`、`scripts`、`profile` 三个 surface 不是 waterfall**：`cli` 是离线读取器，`scripts` 是构建与门禁，
  `profile` 是只实测未挂载的接缝。它们没有“顺序”问题，只有“装没装”的问题。
- 它不替代真机 turn：拓扑与开销都只是**前置条件**，接缝是否真的跑过仍由 `data/results/live-*` 说话。


## 4. 邻居递来一个我们读不懂的 chunk（P-0053 / P-0054）

R68 量的是「谁在链上」；R69 量的是「邻居递给我们的东西不是我们预期的形状时会怎样」，并把结论写成运行时规则：

- 一条流只允许三种结局：原样放行、修复已证实的粘连、原样抛回 provider 的失败。remedy 不再产生
  第四种（自己的 `TypeError`）。读不懂的 chunk 会先 flush 已持有的尾，然后原样放行，此后该流只放行；
  它本身不记 `errors`，但之后可读的 `finish{error}` 仍记一次（P-0034）。
- `remedy_unattributed` 是 P-0027 的兜底名，不是 remedy 的私有命名空间。profile 的 `options.tools`
  已经声明它时，`planRescue` 整次放弃，`block-end` 缺名字时也保留原字节，不借用该名。
- 这仍然不解决顺序与否决：一个外层 listener 不调 `next()`，remedy 还是静默不在链上；
  这一条只由 `scan_plugin_seams.sh` 的扫描结果与 `unmeasured` 回答。


## 9. 外部反馈印证（2026-11-19）

两篇独立报道从外部说了同一件事，正好是本文 §1–§4 的判据试图提前发现的风险：

- [腾讯新闻《DeepSeek Harness被吐槽 负责人承诺升级：一切都会好起来》](https://news.qq.com/rain/a/20261107A07OAW00)（2026-11-07）：开发者抱怨宿主声明的破坏性更新会让插件在升级后不只是失效，而是让 DSH 崩溃、起不来；官方回应称兼容性与官方市场在改进中。报道里的版本号是散文写法，本项目只认安装目录 `runtime.json` 读回的版本。
- [新浪财经 / 雷峰网《我们拆了 1.1 万个 DeepSeek Harness 插件，发现官方几乎没有建立插件治理机制》](https://finance.sina.com.cn/stock/t/2026-08-28/doc-inipwnxp4482007.shtml)（2026-08-28）：其自述实测中，下载量前十的插件装在同一 profile 会起不来，冲突发生在第 2 / 3 / 6 名之间（UI 全家桶自带侧边栏与独立侧边栏插件抢同一路径）；文章同时指出宿主有配置层、加载顺序和能力接缝，文档也写明「后面的层按行整行覆盖前面的」，却没有任何工具检测冲突，并呼吁一个仲裁者。

它们**印证**而不是替代本项目的做法：`scripts/scan_plugin_seams.mjs` 是这只插件在自己接缝上的检测器——它读 `llm/stream` / `agent/error` / `agent/request-error` 的注册顺序与保留名占用（R68、R73、R75 三次读数拓扑未变），真机 turn 与邻居复验则回答「接缝是否真的跑过」。R73 / R75 的升级套路（读安装目录 runtime.json → 重扫接缝 → 真桌机 turn → 三个判别形状 → 重跑读取器）就是对「升级可能打断插件」这条外部批评的可复跑回答。

边界同样来自外部反馈：报道中的权限档失效、缓存失效、插件市场与命名冲突都不在本项目的四个接缝内，见 `docs/research/negative-feedback-2026-11-19.md` 的 B / C 节。**不因此扩张范围**：不做插件市场、不改宿主权限与沙箱、不碰 UI 路径仲裁。
