# Beta14 Feedback Scratch

> 工作方式（沿用 beta10–beta13 定稿）：用户报一个，调查一个；调查时同时排查同类/关联问题（含「查过、无问题」的对照记录）；结论写入本文档标「待用户定稿」，用户确认后标「定稿」。定稿前不动代码、不发 GitHub。收集齐后发 spec issue（新周期新开 parent，不重开已关闭 ticket）+ 拆实现 ticket。
>
> 周期 bookkeeping（2026-09-23）：beta14 已发布（run 35771312219 全绿，6 assets）。owner 开始逐个报 beta14 反馈。
> **出票记录（2026-09-23）**：第一波 Issue 1/2 → SPEC **#193** + tickets #194/#195（已实现关闭）。第二波 Issue 3/4/5/7/8 → SPEC **#196** + tickets **#197**（Issue 3+5 合并，同属执行面板 surface）/ **#198**（Issue 4）/ **#199**（Issue 7）/ **#200**（Issue 8），全部 ready-for-agent、无阻塞、可并行。Issue 6 查证为正常设计，不出票。

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

### Issue 3【执行面板点「清除」后 Dismiss 按钮消失，面板卡死在展开空态】

**来源**：用户报告（2026-09-23，附图 1 张，英文界面）。原话：「这个执行面板一点清除按钮，然后就 diss 按钮就没有了，不能关掉了」。

**调查结论**（subagent 代码级定位）：
- **根因**：Dismiss 按钮渲染条件 = status ∈ {ok, failed, cancelled}（`ExecutionPanel.tsx:284-295`）；`clearRuns`（`executionState.ts:204-215`）清空 finished runs 后 active run 为 null → 投影回落 `idle`，而 `isOpen` 保持 true → 面板继续渲染（`ExecutionPanel.tsx:142`）但所有可关按钮（Dismiss/Copy/Cancel）全部消失，只剩空态 "No command has been run yet."。
- **实锤卡死**：全仓收起入口只有 Dismiss 按钮和 PageShell 只读页自动 dismiss（`PageShell.tsx:50-54`），无快捷键/标题栏点击。停在当前页无任何逃生口；`isOpen` 还持久化到 localStorage（`useExecution.ts:213-217`），卡死态跨重启复现。
- **同类入口**：逐个点 run chip ×（`removeRun`）清掉最后一个 run 落入同一陷阱——Clear 只是更快的路径。
- **条文缝隙**：ui-ux-rules L94 规定 header 顺序「status → copy → close，close 是固定成员」，但实现把 close 限定在三种终态——条文与实现有缝，本 bug 从缝里掉下去；L97 甚至预设「idle 空态」是合法落点却未规定该状态下如何收起。

**修复方向（调查方给出三案）**：
1. 【推荐】Dismiss 在面板展开时恒可用（条件放宽为 `status !== "running"`，running 时 Cancel 是正主）——改动最小，与 useExecution 既有注释「panel can be dismissed at any time」和 L94 条文一致；同时修掉 removeRun 同类陷阱。
2. clearRuns/removeRun 清空后自动收起面板——改变可见性语义，且空 localStorage 写入，副作用多。
3. 空态渲染短路——「假关闭」留在 state 里，重启复现，不推荐单独用。

**定稿（2026-09-23，owner 拍板，推翻 assistant 的「running 除外」保守案）**：**Dismiss 恒可用——面板展开期间无条件渲染，含 running 状态**。语义定准：Dismiss = 最小化面板（纯可见性开关，`close` action 只改 `isOpen`，runs/后台进程不动），Cancel = 取消命令——两者独立，running 时收起面板后命令继续执行。实现要点：
- `ExecutionPanel.tsx:284-295` 渲染条件放宽为恒渲染（面板展开即有）。
- **必须核验配套回路**：running 中收起面板后，重开 affordance（`ExecutionPanelAffordance`，`!isOpen` 时渲染）必须可见可用，否则 running+closed 状态下没有回到命令的入口（`start` 不自动开面板是既有规则）；若 affordance 有 running 隐藏分支需一并修。
- removeRun 清空最后一条的同类陷阱随本修复一并关闭。
- ui-ux-rules L94 条文收紧：「close/dismiss 是 header 固定成员，面板展开期间恒可用；dismiss 仅最小化面板，不等于取消」双语同步。
- 补 `executionState.test.ts` 用例：clearRuns 清空后 dismissed 仍可触发 / running 中 close 不影响 run 状态。

