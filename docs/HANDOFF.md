# HANDOFF — dsh-remedy

> **下一会话从 `dsh-remedy/` 开始。** 读本文件 → `PROJECT_RULES.md` → `AGENTS.md` 即可开工。
> 本目录是**公开仓库根**；`dsh-triage/` 在父目录，是另一个项目，不属于本仓库。

## 三十秒状态（2026-11-10）

| 项 | 值 |
|---|---|
| 版本 | `dsh-remedy@0.1.1`（npm `latest`）；`dsh-remedy-core@0.1.0` |
| 补丁 | **P-0001 `verified`**（headless + 桌面两次真机） |
| 基线 | **97 tests / 5 gates / `--mutate` 5-5** |
| 公开仓库 | <https://github.com/jjjjjjjjnnjnn/dsh-remedy> · CI green · releases `v0.1.0` / `v0.1.1` |
| 容器 HEAD | `9811c1f`，working tree clean |
| 装机验收 | 空目录 `npm install dsh-remedy@0.1.1` → `dsh-remedy verify` **5/5** |
| 下一件事 | 主线 **P-0002**；可选先把桌面 profile 从 0.1.0 tarball 换到 0.1.1 |

## 五分钟检查

在本目录直接跑（**不要** `cd dsh-remedy`）：

```powershell
pnpm install
pnpm run verify                  # build → typecheck → test → gate
node scripts/gate.mjs --mutate   # 5 门都必须红
node packages/plugin/dist/cli.js verify   # OK 5 fixture(s)
npm view dsh-remedy version      # 0.1.1
```

`git` 要注意：本目录不是 git 根。

```powershell
git -C .. rev-parse --show-toplevel   # ...\DSH-Addition
git -C .. log --oneline -3
```

任何一条不是绿的，先修它，再读下面的批次。

## 仓库坐标（重要）

- **公开仓库 = 本目录**，由 `git subtree split --prefix=dsh-remedy` 从容器仓库切出。
- **提交发生在容器根**（`DSH-Addition`），不是本目录；`git status` 请用 `git -C ..`。
- 推送公开仓库：

  ```powershell
  git -C .. branch -D public-remedy
  git -C .. subtree split --prefix=dsh-remedy -b public-remedy
  git -C .. push https://github.com/jjjjjjjjnnjnn/dsh-remedy.git public-remedy:main
  ```

- 容器 `main` **没有**推到 `dsh-triage` 远端（推上去会破坏那个仓库的根布局）。不要顺手推。
- `dsh-triage/` 只是同级项目，规则以它自己的 `AGENTS.md` 为准。

## 当前批次（R5 → R1）

**R5（2026-11-10）· 0.1.1 已发布，陌生人安装验收通过。**

- 0.1.0 的 tarball 没带 `data/fixtures`，空目录装包后 `dsh-remedy verify` 退出 3 —— 已发布产物的真实缺陷。
- 0.1.1 用 `prepack`（`scripts/sync_fixtures.mjs`）把夹具打进 `fixtures/`，CLI 同时支持
  “安装副本”和“源码检出”两种路径；`tests/unit/fixtures-sync.test.ts` 钉住字节一致性。
- 发布 `dsh-remedy@0.1.1`（core 仍 `0.1.0`）。空目录 `npm install` 后 `verify` **5/5**。
- 第一份 0.1.1 取证 `publish-2026-11-10T00-10-00.000Z.json` 是**红**的：registry 副本在
  记录后几秒才出现。红产物保留、不编辑；新 stamp `publish-2026-11-10T06-40-00.000Z.json`
  为 `ok: true`。
- Release：`v0.1.0`、`v0.1.1` 都在 GitHub 上。

**R4（2026-11-09）· npm 0.1.0 已发布。**
npm 账号没有 `@dsh-remedy` organization（`Scope not found`），core 改成无 scope 的
`dsh-remedy-core`；插件本来就是 `dsh-remedy`。公开仓库创建、topics、私密漏洞报告、CI 全部就位。

**R3（2026-11-09）· 桌面 profile 挂载 + App 重启。**
桌面进程 **39 条流 / 2 次粘连 / 2 次修复 / 0 未修复**；证据
`data/results/live-desktop-2026-11-09T19-10-00.000Z.json`。答案后人工停止，
`turn_end=aborted` 与 `turn_note` 如实记录。

**R2（2026-11-09）· P-0001 升 `verified`。**
headless `remedy-live` 第 2 次运行命中：10 条流 / 1 次修复 / 整轮 `completed`；
证据 `data/results/live-2026-11-09T17-00-00.000Z.json`。

**R1（2026-11-09）· 首个补丁 P-0001 落地。**
`llm/stream` 包装器、切分器、CLI、4 门；当时状态 `tested`。

## 下一位 agent 的第一件事

主线和两个清账项，按顺序做：

**A. 主线：P-0002。** 选一个已有实测签名的缺陷（不要凭感觉），按固定顺序落地：

1. `docs/patches/P-0002-*.md` 写症状、机制（文件/行）、反证、边界；
2. `packages/core/src/registry.ts` 加 `P-0002`，`status: 'drafted'`；
3. 先写负对照测试，再写实现；
4. 真机跑过才允许 `verified`，产物放 `data/results/live-*`；
5. `record_patch_registry` → `gate` → `gate --mutate` → 同步 `audit/patch_ledger.json` 与 HANDOFF。

**B. 清账：桌面 profile 换 0.1.1。** 运行时代码与 0.1.0 相同，换是为了“装的就是发的那一份”：

```powershell
dsh plugin --profile desktop add .tmp/pack/live5/dsh-remedy-0.1.1.tgz
# 然后重启 DeepSeek Harness
```

