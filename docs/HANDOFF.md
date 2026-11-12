# HANDOFF — dsh-remedy

> **下一会话从 `dsh-remedy/` 开始。** 读本文件 → `PROJECT_RULES.md` → `AGENTS.md` 即可开工。
> 本目录是**公开仓库根**；`dsh-triage/` 在父目录，是另一个项目，不属于本仓库。

## 三十秒状态（2026-11-12 · R18）

| 项 | 值 |
|---|---|
| 版本 | **`0.3.7` 已 bump、已打包实测、尚未发布**（两个包与根 `package.json` 都是 0.3.7；改了发射字节所以必须重发）；registry 上两包 `latest` 仍是 **`0.3.6`**（2026-11-11 发布；空目录从 registry 单装验过 `OK 6 fixture(s)`，产物 `data/results/publish-2026-11-11T17-35-00.000Z.json` 记 `ok: true`）。0.3.5 是上一个发布。0.3.0 的 plugin 在 registry 上不可安装：manifest 里是字面 `workspace:*`；0.3.1 在上市前就被 0.3.2 取代，从未到过 registry |
| 补丁 | **P-0001 `verified`**（headless + 桌面两次真机）· **P-0002 `verified`**（2026-11-10 headless 真机修好一次真实两调用粘连、合成 id 被派发执行）· **P-0003 `verified`**（2026-11-10 headless 真机 journal 第一次写出非零 `refused`：`too-many-calls` 拒绝而不是假装修好）· **P-0005 `tested`**（裸值 reseal；单测 + 负对照 + 一条实测夹具，无 live 产物）· **P-0004 `tested`**（scan 认 zstd + 目录 + `--since`，redaction 补三种路径形状；改的是离线读取器，live journal 永远证不了它）· **P-0006 `tested`**（scan 统计每一种 turn 结束方式并点名每个 error code；同样是离线读取器）· **P-0007 `tested`**（copy 通道：超过命令行上限的请求走 stdin、失败按原因命名；改的是构建侧，不动任何接缝）· **P-0009 `tested`**（窗口化扫描把每个会话的首行 `session` 头记录当成 unreadable：实测 78 文件 78 行；改为头记录用 `createdAt` 参与窗口；同样是离线读取器）· **P-0010 `tested`**（npm 页面与 CLI `USAGE` 都在用 0.3.3 之前的 `scan` 用法；两处改成同一条并加测试；改了发射字节所以付账方式是压缩四条命令说明）（窗口化扫描把每个会话的首行 `session` 头记录当成 unreadable：实测 78 文件 78 行；改为头记录用 `createdAt` 参与窗口；同样是离线读取器） |
| 基线 | **195 tests / 6 gates / `--mutate` 6-6** |
| 包体 | **已发布 0.3.6 = 29 445 B 压缩 / 29 文件 / 97 807 B 解包**（`dist/*.js` 67 997 / `dist/*.d.ts` 20 951 / fixtures 3 583 / 包根 5 276），core **0.3.6 = 19 247 B / 19 文件 / 63 408 B 解包**（`dist/*.js` 43 117 / `dist/*.d.ts` 16 994，shasum `76777609…`）：core 变大只因为多一条补丁记录。**已发布 0.3.5 = 29 448 B 压缩 / 29 文件 / 97 944 B 解包**（`dist/*.js` 67 908 / `dist/*.d.ts` 21 177 / fixtures 3 583 / 包根 5 276），core **0.3.5 = 18 723 B / 19 文件 / 61 553 B 解包**（`dist/*.js` 41 262 / `dist/*.d.ts` 16 994）：P-0008 只加 `scripts/gate_size.mjs`，`scripts/` 不进包，所以 plugin 的字节数与 0.3.4 相同、shasum 因 manifest 版本变了从 `5f20282e…` 到 `c1b1b431…`。**已发布 0.3.2 = 24 689 B 压缩 / 25 文件 / 81 904 B 解包**（`dist/*.js` 56 344 / `dist/*.d.ts` 16 701 / fixtures 3 583 / 包根 5 276）；core **0.3.2 = 15 864 B / 19 文件 / 52 828 B 解包**。**已发布 0.3.3 = 28 378 B 压缩 / 29 文件 / 94 769 B 解包**（`dist/*.js` 65 521 / `dist/*.d.ts` 20 389 / fixtures 3 583 / 包根 5 276），core **0.3.3 = 16 776 B / 19 文件 / 55 684 B 解包**。**已发布 0.3.4 = 29 448 B 压缩 / 29 文件 / 97 944 B 解包**（`dist/*.js` 67 908 / `dist/*.d.ts` 21 177 / fixtures 3 583 / 包根 5 276），core **0.3.4 = 18 202 B / 19 文件 / 59 864 B 解包**。两次拆接缝都是结构性修复不是省字节：0.3.2 把 `repair-stream.js` 28 955 → 27 925 而总量 +529；0.3.3 把 `cli.js` 16 640 → 8 503 而总量 64 539 → 65 521（+982） |
| 公开仓库 | <https://github.com/jjjjjjjjnnjnn/dsh-remedy> · releases `v0.1.0` / `v0.1.1` / `v0.3.2` / `v0.3.3` / `v0.3.4` / `v0.3.5` / **`v0.3.6`**（0.2.0 / 0.3.0 / 0.3.1 从不单独发 release） |
| 装机验收 | **0.3.6 从 registry 单装到空目录验过 `OK 6 fixture(s)`，并且这一次有产物：`data/results/install-acceptance-2026-11-11T19-30-00.000Z.json`（`ok: true`、三条命令的退出码与输出都在里面，脚本是 `scripts/record_install_acceptance.mjs`）**；两个 profile 已在 2026-11-11 换成 `.tmp/pack18/` 的 0.3.6（`.tmp/switch-profiles-036.mjs`，备份后缀 `before-036`），desktop 与 remedy-live 内 `node node_modules/dsh-remedy/dist/cli.js verify` 都回 `OK 6 fixture(s)`、两包都报 0.3.6。历史：0.3.2 / 0.3.3 / 0.3.4 / 0.3.5 各自从 registry 单装验过 `OK 6 fixture(s)`；0.2.0 / 0.3.0 / 0.3.1 只用本地双 tgz 验过 5/5；0.1.1 是 5/5 |
| 下一件事 | **发布 0.3.7**（改了发射字节，必须重发；registry 上仍是 0.3.6）：`npm whoami` → `node scripts/publish_packages.mjs --otp <code>` → `record_publish` → `record_install_acceptance --version 0.3.7` → `gh release create v0.3.7`。然后**一次**把事实包翻成「0.3.7 已发布」并重生成 11 个对外文件（不要分两轮），再把两个 profile 换成 `.tmp/pack19` 并重启桌面 App（它从 0.3.5 起就没重启过）。 |

## 五分钟检查

在本目录直接跑（**不要** `cd dsh-remedy`）：