**补充定稿（2026-09-23，owner 追加两点）**：
- **Dismiss 位置固定最右**：header 顺序定为 status → Copy command → Cancel（仅 running）→ Dismiss（恒在最右侧）。Dismiss 是面板 chrome（最小化），排最后；Cancel 是命令动作，排在它前面。
- **Cancel 样式加重**：不再与 Dismiss 同款纯文字按钮，改为 secondary（描边 Button）——比文字重、可辨识为动作，但不用 danger（取消执行是常规操作非破坏性动作；danger 留给 uninstall 类）。现状态三按钮（Copy/Cancel/Dismiss）全为同款 `.actionBtn` 文字的均质感是本次问题的一部分。
- ui-ux-rules L94 条文相应改写：header 顺序 + Cancel secondary + Dismiss 恒最右 + dismiss 仅最小化不等于取消，双语同步。

**待用户定稿**：~~方案 1 / 2 / 1+2 组合~~ → 已定稿（恒可用案 + 位置/样式补充）。

### Issue 4【连续卸载：第二个版本的确认框 Uninstall 按钮禁用】

**来源**：用户报告（2026-09-23，附图 1 张，英文界面，`tauri dev` 本地运行）。原话：「我卸载了一个版本后，再卸载另外一个版本，卸载按钮不能点击了，不知道为什么」。

**调查结论**（subagent 代码级闭环）：
- **根因**：`useOwnRun` 的 `mounted` ref 防护在 React StrictMode（dev 构建）下永久失效——`ExecutionContext.tsx:149-154` 的 effect cleanup 把 `mounted.current` 置 false，StrictMode 双跑（setup→cleanup→setup）后**没有恢复为 true**，该 hook 实例终生 mounted=false。于是第一次卸载成功后 `finally` 里的 `setIsRunning(false)` 被跳过（:160-162）→ `removalRun.isRunning` 永久卡 true → ConfirmDialog `confirmBusy`（ToolsPage.tsx:683-693）恒禁用。
- **症状双重**：即使按钮可点，`fireMutation` 的 `if (runner.isRunning) return`（ToolsPage.tsx:290）也会静默吞派发——同一个卡死 flag。
- **影响面（dev/StrictMode 下全部 useOwnRun 消费方，不止 uninstall）**：ToolsPage 5 个族（use/install/upgrade/link/removal）、EnvPage `envWrite`（5 个确认框+表单）、SettingsPage `writeRun`、TasksPage 4 个 runner、PluginsPage install/uninstall。HomePage self-update 不受影响（本地 useState 无 mounted 守卫）。
- **复现环境吻合**：StrictMode effect 双跑只在 dev 生效——owner 是在 `tauri dev` 本地跑时碰到的（今天刚问过本地运行）；打包产物（beta14）不存在此路径。
- 排除项：`pendingAction` 确认时已清空；execution panel 状态机无残留；数据刷新链路正常（能弹确认框即证明数据在）。
- 条文关系：违反 ui-ux-rules:98 run-lock 条文（「控件只在其命令 in flight 时禁用」——命令落地后仍锁）。

**修复方向**：
1. 【推荐】effect setup 恢复标志：`useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, [])`——一行，全仓 8 页 14+ 控件一次修整个类。
2. 派生式 isRunning（从 panel runs 投影）——改动面大收益小，不推荐。
3. 无组件测试 harness（项目仅 node:test 纯函数），hook 测试按现状约定不补，靠 lint/静态。

**定稿（2026-09-23，owner 确认修）**：采用方案 1——effect setup 恢复 `mounted.current = true`（一行），全仓 useOwnRun 消费方（8 页 14+ 控件）一次修整个类。定位为「不紧急但值得修」：正式包无此路径，纯 dev/StrictMode 问题，但 dev 是 owner 手动验收的主战场，必须保证 dev 验证可信。不加 hook 测试（无组件 harness），不动文档（现有 run-lock 条文本身就是对的，是实现违例）。

**待用户定稿**：~~确认修复方向 1~~ → 已定稿。

### Issue 5【zh 术语：「家目录」是否标准译法】

