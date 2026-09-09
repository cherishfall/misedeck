# v1.0.0-beta.9 反馈记录

> 状态：已收集完毕并发布（2026-09-09）。SPEC 父 issue #119；tickets #120–#127（映射见下）。
>
> | Ticket | 内容 |
> |---|---|
> | #120 | 工具栏模式标签提 12px + zh-CN 字距 normal（Issue 1） |
> | #121 | 行内字号均衡 13 处 + Badge 行内尺寸 + 本目录→当前目录（Issue 6） |
> | #122 | 选择目录全站 primary + 去按钮「…」后缀（Issue 4） |
> | #123 | 页面眉签行删除 + 侧栏命名统一（Issue 5） |
> | #124 | CommandHint 共享组件 + 去内部 flag + 8 页 CSS 去重（Issue 7） |
> | #125 | self-update `--yes` + GUI 确认框（Issue 8） |
> | #126 | 24 处 spacing 字面量迁移 + check-css-spacing lint（Issue 2 遗留） |
> | #127 | 批次收尾主动清扫（blocked by #120–#126，原生依赖已设置） |
>
> 文档侧改动（Issue 2 规则清理、Issue 3 一处一规则重构、各 Issue 的规则修订）已在本会话直接落地（双语），见下各条。
> 流程：用户逐条口述 → 我记录原话并做代码调查 + 同类全站排查 → 有不确定处用 grill-with-docs 拷问到共识 → **本轮只记录和调查，不修复** → 全部收集完后综合分析 → to-spec 发布 SPEC 父 issue → to-tickets 发布 tickets（含本轮发现的机械可检查问题类的 lint 防线 ticket）。
> 每条结构：用户原话（+截图）→ 代码调查结论 → 同类排查 → 定稿。
> 基线：beta.9 由用户验收中。
>
> ## 本轮工作约定（2026-09-09，grill 共识）
>
> 1. **视觉/交互「冻结」= 用户暂停挑刺，不是规则**。用户连调 7 轮视觉后决定暂停在视觉/交互上的投入，重心转向功能完善。不新增规则、不写 ADR、不改 ui-ux-rules——只是本轮之后用户不再主动报告纯审美问题。
> 2. **代理侧不「顺坡下」**：用户对「我不挑刺代理也不主动报告」提出批评。本轮起严格执行 AGENTS.md 的主动清扫条款：每个报告的问题做同类全站排查；收尾时做一轮全 app 主动清扫，汇报所有发现（含查完干净的项），发现问题按专业判断 flag 或开 ticket。
> 3. **lint 防线**：本轮遇到的机械可检查问题类（如 TSX 内联硬编码样式、Button variant 混用、术语不一致），随本批 tickets 一起发 lint 防线 ticket，接入 `npm run ci`（现有防线：lint:i18n、lint:i18n-concat、lint:css-tokens、lint:css-font-size）。

---

## Issue 1【视觉】: 顶部工具栏左侧 eyebrow（全局模式 / 当前目录+路径）偏小不协调（beta8 定稿被推翻）

**用户原话**: 「这个工具栏上的全局模式，当前目录和路径的字体大小不协调，全局模式和当前目录两个偏小，和其他的也不协调，我上个版本提过，没有改」（附两张截图，分别圈出全局模式下的「全局模式」eyebrow 和目录模式下的「当前目录 + 路径」区）

**代码调查结论**:

1. **beta8 确实处理过右侧，但左侧被当时的定稿显式保留**。beta8 Issue 1 把右侧三个 `.action` 按钮从 10px 提到 12px（已生效，`DirectoryIndicator.module.css:56`），但 eyebrow 在定稿中明确「不动：10px 大写是设计系统规定的唯一大写元素」。
2. **当前工具栏实测**（`DirectoryIndicator.module.css` + `tokens.css`）：

   | 元素 | 字号 | 字重 | 备注 |
   |---|---|---|---|
   | eyebrow「当前目录 / 全局模式」 | 10px（`--size-label`） | 400 | mono、大写、tracking 0.18em、`--ice` |
   | 路径 | 12px（`--size-data`） | 400 | mono、`--text` |
   | 右侧按钮（.action / secondary sm） | 12px | 400 / 600 | |

   → 同一行基线上 10px 与 12px 混排，正是「不协调」的来源。zh-CN 下 0.18em tracking 施加在 CJK 上还会把「当前目录」撑散，视觉上更小更虚。
