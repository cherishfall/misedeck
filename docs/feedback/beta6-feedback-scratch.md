# v1.0.0-beta.6 反馈记录

> 状态：收集进行中（2026-09-04 起）。
> 流程：用户逐条口述 → 我记录原话并做代码调查 → 有不确定处用 grill-with-docs 拷问到共识 → 全部收集完后综合分析 → to-spec 发布 SPEC 父 issue → to-tickets 发布 tickets。
> 每条结构：用户原话（+截图）→ 代码调查结论 → 对齐后的理解 → 定稿。
> 沿用 beta5 的经验：**先量数据、再拷问**，不在没有事实的情况下让用户做判断题。
> 基线：beta.6 已发布（`v1.0.0-beta.6`），beta5 两批 11 个 ticket（#62–#64、#66–#73）全部合并到 master；`1feb11d` 修了流式输出截断但**未进 beta.6 产物**。

---

## Issue 1【bug】: 侧栏折叠/展开 toggle 跟字母列还是不对齐（#66 修复未彻底）

**用户原话**: 「这个收起和展开侧栏的按钮我想和P、T、E 那一列对齐，现在看着不好看」（**beta5 Issue 3 同款**，#66 / `0ed1129` 当时定稿修过；**beta6 上仍不对齐**）

**用户拷问补充**: 「我不太懂技术细节，我的目的就是让收起和展开按钮和下面那列字母视觉上对齐」

**代码调查结论**:

`0ed1129` 把 `.collapseToggle` 的 `padding: var(--space-2)` 删了（提交注释自夸"the 18px box keeps the glyph aligned with the P/T/E/K/X glyph column"），但**像素算下来没对齐**：

| 元素 | 展开态 x（相对 sidebar 内边缘） | 折叠态 x |
|---|---|---|
| toggle 盒外左边缘 | 12px（= `--space-3`） | 8px（= `--space-2`） |
| 16×16 SVG 中心 | 12 + 9 = **21** | 8 + 9 = **17** |
| navItem 盒外左边缘 | 12 | 8 |
| 20×20 navGlyph 中心 | 12 + 1 + 8 + 10 = **31** | 8 + 1 + 8 + 10 = **27** |
| **偏差** | SVG 中心比 navGlyph 中心**左 10px** | **左 10px** |

SVG 是 16px 居中在 18px 盒子里 → 盒内偏移 9px。navGlyph 是 20px 紧贴 navItem 的左 padding → 盒内偏移 19px。**两态都差 10px，偏差量一致**。所以"fix 之后看着还是歪"是真实的——删 padding 只让按钮盒变小，没让按钮盒和 navItem 共列。

**对齐结论（已定稿）**:
- **不发明新方案，复用 navItem 的 box 模型**：把 `padding: var(--space-2)` 加回 `.collapseToggle`（**撤销 0ed1129 那次删除**），按钮盒从 18px 变 38px（与 navItem 同宽、同 padding、同 border），左侧外边缘与 navItem 严格齐。
- SVG（16）继续居中在内部 20px 区域（盒内偏移 19px）；navGlyph（20）也居中在内部 20px 区域（盒内偏移 19px）。**两者视觉中心 x 坐标完全一致**——与 navItem 共列。
- 16 SVG vs 13px 字母字宽差约 2-4px，**不构成可见偏差**（比 10px 小一个量级），用户不会察觉。
- 折叠态 / 展开态**算法一致**，同一个 CSS 规则覆盖两态，不需要分支。
- `.collapseToggle` 的注释需要同步重写——把"the 18px box"那段删掉，换成"same box model as navItem (38px, padding 8, border 1)，toggle's SVG centers on the same x as navGlyph's letter"。
- **不引入新 token / 新色 / 新尺寸**；纯一行 CSS 改动 + 注释重写。
- 已知副作用：toggle 按钮盒比之前大 20px（更"看得见"），但 hover/focus 仍走 `--line-strong` 边框 + beam wash，与 navItem 一致。**默认接受**（如果用户后续觉得顶部太抢眼，再讨论常驻 `color: var(--dim)` 的极弱 affordance）。

**拟定 issue**: 标题 ~"Sidebar toggle: align with the nav item column by reusing navItem's box (38px / padding 8 / border 1)"，labels: bug, v1。

---

## Issue 2【bug】: 语言切换弹层里两个 menuitem 渲染成一行（应为一列两行）

**用户原话**: 「语言切换按钮这个样式不对，不是这种二选一的，是那种列表，选择的，因为后面可能要支持更多的语言，日文，法语，德语这样」

**用户拷问补充**:
- 给了 3 个候选的视觉对比图（激活项只换底色 / ✓ 标记 / 左侧色条），用户**重新选 A 方案**——「激活项只换底色，2 项时仍像 2 选 1」
- 选 A 后我回问确认：① 撤销 Issue 2 / ② 还是要改、目标样式 = A；用户选 ②
- v1 不加新语言（en / zh-CN 两种不变）
- 折叠态与本 issue 无关（toggle 对齐走 Issue 1）

