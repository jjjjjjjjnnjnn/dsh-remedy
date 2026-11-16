# External feedback intake — dsh-remedy

> R43 起，项目的主线从「自己发现的缺陷」扩到「外部反馈 → 稳定补丁」。
> 这份文件规定**怎么收、怎么判、怎么变成补丁**；具体线索在 `leads.md`。

## 0. 一条硬规则：报告是线索，不是证据

一份 issue / discussion / 聊天记录**只能进 `docs/research/leads.md`**。
它变成补丁的前提是：**在本机 0.2.2-rc.3（或声明的版本）上复现**，并把可复现的形状
变成夹具 / 探针 / 脚本产物。

- `data/results/` 仍然只放脚本产出的产物（PROJECT_RULES §2）。
- 外部报告里的截图、日志、复现步骤：引用 URL + 日期，不把别人的文本当自己的实测。
- 不能复现的报告标 `unreproduced`，**不许**据此发补丁；可以据此写「诊断」类改动
  （P-0013 先例：先命名，不假装修）。

## 1. 报告在哪里

**来源登记在 `sources.md`，每个来源的读法、频率和边界都写在那里。** 这里只保留两条判据：

- `deepseek-ai/deepseek-harness` 的 issue 是关闭的，只有 Discussions；用 `search/issues` 会得到 0 条，
  不要因此得出「没有反馈」。
- 一件 2026-11-14 实测的小事：`fetch` 读 Reddit 会被 TLS 拒绝（`ECONNRESET`），
  只有 `websearch` 摘要可用。所以 Reddit 线索一律 `read_depth: summary`，规则见 `sources.md` §2。

一次巡检由 `scripts/collect_leads.mjs` 完成，产物是 `data/results/intake-<stamp>.json`；
它不编辑 `leads.md`，只报"哪些来源答了、哪些没答、有几个候选还没进账本"。`README.md` 的 §0
（报告不是证据）与 §3（线索到补丁的阶梯）不变。

**用词建议**：`MALFORMED_RESPONSE`、`Unexpected non-whitespace character after JSON`、
`tool input is invalid JSON`、`parallel tool calls`、`stream index`、`STREAM_CLOSED`、
`empty tool call`、`session resume`、`bundle patch`、`cordis.patch.yml`。

## 2. 线索账本（`leads.md`）

每行一条报告，字段固定：

| 字段 | 含义 |
|---|---|
| `id` | `L-0001` 起，不复用 |
| `source` | 完整 URL；discussion / issue / PR / 市场帖都算 |
| `reported` | 报告日期（不是我们读到的日期） |
| `seen` | 我们读到它的日期 |
| `version` | 报告里的宿主版本（不知道就写 `?`） |
| `class` | 猜测的失败类（host 词汇，如 `MALFORMED_RESPONSE` / `STREAM_CLOSED`），或 `unknown` |
| `seam` | 猜测的接缝：`llm/stream` / `agent/request-error` / `agent/pre-step` / `cli` / `profile` / `out-of-seam` |
| `status` | `lead` / `watching` / `reproduced` / `rejected` / `patched` |
| `decision` | 一句话：下一步做什么；`rejected` 必须写为什么（重复、已修、非本接缝、版本已过） |

状态推进只看事实：`reproduced` 必须能指向本机夹具 / 探针 / 产物；`patched` 必须能指向 `P-NNNN`。

## 3. 从线索到补丁（固定阶梯）

1. **版本探针**：报告是哪个版本？我们先在自己的 0.2.2-rc.3 上试，不在报告版本上猜。
2. **最小形状**：从会话 / 流里抽出最小片段，脱敏后进 `data/fixtures/`（或探针 profile）。
3. **归类**：
   - 在 `llm/stream`：拆粘连 / reseal / 拒绝 —— 走 P-0001 家族的判据；
   - 在 `agent/request-error`：命名 / 有界重试 —— 走 P-0011 / P-0013；
   - 在 CLI：scan / explain / 用量 —— 离线可证，最便宜；
   - 在 profile：`cordis.patch.yml` 的形状；**不要**写裸 `- id:`；
   - **out-of-seam**（adapter 吞错、会话格式、宿主崩溃）：不许假装修；可以写「诊断 / 体检」
     类改动（命名、计数、`explain` 覆盖），并在 patch limits 里写明修不到哪里。
