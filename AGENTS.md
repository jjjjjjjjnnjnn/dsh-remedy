# dsh-remedy AGENTS.md

> **产品名**：**dsh-remedy**（处置层 / Remedy）｜**容器仓库**：`DSH-Addition`（本目录是子项目）｜
> **协作对象**：`../dsh-triage`（分诊：只判断，不修）｜**当前版本**：`0.3.7`（已 bump、已打包实测、未发布；registry 上仍是 0.3.6）
> **Stand**：R18（2026-11-12，**P-0010 落地 + 0.3.7 bump**：npm 页面（`packages/plugin/README.md`）
> 与 CLI `USAGE` 的 `scan` 用法第一次一致，并由 `tests/unit/cli-usage.test.ts` 守着；
> 0.3.6 真机第一次修好真实粘连（`data/results/live-2026-11-12T06-00-00.000Z.json`，
> `fused:1 repaired:1`、合成 id 被派发并回答），但 `withdrawn` 仍未在真机出现。
> **195 测试 / 6 门**)｜R17（2026-11-11，收尾 0.3.6 的对外文字与台账，重测 census 到
> 293 turns / 393 attempts，装机验收第一次落成产物）｜R16（2026-11-11，P-0009 窗口化扫描的
> `createdAt` 回退）｜
> R15（P-0008 字节预算门）｜R14（P-0007 copy 通道传输）｜R13（P-0006 turn census）｜
> R12（P-0004 scan 保真 + 脱敏形状）｜R11（P-0005 裸值 reseal）｜R10（0.3.0 被 npm 写坏，
> 0.3.1 修）｜R9（P-0003 升 `verified`）｜R8（P-0002 升 `verified`）｜R7（0.3.0 可观测性）｜
> R6（0.2.0 加固）｜R5（0.1.1 发布 + 陌生人验收）｜R4（npm 0.1.0 双包）｜R3（桌面 profile +
> App 重启）｜R2（P-0001 升 `verified`）｜R1（首个补丁落地）
> **接手先读**：`docs/HANDOFF.md` → `PROJECT_RULES.md` → `INDEX.md`
>
> **基线（2026-11-12）**：`pnpm run verify` = **195 tests / 6 gates**；
> `node scripts/gate.mjs --mutate` = **6-6**。npm：`dsh-remedy@0.3.6`（latest）+
> `dsh-remedy-core@0.3.6`。公开仓库 CI 绿，release `v0.1.0` / `v0.1.1` / `v0.3.2` …
> `v0.3.6`。
> **本目录不是 git 根**：提交在 `..`（容器），公开仓库由
> `git subtree split --prefix=dsh-remedy` 切出。

---

## 🎯 Mission

**一句话**：在 DSH 的缺陷接缝上做“处置层”——发现、修复、拒绝假装修好、留证。

与 `dsh-triage` 的分工是硬的：

| | dsh-triage | dsh-remedy |
|---|---|---|
| 动作 | 判断、归因、出 verdict | 在接缝上改变运行时行为 |
| 默认 | 只读、零写盘 | 常驻、只在 `llm/stream` 上改 chunk |
| 失败时 | 输出 `unknown` | 原样抛回，绝不把失败变成成功 |
| 证据 | `data/results/` 脚本产物 | 同样的产物 + 修复事件 + 夹具回放 |

**明确不做**：不改 `app.asar`、不做插件市场、不做启动器、不修复 `max-tokens` 截断、
不替用户决定装哪个包。

---

## 📂 Architecture Map

