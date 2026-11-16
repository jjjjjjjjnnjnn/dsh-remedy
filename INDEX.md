# INDEX — dsh-remedy

按“想改什么”找文件。

> **位置**：本目录是公开仓库根，但**不是 git 根**（容器是 `..`）。提交用 `git -C ..`；
> 公开仓库由 `git subtree split --prefix=dsh-remedy` 切出。

## 入口

| 文件 | 作用 |
|---|---|
| `README.md` | 陌生人首屏：它是什么、怎么跑、边界 |
| `AGENTS.md` | agent 入口：分工、结构、工作流、机器强制项 |
| `PROJECT_RULES.md` | 硬规则（只读本机、失败即失败、证据由脚本产出） |
| `docs/HANDOFF.md` | 交接：五分钟检查 / 当前批次 / 第一件事 / 坑 |
| `docs/research/README.md` | 外部反馈 intake：来源、判据、四条约束、同类项目读法（R43 起） |
| `docs/research/leads.md` | 线索账本：38 条（31 条 DSH + 4 条 Reddit 摘要 + 3 条同接缝/手册），带 `source_kind` / `read_depth`；F 表结案 L-0032…L-0036，G 表结案 L-0037/L-0038 |
| `docs/research/sources.md` | 七个来源的读法、频率、边界；Reddit 读不到正文的诚实规则 |
| `docs/research/plan-0.4.9.md` | 0.4.9 计划与结案：来源 → 巡检 → 一条线索 → 一个补丁；§2 记着这一版实际结掉的六条线索 |
| `docs/research/similar-projects-2026-11-14.md` | 同接缝的五个竞品与上游源码：借了什么机制、拒了什么取舍、每条指回本机 `app.asar` 的行号（R47） |
| `docs/research/community-2026-11-14.md` | 2026-11-14 的社区盘面事实底稿（star / issue / 下载 / Discussions） |

## 代码

| 路径 | 作用 |
|---|---|
| `packages/core/src/json-split.ts` | 顶层 JSON 对象切分；`}{` 在字符串里不是边界 |
| `packages/core/src/toolcall-repair.ts` | unchanged / repaired / rejected 三态判定 |
| `packages/core/src/reseal.ts` | 裸值成员值只在唯一候选时 reseal，否则拒（P-0005） |
| `packages/core/src/closer.ts` | 缺一个闭合 `]`/`}` 时只在唯一内部插入点补回，末尾与歧义一律拒（P-0037） |
| `packages/core/src/redact.ts` | 脱敏：密钥/token/邮箱 + 三个平台的家目录形状与三种会话目录键（P-0004 / P-0038） |
| `scripts/lib/session-root.mjs` | 会话目录在三个平台上的唯一定义（`DSH_SESSIONS` 优先，否则 HOME/USERPROFILE/homedir）；P-0039 |
| `scripts/lib/acceptance.mjs` | 装机验收的判据：夹具数从 `data/fixtures/` 数出来，数量一致 + 每行 PASS；P-0040 |
| `packages/core/src/registry.ts` | `PATCHES`：补丁的单一真相源 |
| `packages/core/src/answer.ts` | P-0044：一个 turn 到底有没有回答（tool-call / 非空白 text 算，未知块不算，只看最后一步） |
| `packages/core/src/verdict.ts` | unmeasured / quiet / repaired / degraded |
| `packages/core/src/preflight.ts` | reasoning effort 预检：ok / refuse / unknown + 建议档位（P-0013） |
| `packages/core/src/redact.ts` | 证据脱敏（五种家目录形状） |
| `packages/core/src/attribute.ts` | 归因证明：`fits` / `foreign` / `unproven`；只有声明的 violation 才拒（P-0030） |
| `packages/plugin/src/repair-stream.ts` | `llm/stream` 包装器 + 计数 |
| `packages/plugin/src/stream-types.ts` | P-0005 拆出的流类型（编译期擦除） |
| `packages/plugin/src/failure-text.ts` | P-0005 拆出的失败消息助手 |
| `packages/plugin/src/monitor.ts` | 计数器账本（每条计数为何移动；P-0012 付账的那次拆分） |
| `packages/plugin/src/failure-listener.ts` | `agent/request-error`：命名诊断 + 有界重试（P-0011/P-0013） |
| `packages/plugin/src/index.ts` | DSH loader 入口（默认导出 `{name, apply}`） |
| `packages/plugin/src/session-scan.ts` | 离线扫描（zstd / 目录 / `--since` / turn census） |
| `packages/plugin/src/session-log.ts` | 多帧 zstd 会话日志读取 |
| `packages/plugin/src/cli-args.ts` | `EXIT_*` / `USAGE` / `parseArgs`（P-0004 拆出） |
| `packages/plugin/src/scan-command.ts` | `scan` 的目录遍历 / 读取 / 产物写入（P-0004 拆出） |
| `packages/plugin/src/cli.ts` | `status` / `repair` / `scan` / `explain` / `verify` |
| `packages/plugin/src/explain-command.ts` | `explain`：故障类 → 覆盖补丁 → 本 profile 是否启用 |
| `packages/plugin/cordis.patch.yml` | profile 补丁层（只有 `insert:` 与 `remedy-*`） |

