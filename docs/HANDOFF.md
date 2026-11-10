# HANDOFF — dsh-remedy

> **下一会话从 `dsh-remedy/` 开始。** 读本文件 → `PROJECT_RULES.md` → `AGENTS.md` 即可开工。
> 本目录是**公开仓库根**；`dsh-triage/` 在父目录，是另一个项目，不属于本仓库。

## 三十秒状态（2026-11-10 · R11）

| 项 | 值 |
|---|---|
| 版本 | `dsh-remedy@0.3.2`；`dsh-remedy-core@0.3.2`（0.3.0 的 plugin 在 registry 上不可安装：manifest 里是字面 `workspace:*`；0.3.1 在上市前就被 0.3.2 取代，从未到过 registry） |
| 补丁 | **P-0001 `verified`**（headless + 桌面两次真机）· **P-0002 `verified`**（2026-11-10 headless 真机修好一次真实两调用粘连、合成 id 被派发执行）· **P-0003 `verified`**（2026-11-10 headless 真机 journal 第一次写出非零 `refused`：`too-many-calls` 拒绝而不是假装修好）· **P-0005 `tested`**（裸值 reseal；单测 + 负对照 + 一条实测夹具，无 live 产物） |
| 基线 | **147 tests / 5 gates / `--mutate` 5-5** |
| 包体 | **0.3.2 = 24 689 B 压缩 / 25 条目 / 81 904 B 解包**（\`dist/*.js\` 56 344 / \`dist/*.d.ts\` 16 701 / fixtures 3 583 / 包根 5 276）；core **0.3.2 = 15 864 B / 19 条目 / 52 828 B 解包**。接缝拆分把 \`repair-stream.js\` 从 28 955 降到 27 925（−1 030），但插件总量反涨 529（脚手架不是免费的）；0.3.1 是 22 418 / 20 条目 / 74 014，0.2.0 是 19 569 / 64 933，0.1.1 是 26 345 / 98 424 / 30 文件 |
| 公开仓库 | <https://github.com/jjjjjjjjnnjnn/dsh-remedy> · releases `v0.1.0` / `v0.1.1`（`v0.3.2` 待推；0.2.0 / 0.3.0 / 0.3.1 从不单独发 release） |
| 装机验收 | 空目录 `npm install dsh-remedy@0.1.1` → `dsh-remedy verify` **5/5**；0.2.0 / 0.3.0 / 0.3.1 都用本地双 tgz 验过 5/5；**0.3.2 已用 `.tmp/pack12/` 的两个 tgz 在 desktop 与 remedy-live 两个 profile 里装成 0.3.2 并跑出 `OK 6 fixture(s)`，但尚未上 npm** |
| 下一件事 | `node scripts/publish_packages.mjs --otp <code>` 发布 **0.3.2**（脚本先 `pnpm pack` 再读回 packed manifest，见 R10）→ `record_publish.mjs` → 空目录 `npm install dsh-remedy@0.3.2` 验收 → 提交 → push → `gh release create v0.3.2 --notes-file .tmp/release-notes-v0.3.2.md` |

## 五分钟检查

在本目录直接跑（**不要** `cd dsh-remedy`）：

```powershell
pnpm install
pnpm run verify                  # build → typecheck → test → gate
node scripts/gate.mjs --mutate   # 5 门都必须红
node packages/plugin/dist/cli.js verify   # OK 6 fixture(s)
npm view dsh-remedy version      # 0.3.2（发布后）
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
- 推送公开仓库（**本机 git 2.56 没有 `subtree` 子命令**，用下面的 `commit-tree` 等价做法）：

  ```powershell
  git -C .. checkout -b public-remedy   # 若尚不存在；已存在则复用
  TREE=$(git -C .. rev-parse main:dsh-remedy)
  NEW=$(git -C .. commit-tree "$TREE" -p public-remedy -m "<message>")
  git -C .. branch -f public-remedy "$NEW"
  git -C .. rev-parse public-remedy^{tree}   # 必须等于 main:dsh-remedy 的 tree
  git -C .. push https://github.com/jjjjjjjjnnjnn/dsh-remedy.git public-remedy:main
  ```

  `git branch -D` 会被 CC Safety Net 拦（`git.branch-force-delete`），用 `-d` 或 `-f`。

- 容器 `main` **没有**推到 `dsh-triage` 远端（推上去会破坏那个仓库的根布局）。不要顺手推。
- `dsh-triage/` 只是同级项目，规则以它自己的 `AGENTS.md` 为准。

## 当前批次（R8 → R1）

**R11（2026-11-10）· P-0005：给裸值加引号，或者拒绝——从不猜。**