4. **先红**：负对照测试先写，旧构建下必须红；修完绿；再加注入式负对照防退化。
5. **证据**：单测 + 夹具；能真机就真机（`verified`），不能就诚实 `tested`。
6. **发布**：与事实包 / CHANGELOG / README / release notes 同一轮翻口径。

## 4. 四条约束（每个补丁都要过）

**稳定性**

- 全有或全无：任何片段不能 parse，就原样抛回；永不把失败改成 `stop`。
- 不改有效流：只在证明有缺陷的 finish / block 上动手。
- 插件默认零写盘、零网络；新依赖一律不加（门禁本身也是零依赖）。
- 新增运行时字节必须付账：plugin 只剩 **143 B**（82 857 / 83 000；CLI 半边只剩 **38 B**），core 总账 **133 B**
  （103 867 / 104 000），其中 registry 有 **2 684 B**（65 316 / 68 000）。0.4.15 已发布，这一行是它的树。
  新记录只写台账字段 + 一句 symptom / 一句 rootCause / 短 limits，长文进 `docs/patches/`（P-0032）。

**安全性**

- 外部文本先脱敏再落盘 / 打印（P-0004 / P-0028）；不把 token、账号、本机路径带进仓库。
- 不整段抄别家代码：只学设计；确需借用时确认 MIT / Apache-2.0 / BSD 兼容，
  在 patch doc 里写来源与许可证；GPL / AGPL 一律不碰。
- 不从报告里复制可执行命令直接跑；先在隔离 `DSH_HOME` / 临时目录里看。

**效率**

- 能用离线判据（scan / explain / replay）就不用常驻接缝；常驻字节最贵。
- 每个新类先问：本机 census 里出现吗？`scan` 能数出来吗？能，就先做读取器。

**有效性**

- 每个补丁必须回答一个**用户能看见**的失败，或明确命名一个不能修的类。
- 失败类必须进 `explain` 的词汇表（或证明它不属于 turn-ending 词汇）；
  `docs/research/leads.md` 的 `class` 如果不在词汇表里，先补词表，再谈补丁。

## 5. 同类项目的读法

- `../dsh-triage`：同级项目，只读判断；它的分类法可以借，产物不要混。
- `ai-terminal-pet`、`dsh-remote-connect` 等社区插件：看它们怎么挂 `cordis.patch.yml`、
  怎么处理 profile 依赖、怎么做 npm 发布。
- 任何「学过来」的东西：在 patch doc 的 `rootCause` / `limits` 里写清「这个想法来自
  <URL>，我们复现的是哪一半，哪一半没有」。**不写来源的借鉴等于抄袭。**

## 6. 下一会话的第一件事

1. **A 表仍空；R55 的 79 个候选已在 R57 逐桶判读**（`docs/research/intake-r57-triage.md`）：只有两条
   进过账本语义——#11151 / #10732 是 P-0033/P-0036 的同族（不新增行），#13169 是 **P-0047**（本机探针
   复现后才落补丁）。#12741（工具循环结束后没有可见回复）**故意没数**：它的最后一步是 tool-call，本项目把
   tool-call 当作「转写里看得见的工作」，要数它就得先有探针与另一条规则。#12348（跨 profile resume 的
   capability drift）是 P-0042 的邻居，便宜的做法是让 `explain` 多打一行，不是改接缝。
2. **新线索从一次巡检开始**：`node scripts/collect_leads.mjs --stamp <ISO> --dsh --self --npm` 产出
   `data/results/intake-<stamp>.json`；它只说哪些来源答了、哪些没答、有几个候选还没进账本。
3. **0.4.16 已发布**（P-0045 + P-0046，并把 P-0011/P-0013 升成 `verified`）；本树在它之上有 **P-0047**
   （`completed` 却没有回答的 turn，探针 `live-completed-2026-11-16T18-30-00.000Z.json`）与 **P-0048**
   （macOS CI 判据），都未发布。
4. 复现成功 → 夹具 + 先红测试 + 编号只前进（下一个是 **P-0049**）。
5. 复现失败 → 标 `unreproduced`，写清版本差异，换下一条。
6. 动运行时字节前先付账：压散文或去重，**不抬 cap**（P-0032 的先例）。R57 付完之后：plugin **136 B**
   （CLI **204 B**）、core **132 B**、registry **3 007 B** —— 下一轮写记录之前必须先压一条老记录。