```powershell
pnpm install
pnpm run verify                  # build → typecheck → test → gate
node scripts/gate.mjs --mutate   # 6 门都必须红
node packages/plugin/dist/cli.js verify   # OK 6 fixture(s)
npm view dsh-remedy version      # 0.3.6（0.3.7 已 bump、未发布）
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

## 当前批次（R18 → R1）

**R18（2026-11-12）· P-0010：npm 页面描述的是一个 0.3.3 之后就不存在的 CLI，而真机第一次在 0.3.6 上修好了粘连。**

- **起因（两件独立的事，同一批处理）**：
  1. **npm 页面在说假话**。`packages/plugin/README.md` 是 npm 展示的那一页，它写的
     `scan <session.jsonl> [--json] [--out <file>]` 与 CLI 自己的 `USAGE`
     （`scan <session.jsonl|session.v4.jsonl.zstd> [--json] [--out <file>]`）**都漏了目录、
     `--since`、`--max-files`** —— 这三样 P-0004 在 0.3.3 就已经上线。两条字符串都错了两个版本，
     而**没有任何门在看它们**：`gate_copy` 只覆盖仓库根的 11 个对外文件，
     `tests/governance/public-copy.test.ts` 是同一份清单，也没有任何测试跑过 `--help`
     或比较这两条字符串。这是 P-0004 / P-0006 的同一族缺陷第三次出现：**没有机制的断言会烂，
     而这次烂在陌生人第一眼看到的那一页上**。
  2. **0.3.6 从未被真机证过**。P-0001 的证据停在 2026-11-09 的 0.1.0/0.2.x 与桌面进程，
     而当前发布的是 0.3.6。一个只在旧 tarball 上修过东西的修复层，不是当前版本的性质。
- **修法 1（判据先行）**：先写 `tests/unit/cli-usage.test.ts`——它把两条字符串按空白归一后要求
  **相等**，并要求扫描行里出现 `--since`/`--max-files`/`--json`/`--out` 与目录形式；
  另一条拒绝旧的「只有单文件」形状回来。**它先红**（README 说 `session.jsonl`，USAGE 说
  `session.v4.jsonl.zstd`），然后才改两处文字。
- **字节账（关键约束）**：加长的 flag 列表必须自己付账。`dist/*.js` 当时 67 997 / 68 000，
  **只剩 3 字节**。付账方式不是拆文件，而是把四条命令说明从两行压成一行：
  `cli-args.js` **3 086 → 2 972**，插件总量 **67 997 → 67 883**。上限从「剩 3 字节」
  变成「剩 117 字节」，**没有放宽任何 cap**。
- **修法 2（真机）**：把 0.3.6 装进 `remedy-live`，把 journal 指向 `.tmp/live-r17/journal.jsonl`，
  连续 11 次要求「一条消息里发两个 `read` 调用」。**第 11 次命中了真实粘连**：
  journal 60 条 `stream` + 1 条 `repaired`，计数器
  `fused:1 repaired:1 unrepaired:0 truncated:0 errors:0 refused:0 withdrawn:0`；
  会话 `session-be170c33` 里 seq 18 是 `call_00_2n6gr905wxda0su0f6bsmkm5` 读
  `docs/copy/manifest.json`，seq 19 是 `…5#remedy-1` 读 `docs/copy/facts/public-repo-facts.md`，
  两条 `tool/result` 各自对应，`turn/end` 是 `completed`——**合成 id 在当前发布的 0.3.6 上被真的派发、真的执行**。
  产物 `data/results/live-2026-11-12T06-00-00.000Z.json`（verdict `repaired`，
  `journal_totals` 与 `counters` 交叉核对一致）；`P-0001` 的 evidence 加上这一份。
- **真机没做到的**：`withdrawn` 仍然空缺。用「前一个调用合法、后一个调用故意写坏 JSON」的
  12 次尝试**一次都没有粘连**——relay 的粘连是间歇性的，而模型拒绝输出语法坏的参数对。
  所以 P-0003 的 `withdrawn` 桶仍只有单测与夹具，事实包里已写明这一点。
- **台账**：`docs/patches/P-0010-cli-usage-truth.md`（Status `tested`、severity minor、
  surface `cli`、Depends on P-0004）；registry 加 P-0010（evidence 4 / guards 3 / limits 4）；
  `audit/patch_ledger.json` 加条目（`since: "0.3.7"`、无 `verified_at`）；
  `audit/step_reviews.json` 加 **S18**（gate `copy`，五轴齐）；披露日志加 R18 一行。
- **版本**：两个包与根 `package.json` bump 到 **0.3.7**（P-0010 改了发射字节，必须重新打包）。
  `--dry-run` 实测 exit 0：plugin `29.5 kB / 98.0 kB / 29 files / shasum 69087301…`、
  core `19.9 kB / 65.6 kB / shasum 41bad154…`。**0.3.7 未发布**，registry 上两包仍是 `0.3.6`。
- **对外文字**：事实包加 `## The CLI documentation (P-0010)` 段 6 条；`## Live verification`
  加 0.3.6 真机三条 + 一条 `withdrawn` 仍未测；`Tests: 195`；P-0003 段加一条
  「live 只证了预算拒绝与干净修复，没证中途撤回」；字节预算段补 P-0010 的付账方式。
  四个提示词（readme / readme.zh / changelog / metadata / contributing）同步成
  「P-0010 也是 `tested`」与「0.3.7 未发布、0.3.6 仍是 latest」，然后 11 个对外文件全量重生成。
- **实测**：`pnpm run verify` → **195 tests / 0 fail / 6 gates ALL GREEN**；
  `--mutate` → **6/6 CAUGHT**；`node packages/plugin/dist/cli.js verify` → `OK 6 fixture(s)`；
  `node packages/plugin/dist/cli.js --help` 打印的新用法与包内 README 逐字符相同。
  快照 `patch-registry-2026-11-12T08-30-00.000Z.json`（sha256 `d7062485…`，十补丁；07-45 与 07-00/07-30/07-40 都是中间态，已删）。
- **仍未做**：0.3.7 未发布（需要 OTP）；两个 profile 还装着 0.3.6（与 registry 一致，先不动）；
  桌面 App 仍未重启；`packages/*/README.md` 仍不在门禁覆盖范围内（新测试只守那一条 scan 行）。

## 当前批次（R17 → R1）

**R17（2026-11-11）· 收尾：0.3.6 发了，但对外文字、交接文档和三条台账停在了它前面。**

- **起因**：上一轮把 0.3.6 发到 registry（两包 `latest`、release `v0.3.6`、产物
  `publish-2026-11-11T17-35-00.000Z.json` 记 `ok: true`），但收尾只做了事实包的一半：
  `.tmp/regen-036-published.log` 只有两行 `WROTE README.md`，**11 个对外文件里只重生成 1 个**。
  于是 `pnpm run verify` 报 **192 tests / 1 fail**、`node scripts/gate.mjs` 报
  **1 GATE FAILED：copy**（10 个文件 `facts-current` 过期 + `numbers:readme-zh` 抓到 `21177`/`41262`
  两个新事实包里已不存在的数字 + `manifest-facts`）。公开仓库的 tree 与 `main:dsh-remedy` 相同，
  所以 GitHub 上的 README 仍在说「0.3.6 is prepared and not published yet」。
- **同轮发现的另外六处**：HANDOFF 三十秒状态第 10 行说「0.3.6 尚未发布」而第 16 行说发布链已走完；
  `AGENTS.md` 停在 0.1.0 / 97 tests / 5 gates；`INDEX.md` 少了 9 个模块和 4 个脚本；
  `audit/AI_DISCLOSURE_LOG.md` 第 30 行只有 5 格（缺 human check 列），且 **19 行共用同一个
  `SessionID`**，违反它自己第 2 条规则；GitHub release 正文里 em dash 落成 `鈥?`（GBK 乱码）；
  装机验收在 HANDOFF 里是断言、脚本却在 `finally` 里把临时目录删了，没有任何产物；
  npm 页面展示的 `packages/plugin/README.md` 里 `scan` 用法缺目录、`--since`、`--max-files`。
- **修法（按硬约束排序）**：先重测 census，再改事实包与四个提示词，最后一次性全量重生成。
  否则 census 改一次就要重生成一轮（R16 已经为这个教训付过 90 分钟）。
  - **重测 census**：`node scripts/record_session_sample.mjs --until 2026-11-11T17:00:00.000Z`，
    两条不同 stamp 的产物除 `generated_at` 外逐字节相同（
    `session-sample-2026-11-11T18-10-00.000Z.json`，sha256 `de083867…`）——这就是
    「可复现」的定义，`--until` 是必须的，因为会话目录只追加。
    实测 **293 turns / 393 attempts**（旧事实包写的是 287 / 375）：
    `completed=94 max_tokens=88 aborted=11 error=100`，`max_tokens` 占比 30%；
    error codes `MALFORMED_RESPONSE=44`、`UNSUPPORTED_REASONING_EFFORT=37`（旧值 36）。
    全目录 scan 产物 `scan-full-2026-11-11T18-15-00.000Z.json`（78 文件 / 393 attempts /
    38 fused / 44 fusion failures / 39 repairable / 0 unreadable）由 `dsh-remedy scan --out` 写出。
  - **事实包**改三处（`## The turn census (P-0006)` 的分母与占比、error codes 行、
    `A measured run` 行）、把 `5 of 5 caught` 改成 `6 of 6`（第六门加上后就错了）、
    并把装机验收写成「由脚本产出 `install-acceptance-*.json`」而不是一句话。
    `docs/copy/prompts/{readme,readme.zh,changelog}.md` 里复述过旧数字的地方同步改。
  - **全量重生成**：11 个文件全部走 `scripts/copy_with_agy.mjs`（7 个单文件 + templates 的
    4 个 split 输出）。上一轮的教训是「一次只跑一个、失败不影响其他」，
    所以本轮逐个调用而不是批量脚本——`bash` 里没有 `node`，`powershell -File` 又会
    把多轮生成串成一个长事务。
- **装机验收落盘（新的机器强制项）**：`scripts/record_install_acceptance.mjs` —— 在临时目录
  `npm init -y` → `npm install dsh-remedy@<version>`（**只允许 registry，不接受本地 tarball**，
  验收的意义就是从 registry 解析）→ `npm exec -- dsh-remedy verify` → 写
  `data/results/install-acceptance-<stamp>.json` + `.sha256`，里面记三条命令的退出码、
  输出尾部、`ok` 与 `blocked` 原因。实测 0.3.6 回 `ok: true`、`OK 6 fixture(s)`，
  产物 `install-acceptance-2026-11-11T19-30-00.000Z.json`（sha256 `5a5e170d…`）。
  `AGENTS.md` 的机器强制项加了第 8 条。