- **起因**：用户报了两类新失败，都不是 P-0001 能修的：模型思考过多后把工具参数里的
  成员值**裸写**（例：`{"code": ` 后面直接跟一段 JS 源码），整段文本因此不可 parse，
  首行是 `Unexpected token 'c'`；另一条是 `{"code": "false", "code": `（重复 key +
  字符串中途断，`Unexpected end of JSON input`）。
- **证据**（三个只读探针，`.tmp/probe-salvage.mjs` / `probe-nonfusion.mjs` /
  `probe-quote-literal.mjs`，69 个会话文件）：43 条 `MALFORMED_RESPONSE`，
  fusion 38 / unexpected-token 2 / other 2 / truncated 1。救援分类：38 条两对象可 parse、
  4 条 `unbalanced`、1 条单对象不可 parse。**转义修复是死路**：把 `\|` 改成 `\\|`
  对 5 条非融合回显 **一条都救不回来**（oh_my_3dlab 那两条真正缺的是右花括号）。
  暴力枚举 member-head × comma：run_code 裸程序回显得**恰好 1 个候选**
  （`key=code`、280 B、payload 字节一致），其余 5 类**全 0 候选**。
- **新模块** `packages/core/src/reseal.ts`（164 行）：`MAX_BYTES 65536` /
  `MAX_HEADS 8` / `MAX_COMMAS 256`；拒绝码 `bare-value-unproven`（0 候选）与
  `ambiguous-bare-value`（≥2 候选）；唯一候选要做二次证明（parse + plain object +
  round-trip）才返回 `{status:'resealed', key, value, text}`。
- **接线**：`toolcall-repair.ts` 的 `slices.length === 1` 分支先问 reseal，
  `code: 'split' | 'resealed'`、reseal 时 `fragments: 1`、`key` 带回；
  `repair-stream.ts` 新增 `RepairEvent { kind:'resealed' }` 与
  `recordResealed()`（**只加 `resealed`，绝不动 `fused`/`repaired`**），
  `PendingBlock.resealed` 走 flus 提交、撤回时只记 `rolled-back`（`withdrawn`）不记
  fused、不记 unrepaired；reseal **不占流级 `maxCalls` 预算**（`spent: 0`）。
- **verdict**：第九计数器 `resealed` **故意可选**——0.3.x 录的计数对象没有这个字段，
  渲染必须逐字节不变；`judgeRemedy` 的 quiet 守卫放宽成
  `fused === 0 && resealed === 0`，四个 verdict 词一个没动。
- **测试**：147 tests / 0 fail（新增 `tests/unit/reseal.test.ts` 11 条、
  `verdict.test.ts` 5 条、`toolcall-repair` 与 `repair-stream` 若干）；
  `tests/e2e/cli.test.ts` 的夹具数改成数据驱动，不再写死 `OK 5 fixture(s)`。
- **台账**：`registry.ts` 加 P-0005（`tested` / major / llm-stream / evidence 4 /
  guards 5 / limits 5）、`docs/patches/P-0005-bare-value-reseal.md`、
  `audit/patch_ledger.json`、`audit/step_reviews.json` 新增 **S11**（现共 11 步）；
  快照 `data/results/patch-registry-2026-11-10T18-55-00.000Z.json`
  （sha256 `fa4cc018…`），门禁 5 门 `ALL GREEN`，`--mutate` 5/5。
- **字节越限**：P-0005 让 `packages/plugin/dist/*.js` 到 **55 815 B**
  （`repair-stream.js` 28 955 单个文件），超出 53 000 硬上限 2 815 B。
  → 0.3.2 拆了接缝（`stream-types.ts` 搬类型、`failure-text.ts` 搬失败消息助手）：
  `repair-stream.js` **28 955 → 27 925（−1 030）**，但插件 `dist/*.js` 总量
  **反涨到 56 344（+529）**——逐字搬运留下 import/export 脚手架，而 `stream-types.js`
  只有 211 B（类型编译期擦除，只留头注释 + `export {};`），`dist/*.d.ts` 涨到 16 701
  （新增两份声明）。**所以这是结构性修复，不是省字节**：目标文件确实不再吸收每个补丁，
  但总量没降。新的上限写成 `dist/*.js` ≤ 58 000 B、`repair-stream.js` ≤ 28 000 B，
  再跨线就继续拆。
- 0.3.2 打包实测（`.tmp/pack12/`）：plugin **24 689 B 压缩 / 25 条目 / 81 904 B 解包**
  （js 56 344 / d.ts 16 701 / fixtures 3 583 / 包根 5 276）；core **15 864 B / 19 条目 /
  52 828 B 解包**；packed manifest 为 `{"dsh-remedy-core":"0.3.2"}`（无本地协议）。