3. **现行规则反而是元凶**：`ui-ux-rules.md:42` 明文规定「同一行内 10px 大写 eyebrow 是唯一允许的小元素」——代码是合规的，是这条规则在工具栏场景下不成立（页面场景里 eyebrow 上方还有 26px display 标题，层级清楚；工具栏里它与同行按钮同基线，10 vs 12 读作「失衡」而非「层级」）。用户此条 = 推翻该规则在工具栏的适用。
4. **同类排查（--size-label 全站 60+ 处）**：页面 eyebrow（`MISE / 概览` 等）位于 display 标题之上，层级成立，10px 保留无争议；Badge（来源「全局/本目录」）、表头、DataRow label 均为装饰性小元素且不与 12px 按钮同基线竞争，无需动。**受影响面只有 DirectoryIndicator 工具栏一处**。

**待用户定稿**（见下，推荐 A）：

- A（推荐）：工具栏 eyebrow 提到 12px（`--size-data`），保留 mono + `--ice`，tracking 在 zh-CN 下降为 normal（CJK 不适用西文 tracking）；同步修订 `ui-ux-rules.md:42`：eyebrow 例外仅限页面区块眉，工具栏行内不再允许 10px 元素。
- B：保持 10px，只把 zh-CN tracking 降为 normal（改动最小，但 10 vs 12 的落差仍在）。
- C：eyebrow 与路径合并为一个元素（「当前目录: /path」），取消 eyebrow 角色。

---

## Issue 2【规则文档审计】: ui-ux-rules.md / visual-language.md 中不合适规则的清理

**用户原话**: 「这条规则（ui-ux-rules.md:42 的 eyebrow 例外）不对，我不是很专业的前端，ui, ux, 你给的很多规则实则我都不太懂什么意思，有时候稀里糊涂就同意了你的规则，实则是不合适的，看看 ui-ux-rules.md 等等文档里是不是还有些明显不合适的规则，清除或者优化一下」

**审计结论**（2026-09-09，逐条审了 `ui-ux-rules.md` 137 行 + `visual-language.md` 104 行）：

| # | 位置 | 问题 | 处置建议 |
|---|---|---|---|
| 1 | ui-ux-rules.md:42 | 工具栏行内允许 10px eyebrow —— 用户已判定不成立（Issue 1 定稿 A） | **修订**：eyebrow 例外仅限页面区块眉；工具栏行内元素 ≥12px；zh-CN eyebrow 字距 normal |
| 2 | visual-language.md:77 | 「Spacing on a 4px grid; common gaps 14/16/22/26px」自相矛盾——14/22/26 都不在 4px 网格上，且 tokens.css 的 `--space-5:22px / --space-6:26px` 本身就破网格 | **修订**：删掉 4px 网格说法，以 token 标尺为唯一依据 |
| 3 | visual-language.md:68 | 「data 11–13px」给了区间，与 `--size-data: 12px` 单 token 及 token 纪律冲突——区间说法正是 beta8 #113（14 处硬编码字号）的温床 | **修订**：钉死 data = `--size-data` 12px |
| 4 | ui-ux-rules.md:44 | 「spacing 必须来自 token」无 lint 防线且已实际违规 24 处（各 module.css 的 padding/margin/gap 字面量）；check-css-tokens 只查颜色 | **保留规则 + 发 ticket**：迁移 24 处 + 新增 check-css-spacing 接入 ci |
| 5 | ui-ux-rules.md:133 | 「Verify economically」允许「标 not visually verified 然后 move on」——这行许可了视觉改动未经肉眼验证就合并，是 7 轮视觉 bug 反复的机制性原因之一，也是用户批评「我不挑刺你也不报告」的制度根源 | **修订**：视觉改动必须跑起来 + 截图自验（涉及的两主题至少看改动的那个）；机械审计只够非视觉改动 |
| 6 | visual-language.md:64/69 | eyebrow 规范（大写 + 0.18em tracking）是纯拉丁视角：CJK 无大写，0.18em 字距在中文上是负优化 | **修订**：补 zh-CN eyebrow 注记（无大写、字距 normal） |
| 7 | visual-language.md:39 | 「is NO LONGER an alias of --hull」是变更日志腔，规则文档应陈述现状 | **编辑清理**（顺手） |

