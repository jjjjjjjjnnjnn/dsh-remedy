# HANDOFF — dsh-remedy

> 五分钟能接手。读完这三份就够：本文件 → `PROJECT_RULES.md` → `AGENTS.md`。

## 五分钟检查

```powershell
cd dsh-remedy
pnpm install
pnpm run verify                 # build → typecheck → test → gate
node scripts/gate.mjs --mutate  # 每门都必须红
node packages/plugin/dist/cli.js verify   # OK 5 fixture(s)
```

任何一条不是绿的，先修它，再读下面的批次。

## 当前批次

**R5（2026-11-10）· 0.1.1 已发布，陌生人安装验收通过。**

- 0.1.0 的 tarball 没有带 `data/fixtures`，空目录装包后 `dsh-remedy verify` 退出 3；
  这是已发布产物的真实缺陷。0.1.1 用 `prepack`（`scripts/sync_fixtures.mjs`）把夹具打进
  `fixtures/`，CLI 同时支持“安装副本”和“源码检出”两种路径。
- 发布 `dsh-remedy@0.1.1`（core 仍 `0.1.0`）。空目录 `npm install dsh-remedy@0.1.1`
  后 `npx dsh-remedy verify` **5/5 夹具通过**。
- 第一份 0.1.1 取证 `publish-2026-11-10T00-10-00.000Z.json` 是红的：registry 副本在
  记录后几秒才出现（发布 06:35:35Z，记录 06:35:37Z 还是 null）。红产物保留，不编辑；
  新 stamp `publish-2026-11-10T06-40-00.000Z.json` 为 `ok: true`（core 0.1.0 / plugin 0.1.1）。
- Release：`v0.1.0`、`v0.1.1` 都在 GitHub 上。

**R4（2026-11-09）· npm 0.1.0 已发布。**

- npm 账号没有 `@dsh-remedy` organization，发布 `@dsh-remedy/core` 返回
  `Scope not found`；core 已改成无 scope 的 **`dsh-remedy-core`**（插件本来就是
  `dsh-remedy`），imports / lockfile / 文档 / 全部 copy 文件同步更新。
- 手动发布完成：`dsh-remedy-core@0.1.0` + `dsh-remedy@0.1.0`，官方 registry
  `latest` 都是 `0.1.0`。
- 证据：`data/results/publish-2026-11-09T20-00-00.000Z.json`（`ok: true`、
  `git_dirty: false`）。
- 公开仓库 `https://github.com/jjjjjjjjnnjnn/dsh-remedy` 已推送、CI 绿、
  topics 与私密漏洞报告已设置。

**R3（2026-11-09）· 桌面 profile 挂载 + App 重启，桌面进程内修复 2 次。**
`39 条流 / 2 次粘连 / 2 次修复 / 0 未修复`；证据
`data/results/live-desktop-2026-11-09T19-10-00.000Z.json`，答案后人工停止，
`turn_end=aborted` 如实记录。

**R2（2026-11-09）· P-0001 真机验证通过（`tested` → `verified`）。**
headless `remedy-live` 第 2 次运行命中，10 条流 / 1 次修复 / 整轮 `completed`；
证据 `data/results/live-2026-11-09T17-00-00.000Z.json`。

## 第一件事

**进入 P-0002，或者把桌面 profile 从 0.1.0 tarball 换到 0.1.1（运行时代码相同，换是为了
“装的就是发的那一份”）。** 发布链已经闭环：`pnpm --filter dsh-remedy publish` →
`record_publish` → 空目录 `npm install` + `verify` → release。

验收：

1. 新补丁按 `docs/patches/` → registry `drafted` → 负对照测试 → 真机 live 的顺序落地；
2. 每次发布都有一份 `data/results/publish-*.json`，红产物保留、用新 stamp 重记；
3. 事实包改动后所有 copy 文件重新生成，`node scripts/gate_copy.mjs` 绿。

## 已知坑

| 坑 | 说明 |
|---|---|
| 桌面 UI 自动化 | App 用 `--remote-debugging-port=9222` 重启后，`Input.insertText` + Enter 可发任务；"新建会话"按钮不一定存在，先查 `button` 文本 |
| `llm/stream` 是同步 waterfall | 监听器不能写成 `async`；否则流被包成 Promise，报 `stream is not async iterable`。`agent/request-error` 相反，是 await 的 |
| headless profile 的 `credentials` 默认 disabled | 要在 profile 的 `cordis.patch.yml` 里写 `- id: credentials` + `disabled: false`，否则 `MISSING_CREDENTIAL` |
| 会话日志是多帧 zstd | `zstdDecompressSync` 只解第一帧；用 `decompressSessionLog`（`packages/plugin/src/session-log.ts`） |
| headless 不写 `assistant/attempt` | 所以 live 产物的 `session.fused_calls` 会是 0；修复靠 journal 计数 + 合成 id 证明（`BS-07`） |
| 适配器不发 `block-end` | 实测失败序列是 `block-start → tool-call-delta* → usage → finish{error}`；修复点必须在 `finish`，不能等 `block-end` |
| `retryPolicy` 不是修复 | 加 `MALFORMED_RESPONSE` 只是再撞一次；默认 `retryOnMalformed: 0` |
| 消息回退是英文 | `Received arguments:` 一旦本地化就失效；delta 缓存路径不受影响 |
| 合成 id 不是稳定身份 | `<id>#remedy-N` 只用于本轮追踪 |
| 截断与粘连不同 | `finish{kind:'max-tokens'}` 一律不修 |
| 门禁依赖构建 | `gate_registry` / `gate_namespace` 要读 `dist/`；`--fast` 会跳过它们 |

## 台账

| 问题 | 答案在 |
|---|---|
| 现在有哪些补丁？ | `packages/core/src/registry.ts` → `PATCHES` |
| 某个补丁的证据和守卫？ | `audit/patch_ledger.json` |
| 这一步 review 过吗？ | `audit/step_reviews.json` |
| 哪里还看不见？ | `audit/blind_spots.json` |
| 谁写的代码？ | `audit/AI_DISCLOSURE_LOG.md` |
| 门禁为什么红？ | `node scripts/gate.mjs`，失败行会点出 check id |