**代码调查结论**:

`FloatingMenu.module.css:19-20` 的 `.layer` 是 `display: flex; flex-direction: column`（对），但 `LanguageSwitcher.module.css:86-88` 的 `.popover` **只设了 `min-width: 120px`，没设 display**——而里面的 `.option` 按钮**默认是 `inline-block`**，所以在普通 block 容器里**会横向排成一行**。

**用户第一张截图里看到的就是这个 bug**：弹层里两个 menuitem 渲染成 `English | 中文` 一行，而不是 `English` 上、`中文` 下两行。"2 选 1 segmented control 观感"的根因不是设计选错，是 CSS 布局 bug。

调用链：
1. `LanguageSwitcher.tsx:77-94` 把按钮塞进 `<div className={styles.popover}>` 容器
2. `LanguageSwitcher.module.css:86-88` `.popover` 无 display → 默认 `block`
3. `LanguageSwitcher.module.css:90-114` `.option` 无 display → 默认 `inline-block`
4. **inline-block 子元素在 block 父容器里按基线横向排列** → 两个 menuitem 一行两列
5. `.layer` 虽然是 flex column，但 `.popover` 是它唯一的子元素，**flex 方向不传递到孙元素**

**对齐结论（已定稿）**:

| 项 | 定稿 |
|---|---|
| 布局修复 | `.popover` 加 `display: flex; flex-direction: column;`（**与 `.layer` 方向一致**）——两个 menuitem 严格垂直堆叠 |
| 激活项视觉 | **保持现状**：`color: var(--beam)` + 6% beam 背景 wash（`LanguageSwitcher.module.css:108-114`） |
| ✓ 标记 | **不加**（用户选 A，无 ✓） |
| 左侧色条 | **不加**（用户选 A，无色条） |
| role | 保持 `menuitem`（**不升 menuitemradio**——A 方案无 ✓，单选语义靠底色差异 + `aria-current="true"` 已够；不增加 ARIA 复杂度） |
| trigger 按钮 | **保持现状**（globe + 当前语言 + chevron）——用户没要求改 |
| 折叠态（rail） | 沿用 iconOnly 变体（只显示 globe），unchanged |
| v1 locale | **en / zh-CN 2 种不变**（用户定稿，v1 不加日法德） |
| 不动 | FloatingMenu 自身、`useLanguage` / `I18N_KEYS`、trigger 按钮、token 值 |

**已知边界**:
- 修复后**实际渲染 = A 候选图**（垂直列表 + 激活项换底色），与用户在第二轮的截图完全一致。
- v1 永远 N=2，弹层只有 2 个 menuitem；当前 `.popover min-width: 120px` 对 2 项足够，**不需要加宽**。
- 后续如果加日法德（独立 ticket），垂直列表 + 激活项底色差异**已验证 N=2 的可读性**；N>2 的视觉读法需要届时再评估一次（可能需要在长列表里加 hover 态更明显）。
- 弹层 min-width 120px 修复后 2 个 menuitem 各占满宽（`width: 100%` 由 flex stretch 自动提供），文字左对齐 + 14px padding——与 A 图一致。
- 重要副作用：**这是一个上 beta6 的 bug**（用户截图是真实证据），不是技术债；归类 bug 而非 enhancement。

**拟定 issue**: 标题 ~"Language popover: the two menu items render side-by-side as inline-block (should be a vertical column per WAI-ARIA Menu Button Pattern)"，labels: bug, v1。

---

## Issue 3【enhancement】: DirectoryIndicator 工具栏的 pick 按钮位置在两态间"飘"

**用户原话**: 「全局模式，选择目录和非全局模式选择其他目录按钮一样都放在工具栏的最左侧吧，这样视觉统一点，不会飘来飘去的」

**用户拷问后翻转**: 「为什么不把选择目录和选择其他目录的按钮放在最右侧呢」（**最左 → 最右**——owner 自己撤回了"最左"的方案，因为发现实际效果/他的视觉预期更适合右侧）

**代码调查结论**:

`.row` 是 flex 容器（`DirectoryIndicator.module.css:17-22`），`.actions` 用了 `flex: none` 但**没 `margin-left: auto`**。结果：
- **目录模式**：`.path` 有 `flex: 1`（`:35`）撑开中间，`.actions` 被自然推到右端——pick 按钮在 `width - 64px` 处（按钮宽 84px）
- **全局模式**：没有 `.path`，`.actions` **紧贴 eyebrow**——pick 按钮在 `eyebrow 宽 + 16px gap` 处（约 x=40）

| 模式 | pick 按钮 x（相对工具栏内边缘） | 视觉位置 |
|---|---|---|
| 全局 | ≈ 40px | 紧贴 eyebrow，**看起来"靠左"** |
| 目录 | ≈ `width - 84` | 工具栏最右端 |

所以"飘"的根因是 layout 上**没把 actions 推到底**，不在按钮本身的语义位置。

