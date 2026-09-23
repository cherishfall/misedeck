# Beta14 Feedback Scratch

> 工作方式（沿用 beta10–beta13 定稿）：用户报一个，调查一个；调查时同时排查同类/关联问题（含「查过、无问题」的对照记录）；结论写入本文档标「待用户定稿」，用户确认后标「定稿」。定稿前不动代码、不发 GitHub。收集齐后发 spec issue（新周期新开 parent，不重开已关闭 ticket）+ 拆实现 ticket。
>
> 周期 bookkeeping（2026-09-23）：beta14 已发布（run 35771312219 全绿，6 assets）。owner 开始逐个报 beta14 反馈。

## 背景

- beta14 携带 beta13 批次全部修复（SPEC #187 / tickets #188–#191）。
- owner 已下载安装 beta14：「基本上可以了，但还是有一些问题」。
- SPEC #187 尚未关闭（owner 验收中）。

## 收集中的 issue

### Issue 1【英文模式目录选择按钮文案三处不统一】

**来源**：用户报告（2026-09-23，附图 2 张，英文界面）。原话：「英文模式下 choose directory, pick a directory, choose another directory 不统一，希望统一成 choose directory, choose another directory」。

**调查结论**（subagent 全仓扫查）：

三处入口、三个不同 key：

| 入口 | key | en 现值 | zh 现值 | 消费点 |
|---|---|---|---|---|
| Global 模式顶栏 | `directory.pickerLabel` | **Pick a directory**（异类） | 选择目录 | `DirectoryIndicator.tsx:121` |
| Overview 空态 | `preview.empty.action` | Choose directory ✓ | 选择目录 | `DirectoryPreview.tsx:375` |
| 目录模式顶栏 | `directory.chooseAnother` | Choose another directory ✓ | 选择其他目录 | `DirectoryIndicator.tsx:229` |

- 顶栏两模式 = 同一组件 `DirectoryIndicator` 的两个分支、两个 key；onClick 完全相同（共享 `pickDirectory`）。组件头注释（`DirectoryIndicator.tsx:11-16`）写明 "Pick a directory" 是有意设计——与 owner 期望冲突，属「有意但不合意」，改文案时注释同步。
- 中文侧入口 1/2 已一致（都是「选择目录」），不一致仅英文侧；改 en 的 `pickerLabel` 即可全对齐，zh 无需动。
- **第 4 个消费者**：`ToolsPage.tsx:1016` Link 表单（`mise link` 选本地目录）复用同一 key `directory.pickerLabel`——但语义是命令参数选择，不切换全局目录上下文（`ToolsPage.tsx:935-938` 注释明确）。改共享 key 会连带它变成 "Choose directory"。
- 对话框标题 `directory.pickerTitle` = "Pick a directory for MiseDeck"（en.json:26）也是 Pick 措辞残留。

**同类扫查记录（查过、干净）**：
- Recents 按钮/浮层（`recentsButton`/`recentsHeader`/`removeRecentLabel`）：无 pick/choose 文案。
- Open in terminal（`activation.openInTerminalLabel`）：干净。
- en.json 全量 Pick/choose 扫查：另有 `tools.linkForm.noPath`（"No directory picked"，占位文本非按钮）、`tools.confirm.link.directoryNotFound`（错误提示，zh 已是「重新选择」措辞）——均为非按钮语境。
- 全仓 .tsx 无硬编码目录选择文案；testid（`directory-indicator-choose`/`directory-indicator-pick`/`preview-choose-directory`/`tools-link-pick`）不含文案、无测试断言引用这些字符串，改文案不破坏测试。

**定稿（2026-09-23，owner 确认按推荐）**：
- `directory.pickerLabel` en → "Choose directory"（共享 key 不拆，Link 表单按钮连带变更；zh 不动）。
- `directory.pickerTitle` en → "Choose a directory for MiseDeck"（zh 不动）。
- `directory.chooseAnother` / `preview.empty.action` 不动。
- 实现时同步 `DirectoryIndicator.tsx:11-16` 组件头注释（原注释写明 "Pick a directory" 设计意图，已过时）。

