# 轻量化方案：0.2.0 发布包瘦身（2026-11-10）

> **结论**：plugins 的 tarball 从 `26 345` 字节（0.1.1，未压缩 `98 424` / 30 文件）降到
> **`19 114` 字节**（同机对照 `28 756 → 19 114`），dist 里只剩 5 个 `.js` + 5 个 `.d.ts`，
> **24 个 sourcemap 全部不在包里**，而 `dsh-remedy verify` 在“安装副本”上仍 5/5 通过。
> 本轮改动只落在打包配置与 `sync_fixtures.mjs --check`，**没有动 `src/*.ts` 逻辑、没有 bump 版本、没有 publish**。

---

## 1. before / after 字节表

### 1.1 0.1.1 基线（npm 登记的发布物）

| 类别 | 文件数 | 未压缩字节 | 是否进 after | 说明 |
|---|---:|---:|---|---|
| `dist/*.js` | 5 | 38 278 | ✅ | 运行时代码（必要） |
| `dist/*.js.map` | 5 | 35 169 | ❌ 已排除 | 只对源码调试有用，包里没有 `.ts` |
| `dist/*.d.ts` | 5 | 10 272 | ✅ | `exports` 的 `types` 指向它们 |
| `dist/*.d.ts.map` | 5 | 6 757 | ❌ 已排除 | 编辑器跳转用，包里没有 `.ts` |
| `fixtures/toolcall-fusion/*.json` | 5 | 2 147 | ✅ | `verify` 的数据源（0.1.0 的事故点） |
| `fixtures/checksums.json` | 1 | 547 | ✅ | `sync_fixtures --check` / fixtures-sync 测试的对照物 |
| `package.json` / `LICENSE` / `README.md` / `cordis.patch.yml` | 4 | 5 254 | ✅ | 元数据与加载入口 |
| **合计** | **30** | **98 424** | — | gzip 后 **26 345** |

数据来源：`docs/research/stability-audit-2026-11-10.md` §3.1（该表把 30 个文件误记为“25”，
逐行相加 5+5+5+5+5+1+4 = 30；未压缩合计 98 424 字节可由逐项相加复算，两组数字自洽）。

### 1.2 after：本机实测 `pnpm pack` 产出的 tarball

（`tar -xzf` 解包后逐文件 `stat`，脚本见 `.tmp/after-categories.mjs`，产物 `.tmp/after-categories.json`）

| 类别 | 文件数 | 未压缩字节 | 相对 0.1.1 |
|---|---:|---:|---:|
| `dist/*.js` | 5 | 44 696 | +6 418（见下方注） |
| `dist/*.js.map` | 0 | 0 | **−35 169** |
| `dist/*.d.ts` | 5 | 10 504 | +232 |
| `dist/*.d.ts.map` | 0 | 0 | **−6 757** |
| `fixtures/toolcall-fusion/*.json` | 5 | 2 147 | 不变 |
| `fixtures/checksums.json` | 1 | 547 | 不变 |
| `LICENSE` / `README.md` / `cordis.patch.yml` / `package.json` | 4 | 5 276 | +22 |
| **合计** | **20** | **63 170** | **−35 254（−35.8%）** |

- **tarball 本体：19 114 字节**（`pnpm pack --pack-destination .tmp/packs-after`，实测）。
- `dist/*.js` 变大是**并发改动**，不是本轮的代价：同一工作树里 `packages/plugin/src/repair-stream.ts`
  被 Lead 的 P-0002 补丁改大，`repair-stream.js` 从 11 710 → 18 128 字节、`repair-stream.d.ts`
  从 4 421 → 4 653 字节（其余 4 个 `.js` 未变：`cli.js` 12 667 / `index.js` 4 742 /
  `session-log.js` 2 232 / `session-scan.js` 6 927）。因此 after 侧的 `.js` 不能与 0.1.1 逐字节对读，
  真正的配置收益看下一节的同机 A/B。


### 1.3 同机 A/B（同一份 dist、只切换打包配置，唯一干净对照）

