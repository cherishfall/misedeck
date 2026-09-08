# v1.0.0-beta.4 反馈记录

> ✅ 已于 2026-09-02 全部发布到 cherishfall/misedeck：SPEC 父 issue **#45** + tickets **#46~#60**（label: v1 + ready-for-agent，原生 blocking + sub-issue 关系已设置）。
> 映射：Issue 1+Q3+Q4→#48，Issue 2+Q5→#49，Issue 3+6-Q2+Q7→#54，Issue 4+Q6→#49（验收项），Issue 5→#55，Issue 6→#60，Issue 7+Q8→#60，Issue 8→#46；审查新增：Q1→#47，Q2②→#53，Q9→#57，Q10→#59，Q11→#50，Q12→#58，Q13→#56，Q14→#51，Q15→#52。Q2①（导航双击）用户实机未复现，判为采集工具假象，销项。
> 阻塞链：#54←#49；#55/#56/#57←#50；#58/#59←#57；#60←#49,#54,#57,#59。
> 完整审查报告：beta4-audit-visual.md / beta4-audit-product.md；截图 docs/screenshots/beta4-audit/。
> 规范沉淀：docs/design/ui-ux-rules.md（双语）+ AGENTS.md 指针；visual-language.md 已修 ▸/主题三态过期条目。
> 每条：用户原话（+截图）→ 对齐后的理解 →（部分）代码调查结论。

---

## Issue 1: 预览页空状态提示引用不存在的「上方工具栏」

**用户原话**: 「红框里提示使用上方工具栏选择一个目录，上方没有工具栏，这算是个bug了」（截图：预览页，Global 模式，红框标注空状态卡片「选择一个目录以预览 / …请使用上方工具栏选择一个目录。」）

**观察**:
- 空状态卡片文案「请使用上方工具栏选择一个目录」——上方没有工具栏（导航已在 beta3 反馈后重构为左侧边栏）。
- 同样问题还出现在页面头部描述：「请使用上方工具栏切换目录。」（截图中目录预览标题下方）。
- 疑似连带问题：Global 模式下似乎没有任何可见的「选择目录」入口（待与用户确认）。

**对齐结论（已定稿）**:
- 范围：文案 bug + 入口缺失算同一条。根因是目录选择功能在侧边栏导航里没有家——Global 模式下用户永远到不了「选中目录」状态，与 beta3 Issue 3 的「Global 隐藏 ContextBar」形成死锁。
- 修复方向（方案 a）：空状态卡片内直接放「选择目录…」按钮，空状态即引导；卡片文案与页头描述同步改掉，不再引用「上方工具栏」。
- 侧边栏常驻目录切换器（方案 b）可作为后续增强，暂不建 issue；ContextBar 维持「Global 隐藏」不变（方案 c 否决）。

**拟定 issue**: 标题 ~"Preview empty state references a non-existent toolbar; directory picker has no entry point in Global mode"，labels: bug, v1。

---

## Issue 2: 侧边栏收起/展开按钮图标不清晰、位置不对

**用户原话**: 「这个侧栏收起和打开的图标不清晰，位置也不对，位置和图标参照（Kimi Code 截图）这样」（截图：当前按钮在侧边栏底部、语言切换上方，是一条宽 bar 中间一个小 ‹ chevron；参考图为 Kimi Code 桌面端——展开时 toggle 在侧边栏顶部、品牌名右侧，用标准 sidebar 图标，hover 有 tooltip「收起侧边栏」；收起后 toggle 移到内容区左上角，tooltip「展开侧边栏」）

**观察**:
- 现状：底部宽 bar + 小 chevron，不像「收起侧边栏」的语义，且挤在语言/主题控件上方，位置语义错乱。
- 参考（Kimi Code / macOS 惯例）：标准「sidebar」字形图标，展开时在侧边栏顶部品牌区旁，带 tooltip；完全收起后图标出现在内容区左上角。

**对齐结论（已定稿）**:
- 图标：改用标准 sidebar 字形图标（替换 chevron），带 tooltip（收起侧边栏 / 展开侧边栏）。
- 展开态位置：移到侧边栏顶部，放在品牌区（MiseDeck 词标）同一行右侧。
- 收起态位置：图标栏仍在，toggle 留在图标栏顶部（参照 Kimi Code 的相对位置语义，但它收起后无栏、toggle 去内容区；MiseDeck 有栏，放栏顶更连贯）。
- 收起态的补充问题一并解决：品牌区与语言/主题控件在收起后不再被裁切（直接隐藏，而非溢出裁掉）；单字母图标加 tooltip 显示完整名称（预览/工具/…）。

