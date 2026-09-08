# v1.0.0-beta.8 反馈记录

> 状态：收集进行中（2026-09-08 起）。
> 流程：用户逐条口述 → 我记录原话并做代码调查 → 有不确定处用 grill-with-docs 拷问到共识 → 全部收集完后综合分析 → to-spec 发布 SPEC 父 issue → to-tickets 发布 tickets。
> 每条结构：用户原话（+截图）→ 代码调查结论 → 对齐后的理解 → 定稿。
> 基线：beta.8 已发布（`v1.0.0-beta.8`），beta7 批次（#86 SPEC、#87–#96）全部关闭；遗留 open 项为 SPEC 父 issue #86 / #74 / #65 / #61 / #45，等待主人视觉验收。
> 本批次起，反馈文档统一存放于 `docs/feedback/`（见 AGENTS.md / HANDOFF.md）。
> 规则固化（2026-09-08，已落地双语四份 + AGENTS.md）：`▹` → `→` 全站替换；新增 Glyphs & icons（大小/风格/颜色匹配、caret 全禁、beta4 chevron 裁定被显式取代）、同行视觉平衡、flex 行必声明对齐、token 禁令、页面主按钮右对齐 sm、Tooltip 双浮层原语、只读默认、commandHint 严格一致、i18n key 一语义一 key、submit-and-catch、虚线边框禁令、eyebrow 不重复、数量进按钮文案、表头省略防御、AGENTS.md「视觉/交互错误评估固化为规则」条款。

---

## Issue 1【视觉】: 顶部工具栏字体大小/字重不统一 + 「最近」按钮上的小三角

**用户原话**: 「上面工具栏的字体大小是不是不统一，感觉当前目录/全局模式，全局，在终端打开，最近这几个的字体大小偏小了，你帮我调整到一个视觉上比较balance的大小和字重，还有最近按钮上的下个小三角形去掉吧，比较违和，感觉没太大必要留着，字体大小不搭问题也查查其他页面」（附截图，红框圈出「当前目录 + 路径」区和「最近 ▾」按钮）

**代码调查结论**:

1. **用户观察属实**。`DirectoryIndicator`（挂在 `PageShell.tsx:133`）内各元素字号字重实测：

   | 元素 | 字号 | 字重/其他 |
   |---|---|---|
   | eyebrow「当前目录」 | 10px（`--size-label`） | mono、大写、tracking 0.18em、`--ice` |
   | 路径文本 | 12px（`--size-data`） | mono、`--text` |
   | 全局 / 在终端打开 / 最近（裸 `<button className={styles.action}>`，`DirectoryIndicator.module.css:53-71`） | **10px** | mono、`--ice`、无边框感弱 |
   | 选择其他目录（Button primary sm，`Button.module.css:52-55`） | 11.5px | **600**、`--beam` 实底 |

   → 三个 `.action` 按钮 10px/400，比旁边的路径（12px）和主按钮（11.5px/600）都小都轻，确属失衡。
2. **「最近」的 `▾` 是 JSX 里的硬编码字面量**（`DirectoryIndicator.tsx:164`：`{t(...recentsButton)} ▾`），不走 i18n，也没用 Button 组件的 `trailing` 机制。且 `▾` 不在视觉语言许可范围内——`visual-language.md:93` 规定唯一装饰字形是 `▹`；`▾` 全站真实使用仅此一处（其余均在 StyleGuide demo / i18n demo 串里）。
3. **同类的 LanguageSwitcher** 有一个 10×10px 描边 chevron SVG（`LanguageSwitcher.tsx:112-124`，`currentColor`，打开时旋转），是唯一的 SVG caret，风格与 `▾` 字形也不统一。

**定稿（2026-09-08，用户确认全部推荐 + 补充）**:

| 项 | 定稿 |
|---|---|
| 三个 `.action` 按钮 | 字号升到 **12px（`--size-data`，与路径同字号）**，字重保持 400，颜色 `--ice` → `--text` |
| eyebrow「当前目录」 | **不动**（10px 大写是设计系统规定的唯一大写元素） |
| 「最近」`▾` | **删除**硬编码字形，不加替代；菜单可展开性靠交互自明 |
| LanguageSwitcher chevron SVG | **一并删除**，全局统一——下拉/菜单触发器不再带任何 caret 字形 |
| 拟定 issue | labels: bug（视觉违规）, v1 |

