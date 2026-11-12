# PROJECT_RULES — dsh-remedy

> 这些规则不是建议。违反其中任何一条，产物都不算证据。

## 1. 失败即失败

- 修不了就原样抛出；不许把 `error` 改成 `stop`，除非每个片段都已证明能 parse。
- 门禁红了修根因，不放宽阈值；阈值变更要 spec + 人类签署。
- “没看到缺陷”只能记 `quiet`，不能记 `repaired`；接缝没跑过记 `unmeasured`。

## 2. 证据由脚本产出

- `data/results/` 里的任何 JSON 必须由 `scripts/` 或已构建的 CLI 产出，带
  `produced_by`、`generated_at`、`schema_version` 和同名 `.sha256`。
- 禁手填数字，禁把“我觉得”写进结果。
- 同名产物拒绝覆盖：stamp 是身份，不是文件名。

## 3. 一次只改一个接缝

- 一个补丁只动它声明的 `surface`。P-0001 只动 `llm/stream`。
- 补丁层只允许 `insert:` + `remedy-*` 行；裸 `- id:` 是“补丁别人的行”，上游只会警告然后什么都不挂。

## 4. 本机只读

- 不写 `~/.dsh`。插件默认零写盘；`journalPath` 打开后也只追加自己的修复事件。
- 外部产物只进隔离区，不直读直跑。

## 5. 状态不许吹

- `status` 的四个值有硬含义：`drafted`（只有设计）/ `tested`（离线回放 + 单测）/
  `verified`（真机跑过且有 `data/results/live-*`）/ `retired`（不再守卫）。
- `gate_registry` 会拒绝“没有 live 产物却写 verified”的补丁。

## 6. 脱敏先于出机

- 任何来自真实 session 的文本，先过 `redact()` 再打印或落盘。
- 报告里的 `redaction.replacements` 是“跑过脱敏”的证据，不是装饰。

## 7. 门禁永远能跑

- `scripts/gate_*.mjs` 只用 Node 内置模块。
- 一个因为缺依赖而跑不起来的门，比没有门更糟：它把 `unknown` 变成了绿色。

## 8. 对外文字只经 copy 通道登记

- README、CONTRIBUTING、SECURITY、行为准则、issue/PR 模板、包描述、release notes，
  一律用 `scripts/copy_record.mjs` 登记。**写的人可以是本会话**——外部模型通道已退役，
  但判据没有退役：写盘前脚本就会拒绝事实包里没有的数字与残留占位符。
- 登记过的产物禁止手改；改事实包或改草稿，然后重新登记。
- 事实包 `docs/copy/facts/public-repo-facts.md` 是唯一数字来源；`gate_copy` 会拒绝
  事实包之外的新数字、漂移的字节、以及过期的事实哈希。**引用事实包里的数字时顺着它自己的写法**
  （它写 `24 329` 就不要写成 `24329`）；确实需要的新数字必须先进事实包。
- frozen 条目（已发布的 release notes）只要求自身字节不变：它描述的是一页已经公开的文字，
  为了更新「谁写的」而重写它比留着一个旧哈希更糟。
