# AGENT-WORKFLOW — 负责 Agent 的工作流（单一入口）

> 这份文档回答四件事：**我现在该做什么、事情归谁管、我的需求/想法往哪放、做完怎么留证。**
> 规则条文在 `PROJECT_RULES.md`，技术细节在各专题文档；本文件只做导航与顺序，不复制它们的判据。
> 宣传状态的唯一状态机在**本机知识库 Promotion Bus**，不在本仓库。

---

## 0. 开工第一屏（每次会话先跑）

```powershell
pnpm install
pnpm run verify                     # build → typecheck → test → gate
node scripts/gate.mjs --mutate      # 6 门都要红
node packages/plugin/dist/cli.js verify
npm view dsh-remedy version
```

然后读 `docs/HANDOFF.md` 的「三十秒状态」与「下一件事」；若涉及宣传，再跑 `kb promo status`。
任何一条不是绿的，先修根因，再往下走。**提交前一定跑 `pnpm run verify`，不是只跑 `gate.mjs`。**

---

## 1. 归属表（谁是什么的真相源）

| 主题 | 真相源 | 本仓库的角色 |
|---|---|---|
| 补丁、状态、证据、守卫 | `packages/core/src/registry.ts` + `audit/patch_ledger.json` | 唯一列表 |
| 数字（版本/测试/字节/包体） | `docs/copy/facts/public-repo-facts.md` | 唯一数字源；新增数字先入事实包 |
| 对外文字 | copy 通道（`scripts/copy_record.mjs` + manifest） | 登记后禁止手改 |
| 真机/门禁/发布证据 | `data/results/*.json` + `.sha256` | 脚本产出，stamp 是身份 |
| 交接、当前批次、第一件事 | `docs/HANDOFF.md` | 活文字必须描述这棵树 |
| **宣传排期/台账/事实卡/评论回收** | **知识库 `Promotion/` 总线** | **只提供 `promotion-snapshot/v1`；`docs/reach/` 是人读 signal** |
| Agent 的需求、想法、工单 | 知识库总线 inbox / `kb_dispatch` | 本仓库只留执行结果，不放第二份待办 |

---

## 2. 每日循环

1. 跑 §0 的四条命令；红了修根因。
2. `kb promo status`：看版本是否一致、哪些草稿 ready、哪些评论超 24h、哪些渠道在冷却。
3. 人工核对 API 看不见的一半：X 通知、Reddit 作者视角、dev.to 评论正文、dsh.so 页面。
4. `node scripts/daily-reach.mjs` 写人读台账；`kb promo collect --project dsh-remedy` 写总线快照。
5. 有新评论要回的，回完把 URL 写进总线 `inbound/`，不要只留在脑子里。
6. 安静的一天写「no change」；读不到写 `unreachable`，绝不写 0。

---

## 3. 需求与想法怎么处理（这是我自己的入口）

作为负责 Agent，我会有需求（例如「想要一份 per-sub 的 Reddit 排期」）或想法（例如「想试 HN」）。
处理协议固定：

1. **能在本仓库直接落地的**：先写成测试/脚本/文档变更，跑 `pnpm run verify`，结果写进 HANDOFF 的当前批次。
2. **需要跨项目或跨渠道协调的**：用知识库总线登记——
   - 一般性需求/线索：`kb_create` 合适类型（如 `reference` / `inbox_item`）并写清来源与判据；
   - 明确要有人或其他 Agent 做的：`kb_dispatch`（title / target_agent / deliverables / deadline）；
   - 宣传相关的发布动作：`kb promo record`，不在这里另开状态表；需要总线派发时 `target_agent` 用 `agent-promotion`，不要用 `agent-tech`。
3. **需要人类决定的**：登录/2FA/验证码、HN/V2EX 正文、是否发版，列出事实卡与选项后交本人，
   不替人过验证、不代写平台禁止的 AI 文本。
4. **不许静默丢弃**：不值得回的评论/想法也要写一句为什么不跟进。

---

## 4. 开发/修复流程

1. 症状写进 `docs/patches/`（症状、机制含文件行、反证、边界），`registry.ts` 从 `drafted` 开始。
2. **判据先行**：先写负对照，旧构建下必须红；再写实现；再加注入式负对照防退化。
3. 一次只改一个声明的 `surface`。任何“看起来修好了”的路径都要先证明每个片段能 parse。
4. 新证据必须是脚本产物（带 `produced_by` / `generated_at` / schema / sha256）。
5. 新增运行时字节要付账：压散文或去重，不抬 cap。
6. 收口：`pnpm run verify` → `gate --mutate` → 同步台账/补丁文档/HANDOFF/披露行/五轴 review。

---

## 5. 发版流程（一次发版 = 一条完整链）

1. 稳定性体检：`verify` + `mutate` + `cli verify` + `sync_fixtures --check` +
   真实 MALFORMED 回放 + 压力测试 + POSIX 半边同数。
2. bump 三份 manifest → `publish_packages.mjs --dry-run` → 真发 → `record_publish` →
   `record_install_acceptance` → 两个 profile 切换 → （有条件时）桌面真 turn。