**对齐结论（已定稿）**:
- **加 `margin-left: auto` 到 `.actions`**（`DirectoryIndicator.module.css:45-50`）——全局模式下 actions 组被推到右端，目录模式下冗余（path 已经在推了）但**保留也无害**。
- 效果：两态的 pick 按钮**严格在最右端**，工具栏左边的 eyebrow 落点也一致（都在最左）。
- 不改按钮顺序、不改按钮 prominence（保持 `.actionPrimary` 的 beam 填充色）、不动 `.path`、不动 `.row`。
- **不引入新 token / 新色 / 新尺寸**；纯一行 CSS 改动。
- i18n 影响：0 行（`directory.pickerLabel` 和 `directory.chooseAnother` 文本不变）。

**拟定 issue**: 标题 ~"DirectoryIndicator: pin the pick button to the toolbar's right edge in both modes (margin-left: auto on .actions)"，labels: enhancement, v1。

---

## Issue 4【enhancement】: 全局模式工具栏左侧"全局"两字太孤，应改为"全局模式"

**用户原话**: 「还有全局模式，工具栏左侧就显示全局是不是不太好哦，你帮我想想怎么显示好呢，全局模式：当前未选择目录？ 还是别的什么呢？」

**用户拷问后翻转**:
- 候选对比图 2 个（A 留白版本 / B 占位 "—" 版本）—— 选 **A · 留白版本**
- 标签选 **"全局模式" / "GLOBAL MODE"**（用户原话）

**代码调查结论**:

i18n 现状（`en.json:19` / `zh-CN.json:19` / `keys.ts:39`）：
```json
"globalButton": "Global"   // 英文
"globalButton": "全局"     // 中文
```

这个 key 在两处被使用（`DirectoryIndicator.tsx:97` 当 global 模式 eyebrow 标签；`DirectoryIndicator.tsx:133` 当 directory 模式"切回全局"按钮文字）。两处的语义**实际不一样**：
- 当 eyebrow 时：描述**当前状态**（"你在全局模式"）
- 当按钮时：是**动作触发器**（"切到全局"），短词更适合按钮

需要**拆 key**。

**对齐结论（已定稿）**:

| 项 | 改动 |
|---|---|
| 新 i18n key | `directory.globalMode` → `"GLOBAL MODE"` / `"全局模式"`（en + zh-CN 同提交） |
| 旧 key 保留 | `directory.globalButton` → `"Global"` / `"全局"`（继续给 directory 模式的"切回全局"按钮用） |
| 文件改动 | `keys.ts:36-45` 加一行；`en.json:16-26` + `zh-CN.json:16-26` 各加一行 |
| 使用处 | `DirectoryIndicator.tsx:97` eyebrow 改用 `globalMode`；`:133` 按钮继续用 `globalButton` |
| 中间留白 | Issue 3 修了 `margin-left: auto` 之后，eyebrow 左边、按钮右边自然撑开，**不填占位符**（"—" 那条作为"以后真要"再开的留口） |
| 视觉对齐 | 目录模式 eyebrow "当前目录" / 全局模式 eyebrow "全局模式"——**两个模式用同样的"X模式 / X状态"模式**（"当前目录"读作"现在是目录模式"，"全局模式"读作"现在是全局模式"） |
| 不动 | `.actions` 按钮顺序、`.path`、`.row`、按钮 prominence、所有 token |

**已知边界**:
- 中文"全局模式" 4 字 = ~45px（10px eyebrow + 0.18em tracking），宽于"全局"的 22px，**但仍在工具栏左侧安全范围**（工具栏 100% 宽 - actions 180px 起步 = 至少 800px 可用）。
- 英文"GLOBAL MODE" 11 字符 ≈ 128px，**更宽但仍可接受**；后续如果标签字数继续增加需要考虑 max-width + ellipsis。
- 拆 key 之后**英文"Global" / 中文"全局"按钮文字保持不动**——owner 没要求改，且 2 字按钮在 actions 组里视觉重量平衡。

**拟定 issue**: 标题 ~"DirectoryIndicator: rename the global-mode eyebrow from '全局' to '全局模式' (split the globalButton i18n key)"，labels: enhancement, v1。**与 Issue 3 合并为同一 ticket**（同一组件、同一 CSS 改动 session，连带改 i18n 4 个文件；分开做 2 次 SSR 翻译审查不划算）。

---

## Issue 5【enhancement】: 三个面板（侧栏 / 顶工具栏 / 底执行面板）背景色太寡淡，引入 mise 官网对位的 3 层 surface 层级 + 拆分 `--panel` 语义

**用户原话**: 「light模式下，侧栏，上面的工具栏，下面的执行面板背景色都是白色，是不是有点儿寡淡了，能不能在不打破当前视觉风格的前提下，给这几个面板搞个更好一点的配色方案，同样的，dark模式也有这个问题」

