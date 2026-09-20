# Beta11 Feedback Scratch

> 工作方式（沿用 beta10 定稿）：用户报一个，调查一个；调查时同时排查同类/关联问题（含「查过、无问题」的对照记录）；结论写入本文档标「待用户定稿」，用户确认后标「定稿」。定稿前不动代码、不发 GitHub。收集齐后调用 `to-spec`（汇总发 spec issue）+ `to-tickets`（拆实现 ticket）。

## 收集中的 issue

### Issue 1【Directory overview 页：标题大小写 / 工具栏重叠 / eyebrow 大写 / Recent 按钮 / 按钮顺序与样式】五条一组

**来源**：用户报告（2026-09-20，附截图：窗口缩窄后的 Directory overview 页工具栏）。原话：「英文状态下，侧边栏 Directory overview 应该是 Directory Overview 吧，页面标题应该也是叫这个……然后上面工具栏，当窗口缩小的时候，文字会重叠……还有 CURRENT DIRECTORY 我不知道有没有必要要全大写，还有上面的 Recent 按钮我不知道要不要保留，感觉好像是没什么必要保留」。

**截图核对说明**：截图红框 2 里两个「药丸」不是 config 文件 chips（config 文件列表在页面主体「Config files」节，不在工具栏）——实为 **Global / Open in terminal 两个按钮被溢出的路径文本覆盖**后的样子（详见 4-b 根因）。

---

#### 1-a 「Directory overview」第二个词应大写？

**调查结论**：

1. 文案：`preview.title` 与 `preview.nav` 两个 key 均为 `"Directory overview"`（`misedeck/src/i18n/en.json:161,164`；zh-CN「目录概览」），分别渲染于页面 `<h1>`（`DirectoryPreview.tsx:345`）与侧边栏导航（`PageShell.tsx:166`）。
2. **同类排查（全仓 en 标题/导航项查过）**：页面标题与侧边栏导航中"多词"的**仅此一处**；Home/Tools/Tasks/Env/Doctor/Settings/Plugins 均单词，无大小写问题。但多词**节标题**（"Resolved tools"、"Raw doctor output"、"Recent directories"、"Installed plugins" 等）全部是 sentence case——这是 **beta7 的显式裁决**（`docs/feedback/beta7-feedback-scratch.md:210,217-218`：「用户拍板——更改规则，标签回归正常写法」，全站只保留 eyebrow 一层大写）。两份设计文档无任何 Title Case 条文；`visual-language.md:61` 对 page titles 的描述是 "normal case"。
3. 因此现状**符合现行规则**；用户的 Title Case 预期若采纳，属于对 beta7 裁决的修订（或加例外层），需同步写进设计文档。

**待用户定稿**：

- A：维持 sentence case（现行规则，beta7 裁决；标题与其他节标题一致）。
- B：仅"页面标题 + 侧边栏导航"这一显示层改 Title Case（"Directory Overview"），节标题/标签/按钮保持 sentence case；需把「标题层 Title Case、标签层 sentence case」写进 `visual-language.md`（en 与 zh-CN 双份）。
- C：全站多词标题统一 Title Case（改动面最大，推翻 beta7）。

➡️ 推荐 **B**：标题层与标签层是两个层级，Title Case 只给显示层不影响标签体系； zh-CN 无大小写问题不受影响。

**定稿（2026-09-20，用户确认 B）**：`preview.title` / `preview.nav` 改 "Directory Overview"；规则修订——「页面标题 + 侧边栏导航 Title Case；节标题/标签/按钮保持 sentence case」写入 `visual-language.md`（双语），是对 beta7 裁决的修订（限定在标题层）。

---

#### 1-b 窗口缩小时工具栏文字重叠（实锤 bug）

**调查结论**：

1. 组件：工具栏是 `DirectoryIndicator`（`PageShell.tsx:114` 渲染于**所有页面**内容区顶部），目录模式 `.row` = eyebrow + Tooltip(路径) + actions（最多 5 个控件：Global / Open in terminal / Refresh / Recent / Choose another directory）。
2. **根因（两层叠加）**：
   - **路径省略失效**：`<Tooltip><span class={styles.path}>` 结构中，Tooltip 的 `.trigger` 是 `display: inline` 包裹元素（`Tooltip.module.css:6-11`），它取代 `.path` 成为 `.row` 的 flex item；`.path` 上的 `flex:1; min-width:0; overflow:hidden; text-overflow:ellipsis`（`DirectoryIndicator.module.css:41-50`）因父级是 inline 盒子而全部失效（inline 元素 overflow 不裁剪）→ 路径不省略，整段文本溢出画在按钮上。截图中两个药丸即 Global / Open in terminal 按钮被路径文本覆盖。
   - **actions 区不可收缩**：`.actions { flex:none }`（`:52-58`），内部按钮全部 `nowrap`，`.row` 无 `flex-wrap`；窗口最小 900px（`tauri.conf.json`）+ 侧栏展开时 5 个按钮（en 文案 "Open in terminal"、"Choose another directory" 很长）固有宽度即可超限。
3. **规则空白**：`ui-ux-rules.md:50-54` Chrome 条只规定 "the toolbar path ellipsizes; the content area clips"，**未规定 actions 区在窄窗下的行为**（换行？收进菜单？）——重叠缺陷正落在这个空白里，修复时需补条文。
4. **同类排查（查过）**：
   - 该工具栏全页面共享 → **所有页面**在目录模式下都有此缺陷（本次只报了目录页）。
   - Tooltip 全仓 30+ 处调用：绝大多数在表格 cell 内（单元格自身有 min-width/ellipsis 约束，无此问题）；**非表格的 3 处**（`ToolsPage.tsx:1121`、`SettingsPage.tsx:312`、`EnvPage.tsx:316`）需在修复票据内顺手验证是否有同样"被包裹元素本应自己是 flex item"的结构。
   - 全局模式工具栏仅 eyebrow + 2 按钮，风险小；ToolsPage 页内 `.toolbar` 已有 `flex-wrap`（`ToolsPage.module.css:37-42`）——是好的既有先例。

**待用户定稿**（修复方向）：

- A（推荐）：路径省略恢复（把 flex/ellipsis 约束移到不受 Tooltip inline 包裹影响的层），`.row` 允许 actions 换行到第二行（flex-wrap，与 ToolsPage 先例一致）；`ui-ux-rules.md` Chrome 条补「actions 区窄窗换行」规则。
- B：actions 不换行，溢出控件收进 "More" 菜单（交互改动大，新增一个概念）。

➡️ 推荐 **A**。

**定稿（2026-09-20，用户确认 A）**：按 A 修复；同步在 `ui-ux-rules.md:53` Chrome 条补「actions 区窄窗换行」规则（双语）。

---

#### 1-c 「CURRENT DIRECTORY」有必要全大写吗？

**调查结论**：

1. 文案 `directory.eyebrow` = "CURRENT DIRECTORY"（`en.json:18`），全局模式对应 `directory.globalMode` = "GLOBAL MODE"（`:21`）；渲染于 `DirectoryIndicator.tsx:137`，样式 `.modeLabel` = uppercase + 0.18em tracking（`DirectoryIndicator.module.css:24-39`，zh `:lang(zh)` 复位）。
2. **这是现行设计系统明确保留的唯一大写元素，不是违规**：`ui-ux-rules.md:13`（"Uppercase + wide tracking belongs to the section eyebrow alone"）、`:142`；`visual-language.md:64,70`（eyebrow 用于 mode/section 标签，Latin-only，beta9 定稿 12px）。沿革：beta3 确立标签大写 → beta7 收敛到只剩 eyebrow → beta8/beta9 调字号，**从无取消大写的记录**。
3. **同类排查（查过）**：全仓 `text-transform: uppercase` 仅 3 处（DirectoryIndicator、EmptyState eyebrow、MiseMissingState eyebrow），均为 eyebrow 装饰用途；硬编码大写仅 `env.namePlaceholder` = "Key (UPPER_SNAKE)"（格式提示，有意为之）。数据型大写残留为 0。