**查了但判定保留的**：pagination 规格、浮层 ARIA 整节、`›`/`←` grandfather 注记、数据诚实原则（L13-16）、按钮 variant 表、执行面板规则、zh-CN 孤字规则、命令 hint 精确性规则——均有真实 beta 事故来源或属实现契约，无明显不合适。

**待用户确认**：按上表修订 en + zh-CN 共 4 份文档；#4 的代码迁移和 lint 防线走 tickets。

**定稿（2026-09-09，用户确认）**:

- **Issue 1 定稿 A**：工具栏 eyebrow（全局模式 / 当前目录）提到 12px（`--size-data`），zh-CN 字距 normal；`ui-ux-rules.md:42` 例外条款已修订为「仅限页面区块眉」。**修复走 tickets，本轮未改代码**。
- **Issue 2 文档修订已落地**（2026-09-09，en + zh-CN 共 6 份文件，commit 待随本批统一处理）：
  - `ui-ux-rules.md` L42：工具栏行内不低于 `--size-data`，eyebrow 例外限页面区块眉（双语）
  - `ui-ux-rules.md`「经济地验收」整节重写：静态优先（ci 全绿 + 机械自查）；**代理侧视觉验证默认禁止**（启动应用/截图/点验既慢又费 token 还占用维护者电脑——维护者决定）；替代方案 = 生成时 lint 拦截；渲染确认归维护者 beta 验收门（双语）
  - `AGENTS.md` 不可妥协项同步修订（原「build, run, look at the running app」与新验收规则冲突，双语）
  - `visual-language.md`：钉死 `--size-data` 12px（删 11–13px 区间）；删「4px 网格」改为「以 `--space-*` 标尺为唯一依据」；补 zh-CN eyebrow 注记（无大写、字距 normal）；清掉 `--panel` 的变更日志腔（双语）
  - 遗留走 tickets：24 处 spacing 字面量迁移 + `check-css-spacing` lint 防线

---

## Issue 3【文档结构】: 规则文档一处一规则重构

**用户原话**: 「我留意到"5 处分散在不同文件的内容"这句话，能不能重构下文档，把不同的规则给分门别类归纳到一份文档中，这样只维护一处，也不容易漏改，最终在 agents.md 里引用或者指定」「按照推荐，现在就做」

**执行结果（2026-09-09，已落地，en + zh-CN 共 8 份文件）**:

- **验收规则收敛到 `conventions.md`**：DoD 与 Verification loop 两节合并重写为唯一权威版本（静态优先 + 代理侧视觉验证默认禁止 + lint 拦截替代 + 维护者 beta 验收门）；顺带消除了 zh 版 Verification loop 停留在旧口径的漂移（「布局重构才截图」）。
- **`ui-ux-rules.md`「Verify economically / 经济地验收」节删除**，原地留指针指向 conventions.md（一处一规则）。
- **`AGENTS.md` 不可妥协项降级为索引**：验收、执行面板、i18n 三条改为各一行 + 指向权威出处；新增元规则「One rule, one home / 一处一规则：每条规则只有一个权威文档，其他文档只链接不复述；复述即漂移」。
- 权威出处格局：行为规则 → `ui-ux-rules.md`；工程流程 → `conventions.md`；i18n 工程细节 → `i18n.md`；视觉 token → `visual-language.md`；决策记录 → ADR（不动，性质不同不算重复）。
- 全库 grep 确认「Verify economically / 经济地验收」无遗留悬空引用（仅存于本 scratch 的历史记录）。

---

## Issue 4【视觉】: 「选择目录」按钮两处 variant 不一致 + 工具栏红色被改 + 按钮文案「…」后缀

**用户原话**: 「概览页面的选择目录按钮和上面工具栏选择目录的按钮不是一个风格的，工具栏上的按钮原来是还是红色的，被莫名其妙改了，还有概率页面的选择按钮文字后有三个点...，也要去掉」（附截图，圈出工具栏「选择目录」和空态卡片「选择目录…」）

**代码调查结论**:

1. **不是莫名其妙，是 beta8 #102 有意改的**（commit c4713bc）：工具栏「选择目录/选择其他目录」primary → secondary，依据是 ui-ux-rules.md 的「工具栏多个按钮并存时回落到映射表 variant」；空态卡片保留 primary，依据是 L67「空态唯一出路例外」。当前两处不一致 = 规则本身规定的结果。用户此条 = 再次推翻一条他当时稀里糊涂同意的规则。
2. **按钮文案带「…」后缀的全站清单**（同类排查）：
   - 按钮级：`preview.empty.action` =「选择目录…」（DirectoryPreview 空态）、`plugins.actions.install` =「安装…」（Registry 行内按钮）——「…」是「将打开对话框」的旧式 GUI 惯例。
   - 非按钮（输入框 placeholder / 进行态）：过滤×4、搜索×1、加载中/正在信任/正在探测×3 —— 语义不同（提示语/进行态），不在用户所指范围。