**用户拷问后定稿**:
- 贴 mise.jdx.dev 官网截图（顶部 nav、AFTER 卡片、终端 code block 三块），明确**按角色对位取色**：顶工具栏 ← top nav、侧栏 ← card、执行面板 ← code block
- 暗色端也"按照官网暗色模式对应的颜色取"
- dark 顶工具栏，在 mise 官网精确值 `#161618`（几乎隐形）vs 加可见度 `#1F1816` 之间，**选 B（加可见度）**
- **二次审查（grill-with-docs）** 发现 `--panel` 语义碰撞，先定"拆 `--panel`、elevated 表面保持原值"
- **三次定稿（用户推翻"保持原值"）**：用户说「我提出的问题只是我能发觉的，会有遗留的，要改就都统一改吧」——**elevated 表面也统一换暖色**，popover / dialog / banner / panel 一起改。新值由助手按专业判断定（用户明确"选专业角度、不再问"）：`--panel` 介于 page 和 sidebar 之间的 warm 值，**shadow 撑 lift、颜色撑 visible**，既不和 page 合并也不和 sidebar 合并

**代码调查结论**:

**审查发现的问题**（grill-with-docs 时发现的真坑，第一次设计没考虑）：

`tokens.css:50` 是 `--panel: var(--hull);`。`--panel` 被 **11 个组件**消费：FloatingMenu（popover）、ConfirmDialog（dialog）、Banner、Panel、TasksPage / DoctorPage / ToolsPage 卡片等。如果直接改 `--hull`，**popover 会从 `#FFFFFF`（light）一起变成 `#F5EDE3`**——popover 从"浮"（亮色比页面更亮）变成"沉"（暖米比页面更深），**elevation 的视觉落差丢失**。这是无意副作用。

**mise 官网自己的做法**：`--vp-c-bg-elv = #FFFFFF / #202127` 单独给 elevated 表面。**但 dark 端 #202127 是蓝灰**（B 通道 39 > R 32），**违反 warm family**，不能直接用。

**对齐结论（已定稿）**:

| Token | Light | Dark | 用在 | 来源 |
|---|---|---|---|---|
| `--void` | `#FDF8F3`（不变） | `#141010`（不变） | 内容区 | mise `bg` |
| **`--panel`** | **`#F8F0E2`**（改：原 `#FFFFFF`） | **`#221C1A`**（改：原 `#1C1614`） | **elevated 表面**：popover / dialog / banner / panel / 11 个组件 | warm family 内新取（见下） |
| `--hull` | **`#F5EDE3`**（改：原 `#FFFFFF`） | `#1C1614`（不变） | **chrome：侧栏** | mise `bg-soft` |
| `--hull-soft`（新） | **`#F0E6DA`** | **`#1F1816`**（偏离官网 `#161618`，dark 端太淡） | **chrome：顶工具栏** | mise `bg-alt`（dark 调整） |
| `--hull-deep`（新） | **`#E8DDD0`** | **`#261E1A`** | **chrome：执行面板** | mise `bg-mute` |

**`--panel` 新值的设计逻辑**（elevated 表面统一换暖色，但保持"浮"的可辨性）：
- light `#F8F0E2`：比 page（`#FDF8F3`）暗 ~2.4%、比 sidebar（`#F5EDE3`）亮 ~1.3%，**在中段留出视觉间隙**，popover 既不和 page 合并、也不和 sidebar 合并
- dark `#221C1A`：比 sidebar（`#1C1614`）亮 ~21%、比 deck（`#261E1A`）暗 ~14%，同样在中段留空隙——**修掉了 dark 端 popover = sidebar 同值的现状**（用户没提过 ≠ 没问题）
- **不用 mise `bg-elv` 精确值**：light `#FFFFFF` 是中性白、不在 warm family；dark `#202127` 是蓝灰（B 39 > R 32）、**off-brand**。偏离是**有意的**
- shadow 不动（popover / ConfirmDialog 的 `box-shadow` 已是 elevation 来源，颜色只做"识别"）

**不破的硬约束**（核对过 visual-language.md 4 条 + ui-ux-rules.md 相关规则）:
- ✓ 不动 `--void`、`--beam`、`--line`、`--ice`、`--flare`、`--breach`、`--grove`、`--text`、`--dim`
- ✓ 不动 border-radius（8px 统一）
- ✓ 不动 2 个 ambient motion（pulse / caret-blink）
- ✓ 不引入 shadow / glassmorphism / gradient
- ✓ 颜色全部在 mise warm parchment / charcoal 家族内（含 `--panel` 新值，hue 一致）
- ✓ token 体系保持一致（`color-mix` 派生色自动跟着新值重算）
- ✓ popover / ConfirmDialog / Banner / Panel 换暖色但保持与 page / sidebar 的可辨间隙，**elevation 由 shadow + 颜色双层支撑**

**改动文件**（5 个，纯 CSS + 文档）:
- `misedeck/src/tokens.css` —— `--panel` 直接写新值 `#F8F0E2` / `#221C1A`（不再 `= var(--hull)`）、light `--hull` 改 `#F5EDE3`、加 `--hull-soft` 和 `--hull-deep` 两个 token
- `misedeck/src/components/PageShell/PageShell.module.css` —— `.sidebar` background 从 `var(--panel)` 改 `var(--hull)`
- `misedeck/src/components/DirectoryIndicator/DirectoryIndicator.module.css` —— `.strip` background 改 `var(--hull-soft)`
- `misedeck/src/components/ExecutionPanel/ExecutionPanel.module.css` —— deck 背景改 `var(--hull-deep)`
- `docs/design/visual-language.md` + `zh-CN/docs/design/visual-language.md` —— 新增 `--hull-soft` / `--hull-deep` 语义 + 更新 `--hull`（chrome 面板专用）+ 更新 `--panel`（elevated 表面专用，warm 值）