**待用户定稿**：

- A（推荐）：**保留**。它是全站唯一的大写元素、功能是"当前模式"指示器（目录/全局），规则链路完整（beta3→beta7→beta9）。
- B：取消大写（改 sentence-case mono 标签）＝推翻三轮 beta 裁决，需改 `ui-ux-rules.md`/`visual-language.md` 条文 + 3 处组件，且 "GLOBAL MODE" 等 eyebrow 装饰会一起失去层次。

➡️ 推荐 **A**（用户只是质疑，无功能问题；规则背书充分）。

**定稿（2026-09-20，用户授权按专业建议）**：**保留**。用户明确「别管我之前怎么决策的，按你专业的建议来」；专业结论是 eyebrow 大写是设计系统的刻意签名（全站唯一大写层、模式指示器功能、三轮 beta 收敛的结果），取消的代价大于收益。

---

#### 1-e 工具栏按钮顺序 + 刷新按钮样式不一致（Q3 引申，本轮新查）

**用户原话**：「保留（Recent）也可以，但是位置顺序到底怎么排你有推荐吗？因为全局模式下是刷新和选择目录排在一起，选择目录后又是 刷新和选择其他目录又被最近给隔开了，就觉得怪怪的，而且刷新按钮的样式和其他的好像也不一样，这个也要查一下」（附两张截图：全局模式 [刷新][选择目录] vs 目录模式 [全局][在终端中打开]**[刷新][最近]**[选择其他目录]）。

**调查结论——样式不一致（实锤，且是规则违规）**：

1. 目录模式工具栏混用两套按钮体系：`Global / Open in terminal / Recent` 是裸 `<button class={styles.action}>` 自定义 mono 按钮（`DirectoryIndicator.module.css:60-93`，mono 字体、透明底、1px 边框、radius 4px）；`Refresh` 和 `Choose another directory` 走共享 `Button` 组件（`DirectoryIndicator.tsx:159-168, 226-233`，`--font-ui` 字体）→ 同一行里 3 个 mono 小按钮 + 2 个 UI 字体按钮，刷新按钮因此"看起来不一样"。
2. **规则判据**：`ui-ux-rules.md:68`——"One global action, one visual role … A bespoke re-implementation of an existing button style is a bug"。`.action` 三件套就是对 `secondary` 按钮的 bespoke 重实现，违反现行规则。
3. **沿革（不是谁写错了，是两条 beta8 决策相撞）**：beta8 Issue 1 把 `.action` 三件套从 10px 提到 12px 并删掉 `▾`，当时**保留了 mono 裸按钮形态**（owner 过目）；beta8 Issue 7 把刷新统一上移工具栏时**用共享 `Button` 实现**（owner 也过目）。两套各自合规地落地，谁也没和另一方对齐；beta9 定稿「一种词汇四个 variant + bespoke 即 bug」规则后，这组混搭成为存量违规。
4. **同类排查（查过）**：`styles.action` 作按钮用途全仓仅 DirectoryIndicator 一处（`Banner`/`EmptyState` 的 `.action` 是布局容器类名，非按钮）；无 button-vocabulary lint 防线（`scripts/` 8 个检查无此项），属 review 时人工类。

**调查结论——顺序**：

1. 现状：全局模式 `[刷新][选择目录(primary)]`；目录模式 `[全局][在终端中打开][刷新][最近][选择其他目录(primary)]`。owner 的不适感 = 跨模式看，「刷新」与「选择(其他)目录」的相邻关系被「最近」打断。
2. 动作族：模式/会话 {Global, Open in terminal}、数据 {Refresh}、目录来源 {Recent, Choose}。一维排列下三族必然有一处交错，关键是让**跨模式稳定**的尾对 `[刷新][选择目录]` 不打断——全局模式只有这一对，目录模式应保留它作为恒定尾部。

**待用户定稿**：

- **样式（推荐 A）**：`.action` 三件套迁移到共享 `Button` 组件——`Global`/`Recent` → `secondary`、`Open in terminal` → `ghost`（映射表：「open in editor」类低频次动作用 ghost），Refresh/Choose 不动；删除 `.action`/`.actionDisabled` 样式。方向 B（把刷新改成 mono 裸按钮迁就三件套）不推荐：等于新增第二套 bespoke 实现，违反 ui-ux-rules.md:68 的精神。
- **顺序（推荐 B）**：`[全局][在终端中打开][最近][刷新][选择其他目录]`——尾对 `[刷新][选择(其他)目录]` 跨模式恒定（全局模式即该尾部本身），Recent 作为目录来源动作紧邻其左；全局/终端打开保持最左。选项 A：维持现状（Recent 夹在刷新与选择之间）。选项 C：Recent 移到路径旁（语义上它改变路径）——但打破「actions 右聚」约定（ui-ux-rules.md:70），不推荐。

➡️ 推荐 **样式 A + 顺序 B**。

**定稿（2026-09-20，用户确认）**：按推荐执行——`.action` 三件套迁移共享 `Button`（Global/Recent → `secondary`，Open in terminal → `ghost`），删除 `.action`/`.actionDisabled` 样式；目录模式按钮顺序改为 `[全局][在终端中打开][最近][刷新][选择其他目录]`。

---

#### 1-d 「Recent」按钮要不要保留？

**调查结论**：

1. 实现：`DirectoryIndicator.tsx:169-224`，`FloatingMenu` 弹层列出**最近目录**（最多 8 条，localStorage `misedeck.directoryRecents.v1`，`directoryContext.tsx:41-42`），每项可点击切目录、可 × 单条移除；空列表时按钮 disabled（依 `ui-ux-rules.md:28` no-op 控件必须置灰）。
2. **功能定位**：它是**唯一不打开系统文件对话框的快速切目录入口**——"Choose another directory" 走 Tauri 原生对话框，不带 recents 记忆。
3. **历史**：beta5 定稿保留弹层行为；beta8 删硬编码 caret、字号 10px→12px；beta3–beta10 反馈文档中**无对该按钮存在价值的质疑记录**。`ui-ux-rules.md` 也没有"每个按钮须有存在理由"的条文（有 beta5 裁掉"复制命令"按钮的先例，但无成文规则）。
4. **同类排查（查过）**：无同类问题。

**待用户定稿**：

- A（推荐）：**保留**。功能唯一（快速回切到最近项目目录，这正是 MiseDeck 的核心动线），空态有置灰规则，维护成本近零。
- B：删除。则 `directoryContext` 的 recents 存储/removeRecent 将无消费者，需一并清理（连同 localStorage key）；工具栏在窄窗下也少一个控件（与 1-b 正相关）。

➡️ 推荐 **A**；若仍觉得多余，建议删除前确认"Choose another directory"对话框是否需要承接 recents 能力，否则会丢失功能。

---

## 已关闭 issue

（暂无——Issue 1 五条子项已全部定稿，待收集齐后统一走 to-spec / to-tickets）

---

### Issue 2【工具页：添加工具文案 / 回车选错 / 空列 / 使用列 affordance / 确认弹窗截断 / 卸载流程】六条一组

**来源**：用户报告（2026-09-20，附两张截图：工具页添加工具面板+表格；「卸载 ant?」确认弹窗命令单行截断）。原话：「添加工具栏的提示语是搜索 registry，这太割裂了，要换。而且我输入 java，一回车，变成了 ant……下面的表格，上面列名有的莫名其妙的，比如请求列，最新列全又没有有效值，那保留这列干啥呢，使用列做的页不像能点击切换版本的按钮样子，根本没有提示或者交互引导，卸载弹出来的窗口，显示不完全，这种可以显示换行就显示换行吗？还有如果我要 uninstall 一个版本，我得先 use，然后再 unuse，这也比较怪吧」。