---

## Issue 2【bug + 视觉】: 「最新版本」误判可升级 + 小三角图标风格突兀（全站排查 + 规则沉淀）

**用户原话**: 「最新版本里有bug你看到了吗，2026.9.2是最新的，但是显示要升级到2026.9.1，还有那个分割的三角形也很割裂，说实话，我对整个界面上用的这些很小小的三角形图标都觉得挺违和突兀的，就像一颗子弹一样扎眼，能不能弄个大小和样式比较搭的图标呢，这类问题在全部页面都找下，我不喜欢那种明显大小不匹配的视觉风格，要大小匹配、风格匹配、颜色匹配，这一点也请优化下语言记录的设计规则文档中」

**代码调查结论**:

1. **bug 根因**：`HomePage.tsx:83-90`，`updateAvailable = latest !== view.ok?.versionDate` —— **纯字符串不等比较**，无方向/semver 判断。注释里写着假设："mise versions are date-based and monotonic (issue #91)"。当本地装的版本比官方已发布的 latest 还新（2026.9.2 > 2026.9.1），不等式仍为 true，于是提示"升级"到旧版本。HANDOFF.md 相邻发现 #3 也预警过该解析路径脆弱。
   - `latest` 来自 `mise version --json` 原始 payload 透传（`mise.rs:1403-1450` 原样传递）。
2. **分隔符是 `▹`**（U+25B9），且是**设计系统许可的唯一装饰字形**（`visual-language.md:52/93`、`ui-ux-rules.md:77`）。问题在于**呈现不统一**：
   - HomePage（`HomePage.tsx:127`）：`▹` 作为纯文本夹在 DataRow value 里，无 span、无颜色，继承 `--beam` tone，12px mono。
   - ToolsPage（`ToolsPage.tsx:538`）：`▹` 有 `.arrow` 类，`color: var(--flare)`。
   - DoctorPage（`DoctorPage.tsx:387`）：`▹` 有 `.upgradeArrow` 类，`color: var(--flare)`。
   → 同一字形三处两种颜色处理，HomePage 无专用着色；且 `▹` 本身是"小三角"，正是用户觉得"像子弹扎眼"的元凶。
3. **全站小三角/箭头字形清单**（探查子代理全量核查）：
   - `▹`：HomePage / ToolsPage / DoctorPage / StyleGuide ×2（真实使用 3 处）。
   - `▾`：DirectoryIndicator 最近按钮（硬编码，真实使用唯一处）+ StyleGuide demo + i18n demo 串 `"版本 ▾"`。
   - chevron SVG 10×10：LanguageSwitcher 唯一。
   - `›`：Pagination "Next ›"（ghost sm Button 内）。
   - `←`：MiseMissingState「← back to Home」文本链接。
   - 另有 ExecutionPanel 终端闪烁块状光标（CSS 非字形）和 `·` 分页分隔点。
4. **规则文档现状**：`ui-ux-rules.md` 有 "Action buttons"（:48-60，只讲 variant 语义，无位置/大小规则）和 "Retired vocabulary"（:115-117，禁用 `▸` prompt 字形）；**没有任何关于图标/字形大小匹配、风格匹配、颜色匹配的规则**。视觉语言文档规定 `▹` 唯一许可，但无落地的一致性执行细则。

**定稿（2026-09-08，用户确认全部推荐）**:

| 项 | 定稿 |
|---|---|
| 升级路径分隔符 | `▹` **全站换成 `→`**（文本字形，天然与字号匹配）；真实使用 3 处（HomePage/ToolsPage/DoctorPage）统一 `--flare` 着色、统一带 span 类 |
| 设计规则修订 | `visual-language.md` 的"唯一装饰字形 ▹"改为 `→`；`ui-ux-rules.md` 新增硬规则：**图标/字形必须大小匹配、风格匹配、颜色匹配**；两份文档双语（en + zh-CN）同步 |
| 杂项字形清理 | `▾`（最近按钮 + StyleGuide demo + i18n demo 串 `"版本 ▾"`）、LanguageSwitcher chevron SVG 全部清除；`›`（Pagination Next）、`←`（返回链接）随规则审查一并评估 |
| 版本比较 bug | **方向比较**：`2026.9.2` 按 `.` 拆数字段逐段比；仅 `latest > 本地版本` 才显示可升级 UI；相等或本地更新时不出现升级提示。前端小函数实现，不动 Rust |
| 拟定 issue | 拆两个：① bug（版本比较方向）② 视觉（字形统一 + 规则修订）；labels: bug, v1 |