**不动**:
- 其他 11 个用 `--panel` 的组件（FloatingMenu / ConfirmDialog / Banner / Panel / TasksPage / DoctorPage / ToolsPage 等）——**0 行组件改动**，自动跟着 `--panel` 变量走，这正是"统一改"的实现方式
- 15 处 `color-mix(var(--hull) N%, transparent)`（hover / tint，**会跟着新 hull 色变化，预期行为**）
- TSX 结构、i18n、Rust

**已知边界**:
- dark `--hull-soft` 偏离 mise 官网精确值：`#1F1816` 是 `bg-soft (#1C1614)` 到 `bg-mute (#261E1A)` 之间的 warm 过渡色，**仍在 warm charcoal 家族**（hue 一致），不引入新色相。值得在 visual-language.md 里加一句 note 解释"为什么 dark 顶工具栏不直接用 mise bg-alt"——mise 官网 nav bar 是 ~50px 装饰条，MiseDeck 顶工具栏 22px 功能区需要可见性。
- 3 层 visual weight gradient：sidebar 最"中"、toolbar 略"暖"、deck 最"深"——从外到内自然形成"数据往内沉淀"的观感，符合 carry data 的 deck 角色。
- **ADR 建议**：这次设计 **需要** 一个 ADR（`docs/adr/0006-*.md` + zh-CN 镜像），记录三个决策：① 拆 `--panel` 语义（chrome vs elevated）② dark `--hull-soft` 偏离 mise `bg-alt`（`#161618` 在 22px 功能区不可见）③ `--panel` 不取 mise `bg-elv` 精确值（light `#FFFFFF` 是中性白、dark `#202127` 是蓝灰，均 off-family/off-brand，改取 `#F8F0E2` / `#221C1A` 保持 warm 且可辨）。都符合 ADR 三条件：hard to reverse、surprising without context、real trade-off。**ADR 作为 ticket 的 deliverable 一起出**。

**拟定 issue**: 标题 ~"Panel surfaces: split --panel into chrome (sidebar/toolbar/deck) and elevated (popover/dialog/banner/panel) roles, warm-family values throughout, chrome adopting mise.jdx.dev's 3-level hierarchy"，labels: enhancement, v1。**同时出一个 ADR**（`docs/adr/0006-*.md` + zh-CN 镜像）。

---

## Issue 6【enhancement】: 执行面板头部右侧顺序改为 状态 → 复制命令 → 关闭，关闭改文字按钮

**用户原话**: 「执行面板这里能不能顺序是 命令执行状态，复制命令按钮，关闭按钮，关闭按钮是和复制命令按钮一样是文字按钮，而不是一个小x」（截图红框圈出 headerRight：`[复制命令] [● 成功 · 0.1s] [×]`）

**代码调查结论**:

`ExecutionPanel.tsx:121-200` 的 `.headerRight` 当前结构：
1. **复制命令按钮**（`execution-copy-command`，有 echo 时渲染）——位置在**最左**
2. 状态块（每个 status 分支各自渲染）：`statusDot` + `statusLabel` + 动作按钮
   - `running`：文字按钮"取消"（已经是文字按钮）
   - `ok` / `failed` / `cancelled`：**`×` 字符**（`ExecutionPanel.tsx:161 / :180 / :196`）

`.headerRight` 是 `display: flex; gap: var(--space-3)`（`ExecutionPanel.module.css:46-50`），无 order / 绝对定位依赖，**纯 JSX 重排即可**。

`.actionBtn`（`ExecutionPanel.module.css:103-120`）是所有动作按钮共用的文字按钮样式（1px border + mono font + padding 2px 10px）——`×` 已经在用这个 class，**只需把内容从 `×` 换成文字**，样式零改动。

i18n：`execution.dismiss` key **双语已存在**（en "Dismiss" / zh-CN "关闭"，当前用作 aria-label）——**0 行 i18n 改动**。

**对齐结论（用户已明确，无需拷问）**:

- 顺序：**状态（dot + label）→ 复制命令 → 关闭/取消**
- 关闭按钮：`ok` / `failed` / `cancelled` 三态的 `×` 改为 `{t(I18N_KEYS.execution.dismiss)}` 文字（zh "关闭" / en "Dismiss"），与复制命令同款 `.actionBtn`
- `running` 态本来就是"状态 + 取消文字按钮"，重排后同样满足 状态 → 复制 → 取消
- aria-label 保留（按钮文本即 `dismiss`，语义不变）