| 包 | before（`files` 无否定 + 无 `.npmignore`） | after | 差 |
|---|---:|---:|---:|
| `dsh-remedy`（plugin） | 28 756 B / 30 条目 | **19 114 B / 20 条目** | **−9 642（−33.5%）** |
| `dsh-remedy-core` | 17 492 B / 31 条目 | **10 518 B / 17 条目** | **−6 974（−39.9%）** |

测量方式：`.tmp/tarball-compare.mjs` 两次 `pnpm pack`，中间把 `.npmignore` 临时移走以复现 0.1.1 的
“无排除”状态；`dist` 指纹（文件名+字节数+sha256 前 8 位）在两次测量间**完全一致**
（`.tmp/measure.json` 的 `distStable: true`），所以差值只能来自打包配置。
`npm pack --dry-run --json` 的独立复核（`.tmp/measure.mjs` / `.tmp/measure.json`）：
plugin `108 617 → 62 152` 未压缩、`27 678 → 18 268` gzip；core `51 101 → 32 277` 未压缩、
`16 067 → 9 268` gzip，两侧 map 数均为 0。
（两边总差 1 018 字节 = dry-run 清单不含 `LICENSE`（1 080）− `pnpm pack` 把
`dependencies` 的 `workspace:*` 改写成 `0.1.0` 后 `package.json` 缩小的 62 字节；以解包 tarball 值为准。）

---

## 2. 实际改了什么

| # | 文件 | 改动 | 对应验证 |
|---|---|---|---|
| 1 | `packages/plugin/package.json:26-32` | `files` 加 `"!dist/**/*.map"`（保持 `dist`/`fixtures`/`cordis.patch.yml`/`README.md`） | `tests/unit/package-files.test.ts`；`.tmp/tarball-compare.mjs` |
| 2 | `packages/core/package.json:14-18` | 同上（`dist` / `!dist/**/*.map` / `README.md`） | 同上 |
| 3 | `packages/plugin/.npmignore`（新建） | `dist/**/*.map` + 注释：npm 11 对 `files` 白名单内的路径**不读** `.npmignore`，真正生效的是否定模式 | 同上 |
| 4 | `packages/core/.npmignore`（新建） | 同上 | 同上 |
| 5 | `scripts/sync_fixtures.mjs` | 新增 `--check`：只比对字节与 `checksums.json`，不写盘；漂移 exit 1 并逐条打印，无夹具仍 exit 3；**默认（无 `--check`）行为与原来完全一致**（prepack 依赖它） | `tests/unit/fixtures-sync.test.ts`；`node scripts/sync_fixtures.mjs --check` |
| 6 | `tests/unit/package-files.test.ts`（新建，4 条） | 断言两份 `.npmignore` 含 `dist/**/*.map`、两个 `files` 含 `!dist/**/*.map` 且仍含 `dist`/`README.md`、`bin`/`exports` 仍指向 `dist`、`tsconfig.base.json` 的 `declaration` 仍为 `true` | `node --test tests/unit/package-files.test.ts` |

### 2.1 一个必须记录的坑（否则下一位会重犯）

npm 11 的文档写的是“`files` 里的路径不能被 `.npmignore` 排除”。实测确认：
`files: ["dist", ...]` + `.npmignore: dist/**/*.map`（或 `**/*.map`、`/dist/**/*.map`）时，
**10 个 map 全部照进包**（`npm pack --dry-run` 的 files 数仍是 29）。只有把否定模式写进 `files`
本身（`"!dist/**/*.map"`）才真正生效（files 数 → 19，map 数 → 0）。
`.npmignore` 之所以还保留，是**纵深防御**：万一将来有人删掉 `files` 数组，map 仍不会漏出去。
`tests/unit/package-files.test.ts` 的第四条把这一点固化成了事实：两条 assert 同时存在，缺一即红。

---

## 3. What we did NOT do and why