**来源**：用户报告（2026-09-23，附图 1 张，zh-CN 界面，Env 页移除确认框「运行目录：~（家目录）」）。原话：「这个家目录的翻译是准确的吗，看看互联网上标准的 Home 目录的翻译呢」。

**查证结论**（web 检索 + 全仓 grep）：
- **权威标准是「主目录」**：收录于全国科学技术名词审定委员会《计算机科学技术名词》第三版（2018 公布，「主目录 (home directory)」——术语在线/百度百科词条注明出处）。Linux/Unix 教材与正式文档均用「用户主目录」。
- **「家目录」是社区口语**：百度百科/中文维基百科词条名采用，Linux 社区日常高频，但非审定术语，偏口语。
- 语境对照：Apple macOS 本地化用「个人文件夹」（home folder，桌面语境不同）；Windows 资源管理器「主页」是另一概念。开发者工具语境应以「主目录」为准。
- **仓库内部现状分裂**：UI 文案 `zh-CN.json:605`「~（家目录）」+ 镜像条文 `zh-CN/docs/design/ui-ux-rules.md:95` 用「家目录」（#191 引入）；而 `zh-CN/docs/agents/architecture.md:17`、`zh-CN/docs/design/product-logic.md:22` 用「用户主目录」（#179 批次）。文档内部已经两词并存。

**定稿（2026-09-23，owner 确认按推荐）**：统一为「主目录」——`zh-CN.json:605` → 「运行目录：~（主目录）」+ `zh-CN/docs/design/ui-ux-rules.md:95` 镜像同步；architecture.md / product-logic.md 不动（已是主目录）；scratch 工作文档不追改；en 侧不动。出票时与 Issue 3/4 可各成 ticket 或酌情合并。

### Issue 6【目录模式下 Env 页出现全局配置的变量——查证为正常设计】

**来源**：用户报告（2026-09-23，附图 1 张，zh-CN 界面，Env 页目录模式，`lifan=123` 来源显示全局 config）。原话：「我已经选择了一个目录，但是还是有主目录的变量，这个是正常的吗」。

**查证结论**：**正常，无需修复。**
- 页面展示的是「已解析的环境变量」= `mise env` 在该目录的解析结果；mise 的解析语义是**合并配置链上所有文件**（全局 config + 项目 config，按优先级）——在终端 cd 到该项目跑 `mise env` 同样会看到 `lifan=123`。GUI 镜像 CLI 是产品原则 1/2。
- 现有教学机制已齐备：来源列徽标（全局/当前目录/工具·x/继承，`zh-CN.json:266-280`）逐行标注出处；#154/#156 的来源 Tooltip 给出具体文件路径；概览页还展示配置优先级顺序。
- owner 的困惑是合理的学习曲线（「已解析」≠「仅当前目录定义」），但现有 Source 徽标正是为此设计的。

**处理**：不改动。若 owner 仍觉得困惑，可选的低噪音方案是页 hint 补半句「（含全局配置的贡献）」——默认不做（quietness 原则，来源列已是教学层）。

### Issue 7【工具页「加载中…」常驻不消失】

**来源**：用户报告（2026-09-23，附图 1 张，zh-CN 界面，工具页全局模式，表格数据已渲染但提示仍显示加载中）。原话：「工具页面一直有个加载中，不知道是因为什么」。

**调查结论**（subagent 代码级闭环）：
- **来源**：`OutdatedHint`（ToolsPage.tsx:584 挂载，与右侧过滤框同行），渲染 `common.loading`「加载中…」的条件是 `count == null`（OutdatedHint.tsx:20-24）。
- **根因**：`useParsedOutdatedTools` 在**查询失败时也返回 `data: null`**——两种失败（react-query error / mise 退出码非 0 的 `{kind:"err"}`）都落入 loading 分支。outdated 查询跑 `mise outdated --json --bump`（独立 Tauri 命令 `tools_outdated`，不走面板 runner），任一后端网络慢/失败 → 最多 120s 超时（`READ_TIMEOUT`，mise.rs:36）→ 失败 → null → **「加载中…」永驻**。且 `retry: false` + `refetchOnWindowFocus: false`，无自愈机制。
- **三态设计缺口**：OutdatedHint 只有 pending / count>0 / all-up-to-date 三态，没有失败态——error 被静默渲染成 loading，违反 ui-ux-rules:41「mise 原始报错绝不被吞掉」的精神（:110 也规定省略号只用于进行中文案）。
- **同类排查**：OutdatedHint 仅 Tools 页一处使用；其他 5 页 ListLoading 门只看各自列表查询，无同款「数据到了但门不退」结构，干净。`useParsedLsRemote` 有同风格 `data:null` 但消费方用 `isPending` 区分，结构正确。
- 规则候选：ui-ux-rules「加载与空状态」节补一条——依赖异步查询的工具栏 hint 必须声明 pending/空/有值/失败四态，失败不得渲染成 loading（双语）。

