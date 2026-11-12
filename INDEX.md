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

## 代码

| 路径 | 作用 |
|---|---|
| `packages/core/src/json-split.ts` | 顶层 JSON 对象切分；`}{` 在字符串里不是边界 |
| `packages/core/src/toolcall-repair.ts` | unchanged / repaired / rejected 三态判定 |
| `packages/core/src/reseal.ts` | 裸值成员值只在唯一候选时 reseal，否则拒（P-0005） |
| `packages/core/src/registry.ts` | `PATCHES`：补丁的单一真相源 |
| `packages/core/src/verdict.ts` | unmeasured / quiet / repaired / degraded |
| `packages/core/src/redact.ts` | 证据脱敏（五种家目录形状） |
| `packages/plugin/src/repair-stream.ts` | `llm/stream` 包装器 + 计数 |
| `packages/plugin/src/stream-types.ts` | P-0005 拆出的流类型（编译期擦除） |
| `packages/plugin/src/failure-text.ts` | P-0005 拆出的失败消息助手 |
| `packages/plugin/src/index.ts` | DSH loader 入口（默认导出 `{name, apply}`） |
| `packages/plugin/src/session-scan.ts` | 离线扫描（zstd / 目录 / `--since` / turn census） |
| `packages/plugin/src/session-log.ts` | 多帧 zstd 会话日志读取 |
| `packages/plugin/src/cli-args.ts` | `EXIT_*` / `USAGE` / `parseArgs`（P-0004 拆出） |
| `packages/plugin/src/scan-command.ts` | `scan` 的目录遍历 / 读取 / 产物写入（P-0004 拆出） |
| `packages/plugin/src/cli.ts` | `status` / `repair` / `scan` / `verify` |
| `packages/plugin/cordis.patch.yml` | profile 补丁层（只有 `insert:` 与 `remedy-*`） |

## 证据

| 路径 | 作用 |
|---|---|
| `data/fixtures/toolcall-fusion/session-9045e2ec-seq-526.json` | 真实粘连文本（脱敏） |
| `data/fixtures/toolcall-fusion/valid-two-calls.json` | 反证：relay 有时给对 index |
| `data/fixtures/toolcall-fusion/braces-in-string.json` | `}{` 在字符串里不是边界 |
| `data/fixtures/toolcall-fusion/bare-code-value.json` | 裸值 reseal 的实测夹具（P-0005） |
| `data/fixtures/toolcall-fusion/truncated.json` | 截断不修 |
| `data/fixtures/toolcall-fusion/single-broken.json` | 单个坏对象不拆 |
| `data/results/patch-registry-*.json` | 注册表快照（SSOT） |
| `data/results/live-2026-11-09T17-00-00.000Z.json` | headless 真机：10 流 / 1 修复 / `completed` |
| `data/results/live-desktop-2026-11-09T19-10-00.000Z.json` | 桌面真机：39 流 / 2 修复 / `aborted`（人工停止） |
| `data/results/live-2026-11-10T14-45-00.000Z.json` | 0.3.0 headless 真机：合成 id 被派发并回答（P-0002） |
| `data/results/live-2026-11-10T16-30-00.000Z.json` | 0.3.0 headless 真机拒绝：`refused:1`（P-0003） |
| `data/results/session-sample-2026-11-11T18-10-00.000Z.json` | 本机 census 样本（`--until 2026-11-11T17:00:00.000Z`，可复算） |
| `data/results/scan-full-2026-11-11T18-15-00.000Z.json` | 全目录 scan 产物：78 文件 / 393 attempts / 293 turns |
| `data/results/install-acceptance-2026-11-11T19-30-00.000Z.json` | 0.3.6 空目录从 registry 单装 6/6（R17 首次落盘） |
| `data/results/publish-2026-11-11T17-35-00.000Z.json` | 0.3.6 发布后两包 `latest`（`ok: true`） |
| `docs/patches/P-0001-toolcall-fusion.md` … `P-0009-session-header-window.md` | 每个补丁的症状 / 机制 / 反证 / 边界 |
| `docs/adr/0001-stream-repair-over-asar-patch.md` | 为什么在 `llm/stream` 修 |

## 公开仓库（对外）

| 路径 | 作用 |
|---|---|
| `README.md` / `README.zh-CN.md` | 公开首屏（由 copy 通道生成，禁止手改） |
| `CONTRIBUTING.md` / `SECURITY.md` / `CODE_OF_CONDUCT.md` / `CHANGELOG.md` | 对外文件，同一通道 |
| `.github/ISSUE_TEMPLATE/` / `.github/PULL_REQUEST_TEMPLATE.md` | issue / PR 模板 |
| `.github/workflows/ci.yml` | 独立公开仓库的 CI（verify + mutate） |
| `docs/copy/facts/` | 事实包：唯一数字来源 |
| `docs/copy/prompts/` / `raw/` / `manifest.json` | 提示词、原始输出、provenance |
| `docs/copy/repo-metadata.json` | GitHub 描述 / topics / 发布文案 / npm 描述 |
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
| `scripts/gate_size.mjs` | 第六门：`dist/*.js` 字节预算（P-0008） |
| `scripts/lib/kit.mjs` | 门禁共用 `runGate` / `readJson` / `sha256` / `isoStamp` |
| `scripts/lib/agy-channel.mjs` | copy 通道的传输规则（argv / stdin，P-0007） |
| `scripts/copy_with_agy.mjs` | copy 通道：调用 agy 并记录 provenance |
| `scripts/publish_packages.mjs` | `pnpm pack` → 读回 manifest → `npm publish` |
| `scripts/redact_artifacts.mjs` | 已落盘产物的脱敏重写（P-0004） |
| `scripts/record_live_mount.mjs` | 真机 journal/session → `live-*` 产物 |
| `scripts/record_publish.mjs` | 发布后 registry 状态 → `publish-*` 产物 |
| `scripts/record_session_sample.mjs` | 本机故障样本（必须带 `--until`） |
| `scripts/record_install_acceptance.mjs` | 空目录从 registry 单装 → `install-acceptance-*` 产物 |
| `scripts/sync_fixtures.mjs` | `prepack`：夹具进包 |
| `scripts/record_patch_registry.mjs` | 注册表快照 → `patch-registry-*` 产物 |
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
| `tests/unit/cli-usage.test.ts` | 包内 README 与 CLI `USAGE` 的 `scan` 行必须一致（P-0010） |
| `tests/unit/agy-channel.test.ts` | 传输边界 / 失败命名 / 最后一条 `result` 胜出 |
| `tests/governance/ledgers.test.ts` | 台账 / 六格披露行 / 唯一 SessionID / 快照一致 |
| `tests/governance/public-copy.test.ts` | 对外文件 / 事实包 / 模板 / 元数据 |
| `tests/e2e/cli.test.ts` | 四条命令的退出码与产物 |
