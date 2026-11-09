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

**R2（2026-11-09）· P-0001 真机验证通过（`tested` → `verified`）。**

- 真机 profile：`~/.dsh/profiles/remedy-live`（headless 模板 + desktop 的 provider 配置），
  用官方 `dsh plugin --profile remedy-live add <tarball>` 安装；dsh `0.2.2-rc.1`。
- 任务：同一条消息要求两次独立 `read`，第二次运行命中粘连。
- 结果：插件在 `llm/stream` 把一个 index 里的两个对象拆成两个调用；
  session 里能看到原 id + `call_00_…lzpv1cakrx#remedy-1`，两个 `tool/result` 都回来，
  `turn/end` 是 `completed`，最终答案正确。
- 计数：journal 与 attempts 交叉核对 `streams=10 / fused=1 / repaired=1 / unrepaired=0`。
- 产物：`data/results/live-2026-11-09T17-00-00.000Z.json`（+ `.sha256`），
  `produced_by: scripts/record_live_mount.mjs`，tarball sha256 一并记录。
- 第一次挂载抓到的真实缺陷：`llm/stream` 是**同步** waterfall，`async` 监听器会把流包成
  Promise，agent loop 报 `stream is not async iterable`。已改成同步包装，`tests/unit/plugin-mount.test.ts` 钉住。

## 第一件事

**把同一个 tarball 挂到 `desktop` profile（或发布后 `dsh-triage` 命名空间下的正式包），重启
桌面 App，跑一次真实的双工具任务；命中就再录一份 `data/results/live-*.json`，没命中就如实写 `quiet`。**

验收：

1. `gate_registry` 绿（`verified` 必须能找到 `data/results/live-*`）；
2. 新的 live 产物里 `counters.streams > 0`，且 `state` 是 `repaired` 或 `quiet`；
3. 如果桌面 App 一次都没撞上，产物如实写 `quiet`，**不要**为了再升一次状态去伪造修复。

## 已知坑

| 坑 | 说明 |
|---|---|
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
