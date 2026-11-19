# Promotion Playbook（可复用流程）

> 适用：本地优先的开发者工具、桌面工具、CLI、插件。本文只写**流程、判据和验证方法**。
> 换项目时整份复制，只替换「事实卡」和链接；数字必须从该项目的代码/构建现场取，不能沿用本文。
>
> 本项目的具体文案与发布记录在 [PROMOTION.md](PROMOTION.md)；分发渠道台账在 [distribution/README.md](distribution/README.md)；
> 每日触达读数在 [reach/README.md](reach/README.md)。本项目的唯一数字来源是
> `docs/copy/facts/public-repo-facts.md`，对外文字必须经 `scripts/copy_record.mjs` 登记。

---

## 0. 开始前的四个前置条件

1. **事实卡是现取的。** 版本、测试数、包体、平台限制，用项目自己的命令读：
   `npm view` / `pnpm run verify` / `npm pack` / 事实包，不凭记忆写。
2. **每个渠道先读当期规则。** `about/rules`、`CONTRIBUTING.md`、置顶帖三者都要看。
3. **登录/2FA/验证码由本人完成。** 自动化可以填表、上传、点发布，但不能替人过验证码，
   也不该替人写平台明令禁止的 AI 文本。
4. **网络先验证。** 能打开不等于能发。本机已知 Reddit 走 TLS 会被拒（`ECONNRESET`），
   只能记 `unreadable`，不能把读不到写成「没有反馈」。

---

## 1. 渠道矩阵（硬规则）

| 渠道 | 能做什么 | 不能做什么 | 验证方式 |
|---|---|---|---|
| GitHub 社交预览 | 上传 1280×640 PNG | 没有 API，只能走 Settings UI | DOM 里的 `repository-images.githubusercontent.com/...`，再下载比对尺寸 |
| X / Twitter | 根帖 + 逐条回复；GIF 或最多 4 图 | 同一帖既 GIF 又图片；≥280 字符 | oEmbed `publish.twitter.com/oembed?url=...` |
| Reddit | 按版规发链接/文本、回评论 | 同日同文案多版；绕过站级过滤 | 帖子 JSON 的 `removed_by_category`；`/new/` 是否出现 |
| awesome / 目录 | 按 CONTRIBUTING 用网页表单 / issue | 多数要求**人类提交**；有的只允许 collaborator | 表单是否出现 `Action restricted` |
| Hacker News / V2EX | 本人写、本人发 | **明令禁止 AI 生成正文（含润色）** | 不代写；只提供事实卡与提纲 |
| npm / 市场目录 | 包版本、README、目录条目 | 把下载总量当用户数 | `npm view`、对方公开索引 |
| DSH Discussions | 「Show Your Plugins!」发帖/回帖 | 把「已提交」写成「已收录」 | 帖子 URL 与回帖可见 |

---

## 2. 去 AI 化的写作规则

**结构（中文 150–250 字 / 英文 120–200 词）**

1. 一个具体场景：哪个接缝、哪次失败、用户看到什么。
2. 它具体是什么：在哪个 seam 上改 chunk、读哪些命令。
3. 一条可复现的数字：测试数、包体、已修的故障类（必须来自事实包）。
4. 一条它现在做不到的事：不改 `app.asar`、不做市场、macOS 只在 CI 跑。
5. 一个具体问题：请读者判断这个取舍是否有用，不要求 star/upvote。

**删掉这些**：破折号连用、三段排比、`强大/无缝/优雅/极致/赋能/一站式`、
`不是 X 而是 Y`、emoji 小标题、只列功能没有场景和限制、把下载量/排名/star 当成绩。

**保留这些**：第一人称、短句、具体名词；承认边界；一条链接放正文靠后。

---

## 3. 一次宣传的固定顺序

```
0. 事实卡（现取，所有数字指回事实包）
1. 素材：社交预览 1280×640、2–3 张真实 CLI 截图（不用旧图）
2. GitHub 社交预览
3. X：先根帖，再一次一条回复
4. Reddit：读规则 → 发一个版 → 查 removed_by_category → 必要时 modmail
5. 目录/awesome：先查入口是否对人开放
6. HN / V2EX：只交事实卡，本人写
7. 24 小时 / 1 周后：node scripts/daily-reach.mjs + 人工核对
```