1. **没有关掉 `tsconfig.base.json:16-18` 的 `declarationMap` / `sourceMap` / `composite`。**
   - `declarationMap: false` 只省下 `.d.ts.map`，却让“从 `.d.ts` 跳回源码”在本地开发时失效；
     `sourceMap: false` 则让本地调试栈无法映射。两者对**发布包**没有影响——它们由 `files` 否定模式在打包时筛掉，
     编译产物对开发者仍然完整。
   - `composite: true` 是 `tsc -b` 项目引用（`tsconfig.json` 的 `references`）的前提，关掉会破坏增量构建，
     与“省 6.7 KB 发布包”完全不成比例。
   - 取舍：**保留本地调试能力，只让发布物变瘦**。代价是 `dist` 里仍留着 map（gitignored、不进 git、不进包）。
2. **没有把 fixtures 移出包。** `cli.ts:109-116` 的 `fixtureDir()` 从 `dist/../fixtures` 找夹具；
   0.1.0 的真实事故就是夹具没进包，安装副本 `verify` 直接 exit 3（`CHANGELOG.md:11`）。
   `verify` 的价值全部来自“安装的那一份能自证”，所以 2 147 字节必须留。
3. **没有删 `fixtures/checksums.json`。** 审计 §3.3 说它“无消费者”时它是**对的**（当时 `cmdVerify` 只
   `readdirSync` + `JSON.parse`）。本轮 `sync_fixtures --check` 把它变成了真正的消费者：
   `--check` 比对 `checksums.json` 里记录的 `source` 与 5 个 sha256，能抓住“生成的副本和
   `data/fixtures` 漂移”。同时 `tests/unit/fixtures-sync.test.ts:28-38` 一直是它的读者。547 字节换取
   “打包前后夹具漂移可被门禁发现”，保留。
4. **没有把 5 个夹具收敛成一个紧凑 JSON。** 需要同时改 `cli.ts` 的 `cmdVerify`、`sync_fixtures.mjs`、
   `tests/unit/fixtures-sync.test.ts` 与 `tests/e2e/cli.test.ts` 的 `OK 5 fixture(s)` 断言，
   而这会碰 `src/*.ts`（本轮写域禁止），收益上限约 1.5 KB。风险/收益不成比例，**不采纳**。
5. **没有动 `sideEffects: false`。** 插件在 DSH loader 侧是 `apply()` 显式注册（`packages/plugin/src/index.ts`），
   理论上是函数调用而非模块副作用；但本轮没有跑真机 loader 挂载验证，写进 `sideEffects: false`
   等于用一个未验证的字段赌 loader 的导入行为。**unverified → 不做**。

---

## 4. Residual weight（还能减，但本轮明确不做）

| 项 | 可省上限 | 为什么不做 |
|---|---:|---|
| `dist/*.d.ts`（10 504 B） | 全量 | `exports` 的 `types` 与 `main` 邻接的类型入口；删了 = 破坏 TS 用户体验，且 `gate_copy` 之外的契约测试会红 |
| `.js` 本体（44 696 B） | 视源码 | 属 Lead 的补丁改动范围，非打包配置能解 |
| fixtures（2 147 + 547 B） | ~1 500 B | 需改 `src/cli.ts` 并重写 `verify` 的读取路径（见 3.4），本轮写域外 |
| `README.md`（1 570 B） | 全量 | `files` 白名单必须留对外说明；仓库层 README 是 `docs/copy` 的产物，不归本轮 |

结论：**剩下 63 170 字节里 ~46 KB 是运行时代码 + 类型，已经接近“必要载荷”**；
再往下压只能动参与发布的可读文档或 `.js` 本身，收益 < 8%，不做。

---

## 5. 实际命令输出（本轮实跑，未改动任何 src）

