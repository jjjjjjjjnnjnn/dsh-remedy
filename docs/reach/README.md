# Reach ledger — dsh-remedy

> 完整工作顺序见 `docs/AGENT-WORKFLOW.md`；本文件只定义 reach 台账本身。

> 推广是循环，不是一次性发布。一份没回声的帖子和一份有评论的帖子在第二天看起来一样，
> 除非有人测量。本目录把可机器验证的一半自动写下来，需要登录浏览器的一半打印成清单。

## 自动的一半

- `node scripts/traffic-report.mjs [--json]`：npm 每版本下载与 **latest share**（不是下载总量）、
  GitHub views / clones（减去 CI checkout 基线）、release 资产、referrers。
- `node scripts/daily-reach.mjs [--stdout]`：把上面那份报告、上游 PR 状态、dev.to 文章/评论
  汇总成 `docs/reach/<YYYY-MM-DD>.md`（追加）与 `latest.md`（覆盖）。
- `node scripts/catalog-status.mjs [--json]`：目录条目是否仍指向当前版本。
- Windows 计划任务：`DshRemedy-DailyReach`，每天 09:00 运行 `node scripts/daily-reach.mjs`，
  开机补跑（StartWhenAvailable）。用 `Get-ScheduledTask -TaskName DshRemedy-DailyReach` 核对。

## 人工的一半

每天看：X 的根帖与回复（oEmbed 可验证）、Reddit 帖子 JSON 的 `removed_by_category`、
HN / V2EX 是否由本人发帖、dsh.so 表单是否 `Submitted`、DSH Discussions #13206 是否有新回复。
结果追加进当天文件的 `## Manual checks` 段，不要另开文件。

## 规则

1. 不把 npm 下载总量当用户数；只比较**带窗口的 latest share**。
   `newest` 是 registry 上最新的**两个已发布版本**，不是下载窗口里恰好有行的两个键：
   发布日晚于窗口 `end` 的版本进 `missing`（写明 `published_after_window_end`），
   `comparable: false`，那天的 share 只能当下界读；跨天比较前先确认两边的 `missing` 都为空。
2. 数字必须带窗口与生成时间；读不到写 `unreachable`，绝不写 0。
3. 不刷 star、不刷票、不重复发帖；「submitted」≠「listed」，「listed」≠「recommended」。
4. 安静的一天是有效结果，写「no change」即可。
5. 对外文字仍走 `scripts/copy_record.mjs`；本目录是内部台账，不是对外页面。

## 与知识库宣传总线的关系

本目录是**人读的 signal 副本，不是渠道状态机**。排期、去重、发布台账、评论回收与跨项目汇总都在
`C:\Users\rongj\Desktop\本地知识库\知识库内容\Promotion`，由 `kb promo status / plan / record / collect`
统一管理。`node scripts/daily-reach.mjs --json` 输出总线契约 `promotion-snapshot/v1`，
`kb promo collect` 直接消费；本机 markdown 台账只用于现场核对。