**改动文件**（1 个）:
- `misedeck/src/components/ExecutionPanel/ExecutionPanel.tsx` —— `headerRight` 内 JSX 重构：每个 status 分支先渲染 dot + label；复制命令按钮移到状态之后；动作按钮（cancel / dismiss）保持在各分支内、位于最后；三处 `×` 换成 `t(I18N_KEYS.execution.dismiss)`

**不动**:
- CSS（`.actionBtn` / `.headerRight` / `.statusDot` / `.statusLabel` 全部零改动）
- i18n（key 已存在）
- Rust、TSX 其他部分

**归类**: enhancement（顺序 + 按钮形态是设计调整，不是渲染错误），label `v1`。可与 Issue 5 分开出 ticket（不同关注点：header 动作区布局 vs surface 配色），两者都碰 `ExecutionPanel` 但文件不冲突（Issue 5 只动 module.css 的 deck 背景，Issue 6 只动 tsx）。

**拟定 issue**: 标题 ~"Execution panel header: reorder actions to status → copy command → dismiss, and make dismiss a text button like copy"，labels: enhancement, v1。

---

## Issue 7【enhancement】: 执行面板不要在命令执行时自动弹出，默认不弹、手动点开

**用户原话**: 「对了，执行面板不要一执行命令就弹出来，默认不弹，用户可以手动点击看」

**代码调查结论**:

- **自动弹出的根源**：`useExecution.ts:88-95` reducer 的 `start` action 里 `isOpen: true`——任何 foreground run（`run` / `runInstall` / `runSelfUpdate` / `runTrust`）一开始就把面板顶开。
- **手动入口已存在**：`ExecutionPanelAffordance.tsx`——面板关闭且有活动（`status !== "idle"`）时，PageShell 渲染一个常驻按钮（状态点 + 文案），点击调 `openPanel()` 重新打开。running 时文案是 `reopenRunning`，状态点带 tone（beam/ok/fail/dim），**失败是红点**，可见性已有保障。
- **i18n key 已存在**：`execution.reopen` / `execution.reopenRunning` 双语在位，**0 行 i18n 改动**。
- **无测试依赖**：全 src 无任何测试断言 `isOpen` / auto-open 行为。
- **不破 ADR-0005**：「Every mise invocation goes through the execution panel」约束的是"所有调用都走这个 runner、命令和日志都进 transcript"——转录照常记录，只是面板默认保持收起，一点即看。不违反。

**对齐结论（用户已明确，无需拷问）**:

- `start` action 不再强制 `isOpen: true`，改为 **`isOpen: state.isOpen`（保持当前可见性）**：
  - 面板关着 → 执行命令时保持关着，只亮 affordance（状态点 + 文案）
  - 面板开着（用户正在看 transcript）→ 新命令开始时**保持开着**，不把用户正在看的面板拽走
- 所有 4 种 run（mise / install / selfUpdate / trust）统一行为，无例外
- **失败也不自动弹**（affordance 红点已提供失败可见性）——这是简单一致的解释；若后续觉得失败太安静，再做"失败自动弹"的 follow-up，不混进本 ticket
- 更新 2 处过时注释：`isOpen` 字段注释（`useExecution.ts:59-60` "opens automatically when a command starts"）和 `dismiss` 注释（`:380-381` "re-open automatically"）

**改动文件**（1 个，~3 行）:
- `misedeck/src/components/ExecutionPanel/useExecution.ts` —— `start` action `isOpen: true` → `isOpen: state.isOpen` + 2 处注释更新

**不动**:
- `ExecutionPanel.tsx` / `ExecutionPanelAffordance.tsx` / `ExecutionContext.tsx`（affordance 逻辑天然适配：面板关 + 有活动 → 显示）
- CSS、i18n、Rust、测试

**归类**: enhancement（行为调整），label `v1`。
**注意**: 与 Issue 6 同碰 `ExecutionPanel` 组件但不同文件（Issue 6 动 tsx 面板本身、Issue 7 动 useExecution.ts hook），不冲突；可以分开出 ticket。

**拟定 issue**: 标题 ~"Execution panel: stop auto-opening on command start; surface runs via the existing affordance instead"，labels: enhancement, v1。

---

## Issue 8【enhancement】: 全站缩窗行为统一规范 —— 长数据一律"省略号 + tooltip"，规则文档收紧

**用户原话**: 「不同页面缩小窗口的行为不一样，概览页面文字会自动换行，工具页面窗口缩小后内容会不显示，环境变量页面窗口缩小后值那一列不换行，会显示... 省略，真是一个比一个奇葩，能不能统一一点啊，我想要的是窗口有最小限制，并且内容能够自适应」
**拷问后补充 1**: 选 C（省略号 + tooltip），「但是鼠标放上去要能显示完整值」——**hover 完整值是硬验收条件**。
**拷问后补充 2**: 「其他页面呢？…你是专业的，你定个比较好的方案」——**范围扩大到全部页面 + 应用骨架，方案由助手按专业判断定稿**。

**全站审计结论**（8 个页面 + 骨架 chrome）:

**已经健康的层（不动，仅文档化）**：
- 骨架：侧栏固定宽 / 可收起；内容区 `min-width: 0` + `overflow-x: hidden`（`PageShell.module.css:170-181`）——页面级横向滚动条本就不可能
- 顶工具栏：目录路径已是 `nowrap + ellipsis + min-width: 0`（`DirectoryIndicator.module.css:40-42`）
- 全部 8 个页面的 `.page` 容器完全同构（flex column + `max-width: 1200px` + `margin: 0 auto`）
- EnvPage 表单行：`flex-wrap: wrap`（窄时优雅换行，合法）
- 窗口最小尺寸 900×600 已存在（`tauri.conf.json:19-20`），保持不变

**不一致的层 = 表格/卡片里的长数据**（本次修复对象）：

| 位置 | 现状 | 判定 |
|---|---|---|
| EnvPage 主表 | `table-layout: fixed` + `nowrap` + `ellipsis` + `title`（`:147-168`） | ✅ **标准**（issue #57 正解） |
| ToolsPage 各表 | 全列 `nowrap` + 共享 Table `.scroller` 横向滚动（`Table.module.css:4-7`），右列裁切无提示 | ❌ 内容"消失" |
| DirectoryPreview 3 处 | `word-break: break-all`（`:163` cellEnvValue / `:293` configPath / `:330` trustPath），**且无 `title`** | ❌ mid-token 断行，违反规则 :32 |
| SettingsPage 3 处 | `break-all`（`:67 / :159 / :250`） | ❌ 同 |
| TasksPage 1 处 | `break-all`（`:73`） | ❌ 同 |
| EnvPage 2 处残余 | `break-all`（`:138 / :267`） | ❌ 同 |
| 散文/描述文本（多页 `break-word`） | 软换行，不断 token | ✅ 合法，保留 |
| 执行面板日志 / 配置文件内容预览 | 滚动容器 | ✅ 合法例外（需要完整浏览） |

**定稿方案（助手按专业判断定，owner 授权）—— "MiseDeck 缩窗行为四层规范"**:

1. **窗口层**：`minWidth: 900 × minHeight: 600` 保持现状。900px 是侧栏展开 + 内容区最小可用宽度的平衡点；最小尺寸防"挤压到不可用"，但**不指望它防内容溢出**——那是内容层的责任
2. **骨架层**：侧栏固定/收起、内容区 `min-width: 0` + `overflow-x: hidden`、顶栏路径 ellipsis——现状即标准，写进规则文档
3. **内容层（核心修复）**：
   - **表格长数据单一策略**：`table-layout: fixed` + `nowrap` + `text-overflow: ellipsis` + **`title` tooltip（硬要求，每个省略单元格必须有）**
   - 动作列 / 输入列声明固定列宽，保持固有尺寸不被挤压
   - 共享 `Table` 组件加 fixed 支持（prop / 修饰 class），各消费方声明列宽后启用；**不改默认**避免误伤
   - `Table.scroller` 保留为"防线"但不再是阅读机制（fixed 布局下不会激活）
   - `break-all` 全站清零（DirectoryPreview 3 + Settings 3 + Tasks 1 + EnvPage 2，共 9 处）；散文 `break-word` 保留
4. **规则文档层**：`ui-ux-rules.md:32` 从"二选一"收紧为"**ellipsis + title tooltip 是长数据的唯一默认；滚动容器仅限需要完整浏览的区域（日志、文件内容）**"，并补一条缩窗行为总规则（骨架不缩、内容省略、数据不断 token），中英镜像同步

**改动文件**:
- `misedeck/src/components/Table/Table.tsx` + `Table.module.css` —— fixed layout 支持
- `misedeck/src/pages/ToolsPage/ToolsPage.tsx` + `.module.css` —— 表启用 fixed、声明列宽、长数据列 ellipsis（cell 已有 title）
- `misedeck/src/pages/DirectoryPreview/DirectoryPreview.tsx` + `.module.css` —— 3 处 break-all → ellipsis，**补 `title` 属性**
- `misedeck/src/pages/SettingsPage/`（3 处）/ `TasksPage/`（1 处）/ `EnvPage/`（2 处）—— 同策略替换 + 核对 title
- `docs/design/ui-ux-rules.md` + `zh-CN/docs/design/ui-ux-rules.md` —— 规则 :32 收紧 + 缩窗行为总规则

**不动**:
- `tauri.conf.json`（900×600 保持）、骨架 chrome、`.page` 容器、执行面板日志滚动区、i18n（tooltip 用原始数据）、Rust

**验收**:
- 窗口拉到 900px 逐页走查 8 个页面：无 mid-token 换行、无内容裁切消失、无意外横向滚动
- `grep "word-break: break-all" src/pages` 清零
- 所有 ellipsis 单元格 hover 出完整值（title 审计）
- 规则文档中英同步

**归类**: enhancement，label `v1`。
**拟定 issue**: 标题 ~"Responsive behavior: unify long-data handling across all pages to fixed layout + ellipsis + title tooltip; tighten ui-ux-rules to a single default"，labels: enhancement, v1。