**拟定 issue**: 标题 ~"Sidebar collapse toggle: use standard sidebar glyph, move to sidebar top next to brand; fix clipped brand/footer controls and add tooltips in collapsed rail"，labels: bug, v1。

---

## Issue 3: 主题切换去掉「跟随系统」，改为 mise 官网式两态开关

**用户原话**: 「light和dark主题不要跟随系统了，直接 按照这样的样式」（截图：mise.jdx.dev 官网头部的主题开关——胶囊形滑动 switch，浅色态显示太阳图标、深色态显示月亮图标）

**变更点（覆盖 beta3 Issue 5 的对齐结论）**:
- 三态（跟随系统/浅色/深色）→ 两态（浅色/深色），不再有「跟随系统」。
- 样式：参照 mise 官网的胶囊滑动开关（太阳/月亮图标），替换现在的三段文字 tab（跟随系统 | 浅色 | 深色）。
- 位置不变：侧边栏底部，与语言切换并排（beta3 Issue 5 定的）。

**对齐结论（已定稿）**: 首次启动默认浅色；用户选择持久化，之后完全手动，无任何系统主题依赖。

**拟定 issue**: 标题 ~"Theme switcher: drop system mode; two-state sun/moon pill toggle styled after mise.jdx.dev, default light"，labels: enhancement, v1。

---

## Issue 4: 侧边栏品牌区（MiseDeck + slogan）文字溢出被裁切；可考虑整体移除

**用户原话**: 「文字被遮挡，显示不全，还有如果不行这个MiseDeck和slogan 可以不要了，碍事，也没用」（截图 1：展开态，slogan「A FAITHFUL GUI FOR MISE」溢出侧边栏右边界被裁切；截图 2：收起态，词标被裁成「MiseL」）

**观察**:
- 展开态 slogan 超宽溢出；收起态词标被裁。两态都破。
- 窗口标题栏已有「MiseDeck」，侧边栏再放词标确实冗余。
- 与 Issue 2 联动：Issue 2 定的「toggle 放品牌区同一行右侧」——如果品牌区没了，toggle 单独占顶部一行即可。
- 附带：英文界面下页头/空状态同样是过期文案（"Switch directories from the bar above"），属 Issue 1 范围（i18n 两条文案都要改）。
- **推翻 beta3 Issue 6**（词标+slogan 一体化排版置于侧边栏顶部）。

**对齐结论（已定稿）**:
- 词标 + slogan 整体从侧边栏移除（方案 a）。品牌名由窗口标题栏承担。
- 侧边栏顶部只留收起/展开 toggle（与 Issue 2 合并落地：toggle 独占顶部一行）。
- 覆盖 beta3 Issue 6 结论；beta3 该 issue 已关闭的话，新 issue 里注明 supersede 关系。

**拟定 issue**: 标题 ~"Remove brand lockup (wordmark + tagline) from sidebar; collapse toggle takes the top row"，labels: enhancement, v1。

---

## Issue 5: 工具页新增「查找已安装工具」（mise ls）与「查找远程工具」（mise ls-remote）

**用户原话**: 「工具页面我想加一个功能，查找已安装工具和查找远程工具，也就是 mise ls 和 mise ls-remote 功能，考虑到 mise ls 和 mise ls-remote 可能返回的很多，结果展示可以收起和展开，并且允许清空，查找已安装工具和查找远程工具放在安装工具之后」（截图：工具页现状——已安装工具表格 + 底部「安装工具」区块）

**需求要点（用户已明确）**:
- 两个查询区块，位置在「安装工具」区块之后。
- 结果可能很长 → 可收起/展开，可清空。

**对齐结论（已定稿）**:
- **查找已安装工具**（`mise ls <tool>`）：独立区块，**必须输入工具名**，列出该工具所有已安装版本（含未激活的）。与上方表格职责区分：表格管「当前激活」，查询管「历史装过」。
- **查找远程工具**（`mise ls-remote <tool>`）：独立区块，**必须输入工具名**，返回远程版本列表。不混入 registry 语义。
- 结果操作：远程版本结果带「安装」入口；已安装版本结果只读（操作回上方表格）。
- 结果展示：默认全展示，超过 ~10 条折叠为「展开全部 N 条」；「清空」同时清输入框和结果区；收起态不持久化。
- 位置：两区块依次排在「安装工具」区块之后。