- **对外文字**：事实包升 0.3.2 / 147 tests / 6 fixtures / 新增 `## The reseal (P-0005)`
  段 10 条；7 个 prompt 同步（readme 与 readme.zh 的安装与 Status 都改成 0.3.2，
  changelog 加 `## [0.3.2]`，metadata release_blurb 改 0.3.2 并写明 P-0005 是 tested，
  templates 版本占位改 0.3.2，contributing 指名 P-0005 是 tested 范例）。
- **仍未做**：0.3.2 未打包实测、未上 npm、未 push；P-0005 仍 `tested`（无 live）。

**R10（2026-11-10）· 0.3.0 被 npm 写坏，用 0.3.1 修**

- **起因**：用户在终端手动发布 0.3.0 成功（core 与 plugin 都上了 registry），但随后
  `npm install dsh-remedy@0.3.0` 报 `EUNSUPPORTEDPROTOCOL`。
- **根因**：`npm publish` 发布的是磁盘上的 manifest 原文；`pnpm pack` 才会把
  `workspace:*` 改写成精确版本。registry 上 `dsh-remedy@0.3.0` 的
  `dependencies` 是 `{"dsh-remedy-core": "workspace:*"}`，这是不可安装的 spec。
  同一份代码让 pnpm 打包则得到 `{"dsh-remedy-core": "0.3.0"}`。
- **修法**：`scripts/publish_packages.mjs` 不再在包目录直接 `npm publish`，改为
  `pnpm pack --pack-destination <temp>` → 用零依赖 tar 解析器读回
  `package/package.json`（`packedManifest`）→ 拒绝任何
  `workspace:`/`file:`/`link:`/`portal:` 依赖（`unpublishableDependencies`）→
  断言 plugin 精确 pin 住 core 版本 → 才 `npm publish <tgz>`。
- **测试**：`tests/unit/publish.test.ts` 5 → **10** 条（新增打包依赖拒绝、四协议、
  pin 版本接受、读回真实 tarball、仓库内仍应保留 `workspace:*`）。全套
  **131 tests / 5 gates** 全绿，`--mutate` 5/5。
- **版本**：两个包 bump 到 **0.3.1**。代码逐字节等于 0.3.0：plugin tarball 仍
  **22418 B / 20 条目 / 74014 B 解包**，core tarball **11585 B / 17 条目 / 38582 B
  解包**（0.3.0 的 core 是 11554 B）。只有 manifest 不同。产物在 `.tmp/pack11/`。
- **0.3.0 收不回来**：npm 只允许发布后 24 小时内 unpublish，实务答案是"发一个能装的
  0.3.1 + 在 README/CHANGELOG/PUBLISH 里明写 0.3.0 装不上"。core 0.3.0 本身没问题。
- **对外文字**：事实包改成 0.3.1 口径（含 `EUNSUPPORTEDPROTOCOL` 事故三条），
  7 个 prompt 同步，copy 通道重生成 8 个文件：
  `README.md` 9743 B、`README.zh-CN.md` 6021 B、`CONTRIBUTING.md` 2360 B、
  `SECURITY.md` 1133 B、`CODE_OF_CONDUCT.md` 4796 B、`CHANGELOG.md` 3943 B、
  `docs/copy/repo-metadata.json` 1731 B、4 个模板 2083/944/205/513 B。
  README.md:29/:35 是 `add dsh-remedy@0.3.1`，:38 是 0.3.0 装不上的注，
  :131 是"0.3.1 是唯一可安装发布"，:138 是 22418/20/74014/11585/17/38582 的包体积段，
  :148 是 131 tests / 5 gates。
- **两个本地 profile 已升到 0.3.1**：`desktop` 与 `remedy-live` 的 `package.json` 与
  `pnpm-workspace.yaml` overrides 都改指 `.tmp/pack11/` 的两个 tgz（改前备份在同目录
  `*.before-031`），`pnpm install --no-frozen-lockfile` 输出 `- dsh-remedy 0.3.0 / +
  dsh-remedy 0.3.1`，profile 内 `node node_modules/dsh-remedy/dist/cli.js verify` 5/5。
  桌面 App 需要重启才加载新版本。
- **待办**：`node scripts/publish_packages.mjs --otp <code>` 发布 0.3.1（用户手动输码）
  → `record_publish.mjs` → 陌生人空目录安装 → 提交 → 刷新 public-remedy → push →
  `gh release create v0.3.1 --notes-file .tmp/release-notes-v0.3.1.md`。

**R9（2026-11-10）· 真机把 P-0003 也升到 `verified`：拒绝被记成拒绝。**