3. **其他「选择目录」入口**：DirectoryIndicator 两种模式的工具栏按钮（secondary）+ DirectoryPreview 空态（primary）+ LinkToolForm 的 pick-directory（#102 已改 secondary）。

**待用户定稿**（variant 方向，见下）；
**已定稿（用户原话明确）**：按钮文案「…」后缀全站去除——「选择目录…」→「选择目录」、「安装…」→「安装」；placeholder/进行态的「…」保留（语义是提示/进行中，非按钮）。

---

## Issue 5【视觉/文案】: 页面眉签行（MISE / X）存废 + 侧栏「概览」与标题「目录概览」命名不统一 + 插件页眉签漏翻译

**用户原话**: 「tab栏这里叫概览，页面主标题又叫目录概览，统一叫目录概览吧，要不又主页，又概览的，看着不清不楚的」「插件页，中文模式下，上面的页眉还是 MISE / Plugins 不是和其他页那样 MISE / 插件，还有各个页面有必要加一行吗，是不是去掉更简洁，毕竟都有标题了」（附两张截图）

**代码调查结论**:

1. **命名**：侧栏 label 走 `preview.nav`（zh「概览」/ en "Overview"），页面标题走 `preview.title`（「目录概览」/ "Directory overview"）——同一页面两个名字。另有 `home`（首页）页，与「概览」相邻易混。
2. **插件页眉签漏翻译是实锤 bug**：`zh-CN.json` 里 `plugins.eyebrow` = `"MISE / PLUGINS"`（英文原文），其他页都是「MISE / 插件」式中文。CSS `text-transform: uppercase` 对 CJK 无效所以其他页看不出，插件页暴露了。
3. **眉签行现状**：8 个页面 header 全部渲染 `MISE / X` 眉签（HomePage/Tools/Env/Tasks/Plugins/Doctor/Settings/Preview），位于 display 标题之上；另有 EmptyState 的可选 eyebrow prop 和 MiseMissingState。工具栏的「全局模式/当前目录」眉签是**模式标签**、性质不同，不受本条影响（Issue 1 已单独定稿）。

**定稿**：

- **命名统一（用户明确）**：`preview.nav` zh「概览」→「目录概览」、en "Overview" → "Directory overview"，与页面标题一致。
- **眉签行存废（待确认，推荐去掉）**：8 个页面 header 的 `MISE / X` 眉签行整行删除——侧栏已高亮当前页、下方就是同名大标题，眉签是纯重复；mise 官网的眉签（`01 THE ESSENTIALS`）是给长滚动页面内的区块命名的，MiseDeck 每页有独立标题，角色不成立。连锁影响：插件页漏翻译问题随之消解（整个元素没了）；`visual-language.md` 的 eyebrow 角色改写为「仅模式/区块标签」（工具栏保留）；EmptyState 的 eyebrow prop 保留（组件内部可选槽位，与页面 header 无关）。诚实提示：英文页将失去全系统唯一的大写字距元素（拉丁文的设计签名点缀），页面变成纯标题引领。

**定稿确认（2026-09-09）**:

- **Issue 4 → A 已确认**：「选择目录」全站统一 `primary`（工具栏两种模式 + 空态 + LinkToolForm 四处）；「…」后缀去除（「选择目录…」「安装…」）。规则修订已落地（双语）：variant 映射表「选择目录」从 secondary 移入 primary；删除「工具栏回落 + 空态例外」条款，改为「choose-directory 全站 primary（beta9 取代 beta8 条款）」。代码修复走 tickets。
- **Issue 5 → 确认整行删除**：8 个页面 header 的 `MISE / X` 眉签行删除；`preview.nav` 统一为「目录概览 / Directory overview」；插件页漏翻译 key 随元素删除消解。规则修订已落地（双语）：`visual-language.md` eyebrow 角色改写为「仅模式/区块标签（工具栏模式指示器）」，页面 header 眉签标注 beta9 退役及理由。代码修复走 tickets。

---