## 证据

| 路径 | 作用 |
|---|---|
| `data/fixtures/toolcall-fusion/session-9045e2ec-seq-526.json` | 真实粘连文本（脱敏） |
| `data/fixtures/toolcall-fusion/valid-two-calls.json` | 反证：relay 有时给对 index |
| `data/fixtures/toolcall-fusion/braces-in-string.json` | `}{` 在字符串里不是边界 |
| `data/fixtures/toolcall-fusion/bare-code-value.json` | 裸值 reseal 的实测夹具（P-0005） |
| `data/fixtures/toolcall-fusion/truncated.json` | 截断不修 |
| `data/fixtures/toolcall-fusion/missing-array-closer.json` | 缺一个 `]` 的实测形状：只补那一个字符（P-0037） |
| `data/fixtures/toolcall-fusion/ambiguous-closer.json` | 两个插入点都能 parse：拒绝而不是猜（P-0037 的负对照） |
| `data/fixtures/toolcall-fusion/single-broken.json` | 单个坏对象不拆 |
| `data/results/patch-registry-*.json` | 注册表快照（SSOT） |
| `data/results/live-2026-11-09T17-00-00.000Z.json` | headless 真机：10 流 / 1 修复 / `completed` |
| `data/results/live-linux-2026-11-15T10-00-00.000Z.json` | **Linux 真机（WSL2）**：329 tests / 6 gates / 6-6；#12819 形状被修好并派发；无 finish 的流以 `TRANSPORT` 收尾 |
| `data/results/live-linux-2026-11-15T15-00-00.000Z.json` | **Linux 真机终态（0.4.12）**：344 tests / 6 gates / 6-6；安装后的 `bin`（符号链接）真的运行，冷装 0.4.12 |
| `data/results/publish-2026-11-15T14-20-00.000Z.json` / `install-acceptance-2026-11-15T14-25-00.000Z.json` | **0.4.12 发布 + 空目录装机**（两包 `ok`、`OK 8 fixture(s)`） |
| `data/results/publish-2026-11-15T19-30-00.000Z.json` / `install-acceptance-2026-11-15T19-35-00.000Z.json` | **0.4.13 发布 + 空目录装机**（两包 `ok`、`OK 8 fixture(s)`、`canonical_fixtures: 8`） |
| `data/results/publish-2026-11-16T13-20-00.000Z.json` / `install-acceptance-2026-11-16T13-30-00.000Z.json` | **0.4.15 发布 + 空目录单装**（两包 `exact_ok` + `latest_ok`，`ok: true`；装机三条命令 0/0/0、`OK 8 fixture(s)`） |
| `data/results/live-desktop-2026-11-16T12-40-00.000Z.json` | **桌面真机：0.4.15 被 App 加载并跑了一个真实 turn**（13:31 重启、13:35 turn `completed`、journal `streams: 4`、verdict `quiet`） |
| `data/results/live-linux-2026-11-16T12-45-00.000Z.json` | **Linux 真机（WSL2 Ubuntu 26.04）· 0.4.15**：368 tests / 6 gates / 6-6、`OK 8 fixture(s)`、字节账与 Windows 同值 |
| `data/results/publish-2026-11-16T06-52-00.000Z.json` / `install-acceptance-2026-11-16T06-55-00.000Z.json` | **0.4.14 发布 + 空目录装机**（两包 `ok`、`OK 8 fixture(s)`、`canonical_fixtures: 8`；发布的夹具里是 `<home>`，不是账号名） |
| `data/results/live-desktop-2026-11-15T17-12-40.000Z.json` | **桌面真机：0.4.12 第一次被 App 加载**（一次真实 turn `completed`，journal 两个 stream 事件，verdict `quiet`；runtime 版本读自 `runtime.json`） |
| `data/results/prestep-enter-2026-11-15T17-55-00.000Z.json` | **`agent/pre-step` 的 `enter` 分支实测**（P-0042 的形状由来：能带消息、不能换 selection；`resolveCallConfig` 需 `inject`） |
| `data/results/live-desktop-2026-11-09T19-10-00.000Z.json` | 桌面真机：39 流 / 2 修复 / `aborted`（人工停止） |
| `data/results/live-2026-11-10T14-45-00.000Z.json` | 0.3.0 headless 真机：合成 id 被派发并回答（P-0002） |
| `data/results/live-2026-11-10T16-30-00.000Z.json` | 0.3.0 headless 真机拒绝：`refused:1`（P-0003） |
| `data/results/session-sample-2026-11-11T18-10-00.000Z.json` | 本机 census 样本（`--until 2026-11-11T17:00:00.000Z`，可复算） |
| `data/results/scan-full-2026-11-11T18-15-00.000Z.json` | 全目录 scan 产物：78 文件 / 393 attempts / 293 turns |
| `data/results/install-acceptance-2026-11-11T19-30-00.000Z.json` | 0.3.6 空目录从 registry 单装 6/6（R17 首次落盘） |
| `data/results/publish-2026-11-11T17-35-00.000Z.json` | 0.3.6 发布后两包 `latest`（`ok: true`） |
| `docs/patches/P-0001-toolcall-fusion.md` … `P-0009-session-header-window.md` | 每个补丁的症状 / 机制 / 反证 / 边界 |
| `docs/patches/P-0010-cli-usage-truth.md` … `P-0030-attribution-proof.md` | 同上；P-0015 是 `agent/pre-step` 拒绝语义的实测记录；P-0016 的文档在 R31 补写；P-0024 把两个包内 README 收进 copy 通道；P-0025 让 `explain` 的三态落地；P-0026 把发布流程收成一个家；P-0027 给「名字证不出来」的片段一个不可执行的名字；P-0028 把随包夹具里的本机路径换成 `<home>`；P-0029 把继任者的版本指针与字节账接上判据；P-0030 把归因证明搬进 core，按 schema 能证明的部分判定并记录 `unproven` |
| `docs/patches/P-0031-core-budget.md` … `P-0044-turn-answered.md` | P-0031 给引擎立 cap；P-0032 把台账的长叙述搬回补丁文档（registry.js 66 303 → 63 217，cap 不动）；P-0033 让空 id/空名的 tool call 不再被持久化（合成 id + `remedy_unattributed`）；P-0034 让「没有一个拒绝记账解释过的失败」记成 error 而不是安静的一轮；P-0035 把 patch 层每个 `name:` 解析到 manifest exports 与已构建文件（0 运行时字节）；P-0036 让纯 delta 协议的 tool call 保留流里已经证过的 id（宿主 `assembler.ts:72` 无条件写 id、`:115` 的 `??` 不兜空串）；P-0037 让「单个对象少一个闭合符」在唯一插入点上被补回，末尾与歧义一律拒（上游 #12819，`pi-ai` 回显 `Received arguments:` 才让字节到得了接缝）；P-0040 把装机验收的夹具数从 `data/fixtures/` 数出来；P-0041 让安装后的 `bin` 在 POSIX 上真的运行；P-0042 让 `scan` 记住宿主拒绝的那个档位、让 `explain` 在 profile 仍写着它时打一行 CONFLICT 并退出 1（零常驻字节，`agent/pre-step` 不能改 selection 是实测的）；P-0043 把为夹具写的那条守卫放宽到任意层转义，并新增「产物里不许出现本机账号」，夹具改用 `<home>`；P-0044 让 `scan` 在截断的 turn 上补一句「它到底有没有回答」（规则住 `core/answer.ts`，只数 `max-tokens`，只报告不升级） |
| `docs/adr/0001-stream-repair-over-asar-patch.md` | 为什么在 `llm/stream` 修 |

