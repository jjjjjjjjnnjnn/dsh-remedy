Write the public `README.zh-CN.md` for the open-source repository `dsh-remedy`.

This is a faithful Chinese version of the English README, not a separate pitch.
Same structure, same numbers, same limits. Natural engineering Chinese; do not
translate word-for-word when it makes the sentence stiff.

Voice: 冷静、具体、工程化。不要口号，不要感叹号，不要“革命性”“极致性能”。

Required structure (use these exact H2 headings, in this order):

```
# dsh-remedy

<badge row>

<一段话：它是什么，为什么不一样>

## 它修什么
## 安装
## 工作方式
## 安全保证
## 它不做什么
## 自己验证
## 状态
## 开发
## 贡献
## 安全
## 许可证
```

Rules:

- Keep every number identical to FACTS. Do not add a percentage or a benchmark.
- Badges are the same as the English README; link the intended repository URL.
- "安装" must say npm 尚未发布, give the source workflow, and mark the future
  `dsh plugin --profile <name> add dsh-remedy` as "首次发布后".
- "它修什么": the failure signature in a fenced block, the measured sample, the
  upstream discussion.
- "工作方式": the chunk sequence and the all-or-nothing rule.
- "它不做什么": a table, one row per limit.
- "自己验证": commands plus the real artifact path.
- "状态": 0.1.0，本地真机验证通过，npm 未发布，桌面 App 未重启.
- Link back to `README.md` for English.
- End with MIT and "与 DeepSeek 无隶属关系".
- Keep the whole file under 220 lines.