```
dsh-remedy/
├── packages/core/src/
│   ├── json-split.ts       # 顶层 JSON 对象切分（字符串/深度状态机）
│   ├── toolcall-repair.ts  # 一个调用 → unchanged | repaired | rejected
│   ├── reseal.ts           # 裸值成员值的唯一候选 reseal（P-0005）
│   ├── registry.ts         # PATCHES：每个补丁的名字、证据、守卫、边界
│   ├── redact.ts           # 证据离开机器前的脱敏
│   ├── verdict.ts          # unmeasured / quiet / repaired / degraded
│   ├── types.ts            # 领域类型
│   └── index.ts            # 稳定出口
├── packages/plugin/src/
│   ├── index.ts            # DSH loader：llm/stream + 可选 agent/request-error
│   ├── repair-stream.ts    # chunk 包装器；计数与事件
│   ├── stream-types.ts     # P-0005 拆出的流类型（编译期擦除）
│   ├── failure-text.ts     # P-0005 拆出的失败消息助手
│   ├── session-scan.ts     # 离线扫描 .jsonl / zstd 目录 + turn census
│   ├── session-log.ts      # 多帧 zstd 会话日志读取
│   ├── cli-args.ts         # EXIT_* / USAGE / parseArgs（P-0004 拆出）
│   ├── scan-command.ts     # scan 的目录遍历 / 读取 / 产物写入（P-0004 拆出）
│   └── cli.ts              # status / repair / scan / verify
├── packages/plugin/fixtures/          # pack 时由 sync_fixtures 生成（gitignore）
├── packages/plugin/cordis.patch.yml   # 只有 insert: + remedy-* 行
├── scripts/
│   ├── gate.mjs            # 门禁跑者（--mutate / --record）
│   ├── gate_ssot.mjs       # data/results 必须可溯源 + 有 sha256
│   ├── gate_registry.mjs   # 注册表 = 账本 = 快照；证据/守卫必须存在
│   ├── gate_namespace.mjs  # 补丁层不能挂错东西
│   ├── gate_step_review.mjs# 每步五轴 review + 证据可解析
│   ├── gate_copy.mjs       # 对外文件字节 / 事实包 / 数字一致性
│   ├── gate_size.mjs       # 第六门：dist/*.js 字节预算（P-0008）
│   ├── lib/kit.mjs         # 门禁共用：runGate / readJson / sha256 / isoStamp
│   ├── lib/agy-channel.mjs # copy 通道传输规则（argv vs stdin，P-0007）
│   ├── copy_with_agy.mjs   # copy 通道：agy + manifest
│   ├── publish_packages.mjs    # pnpm pack → 校验 manifest → npm publish
│   ├── redact_artifacts.mjs    # 已落盘产物的脱敏重写（P-0004）
│   ├── record_live_mount.mjs   # 真机 journal/session → live 产物
│   ├── record_publish.mjs      # 发布后 registry 状态 → publish 产物
│   ├── record_session_sample.mjs      # 本机故障样本（必须带 --until）
│   ├── record_install_acceptance.mjs  # 空目录从 registry 单装 → 落盘验收
│   ├── sync_fixtures.mjs       # prepack：夹具进包
│   └── record_patch_registry.mjs
├── tests/                  # unit / governance / e2e
├── data/fixtures/toolcall-fusion/   # 真实失败 + 反证 + 负对照
├── data/results/           # SSOT：脚本产出 + .sha256
├── audit/                  # 四本台账 + AI 披露
└── docs/                   # HANDOFF / patches / adr / copy / PUBLISH
```

---

## ⚡ 标准工作流

```powershell
pnpm install
pnpm run verify     # build → typecheck → test → gate
pnpm run gate
node scripts/gate.mjs --mutate     # 每门都必须红
node scripts/record_patch_registry.mjs --stamp <ISO>
```

### 加一个补丁的固定顺序

1. 先在 `docs/patches/` 写清症状、机制（文件/行）、反证、边界；
2. 在 `packages/core/src/registry.ts` 加 `P-NNNN`，`status` 从 `drafted` 开始；
3. 判据先行：先写负对照测试，再写实现；
4. 只有真机跑过才允许 `verified`，并把产物放 `data/results/live-*`；
5. `record_patch_registry` → `gate` → `gate --mutate` → 同步 `audit/patch_ledger.json` 与 HANDOFF。

---

## 关键工程约定

- **TypeScript ESM**，包内相对导入写 `.js` 后缀；`erasableSyntaxOnly` 打开，`node --test` 直接跑 TS。
- **门禁零依赖**：`scripts/gate_*.mjs` 只用 Node 内置。
- **失败即失败**：门禁红了修根因，不放宽阈值。
- **本机 DSH 只读**：插件不写 `~/.dsh`；`journalPath` 默认关闭，开了也只追加自己的事件。
- **修不了就抛**：任何“看起来修好了”的路径都必须先通过“每个片段都能 parse”这条证明。
- **一次只改一个接缝**：`llm/stream` 之外的行为不进 P-0001。

---

## 机器强制的完整性

以下缺一即红（`gate_step_review` + `tests/governance`）：

1. `audit/gate_ledger.json` 与 `scripts/gate_*.mjs` 一一对应，每门写清 `negative_control`；
2. 每个补丁的证据与守卫路径必须存在；
3. `data/results/patch-registry-*.json` 必须与构建后的注册表逐字节一致，并带 sha256；
4. 每个门至少一步 review，五轴（正确性 / 可复现 / 合规 / SSOT / 对抗）不得为空；
5. `audit/AI_DISCLOSURE_LOG.md` 每行必须六格、必须有 `SessionID` 与 `P-0001`，
   且同一个 `SessionID` 不得出现在两行（那会让“哪个运行写了这个文件”无法回答）；
6. `docs/HANDOFF.md` 必须有「当前批次」与「第一件事」；
7. 每个对外文件必须与 `docs/copy/manifest.json` 的 `output_sha256` 一致，且
   `facts_sha256` 指向当前事实包（`gate_copy`）；
8. 装机验收必须是 `data/results/install-acceptance-*.json`
   （`scripts/record_install_acceptance.mjs` 产出，`ok` 与 `steps` 都在里面），
   不再只是 HANDOFF 里的一句话。