- **披露日志**：把第 30 行补齐成六格；给 19 个重复的 `SessionID` 后缀 `-run-N`
  （只改 id，agent / 模型 / 日期 / 文件一字未动），并在 `## Rules` 前写明这次规范化；
  新增 `tests/governance/ledgers.test.ts` 的一条测试，反例就是旧状态（5 格 + 复用 id），
  现在两件事都有门看着。R17 自己也补了一行（id `…-dsh-remedy-r17`）。
- **台账**：`audit/step_reviews.json` 加 **S17**（gate `copy`，五轴齐）；
  `audit/patch_ledger.json` 的 **P-0008 `since` 从 `0.3.4` 改成 `0.3.5`**（它随 0.3.5 发布，
  R15 的 HANDOFF 段写的就是 0.3.5，账本才是错的那一处）；HANDOFF 的重复行（L629/L631）
  已清，`npm view … # 0.3.5` 改成 `0.3.6`。
- **实测**：`node scripts/gate.mjs` → `ALL GREEN · 6 gates`；`--mutate` → `6/6 CAUGHT`；
  `pnpm run verify` → **193 tests / 0 fail**（192 + 新增的披露行测试）；
  `node packages/plugin/dist/cli.js verify` → `OK 6 fixture(s)`。
  **最终门禁证据**：`gates-2026-11-11T20-35-00.000Z.json` 与
  `gates-mutate-2026-11-11T20-40-00.000Z.json`（中间两轮 18:40/18:45、20:10/20:15 保留为过程证据）。
  快照 `patch-registry-2026-11-11T20-30-00.000Z.json`（sha256 `3cb61aa4…`，九补丁）。
- **第二轮（发现测试数之后）**：第一次全量重生成时事实包写的是 `192 tests`，
  而新加的披露行测试把它变成了 193。同一类错误的第二次犯：**事实包里的测试数必须
  在最后一次加测试之后取**。于是改 facts → 再全量重生成 11 个文件 → 两门重跑。
- **release 正文已修**：`gh release edit v0.3.6 --notes-file .tmp/release-notes-v0.3.6.md`
  之后，用 node 读 GitHub 的 body 与本地文件逐字节比较 → **identical after trim: true**
  （3239 vs 3238 字节只差末尾换行）。之前看到的 `鈥?` 是 PowerShell 用 UTF-16LE 重定向
  造成的假象，但线上确实也落过 GBK 乱码，所以这次重传是真的修，不是自我安慰。
  **验证方法记在这里**：不要用 `gh ... > file` 再 `Select-String`（那是 UTF-16），
  要像 `.tmp/check-release-body.mjs` 那样用 `encoding: 'buffer'` 读回来比较。
- **profile 已换 0.3.6 并验过**：`.tmp/switch-profiles-036.mjs` 把 desktop 与 remedy-live 的
  `package.json` 与 `pnpm-workspace.yaml` overrides 指到 `.tmp/pack18`（备份 `before-036`），
  两次 `pnpm install --no-frozen-lockfile` 都打印 `- dsh-remedy 0.3.5 / + dsh-remedy 0.3.6`；
  两个 profile 内 `node node_modules/dsh-remedy/dist/cli.js verify` 都回 `OK 6 fixture(s)`，
  `node_modules` 里 plugin 与 core 都报 0.3.6。**App 仍未重启**，所以运行时还加载 0.3.5。
- **剩下的两件**：
  1. **P-0010**（npm 页面与 `USAGE` 都说清 `scan` 的目录 / `--since` / `--max-files`）：
     这两处现在没有任何门在看，`gate_copy` 只覆盖仓库根的对外文件。判据先行：先加一条
     「包内 README 的 scan 用法必须等于 `USAGE`」的测试，它会先红。改 `USAGE` 要先拆一个
     `dist` 文件（只剩 3 字节）。
  2. **重启桌面 App**，让已装的 0.3.6 真正生效。

**R16（2026-11-11）· P-0009：窗口化扫描把每个会话开头那行唯一可靠的日期报成"不可读"。**

- **起因**：`node packages/plugin/dist/cli.js scan "C:/Users/rongj/.dsh/sessions" --since 2026-11-11T00:00:00Z`
  报 `files=78 attempts=67 … unreadable_lines=78`。78 个文件正好 78 行不可读，不是某个坏文件，
  而是每个会话日志都以同一行开头。探针实测 `files=78 headers=78 headers_without_time=78`：
  头记录形如 `{"type":"session","version":4,"id":"session-…","createdAt":1794318268790,…}`，
  时间是顶层 `createdAt`（epoch 毫秒），**没有 `time`**；三种键集都带 `createdAt`。
- **机制**：`packages/plugin/src/session-scan.ts:178` 在 `--since` 下要求 `time` 是数字，否则一律
  `unreadable += 1; continue`。头记录因此每次都被记坏。`unreadable_lines` 的存在意义是让人能
  把"我全读了、没缺陷"和"我读不了证据"分开，而它随文件数增长就把这个区分变成噪音——这是
  第二个会说谎的零（第一个是 P-0004 修掉的那次，整个文件读不出来却报 `attempts=0`）。
- **修法**：`const stamp = time ?? (type === 'session' ? asNumber(event.createdAt) : null)`，
  窗口判断与 `window` 更新都用 `stamp`。只有 `session` 头记录回退到 `createdAt`；没有时间字段的
  普通事件仍然是 unreadable，因为确实没有第二个字段可读。
- **判据先行**：先写让旧实现变红的单测。`tests/unit/session-scan.test.ts` 新增
  `a session header is dated by createdAt, so a windowed scan reads it`（期望 `unreadable_lines 0`、
  window 等于该时刻）与 `a session header older than the window is counted as before_since`
  （期望 `before_since 1`、不是 unreadable）；`tests/e2e/cli.test.ts` 新增
  `a windowed directory scan does not spend one unreadable line per session header`
  （两个 zstd 文件各带头记录，期望 `unreadable_lines 0`、`before_since 2`）。原有那条
  "普通事件无时间→unreadable" 保留不动，避免修复变成万能豁免。
- **字节账**：加这段回退让 `dist/*.js` 到 68 351，超过刚立的 68 000 上限（第六门当场红）。
  修法不是放宽上限，而是把同一文件里那三行解释压成两行、并压缩 `scanSessionText` 与
  `scanSessions` 两个文档块，最终 67 997，**离上限只剩 3 字节**。事实包里已写明：下一个往
  `dist` 加代码的补丁必须拆文件，不能再"吸收"。
- **实测**：`node scripts/gate.mjs` → `ALL GREEN · 6 gates`；`--mutate` → `6/6 CAUGHT`；
  `node --test` → **193 tests / 0 fail**（原 189，新增 3）。那条同命令的实测从
  `unreadable_lines=78` 变成 `unreadable_lines=0`，`attempts=67` 与 `before_since=156209` 口径不变。
- **台账**：`docs/patches/P-0009-session-header-window.md`（Status `tested`、severity minor、
  surface `cli`）；`registry.ts` 追加 P-0009（evidence 4 / guards 3 / limits 4）；
  `audit/patch_ledger.json` 加条目（`since: "0.3.6"`、**无 `verified_at`**）；
  `audit/step_reviews.json` 加 **S16**。快照 `patch-registry-2026-11-11T16-30-00.000Z.json`
  （sha256 `5218a55d…`，九补丁）。
- **打包**：`.tmp/pack18/` plugin **29 445 B / 29 文件 / 97 807 B 解包**
  （`dist/*.js` 67 997 / `dist/*.d.ts` 20 951 / fixtures 3 583 / 包根 5 276），manifest 钉
  `"dsh-remedy-core": "0.3.6"`，sha1 `fe85d15a…`；core **19 247 B / 19 文件 / 63 408 B 解包**
  （`dist/*.js` 43 117 / `dist/*.d.ts` 16 994 / 根 3 297），deps `{}`，sha1 `76777609…`
  （core 变大只因为多一条补丁记录）。
