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
- "安装" must say the packages are published on npm and give
  `dsh plugin --profile <name> add dsh-remedy` first, then
  `pnpm add dsh-remedy dsh-remedy-core`; keep the source workflow for contributors.
- "它修什么": the failure signature in a fenced block, the measured sample
  (48 session files / 120 `turn/end` / 40 `MALFORMED_RESPONSE`, 其中 37 条是可证的
  两个对象粘连), the upstream discussion. Do not reuse the old 27-session sample.
- "工作方式": the chunk sequence and the all-or-nothing rule.
- "安全保证": one guarantee per line, covering P-0001、P-0002 与 P-0003：
  合成 call 一定带 `block-start` + `block-end` 而不是裸 `block-end`；撤回的修复把
  预算还给整条流；`max-tokens` 只记 truncated，不算未修复的粘连；透传的 provider
  错误计入 `errors`；纯拒绝只加 `refused` 不加 `fused`；预算拒绝同时加
  `unrepaired`，所以"拒了也没修"的流不会读成 `repaired`；消费者提前停止保留
  `fused` 与 `unrepaired` 并另加 `withdrawn`；四个 verdict 词一个没变，只有计数行
  从六个名字长到八个。
- "它不做什么": a table, one row per limit.
- "自己验证": commands plus the real artifact path.
- "状态": 0.3.x 已发布到 npm；P-0001 为 `verified`（headless profile 与桌面 App）；
  P-0002 与 P-0003 为 `tested`（只有单元测试与负对照，没有 live 产物）。加一小段
  包体积说明（0.3.0 tarball 的压缩/条目/解包/分量、不再进包的 sourcemap、`dist/*.js`
  的字节预算），数字只能来自 FACTS。
- Link back to `README.md` for English.
- End with MIT and "与 DeepSeek 无隶属关系".
- Keep the whole file under 220 lines.