---

## Issue 9【enhancement】: 工具页"链接工具"的选择目录按钮与顶工具栏风格统一

**用户原话**: 「工具页面这个选择目录的样式太丑了，需要和工具栏上的选择目录保持一样的风格」（截图红框：顶栏 wine 实心 vs 链接工具表单里的白底描边按钮）

**代码调查结论**:

同一动作（选择目录）、两种实现：
- **顶工具栏**：`DirectoryIndicator.tsx:99-106` 用 bespoke 的 `styles.actionPrimary`（`DirectoryIndicator.module.css:89-112`）——beam 实心 + void 文字，但字体是 mono + uppercase + 4px radius
- **链接工具表单**：`ToolsPage.tsx:997-1005` 用共享 `<Button variant="secondary" size="sm">`——hull 底 + line 描边，风格完全不同

共享 `Button` 的 `variant="primary"`（`Button.module.css:65-74`）与 `actionPrimary` **同为 beam 实心 + void 文字**，语义就是"The go button"。风格分歧的根源是 `actionPrimary` 是历史遗留的组件外实现（mono/uppercase/4px 是 off-system 细节）。

**对齐结论（方向用户已定，实现按专业判断）**:

- 链接工具表单的选择目录按钮：`variant="secondary"` → **`variant="primary"`**（1 行）
- 字形细节：Button primary 是 font-ui 600 / 6px radius，顶栏 actionPrimary 是 mono uppercase / 4px——同风格语言（wine 实心）但非逐像素相同。**不本票内不动顶栏**（Issue 3/4 刚验收过该区域，避免翻盘）；若 owner 看后仍觉字形差异刺眼，follow-up 把 `actionPrimary` 收敛进共享 Button（删除 bespoke 样式）
- 规则：**同一全局动作（选择目录）在全站只允许一种视觉角色 = primary 实心**，写进 ui-ux-rules.md 操作按钮一节（与 Issue 10 同节）

**改动文件**: `ToolsPage.tsx`（1 行 variant）+ `ui-ux-rules.md` 中英镜像（与 Issue 10 合并写）
**归类**: enhancement，label `v1`。

---

## Issue 10【enhancement】: 环境变量页 placeholder 截断 + 全站操作列按钮 variant 语义统一

**用户原话**: 「环境变量页面添加环境变量的提示语显示不全，而且操作列的编辑，移除也算是敏感操作，不应该和工具页面的切换、卸载一样，有一些统一的样式吗，或者你再看看其他几个页面，统一下操作列的按钮风格」

**代码调查结论**:

**a) placeholder 截断**：`.inputName { width: 14ch }`（`EnvPage.module.css:219`），placeholder「变量名（大写下划线）」= 10 个全角字符 ≈ 20ch（mono 字体下 CJK ≈ 2ch/字）——14ch 装不下，截断。该 class 同时用于添加表单（`:472`）和行内编辑器（`:388`），一处修复两处生效。**0 i18n 改动**（保留完整提示语，改宽度）。

**b) 操作列 variant 全站审计**（4 个 variant 语义早已在 visual-language.md / Button.tsx 定义，问题是误用 + 无成文映射规则）：

| 页面 | 现状 | 判定 |
|---|---|---|
| ToolsPage | 切换 `secondary` / 卸载 `danger` | ✅ 正确范式 |
| EnvPage | 编辑 `ghost` / **移除 `ghost`** | ❌ 移除是破坏性操作却最低强调 |
| TasksPage | 运行 `primary` / 编辑 `ghost` / 在编辑器打开 `ghost` | ⚠️ 编辑应 secondary；运行 primary 合理（行主行动、无竞争） |
| SettingsPage | 保存 `primary` / 重置类 `ghost` | ✅ |

**对齐结论（专业定稿）—— 操作列 variant 语义映射**:

- **`primary`**：行内主行动（该行最主要操作、页内无更高优先级竞争）——运行 / 安装 / 添加 / 保存
- **`secondary`**：常规次要行内操作——切换 / 编辑 / 选择目录
- **`danger`**：破坏性 / 敏感操作——卸载 / 移除
- **`ghost`**：放弃类（取消）与低频跳转类（在编辑器打开）

改动：EnvPage 编辑 `ghost`→`secondary`、移除 `ghost`→`danger`（2 行）；TasksPage 编辑 `ghost`→`secondary`（1 行）。映射表写进 `ui-ux-rules.md`（中英镜像，与 Issue 9 的"全局动作唯一视觉角色"同一节）。

**改动文件**:
- `EnvPage.module.css`（inputName 宽度 14ch → 20ch）
- `EnvPage.tsx`（2 处 variant）+ `TasksPage.tsx`（1 处 variant）
- `docs/design/ui-ux-rules.md` + `zh-CN/` 镜像（操作列 variant 映射表 + 全局动作唯一角色）

**不动**: i18n（0 行）、Rust、ToolsPage 既有 variant、SettingsPage。

**归类**: enhancement，label `v1`。

---

## 待收集

（继续等下一条）