- **交接后续（2026-11-11 16:30 → 17:37）**：16:38–17:14 那次 `sh .tmp/regenerate-copy-036.sh`
  确实把八个对外文件重生成过一轮（`README.md` 11 684 B / `README.zh-CN.md` 12 024 B /
  `CONTRIBUTING.md` 3 078 B / `SECURITY.md` 1 014 B / `CODE_OF_CONDUCT.md` 4 652 B /
  `CHANGELOG.md` 10 033 B / `repo-metadata.json` 2 255 B / 模板四件 `1 981 / 903 / 212 / 593 B`），
  但那时的口径是「0.3.6 已准备、未发布」。发布之后 `update-facts-036-published` 在 17:29–17:35
  把事实包翻成「0.3.6 已发布」，**十份文件立刻作废**（`facts_sha256` 变了），
  而 17:37 只重跑了 README 一份（`.tmp/regen-036-published.log` 只有两行 `WROTE README.md`），
  于是 `copy` 门与治理测试双双变红，一直红到 R17。
  **教训（写在这里以免下次重犯）**：(1) 事实包的 hash 是十一个文件的契约，
  翻口径与重生成必须同一次做完，中间不能隔一轮；(2) 未发布的版本不要在事实包里描述其
  tarball 细节，等发布后一次性翻口径再重生成；(3) 「重生成脚本跑完 failures=0」只证明那一刻
  跑完了，不证明事实包之后没再改过 —— 验收看 `gate_copy` 与 `pnpm run verify`，
  不看脚本自己的退出码。
- **已做到**：0.3.6 发布（`npm publish <tarball>` 两次手工调用，因为 wrapper 在 `packages/core` 以 3221226505 退出且 npm 日志里没有任何 HTTP 请求；两次直调都回 exit 0）、`record_publish` 首跑即 `ok: true`、空目录验收 6/6、release `v0.3.6`、公开仓库 push 与 CI 绿（run `43057311487`，42s）。
- **仍未做**：桌面 App 未重启（已在装的 0.3.5 也还没生效）；两个 profile 还指向 `.tmp/pack17` 的 0.3.5，要换成 `.tmp/pack18` 的 0.3.6。事实包里的 census 样本已由 R17 重测成 293 turns / 393 attempts。

**R15（2026-11-11）· P-0008：没人检查的字节预算只是建议，而这个仓库已经证明过三次。**


- **起因**：字节上限只写在事实包与 `README.md` 的散文里，`grep -rn "68000" scripts/` 返回空。
  于是三次越线都是事后人工量出来的，且每次当时 189 tests 与六门全绿：P-0005 之后 55 815、
  P-0004 之后 64 539、P-0006 第一次尝试 70 389（那一次把 census 写成第九个模块，加完才发现超限）。
  三次都是先绿后量，所以"上限"事实上不存在。
- **修法**：`scripts/gate_size.mjs`（第六门，只用 `statSync` + `lib/kit.mjs`）在每次门禁里量
  `packages/plugin/dist/*.js`，拒绝四件事：插件总量 > 68 000、`repair-stream.js` > 28 000、
  `session-scan.js` > 14 000、任何 > 10 000 B 却没有独立 cap 的文件。`--mutate` 把实测总量对
  cap−1 比较（67908 of 67907），于是"停止比较"这条退化路径会红而不是继续绿。
- **判据先行**：先写门，再记录数字。开写时实测 67 908 总量、`repair-stream.js` 27 925、
  `session-scan.js` 13 237、`cli.js` 8 503，所以它是**开局就绿**而不是靠豁免绿。
- **不做的事**：不封 core（`core/dist/*.js` 41 262 没有上限的理由是没有单文件风险）；
  不给 `scan-command.js` 设 cap（它还小、且下一次加功能才该定）；不把上限改成"软提醒"。
- **实测**：`node scripts/gate.mjs` → `ALL GREEN · 6 gates`；`--mutate` → `6/6 CAUGHT`；
  189 tests / 0 fail。发布后重跑的证据是 `gates-2026-11-11T15-45-00.000Z.json` 与
  `gates-mutate-2026-11-11T15-40-00.000Z.json`。
- **台账**：`docs/patches/P-0008-byte-budget-gate.md`（Status `tested`、severity minor、surface `scripts`）；
  `registry.ts` 追加 P-0008（evidence 3 / guards 3 / limits 4）；`audit/patch_ledger.json` 加条目
  （`since: "0.3.5"`、**无 `verified_at`**）；`audit/step_reviews.json` 加 **S15**；
  `audit/gate_ledger.json` 加第六门（`requires_build: true` + 自己的 `negative_control` 文案）。
  快照 `patch-registry-2026-11-11T13-50-00.000Z.json`（sha256 `4ed8ae3a…`，八补丁）。
- **打包与发布**：`.tmp/pack17/` plugin **29 448 B / 29 文件 / 97 944 B 解包**、shasum `c1b1b431…`
  （字节数与 0.3.4 相同，因为 `scripts/` 不进包，但 manifest 版本变了所以 sha 变了）；
  core **18 723 B / 19 文件 / 61 553 B 解包**、shasum `cc9895f8…`。`node scripts/publish_packages.mjs`
  一次成功；两包 `latest = 0.3.5`（core `modified 2026-11-11T13:47:32.623Z`、plugin `13:47:05.132Z`）。
- **发布证据的两次**：14:55 那次 `record_publish.mjs` 记成 `ok: false`（core 还在 `0.3.4`，是副本延迟），
  产物已删；等直查确认两包都 `0.3.5` 后 15:05 重记得到 `ok: true`，两包 `exact_ok` 与 `latest_ok` 全 true。
  **教训：副本延迟期间 `record_publish` 必须重跑而不是当成发布失败**。
- **对外文字**：事实包改成「0.3.5 两包 `latest`」，加了 0.3.5 的两个 tarball 实测行与 0.3.5 发布的时间线；
  四个 prompt 的发布状态从"0.3.4 是 latest、0.3.5 已准备"翻成"0.3.5 是 latest、0.3.4 是上一个"；
  8 个对外文件全部重生成。
- **已做（同日晚）**：两个 profile 已换成 `.tmp/pack17/` 的 0.3.5（`desktop` 内 `verify` 6/6、两包均 0.3.5）。
- **仍未做**：桌面 App 未重启；事实包里的 census 样本仍是旧的 287 turns / 375 attempts
  （复测是 289 / 392，本轮没有改，因为改它要连带重生成全部对外文件）。

**R14（2026-11-11）· P-0007：报 "exited null" 的通道修不好任何东西。**

- **起因**：0.3.4 的对外文字重生成时，`README.md` 与 `CHANGELOG.md` 两份最长文件的生成全部失败，
  每次都只打印 `copy_with_agy: agy exited null`，既没有退出码也没有原因，分不清"模型拒绝"、
  "进程没起来"和"进程被杀"。同一句话之前已经吃掉三次尝试，每次都要从零重跑、什么都没学到。
- **判据先行（不需要模型调用就能测）**：同一段请求文本交给 `spawnSync` 时，事实包一加上去就
  `ENAMETOOLONG`，1 ms 返回、`status` 是 `null`。量出来的长度：`changelog` 35509 字符、
  `readme` 33530 字符，Windows 单条命令行上限 32767。另外 600000 ms 的 `spawnSync` 超时被杀时
  同样回 `null`。两种不同的故障共用一句话，这就是"不可诊断"。
- **修法**：`scripts/lib/agy-channel.mjs`（新）把传输规则做成纯函数 ——
  `ARGV_LIMIT = 30000`、`AGY_TIMEOUT_MS = 1800000`、`buildRequest`、`transportFor`、
  `stdinMessage`、`responseOf`、`cleanOutput`、`describeSpawnFailure`；
  `scripts/copy_with_agy.mjs` 按长度二选一：不超过上限仍走 argv（行为逐字节不变），
  超过就改成 stdin 的一个 `stream-json` user 事件、答案从最后一条 `result` 事件取；
  失败按 `ETIMEDOUT` / `ENAMETOOLONG` / `ENOENT` 各自命名，永不打印 `null`。
- **不做的事**：不跨传输重试（选一次传输，失败就把原因说清楚，人再跑）；
  超时是抬到半小时而不是取消（挂住的 agy 仍会被杀并仍被命名为超时）；
  不缩短事实包去迁就命令行（事实就是重点，所以 stdin 从此是常态路径）。
- **实测**：`README.md` 重新生成 10872 B、`CHANGELOG.md` 6851 B，两次都是 `via stdin`；
  随后 8 个对外文件全部按新事实包重生成；`node scripts/gate.mjs` → `ALL GREEN · 5 gates`。
- **测试**：175 → **189 tests / 0 fail**。新增 `tests/unit/agy-channel.test.ts` 14 条
  （段落顺序、恰好卡在上限与超一个字符的传输边界、含换行与引号的 ndjson 事件、
  最后一条 `result` 胜出、没有 `result` 时返回 `null` 而不是空答案、剥一层代码围栏、
  三种 spawn 失败各自命名且从不出现 `null`）。