3. 事实包翻版本/上一版/包体/测试数；CHANGELOG、两种首屏、release notes、冻结上一版 notes、
   market index、PUBLISH、AGENTS、HANDOFF 同轮更新；所有 live copy 条目重登记。
4. 公开仓库：`commit-tree` 从 `main:dsh-remedy` 切提交 → tree 逐字节相等 → push →
   tag + release（正文与 notes 去掉末尾换行逐字节相同）→ CI 全绿 → 回写 HANDOFF 公开面。
5. 发版后宣传交给总线：`kb promo facts` → `kb promo plan` → 逐渠道发帖 → `kb promo record`。

---

## 6. 宣传流程（状态与发帖都在总线，本仓库只供事实）

> 发帖、回帖与 `kb promo record` 只由知识库 `agent-promotion` 执行；本仓库 Agent 不直接发帖、不写 `ledger/`。

1. `kb promo plan dsh-remedy` 决定**今天该发什么**；`done/post/wait/blocked/human` 五态里，
   `human` 只交事实卡，不代写。
2. 每版的当期规则先读：版规 / CONTRIBUTING / 置顶帖三者；Reddit 的 per-sub 文案与规则在
   `docs/reddit-outreach.md`，**每天最多两版、文案不逐字相同**。
3. 发帖后立刻验证：X oEmbed、Reddit `removed_by_category`、目录状态、社交预览字节。
   站级过滤（`"reddit"`）→ modmail，**不重发、不换标题再试**。
4. `kb promo record` 记 URL 与验证结果；需要回的评论进 `inbound/`。
5. 24 小时 / 1 周复盘：看 referrer、第一个外部 issue、哪个渠道有回声；下一轮只加一个渠道。

---

## 7. 留证与交接

- 每一轮在 HANDOFF 顶部有「当前批次」与「下一件事」；批次叙事写当时，状态表写现在。
- 五轴 review（正确性/可复现/合规/SSOT/对抗）不能为空；披露行六格、SessionID 唯一。
- `docs/research/` 的规矩：外部报告只是线索，本机复现后才有补丁。
- 证据索引里的每个文件都要能打开；当前快照只能有一个「当前」。

---

## 8. 冲突与失败的处理顺序

| 现象 | 先做什么 | 不要做 |
|---|---|---|
| 门禁红 | 修根因、重跑 `pnpm run verify` | 放宽阈值、只跑 `gate.mjs` 就提交 |
| 版本漂移 | 翻事实包、copy 通道、HANDOFF、PUBLISH、market index 一整条链 | 只改一个页面 |
| 发布后 tarball 404 | 用 registry 元数据 shasum + 冷装验收证明 | 假设发布失败就重发 |
| 目录条目旧版本 | 判 `upstream`/`pending`，只读复查 | 重复提 PR / issue |
| 帖子被过滤 | 读 `removed_by_category`，走 modmail | 重发、换标题、刷票 |
| 数字对不上 | 回到命令现取，写进事实包 | 从记忆或旧文档抄 |

---

## 9. 文件地图（全线路）

| 文件 | 职责 |
|---|---|
| `docs/AGENT-WORKFLOW.md` | 本文件：导航与顺序 |
| `PROJECT_RULES.md` / `AGENTS.md` | 硬规则 / 入口与结构 |
| `docs/HANDOFF.md` | 当前状态、批次、第一件事、证据索引 |
| `docs/PROMOTION-PLAYBOOK.md` | 可复用推广流程与判据 |
| `docs/PROMOTION.md` | 事实卡指针、渠道状态、草稿、本机发布复核 |
| `docs/reddit-outreach.md` | per-sub 规则与定制文案 |
| `docs/reach/` | 人读 signal 副本；总线快照的现场对照 |
| `docs/distribution/README.md` | 市场/目录渠道台账 |
| `docs/research/` | 外部反馈 → 线索 → 本机复现 → 补丁 |
| `docs/compatibility.md` | 接缝拓扑、顺序与否决规则、外部印证 |
| `docs/patches/` / `docs/adr/` | 补丁文档与架构决定 |
| `audit/` | 五轴 review、披露、台账、盲点 |
| `scripts/gate_*.mjs` | 六道门禁 |
| `scripts/daily-reach.mjs --json` | 总线快照契约 |
| 知识库 `Promotion/` | 宣传唯一状态机（queue/ledger/facts/inbound/reach） |

---

## 10. 交接清单（给下一个人/下一个我）

- [ ] §0 四条命令全绿；不绿先修根因。
- [ ] 读 HANDOFF「三十秒状态」与「下一件事」；宣传再看 `kb promo status`。
- [ ] 新需求/想法已按 §3 落到正确的地方，没有静默丢弃。
- [ ] 当前批次、状态表、证据索引、披露行、五轴 review 同轮更新。
- [ ] 对外文字经 copy 通道，数字来自事实包。
- [ ] 宣传动作在总线登记，本仓库不留第二份状态。
