# dsh-remedy AGENTS.md

> **产品名**：**dsh-remedy**（处置层 / Remedy）｜**容器仓库**：`DSH-Addition`（本目录是子项目）｜
> **协作对象**：`../dsh-triage`（分诊：只判断，不修）｜**当前版本**：`0.4.20`（已发布，两包 `latest`；两个 profile 在 0.4.20 上；桌面 0.4.20 turn 已在 DSH 0.2.2-rc.5 上跑通（R76））
> **Stand**：R69（2026-11-18，**对读不懂的 chunk 失败开放**）——
> remedy 只能原样放行 / 修复已证实的粘连 / 原样抛回原来的失败，不再制造第四种结局；
> P-0053 让四条邻居形状从 `TypeError` 变成原样放行，P-0054 让 profile 已拥有的
> `remedy_unattributed` 不再被借用（两处派发点都改）。证据：`hostile-neighbours-2026-11-18T10-00-00.000Z.json`
> （修前）/ `hostile-neighbours-2026-11-18T11-30-00.000Z.json`（修后）；决定见 `docs/adr/0002-fail-open-on-foreign-chunks.md`。
> R68 是接缝盘点（waterfall 顺序、本机 remedy → ops、每 chunk 开销）；R67 是 POSIX 半边；
> R66 是首屏第三次少一个补丁；R65 是 P-0052；更早的批次见 `docs/HANDOFF.md` 的批次叙事。
> **接手先读**：`docs/HANDOFF.md` → `docs/research/README.md` → `docs/research/leads.md` → `PROJECT_RULES.md` → `INDEX.md`
> **R43 起的主线**是外部反馈 → 稳定补丁：报告只是线索，本机复现后才有补丁；来源与方法见 `docs/research/`。R56 的教训：**接缝名写在补丁里不算数，要在宿主源码里核对接缝真的会被派发**。
>
> **基线（2026-11-18）**：`pnpm run verify` = **451 tests / 6 gates**（含 R77 的四条推广治理测试，Windows）；
> `node scripts/gate.mjs --mutate` = **6-6**。npm：`dsh-remedy@0.4.20`（latest）+
> `dsh-remedy-core@0.4.20`（latest）。
> 公开仓库 CI 绿，release `v0.1.0` … `v0.4.20`。五十四补丁**全部 `verified`、0 `tested`**（R70 升 7 条 `llm/stream`，R71 升 5 条 `cli`，R72 用一份构建/宿主见证升余下 33 条）。
> **字节余量（下一轮的第一个约束）**：plugin **81 589 / 83 000（1 411 B；CLI 半边 43 B）**、core **97 717 / 104 000（6 283 B）**、
> registry **61 981 / 68 000（6 019 B —— 三轮都靠压散文付清；新记录仍按 P-0032 先压缩，不抬 cap）**。
> **平台边界：Windows 与 Linux 实测（同一棵树、同一组数），macOS 未实测**；P-0038 的 `/Users` 形状在 Linux 上是字符串，CI 里有一个 `verify (macos, node 24)` job。
> **本目录不是 git 根**：提交在 `..`（容器），公开仓库由 `git subtree split --prefix=dsh-remedy` 切出。

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
│   ├── record_prestep_enter.mjs       # agent/pre-step 的 enter 分支实测 → prestep-enter-*（R53）
│   ├── record_linux_r53.mjs           # Linux 半边证据 → live-linux-*（没重测的项记 null + 原因）
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