**拟定 issue**: 标题 ~"Tools page: add 'list installed versions' (mise ls <tool>) and 'list remote versions' (mise ls-remote <tool>) query sections with collapsible, clearable results"，labels: enhancement, v1。

---

## Issue 6: 小三角装饰符号突兀违和（面包屑 ▸ 与下拉 caret）

**用户原话**: 「这些小三角从尼玛哪里来的，怎么这么不美观，看着很突兀很违和，要不就去掉，要么就用更适合的不同图标去显示」（截图 1：工具页页眉 eyebrow「▸ MISE / 工具」前的小三角 + 语言切换「中文 ▾」的 caret；截图 2：任务页页眉与空状态卡片 eyebrow 同样有 ▸）

**观察**:
- 「▸」是旧极客终端风的 prompt 装饰符号，beta3 Issue 10 已定视觉转向 mise 官网风，这个符号是漏网的旧风格残留；全站 eyebrow（页眉 + 空状态卡片）都有，需全局审计。
- 语言切换的 caret 是下拉的功能性 affordance，与装饰性 ▸ 性质不同。

**对齐结论（已定稿）**:
- eyebrow「▸」全局去掉（页眉 + 空状态卡片，全站审计清除），不替换图标。
- 语言切换 caret：并入 Issue 3 底部控件区重做。**注意约束：语言切换不是二态开关，是「点击弹出语言列表」的选择器（后续会扩到多语言，见 beta3 Issue 4 既定设计：地球图标 + 当前语言名 + chevron）**——chevron 必须保留明确的「可展开列表」affordance，只是换更纤细的形，不能做成开关样式。

**拟定 issue**: 标题 ~"Remove decorative ▸ prompt glyph from all eyebrows (page headers, empty states); restyle language dropdown caret as part of the footer control rework"，labels: enhancement, v1。

---

## Issue 7: 侧边栏字号/字重层级不对；导航与底部控件要有区分

**用户原话**: 「就整个侧栏的字体大小和字重配合是不是不对，感觉看起来怪怪的，如果要改，记得语言切换和上面的tab栏字体大小和字重也要有区别」

**观察**:
- 现状导航项是 mono + 全大写 + 宽字距（旧极客风残留，同 Issue 6 的 ▸），与 mise 官网风不符——beta3 Issue 10 已定了视觉转向，这条是它的具体落点之一。
- 用户明确要求层级：导航（主功能）vs 底部控件（语言/主题）在字号字重上拉开。

**对齐结论（已定稿）**:
- 侧边栏导航全面转向官网风：无衬线、正常大小写、~500 字重、~14px；底部语言/主题控件 ~12-13px、400 字重——导航重、控件轻。
- 用户加码：**清除所有旧极客风残留**，不限于侧栏。mono 全大写宽字距标签、▸ 符号、辉光等都算，需全站审计。这条作为 beta3 Issue 10（视觉改版）的明确验收要求写入，Issue 6 的 ▸ 清理就是其中一项。
- 归口：并入视觉改版 ticket 族实施，不在旧风格上单独改一遍。

**拟定 issue**: 不单独立项——作为要求写入视觉改版 issue：「侧边栏字体层级按官网风（导航 500/14px 正常大小写；底部控件 400/12-13px）+ 全站清除极客风残留（mono 大写宽字距、▸、辉光等）」。

---

## Issue 8: 【性能】页面切换偶发卡顿数秒，尤其切到工具页

**用户原话**: 「还有一个，就是我在不同页面切换的时候，十次里就有一两次会卡住几秒，然后恢复，我不知道有什么性能问题，尤其是其他页面切换到工具页面的时候，需要记录在案，排查一下」

**已知**:
- 频率 ~10-20%，持续数秒后自行恢复。
- 高发路径：其他页面 → 工具页。

**对齐结论（已定稿）**: Q1 确认是整个窗口冻住（(a)），与「主线程被同步 command 阻塞」的调查结论互证。Q2 用户没注意，不影响定性，不再追问。