**修复方向**：
1. 【推荐】OutdatedHint 增加显式失败态（props 扩为 status 分派），失败显示 muted 文案「无法获取可更新信息」+ 重试入口（invalidate 该查询）——与 #172 VersionCenter ls-remote 失败加重试按钮的先例一致。
2. 可选加固：outdated 查询设 staleTime（低频数据，避免每次挂载重打网络）。
3. 迁移到面板 runner——改动大，后续重构选项，本次不做。

**定稿（2026-09-23，owner 确认）**：方向 1 + staleTime + 规则条文一并做——OutdatedHint 增加失败态（muted「无法获取可更新信息」+ 重试入口，对齐 #172 VersionCenter retry 先例）；outdated 查询设 staleTime（低频数据）；ui-ux-rules「加载与空状态」节补「异步 hint 四态」条文（双语）。

**待用户定稿**：~~确认方向 1~~ → 已定稿。

### Issue 8【Env 页的「全局/当前目录」徽标其他页面没有——要不要统一】

**来源**：用户报告（2026-09-23，附图 2 张，zh-CN 界面，Env 页全局/目录两模式）。原话：「环境变量页面有全局和当前目录的额外提示，其他页面没有，是不是要统一一下，是都不加呢还是都加呢，你觉得呢？」

**调查结论**（subagent 全仓扫查 + 主会话补查布局）：
- **纠偏：不是 Env 独有，Settings 页也有**——两页各有一份本地重复实现（`EnvPage.tsx:352-367` / `SettingsPage.tsx:333-350`），Badge + 路径框 + Tooltip，纯展示零交互。
- **历史谱系 = 复制惯性**：#26（config 编辑器，已退役页）创造 → #29/#41 复制到 Settings/Env → #43 config 页退役但徽标存活。无任何成文规则要求它；beta11 H3 还为它的长路径溢出修过一次。
- **信息完全冗余**：顶栏 DirectoryIndicator 由 PageShell 恒定渲染，两种模式下都展示模式 + 完整路径；主会话补查布局证实 `.main` 是唯一滚动容器（PageShell.module.css:178-184 `overflow-y: auto`），**顶栏条固定在滚动区上方恒可见**——页内徽标携带的每一条信息顶栏都在视口内常驻，滚动到表格深处时两者同样都不可见（徽标在页头，跟着滚走）。
- **违反原则 4**：product-logic.md「Directory context is one thing——strip 是选择和展示目录的唯一地方，各页只消费它」。
- 写入作用域的教学已有三层：per-mode hint 文案（#169 变体，env.hintGlobal 显式写 `mise set -g`）、行级来源徽标/Tooltip、决策时刻的弹窗（#182 越界警告、settings unsetOutOfScope 弹窗内自明作用域）。
- 各页写入作用域事实：Env（`-g`）/ Settings（`--local`）/ Tools（`-g`）随模式变化，Tasks 隐性（runner `-C` 锚定），Plugins/Home/Doctor/Preview 无模式写入——若「都加」，Tools/Tasks 也要加且 Tasks 还得诚实区分显式 `-g` 与隐性锚定，复杂度扩散。

**定稿（2026-09-23，owner 确认「都不加」）**：统一移除——删 EnvPage + SettingsPage 两处 ScopeBadge 及重复 CSS；`env.scope.*` keys 若无他处消费则退役（过 dead-key 守卫）；ui-ux-rules 补「页面内容不得重复渲染目录上下文（模式/路径）——顶栏 strip 是唯一展示位」条文（双语）。

**待用户定稿**：~~统一移除~~ → 已定稿。

（待用户逐个报告）