---

#### 2-a 添加工具占位文案「搜索 Registry」太割裂

**调查结论**：

1. 现状：`tools.addTool.searchPlaceholder` = "Search the registry (e.g. node)" /「搜索 Registry（如 node）」（`en.json:107`），搜的数据源是 `mise registry --json` 的 shorthand+aliases+描述（`ToolsPage.tsx:854-873`）。
2. **规则交叉**：CONTEXT.md 有 Registry 词条（`mise registry`，官方命令），所以现行文案**合规**——owner 不满是受众层面（普通用户不懂这词），非 bug。
3. **同类排查（查过）**：UI 文案里 "Registry" 共 4 处——placeholder（`:107`）、`tools.hint`（`:72`）、`tools.empty.body`（`:86`）、`addTool.noMatches`（`:109`），改须 4 处同步，否则同一面板两套词汇。commandHint 里的 `mise registry` 是命令名不受影响。

**待用户定稿**（文案三选一，附带问题：Registry 是否从「面向用户文案词汇」降级为「仅命令/文档词汇」）：

- A（推荐）：`Search tools (e.g. node)` /「搜索工具（如 node）」——用 CONTEXT.md 的 Tool 词，用户要的就是"工具"，零门槛；4 处同步改。
- B：`Tool name (e.g. node)` /「工具名（如 node）」——与版本框占位 `latest` 极简风格一致，但弱化"可搜描述"能力。
- C：`Search by tool name (e.g. node)` /「按工具名搜索（如 node）」——最精确但最长，需核对 placeholder 完整可见规则（ui-ux-rules.md:55）。

➡️ 推荐 **A + Registry 降级**（UI 不再主动说 Registry，词条保留在 CONTEXT.md；`noMatches` 改「没有匹配项——仍可直接输入 backend:name（如 npm:prettier）」）。

**定稿（2026-09-20，用户确认）**：按 A 执行；Registry 从面向用户文案退役（4 处同步改），词条保留在 CONTEXT.md。

---

#### 2-b 输入 java 回车选中 ant（实锤 bug，无需决策）

**调查结论**：

1. 根因（确定性排序缺陷，三因素叠加）：候选 = 子串过滤 `short/description/aliases` 后**保留列表原序**（`ToolsPage.tsx:862-873`），列表序 = short 字母序（`miseTools.ts:530`）；输入变化时 `setActiveIndex(0)`（`:923-927`）；Enter 永远选中 `suggestions[activeIndex]`（`:937-943`）。本机实证：`ant` 的描述含 "…**Java** library…" 靠 description 命中且字母序第一 → 输入 "java" 第 0 项就是 `ant` → 回车选中 ant。
2. **修复方向**：候选分级排序（short 完全等于 query > short 前缀 > alias > description），`.slice(0,10)` 移到排序后；可叠加"query 与某 short 完全相同时 Enter 直接提交该工具"。`ant` 等描述命中项仍留在列表（确实相关），只是不排在精确名之前。
3. **同类排查（查过，无问题）**：全仓唯一相关性列表就是此 combobox；EnvPage 的 Suggestions 是原生 `<datalist>`，无排序逻辑，无同类缺陷。

**待用户定稿**：无——bug 修复方向明确，随 ticket 走。

**定稿（2026-09-20，用户确认）**：按调查结论修复——候选分级排序（short 完全等于 query > short 前缀 > alias > description），`.slice(0,10)` 移到排序后。

---

#### 2-c 「请求」「最新」两列大部分行无值

**调查结论**：

1. 「请求」= `requestedVersion ?? "—"`（`ToolsPage.tsx:321`）：只有 Config 文件请求了该工具才有值；手动 `mise install` 装的（orphan）是 "—"——owner 截图里 ant/python/rust 正是 orphan。列有诊断价值（orphan 状态驱动 Unuse 的 argv 选择）。
2. 「最新」= outdated map（`mise outdated --json --bump`）驱动（`useToolsList.ts:116-124`、`ToolsPage.tsx:305-308`）：**全最新时整列必然 "—"**，是列的语义（升级路径 `当前 → 最新`，ui-ux-rules.md:92），非数据缺失——纯噪声。
3. **同类排查（查过）**：有现成先例——Backend 列在「没有任何一行有值」时整列不渲染（`ToolsPage.tsx:403` showBackend，规则依据 ui-ux-rules.md:15 "Missing data renders as `—` or the column is dropped"）；其他页面表格（Settings/Tasks/Env/Doctor/DirectoryPreview/VersionCenter）的稀疏 "—" 都是逐行数据稀疏，符合数据诚实规则，无同类违规。
4. VersionCenter installed 子表有同款「请求」列（`VersionCenter.tsx:133-136`），父表怎么定子表保持一致。

**待用户定稿**：

- A（推荐）：「最新」列采纳 backend 列同款逻辑——无 outdated 行时整列隐藏（OutdatedHint 计数器仍承担"全部最新"表述）；「请求」列维持现状。
- B：两列都保留现状。

➡️ 推荐 **A**（零规则冲突，有先例，无额外开销）。

**定稿（2026-09-20，用户确认）**：「最新」列无 outdated 行时整列隐藏（backend 列同款逻辑）；「请求」列维持现状；VersionCenter 子表与父表保持一致。

---

#### 2-d 「使用」列不像可点击的切换控件（实锤 affordance 缺陷）

**调查结论**：

1. 控件是 `UseVersionCell`（`ToolsPage.tsx:718-771`，FloatingMenu trigger 是 `<button class=useTrigger>`），样式与只读 Badge 几乎同构（mono、1px 边框、4px radius），hover 仅边框加深——与旁边只读「版本」列单元格视觉平级，无法区分谁是控件谁是数据。
2. 具体冗余：trigger 的 Tooltip 内容是 `row.version`（`:729`）——把已完整可见的版本号再弹一遍，零信息量，白白占掉"悬停可发现性"渠道。
3. **规则交叉**：caret 禁令（ui-ux-rules.md:99，beta4 否决恢复 chevron）是死线不能加 ▾；但 hover 出底色是**本系统已备案的"可点"信号**（menu option hover 用 beam 6% 底色 `:208-214`），trigger 自己反而没用上。ADR-0007：可发现性属 GUI 层 affordance，不受 CLI 词汇约束。
4. **同类排查（查过）**：LanguageSwitcher（有 globe 图标，OK）、Recent 按钮（Issue 1-e 已定稿迁移共享 Button）、工具名展开按钮（hover 变色+整格可点，owner 未抱怨）——无需额外改动。

**待用户定稿**：

- A（推荐）：① `.useTrigger:hover` 加 `background: color-mix(in srgb, var(--beam) 6%, transparent)`（复用 option hover 语言，零新 token）；② Tooltip 从 `row.version` 换成教学文案「点击切换版本 / Click to switch version」。
- B：A + 叠加拉开与「版本」数据列的视觉差距（增大内边距/min-width）。

➡️ 推荐 **A**；B 的叠加项由 ticket 实现时按视觉效果定。

**定稿（2026-09-20，用户确认）**：按 A 执行——hover 加 beam 6% 底色；Tooltip 改教学文案「点击切换版本 / Click to switch version」。

---

#### 2-e 卸载确认弹窗命令单行截断（实锤，全站 4 弹窗同病）

**调查结论**：

