# dsh-remedy AGENTS.md

> **产品名**：**dsh-remedy**（处置层 / Remedy）｜**容器仓库**：`DSH-Addition`（本目录是子项目）｜
> **协作对象**：`../dsh-triage`（分诊：只判断，不修）｜**当前版本**：`0.1.0`
> **Stand**：R5（2026-11-10，**0.1.1 已发布并完成陌生人安装验收**：空目录装
> `dsh-remedy@0.1.1` 后 `verify` 5/5 夹具通过；0.1.0 的 tarball 缺 fixtures 的缺陷已修。
> 第一份 0.1.1 取证是红的（registry 副本延迟），用新 stamp 重记为 `ok`。
> **97 测试 / 5 门**)｜R4（2026-11-09，npm 0.1.0：`dsh-remedy` + `dsh-remedy-core`，
> `latest=0.1.0`；core 因 scope 不存在改为无 scope）｜R3（2026-11-09，桌面 profile 挂载 +
> App 重启：39 条流 / 2 次修复）｜R2（2026-11-09，P-0001 升 `verified`）｜
> R1（2026-11-09，首个补丁 P-0001 落地；5 夹具 / 4 门 / `tested`）
> **接手先读**：`docs/HANDOFF.md` → `PROJECT_RULES.md` → `INDEX.md`
>
> **基线（2026-11-10）**：`pnpm run verify` = **97 tests / 5 gates**；
> `node scripts/gate.mjs --mutate` = **5-5**。npm：`dsh-remedy@0.1.1`（latest）+
> `dsh-remedy-core@0.1.0`。公开仓库 CI 绿，release `v0.1.0` / `v0.1.1`。
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
│   ├── registry.ts         # PATCHES：每个补丁的名字、证据、守卫、边界
│   ├── redact.ts           # 证据离开机器前的脱敏
│   ├── verdict.ts          # unmeasured / quiet / repaired / degraded
│   ├── types.ts            # 领域类型
│   └── index.ts            # 稳定出口
├── packages/plugin/src/
│   ├── index.ts            # DSH loader：llm/stream + 可选 agent/request-error
│   ├── repair-stream.ts    # chunk 包装器；计数与事件
│   ├── session-scan.ts     # 离线扫描 .jsonl
│   ├── session-log.ts      # 多帧 zstd 会话日志读取
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
│   ├── copy_with_agy.mjs   # copy 通道：agy + manifest
│   ├── record_live_mount.mjs   # 真机 journal/session → live 产物
│   ├── record_publish.mjs      # 发布后 registry 状态 → publish 产物
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
5. `audit/AI_DISCLOSURE_LOG.md` 必须有 `SessionID` 与 `P-0001`；
6. `docs/HANDOFF.md` 必须有「当前批次」与「第一件事」；
7. 每个对外文件必须与 `docs/copy/manifest.json` 的 `output_sha256` 一致，且
   `facts_sha256` 指向当前事实包（`gate_copy`）。