**代码调查结论（explore agent，证据链完整）**:
- **架构性根因**：`src-tauri/src/lib.rs` 所有 `#[tauri::command]` 都是同步 fn（`tools_ls` :361、`tools_outdated` :377、`detect_mise` :203 等），Tauri 语义下同步 command 在**主线程**执行；底层 `run_mise`（mise.rs:214-354）纯同步阻塞等子进程退出（超时上限竟为 30 分钟，mise.rs:26）。主线程阻塞期间整个窗口无响应。
- **直接致卡点**：工具页挂载时并发触发 3 条查询（ToolsPage.tsx:106-114）——`detect_mise`（每次真跑 `mise version`）、`tools_ls`、`tools_outdated`（`mise outdated --json --bump`，**联网查最新版本，秒级**）。同步 command 被主线程串行化，卡顿 = 三者耗时之和。工具页是唯一常态含联网命令的页面（Preview 页也用 outdated，DirectoryPreview.tsx:144-152，同理可卡）。
- **间歇性来源**：全局 `staleTime: 30s`（main.tsx:24-31）——30 秒内切回命中缓存秒开；跨过 30 秒则三条全量重跑。是否跨阈值的随机性 ≈ 用户感知的 10-20% 概率。
- **排除项**：无后台轮询/定时器；前端有 loading 态，不是白屏问题。
- **修复方向**：① 所有执行子进程的 command 改 `async fn` + tokio（或至少 `spawn_blocking`），阻塞移出主线程；② `outdated` 改后台拉取/更长 staleTime，不阻塞表格首屏。
- 附带发现：`detect_mise` 注释称 10s 超时，实际走 30 分钟超时（mise.rs:1251），注释与实现不符。

**拟定 issue**: 标题 ~"Intermittent multi-second UI freeze on page switches (worst on Tools page): sync Tauri commands block the main thread; tools_outdated hits the network"，labels: bug, v1。正文含上述证据链与修复方向。

---

# 第二批：全站 UI/UX 审查（2026-09-02，用户要求）

> 方法：截图采集 `docs/screenshots/beta4-audit/`（16 张，浅/深 × 7 页 + 收起态 + 英文页）→ 双子代理审查（视觉合规 + 产品交互，用 web-design-guidelines / product-taste 等技能）。
> 完整报告：`beta4-audit-visual.md`（V1-V16）、`beta4-audit-product.md`（X1-X2, U1-U19）。
> **Q1~Q15 用户全部采纳**，归并映射如下：

| 拷问 | 内容 | 归处 |
|---|---|---|
| Q1 | 窗口标题栏不随主题（P0，Rust 侧 NSWindow） | **新独立 issue**，优先级前 |
| Q2 | ①侧栏导航疑似要点两次 ②无 AX 树（a11y） | ① beta5 打包前手动验证项，不立项 ② **新独立 issue**（P1） |
| Q3 | Global 模式 IA 矛盾（预览/任务空态 vs CLI 有输出） | 并入 **Issue 1** |
| Q4 | 词汇清洗「上下文/context」「项目/project」 | 并入 **Issue 1** 文案重写 |
| Q5 | 收起态语言/主题不可达 | 并入 **Issue 2**（保留图标入口） |
| Q6 | Home 入口失联（品牌区删除后） | 追加为 **Issue 4** 验收项 |
| Q7 | 语言下拉 overlay 窗口 → 窗口内 popover | 并入 **Issue 3** |
| Q8 | 视觉清理清单：按钮对比度/token 偏离、badge 大写篡改数据、虚线边框、eyebrow 重复、英文全大写句、单字母图标重审 | 并入 **Issue 7**（视觉改版族清单项） |
| Q9 | 数据表格排版纪律（表头错位、折行断词、输入框观感） | **新独立 issue** |
| Q10 | 诊断页重构（配对混乱、升级路径渲染、更新出口） | **新独立 issue** |
| Q11 | 工具页数据 bug（请求列丢失、后端列硬编码 CORE、全部升级无 disabled） | **新独立 bug issue** |
| Q12 | Env 页编辑模型（tool 变量只读、默认只读点编辑展开） | **新独立 issue** |
| Q13 | 卸载确认对话框（教学时刻文案） | **新独立小 issue** |
| Q14 | 插件页名实不符 + 已安装插件 section + Registry 行操作 | **新独立 issue** |
| Q15 | 设置页编辑体验（布尔两态、键名 datalist、--all 开关、「移除」文案） | **新独立 issue** |

**衍生工作（用户指示）**：把本次审查暴露的规则沉淀为 UI/UX 规范文档 `docs/design/ui-ux-rules.md`（双语），并在 AGENTS.md 注入指针——因为后续可能用便宜模型写界面，需要强规则兜底。已完成。

---