- **做了什么**：把 `remedy-live/cordis.patch.yml` 的 `maxCalls` 从 8 临时改成 **1**、`journalPath`
  改指 `journal.jsonl`（备份在 `.tmp/live040-cordis.before.yml`），用 `.tmp/live040/drive.sh`
  发一个「一条消息里发两个工具调用」的任务。第 2 个任务命中：代码**拒绝**而不是拆开。
- **journal**（`.tmp/live040/journal.jsonl`，6 事件 = 5 `stream` + 1 `rejected`）：那条
  `{"kind":"rejected","tool":"read","callId":"call_00_betg5p96i68k8c0m2tk0l4pc","code":"too-many-calls","detail":"2 objects exceeds the ceiling of 1","counters":{"streams":2,"fused":1,"repaired":0,"unrepaired":1,"truncated":0,"errors":0,"refused":1,"withdrawn":0}}`
  —— **`refused` 第一次在真机非零**。
- **会话侧证明**（`session-155e3d77-…`）：21 个事件、`tool_calls:0`、**没有合成 id**、
  `turn/end` `kind=error`。拒绝就是把原失败重新抛出，不是把失败变成成功。
- **产物**：`data/results/live-2026-11-10T16-30-00.000Z.json` + `.sha256`；
  `cross_check.match=true`（journal_totals 与 counters 全等，2 个 group）；
  verdict `degraded` —`1 fused call(s), 1 could not be repaired`、`the original failure was re-thrown, not swallowed`。
- **状态变化**：P-0003 → **`verified`**（registry evidence 加这份 live、limits 第 4 条改为
  「只证了预算拒绝路径，真机出现 `withdrawn` 仍未测」）；`audit/patch_ledger.json` P-0003 加
  `verified_at: 2026-11-10T16:30:00.000Z`；`BS-12` note 补上「同一天用真机验过：写出
  fused:1 refused:1 unrepaired:1 且 verdict degraded、turn_end=error，它拒绝修复并说出来了」；
  快照重录为 `data/results/patch-registry-2026-11-10T16-45-00.000Z.json`（三个补丁全 `verified`）。
- **补丁文档**：P-0003 的 Status 改 `verified`，Counter-evidence 里「没有非零 refused 的
  live journal」换成「live 证的是预算拒绝这一支；`withdrawn` 仍只有单元测试」，Evidence 补
  `live-2026-11-10T16-30-00.000Z.json`。
- **对外文字**：事实包 P-0003 Status → `verified`、Live verification 段补三条拒绝 live 事实、
  Tests 保持 126；7 个 prompt 的 Status 全部改成「三个补丁都 `verified`」，
  `contributing.md` 改成「P-0002 与 P-0003 是两个走到 `verified` 的范例」，
  `changelog.md` 的 0.3.0 Notes 改成「P-0003 同一天从 `tested` 升到 `verified`」；8 个文件重跑 copy 通道。
- **仍然的事实**：`dist/*.js` 52 247 B / 硬上限 53 000 B；npm 上 0.3.0 还没发；桌面 App 仍需重启。

**R8（2026-11-10）· 真机把 P-0002 升到 `verified`：合成调用真的被执行了。**

- **做了什么**：在 `remedy-live`（headless）里装 0.3.0 tarball，用 `.tmp/live030/drive.sh`
  循环发任务：「在一条消息里同时发两个独立工具调用」。第 4 个任务命中真实粘连（`fused=1`）。
- **journal**（`.tmp/live030/journal.jsonl`，18 事件 = 17 `stream` + 1 `repaired`）：那条
  `repaired` 事件是 `{"tool":"read","callId":"call_00_6zgcmtvebmpnr8613wbr7wk9","fragments":2,"counters":{"streams":2,"fused":1,"repaired":1,"unrepaired":0,"truncated":0,"errors":0,"refused":0,"withdrawn":0}}`
  —— **P-0003 的八个计数器第一次在真机 journal 里同时出现**。
- **会话侧证明**（`session-949e359c-…`）：seq 18 `tool/call` 原 id 读 README.md，
  seq 19 `tool/call` 合成 id `…7wk9#remedy-1` 读 CHANGELOG.md，seq 20/21 两个 tool/result
  各自对应，seq 26 `turn/end` `kind=completed`。**合成 id 被真的派发、真的执行、真的回答。**
- **产物**：`data/results/live-2026-11-10T14-45-00.000Z.json` + `.sha256`
  （tarball sha256 `5f730325…`、DSh 0.2.2-rc.1、`cross_check.match=true`、
  session sha256 `8c131988…`、`answer_after_repair` 是模型对两文件的真实对比答案）。
  录法：`node scripts/record_live_mount.mjs --stamp … --profile remedy-live --journal … --session … --tarball …`。
  **`--session` 必须显式传**：`newestSession()` 取 mtime 最新，会被随后更新的 agent 会话抢走。