## 公开仓库（对外）

| 路径 | 作用 |
|---|---|
| `README.md` / `README.zh-CN.md` | 公开首屏（由 copy 通道生成，禁止手改） |
| `CONTRIBUTING.md` / `SECURITY.md` / `CODE_OF_CONDUCT.md` / `CHANGELOG.md` | 对外文件，同一通道 |
| `.github/ISSUE_TEMPLATE/` / `.github/PULL_REQUEST_TEMPLATE.md` | issue / PR 模板 |
| `.github/workflows/ci.yml` | 独立公开仓库的 CI（verify + mutate） |
| `docs/copy/facts/` | 事实包：唯一数字来源 |
| `docs/copy/prompts/` / `raw/` / `manifest.json` | 草稿要求、原始草稿、provenance |
| `docs/copy/repo-metadata.json` | GitHub 描述 / topics / 发布文案 / npm 描述 |
| `docs/copy/release-notes/` | GitHub release 正文（同一 copy 通道；条目带 `frozen_at`，不随事实包漂移） |
| `docs/market-index.json` | format 1 索引源，钉在公开仓提交；市场可直接消费（R27） |
| `docs/distribution/README.md` | 渠道台账：每家要交什么、哪些是自动采集、描述红线（R27） |
| `docs/distribution/awesome-dsh-plugin-entry.yml` | 那张表的条目文件本体，可直接复制进 `data/plugins/`（R27） |
| `docs/PUBLISH.md` | `git subtree split` 与首次发布步骤 |