**C. 可选：把 `agent/request-error` 的 retry 兜底做成可观测**（现在默认 0，只在配置里存在）。

验收：

1. `pnpm run verify` 绿；`node scripts/gate.mjs --mutate` 5/5 红；
2. 新补丁的证据/守卫路径都能解析，`verified` 必须有 `data/results/live-*`；
3. 对外文字只走 `docs/copy` 通道，`node scripts/gate_copy.mjs` 绿。

## 证据索引（`data/results/`）

| 文件 | 状态 | 说明 |
|---|---|---|
| `live-2026-11-09T17-00-00.000Z.json` | 绿 | headless 真机：10 流 / 1 修复 / `completed` |
| `live-desktop-2026-11-09T19-10-00.000Z.json` | 绿 | 桌面真机：39 流 / 2 修复 / `aborted`（人工停止） |
| `patch-registry-2026-11-09T19-15-00.000Z.json` | 绿 | 当前注册表快照（最早两份保留为历史） |
| `publish-2026-11-09T20-00-00.000Z.json` | 绿 | 0.1.0 发布（core + plugin） |
| `publish-2026-11-10T00-10-00.000Z.json` | **红（保留）** | 0.1.1 副本延迟，记录时还看不到 |
| `publish-2026-11-10T06-40-00.000Z.json` | 绿 | 0.1.1 settled：core 0.1.0 / plugin 0.1.1 |

每个 `.json` 都有同名 `.sha256`。红产物不编辑，用新 stamp 重记。

## 台账

| 问题 | 答案在 |
|---|---|
| 现在有哪些补丁？ | `packages/core/src/registry.ts` → `PATCHES` |
| 某个补丁的证据和守卫？ | `audit/patch_ledger.json` |
| 这一步 review 过吗？ | `audit/step_reviews.json` |
| 哪里还看不见？ | `audit/blind_spots.json`（`BS-07` / `BS-09` / `BS-10` 值得先读） |
| 谁写的代码？ | `audit/AI_DISCLOSURE_LOG.md` |
| 对外文字是谁写的？ | `docs/copy/manifest.json`（agy + `gemini-3.8-flash-high`） |
| 门禁为什么红？ | `node scripts/gate.mjs`，失败行会点出 check id |

## 已知坑

| 坑 | 说明 |
|---|---|
| 本目录不是 git 根 | 提交/推送在 `..`（容器）；公开仓库靠 `subtree split` |
| `llm/stream` 是同步 waterfall | 监听器不能写成 `async`，否则流被包成 Promise，报 `stream is not async iterable`。`agent/request-error` 相反，是 await 的 |
| headless profile 的 `credentials` 默认 disabled | profile 的 `cordis.patch.yml` 要写 `- id: credentials` + `disabled: false`，否则 `MISSING_CREDENTIAL` |
| 会话日志是多帧 zstd | `zstdDecompressSync` 只解第一帧；用 `decompressSessionLog` |
| headless 不写 `assistant/attempt` | live 产物的 `session.fused_calls` 会是 0；修复靠 journal 计数 + 合成 id 证明（`BS-07`） |
| 桌面 journal 覆盖整个进程 | 2 次修复可能跨 2 个会话；artifact 的 `journal_scope` 写明（`BS-09`） |
| registry 副本会延迟 | 发布后 `record_publish` 可能先红；等约 5 分钟用新 stamp 重记（`BS-10`） |
| 适配器不发 `block-end` | 实测序列 `block-start → tool-call-delta* → usage → finish{error}`；修复点必须在 `finish` |
| `retryPolicy` 不是修复 | 加 `MALFORMED_RESPONSE` 只是再撞一次；默认 `retryOnMalformed: 0` |
| 消息回退是英文 | `Received arguments:` 本地化后失效；delta 缓存路径仍有效 |
| 合成 id 不是稳定身份 | `<id>#remedy-N` 只用于本轮追踪 |
| 截断与粘连不同 | `finish{kind:'max-tokens'}` 一律不修 |
| 桌面 UI 自动化 | App 用 `--remote-debugging-port=9222` 重启；`Input.insertText` + Enter 发任务，“新建会话”按钮不一定存在 |
| 门禁依赖构建 | `gate_registry` / `gate_namespace` 要读 `dist/`；`--fast` 会跳过它们 |

## 发布流程（0.1.x → 下一个版本）

1. 改代码 + 测试；`pnpm run verify`；`node scripts/gate.mjs --mutate`。
2. bump **plugin** 版本（core 没改就不 bump，避免重复发）。
3. 手动发布（需要 npm OTP；token 不绕过 2FA）：

   ```powershell
   pnpm --filter dsh-remedy publish --access public --no-git-checks
   ```

4. `node scripts/record_publish.mjs --stamp <ISO> --retries 3`；红产物保留，再记一次。
5. 空目录验收：`npm install dsh-remedy@<ver>` → `npx dsh-remedy verify`。
6. 事实包若变 → 重新生成全部 copy（8 个文件）→ `node scripts/gate_copy.mjs`。
7. 在容器提交 → `subtree split` → 推送 → `gh release create v<ver> --notes-file ...`。

**永远不要**把 OTP、token、未脱敏 session 写进仓库或 artifact。

## 明确边界

- 桌面 profile 里仍是 0.1.0 tarball（运行时相同；换不换不影响行为，但影响“装=发”）。
- 容器 `main` 未推 `dsh-triage` 远端。
- npm 上的 `0.0.0-stage` 是发布流程的占位版本，不是 `latest`。
- 对话里出现过的两个 npm token 应作废；仓库与 artifact 里没有它们。
- P-0002 尚未开始；`agent/request-error` 的 retry 仍默认关闭。