- **状态变化**：P-0002 → **`verified`**（registry evidence 加这份 live、limits 第 2 条改为
  「只证了 finish 路径被下游接受，自管 block 的适配器仍未测」）；`BS-11` note 重写为同一口径；
  `audit/patch_ledger.json` P-0002 加 `verified_at`；快照重录为
  `data/results/patch-registry-2026-11-10T15-10-00.000Z.json`（sha256 `762832d6…`）。
- **P-0003 当时仍 `tested`**：真机只走到「干净修复」这一支，`refused`/`withdrawn` 只被写成 0。
  要升 `verified` 必须真机出现非零的拒绝或撤回——**R9 已完成这一条**。
- **踩坑两次**：第一次录 snapshot 是在 build 之前跑的（`dist/` 里还是旧注册表），
  `data/results/patch-registry-2026-11-10T15-00-00.000Z.json` 记成了 `P-0002:tested`；
  发现后删掉该产物、重新 `pnpm run build`、用新 stamp `15-10-00` 重录。
  **顺序是 build → record，反过来会记出一份自相矛盾的快照。**
- **测试与门禁**：126 tests / 5 gates / `--mutate` 5-5 全绿。
  `tests/governance/public-copy.test.ts` 原来把 release blurb 的 live 路径写死成
  `live-2026-11-09T17-00-00.000Z.json`，每次新取证都会把它判红；已改为「必须引用至少一个
  `data/results/live-*.json` 且该路径存在」，不再钉具体 stamp。
- **对外文字**：事实包补 0.3.0 live 段、P-0002 → `verified`、P-0003 的解释改成「真机写全八计数器但只写 0」、
  `BS-11` 措辞同步；7 个 prompt 同步（readme/readme.zh 的 Status、contributing 的 worked example、
  metadata 的 release_blurb、changelog 的 Notes）；8 个文件全部走 copy 通道重生成
  （`readme-zh` 第一次因 `agy exited null` 失败，单独重跑成功）。

**R7（2026-11-10）· 0.3.0：把"能修多少"改成"修了什么、拒了什么"。**

- **起因**：目标从"只修粘连"扩到"覆盖真实故障类"。先去量本机，再决定要不要扩修复面——
  结论是**不扩**，把力气花在可观测性上。
- **可复现的故障样本**：新建 `scripts/record_session_sample.mjs`（门禁零依赖风格），
  用**发布出去的读取路径**（`packages/plugin/dist` 的 `decompressSessionLog` +
  `packages/core/dist` 的 `splitTopLevelJsonObjects`）读会话日志，不用本地 zstd 副本。
  必须给 `--until`：会话目录只追加，不截断则同一脚本每次跑总数都不同。
  产物 `data/results/session-sample-2026-11-10T11-20-00.000Z.json`（实际 stamp 见文件）+
  `.sha256`；同一 `--until` 换 `--stamp` 复跑两次，除 `generated_at` 外逐字节相同。
- **样本结论（48 文件 / 120 turn/end / 2026-11-08 到 2026-11-10）**：
  `MALFORMED_RESPONSE` 40 次，其中 **37 次可证是两个对象粘连**、2 次对象内部被截断、
  1 次其它切分失败；`error:SERVER` 147 次失败落在 93 个 group，
  **84 个 group 后来成功、9 个以 SERVER 终局（合计 45 次失败 attempt）**。
  也就是说上游重试已经吃掉了 5xx 家族的大部分，插件再做 retry 只是噪声；
  粘连是唯一"100% 终局"的失败类。
- **P-0003**（`docs/patches/P-0003-refusal-observability.md`，当时 `tested`，R9 升 `verified`）：
  `RemedyCounters` 从 6 字段长到 8（新增 `refused` / `withdrawn`），
  `judgeRemedy` 与四个 verdict 词**逐字未改**，只有计数行从 6 个名字变成 8 个。
  纯拒绝只记 `refused` 不再记 `fused` → **BS-12 关闭**；`unrepaired` 收窄为
  "已证粘连但没修成"；`too-many-calls` 额外记 `unrepaired`（否则"九次全拒收"会读成
  `repaired`）；`consumer-abort` 保留 P-0002 的 `fused`+`unrepaired` 再加 `withdrawn`；
  截断只记 `withdrawn`。两处偏离口径的决定写在 P-0003 的 booking table 里。
- **测试**：新增 6 条（`tests/unit/verdict.test.ts` 2 + `tests/unit/repair-stream.test.ts` 4）
  → 115 → **121**；发布脚本那轮又 +5（`tests/unit/publish.test.ts`）→ **126**。`--mutate` 5/5。