---

## Issue 3【布局 + 文案】: 首页「运行 mise self-update」按钮位置/大小/命名 + 发布说明链接位置

**用户原话**: 「查看发布说明是不是放到最新版本那一行的最右边更合适，还有运行mise self-update 放置应该放置在右侧吧，其他页面的按钮也几乎都是放在右侧的吧，大小也大了，就叫运行 mise self-upgadate是不是很赤裸裸，中文就叫更新或者更新版本嗯，按钮大小问题和查查其他页面」

**代码调查结论**:

1. **现状**（`HomePage.tsx:138-159`）：`Button primary size="md"`（12.5px、padding 8px 14px、weight 600）+ 后面的 10px 文本链接「查看发布说明」，二者在 `.stateActions`（`HomePage.module.css:81-86`）里 **裸 flex 左对齐**，无 `justify-content`/右推。同样的左对齐 md 主按钮模式还有 notFound（:176-193）和 tooOld（:212-231）两个状态。
2. **用户断言属实**：探查全站 7 个内容页，**HomePage 是唯一例外**——其他所有页面（概览/工具/环境变量/任务/插件/诊断/设置）的 toolbar 均为 `justify-content: space-between`，左侧 hint、右侧 actions，且主按钮一律 `size="sm"`；`size="md"` 在页面层全站仅 HomePage 使用。Button 组件只有 `sm | md` 两档（`Button.tsx:18-19`）。
3. **i18n 现状**：
   - `miseManagement.selfUpdateButton`：en `"Run mise self-update"` / zh `"运行 mise self-update"`（`en.json:34` / `zh-CN.json:34`）。
   - `miseManagement.releaseNotesLink`：en `"View release notes"` / zh `"查看发布说明"`。
   - 按 ADR-0005，按钮文本直述命令是"GUI 教 CLI"原则的体现；用户现在嫌"赤裸裸"，要 zh 改「更新」/「更新版本」——en 文案待定。

**定稿（2026-09-08，用户确认全部推荐）**:

| 项 | 定稿 |
|---|---|
| 更新按钮 | `size="md"` → **`sm`**、**右对齐**；zh 文案「运行 mise self-update」→「**更新版本**」，en `"Run mise self-update"` → `"Update"` |
| 发布说明链接 | 移到「最新版本」DataRow 的**值最右端**（不再跟在按钮后面） |
| notFound / tooOld 状态 | 同款左对齐 md 按钮**一并改右对齐 sm**，三状态一致 |
| 规则沉淀 | `ui-ux-rules.md` "Action buttons" 补硬规则：**页面主按钮右对齐、页面层一律 `sm`**（双语同步） |
| 拟定 issue | labels: enhancement, v1（布局文案） |

---

## Issue 4【视觉 + 交互】: 工具页「工具」列过宽（百分比列虚胖）+ 列宽手动调整

**用户原话**: 「工具页面，工具这一栏为什么会这么宽呀，而且列表的各列可不可以可以手动调整宽度（各列有合适的最小宽度）」（附截图，红框圈出约占半屏宽度的「工具」列）

**代码调查结论**:

1. **根因**：工具列定义 `width: "30%"`（`ToolsPage.tsx:498`），其余列全部固定 px（96/120/100/150/200/220 + 条件 backend 120px）。#90 后表格 `min-width: calc(1006px + 30%)`（`ToolsPage.module.css:107`）——窗口越宽，30% 列随表格总宽等比膨胀（截图窗口下 ~480px+），固定列相对被挤。
2. **同类百分比列全站共 5 处**：`TasksPage.tsx:321`（22%）、`:338`（28%）、`SettingsPage.tsx:148`（26%）、`DirectoryPreview.tsx:260`（40%）、`ToolsPage.tsx:498`（30%），同一坑类。
3. **手动调列宽**：`Table` 组件（`misedeck/src/components/Table/`）无任何列宽拖拽能力，属新增交互。

**定稿（2026-09-08）**:

| 项 | 定稿 |
|---|---|
| 百分比列（Q1，用户确认推荐） | 5 处百分比列全部改为按内容定固定 px + 合理最小宽度；工具列 ~160px（超长走 ellipsis + Tooltip）；表格 `min-width` 改为各列 px 之和，不再含百分比 |
| 手动调列宽（Q2，用户修正原则后，2026-09-08 定稿） | **做**——列宽拖拽属 GUI 展示层能力，不违反 CLI-shaped 原则（见下方原则澄清）。规格：拖拽柄位于表头列分隔线上（hover 时可见，`col-resize` 光标）；每列声明各自最小宽度，拖到最小宽度即停；调整后的列宽持久化到 localStorage，以 页面+表格 为 key；不做双击重置等额外功能；在 Table 组件内实现一次，全站 6 个固定表格统一获得该能力 |
| 拟定 issue | ① 视觉 bug：百分比列 → 固定 px；② enhancement：Table 组件列宽拖拽 |

**原则澄清（用户纠正，2026-09-08）**：ADR「CLI-shaped interaction」禁止的是**发明 mise CLI 不存在的概念和功能**（词汇/功能层）；GUI 的**视觉层与交互层**能力（复制路径、列宽调整、安装前检查等）与 CLI 功能正交，不受此禁。此澄清已固化：AGENTS.md 原则 2 改写（en + zh-CN）+ 新增 ADR-0007（en + zh-CN 双语）。

---
---

## Issue 5【范围裁定】: GUI 层友好能力提案的取舍（工具页为本批次重中之重）

**用户原话**: 「尤其是工具页面，工具页面是这一版的重中之重，一定要打磨好」「批量升级和卸载不用做了，这种不太属于gui 视觉、展示和交互层面的，而是做出来了个mise cli 新功能，其他表格的优化按照你的推荐都做吧，如果其他页面也有这些优化，可以一并做了。」

**定稿（2026-09-08）**:

| 项 | 定稿 |
|---|---|
| 工具页（重中之重） | 列宽修复 + 拖拽（Issue 4 已定稿）+ **P1 过滤框** + **P2 复制**（工具名/版本/来源路径）+ **P3 列排序**（点表头，版本列用数字段比较，指示符用 `↑/↓` 文本字形作数据呈现） |
| 其他页面 | **P1** 过滤同步到环境变量/任务/设置（共享 hook）；**P2** 复制全站统一（共享 `CopyButton`）；**P3** 排序推广到其余固定表格；**P4** UI 状态持久化全站（执行面板开合/高度、侧边栏收起态、每表 pageSize） |
| 明确砍掉 | **P7 批量升级/卸载**——用户裁定：批量打包多条命令属于"做出了 mise CLI 新功能"，越过展示/交互层边界。此裁定是 ADR-0007 边界的第一个应用实例，值得在 ADR 或后续反馈中引用 |
| 记入 HANDOFF 候选 | P6 列显隐、P8 焦点管理、P9 骨架屏、P10 目录收藏（略擦边，待真实痛点） |
| 排序指示符设计决策 | `↑/↓` 文本字形，作为**数据**呈现（非装饰字形），不受"caret 禁令"约束；排序列表头用 `--text` 字重标示 |

---

## Issue 6【视觉】: 概览页节眉签重复/精分 + mise.lock 缺失态占位

**用户原话**: 「概览页这个多出来的 mise.lock 是不是个bug，还有 前面都是 MISE / 概览 的标题，为什么最下面有个MISE.LOCK 的标题，下面还有个 mise.lock 的，我没懂」（附截图）

**代码调查结论**:

1. **mise.lock 节非 bug**：是有意功能（`DirectoryPreview.tsx:12` 注释：存在时只读展示 lockfile 内容）；缺失时显示「未找到 mise.lock。」占位。
2. **眉签精分根因**：概览页各节的 `sectionEyebrow` 原样重复页面眉签「MISE / 概览」（`:362/:410/:500`），唯独 lockfile 节自带 `MISE.LOCK` 眉签 + `mise.lock` 标题（i18n `preview.lockfile.eyebrow/title`），同一词出现两次。正好违反本批次刚写入规则的 A7（eyebrow 一页只出现一次）。
3. **同类全站扫描**：诊断页同样模式 5 处（`DoctorPage.tsx:131/230/246/262/381` 重复 `doctor.eyebrow`）、环境变量页 1 处（`EnvPage.tsx:218`）；StyleGuide 为 demo 豁免。

**定稿（2026-09-08，用户确认推荐）**:

| 项 | 定稿 |
|---|---|
| 节级眉签 | **全部删除**（概览 3 处重复 + lockfile 的 MISE.LOCK + 诊断 5 处 + 环境变量 1 处）；页面眉签只在页头出现一次；各节只留标题。lockfile 节标题保留 `mise.lock`（文件名照实呈现） |
| i18n 清理 | 删除/停用 `preview.lockfile.eyebrow` 等不再使用的 key（双语 + keys.ts） |
| mise.lock 缺失态 | **缺失即不渲染整节**；存在时正常只读展示；commandHint 保留 `mise.lock` 字样承担教学 |
| 拟定 issue | labels: bug（视觉违规）, v1；与规则 A7 互为印证 |

---

## Issue 7【一致性 + 结构】: 刷新按钮缺页/位置不统一 → 统一上移到顶部工具栏

**用户原话**: 「我看首页/环境变量/插件页面没有刷新按钮，但是其他页面都有，这是一个bug吗」「或者刷新按钮是不是应该放在上面的工具栏呢，我不知道好不好实现，改动大不大」

**代码调查结论**:

1. **现状**：有刷新按钮的页——设置 `:206`、诊断 `:84`、概览 ×2（`:339/:549`）、任务 `:437`、工具 `:614`；**首页、环境变量无**；插件页的刷新藏在 Registry 区搜索框旁（`PluginsPage.tsx:226-234`），但 `onRefresh` 实际同时刷新 Registry + 已安装列表，已安装区无独立入口 → 用户感知为"没有"。
2. **可行性**：顶部工具栏是 PageShell/DirectoryIndicator 共享 chrome；新增一个"页面注册 refresh 回调"的 context，页面挂载时注册（invalidate 该页全部查询），工具栏按钮统一调用。工作量 M 偏小：PageShell + context + 各页一行注册 + 删除 6 处局部按钮。

**定稿（2026-09-08，用户确认推荐）**:

| 项 | 定稿 |
|---|---|
| 刷新统一上移 | 顶部工具栏右侧、「最近」左侧放一个全站统一刷新按钮；PageShell 加 refresh 注册 context，各页面注册"invalidate 本页全部查询"（插件页一次刷两区） |
| 局部按钮 | 删除设置/诊断/概览×2/任务/工具/插件共 7 处局部刷新按钮与对应 CSS |
| 首页/环境变量 | 通过注册机制自然获得刷新能力 |
| 规则沉淀 | ui-ux-rules 新增：**刷新是页面级能力，统一由顶部工具栏提供；页面/区块内不再各自放刷新按钮**（双语，同一反馈周期内固化） |
| 拟定 issue | labels: enhancement, v1 |

---

## Issue 8【功能裁剪 + 一致性】: 移除「全部升级」+ 安装按钮 variant 统一

**用户原话**: 「工具页面的全部升级按钮去掉，不保留全部升级功能，还有工具页面的安装按钮和插件页面的安装按钮为什么样式不统一呢，这些个按钮样式还是要统一的吧，查看一下其他页面是否有同样的问题呢」

**代码调查结论**:

1. **全部升级**：`ToolsPage.tsx:597-611`（primary sm，禁用原因走 native `title`）。删除面：按钮、`onUpgradeAll`、i18n `tools.actions.upgradeAll` / `tools.noOutdated`（双语 + keys.ts）。`mise outdated` 数据仍供「最新」列使用。规则 A8（数量进标签）保留——功能虽删，规则对其他场景仍有效。
2. **安装按钮不一致属实**：工具页行内 `:313` 与表单 `:906` 为 `primary`；插件页 Registry `PluginsPage.tsx:139` 为 `secondary`。规则文档 variant 映射表明文 install = primary → 插件页违规。
3. **全站扫描发现的模糊地带**：「选择目录」在映射表里是 secondary，但概览空状态 `:371` 与 DirectoryIndicator「选择其他目录」为 primary。

**定稿（2026-09-08，用户确认推荐）**:

| 项 | 定稿 |
|---|---|
| 全部升级 | 功能整块移除（按钮 + 逻辑 + i18n key） |
| 插件页安装 | `secondary` → `primary`，与映射表一致 |
| 选择目录例外条款 | 映射表补例外（双语，已固化）：空状态/缺态下页面唯一出路可为 primary；工具栏多按钮并存时「选择其他目录」降为 secondary |
| 拟定 issue | ① 移除全部升级（enhancement）；② 按钮 variant 统一（bug） |