- **台账**：`docs/patches/P-0007-copy-channel-transport.md`（Status `tested`、severity minor、
  surface `scripts`、Depends on none、四行 counter-evidence、六条 invariants、三条 reproduction）；
  `packages/core/src/registry.ts` 追加 P-0007（evidence 3 / guards 3 / limits 4），并把
  `scripts` 加进 `SURFACES`（构建侧也是一个接缝：坏的记录器会把"未知"变成"绿"）；
  `audit/patch_ledger.json` 加 P-0007（`tested`、`since: "0.3.4"`、无 `verified_at`）；
  `audit/step_reviews.json` 加 **S14**（gate registry，五轴齐）；
  快照 `data/results/patch-registry-2026-11-11T11-20-00.000Z.json`（sha256 `b272ddfe…`，七补丁）；
  门禁证据 `gates-2026-11-11T11-30-00.000Z.json` 与 `gates-mutate-2026-11-11T11-25-00.000Z.json`。
- **包体（重新打包后）**：plugin **29 448 B / 29 文件 / 97 944 B 解包**（shasum `5f20282e…`，未变）；
  core **18 202 B / 19 文件 / 59 864 B 解包**（`dist/*.js` 39 573 / `dist/*.d.ts` 16 994，
  shasum `38400db9…`），比上一版 +821 B，全部来自两条注册表条目。
- **已完成（同日）**：0.3.4 已发布，`record_publish` 两包 `exact_ok` + `latest_ok`，空目录验收 6/6，release `v0.3.4` 已建。
- **仍未做**：P-0007 永远停 `tested`；
  桌面 App 未重启。

**R13（2026-11-11）· P-0006：只统计可修 turn 的扫描不是故障地图。**

- **起因**：`session-scan.ts` 的 `turn/end` 分支有两道早退——`reason.kind !== 'error'` 与
  `error.code !== 'MALFORMED_RESPONSE'`。对"能不能修"这是对的，但这份报告同时兼任故障地图，
  于是地图继承了过滤器：本机 **287 个 turn 里只报了 44 个**，最大的类（88 次 `max-tokens`，
  占 31%）与第二大（36 次 `UNSUPPORTED_REASONING_EFFORT`）完全不可见。
  这与 P-0004 是同一类缺陷的下一层：P-0004 是"文件根本没解开"，P-0006 是"事件解开了又被丢掉"。
- **判据先行（先否掉两个候选）**：`.tmp/probe-escape-class.mjs` 实测 44 条 MALFORMED 参数里
  **0 条含非法 JSON 转义**，所以"把非法转义双写修复"没有真实样本；
  `.tmp/probe-truncation-attribution.mjs` 实测 **88 个截断 turn 里 0 个能对上同 turn 且带
  tool-call buffer 的 attempt**（`turn/end` 只有 `data.turn`，没有 call id），所以截断
  **无法归因到某个调用**，只能计数。两条都因此不进 P-0006。
- **修法**：`turn/end` 分支先按 `reason.kind` 记 census（`max-tokens` → `max_tokens` 槽），
  再判断是否 error；error 分支先按 `reason.error.code` 原名累加 `error_codes`，
  再保留原来的两道早退。`ScanReport` 加 `turns`（`ScanTurnCensus` 四字段）与
  `error_codes`；`addReport` 用 `lower`/`higher`/`mergeCounts` 合并；`ScanRow` 带自己的 census。
  `scan-command.ts` 的人读输出加两行（census 行 + `error codes` 行）。
- **不做的事**：census **只报告，不进 finding**——退出码仍只看 `fused_calls` 与
  `fusion_failures`，否则 88 条截断会让 `scan` 在脚本里永远返回 1；`fusion_failures`
  语义一字不动；不认识的 `kind` 不另造桶。
- **实测**（真机 78 个会话）：`files=78 attempts=375 fused_calls=38 fusion_failures=44
  repairable=39 unreadable_lines=0`；`turns=287 completed=92 max_tokens=88 aborted=8 error=99`；
  `error codes: INVALID_REQUEST=1 MALFORMED_RESPONSE=44 MISSING_CREDENTIAL=1 SERVER=16
  UNKNOWN=1 UNSUPPORTED_REASONING_EFFORT=36`；窗口
  `2026-11-08T08:30:27.993Z..2026-11-11T08:46:06.887Z`。
- **测试**：169 → **175 tests / 0 fail**。`tests/unit/session-scan.test.ts` 9 → 14 条；
  `tests/e2e/cli.test.ts` 12 → 13 条（census 三条 turn 后 `status 0`，证明 census 不是 finding）。
- **字节越限（第三次，自己撞的）**：先把 census 辅助函数外置成
  `packages/plugin/src/turn-census.ts`（2020 B），`dist/*.js` 从 65 521 涨到 **70 389**，
  越过 68 000 上限 2 389。**加第九个模块的脚手架比它承载的代码更贵**——删掉该模块、
  把 `emptyCensus`/`countTurn`/`addCensus` 内联回 `session-scan.ts`，再两次注释瘦身，
  最终 **67 908 B（距上限 92 字节）**：`session-scan.js` 13 237、`scan-command.js` 6 624、
  `repair-stream.js` 27 925（仍在上限 28 000 下）、`cli.js` 8 503。
- **台账**：`docs/patches/P-0006-turn-census.md`（Status `tested`、severity minor、surface `cli`、
  Depends on P-0004、What changes 6 行、Invariants 8 条、What this does not fix 5 条）；
  `registry.ts` 追加 P-0006（evidence 3 / guards 3 / limits 5）；`audit/patch_ledger.json` 加条目
  （`since: "0.3.4"`，**无 `verified_at`**）；`audit/step_reviews.json` 加 **S13**（现共 13 步）。
- **快照与门禁**：`patch-registry-2026-11-11T10-30-00.000Z.json`（sha256 `c484300c…`，11225 B，
  六个补丁）；`gates-2026-11-11T10-40-00.000Z.json` / `gates-mutate-2026-11-11T10-45-00.000Z.json`。
- **0.3.4 打包实测**（`.tmp/pack15/`）：plugin **29 448 B / 29 文件 / 97 944 B 解包**、
  sha1 `5f20282efe981cf9d1039e4273853b37702efc2f`；core **17 381 B / 19 文件 / 57 665 B 解包**、
  sha1 `9e53fbd3…`；`--dry-run` exit 0 且 preflight 通过（`npm whoami` = `jjjjjjjjnnjnn`）。
  **`npm profile get tfa` 这次回 `E403`**（端点权限，非致命），preflight 只依赖 `whoami`。
- **对外文字**：事实包加 `## The turn census (P-0006)` 段 8 条、`Tests: 175`、0.3.4 两个 tarball
  字节、字节预算段补第三次越限；数字白名单改成**脚本按 gate_copy 同样的剥离规则从 prose 重建**
  （112 个数字 + 9 个 semver），不再手拼。
- **已完成**：0.3.4 已发布并验收（见 R14 段）。
- **仍未做**：P-0006 永远停 `tested`（离线读取器）；桌面 App 未重启。

**R12（2026-11-11）· P-0004：scan 必须读它指向的那份日志，脱敏必须看见每种路径形状。**

- **起因**：`node packages/plugin/dist/cli.js scan "<...>/session.v4.jsonl.zstd"` 输出
  `unreadable_lines=236`、其余全 0。根因不是日志坏了，是 `cmdScan` 用 `readFileSync(file, "utf8")`
  把 zstd 字节当文本按行切；`decompressSessionLog` 早就在 `session-log.ts` 里且正确。
  **一个读不懂输入的扫描器报 0，这个 0 是谎报**，所以先复现再修。
- **同一轮发现的第二个缺陷**：`core/redact.ts` 的 `windows-home` 只匹配单反斜杠，
  JSON 转义（`C:\\Users\\rongj`）与双转义、以及会话目录把 home 编码成
  `--C-Users-rongj-Desktop-~9879~76EE~5F00~53D1-...--` 这三种形状全部漏过。
  实测 `data/results/` 里 3 个产物带着未脱敏的 home 路径（`live-2026-11-09T17-00-00.000Z.json`、
  `live-2026-11-10T14-45-00.000Z.json`、`live-2026-11-10T16-30-00.000Z.json`）——
  `record_live_mount.mjs` 调了 redact，是**规则漏了形状**，不是脚本跳过了。
- **修法**：`cli.ts` 的 `cmdScan` 支持文件或目录（递归只收 `session.v4.jsonl(.zstd|.jsonl)`，
  按 mtime 降序，`--max-files` 默认 200），每个文件走 `decompressSessionLog`，
  解不开的文件进 `failures` 并以 exit 3 退出；`session-scan.ts` 加 `files` / `before_since` /
  `window` / `ScanRow` / `scanSessions` / `addReport`，`--since` 只保留 `time >= since`
  并**记账被丢掉多少**（`before_since`），无时间戳的事件算 unreadable 而不是静默保留；
  `redact.ts` 的 `windows-home` 正则覆盖 `\\` 与 `/`，新增 `encoded-home`
  产出 `<home-encoded>`（replacement 不带尾部 `-`，否则会吃掉目录分隔符）。