1. 根因：共享 `ConfirmDialog` 的命令框 `.command { white-space: nowrap }` + `.commandWrap { overflow-x: auto }`（`ConfirmDialog.module.css:44-58`）——强制单行+横向滚动；`commandEcho` 在目录上下文插入 `-C <绝对路径>`（`ExecutionPanel.tsx:60`），长命令必截断。
2. **规则空白**：beta9 Issue 7 立过「命令是不可折行的最小单元」规则（ui-ux-rules.md:23），但针对的是页面 commandHint（多条命令之间折行），从未覆盖确认弹窗的单条完整命令——弹窗恰恰是教学时刻（规则 :20），命令截断=教学失败。修复时补条文（分场景：hint 命令间折行 vs 弹窗命令软折行）。
3. **同类排查（查过）**：ConfirmDialog 4 个调用方全部同病（ToolsPage 卸载/删版本、EnvPage 删变量、PluginsPage 卸插件、HomePage self-update）；执行面板头部 `.command` 也是 nowrap+ellipsis 但**旁边有 copy command 按钮可取全文**+transcript 有完整命令，低危可不动（可选顺手加 Tooltip 全文）；TrustBanner 不显示命令；CommandHint/表格单元格已有折行或 Tooltip 全文机制，无问题。
4. 折行策略：弹窗只有一条命令，只能软折行——长路径无空格，必须 `overflow-wrap: anywhere`（mid-token 折断可接受：数据诚实优先于不断 token）。

**待用户定稿**：

- A（推荐）：共享 ConfirmDialog 改软折行一处修好 4 弹窗；`ui-ux-rules.md` 补「确认弹窗命令必须完整可读」条文（双语）。
- B：A + 执行面板头部截断命令加 Tooltip 全文（可选顺手项）。

➡️ 推荐 **B（含顺手项）**。

**定稿（2026-09-20，用户确认）**：共享 ConfirmDialog 改软折行（`overflow-wrap: anywhere`，一处修好 4 弹窗）；`ui-ux-rules.md` 补「确认弹窗命令必须完整可读（软折行），与 hint 命令间折行规则分场景」条文（双语）；执行面板头部截断命令加 Tooltip 全文。

---

#### 2-f 卸载某版本要先 use 再 unuse（ADR-0008 有意设计 vs 动线成本）

**调查结论**：

1. 现状：版本中心 installed 子表 active 版本的操作列渲染 "—" 无任何按钮（`VersionCenter.tsx:154-157`）；非 active 版本才有「使用」+「删除此版本」。代码注释（`:146-152`）与 ADR-0008 Consequences（`docs/adr/0008-*.md:30`）都写明：active 版本 re-use 是 no-op、删它的文件会被 Config 请求立刻重装——tool 级 Unuse 才是离开 active 版本的正路。
2. **这是 app 自己加的守卫，不是 mise CLI 的限制**（`mise uninstall <tool>@<version>` 技术上可执行，只是会产生"删了立刻重装"的迷惑行为）。owner 的"先 use 再 unuse/uninstall"动线是守卫的直接后果。
3. 语义细节：工具只有一个 active 版本时，正确移除本来就是 tool 级 Unuse（连请求带安装一起清）；B 场景实际是"多版本、想清掉当前在用的那个"。

**待用户定稿**：

- **C（推荐，底线）**：active 行的 "—" 换成**置灰的「删除此版本」+ Tooltip 说明**「先切换到其他版本才能删除此版本」——纯 affordance（ui-ux-rules.md:28 no-op 控件置灰+说明正是此意），零命令改动，不碰 ADR-0008。
- **B（进阶，单独决策/单独 ticket）**：active 版本直接给可用「删除此版本」，确认框诚实展示两条命令（`mise use <other>` + `mise uninstall <tool>@<version>`）并顺序执行——需①修订 ADR-0008 双语版，②ConfirmDialog 支持多命令展示，③定义第一条失败是否执行第二条，④教学文案明确是两条 mise 命令（不发明新概念，组合动词都是 mise 自己的）。与 AGENTS 原则 1/2 兼容（ADR-0007 允许 GUI 层组合 affordance），但改动面大。
- A：保持现状（active 行继续 "—"）。

➡️ 推荐 **先做 C；B 单独拍板、单独 ticket**（若想 beta12 前少动 ADR，可以只上 C）。

**定稿（2026-09-20，用户确认）**：本期做 C——active 版本行置灰「删除此版本」+ Tooltip 说明「先切换到其他版本」；B（双命令组合卸载）留作独立 ticket 后续周期决策（需修订 ADR-0008 双语版 + ConfirmDialog 多命令 + 失败语义）。

---

### Issue 3【工具页整体上手体验：包管理器标准审查】

**来源**：用户报告（2026-09-20）：「你再使使劲审查下工具页面，说实话我还是不满意，就是用着不自然……就是和那些软件管理工具那样上手就用，便捷，现在就感觉总差了口气」。以主流包管理器/应用商店 GUI 基准（搜索即得 → 一键安装 → 状态一目了然 → 升级/卸载一步直达 → 全程有反馈）做"首次使用不读文档能否上手"逐区审查（子代理通读 ToolsPage 全实现 + i18n + 规则文档）。

**任务流程步骤对照**：添加工具 5 步（基准 2 步，多一次 Enter）；升级 outdated 需逐行点+串行等待（基准一键全部更新）；仅安装不启用 4-5 步且行展开入口零视觉线索；其余动线（切换版本 2 步、卸载 2 步、删版本 4 步）可接受。

---

#### 3-a Blocker：不可信目录下工具页全部变更操作静默无响应

**调查结论**：`fireMutation` 在 `!guard.allowed` 时静默 return（`ToolsPage.tsx:256`，AddToolEntry `:537`、确认弹窗 Confirm `:666-674` 同），而 **ToolsPage 全页没有渲染 TrustBanner**（其他四页 DirectoryPreview/Env/Tasks/Settings 都有）——`trustContext.tsx:268-273` 契约要求 caller focus banner，本页无 banner 可 focus。后果：目录含未信任 mise.toml 时「使用」「升级」等按钮看着可点、点了全无反应。违反 `ui-ux-rules.md:28`（no-op 控件不得伪装可用）、`:35`（no dead ends）。

**待用户定稿**：无——纯一致性修复（照四页先例加 TrustBanner），随 ticket 走。

---

#### 3-b Major：无批量升级，OutdatedHint 纯文字不可行动

**定稿（2026-09-20，用户否决）**：**不做，且立为产品立场**——owner 原话：「绝对不要加批量更新的功能，mise 主要还是管理开发工具的版本，不是管理应用软件版本，开发工具很多时候最佳实践是使用 lts 版本或者比最新版本低几个版本，目的防止最新版引入大的 bug 或者破坏性更新，保持开发环境和运行环境的稳定。也不需要多个 tool 同时更新的功能」。**立场精化（owner 补充）**：「我只是想好用，但是还是要区分开发工具和应用软件之间的区别」——即：包管理器级的好用仍是目标（Issue 3 的确认条、per-action 等都在做），反对的只是"应用商店式追新动线"（一键全部更新=暗示最新即最好），不是反对好用本身；设计决策一律以"开发工具求稳"为领域前提。**先例**：beta8 Issue 5（2026-09-08）已裁定「批量打包多条命令属于做出 mise CLI 新功能，越过展示/交互层边界」（ADR-0007 边界的第一个应用实例），beta8 Issue 8 已移除「全部升级」按钮。本次审查代理未检索到该历史而重新推荐，属复发——**ticket 应把该立场固化进 `docs/design/product-logic.md`（双语），防止后续再被提案**（beta8 当时已标注"值得固化"未落）。OutdatedHint 维持纯计数文字；m3「只看 outdated」过滤 chip 随本条一并搁置（推荐时与批量升级同源，无独立保留理由）。

---

#### 3-c Major：成功反馈闭环近乎缺失（"差口气"核心来源之一）

