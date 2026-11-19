# External negative feedback about DSH — collection and triage (2026-11-19)

> **Status of this document**: a lead register, not evidence. Per `docs/research/README.md` §0,
> an outside report only becomes a patch after the shape is reproduced on this machine and turned
> into a fixture, probe or script artifact. Nothing below was used to change runtime code.

## How it was collected

- The harness `websearch` tool was unavailable (HTTP 402), so collection used the local zero-account
  search MCP (`C:\Users\rongj\.claude\search-mcp`, Bing / Baidu / Bing News / Hacker News / Wikipedia /
  Baidu Baike) — **57 queries** in three batches, all answered; raw output kept in `.tmp/r75-search-*`.
- Two full articles were fetched from their origin domains (Tencent News, Sina Finance); one Hacker News
  thread was read in full. GitHub-side feedback came from the separate R74 intake (`intake-…07-00…`,
  65 candidates), so this document is the **non-GitHub half** of the web survey.
- Search terms covered English and Chinese: `bug`, `crash`, `negative review`, `complaint`, `slow`,
  `session resume`, `plugin conflict`, `STREAM_CLOSED`, `0.2.2 rc.5`, `吐槽`, `缺陷`, `不好用`,
  `崩溃`, `卡住`, `会话恢复`, `工具调用报错`, `插件冲突`, `密钥失效`, `插件治理`.

## What was found, by relevance to this project

### A. Reports that corroborate decisions this project already made

**A1 — Breaking host updates crash plugins and can stop DSH from starting.**
Source: [腾讯新闻《DeepSeek Harness被吐槽 负责人承诺升级：一切都会好起来》](https://news.qq.com/rain/a/20261107A07OAW00), 2026-11-07.
The article reports developer complaints that DSH's source pages keep warning about breaking updates;
after a host upgrade a plugin may not merely stop working but can crash DSH or prevent startup. The
lead cites the official response that compatibility is being improved and an official plugin market is
planned. Note: the article writes the version as `0.22.rc1`; this project reads the installed
`runtime.json` instead of any prose version.

*Why it matters here*: this is the external statement of the risk R68 turned into a read-only scanner
and R73/R75 turned into a repeatable routine. `docs/compatibility.md` records the seam order and the
waterfall veto; `scripts/scan_plugin_seams.mjs` re-reads registrations after an upgrade; the R73 and
R75 receipts re-run a real turn and three hostile-neighbour shapes on the new runtime. **No new patch** —
our existing answer is the scanner + real-turn re-witness, not a change to the host.

**A2 — Top plugins conflict with each other; no arbiter or conflict detector exists.**
Source: [新浪财经 / 雷峰网《我们拆了 1.1 万个 DeepSeek Harness 插件，发现官方几乎没有建立插件治理机制》](https://finance.sina.com.cn/stock/t/2026-08-28/doc-inipwnxp4482007.shtml), 2026-08-28.
Among its measured claims (external, not ours): 11,439 tagged repos → 2,143 installable → 955 with real
usage; 93 % of 1,883 rejection records say "cannot install under DSH rules"; the ten most-downloaded
plugins installed together **do not start**, with the conflict involving the 2nd, 3rd and 6th ranked
plugins — a UI suite brings its own sidebar component that collides with a standalone sidebar plugin.
The article states DSH has a config layer, load order and capability seams, documents that later layers
overwrite whole rows rather than deep-merging, **but ships no tool to detect the conflict**, and calls
for an arbiter/manager.

*Why it matters here*: `scripts/scan_plugin_seams.mjs` + `docs/compatibility.md` are exactly that
detector for the seams this plugin uses (R68: `llm/stream` = remedy → ops, no third-party reservation of
`remedy_unattributed`; R73/R75: topology unchanged on 0.2.2-rc.5). The article's "conflict is severe"
is external corroboration, not a new local measurement. **No new patch**: we cannot arbitrate other
plugins' UI paths, and `AGENTS.md` forbids changing that seam.

### B. Reports that are real problems but outside this project's seams

Recorded so the plan does not silently absorb them:

- **Permissions are not a security boundary.** The same Sina article reports a probe plugin reading
  `~/.ssh/`, reading an API key from environment, writing `/tmp` and reaching the network under all
  three permission tiers, including `read-only`; it cites official design notes saying security and
  permissions are not design goals and the sandbox is not a security boundary. Our project does not own
  host permissions. The relevant local discipline is already enforced: redaction before an artifact
  leaves the machine, no secret values in evidence, and a journal that only appends its own events.
- **Installing a plugin can invalidate the model cache**, with no warning in the ecosystem. R68 measured
  this wrapper's own per-chunk cost (+1.5 ms / 4 003 text chunks; +5.9 ms / 5 251 tool chunks), which is
  the part we can honestly measure; host cache policy is out of seam.
- **Discovery, trust and naming are unsolved.** Zero-cost GitHub tags, a 2020 résumé generator ranked
  fourth in the official entry, two different `dsh-hud` projects (GitHub discovery vs npm install), and
  many "plugin" repos that cannot be installed. Our `docs/market-index.json` (R27) pins a version to its
  byte source, but we do not run a market or decide what a stranger should install.
- **Performance and UI complaints** (cold starts, 20–30 s first tool call, empty `Continue` messages,
  session resume failures, LiveShare, sidebar rendering) are host/subagent/session-writer issues. R74's
  full reads (L-0052–L-0054) reached the same conclusion for the GitHub half.

### C. Weak or non-actionable signals

- Hacker News `Ask HN: Anyone using DeepSeek Harness (dsh) as part of a customer-facing agent?`
  (id 49770744, 6 points, no comments) — no defect content.
- General "DeepSeek got dumber after update" news is about the model, not the harness seam.
- Most Bing English queries returned no results from this host; absence here is not absence elsewhere.

## Decision fed back into the project plan

1. **No new patch and no runtime byte.** Every finding either corroborates an existing mechanism or is
   outside the four seams (`llm/stream`, `agent/request-error`, `cli`, `profile`). The next patch number
   stays P-0055.
2. **`docs/compatibility.md` gains an external-corroboration note** citing A1/A2 with URL and date.
   The scanner and the upgrade routine are kept as the project's answer to the "no arbiter / no detector"
   gap — described as a detector for *our* seams, never as a host-wide fix.
3. **R75's stability pass is retained as the standing routine** for the next host upgrade: read the
   installed `runtime.json` → re-scan seams → real desktop turn → three hostile-neighbour shapes →
   re-run readers. The 08:00 / 08:05 / 08:10 / 08:20 artifacts are the second clean execution.
4. **Boundaries restated**: no plugin-market work, no permission/sandbox work, no host cache or UI work.
   This matches `AGENTS.md`'s "明确不做" and keeps the external criticism from becoming scope creep.