## 门禁与台账

| 路径 | 作用 |
|---|---|
| `scripts/gate.mjs` | 跑全部门；`--mutate` 负对照；`--record` 落盘 |
| `scripts/gate_ssot.mjs` | `data/results` 可溯源 + hash |
| `scripts/gate_registry.mjs` | 注册表 = 账本 = 快照 |
| `scripts/gate_namespace.mjs` | 补丁层形状 |
| `scripts/gate_step_review.mjs` | 每步五轴 review |
| `scripts/gate_copy.mjs` | 对外文件字节 / 事实包 / 数字一致性 |
| `scripts/gate_size.mjs` | 第六门：字节预算，按加载路径分 residency / cli / total（P-0012） |
| `scripts/lib/budgets.mjs` | 三个 cap、两份模块清单、`approved_by` 签名 |
| `scripts/lib/kit.mjs` | 门禁共用 `runGate` / `readJson` / `sha256` / `isoStamp` |
| `scripts/lib/copy-policy.mjs` | 数字白名单 / 占位符 / writer，纯函数 |
| `scripts/lib/copy-policy.d.mts` | 上面那个模块的类型，测试才能在 `--noEmit` 下复用同一套剥法（P-0017） |
| `scripts/lib/agy-channel.mjs` | 已退役通道的传输规则（P-0007 历史记录） |
| `scripts/copy_record.mjs` | copy 通道：登记本会话写的草稿（先校验数字再写盘）；`--freeze` 把已发布条目冻成 release 记录 |
| `scripts/publish_packages.mjs` | `pnpm pack` → 读回 manifest → `npm publish` |
| `scripts/redact_artifacts.mjs` | 已落盘产物的脱敏重写（P-0004） |
| `scripts/record_live_mount.mjs` | 真机 journal/session → `live-*` 产物 |
| `scripts/record_publish.mjs` | 发布后 registry 状态 → `publish-*` 产物 |
| `scripts/record_session_sample.mjs` | 本机故障样本（必须带 `--until`；会话根走 `lib/session-root.mjs`） |
| `scripts/record_install_acceptance.mjs` | 空目录从 registry 单装 → `install-acceptance-*` 产物 |
| `scripts/record_prestep_probe.mjs` | 隔离 `DSH_HOME` 里 `agent/pre-step` 拒绝语义的会话 → `prestep-probe-*` 产物（P-0015） |
| `scripts/record_prestep_enter.mjs` | `agent/pre-step` 的 `enter` 分支实测 → `prestep-enter-*`（R53：`enter` 能带消息、换不了 selection） |
| `scripts/record_linux_r53.mjs` | Linux 半边的发布证据 → `live-linux-*`（冷装与 `npx` 没重测就记 null + 原因，不借上一轮的数） |
| `scripts/lib/runtime-version.mjs` | runtime 版本读自 `runtime.json`，缺字段答 null 不猜（P-0042 的附带修正） |
| `scripts/replay_malformed_corpus.mjs` | 全部真实 `MALFORMED_RESPONSE` 回放 → `malformed-replay-*` |
| `scripts/stress_repair.mjs` | 生成式压力（固定 seed）→ `stress-repair-*` |
| `scripts/probe_withdrawn_reachability.mjs` | 实测 `withdrawn` 在本机是否可达 → `withdrawn-reachability-*` 产物 |
| `scripts/sync_fixtures.mjs` | `prepack`：夹具进包 |
| `scripts/collect_leads.mjs` | 一次社区巡检 → `intake-*` 产物（读不到的来源记 null，不记 0） |
| `scripts/lib/intake.mjs` | 巡检的纯函数：`ok` / `unreadable` / 汇总 / 候选去重 |
| `scripts/record_patch_registry.mjs` | 注册表快照 → `patch-registry-*` 产物 |
| `scripts/record_linux_host.mjs` | WSL/Linux 真机证据 → `live-linux-*` 产物（含跨平台脱敏与无 finish 的实测） |
| `audit/gate_ledger.json` | 门的清单与负对照 |
| `audit/patch_ledger.json` | 补丁账本 |
| `audit/step_reviews.json` | 每步五轴 |
| `audit/blind_spots.json` | 已知看不见的地方 |
| `audit/AI_DISCLOSURE_LOG.md` | 非人类手写模块的来源 |

