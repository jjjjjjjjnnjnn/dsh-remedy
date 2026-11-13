# 分发台账 — dsh-remedy

> 每一条 = 一次提交 / 一个 URL。**「已提交」≠「已收录」≠「已渲染」**，三者是不同的事，
> 本文件分开写。任何数字都必须出现在 `docs/copy/facts/public-repo-facts.md`。

## 0. 已提交（2026-11-13）

| 渠道 | 形式 | URL | 状态 |
|---|---|---|---|
| [imsai-sh/awesome-deepseek-harness-plugins](https://github.com/imsai-sh/awesome-deepseek-harness-plugins) | PR，一个 `catalog/plugins/*.json` | [#928](https://github.com/imsai-sh/awesome-deepseek-harness-plugins/pull/928) | ✅ **已合并**（`github-actions[bot]` 09:12:12Z 自动 squash；静态检查全过、Codex 复查 0 findings）。条目已在 `main` 上。它的 bot 评论（[#issuecomment-6848857038](https://github.com/imsai-sh/awesome-deepseek-harness-plugins/pull/928#issuecomment-6848857038)）写明：商店只从 npm 装，包没发到 npm 之前只给「仅浏览」；发布后**自动检测，不需要再提 PR**。0.4.1 已发布，但 `deepseek1024.com/api/v1/plugins/jjjjjjjjnnjnn/dsh-remedy/packages/plugin` 在 2026-11-13 仍返回 `github:jjjjjjjjnnjnn/dsh-remedy#path:packages/plugin` 的安装串，说明自动检测还没跑到；记录读数，等下一次 catalog sync，不重复提 PR |
| [awesome-dsh-plugin](https://github.com/awesome-dsh-plugin/awesome-dsh-plugin) | PR，一个 `data/plugins/*.yml` | [#14942](https://github.com/awesome-dsh-plugin/awesome-dsh-plugin/pull/14942) | `open` / **`CLEAN`**（`check` 与 `Submission gate` 两个 check 全绿）/ `+7 -0` / **changed_files 1** |
| [polang233/dsh-plugin-index](https://github.com/polang233/dsh-plugin-index)（dshopen） | issue 模板 | [#472](https://github.com/polang233/dsh-plugin-index/issues/472) | open（人工审） |
| [alldsh/submissions](https://github.com/alldsh/submissions) | issue 模板 | [#3](https://github.com/alldsh/submissions/issues/3) | open（人工审） |
| [dsh.so](https://dsh.so/submit/) | 站上表单（npm 通道） | <https://dsh.so/artifact/dsh-remedy/> | ✅ **已提交**（2026-11-13）：表单检查 `Pass` / `SECURITY SCAN Pass` / 28 files / schema valid；点提交后按钮变 `✓ Submitted`。站点已有条目，安装命令仍写 `0.3.7`，等维护者用新提交更新 |
| [deepseek-ai/deepseek-harness Discussions](https://github.com/deepseek-ai/deepseek-harness/discussions)「Show Your Plugins!」 | 讨论帖 | [#13206](https://github.com/deepseek-ai/deepseek-harness/discussions/13206) | ✅ **已发布**（2026-11-13）：分类 `Show Your Plugins!`、非官方标注、仓库 + 安装、两条常驻接缝、CLI、构建侧、pre-step 限制；正文含 `explain` 截图（`docs/distribution/explain-0.4.1.png`） |

## 1. 自动采集，不需要申请

| 渠道 | 机制 | 我们的现状 |
|---|---|---|
| [AdamPlatin123/dsh-plugin-radar](https://github.com/AdamPlatin123/dsh-plugin-radar) | 每日 02:00 全量扫 `dsh-plugin` topic；也可在 `PLUGINS.md` 追加一行提 PR | topic 已在 → 等下一次扫描 |
| [YELEBAI/dsh-plugin-marketplace](https://github.com/YELEBAI/dsh-plugin-marketplace) | 按 topic 自动采集 | 读到的 registry（18 746 条）里**暂时没有我们** → 等下一次采集 |
| [bradeGithub/DSH-Plugins-Marketplace](https://github.com/bradeGithub/DSH-Plugins-Marketplace) | 按 topic 自动采集 | **已采集到，但读错了清单**：`installable: "non-plugin"`、`pkg_name: "dsh-remedy-workspace"`、`version: "0.3.8"`。它读的是仓库根那个私有 workspace 壳；真正可安装的清单在 `packages/plugin/package.json`。改不了它的扫描逻辑，但记在这里以免被读成「已收录为插件」 |

## 2. 还要人做

2026-11-13：dsh.so 表单与 Discussions 发帖都已完成，见第 0 节。剩下的只是等维护者审，没有待办的人工动作。

## 3. 描述红线（每一家都适用）

- 不写「安全 / 无恶意 / 100% 兼容 / 提升速度」这类无证据的话；
- 不写下载量、不写「多少人在用」；
- **描述里不放数字**（awesome-dsh-plugin 与 imsai 都把每句描述当作对代码的声明）；
- 每一句都要能指到实现：`llm/stream` 的修复、`agent/request-error` 的命名、
  `explain` 的覆盖回答、`scan` 的离线普查。

## 4. 可被市场直接消费的产物

| 文件 | 用途 |
|---|---|
| `docs/market-index.json` | format 1 索引源，钉在公开仓提交 |
| `docs/distribution/awesome-dsh-plugin-entry.yml` | 那张表的条目文件本体 |
| `docs/distribution/awesome-dsh-plugin-pr.md` | PR 正文（四条断言各自指到代码） |
| `docs/distribution/imsai-catalog-entry.json` | imsai 的 `catalog/plugins/*.json` 本体（已合并进它的 main） |

`docs/market-index.json` 的 `publishTimestamp` 是**实测值**（`npm view dsh-remedy time` 读到
0.3.8 在 `2026-11-12T17:40:02.359Z` 落地 → `1794505202`），不是占位符。

## 5. 发布已经发生，落差消失了（2026-11-13）

上一版这里写的是「先发版再铺渠道」，现在它是既成事实：**0.4.1 已发布**（两包 `latest`），
从列表点进来的人读到的「二十三个补丁」和他装到的 `0.4.1` 是同一份东西。公开仓库已推到 `cec1c60`，
GitHub release `v0.4.1` 的正文与 `docs/copy/release-notes/v0.4.1.md` 逐字节相同。

- **imsai**：它的 bot 在合并时说得很清楚 —— 商店只从 npm 装，包发到 npm 才显示安装命令。0.4.1 上线后，
  那条条目应当自动从「仅浏览」变成「可安装」（它自己声明「发布后自动检测，不需要再提 PR」）。
- **awesome-dsh-plugin** #14942：两个 check 都绿（`check` 与 `Submission gate` → `SUCCESS`），
  `mergeStateStatus` 仍是 **`CLEAN`** / `open`。CI 绿是前置条件，收录仍要维护者读代码。
- **dshopen** #472 与 **AllDSH** #3 仍是 open / 0 评论，等人工审。

## 6. 两件人工动作也做完了（2026-11-13）

- **`dsh.so` 表单**：npm 通道，检查 `Pass` / `SECURITY SCAN Pass` / 28 files / schema valid，提交后按钮变
  `✓ Submitted`；站点已有条目，安装命令仍写 `0.3.7`，等维护者用新提交更新。
- **DeepSeek Discussions**：帖子 [#13206](https://github.com/deepseek-ai/deepseek-harness/discussions/13206)，
  分类 `Show Your Plugins!`，正文含 `explain` 截图。

`BS-17` 已在 R30 关闭：桌面渲染器把拒绝画成「已完成」且不显示任何内容，所以 `agent/pre-step` 只能用
`{kind:'enter'}` 改写，不能拒绝；那条改写路径仍未测。

## 7. 渠道描述会长期被扫，所以承诺是硬的

awesome-dsh-plugin 与 imsai 都会定期扫：仓库消失 / 归档 / 长停更会被移除，**描述与代码不符会被打回**。
我们这边的对应动作：每次改 `packages/plugin/package.json` 或命令行为，都要回头核那一行描述；
`tests/governance/distribution-entry.test.ts` 把条目形状（指向子目录、描述无数字、索引来源类型）钉住。