同一主题一周内不要重复发；同一文案不要在同一天进两个社区。

---

## 4. 每个渠道的步骤与验证

### 4.1 GitHub 社交预览
打开 Settings → Social preview → Edit；文件输入是隐藏的，直接对 `#repo-image-file-input` 上传。
重新加载后检查 `.repository-og-image` 的 `background-image`，下载该 URL 比对尺寸/字节。

### 4.2 X
先验证 `x.com/compose/post` 能打开且右侧有账号。多帖编辑器会把后加的媒体挂到首条：
先发根帖（只带图或只带 GIF），再在已发布帖上逐条 Reply。每条 ≤270 字符（URL 按 23 计）。
用 oEmbed 验证；未登录访客看到 `This Post is unavailable` 不一定是被删，不要重发。

### 4.3 Reddit
发前读 `about/rules` 与置顶帖，看账号 karma 与标题格式。发后必须查
`https://www.reddit.com/r/<sub>/comments/<id>.json?raw_json=1`：
`removed_by_category: null` 正常；`"reddit"` 是站级过滤（走 modmail，不重发）；
`"moderator"` 读 `mod_reason_title`。一个版一天最多一条，同一天最多两个版且文案不同。

### 4.4 awesome / 目录
读 CONTRIBUTING，确认入口是 issue 表单 / PR / 网页表单。若出现
`Action restricted — … collaborators`，记录状态并停止，不绕过。
若规则写明「recommendations must be created by human beings」，只准备一行描述，由本人提交。

### 4.5 Hacker News / V2EX
两个平台都明文禁止 AI 生成正文。**不代写、不发。**
只提供：事实卡、结构提纲、会被问到的问题与答案、诚实边界。正文由本人写并回评论。

---

## 5. 测量与复盘

24 小时看：渠道来的 referrer、star/issue/PR、评论里问得最多的一个问题。
1 周看：npm 的 **latest share**（不是下载总量）、哪个渠道带来第一个外部 issue。
下一轮把力气加到有回声的渠道，停掉没有回声的。

数字纪律：
- 不把 npm 下载总量当用户数；仅报告带窗口的 latest share。
- 不把目录排名、star 数当成绩。
- 「submitted」≠「listed」，「listed」≠「recommended」。
- 每次读数写清窗口与生成时间；没读到写 `unreadable`，绝不写 0。

---

## 6. 换一个项目怎么复用

复制本文件，按顺序替换：
1. **事实卡**：项目名、一句话、版本、体积、平台、限制、仓库链接。
2. **素材**：社交预览、截图重新生成，不沿用旧图。
3. **文案**：按 §2 重写，不复制上一项目的句子和数字。
4. **渠道**：先确认目标社区是否接受这个品类。
5. **记录**：实际 URL、时间、过滤/放行、评论结论写进该项目的 PROMOTION.md。

**不要复制**：版本号、包体、测试数、下载量、star 数、任何「已验证」措辞。

---

## 7. 本项目迁移自 ai-terminal-pet 的实战教训

- 浏览器「什么都打不开」先查 Chrome Secure DNS（`Local State` 的 `dns_over_https.mode`）。
- 网络通不等于目标站通：按域名阻断会在 TLS 握手阶段重置。
- Reddit 有两层过滤：版规与站级 spam filter；`removed_by_category: "reddit"` 走 modmail，不重发。
- awesome 入口可能只对 collaborator 开放；看到 `Action restricted` 就停。

---

## 8. 交接清单

- [ ] 事实卡已现取，数字与事实包一致。
- [ ] 每个渠道当期规则已读、入口可用。
- [ ] 登录状态、网络已验证。
- [ ] 素材已生成并与文档尺寸一致。
- [ ] 文案按 §2 自检：无营销词、有限制、有一个具体问题。
- [ ] 发布后验证：社交预览 URL、X oEmbed、Reddit `removed_by_category`。
- [ ] 记录写进 PROMOTION.md 与 docs/reach/。
- [ ] 下一轮只加一个渠道，并设 24 小时 / 1 周复盘。
