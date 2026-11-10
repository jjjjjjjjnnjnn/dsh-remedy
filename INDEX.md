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
| `packages/core/src/registry.ts` | `PATCHES`：补丁的单一真相源 |
| `packages/core/src/verdict.ts` | unmeasured / quiet / repaired / degraded |
| `packages/core/src/redact.ts` | 证据脱敏 |
| `packages/plugin/src/repair-stream.ts` | `llm/stream` 包装器 + 计数 |
| `packages/plugin/src/index.ts` | DSH loader 入口（默认导出 `{name, apply}`） |
| `packages/plugin/src/session-scan.ts` | 离线 `.jsonl` 扫描 |
| `packages/plugin/src/session-log.ts` | 多帧 zstd 会话日志读取 |
| `packages/plugin/src/cli.ts` | `status` / `repair` / `scan` / `verify` |
| `packages/plugin/cordis.patch.yml` | profile 补丁层（只有 `insert:` 与 `remedy-*`） |

## 证据

| 路径 | 作用 |
|---|---|
| `data/fixtures/toolcall-fusion/session-9045e2ec-seq-526.json` | 真实粘连文本（脱敏） |
| `data/fixtures/toolcall-fusion/valid-two-calls.json` | 反证：relay 有时给对 index |
| `data/fixtures/toolcall-fusion/braces-in-string.json` | `}{` 在字符串里不是边界 |
| `data/fixtures/toolcall-fusion/truncated.json` | 截断不修 |
| `data/fixtures/toolcall-fusion/single-broken.json` | 单个坏对象不拆 |
| `data/results/patch-registry-*.json` | 注册表快照（SSOT） |
| `data/results/live-2026-11-09T17-00-00.000Z.json` | headless 真机：10 流 / 1 修复 / `completed` |
| `data/results/live-desktop-2026-11-09T19-10-00.000Z.json` | 桌面真机：39 流 / 2 修复 / `aborted`（人工停止） |
| `data/results/publish-2026-11-10T06-40-00.000Z.json` | 0.1.1 registry 状态（`ok`） |
| `data/results/publish-2026-11-10T00-10-00.000Z.json` | 0.1.1 副本延迟的**红**产物（保留） |
| `docs/patches/P-0001-toolcall-fusion.md` | 事故/修复的完整记录 |
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
| `scripts/copy_with_agy.mjs` | copy 通道：调用 agy 并记录 provenance |
| `scripts/record_live_mount.mjs` | 真机 journal/session → `live-*` 产物 |
| `scripts/record_publish.mjs` | 发布后 registry 状态 → `publish-*` 产物 |
| `scripts/sync_fixtures.mjs` | `prepack`：夹具进包 |
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
| `tests/unit/repair-stream.test.ts` | 真实 error-finish 序列 / 抛错 / 截断 / 全有或全无 |
| `tests/unit/verdict.test.ts` | 四态 |
| `tests/unit/redact.test.ts` | 密钥 / token / 邮箱 / 家目录 |
| `tests/unit/session-scan.test.ts` | 计数与脱敏 |
| `tests/unit/session-log.test.ts` | 多帧 zstd 读取 |
| `tests/unit/plugin-mount.test.ts` | `llm/stream` 监听器必须同步返回 |
| `tests/unit/fixtures-sync.test.ts` | 包内夹具与 canonical 字节一致 |
| `tests/governance/ledgers.test.ts` | 台账与快照一致性 |
| `tests/governance/public-copy.test.ts` | 对外文件 / 事实包 / 模板 / 元数据 |
| `tests/e2e/cli.test.ts` | 四条命令的退出码与产物 |