**调查结论**：规则 `ui-ux-rules.md:75-77` 定死「成功时面板不开，靠 reopen affordance 的 tone dot」；升级成功的唯一画面是「最新」列箭头消失（2-c 定稿后该列还会整个隐藏）——一个消失的信号。失败很响（面板自动弹开）、成功近乎无声。应用商店标准是"每个动作以不可误读的确认收场"。

**待用户定稿**：

- A（推荐）：动作成功后页面内短暂确认条（如「node@22.11.0 已安装并启用」，数秒消失），命令回显仍归执行面板教学；需修订 `ui-ux-rules.md:75-77`（双语）——成功在页面内闭环、失败仍走面板。
- B：维持 tone dot 现状。

**定稿（2026-09-20，用户确认 A）**：做页面内短暂确认条；`ui-ux-rules.md:75-77` 修订为「成功在页面内闭环（短暂确认条）、失败仍走执行面板自动弹开」（双语）。

---

#### 3-d Major：页面级单飞锁，一个长安装冻住全页所有变更

**调查结论**：全页共用一个 `mutation = useOwnRun()`（`ToolsPage.tsx:253`，注释自认"有意"），执行期间 Use/升级/仅安装全部 disable——而 `ui-ux-rules.md:79`（#138）明确锁定是 **per action**："不是全局最多一条"。本页把规则又收窄回了页面全局，装 java 的几分钟里连 node 都装不了。

**待用户定稿**：推荐改回 per-action 独立 runner（规则本义，无词汇问题；工程改动中等）。因现状注释写明有意，需 owner 确认方向。

**定稿（2026-09-20，用户确认）**：改回 per-action 独立 runner（对齐 `ui-ux-rules.md:79` 规则本义）。

---

#### 3-e Major：添加工具要按两次 Enter

**调查结论**：列表打开时 Enter 永远选中建议并关列表（`ToolsPage.tsx:937-943`），提交必须第二次 Enter；即使输入框已是精确 `node` 也一样。与 2-b（选中错项）互补：2-b 修排序，本条修"选中后还要再按一次"的结构。修复：query 与建议 short 完全相同时 Enter 直接提交（ADR-0007 范围内）。

**待用户定稿**：无——修复方向明确，随 ticket 走。

---

#### 3-f Major：同一版本号在表中渲染三次，「使用」列表头与内容错位

**调查结论**：Version 列显示 `r.version`（`:441-447`）、「使用」列 trigger 又显示 `row.version`（`:741`）、outdated 时「最新」列第三次（`:476`）——两个视觉同构 mono 芯片并排，一个数据一个控件（2-d 的 affordance 症状根因在信息架构：同一数据渲染两遍）；"使用/Use"动词表头下盖的是版本号按钮。

**待用户定稿**：推荐合并——Version 单元格本身就是切换 trigger（数据+控件合一），省一列、根除歧义（布局改动，ticket 内实现时 owner 过目视觉效果）。

**定稿（2026-09-20，用户确认）**：合并，实现时给 owner 过目视觉效果。

---

#### 3-g Major：orphan（孤立安装）状态行上不可见

**调查结论**：orphan 推出后只用于选 argv（`:326→:151,655`）；行级唯一线索是「请求」列 "—"（弱）；「卸载」按钮对 orphan 与普通工具一字不差，而 orphan 的 Unuse 实际跑 `mise uninstall --all`（删**全部**版本），此事实只在弹窗 body 出现。mise CLI 有此概念（`mise ls` 报未请求项），但 CONTEXT.md 无词条。

**待用户定稿**：推荐加行级 orphan 徽标 + CONTEXT.md 补词条（zh「孤立安装」）——加词需 owner 拍板（原则 3：词汇只能来自 mise 概念，orphan 是 mise 概念故合规）。

**定稿（2026-09-20，用户确认）**：加行级徽标；CONTEXT.md 补 orphan / 孤立安装 词条（en+zh 双份同步）。

---

#### 3-h Minor 打磨项（7 条，ticket 内一并处理）

m1 单版本工具「使用」trigger 点开全禁用菜单（可用控件产出全禁菜单）；m2 「最新」表头与"当前 → 最新"路径内容不符；m3 无「只看 outdated」快捷过滤（可与 3-b 的过滤 chip 合并）；m4 版本中心空态直接引 CLI 散文，可补 GUI 内下一步指引；m5 建议列表上限 10 条无"还有更多"提示；m6 表格 min-width 1106px > 窗口最小 900px，主操作列最右需横滚（可做 sticky actions 列）；m7 `tools.hint` 是 ~60 词含 8 动词的信息墙（2-a 反正要重写，砍成一句话）。

---

#### 3-i 动词体系决策簇（owner 级取舍）

**调查结论**：CONTEXT.md:53-67 把 Use/使用、Unuse、Install only、仅安装全部成文（ADR-0008），设计依据是原则 1（教 CLI）+ one-question test。owner 直觉得到证实：「使用」作为安装主按钮是动词体系里对新手摩擦最大的词（包管理器用户预期 Install）；「Unuse」根本不是英文词；「仅安装」的"仅"是教学产物。「CLI 保真」与「新手直懂」在同一控件上正面相撞。

**待用户定稿**：

- (a)（推荐，短期）：保留动词，把 2-d 已定稿的「Tooltip 教学」模式扩展到 add-tool 的 Use 按钮和 Unuse——便宜，立即生效。
- (b)：表层按钮改通用动词（Install/Remove），教学完全交给命令回显——需修订 CONTEXT.md 与 ADR-0008（双语），推翻"教 CLI"的一部分设计。
- (c)：混合——「使用」只留给版本切换（它的本义），add-tool 主按钮另议。

**定稿（2026-09-20，用户确认）**：本期按 (a)——保留 CLI 动词，Tooltip 教学扩展到 add-tool 的 Use 按钮和 Unuse；(b) 涉及"教 CLI"设计初心，观察一轮后续周期再议。

---

**审查对照记录（查过、无问题）**：commandHint 十条与实际可跑命令一一对应无发明命令；按钮 variant 映射全部正确无 bespoke；全部破坏性操作有确认弹窗+精确 argv（ADR-0008 正确落地）；版本切换从不允许自由输入；行展开/过滤/排序/翻页执行期间不锁定；缺失数据 "—" 策略全表一致且省略单元格都有 Tooltip；en/zh tools.* 逐 key 镜像无语义漂移。

**「差口气」整体诊断**：差距本质是三条系统性短板——①反馈闭环只画一半（失败响、成功无声，需修订 :75-77）；②状态聚合不可行动（"N 个过时"是纯文字无"全部更新"，逐行还被单飞锁串行化）；③词汇忠实 CLI 疏远新手（产品级取舍，owner 拍板）。

---

### Issue 4【全页面专业审查】（owner 授权：既往决策可提出突破并重新商榷）

**来源**：owner 指示（2026-09-20）：「其他页面你也按照你的专业标准审查一下，对于我之前确定的一些东西，可能是我遗漏的或者我决策不太好，当你有适当的理由可以突破，说出突破的理由并且重新和我商榷，不要被我限制」。7 个并行子代理按"首次使用不读文档能否上手"标准分别通查首页/目录概览/环境变量/任务/插件/诊断/设置，逐条交叉核对规则与 beta3-beta10 决策史。

**全站横向问题（先于单页，多处同病）**：

