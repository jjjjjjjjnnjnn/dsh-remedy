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

**R3（2026-11-09）· 桌面 profile 挂载 + App 重启，桌面进程内修复 2 次。**

- `dsh-remedy` 已用官方 `dsh plugin --profile desktop add <tarball>` 装进桌面 profile，
  `.dsh/profiles/desktop` 的 `package.json` / `pnpm-workspace.yaml` / `cordis.patch.yml`
  改动前已备份到 `dsh-remedy/.tmp/desktop-profile-backup-*`。
- App 重启（带 `--remote-debugging-port=9222`），通过 CDP 在真实输入框发任务；
  同一进程 journal：**39 条流 / 2 次粘连 / 2 次修复 / 0 未修复**。
- 证据 `data/results/live-desktop-2026-11-09T19-10-00.000Z.json`：附带的
  `session-9045e2ec` 里能看到 `call_00_eurpysgrncrqocrhr4ao3uvi#remedy-1`，
  任务答案已产出；答案后人工停止，`turn_end=aborted`，artifact 如实记录。
- 桌面 journal 覆盖整个进程，2 次修复跨 2 个会话，session 文件只显示 1 个；
  artifact 的 `journal_scope` 写明（`BS-09`）。
- GitHub 公共仓库已创建并推送：`https://github.com/jjjjjjjjnnjnn/dsh-remedy`。

**R2（2026-11-09）· P-0001 真机验证通过（`tested` → `verified`）。**
headless `remedy-live` 第 2 次运行命中，10 条流 / 1 次修复 / 整轮 `completed`；
证据 `data/results/live-2026-11-09T17-00-00.000Z.json`。

## 第一件事

**npm 由你手动发布：`pnpm -r publish --access public --no-git-checks --otp <code>`
（先 core 后 plugin）；发布后跑 `node scripts/record_publish.mjs --stamp <ISO> --retries 3`
记录 registry 状态。然后更新事实包（npm 已发布）、重新生成全部 copy 文件、打 `v0.1.0` tag。**

验收：

1. `npm view dsh-remedy version` 与 `npm view dsh-remedy-core version` 都是 `0.1.0`；
2. `data/results/publish-*.json` 由脚本产出，`ok: true`，`git_dirty=false`；
3. 事实包改动后所有 copy 文件重新生成，`node scripts/gate_copy.mjs` 绿；
4. 验证码只出现在命令里，不写进仓库、不写进任何 artifact。

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