- **修数据**：新增 `scripts/redact_artifacts.mjs`（默认 dry run，`--write` 才落盘），
  对 `data/results/*.json` 重跑 `redactValue` 并重写同名 `.sha256`，
  **不动 `produced_by` / `generated_at`**（这是脱敏修复不是重新生产，否则 ssot 门的溯源被破坏）。
  实测只改了 3 个产物，之后 dry run 报 `0 artifact(s) would change`。
- **实测**：全量 `scan "C:/Users/rongj/.dsh/sessions"` → `files=77 attempts=276 fused_calls=38
  fusion_failures=43 repairable_failures=39 unreadable_lines=0`，窗口
  `2026-11-09T16:50:40.119Z..2026-11-10T21:07:40.642Z`，`by_tool` 合计 38。
  **77 文件 / 276 attempts 与 R7 的 48 文件 / 120 turn/end 是两个口径**（scan 数 attempt，
  探针数 turn/end），不能混用。
- **测试**：151 → **159 tests / 0 fail**。`tests/e2e/cli.test.ts` 8 → 12 条（多帧 zstd、
  目录合并、`--since` 记账、非法 `--since` exit 2）；`tests/unit/session-scan.test.ts` 4 → 9 条；
  `tests/unit/redact.test.ts` 5 → 8 条（五种路径形状 + 编码目录 + 「脱敏不吃后续成员」）。
- **台账**：`docs/patches/P-0004-scan-fidelity.md`（Status `tested`、What changed 12 行、
  Invariants 9 条）；`registry.ts` 追加 P-0004（`tested` / major / `cli` / evidence 4 / guards 5 /
  limits 4）；`audit/patch_ledger.json` 加条目；`audit/step_reviews.json` 加 **S12**（现共 12 步）；
  快照 `data/results/patch-registry-2026-11-10T22-30-00.000Z.json`（sha256 `2835f7a4…`）。
- **字节越限（第二次）**：P-0004 让 `packages/plugin/dist/*.js` 从 56 344 涨到 **64 539**
  （`cli.js` 12 959 → 16 640、`session-scan.js` 6 927 → 11 441），越过写死的 58 000。
  → 0.3.3 再拆一次：`cli-args.ts`（`Args`/`parseArgs`/`flagString`/`readInput`/`EXIT_*`/`USAGE`）
  与 `scan-command.ts`（`writeArtifact`/`collectSessions`/`cmdScan`）从 `cli.ts` 逐字搬出，
  `cli.ts` 436 → 246 行、产物 16 640 → **8 503**，但总量 64 539 → **65 521（+982）**。
  **上限改成按文件量**：`repair-stream.js` ≤ 28 000（实际 27 925）、`cli.js` ≤ 10 000（实际 8 503）、
 插件总量 ≤ 68 000（实际 65 521）；**跨了哪个文件就拆哪个文件**，不再用总量当唯一闸门。
- **0.3.3 打包实测**（`.tmp/pack14/`）：plugin **28 378 B 压缩 / 29 文件 / 94 769 B 解包**、
  core **16 776 B / 19 文件 / 55 684 B 解包**；packed manifest 仍是
  `{"dsh-remedy-core":"0.3.3"}`（无本地协议）。
- **对外文字**：事实包升 0.3.3 / 159 tests / 新增 `## The scan and the redaction (P-0004)` 段 9 条、
  包体积与字节预算段按实测重写、允许数字行重排；7 个 prompt 同步（readme 与 readme.zh
  **不再硬编码版本**，安装段改成「从 registry 拿最新」，安全保证加 P-0004 五条；
  changelog 加 `## [0.3.3]`；metadata release_blurb 改成不硬编码版本；templates 也不写版本；
  contributing 写明 P-0004 是「改离线读取器所以永远无 journal 可证」的 tested 范例）。
- **第一次发布尝试失败（2026-11-11）**：用户在终端跑发布，core 停在
  `E404 / 404 Not Found - PUT https://registry.npmjs.org/dsh-remedy-core`。
  同一个会话里 `GET 200 https://registry.npmjs.org/dsh-remedy-core` 是通的——读得到、
  写不回，这是 npm 在凭证缺失时对未认证调用方的固定回答（registry 不会告诉你包存在），
  不是包不存在（core 早已在 0.1.0 / 0.3.0 / 0.3.2 上）。同 shell 里 `npm whoami` 报
  `E401 / 401 Unauthorized`。**根因是 shell 没登录，tarball 与脚本都没问题**
  （core tarball 19 文件 / 16.8 kB / shasum `6fbbeb06…`，`packedManifest` 校验通过）。
  当时脚本自己打印的建议（"if the registry answered 404 through pnpm, that is the
  missing OTP too"）把人引向了并不存在的 OTP 问题——这是我自己写进去的错话。
- **修法（R12 追加）**：`scripts/publish_packages.mjs` 在打包前先跑
  `npm whoami`（`publishAuthProblems`），401 或空输出就直接拒绝发布并打印
  "token missing or expired，先 `npm login`"；失败分支按 npm 退出码给建议
  （`npmFailureAdvice`：404 / 401 / 403 先指向登录，只有无法归因的失败才提 OTP）。
  `--dry-run` 打印同一条警告但继续走完打包校验，这样没登录的机器仍能验证 tarball。
  实测：`--dry-run` 头部现在输出
  `the shell is not logged in (a real publish would stop here): - \`npm whoami\` answered 401 …`，
  之后两包照旧打包成功（plugin 28.4 kB / 94.8 kB / 29 文件 / shasum `46ad57ea…`）。
- **测试**：159 → **169 tests / 0 fail**，10 条新增全在 `tests/unit/publish.test.ts`
  （登录成功放行 / 401 指向登录而不是 OTP / 空输出不算登录 / 未知失败保留状态与 stderr 首行 /
  404 先指向 `npm whoami` / 401 与 403 两个方向 / 无法归因才提 OTP；另有一条把 npm
  把 401 报成退出码 1 的实测形状钉住）。**踩坑**：`npm whoami` 的 401 不是退出码 401，
  是 `exit 1` + 输出里 `E401`——只按状态码判断会把真实登录失败读成"未知故障"。
- **第二次发布尝试（同日）**：`npm whoami` 已恢复成 `jjjjjjjjnnjnn`（用户重新登录过，
  `.npmrc` 里是一个 40 字符的 classic `npm_` token），发布这次走到了 registry 本体，
  回的是 **`EOTP`**：`This operation requires a one-time password.` 并打印
  `https://www.npmjs.com/auth/cli/<id>`。`npm profile get tfa` 证实账号是
  `mode: "auth-and-writes"`、`auth-type = "web"`，所以每次写入都要现码——**这是设计要求，
  不是故障**。脚本已补 `otpAdvice()`：EOTP 时把 npm 打印的那条 URL 原样转发（web-auth
  只能靠它完成），不再把 EOTP 归因到"权限/包不存在"。
- **profile 已提前换到 0.3.3**（不等发布）：`.tmp/switch-profiles-033.mjs` 把
  `desktop` 与 `remedy-live` 的 `dsh-remedy` 指到 `.tmp/pack14/dsh-remedy-0.3.3.tgz`、
  `pnpm-workspace.yaml` 的 `dsh-remedy-core` override 指到对应 core tgz（两处都先备份
  `*.before-033`）；`pnpm install --no-frozen-lockfile` 两次都报
  `- dsh-remedy 0.3.2 / + dsh-remedy 0.3.3`（670ms / 97ms）；
  desktop 里 `node node_modules/dsh-remedy/dist/cli.js verify` → `OK 6 fixture(s)`，
  `require` 两个包都是 `0.3.3`。**桌面 App 仍需重启才会加载它。**
- **已完成（同日晚）**：0.3.3 发布（用户带着 2FA 的 token 自己跑完，`PUT 202` 两包都落了），
  `record_publish.mjs` 产物 `publish-2026-11-11T08-35-00.000Z.json` 两包 `exact_ok` +
  `latest_ok` 全 true，空目录 `npm install dsh-remedy@0.3.3` 后 `verify` 6/6，
  `gh release v0.3.3` 已建（非 draft 非 prerelease），对外文字已重生成成"已发布"口径。
- **仍未做**：P-0004 永远停在 `tested`（除非将来有 journal 能证明离线读取）；
  P-0003 的 `withdrawn` live 空洞仍未填；桌面 App 还没重启过载入 0.3.3。

**R11（2026-11-10）· P-0005：给裸值加引号，或者拒绝——从不猜。**


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
- **证据笔记**：`docs/research/bare-value-reseal-2026-11-10.md`（写清「唯一候选才修、0 与 ≥2 都拒」的
  逐条来源，并把「转义修复 0/5」这条死路留在纸上，免得后人重试）。