```
$ pnpm run build
$ tsc -b                                        # exit 0

$ pnpm run typecheck
$ tsc -p tsconfig.tests.json --noEmit           # exit 0

$ pnpm run test
ℹ tests 111   ℹ pass 111   ℹ fail 0

$ node scripts/gate.mjs
PASS    ssot                  83ms
PASS    registry             121ms
PASS    namespace             89ms
PASS    step-review          91ms
PASS    copy                 101ms
ALL GREEN · 5 gates

$ node scripts/gate.mjs --mutate
CAUGHT  ssot                  97ms
CAUGHT  registry             108ms
CAUGHT  namespace            110ms
CAUGHT  step-review           92ms
CAUGHT  copy                  97ms
NEGATIVE CONTROL PASSED · 5/5 gates caught their injected violation

$ node --test --test-reporter=spec "tests/unit/package-files.test.ts"
✔ every package ignores dist sourcemaps in .npmignore
✔ the files whitelist drops sourcemaps itself, because npm ignores .npmignore inside a whitelist
✔ the shipped entry points still resolve to files inside dist
✔ declarations stay on so the negation cannot break the types
ℹ tests 4   ℹ pass 4   ℹ fail 0

$ node scripts/sync_fixtures.mjs --check
sync_fixtures --check: 5 fixture(s) in sync with data/fixtures/toolcall-fusion   # exit 0

$ node scripts/sync_fixtures.mjs            # 默认模式，prepack 用的那条路径
sync_fixtures: 5 fixture(s) -> packages/plugin/fixtures/toolcall-fusion           # exit 0

# --check 的负对照：改一个字节后必须红
$ node scripts/sync_fixtures.mjs --check    # 先篡改 truncated.json
sync_fixtures --check: bytes drifted: truncated.json (0dfb03ec… != c65bf182…)
sync_fixtures --check: 1 problem(s); run scripts/sync_fixtures.mjs to regenerate  # exit 1
$ node scripts/sync_fixtures.mjs --check    # 还原后
sync_fixtures --check: 5 fixture(s) in sync with data/fixtures/toolcall-fusion   # exit 0
```

### 5.1 安装副本复证（“装的就是发的那一份”）

只解两个 tarball 到 `.tmp/verify-install/node_modules/{dsh-remedy,dsh-remedy-core}`（不经源码），
跑 `node node_modules/dsh-remedy/dist/cli.js verify`：

```
PASS  braces-in-string.json — repaired
PASS  session-9045e2ec-seq-526.json — repaired
PASS  single-broken.json — rejected
PASS  truncated.json — rejected
PASS  valid-two-calls.json — unchanged
OK  5 fixture(s)
```

夹具路径解析走的是 `cli.ts:112` 的 `../fixtures/toolcall-fusion/`（安装态分支），**不是**源码分支，
证明 `files` 的否定模式没有误伤 fixtures。

### 5.2 未测 / 需 Lead 收口

- **最后一次 `node scripts/gate.mjs` 期间 `copy` 变红**：`facts-current:*` 与 `manifest-facts` 全部报 stale。
  原因不在本轮改动——`docs/copy/facts/public-repo-facts.md` 正在被 Lead 的并发批次重写（`git status` 显示
  `M docs/copy/facts/public-repo-facts.md` + 6 个 `docs/copy/prompts/*`），manifest 的 `facts_sha256`
  还没重新对齐。同一轮里 `copy/plugin-description`、`copy/core-description` 均 PASS，
  说明两份 `package.json` 的 `description` 没被本轮的 `files` 改动扰动。该门需 Lead 在事实包定稿后复跑。
- **条目数口径**：本轮 `tar -tzf` 实测 **20 条**（5 `.js` + 5 `.d.ts` + 5 夹具 + `checksums.json` +
  `LICENSE` + `README.md` + `cordis.patch.yml` + `package.json`）。Lead 报 21，
  差 1 条可能是把 `package/` 目录条目或某个 dry-run 文件计入——**以 `tar -tzf` 的 20 为准**，请复核。
- **`pnpm run verify` 一体化链路**：本轮按 `build → typecheck → test → gate` 分步跑，前四步中
  build / typecheck / test 全绿；`gate` 的 5 门在并发事实包改写前的一次完整运行是 **ALL GREEN · 5 gates**，
  `--mutate` 是 **5/5 CAUGHT**（见 §5）。最后一次重跑因上述外部原因 `copy` 红，需 Lead 收口后复跑。
- **真机 loader 挂载**（`sideEffects` 议题的前提）：未跑，故未采纳。

---

## 6. 一句话交付

`files` 的否定模式（而不是 `.npmignore`）把 24 个 sourcemap 挤出发布包：
**19 114 字节**，比 0.1.1 的 26 345 字节小 **7 231 字节（−27.4%）**，
比未压缩 98 424 字节小 **35 254 字节**；`verify` 在纯 tarball 安装副本上仍 5/5 绿。