## Issue 6【视觉+术语】: 设置页「本目录」应统一为「当前目录」+ 两处字号偏小 + 全站同类排查

**用户原话**: 「这个设置页，叫本目录，应该叫当前目录，要统一名称用法，而且我框起来的两个地方字体大小页不均衡，都略小了，其他页好像也有这种字体小的问题，你都统一查下」（附截图，圈出 scope Badge「本目录」和「显示全部 (--all)」复选框标签）

**代码调查结论**:

1. **术语**：「本目录」出现在 3 个 i18n key：`preview.toolSource.project`、`env.scope.project`（设置页 scope Badge 复用此 key）、`tasks.editForm.dependsHelp`；en 对应 "This directory"。CONTEXT.md 的绑定词汇是「当前目录 / current directory」——属违规残留。
2. **全站字号排查**（explore 子代理全量核查 `var(--size-label)` 60+ 处）：硬编码字号字面量为 **零**（lint 防线有效）；问题全部集中在「10px 与 12px/14px 同行」这一模式，共 **13 处**：
   - **Badge 内嵌文字场景**（3 处）：SettingsPage ScopeBadge、EnvPage ScopeBadge（同模式第 3 实例）、DoctorPage StatusRow——Badge 根样式 10px，旁边是 12px 路径/文本
   - **工具栏/表单行内小字**（10 处）：SettingsPage `.showAll` + `.toolbarHint` + `.addLabel`、TasksPage `.toolbarHint`、EnvPage `.addLabel`、TableFilter `.clear` 按钮、Pagination `.help`、DirectoryPreview `.configToggle`、DataRow `.label`（首页状态面板）、ExecutionPanel 头部标题、ToolsPage `.inactiveNote`（表格单元格内联文字）、HomePage `.fallback` 链接
   - **判定无问题的（10px 独立装饰/层级）**：表头、表格单元格内的 chip、EmptyState 眉签、Banner 标题、loading/error 独立行等约 40 处
3. 与 Issue 1 的「工具栏行内不低于 12px」规则同源：本条把该模式推广到了全站所有行内场景。

**已定稿（术语，用户明确）**：3 个 key 的「本目录」→「当前目录」，en "This directory" → "Current directory"。

**待用户定稿**（字号修复方案，见下）。

**定稿（2026-09-09，用户确认 A 并附加原则）**:

- **原则校准（用户原话）**：要的是「字体大小合适、视觉均衡」这个**结果**，不是规则本身——规则不得与视觉均衡冲突。落地口径：同一行/同基线文字大小协调为准；「安静感」靠颜色（`--ice`）和字重表达，不靠更小字号；10px 只留独立装饰位（表头、单元格 chip、空态/加载标签）。
- **修复范围**：13 处行内小字全部提 12px——Badge 增加行内尺寸（设置页/环境变量页 ScopeBadge、诊断页 StatusRow；表格单元格内 chip 不动），SettingsPage `.showAll`/`.toolbarHint`/`.addLabel`、TasksPage `.toolbarHint`、EnvPage `.addLabel`、TableFilter `.clear`、Pagination `.help`、DirectoryPreview `.configToggle`、DataRow `.label`、ExecutionPanel 头部标题、ToolsPage `.inactiveNote`、HomePage `.fallback`。
- **术语**：`preview.toolSource.project`、`env.scope.project`、`tasks.editForm.dependsHelp` 三个 key 的「本目录」→「当前目录」，en "This directory" → "Current directory"。
- **规则已修订（双语）**：`ui-ux-rules.md` 工具栏条款推广为全站同行条款，并写入「目标是视觉均衡，字号下限只是执行手段」。
- **lint 防线评估**：同行字号失衡难以纯静态机械判定（需布局上下文），本轮不加 lint；靠本次全量修复 + 规则。修复走 tickets。

---

## Issue 7【视觉/教学】: commandHint 夹带内部 -- 参数 + 折行把命令拦腰截断

**用户原话**: 「这些展示命令的提示语要不就隔断了，要不就加了一些 -- 参数，审查这些表述，看看有没有相同的问题」（附三张截图，圈出环境变量页 `--json-extended`、任务页 `--path`、工具页「mise / uninstall」跨行截断）

**代码调查结论**:

1. **全站 9 个 commandHint 全量审查**（zh-CN.json；en 同步同构）：
   - 夹带内部参数的 2 处：`env.commandHint` = `mise env --json-extended · …`（`--json-extended` 是 GUI 自己取数据的实现细节，用户面向的命令是 `mise env`）；`tasks.commandHint` = `… mise tasks edit --path`（`--path` 是 GUI 打开编辑器用的参数）。教学性规则（ADR-0004/命令 hint 精确性）要求 hint 教的是用户命令，这两处把实现漏进了教学文案。
   - 其余 7 个 hint（home/tools/preview/settings/doctor/plugins）无 `--` 参数，表述无问题。
2. **折行截断根因**：commandHint 是一整条 mono 字符串直接渲染，折行发生在任意空格处——「mise uninstall」会从中间断开。且规则要求 hint 上限 `max-width: 60ch`，全站 8 份 `.commandHint` 里**只有 ToolsPage 一家实现了 60ch**（规则与实践漂移）。
3. **结构性问题**：`.commandHint` 样式块在 8 个页面各复制了一份（Tools/Env/Settings/Tasks/Doctor/Home/DirectoryPreview/Plugins），正是「复制导致漂移」的实例。

**待用户定稿**（见下，推荐 A）：

- A（推荐）：① 两处 hint 去掉内部参数（env → `mise env · mise set · mise unset`；tasks → `… mise tasks edit`）；② 新增共享 `CommandHint` 组件：按 `·` 切分，每条命令一个 `white-space: nowrap` 单元，折行只发生在命令之间；统一 60ch 上限；8 页全部换用该组件，删除 8 份重复 CSS；③ 规则修订：命令 hint 只列用户面向命令（内部取数 flag 永不出现在 hint）；命令是不可折行的最小单元。
- B：只修文案（去 2 处 flag）+ 各页 CSS 补 `60ch`，不做组件化（折行截断问题保留）。

**定稿（2026-09-09，用户确认 A）**:

- 两处 hint 去内部 flag：`env.commandHint` → `mise env · mise set · mise unset`；`tasks.commandHint` 去掉 ` --path`（en 同步）。
- 新建共享 `CommandHint` 组件：按 `·` 切分、每条命令 `nowrap`、折行只在命令间、统一 60ch；8 页换用并删除 8 份重复 `.commandHint` CSS。
- 规则已修订（双语）：hint 只列用户面向命令（内部取数 flag 永不出现）；命令是不可折行最小单元；hint 一律走共享组件。
- 修复走 tickets。

---

## Issue 8【功能 bug】: `mise self-update` 需要交互确认，执行面板无 stdin 导致必然失败

**用户原话**: 「再报一个bug，首页升级需要输入y，但是执行面板没有任何可以输入的地方」（附截图：执行面板 `mise self-update` 输出 `Do you want to continue? [Y/n]` 后 `AbortedError: the update was not confirmed`，退出码 1）

**代码调查结论**:

1. **根因**：`install.rs:238` 用 `RunRequest::new(vec!["self-update"])` 起进程，没传 `--yes`；runner 不接 stdin，mise 的 `[Y/n]` 提示读不到输入直接 abort，退出码 1。此 bug 从 #30 引入起就存在，必然复现。
2. **同类排查**：全后端 `RunRequest` argv 全量过一遍——uninstall / upgrade / use / set / unset / link / run / tasks add / trust 均非交互；**`self-update` 是唯一会读 stdin 的命令**。引导安装的 `install.sh` 脚本也是非交互的。
3. **伴生违规**：首页两个 self-update 按钮（HomePage.tsx:179-181、244-246）点击即跑，**没有任何确认**——按交互完整性规则，覆盖 mise 二进制属敏感操作应先确认（确认框同时是教学时刻：「将运行 `mise self-update`」）。一旦加了 `--yes`，CLI 侧确认被绕过，GUI 侧确认更不能少。

**待用户定稿**（见下，推荐 A）：

- A（推荐）：① argv 加 `--yes` 修复 bug；② 同时补 GUI 确认框（ConfirmDialog：「将运行 `mise self-update`，把 mise 从 X 升级到 Y」），两处按钮共用。
- B：只加 `--yes` 修 bug，不加确认框（点击即替换二进制）。

**定稿（2026-09-09，用户确认 A）**：`install.rs` 的 self-update argv 加 `--yes`；首页两处升级按钮前置 ConfirmDialog（「将运行 `mise self-update`，从 X 升级到 Y」，教学时刻），共用同一确认组件。修复走 tickets。规则无需新增（确认规则已有，本条是补执行）。