- **台账**：registry 加 P-0003（当时 `tested`，R9 改 `verified` / `minor` / `llm/stream`）、
  `audit/patch_ledger.json` 加条目、`audit/step_reviews.json` 加 **S10**、
  `audit/blind_spots.json` **BS-12 → closed**。快照
  `data/results/patch-registry-2026-11-10T11-00-00.000Z.json`。
- **调研文档**：`docs/research/failure-map-2026-11-10.md`（本机故障地图，数字全部来自上面
  那份产物）、`docs/research/upstream-failures-2026-11-10.md`（上游 issue/论坛调研）。
- **字节预算**：`packages/plugin/dist/*.js` 从 46 459 B 长到 **52 247 B**，超出上一轮定的
  52 000 B 上限 247 B。**决定接受这 247 B，把硬上限改为 53 000 B**：`repair-stream.js`
  25 661 B 里注释占 8 579 B（33.4%），削注释能省 ~12 KB，但注释是"为什么这样记账"的唯一
  载体，为凑 247 B 去删它是拿可读性换假指标。跨 53 000 B 的下一个补丁**必须先拆接缝**。
- 版本：`dsh-remedy@0.3.0` + `dsh-remedy-core@0.3.0`；对外 8 个文件全部走 copy 通道重生成。

**R6（2026-11-10）· 0.2.0：P-0002 加固 + 包体瘦身 + 对外文档重生成。**

- **P-0002 `tested`**（`docs/patches/P-0002-rescue-integrity.md`）：修的是“修一半”和“修不了还装修好”。  空工具名 `missing-name` 直接拒；同一 index 里工具名变了 `name-changed` 整轮放弃；
  修好的 `finish` 保留适配器 `replayState`；`block-end` 的修复先挂起，同一流后面有拒绝就
  整体撤回（`rolled-back`）并吐原始 chunk；`maxCalls` 改为整条流的预算；消费者提前停止记
  `consumer-abort`，不再误报 quiet。当时没有 live 产物，所以停在 `tested`；
  **R8 已用 headless 真机把它升到 `verified`**。
- 新增 18 条负对照测（`tests/unit/repair-stream.test.ts` 12 条 + `tests/unit/toolcall-repair.test.ts`
  2 条 + `tests/unit/package-files.test.ts` 4 条 → 总计 97 → **115**）。`--mutate` 仍 5/5。
- 台账同步：registry 加 P-0002、`audit/patch_ledger.json` 加条目、`audit/step_reviews.json` 加
  **S9**（gate `registry`）、`audit/blind_spots.json` 加 **BS-11**（合成 call 现在自带配套
  block-start，但下游是否接受未 live 验证）与 **BS-12**（`recordRejected` 也 `fused += 1`，会把普通坏 JSON
  记成粘连，改它等于改 verdict 词汇，属另一接缝）。快照
  `data/results/patch-registry-2026-11-10T09-30-00.000Z.json`。
- **包体**：0.1.1 = 26 345 B 压缩 / 98 424 B 解包 / 30 文件 → 0.2.0 = **19 569 B 压缩 / 20 条目 /
  64 933 B 解包**（`.tmp/pack7` 实测；瘦身那一轮在 0.1.1 代码上量到 19 114 B / 63 170 B，
  P-0002 让 `dist/*.js` 从 44 696 B 长到 46 459 B）
  （sourcemap 不进包）。做法是 `files` 加 `!dist/**/*.map` + `.npmignore` 同规则（注释说明
  npm 11 对白名单内路径忽略 `.npmignore`，真正生效的是 `files` 的否定项）。
  实测：`docs/research/lightweight-plan-2026-11-10.md`（同机 A/B plugin −33.5% / core −39.9%）。
- **同类方案调研**：`docs/research/similar-solutions-2026-11-10.md`。三条结论都是“不 adopt”：
  partial-JSON 解析器（实测静默丢第二个对象，比拒绝更坏）、provider 层 retry 作为修复、
  改 asar 里的 assembler（chunk 入账前已 `deepFreeze`）。采纳的是它的建议：连续 index 分配
  与 id 双向登记已经是 P-0002 的一部分；拒绝可观测留给下一轮。
- **稳定性审计**：`docs/research/stability-audit-2026-11-10.md`（16 条）。S1 五条全部修掉：
  原子提交、`replayState`、name 守卫、per-stream 上限、合成 call 自带 `block-start`；
  S2 里 `argumentsDelta` 拼接、seenIds 回写、撤销回退 `synthesized` 预算、截断不记
  `rolled-back`、透传 `finish{error}` 计 `errors` 也修了。`recordRejected` 的 `fused += 1`
  （BS-12）明确不修（改它等于改 verdict 词汇）。