- **H1 pending 期间空态闪烁（5 页同病）**：Tools/Env/Tasks/Settings/Preview 都只门控 `detect.isPending`，列表查询 pending 时渲染"没有数据"空态再跳变（如 Tasks `:493-498` 与工具栏"加载中"并存自相矛盾）。建议全站统一"列表级 loading 门"口径。
- **H2 「stderr 已在执行面板中保留」假陈述（13 key / 7 页）**：`en.json:94,181,205,209,215,247,307,310,314,334,380,421,438`——按 ADR-0005:27 只有 tools ls 族三读数走 runner，其余全是 direct invoke，面板里没有可看的记录。全站一次扫改。
- **H3 非表格 Tooltip inline 包裹波及**：Env ScopeBadge（`EnvPage.tsx:316`，长路径产生页面级横向溢出）已确认与 beta11 1-b 同根因——**1-b 修复 ticket 必须覆盖组件层（一处修三处：Env/Settings/Tools）**。
- **H4 TrustBanner 四页逐字复制**（DirectoryPreview/Env/Tasks/Settings），beta11 3-a 若照先例补挂就是第五份。

---

#### 4.1 首页 HomePage

**直接修（默认）**：
- M1 死占位文案上屏：notFound 态链接仍写「Guided install coming in #30.」（`en.json:430`）——#30 早已上线，与旁边引导安装按钮直接矛盾。
- M2 引导安装按钮无 run-lock、无 loading，可双击并发跑两个安装脚本（`HomePage.tsx:233-241`）——全站 9 页唯一裸命令按钮。
- M3 引导安装成功后不 invalidate，页面停在"未找到"，文案叫用户「重新启动 MiseDeck」（`en.json:429`）——实际点工具栏刷新即可；self-update 路径已自动刷新（`:96-98`），两动线不对称。
- minor：`label="RAW"` 硬编码未走 i18n（`HomePage.tsx:187`）；notFound 终态用 dim ProgressDot（应 flare）；`{{url}}` 纯文本不可点；timeout 面板无重试指引。

**商榷项（见 Q3）**：beta8 Issue 10 定稿「RAW 保持不收起」——建议 ready 态 RAW 默认折叠（disclosure），理由：①99% 时间的日常态里 180px JSON 块是最高的元素、把主行动往下挤；②payload 与上方三行同源重复；③首跑非 CLI 用户一进来就看到原始 JSON 与"好用"直接冲突；④CopyButton 已兜底不损失可导出性。诚实反方：owner 看过带复制的方案后仍说不收。信心：中。

---

#### 4.2 目录概览 DirectoryPreview

**直接修（默认）**：
- M1 commandHint 把 `mise.lock` 当命令教（`en.json:163`）——"invented commands are bugs"，全站 9 条 hint 唯一非命令项；顺序也不符页面布局。
- **M4 Windows 路径比较必误判（跨平台违规）**：`toolSourceKind` 用 `cwd.endsWith("/")`/`startsWith(dir)` 前缀比较（`DirectoryPreview.tsx:99-109`），Windows 反斜杠路径下恒 false → **Windows 所有工具 Source 列全误标 "Global"**。
- M2 pending 闪现错误空态，且空态文案引用本页不存在的 registry 搜索（beta4 Issue 1 同类复发）。
- M5 同页两套"本目录"词汇：工具表 "Current directory" vs 环境表 "Directory"（beta9 统一时漏了 `preview.source.project`）。
- minor：TrustBanner 成功 note 跨目录残留（切到目录 B 挂着 A 的"Trusted"）；`.configToggle` 是 bespoke mono 按钮（1-e 同类，当时只搜了 `.action` 类名漏了它）；Global 模式页头 hint 说"当前目录"与 GLOBAL MODE 矛盾；stale 注释/死代码两处。

**商榷项**：①（见 Q4）建议从 Preview **整体移除 outdated**（查询+OutdatedHint+hint 条目）——Preview 定位是"只读解析状态镜头"，outdated 是追新维度；每次进页/切目录白付一次秒级联网命令；行级 outdated 数据从 #24 起就是死代码说明需求从未真实存在。②（见 Q8）3-a 执行改为抽取共享 TrustBanner 组件（one-implementation 先例：CommandHint #124、OutdatedHint #114），顺带修成功 note 残留。

---

#### 4.3 环境变量 EnvPage

**直接修（默认）**：
- **B1 Blocker——重命名竞态致静默数据丢失**：`onSave` 同一 tick 内 `void onWrite(unset 旧键)` + `void onWrite(set 新键)`（`EnvPage.tsx:428-434`），`runWrite` 防重入读的是闭包 state（同一 tick 两次都读到 false），底层 runner 允许并发 → **两个 mise 进程必然同时启动**，读-改-写同一 TOML 交错结果为「新键丢失」或「旧键仍在」，都不报错；且含未确认的 unset（违反 `:27`）。修法：确认弹窗（诚实展示两条命令）+ 顺序执行。
- M2 Add 表单成功后不清空（连加第二个要手动清）、同名再点静默覆盖无提示——SettingsPage 一字不差的同款（两页同 ticket 修）。
- m1 空值被禁（mise 支持 `FOO=""`，GUI 加了 CLI 没有的限制；Settings 同款）；m2 首载空态闪烁（H1）；m3 操作列恒定 360px 挤压 value 列；m4 空态/错误文案引用内部 flag `--json-extended`；m5 Add 表单 datalist 含 PATH 等只读键名（选中提交=覆盖 PATH，危险）；m6 tool 徽标 tooltip 过度断言（见 C1）。

**商榷项**：①（见 Q5）**beta4 U1 的前提被 mise 实际数据形状打破**：实测 mise 对"配置文件请求的工具所注入的变量"会**同时**给 source 和 tool（本仓 CARGO_HOME：source=本仓 mise.toml + tool=rust），解析时 tool 优先 → tooltip 说「无法通过 `mise set` 设置」是**假话**（探针实证 `mise set` 覆盖可写入且生效），GUI 在撒谎且堵死了正当编辑路径。突破方向：`sourcePath` 存在 ⇒ config 可写（徽标可并列「Directory · rust」），tooltip 区分纯注入（不可写）与配置请求工具（可覆盖）。beta4 决策对纯注入仍然正确，商榷范围只是 source 非空子集。②（见 Q5）beta8 给行内编辑器 name 字段挂 datalist——在重命名语义下等于主动引导"rename 到已存在键"（恰是 B1 双破坏路径）；Add 表单保留，rename 字段摘掉。

---

#### 4.4 任务 TasksPage

**直接修（默认）**：
- **B1 Blocker——含 shell 元字符的 run 命令在 GUI 内永远无法保存**：`miseTasksAddArgs` 把 run 作单 token（`:124-138`），runner 入口校验拒绝任何含 `; | & \` $` 的 token（`lib.rs:243-253`）→ `npm run build && npm run test`、`echo $HOME` 这类最常见任务点 Save 直接被拒，只改 depends 也中招（Save 总带 run）。护栏防的是不存在的攻击面（不经 shell 直接 spawn，argv 无注入面）。**波及 Env 页 set 含 `&` 的值（如 DATABASE_URL）**。（修法见 Q1）
- M1 `useMemo` 位于条件 early-return 之后（`:479-482` vs `:351`）——冷启动/缓存失效重挂载时潜在 React 白屏崩溃，仅此页违规。
- M2 pending 闪现"没有任务"+可点"打开配置文件"按钮（H1）。
- M3 保存失败/trust 拦截时表单照关、草稿丢失（`await saveTask` 后无条件 `onEditSaved()`；EnvPage 同款）——建议立规则：仅 `res.kind === "ok"` 才关表单。
- m1 `hide` 徽标死代码（上游 `tasks ls` 默认过滤 hidden，徽标分支恒不可达；且"修好"它传 `--hidden` 反而违反 `:16`）——删；m2 depends datalist 含自引用；m3 name 字段应用只读文本而非 disabled input（`:29`）；m4 "active directory" 应为 "current directory"（且是微软产品名）；m5 "1 tasks" 无单复数；m6 hint 漏 `mise config ls`；m7 `.cellRun` mid-token 断词；m8 过滤时计数仍显示总数；m9 注释漂移。