### Issue 2【工具页底部区域：两个 panel 宽度不齐 + 两种 disclosure 装法混用】（owner 征求优化建议）

**来源**：用户报告（2026-09-23，附图 1 张，zh-CN 界面，工具页底部）。原话：「这块地方不美观 长度也不统一，然后高级按钮放在外面，但是下面链接工具又不像上面的版本管理是个按钮，总之就是丑爆了，你有什么优化建议吗」。

**调查结论**（subagent 结构扫查）：
- 两个 panel 的 CSS 配方**逐像素相同**（`AddToolSection.module.css:5-13` `.section` vs `ToolsPage.module.css:284-292` `.installForm`：同为 padding `--space-4` / border `1px var(--line)` / `--radius-panel` / `color-mix(var(--panel) 50%)`，均无 max-width）。
- **宽度不齐的唯一原因**：`.section` 是 `.page`（flex column，默认 stretch → 1200px 全宽）的直接子元素；`.installForm` 嵌在 `section.advanced` 里，而 `.advanced` 有 `align-items: flex-start`（`ToolsPage.module.css:328`）→ 收缩为内容宽（受 `.formNote` 60ch 约束）。纯实施疏漏，无文档惯例支持。
- **disclosure 装法不一致**：版本管理 = 「panel 头部即 ghost 触发器」（`AddToolSection.tsx:565-573`，`aria-expanded`，右侧配清除）；高级 = 裸 ghost 按钮悬在 panel 外（`ToolsPage.tsx:652-669`），展开后 panel 才出现——全 app 唯一的「disclosure + 内嵌 panel」组合（同类排查：`DirectoryPreview.tsx:547`、`HomePage.tsx:244` 的 disclosure 均无内嵌 panel；Env/Tasks 添加表单为常驻 panel）。
- 挂载层级：`.page` 下三个平级兄弟——AddToolSection（:635）→ section.advanced（:652，含 ghost 高级按钮 + 条件渲染 LinkToolForm）。
- `docs/design/visual-language.md` / `ui-ux-rules.md` 均无「disclosure 内 panel 宽度」条文，属规范空白（若定稿可考虑固化为规则）。

**视觉候选（已出 SVG 对比图，2026-09-23）**：
- **候选 A（推荐）**：两个同构 disclosure panel——「高级」改为与「版本管理」同配方：全宽 panel、头部 ghost 触发器，链接工具表单展开后渲染在 panel 内，宽度严格一致。
- 候选 B：单 panel 分区——高级收进版本管理 panel 尾部，分区线隔开（页面块数最少，但 panel 职责混杂）。
- 候选 C：去 disclosure——链接工具常驻全宽 panel，与 Env/Tasks 添加表单惯例一致（少一次点击，但低频功能常驻占版面）。

**推荐理由（A）**：同时解决两个抱怨点（宽度对齐 + 触发器装法统一成「按钮在 panel 头上」）；链接工具是低频操作，保持折叠符合 quietness；B 让一个 panel 混装两个不相关职责；C 让低频功能常驻、页面变长。

**定稿（2026-09-23，owner 选推荐 A）**：「高级」改造为与「版本管理」同构的全宽 disclosure panel——ghost 触发器在 panel 头部，链接工具表单展开后渲染在 panel 内部，两 panel 宽度严格一致；去掉裸按钮悬空 + 内容宽 panel 的旧装法。实现要点：
- `section.advanced` 的 `align-items: flex-start`（`ToolsPage.module.css:328`）随旧结构一并退役。
- 复用/对齐 `AddToolSection` 的 panel 头部配方（`.head` space-between + ghost `aria-expanded` 触发器）。
- 因属新交互模式（disclosure panel 同构约定），按工作协定评估是否固化进 ui-ux-rules（双语）。

（待用户逐个报告）