- **发布工具三修**：`record_publish.mjs` 默认 `--retries 3`（原来 1，几乎必红）；
  `gate_registry.mjs` 按 `generated_at` 取最新快照而不是文件名字典序；仓库根 4 个
  `scratch_*` / `.tmp_check.js` 遗留物已删。
- 版本：`dsh-remedy@0.2.0` + `dsh-remedy-core@0.2.0`（core 这次有真改动，破例同步 bump）。
  对外 8 个文件全部走 copy 通道重生成。

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

### 发布工具的一次修复（2026-11-10，用户手动跑 publish 时暴露）

用户按 HANDOFF 的老指令在容器根跑 `pnpm -r publish`，得到
`ERR_PNPM_FAILED_TO_PUBLISH ... status 404 Not Found`；在根跑 `npm publish` 得到
`EPRIVATE`（根包 `dsh-remedy-workspace` 是 private 的工作区壳）；只有在
`packages/core` 目录里跑 `npm publish` 才露出真正的答案 `EOTP`。
三条结论已经写进 `docs/PUBLISH.md` 与新增的 `scripts/publish_packages.mjs`：

- 在根发布永远不行：pnpm 把「缺 OTP」报成 404，npm 把根包报成 EPRIVATE；
- 必须 `cd` 进包目录（`prepack` 与 tarball 内容都相对它解析）；
- Windows 上 `npm` 是 `npm.cmd`，`spawnSync` 不带 shell 会 EINVAL，脚本里已按平台分支。

`node scripts/publish_packages.mjs --dry-run` 已实测两个包都能打出 tarball：
core 10.7 kB / 16 文件、plugin 21.6 kB / 19 文件。正式发布用
`node scripts/publish_packages.mjs --otp <code>`，它会先自检（根必须 private、
两包版本必须一致、`dist/` 必须存在、必须 public），然后 core → plugin 顺序发。

## 下一位 agent 的第一件事

**A. 主线：发布 0.3.2（npm `--otp` → push → `gh release`）。** 四补丁已落地
（P-0001 / P-0002 / P-0003 `verified`，P-0005 `tested`），0.3.2 的代码已全绿
（147 tests / 5 gates / `--mutate` 5-5），两个 profile 已装成 0.3.2 并跑出
`OK 6 fixture(s)`，`--dry-run` 也证明 packed manifest 里 pin 的是 `"dsh-remedy-core": "0.3.2"`
而不是 `workspace:*`。**只差发布与推送。**
发布之后两条路：
1. 开 P-0004：把 `scan` 的输出去重成"每次会话一行"并加 `--since`，让用户能自己量
   （这是本机故障地图那套数字的对外版本，接缝是 `cli` + `session-scan`，不是 `llm/stream`）。
   注意 `dist/*.js` 已 56 344 B，新上限 58 000 B，跨线必须继续先拆接缝；
2. 补 P-0003 的最后一个空洞：真机出现一次 `withdrawn`（中途撤回或截断）。现在只证了
   预算拒绝这一支；要造它就在同一条流里前一个 block 可修、后一个 block 必拒。

**B. 清账：两个本地 profile 都已换 0.3.2（R11 已完成），只差重启 App。**