- **仍未做**：0.3.2 已打包实测、已提交并推送到公开仓库（CI 绿）、两个本地 profile 已装成 0.3.2，
  **只差 npm 发布**；P-0005 仍 `tested`（无 live）。

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

**A. 主线：0.3.7 已 bump、已打包实测、未发布；registry 上仍是 0.3.6。** 十补丁已落地
（P-0001 / P-0002 / P-0003 `verified`，P-0005 / P-0004 / P-0006 / P-0007 / P-0008 / P-0009 / P-0010 `tested`），
基线 **195 tests / 6 gates / `--mutate` 6-6**。
0.3.7 的内容是 P-0010：npm 页面与 CLI `USAGE` 都在用 0.3.3 之前的 `scan` 用法，
两处改成同一条并加了 `tests/unit/cli-usage.test.ts`；付账方式是压缩命令说明，
`dist/*.js` 从 67 997 降到 67 883（上限仍是 68 000）。

**下一个必须做的，按顺序：**
1. 发布 0.3.7（需要 OTP）：`npm whoami` → `node scripts/publish_packages.mjs --otp <code>`
   → `node scripts/record_publish.mjs --stamp <ISO> --retries 3` →
   `node scripts/record_install_acceptance.mjs --version 0.3.7 --stamp <ISO>` →
   `gh release create v0.3.7 --notes-file <utf8 文件>`。副本延迟期间 `record_publish`
   必须重跑，别当成发布失败。
2. 发布后把事实包翻成「0.3.7 已发布」，并把 `changelog` 提示词里的 `[0.3.7] - unreleased`
   改成实际日期，然后**一次**重生成 11 个对外文件（不要分两轮，R17/R18 已经各付过一次）。
3. 两个 profile 换成 `.tmp/pack19/` 的 0.3.7，然后**重启桌面 App**——它从 0.3.5 起就没重启过。
4. 证据：`data/results/live-2026-11-12T06-00-00.000Z.json` 是 0.3.6 真机修好粘连的产物
   （P-0001 已引用）。它证的是 `fused:1 repaired:1`，**没有证 `withdrawn`**。

**之后按价值排序：**
1. **P-0011**（小、纯函数、不需要模型调用）：`transportFor` 按 `text.length`（UTF-16 码元）
   判断，注释与事实包都写「字符」；事实包一旦出现中文就会低估长度。改成
   `Buffer.byteLength(text, 'utf16le') / 2` 并加一条非 ASCII 边界测试。
2. **P-0012**（最贵、唯一能把补丁升到 `verified` 的方向）：补 P-0003 的 `withdrawn`。
   R18 试了 12 次「前一个调用合法、后一个故意写坏」都没粘连——relay 的粘连是间歇性的，
   而模型不肯输出语法坏的参数对。要么换一个更可能粘连的提示（历史粘连集中在
   `ops_bash`/`read_page`/`ops_read_files`，且都发生在 `read`/`run_code` 多文件读取时），
   要么接受「`withdrawn` 只有单测」这个结论并写进 blind spots。
3. **P-0013**（可选）：`publish_packages.mjs` 对 0.3.6 那次 `packages/core` 以 3221226505
   （Windows access violation、npm 日志里没有任何 HTTP 请求）退出的情况没有任何命名逻辑。
   与 P-0007 同类：未知失败被报成一句话。
4. `packages/*/README.md` 仍不在门禁覆盖里：`gate_copy` 只认仓库根那 11 个文件，
   `cli-usage.test.ts` 只守 `scan` 那一行。要么把包内 README 纳入 copy 通道，
   要么给它一条「不得包含 USAGE 之外的命令形状」的测试。

发布前两条命令先证明认证是通的，再谈 OTP（2026-11-11 那次 404 就是跳过这一步的结果）：

```bash
npm login
npm whoami          # 必须打印用户名；输出 E401 就先解决登录，不要试 --otp
```

**B. 清账：两个本地 profile 装着 0.3.6（与 registry 一致，先不动）。**

```powershell
# 换法照 .tmp/switch-profiles-036.mjs（改两个 key + pnpm-workspace.yaml 的 overrides + 备份后缀）
#    desktop 与 remedy-live 的 package.json: dsh-remedy -> file:.tmp/pack19/dsh-remedy-0.3.7.tgz
#    pnpm-workspace.yaml overrides: dsh-remedy-core -> file:.tmp/pack19/dsh-remedy-core-0.3.7.tgz
# 然后 pnpm install --no-frozen-lockfile，再重启 DeepSeek Harness 才加载新版本。
# 直接 dsh plugin --profile desktop add 会 ETARGET（core 必须一起 add，或改文件）
```

**C. 可选：把 `agent/request-error` 的 retry 兜底做成可观测**（现在默认 0，只在配置里存在）。

验收：

1. `pnpm run verify` 绿；`node scripts/gate.mjs --mutate` 6/6 红；
2. 新补丁的证据/守卫路径都能解析，`verified` 必须有 `data/results/live-*`；
3. 对外文字只走 `docs/copy` 通道，`node scripts/gate_copy.mjs` 绿；
4. 装机验收必须是 `data/results/install-acceptance-*.json`（`record_install_acceptance.mjs`）。

## 证据索引（`data/results/`）