## 测试

| 路径 | 覆盖 |
|---|---|
| `tests/unit/json-split.test.ts` | 切分器正反例 |
| `tests/unit/toolcall-repair.test.ts` | 三态判定 + 真实夹具 + 负对照 |
| `tests/unit/reseal.test.ts` | 裸值 reseal：唯一候选才修，0 或 ≥2 都拒 |
| `tests/unit/closer.test.ts` | 缺一个闭合符：唯一插入点才修；歧义、切尾、末尾插入都拒（P-0037） |
| `tests/unit/refused-effort.test.ts` | `scan` 只在宿主句子同时点名 provider/model/level 时才记 `refused_efforts`；code 单独出现不造 key（P-0042） |
| `tests/unit/runtime-version.test.ts` | runtime 版本读自 `runtime.json`；缺字段/坏文件答 null，不猜（P-0042 的附带修正） |
| `tests/unit/turn-answer.test.ts` | P-0044 的判据：文本 / tool-call 算回答，只有 reasoning 与空白不算，只有 turn 最后一步决定，没有 assistant 消息算没回答 |
| `tests/governance/shipped-samples.test.ts` | 两个规则：随包文件不许有 `…:/Users/<name>`（任意层分隔符），`data/results/` 不许出现本机账号（P-0028 / P-0043） |
| `tests/e2e/explain-conflict.test.ts` | `explain` 的 CONFLICT 五种情形：命中 / 已改好 / 无拒绝 / profile 未写档位 / 另一条路由（P-0042） |
| `tests/unit/redact-platform.test.ts` | 三个平台的家目录与三种会话目录键；过度删除是负对照（P-0038） |
| `tests/unit/acceptance.test.ts` | 装机验收判据：旧的字面 6 与正确的 8 必须被区分（P-0040） |
| `tests/unit/cli-entry.test.ts` | 入口守卫：差一跳的 bin 路径必须能跑；import 不等于运行（P-0041） |
| `tests/unit/repair-stream.test.ts` | 真实 error-finish 序列 / 抛错 / 截断 / 全有或全无 |
| `tests/unit/verdict.test.ts` | 四态 + 第九计数器可选 |
| `tests/unit/redact.test.ts` | 密钥 / token / 邮箱 / 五种家目录形状 |
| `tests/unit/session-scan.test.ts` | 计数 / 窗口 / census / `createdAt` 头记录 |
| `tests/unit/session-log.test.ts` | 多帧 zstd 读取 |
| `tests/unit/plugin-mount.test.ts` | `llm/stream` 监听器必须同步返回 |
| `tests/unit/fixtures-sync.test.ts` | 包内夹具与 canonical 字节一致 |
| `tests/unit/registry.test.ts` | 注册表形状与状态语义 |
| `tests/unit/package-files.test.ts` | 包里必须带哪些文件（fixtures 进包） |
| `tests/unit/publish.test.ts` | 发布 preflight：登录、404/401/403、OTP、manifest 协议 |
| `tests/unit/cli-usage.test.ts` | 包内 README 与 CLI `USAGE` 的用法块必须逐行相同（P-0010 / P-0016） |
| `tests/unit/fuzz-invariants.test.ts` | 属性测试：任何被接受的调用，其参数必须各自能 parse |
| `tests/governance/manifest-targets.test.ts` | manifest 条目必须指向仓库内存在的文件（不得指向 `.tmp/`） |
| `tests/governance/facts-truth.test.ts` | 事实包自己的陈述必须成立：版本、pin、上一版、引用的补丁号（R22） |
| `tests/governance/handoff-truth.test.ts` | 证据索引=现在（可解析+哈希）+ 批次叙事=当时；每族只能一个「当前」（R22） |
| `tests/governance/coverage-single-source.test.ts` | 覆盖表只能住在 registry；不许命令自带 `COVERAGE`/`SWITCHES`（P-0016） |
| `tests/governance/coverage-vocabulary.test.ts` | 覆盖的故障类必须属于 census 会报的集合，且覆盖者必须是常驻接缝（P-0016） |
| `tests/governance/package-readme-prose.test.ts` | 两个包内 README：不许有散文数字，围栏里的命令必须真能 dispatch（P-0017） |
| `tests/governance/distribution-entry.test.ts` | 市场条目指向 `packages/plugin`、描述无数字、索引钉住提交与真实时间戳（R27） |
| `tests/unit/request-error.test.ts` | 第二接缝的五种决定、`next()` 契约、有界缓存 |
| `tests/unit/attribute.test.ts` | 归因三态：required / 闭合 schema / 声明类型，及「无法判定的关键字不产生拒绝」（P-0030） |
| `tests/unit/preflight.test.ts` | reasoning effort 预检：9 例，全部取自本机数据 |
| `tests/governance/budget-split.test.ts` | 预算的两份清单必须与真实模块图双向一致 |
| `tests/unit/intake.test.ts` | 巡检记账：读不到的来源必须是 null 而不是 0 |
| `tests/unit/agy-channel.test.ts` | 已退役通道的传输规则（P-0007 历史） |
| `tests/governance/ledgers.test.ts` | 台账 / 六格披露行 / 唯一 SessionID / 快照一致 |
| `tests/governance/public-copy.test.ts` | 对外文件 / 事实包 / 模板 / 元数据 |
| `tests/governance/leads-shape.test.ts` | 线索账本的来源 / 读深 / 状态一致性（社区面） |
| `tests/governance/profile-patch-resolution.test.ts` | patch 层每一行都必须解析到 manifest 的导出与已构建文件；#12318 那条坏 row 是负对照（P-0035） |
| `tests/e2e/cli.test.ts` | 四条命令的退出码与产物 |
| `tests/e2e/explain.test.ts` | `explain` 不造假：无输入就报 unknown、读 profile、输入不可读时退出 3 |