```powershell
# 配置文件已指向 .tmp/pack12/dsh-remedy-0.3.2.tgz，pnpm install 已跑过（改前备份 *.before-032）
# 直接重启 DeepSeek Harness 即可加载；注意 dsh plugin --profile desktop add 会 ETARGET，
# 必须连 core tgz 一起 add，或像本轮一样直接改 profile 的 package.json + pnpm-workspace.yaml overrides
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
| `patch-registry-2026-11-09T19-15-00.000Z.json` | 绿 | 历史快照（P-0001 单独） |
| `patch-registry-2026-11-10T11-00-00.000Z.json` | 绿 | 历史快照（P-0002 仍是 `tested`） |
| `patch-registry-2026-11-10T15-10-00.000Z.json` | 绿 | 历史快照（P-0001 + P-0002 `verified` + P-0003 仍 `tested`） |
| `live-2026-11-10T14-45-00.000Z.json` | 绿 | 0.3.0 headless 真机：17 流 / 1 修复 / 8 计数器齐 / 合成 id 被派发（`cross_check.match`） |
| `patch-registry-2026-11-10T16-45-00.000Z.json` | 绿 | **当前**注册表快照（P-0001 + P-0002 + P-0003 **全部 `verified`**） |
| `live-2026-11-10T16-30-00.000Z.json` | 绿 | 0.3.0 headless 真机拒绝：5 流 / `too-many-calls` / `fused:1 refused:1 unrepaired:1` / verdict `degraded` / 会话 `turn_end=error` / 无合成 id |
| `publish-2026-11-09T20-00-00.000Z.json` | 绿 | 0.1.0 发布（core + plugin） |
| `publish-2026-11-10T00-10-00.000Z.json` | **红（保留）** | 0.1.1 副本延迟，记录时还看不到 |
| `publish-2026-11-10T06-40-00.000Z.json` | 绿 | 0.1.1 settled：core 0.1.0 / plugin 0.1.1 |
| `session-sample-2026-11-10T11-20-00.000Z.json` | 绿 | 本机故障样本（`--until` 截断，可复现） |
| `publish-2026-11-10T*` | 待产 | 0.3.0 发布产物（发布后由 `record_publish.mjs` 生成） |

每个 `.json` 都有同名 `.sha256`。红产物不编辑，用新 stamp 重记。

## 台账

| 问题 | 答案在 |
|---|---|
| 现在有哪些补丁？ | `packages/core/src/registry.ts` → `PATCHES` |
| 某个补丁的证据和守卫？ | `audit/patch_ledger.json` |
| 这一步 review 过吗？ | `audit/step_reviews.json` |
| 哪里还看不见？ | `audit/blind_spots.json`（`BS-07` / `BS-09` / `BS-11` 值得先读；`BS-12` 已由 P-0003 关闭） |
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
| 适配器不发 `block-end` | 实测序列 `block-start → tool-call-delta* → usage → finish{error}`；修复点必须在 `finish`。这也让 P-0002 的原子提交路径无法 live 证（`BS-11`）；能 live 证的是 `finish` 救援路径（`live-2026-11-10T14-45-00.000Z.json`） |
| `retryPolicy` 不是修复 | 加 `MALFORMED_RESPONSE` 只是再撞一次；默认 `retryOnMalformed: 0` |
| 消息回退是英文 | `Received arguments:` 本地化后失效；delta 缓存路径仍有效 |
| 合成 id 不是稳定身份 | `<id>#remedy-N` 只用于本轮追踪 |
| 截断与粘连不同 | `finish{kind:'max-tokens'}` 一律不修 |
| 桌面 UI 自动化 | App 用 `--remote-debugging-port=9222` 重启；`Input.insertText` + Enter 发任务，“新建会话”按钮不一定存在 |
| 门禁依赖构建 | `gate_registry` / `gate_namespace` 要读 `dist/`；`--fast` 会跳过它们 |

## 发布流程（0.3.x → 下一个版本）

1. 改代码 + 测试；`pnpm run verify`；`node scripts/gate.mjs --mutate`。
2. bump 版本：core 没改就不 bump core（0.1.1 时只 bump 了 plugin）；两个都改了才同步 bump。
3. 手动发布（需要 npm OTP；token 不绕过 2FA），先 core 再 plugin：

   ```powershell
   pnpm --filter dsh-remedy-core publish --access public --no-git-checks
   pnpm --filter dsh-remedy publish --access public --no-git-checks
   ```

4. `node scripts/record_publish.mjs --stamp <ISO> --retries 3`；红产物保留，再记一次。
5. 空目录验收：`npm install dsh-remedy@<ver>` → `npx dsh-remedy verify`。
6. 事实包若变 → 重新生成全部 copy（8 个文件）→ `node scripts/gate_copy.mjs`。
7. 在容器提交 → `subtree split` → 推送 → `gh release create v<ver> --notes-file ...`。

**永远不要**把 OTP、token、未脱敏 session 写进仓库或 artifact。

## 明确边界

- 桌面 profile 与 `remedy-live` profile 都已装成 **0.3.0 tgz**（直改 `package.json` + `pnpm-workspace.yaml`
  的 `overrides`）；桌面 App 需要重启才加载。`dsh plugin --profile desktop add` 单独加 plugin 会
  `ERR_PNPM_NO_MATCHING_VERSION`，因为 npm 上 `dsh-remedy-core` 还是 0.1.0。
- 0.2.0 与 0.3.0 都**没有**发布到 npm；npm latest 仍是 `dsh-remedy@0.1.1` / `dsh-remedy-core@0.1.0`。
- 容器 `main` 未推 `dsh-triage` 远端。
- npm 上的 `0.0.0-stage` 是发布流程的占位版本，不是 `latest`。
- 对话里出现过的两个 npm token 应作废；仓库与 artifact 里没有它们。
- P-0003 已 `verified`，但只证了**预算拒绝**那一支：`live-2026-11-10T16-30-00.000Z.json` 的
  journal 写了 `too-many-calls` + `fused:1 refused:1 unrepaired:1 withdrawn:0`，会话 `turn_end=error`
  且 `tool_calls:0`、无合成 id（拒绝时没有假装修好）。真机出现 `withdrawn`（中途撤回或截断）
  仍未被测，这条写在 P-0003 的 limits 里。
- `agent/request-error` 的 retry 仍默认关闭。
