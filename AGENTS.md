# dsh-remedy AGENTS.md

> **产品名**：**dsh-remedy**（处置层 / Remedy）｜**容器仓库**：`DSH-Addition`（本目录是子项目）｜
> **协作对象**：`../dsh-triage`（分诊：只判断，不修）｜**当前版本**：`0.4.12`（已发布，两包 `latest`）
> **Stand**：R52（2026-11-15，**交接轮：把交接文件里那些「读的人会照着做错事」的旧数字对齐到 0.4.12**——
> 事实包写 36 补丁 / 4 `verified` / 334 tests，实际 41 / 6 / 344；两个根 README 还描述 0.4.10 与 `OK 6 fixture(s)`；
> 交接的状态表带着 0.4.10 的 tarball 与两次发布前的 headroom；补丁行在两次编辑里丢了 P-0008 与 P-0039；
> 「下一件事」还在让人发版、换 profile（R51 已做完）。**判据、阈值、cap 一字未动，0 运行时字节**。
> R51 是**发版之后把它拆开看**：0.4.11 带 P-0037/P-0038/P-0039，0.4.12 带 P-0040（验收不再自己拥有夹具数）
> 与 P-0041（POSIX 上的 bin 是符号链接，旧守卫让 `main()` 根本没跑、退出 0）。
> **344 测试 / 6 门 / `--mutate` 6-6**（Windows 与 Linux 同值）。
> **平台边界：Windows 与 Linux 实测，macOS 未实测**；P-0038 的 `/Users` 形状在 Linux 上是字符串）。
> R49 是 P-0037（少一个闭合符）与 P-0038（脱敏按一个平台写却发到三个）；R48 是交接轮（三份旧账本对齐）；
> R47 是**去互联网上读同接缝的五个竞品与上游源码**，把拼得上的
> 那一块做成 P-0036（纯 delta 协议的 tool call 不许落盘成 `id: ""`），0.4.10 发布。R46 是 P-0035（patch 层的每一行都必须能在 manifest 里解析，0 运行时字节）。
> R45 是 P-0034（未拒绝的 `MALFORMED_RESPONSE` 不再被记成安静的一轮）；R44 是社区面（七个来源 + 巡检脚本）。
> R43 是 P-0032 台账去重与 P-0033 空身份；R42 是引擎的字节账（P-0031）；R41 是继任者的地图（P-0029）与归因证明（P-0030）。
> 更早的 R40…R1 见 `docs/HANDOFF.md` 的批次叙事。｜
> **接手先读**：`docs/HANDOFF.md` → `docs/research/README.md` → `docs/research/leads.md` → `PROJECT_RULES.md` → `INDEX.md`
> **R43 起的主线**是外部反馈 → 稳定补丁：报告只是线索，本机复现后才有补丁；来源与方法见 `docs/research/`。
>
> **基线（2026-11-15）**：`pnpm run verify` = **344 tests / 6 gates**（Windows 与 Linux 同值）；
> `node scripts/gate.mjs --mutate` = **6-6**。npm：`dsh-remedy@0.4.12`（latest）+
> `dsh-remedy-core@0.4.12`（latest）。公开仓库 CI 绿，release `v0.1.0` / `v0.1.1` / `v0.3.2` …
> `v0.4.12`。四十一补丁：**6 `verified` + 35 `tested`**，在 DSH 0.2.2-rc.3 上实测过（Windows + Linux WSL2）。
> **字节余量（下一轮的第一个约束）**：plugin **82 919 / 83 000（81 B）**、core **103 702 / 104 000（298 B）**、
> registry **67 903 / 68 000（97 B —— 下一条记录之前先压一条老记录，按 P-0032 的先例，不许抬 cap）**。
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
│   ├── preflight.ts        # reasoning effort 预检：纯函数，ok/refuse/unknown（P-0013）
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
│   ├── monitor.ts          # 计数器账本（每条计数为何移动；P-0012 付账的那次拆分）
│   ├── failure-listener.ts # 第二接缝：命名诊断 + 有界重试（P-0011/P-0013）
│   ├── session-scan.ts     # 离线扫描 .jsonl / zstd 目录 + turn census
│   ├── session-log.ts      # 多帧 zstd 会话日志读取
│   ├── cli-args.ts         # EXIT_* / USAGE / parseArgs（P-0004 拆出）
│   ├── scan-command.ts     # scan 的目录遍历 / 读取 / 产物写入（P-0004 拆出）
│   ├── explain-command.ts  # explain：故障类 → 谁覆盖 → 本 profile 是否启用
│   └── cli.ts              # status / repair / scan / explain / verify
├── packages/plugin/fixtures/          # pack 时由 sync_fixtures 生成（gitignore）
├── packages/plugin/cordis.patch.yml   # 只有 insert: + remedy-* 行
├── scripts/
│   ├── gate.mjs            # 门禁跑者（--mutate / --record）
│   ├── gate_ssot.mjs       # data/results 必须可溯源 + 有 sha256
│   ├── gate_registry.mjs   # 注册表 = 账本 = 快照；证据/守卫必须存在
│   ├── gate_namespace.mjs  # 补丁层不能挂错东西
│   ├── gate_step_review.mjs# 每步五轴 review + 证据可解析
│   ├── gate_copy.mjs       # 对外文件字节 / 事实包 / 数字一致性
│   ├── gate_size.mjs       # 第六门：字节预算，按加载路径分 residency/cli/total（P-0012）
│   ├── lib/budgets.mjs     # 三个 cap 与两份模块清单（含 approved_by 签名）
│   ├── lib/kit.mjs         # 门禁共用：runGate / readJson / sha256 / isoStamp
│   ├── lib/agy-channel.mjs # 已退役通道的传输规则（P-0007 历史记录，保留供追溯）
│   ├── copy_record.mjs     # copy 通道：登记本会话写的草稿（先校验数字再写盘）
│   ├── lib/copy-policy.mjs # 数字白名单 / 占位符 / writer，纯函数
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