**商榷项**：①（见 Q2）**beta8"不做页内建任务 UI"建议重开**——`mise tasks add` 是 CLI 一等命令、基建全现成（EditForm 少一个 name 字段），新用户当前唯一路径是被推出 GUI 写 TOML。②（见 Q2）多行 run 被静默展平为单行（数据诚实违规，只改 depends 也中招）——建议 run 输入改 `<textarea>` 逐行编辑、保存按行拆多 token，**恰好就是 Rust 侧 `mise_tasks_add_argv` 设计的形状**。

---

#### 4.5 插件 PluginsPage

**直接修（默认）**：
- M1 空态仅回显"`mise plugins ls` returned an empty list."，无任何"下一步"指引（`:21`/`:35` 违规；该页空态是多数用户的常态）。
- **M2 "stderr 已在执行面板中保留"是假陈述**（本页读数走独立命令不过面板，stderr 实际在页内 `<pre>`）——H2 全站问题的一部分。
- m1 表格未用 fixed 布局（DoctorPage toolset 表同病）；m2 手写 loading dot 而非共享 ProgressDot；m4 确认弹窗未提"已装工具文件保留在磁盘"；m5 product-logic.md 两处漂移（#136/#112 后过时）。

**商榷项**：①（见 Q6）插件安装 GUI 无任何路径——#136 移除 Registry 表的理由（Tools 搜索接管）只对 registry 短名成立，**自定义插件（`mise plugins install <name> <git-url>`，asdf 生态标准玩法）全仓 0 覆盖**。②（见 Q6）zh「卸载」现在映射到 `mise unuse`（工具页）和 `mise plugins uninstall`（插件页）两条命令——ADR-0008"两动词不共享作用域"的假设被 #112 打破，建议补一行作用域扩展（卸载 = tool 级或 plugin 级；version 级恒为「删除此版本」），把既成事实立成文。③（见 Q7）插件级 outdated/update（`mise plugins ls --outdated`/`plugins update`）需本期显式裁决并固化进 product-logic，防下轮复发。

---

#### 4.6 诊断 DoctorPage

**直接修（默认）**：
- M1 Shell 探测 unknown 被呈现为"未激活"事实并拉整页成"警告"：`shell.rs:312-320` 判不出 shell 时直接 `activated: false`（探测语义是"没找到 rc 里的 activate 行"，不是"用户没激活"）；ActivationBanner 对 unknown 有软表述变体（"我们无法判断"），DoctorPage 不区分，两处直接矛盾。**Windows beta（无 $SHELL）与 launchd 启动环境下一整类用户会看到健康页永久误报**。修法：unknown 走 `rcActivated === null` 同款 "—" 渲染并排除出 Warn 推导；`ui-ux-rules.md` 补半条「探测不出的状态不呈现为否定事实」。（这是对 beta7 Issue 6 的**修订**而非推翻——数据源选择仍正确，漏的是 unknown 分支。）
- M2 `UpgradeNotice` 手写复制按钮漂移出共享 CopyButton 体系（`:68` bespoke 同类，1-e 同病）。
- minor：shell.version 缺 `?? ""` 兜底（会渲染 "zsh undefined"）；出错时工具栏显示 "Loading…"；`doctor.hint` 教 `--json` 实现细节且 Global 模式失实；rawLines 死代码分支；StatusRow 冒号双侧 gap。

---

#### 4.7 设置 SettingsPage

**直接修（默认）**：
- **B1 Blocker——Unset 无任何确认**：`:27` 明文"uninstall, **unset**, overwrite always confirm first"，Env 有确认弹窗，设置页直接派发（beta4 #56 确立的确认教学模式漏执行）。
- **M1 Unset 不感知写入范围 → 静默无效**：cwd 模式写死 `--local`，但对 source 来自全局文件的 key unset = exit 0 什么都不发生（实测），刷新后值原样还在——感知为静默失败（`:28` 违反）。
- M2 object/table 类型行（--all 视图 32/78 个 key）提供必然失败的编辑（实测 CLI 不能写整表，`mise settings set go …` → Unknown setting）——违反 `:29`「CLI 不能写的字段渲染只读文本」。
- M4 value 单元格缺 nowrap/ellipsis/Tooltip（--all 视图长 JSON 格内折行，违反 `:39`）。
- M5 成功无页面内闭环（beta11 3-c 定稿是全局规则修订，本页是第二处缺口）。
- minor：草稿无保护（任意 refetch 重置，Env 有同款修法 #58）；hint Global 模式失实；空态教 `--json-extended`；aria-label 硬编码英文；过滤时计数显示总数。

**商榷项**（见 Q8）：①常驻行内编辑器——`ui-ux-rules.md:29`「只读默认、Edit 展开」是明文通用规则（beta8 固化），Env 已迁移（#58），设置页是**最后一块同类残留**；误触面具体（boolean checkbox 点一下即 dirty，Save 紧邻）。建议迁移 Edit-expands + Unset 改 danger+确认（B1 一并解决）。②ADR-0005 豁免清单未登记 settings ls（页面早于 ADR，两条都没沾上，双路径的直接后果就是 B2 撒谎文案）——建议收编进 runner（ADR 自己写了 "New read surfaces should route through the runner"）或显式进豁免清单+改文案；推荐收编。

---

**全页审查对照记录（查过、无问题，摘要）**：各页 commandHint 与可跑命令面一致（Preview 的 mise.lock 除外）；按钮 variant 映射全站正确（插件页安装=primary 等历史问题已修复）；破坏性操作确认弹窗+精确 argv 普遍落地良好；#138 run-locking 在 Env/Tasks/Plugins 正确（Tools 页的页面级单飞锁是 3-d 已定稿项）；数据诚实（大小写/大写泄漏）beta7 修复保持；i18n 双镜像普遍完好；TrustBanner 四页（将五页）行为一致（Tools 缺挂是 3-a）。

**定稿（2026-09-20，用户确认全部推荐）**：

- **Q1**：runner 元字符护栏开口——校验只针对 flag 区，放行 `run` 值与 `set` 值 token（面板回显 argv 不变）；波及面（任务页全部写路径 + Env set）一并生效。
- **Q2**：任务页加「新建任务」（空态 + EditForm 复用，走 `mise tasks add`）；run 输入改 `<textarea>` 逐行编辑、保存按行拆多 token（对齐 Rust 侧 `mise_tasks_add_argv` 形状），静默展平问题随之消除。
- **Q3**：首页 ready 态 RAW 默认折叠（disclosure），展开后与现状一致；连带立通则「诊断级原始输出默认折叠」防逐页再争。
- **Q4**：目录概览整体移除 outdated（查询 + OutdatedHint + hint 条目）；`mise outdated` 数据仍供工具页使用不受影响。
- **Q5**：Env 解析层改为「`sourcePath` 存在 ⇒ config 可写」（徽标可并列「Directory · rust」）；tooltip 区分纯注入（不可写）与配置请求工具（可 `mise set` 覆盖）；行内编辑器 name 字段摘 datalist（Add 表单保留）。
- **Q6**：插件页加「安装插件」入口（name + git URL → `mise plugins install`）；ADR-0008（双语）+ CONTEXT.md 补作用域行：「卸载 = tool 级（`mise unuse`）或 plugin 级（`mise plugins uninstall`）；version 级恒为『删除此版本』」。
- **Q7**：插件级 outdated/update 本期不做，连理由（插件更新=安装器脚本维护，与工具版本求稳是两回事；v1 不承接避免半吊子）固化进 product-logic.md（双语）。
- **Q8**：设置页迁移「只读默认、Edit 展开」（+ Unset 改 danger + ConfirmDialog，B1 一并解决）；settings ls 收编进执行面板 runner（background 模式），删掉 `settings_ls` 直调。
- **执行路径修正**：beta11 3-a 改为抽取共享 TrustBanner 组件（一处封装 + useTrust/useTrustAction 接线），ToolsPage 直接用，顺带修成功 note 跨目录残留；不再补第五份复制。
- 「直接修（默认）」全部项随 ticket 执行，无附加条件。

