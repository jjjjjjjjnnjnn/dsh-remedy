# 0.4.9 计划 — 从"自己发现的缺陷"到"社区驱动、可重复巡检"

> **0.4.9 已发布**（35 补丁，4 `verified` + 31 `tested`；DSH 0.2.2-rc.3）。这一版先补上
> "线索从哪里来、怎么判、怎么变成补丁"的机制（R44），再从 S-DSH 的新候选里挑出两条做成
> `P-0034` / `P-0035`（R45 / R46）。下面 §1 是机制，§2 是这一版的实际结案，§3 之后给下一版。
> 判据沿用 `PROJECT_RULES.md`：报告是线索，不是证据；没有本机复现就没有补丁。

## 0. 现在缺什么（0.4.8 收尾时的实测）

| 缺口 | 实测 | 后果 |
|---|---|---|
| 来源只有 DSH Discussions | 旧 README 除 Discussions 外都是"等对方"或"只读" | 反馈量取决于维护者是否合并，不取决于用户 |
| Reddit 读不到 | 三种域名都 `ECONNRESET`，只有 `websearch` 摘要 | 最大的抱怨池只能读到标题 |
| 没有巡检产物 | 27 条线索是 2026-11-14 手工翻出来的 | 下一轮无法证明"看过了" |
| 线索账本靠手写 | 只有表格，没有 `source_kind` / `read_depth` | 分不清"读到摘要"和"读到全文" |
| 装了我们包的人不在这里说话 | 1 star、0 用户 issue、4 个 dependabot PR；npm 月下载 2 720 | 有装的人，没有反馈闭环 |

## 1. 已完成（R44，2026-11-14）

| 项 | 产物 | 验收 |
|---|---|---|
| 来源登记 | `docs/research/sources.md`（7 个来源） | 每个来源有读法、频率、边界 |
| 社区盘面底稿 | `docs/research/community-2026-11-14.md` | 每个数字注明来源与日期 |
| 巡检脚本 | `scripts/collect_leads.mjs` + `scripts/lib/intake.mjs` | 读不到的来源记 `null` 不记 0；不编辑 `leads.md` |
| 一次巡检 | `data/results/intake-2026-11-14T16-45-00.000Z.json` | S-DSH 93 唯一 / 83 新；S-REDDIT unreadable |
| 账本两列 | `docs/research/leads.md`（31 行） | `source_kind` / `read_depth` |
| 判据 | `leads-shape.test.ts` 6 条 + `intake.test.ts` 6 条 | 307 tests / 6 gates / 6-6 mutate |

## 2. 已完成（R45 / R46，2026-11-14）：一条线索 → 两个补丁

| 线索 | 结局 | 产物 |
|---|---|---|
| #11337「benign prompt → `stop_reason: refusal` → `MALFORMED_RESPONSE`」 | `patched` | **P-0034**：未拒绝的 `MALFORMED_RESPONSE` 不再被记成安静的一轮（`docs/patches/P-0034-unbooked-failure.md`，先红 4 条） |
| #12318「patch 层指向已删除的子路径导出 → `never started` → 每次 resume 都失败」 | `patched` | **P-0035**：每个 `name:` 必须解析到 manifest exports + 已构建文件（0 运行时字节，`#12318` 那条 row 是负对照） |
| #6035「空 name/id → `UNKNOWN_TOOL`」 | `rejected (dup)` | 与 P-0033 同形状，版本更早 |
| #9066「adapter 把坏参数换成 `{}` 后工具照跑」 | `rejected (out-of-seam)` | adapter 在我们看见之前就换掉了原文，接缝无法诚实指认 |
| #11190「`type:'json'` 编译成无类型 schema」 | `rejected (no defect)` | `attribute.ts:73-76` 已把无类型判为「不可判定」，P-0030 不受影响 |
| #13069「无 finish 的流被当正常结束」 | `watching` | 本机 6/9 401 条无 finish，但没证明宿主当成功；缺一个脚本化 provider 的实测 |

## 3. 剩下的（0.5.0 起）

按 `sources.md` 的规则挑一条，候选按与当前接缝的距离排序：

| 候选 | 来源 | 为什么可能可修 | 先做什么 |
|---|---|---|---|
| #11843「大参数 invalid JSON」 | DSH（L-0003） | 可能是截断（P-0001 拒绝）或裸值（P-0005 覆盖） | 抽最小形状归类 |
| #12819「尾部多一个 `"]"`」 | DSH（L-0004） | 单对象坏 vs 粘连后截断，P-0001 与 P-0003 各管一半 | 归类后决定是否新补丁 |
| #13069 无 finish 的流 | DSH（L-0036） | 写完脚本化 provider 的实测就能定性 | 先做证据，再判是否本接缝 |
| Reddit「tool report 为空，DSH 说做完了」 | Reddit（摘要，L-0028） | **可能正是最该命名的静默类**：工具失败被当成完成 | 先读摘要 + 本机 census，再判 out-of-seam |

判据：一条线索只能走三种结局之一 —— `patched (P-0036 起)` /
`rejected (dup|out-of-seam|unreproduced)` / `watching`（写清还缺什么证据）。
**不许**出现"有补丁但没复现"。

## 4. 发版规则

- 若阶段 C 产出补丁：按同一条流程发版（copy 通道 / 快照 / publish / 装机 / 两个 profile）；
  **0.4.9 就是按这条规则发出去的**。
- 若只产出 `rejected`/`watching`：**不发版**，只更新 `leads.md`、`HANDOFF` 与 `audit`，
  并在交接里写清"这版没有新补丁，因为线索没通过复现"——这也是合法结果。

## 5. 字节与风险

- 来源与巡检全在 `scripts` / `docs`，**不增加常驻字节**。当前余量：plugin **123 B**
  （82 877 / 83 000）、core **2 687 B**（101 313 / 104 000）、registry **574 B**（67 426 / 68 000）。
- 风险 1：GraphQL 速率限制。做法：一次巡检把关键词合并成少量查询，结果落盘后再解析。
- 风险 2：Reddit 永久读不到正文。做法：把它当 `summary` 来源；不因此降低线索的判据。
- 风险 3：巡检脚本把"0 条"写成"没问题"。已用两条判据堵住（`intake.test.ts` 的 `null` 规则、
  `leads-shape.test.ts` 的 summary 不得升级）。

## 6. 完成定义

- `pnpm run verify` 绿，`gate --mutate` 6/6 —— **R46 实测：315 tests / 6 gates / 6-6**。
- `data/results/intake-<stamp>.json` 存在且 `sha256` 对得上。
- `sources.md` 与 `leads.md` 的字段一一对应（测试钉住）。
- 交接里有一句实话：这版要么带一个 `P-0034`，要么带一条写清为什么没补丁的 `rejected`。