| 文件 | 状态 | 说明 |
|---|---|---|
| `live-2026-11-09T17-00-00.000Z.json` | 绿 | headless 真机：10 流 / 1 修复 / `completed` |
| `live-desktop-2026-11-09T19-10-00.000Z.json` | 绿 | 桌面真机：39 流 / 2 修复 / `aborted`（人工停止） |
| `patch-registry-2026-11-09T19-15-00.000Z.json` | 绿 | 历史快照（P-0001 单独） |
| `patch-registry-2026-11-10T11-00-00.000Z.json` | 绿 | 历史快照（P-0002 仍是 `tested`） |
| `patch-registry-2026-11-10T15-10-00.000Z.json` | 绿 | 历史快照（P-0001 + P-0002 `verified` + P-0003 仍 `tested`） |
| `live-2026-11-10T14-45-00.000Z.json` | 绿 | 0.3.0 headless 真机：17 流 / 1 修复 / 8 计数器齐 / 合成 id 被派发（`cross_check.match`） |
| `patch-registry-2026-11-10T16-45-00.000Z.json` | 绿 | 历史快照（P-0001 + P-0002 + P-0003 全 `verified`，P-0004 / P-0005 尚未登记） |
| `live-2026-11-10T16-30-00.000Z.json` | 绿 | 0.3.0 headless 真机拒绝：5 流 / `too-many-calls` / `fused:1 refused:1 unrepaired:1` / verdict `degraded` / 会话 `turn_end=error` / 无合成 id |
| `patch-registry-2026-11-10T22-30-00.000Z.json` | 绿 | 历史快照（五个补丁：P-0001/2/3 `verified`，P-0004/5 `tested`） |
| `patch-registry-2026-11-11T10-30-00.000Z.json` | 绿 | 历史快照（六个补丁；sha256 `c484300c…`） |
| `patch-registry-2026-11-11T11-20-00.000Z.json` | 绿 | 历史快照（七个补丁：P-0001/2/3 `verified`，P-0004/5/6/7 `tested`；sha256 `b272ddfe…`） |
| `patch-registry-2026-11-11T13-50-00.000Z.json` | 绿 | 历史快照（八个补丁：P-0001/2/3 `verified`，P-0004/5/6/7/8 `tested`；sha256 `4ed8ae3a…`） |
| `patch-registry-2026-11-11T16-30-00.000Z.json` | 绿 | **当前**注册表快照（九个补丁：P-0001/2/3 `verified`，P-0004/5/6/7/8/9 `tested`；sha256 `5218a55d…`） |
| `gates-2026-11-10T22-25-00.000Z.json` / `gates-mutate-2026-11-10T22-20-00.000Z.json` | 绿 | P-0004 批次的门禁证据（`ALL GREEN · 5 gates` 与 `5/5 CAUGHT`） |
| `gates-2026-11-11T09-45-00.000Z.json` / `gates-mutate-2026-11-11T09-40-00.000Z.json` | 绿 | 0.3.3 发布后的门禁证据（事实包改成"已发布"口径、8 个对外文件重生成之后） |
| `gates-2026-11-11T10-40-00.000Z.json` / `gates-mutate-2026-11-11T10-45-00.000Z.json` | 绿 | 历史门禁证据（P-0006 批次，175 tests） |
| `gates-2026-11-11T11-30-00.000Z.json` / `gates-mutate-2026-11-11T11-25-00.000Z.json` | 绿 | P-0007 台账批次的门禁证据（对外文件重生成之前） |
| `gates-2026-11-11T13-15-00.000Z.json` / `gates-mutate-2026-11-11T13-10-00.000Z.json` | 绿 | 0.3.4 发布后的门禁证据（`ALL GREEN · 5 gates` 与 `5/5 CAUGHT`，189 tests） |
| `gates-2026-11-11T14-35-00.000Z.json` / `gates-mutate-2026-11-11T14-30-00.000Z.json` | （已删） | 0.3.5 台账落地时的一次门禁证据，已被 15:45 的重跑取代 |
| `gates-2026-11-11T15-45-00.000Z.json` / `gates-mutate-2026-11-11T15-40-00.000Z.json` | 绿 | 0.3.5 发布后的门禁证据（`ALL GREEN · 6 gates` 与 `6/6 CAUGHT`，189 tests） |
| `gates-2026-11-11T17-25-00.000Z.json` / `gates-mutate-2026-11-11T17-20-00.000Z.json` | 绿 | 历史门禁证据：P-0009 台账落地、双包 bump 0.3.6（16:40 那条红产物已删） |
| `gates-2026-11-11T18-40-00.000Z.json` / `gates-mutate-2026-11-11T18-45-00.000Z.json` | 绿 | R17 中间一轮：census 重测 + 11 个对外文件首次重生成之后的门禁证据（192 tests） |
| `gates-2026-11-11T20-10-00.000Z.json` / `gates-mutate-2026-11-11T20-15-00.000Z.json` | 绿 | R17 第二轮的门禁证据：事实包把测试数改成 193、全部对外文件再重生成一遍之后（192→193 tests） |
| `gates-2026-11-12T08-35-00.000Z.json` / `gates-mutate-2026-11-12T08-40-00.000Z.json` | 绿 | **当前**门禁证据：P-0010 落地、双包 bump 0.3.7、11 个对外文件按「0.3.7 未发布」口径重生成、文档与台账全部对齐之后，`ALL GREEN · 6 gates` 与 `6/6 CAUGHT`，195 tests |
| `live-2026-11-12T06-00-00.000Z.json` | 绿 | **0.3.6 真机**：60 流 / 1 修复 / `fused:1 repaired:1` / 合成 id 被派发并回答 / verdict `repaired`（P-0001 已引用） |
| `patch-registry-2026-11-12T08-30-00.000Z.json` | 绿 | **当前**注册表快照（十补丁：P-0001/2/3 `verified`，P-0004…P-0010 `tested`；sha256 `d7062485…`） |
| `scan-full-2026-11-11T18-15-00.000Z.json` | 绿 | 全目录 `scan --out` 产物：78 文件 / 393 attempts / 38 fused / 44 fusion failures / 293 turns |
| `session-sample-2026-11-11T18-10-00.000Z.json` | 绿 | 本机 census 样本（`--until 2026-11-11T17:00:00.000Z`，两条 stamp 除 `generated_at` 外逐字节相同） |
| `install-acceptance-2026-11-11T19-30-00.000Z.json` | 绿 | 0.3.6 空目录从 registry 单装 `OK 6 fixture(s)`（R17 首次把这个验收落成产物） |
| `publish-2026-11-11T17-35-00.000Z.json` | 绿 | 0.3.6 发布：两包 `exact_ok` + `latest_ok` 全 true |
| `publish-2026-11-09T20-00-00.000Z.json` | 绿 | 0.1.0 发布（core + plugin） |
| `publish-2026-11-10T00-10-00.000Z.json` | **红（保留）** | 0.1.1 副本延迟，记录时还看不到 |
| `publish-2026-11-10T06-40-00.000Z.json` | 绿 | 0.1.1 settled：core 0.1.0 / plugin 0.1.1 |
| `session-sample-2026-11-10T11-20-00.000Z.json` | 绿 | 本机故障样本（`--until` 截断，可复现） |
| `publish-2026-11-10T20-00-00.000Z.json` | 绿 | 0.3.2 发布：两包 `exact_ok` 与 `latest_ok` 均为 true |
| `publish-2026-11-11T08-35-00.000Z.json` | 绿 | 0.3.3 发布：两包 `exact_ok` 与 `latest_ok` 均为 true（plugin shasum `46ad57ea…` / core `6fbbeb06…`） |
| `publish-2026-11-11T12-30-00.000Z.json` | 绿 | 0.3.4 发布，两包 `exact_ok` 与 `latest_ok` 均为 true（plugin shasum `5f20282e…` / core `38400db9…`） |
| `publish-2026-11-11T15-05-00.000Z.json` | 绿 | 0.3.5 发布，两包 `exact_ok` 与 `latest_ok` 均为 true（plugin shasum `c1b1b431…` / core `cc9895f8…`）；14:55 那次因副本延迟记成 `ok: false`，已删 |

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
| 会话日志是多帧 zstd | `zstdDecompressSync` 只解第一帧；用 `decompressSessionLog`。**`scan` 曾经直接按 utf8 读 zstd，于是把 236 行压缩字节全记成 unreadable**（P-0004 已修） |
| headless 不写 `assistant/attempt` | live 产物的 `session.fused_calls` 会是 0；修复靠 journal 计数 + 合成 id 证明（`BS-07`） |
| 桌面 journal 覆盖整个进程 | 2 次修复可能跨 2 个会话；artifact 的 `journal_scope` 写明（`BS-09`） |
| registry 副本会延迟 | 发布后 `record_publish` 可能先红；等约 5 分钟用新 stamp 重记（`BS-10`） |
| 适配器不发 `block-end` | 实测序列 `block-start → tool-call-delta* → usage → finish{error}`；修复点必须在 `finish`。这也让 P-0002 的原子提交路径无法 live 证（`BS-11`）；能 live 证的是 `finish` 救援路径（`live-2026-11-10T14-45-00.000Z.json`） |
| `retryPolicy` 不是修复 | 加 `MALFORMED_RESPONSE` 只是再撞一次；默认 `retryOnMalformed: 0` |
| 消息回退是英文 | `Received arguments:` 本地化后失效；delta 缓存路径仍有效 |
| 脱敏要覆盖形状 | 同一台机器的 home 会以 `C:\\Users\\...`、`C:/Users/...`、以及
  `--C-Users-...-~9879~76EE~5F00~53D1-...--` 三种形态出现；只写一种正则就会漏（P-0004） |
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

- 桌面 profile 与 `remedy-live` profile 现在都指向 **`.tmp/pack17/dsh-remedy-0.3.5.tgz`**（直改
  `package.json` + `pnpm-workspace.yaml` 的 `overrides`），换装脚本是 `.tmp/switch-profiles-035.mjs`；
  两个 profile 内 `verify` 都是 6/6、两包都是 0.3.5，但桌面 App 仍需重启才加载。
  在这台机器上走 profile 换装是因为本地 tgz 可以成对替换；registry 上的两包也已都是 0.3.5，
  所以 `dsh plugin --profile desktop add dsh-remedy` 现在能解析到 core。
- **npm 上 `latest` 是 0.3.5**（两包，2026-11-11 发布，空目录单装验过 6/6）。0.2.0 与 0.3.1 从未进入 registry；
  0.3.0 的 plugin 到 registry 时带着 `workspace:*`，装不上，也不能撤回（超过 24 小时）。
  发布账号是 `auth-and-writes`：每次写入都要现码，脚本会先跑 `npm whoami`；
  `npm profile get tfa` 在 2026-11-11 回 `E403`（端点权限），preflight 不依赖它。
- 容器 `main` 未推 `dsh-triage` 远端。
- npm 上的 `0.0.0-stage` 是发布流程的占位版本，不是 `latest`。
- 对话里出现过的两个 npm token 应作废；仓库与 artifact 里没有它们。
- P-0003 已 `verified`，但只证了**预算拒绝**那一支：`live-2026-11-10T16-30-00.000Z.json` 的
  journal 写了 `too-many-calls` + `fused:1 refused:1 unrepaired:1 withdrawn:0`，会话 `turn_end=error`
  且 `tool_calls:0`、无合成 id（拒绝时没有假装修好）。真机出现 `withdrawn`（中途撤回或截断）
  仍未被测，这条写在 P-0003 的 limits 里。
- `agent/request-error` 的 retry 仍默认关闭。
- P-0004 永远停在 `tested`：它改的是离线读取器（`scan`）与脱敏规则，没有常驻接缝，live journal
  无法见证它；能见证的是那 78 文件 / 375 attempts 的一次性实测与 12+9+8 条单测。
- P-0006 同样永远停在 `tested`：它也改离线读取器。它只**报告**结尾分布，不改退出码；
  截断永不修（缺字节不是缺引号，且实测 0/88 可归因到某个调用）。