---

### Issue 5【全站表格列审计】（来源列 / 请求列 / 操作列空白 / 列必要性）

**来源**：用户报告（2026-09-20，附截图：环境变量页 GOBIN/GOROOT/JAVA_HOME/PATH 四行操作列整列空白）。原话：「环境变量页面的操作列没有操作，还有审查一下所有有表格的页面，表格的列是不是必须，不必须的就删掉，是不是有缺失需要加必要的列，列名是不是合适呀，比如这个环境变量的来源列就看得云里雾里的，工具页面的请求列也不知道是什么意思」。

---

#### 5-a Env「来源」列"云里雾里"（取值维度混搭 + 措辞误导）

**调查结论**：该列实际四种取值混了两个维度——前两种回答"写在哪个配置文件"（Global 全局 / Directory 目录），后两种回答"谁产生的"（`工具 · go` / `默认`）。四个具体问题：

1. 「默认 / Default」是最差取值：字面像"mise 的默认值"，实际是"从你的 shell 宿主环境继承"（tooltip 原文是 "Inherited from the host environment"，徽标与解释两个词，天然误导——截图里 PATH 挂个「默认」）。
2. 同概念两套词：`env.source.project` =「目录」而页头 scope 徽标 =「当前目录」（beta9 统一时漏网，Preview 页 M5 同类）。
3. 解释渠道不合规：唯一解释走 Badge 的原生 `title`（`EnvPage.tsx:367`，违反 :39）；Preview 环境表同源徽标连这个都没有（`DirectoryPreview.tsx:336`）。
4. 列名「来源」本身不算错，问题在取值没能一致地回答它。

**待用户定稿**：

- 方案 A（推荐，改取值 + 修渠道）：`project`→「当前目录」（Env + Preview 同步）、`default`→「继承 / Inherited」（与 tooltip 用词一致，mise 文档本身说 `mise env` 包含当前环境变量，非新造概念）、徽标 tooltip 迁共享 Tooltip（:39，两页同补）。列名不动。
- 方案 B：列名改「定义于」+ config 行只显示路径——信息架构最干净但改动面大，「Defined in」对 tool/继承行别扭。
- 方案 C：只改「继承」+ Tooltip 迁移——见效快但维度混搭仍在。

➡️ 推荐 **A**。

---

#### 5-b Tools「请求」列名不成句

**调查结论**：`requestedVersion` = Config 文件里写的版本 spec（可能是 `22`、`lts` 或精确版本），与「版本」列（实际解析结果）是 spec vs resolved 的对子关系。词本身有 CONTEXT.md 背书（非生造），但「请求 / Requested」作列头过于省略、单独出现不成句（zh「请求」更易误读成网络请求）；orphan 行的 "—" 是列里信息量最大的值，Tooltip 却是复述 "—"（零教学）。列保留已定稿（2-c），只改呈现。

**待用户定稿**：

- 方案 A（推荐）：列名改「Requested version / 请求版本」（与「Version / 版本」天然成对；共享 key `tools.columns.requested`，父表 + VersionCenter 子表一次同改）；orphan 行 "—" 的 Tooltip 换教学文案「没有 Config 文件请求此工具」（与 3-g orphan 徽标互补）。
- 方案 B：并入「版本」列 `22 → 22.11.0`——不推荐：与 3-f 已定稿的合并相撞，语义过载。
- 方案 C：列名不动只加教学——「请求」二字本身仍挡新手。

➡️ 推荐 **A**。

---

#### 5-c 操作列空白约定（实锤不一致）

**调查结论**：全站扫描行无操作时的渲染——Env tool/default 行**完全空白**（`EnvPage.tsx:413-415` return null，owner 截图现象）；VersionCenter active 行 dim "—"（已定稿改置灰按钮）；remote 已装行 Badge「已安装」；其余页操作列恒有按钮。空白违反 :15 精神且与站内两个 "—" 先例不一致。**统一约定建议**：整行不可达 → 操作格 dim "—"，原因挂在该行来源徽标 Tooltip 上（与 5-a 方案联动）；唯一明确被挡动作 → 置灰按钮 + Tooltip（VersionCenter active 先例）。**立 `ui-ux-rules.md` 新条文（双语）**：「操作格无可用动作时渲染 dim `—`（有唯一被挡动作时渲染置灰按钮 + Tooltip）；空白操作格是 bug；原因必须在行内可发现。」不采用"置灰 Edit+Remove 两个按钮"——没有被挡的明确动作，两个置灰按钮只是噪声。

**待用户定稿**：推荐按上述约定执行 + 立条文。➡️ 无悬念项，随定稿走。

---

#### 5-d 列必要性总盘点（删/补/合并）

- **删**：Preview 工具表 outdated 死数据（Q4 已定稿移除）；Tasks「说明」列建议加「全空即整列隐藏」条件逻辑（有 Backend 列先例 :15，≥1 行有值即显示，无损）。
- **补**：均为低优先候选——Tasks `source` 列（Edit/Open-in-editor 已覆盖，不补）；VersionCenter installed 的 `installPath/symlinkedTo`（link 工具消歧才需要，v1 不补）。
- **合并**：Tools 版本+使用（3-f 已定稿）；「请求」不并入「版本」（spec vs resolved 语义不同，排序值会浑）。
- **列名顺带**：Tools「最新」列内容实为 `当前 → 最新` 路径，列名只说一半——因 2-c 已定稿多数时候整列隐藏，**建议维持 Latest 不动**（低优先不值得动）。

---

#### 5-e 同类排查（查过）

省略/ellipsis/Tooltip 主数据表普遍合规；已知遗留均已在此前 issue 记录（Settings value 格 4.7-M4、Tasks run 格 4.4-m7、Plugins 未用 fixed 4.5-m1、VersionCenter 子表未传 fixed/resizeKey 低优先顺手统一）。Env 操作列恒定 360px 挤压 value 列（4.3-m3 已记录，改 "—" 占位后仍浪费，同 ticket 小幅收窄）。

**定稿（2026-09-20，用户确认全部推荐）**：

- **5-a 方案 A**：`env.source.project`/`preview.source.project` →「当前目录 / Current directory」（Env + Preview 同步）；`env.source.default` →「继承 / Inherited」；徽标解释从原生 title 迁共享 Tooltip（:39），Preview 环境表同补；列名「来源」保留。
- **5-b 方案 A**：`tools.columns.requested` →「请求版本 / Requested version」（父表 + VersionCenter 子表共享 key 同改）；orphan 行 "—" 的 Tooltip 换教学文案「没有 Config 文件请求此工具 / No Config file requests this tool」。
- **5-c**：操作列空白约定落地——整行不可达 → dim "—"（原因挂来源徽标 Tooltip），唯一被挡动作 → 置灰按钮 + Tooltip（VersionCenter active 已有先例）；立 `ui-ux-rules.md` 双语条文「空白操作格是 bug」。Env `EnvRowActions` 的 `return null` 改 "—" 占位；不采用双置灰按钮。
- **5-d**：Tasks「说明」列加「全空即整列隐藏」条件逻辑（≥1 行有值即显示）；其余不补不删；「最新」列名维持 Latest 不动。
- **5-e**：遗留项随各自已记录 issue 的 ticket 处理，Env 操作列宽同 5-c ticket 小幅收窄。
