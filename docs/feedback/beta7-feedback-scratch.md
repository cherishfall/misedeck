# v1.0.0-beta.7 反馈记录

> 状态：收集进行中（2026-09-07 起）。
> 流程：用户逐条口述 → 我记录原话并做代码调查 → 有不确定处用 grill-with-docs 拷问到共识 → 全部收集完后综合分析 → to-spec 发布 SPEC 父 issue → to-tickets 发布 tickets。
> 每条结构：用户原话（+截图）→ 代码调查结论 → 对齐后的理解 → 定稿。
> 沿用 beta5/beta6 的经验：**先量数据、再拷问**，不在没有事实的情况下让用户做判断题。
> 基线：beta.7 已发布（`v1.0.0-beta.7`），beta6 批次（#74、#75–#85）全部关闭，遗留 open 项只有 SPEC 父 issue #45 / #61 / #65 / #74，等待主人视觉验收。

---

## Issue 1【bug + 设计】: 链接工具表单的路径框是裸 input（无样式、可手输），要求去掉手动输入

**用户原话**: 「去掉工具页面中的手动输入路径框，不知道为什么弄出这样一个违反视觉风格的东西，查看下是否还有同类问题」（附截图，红框圈出"链接工具"区的白色路径输入框）

**代码调查结论**:

1. **根因（视觉违规）**：`ToolsPage.tsx:996-1006` 路径输入框只有 `className={styles.linkFormPath}`；`.linkFormPath`（`ToolsPage.module.css:339-342`）只定义 `flex: 1 1 220px; min-width: 200px`，**没有任何输入框样式**——背景/边框/mono 字体都在单独的 `.input` 类里，此框未携带。→ 渲染成浏览器原生 input，浅色主题下白底默认边框，与全站输入框（4% text 底色 + `--line` 边框 + mono）完全不同。截图中白色长条即此。
2. **来历**：#71（链接工具，`2faf5ca`）。设计意图是路径来自原生目录选择器（`pickDirectory`，`ToolsPage.tsx:945-958`），但输入框本身可手动编辑（有 `onChange`），picker 只是辅助。路径存在本地 state，**不**写全局 directory context（这是对的）。
3. **同类扫描（全应用 23 个 `<input>` 逐一核对）**：
   - 无样式类缺失问题：仅 `linkFormPath` 一处裸奔；EnvPage / TasksPage / SettingsPage / PluginsPage / Pagination / VersionQuerySection 的输入框均带样式类。✅
   - "picker + 可编辑路径输入"组合：全应用仅链接工具表单一处；DirectoryIndicator 的目录选择是纯 picker + 只读文本展示。✅

**对齐后的理解**: 用户要的不是"修样式"，而是**砍掉手动输入路径的能力**——路径只能来自原生目录选择器；选中后以只读 mono 文本呈现（DirectoryIndicator 模式），未选时显示占位状态文案。CLI 教学由执行面板回显的完整 `mise link <tool>@<version> <path>` 承担。

**定稿（2026-09-07，用户确认三项推荐）**:

| 项 | 定稿 |
|---|---|
| 手动输入 | **彻底删除** `<input className={styles.linkFormPath}>`；路径只能来自 picker（`pickDirectory` 保留） |
| 已选路径呈现 | **只读文本**（mono、dim 前为占位态），与 DirectoryIndicator 的展示模式一致；路径始终是 `mise link` 的参数，必须可见（数据诚实） |
| 未选择占位 | **新增 i18n key** `tools.linkForm.noPath`（"未选择目录" / "No directory picked"），en + zh-CN + keys.ts |
| `.linkFormPath` CSS | 删除或改造为只读文本样式（复用 `--text`/`--dim` token，不发明新样式）；不再补 `.input` 样式（输入框已不存在） |
| 提交门禁 | `canSubmit` 逻辑不变（tool/version/path 三者非空），path 由 picker 写入 |
| 不动 | `miseLinkArgs`、conflict 提示逻辑、执行面板回显 |
| 拟定 issue | 标题 ~"Link tool form: drop the manually-editable path input; path comes from the directory picker only, shown as read-only text"，labels: bug, v1 |

---

## Issue 2【内容】: 工具页 commandHint 缺少 mise link / mise ls-remote，且一行过长不换行

**用户原话**: 「上面的提示信息里应该包含 mise link, mise ls-remote, mise unuse 吧，毕竟下面有两个功能就是直接用的这些命令，结果没有体现出来……该换行换行，不要一行拖的老长，命令之间的排序你也斟酌下」（附截图红框圈出提示行）

**代码调查结论**:

- 现状（`en.json:72` / `zh-CN.json:72`，`tools.commandHint`）：`mise ls · mise use · mise install · mise uninstall · mise upgrade · mise outdated`
- 该页实际发出的命令（`ToolsPage.tsx` 顶注释 + args builders）：`ls`、`ls-remote`、`outdated`、`use`、`install`、`link`、`uninstall`、`upgrade`——**`link` 和 `ls-remote` 确实缺席**（分别是 #71 链接工具、#55 远程版本查询引入，当时没回写 hint）
- **`mise unuse` 不存在**：mise CLI 没有 unuse 子命令，该页也不发这个命令。用户指的应该是"卸载"，即 `mise uninstall`——已在列表中。已向用户指出。
- 换行：`.commandHint`（`ToolsPage.module.css:36-41`）无 max-width/line-height，是裸 `<p>`，默认按空格折行、拖到整页宽；旁边的 `.hint` 有 `max-width: 60ch; line-height: 1.5`。

**对齐后的理解**: hint 必须与该页真实发出的命令一一对应（数据诚实）；`unuse` 不是 mise 命令，不得出现。排序按页面从上到下的功能出现顺序，降低 hint↔UI 对照成本。换行用既有 60ch 规格自然折行，不写死断点（en/zh-CN 断点不同）。

**定稿（2026-09-07，用户确认三项推荐）**:

| 项 | 定稿 |
|---|---|
| 清单 | 8 条：`mise ls · mise outdated · mise use · mise upgrade · mise uninstall · mise install · mise link · mise ls-remote`（加 link/ls-remote，**无 unuse**） |
| 排序 | 按页面布局阅读顺序：表格（ls→outdated→use→upgrade→uninstall）→ 安装表单 → 链接表单 → 远程版本查询 |
| 换行 | `.commandHint` 加 `max-width: 60ch`（复用 `.hint` 规格），自然折行；不改 i18n 字符串断点 |
| 改动面 | `en.json` + `zh-CN.json` 的 `tools.commandHint` + `ToolsPage.module.css` 一行 |
| 拟定 issue | 标题 ~"Tools page commandHint: add mise link / mise ls-remote, order by page layout, cap at 60ch"，labels: v1 |

---

## Issue 3【交互】: 来源列等长文本列用原生 title 提示——慢、丑、无复制；要求统一成带复制按钮的提示层

**用户原话**: 「来源列，鼠标放置在上面展示完整路径时间比较长，而且需要点击一下，等个两三秒才能浮现完整路径，完整路径的样式也不好看，我还希望完整路径后面有个复制按钮……其他页面文字太长列也都有这个问题，需要一同看下」（附截图红框圈出原生 tooltip）

**代码调查结论**:

- 根因：所有长文本单元格的"完整内容"都是**原生 `title` 属性**——#81 定稿"every ellipsized cell carries a title"，共 ~30 处横跨 ToolsPage / DirectoryPreview / EnvPage / SettingsPage / TasksPage / DoctorPage / PluginsPage / DirectoryIndicator / Pagination 等。原生 tooltip 的延迟（~1s+，且 macOS 上常需鼠标完全静止）、样式、不可交互全是 OS 行为，前端无法控制——用户感知的"需要点击、等两三秒"即此。
- 复制能力现成：`ExecutionPanel.tsx:218` 有 `writeClipboard()`（navigator.clipboard + textarea fallback）+ "Copied" 瞬时确认模式，但是模块私有，需提升为共享 util。
- 浮层基建现成：`FloatingMenu`（#63）是唯一浮层原语（`--z-popover: 60`、portal、WAI-ARIA）；tooltip 是新的非交互浮层 + 一个可复制文本 + 复制按钮，需要决定是复用还是新建。
- **同类范围**：用户明确"其他页面文字太长列一同看"——即全部 ~30 处 `title=` 的省略单元格，不止来源列。

**对齐后的理解**: 原生 `title` 的延迟/样式/不可交互是 OS 行为，前端无解，必须自建提示层；复制按钮只对长数据有意义，按钮/图标的短标签 title 保持原生（无障碍语义更稳）。

**定稿（2026-09-07，用户确认推荐）**:

| 项 | 定稿 |
|---|---|
| 新组件 | 新建 `Tooltip` 原语（components/Tooltip/）：hover ~250ms 出现，portal 浮层（`--z-popover`），`--panel` 底 / `--line` 边，mono 全文 + 尾部复制按钮 |
| 复制 | `writeClipboard` 从 ExecutionPanel 提升为共享 util；复制按钮带"已复制"瞬时确认（复用执行面板模式） |
| 悬停行为 | 鼠标移入提示层本身不消失（才能点复制）；移出单元格+提示层后关闭 |
| 范围 | **只替换长文本数据单元格**的 ~30 处 `title=`（ToolsPage / DirectoryPreview / EnvPage / SettingsPage / TasksPage / DoctorPage / PluginsPage / DirectoryIndicator 等）；按钮/图标短标签 title 保持原生 |
| 不动 | FloatingMenu（menu 语义不同，不强行复用）；`title` 属性在非数据元素上保留 |
| 拟定 issue | 标题 ~"Tooltip primitive with copy button replaces native title on ellipsized data cells (app-wide)"，labels: v1 |

---【bug】: 窗口缩窄时表格列被 fixed 布局压垮——表头文字互相重叠、工具列消失（#81 回归）

**用户原话**: 「还有工具和版本两列随着窗口缩小，表头会重叠，这也是个显示的bug」（附截图红框："工臊本"重叠、工具名列消失）

**代码调查结论**:

- 根因链：#81 给 5 个数据表 opt-in `table-layout: fixed`（`Table.tsx` `fixed` prop → `.fixed`）。工具页列宽声明 = 30% + 96+120+100+150+200+220px ≈ 886px+。窗口内容区窄于此值时，fixed 布局**压缩每列到声明宽度以下**；`th` 是 `white-space: nowrap` 且**无 `overflow: hidden`** → 表头文字溢出叠到下一列（"工具"+"版本"="工臊本"）；工具列被压到近 0 宽，单元格内容整体消失。
- `.scroller` 的 `overflow-x: auto` 形同虚设：表格 `width:100%` + fixed 布局永远不会超出容器，横向滚动永不触发。
- 影响范围：**5 个 opt-in fixed 的表**（#81 清单）全部有这个问题，不止工具页。

**修复方向（候选）**:
- A. 给 `.fixed` 表加 `min-width`（= 列宽声明总和），窄窗口时 `.scroller` 横向滚动生效，列永不被压垮
- B. `th` 加 `overflow: hidden; text-overflow: ellipsis`（表头宁可省略也不溢出）——治标，列仍被压

**对齐后的理解**: fixed 布局下 `.scroller` 永不触发是根因；min-width 让横向滚动复活（治本），表头 ellipsis 是防御性兜底（防未来新表再犯）。

**定稿（2026-09-07，用户确认推荐：A 为主 + B 顺带）**:

| 项 | 定稿 |
|---|---|
| 治本 | 5 个 opt-in `fixed` 的表各自声明 `min-width`（≈列宽声明总和），窄窗口时 `.scroller` 横向滚动生效 |
| 防御 | `.table thead th` 加 `overflow: hidden; text-overflow: ellipsis`（对 auto/fixed 布局都生效，一行 CSS） |
| 范围 | Table 组件层 + 5 个 opt-in 表的页面 CSS；逐表核对 min-width 数值 |
| 拟定 issue | 标题 ~"Fixed-layout tables: min-width so narrow windows scroll instead of crushing columns (+ th ellipsis guard)"，labels: bug, v1 |

---

## 设计哲学讨论：换行 vs 省略（用户发起）

**用户原话**: 「我也觉得文字太长换行比隐藏显示...更好，你觉得呢？」

**我的立场（已表达）**: 数据表格内不换行——行高一致才能逐行扫描，长路径换行会把一行撑成三行；省略 + Issue 3 的复制提示层是正解。表单/正文区可以换行。**表头**短标签可以换行或省略。待用户裁决。

**裁决（2026-09-07，用户确认推荐）**: 采纳。**规则：数据表格内一律不换行**（省略 + tooltip 兜底）；表单/正文/提示文本可以换行；表头标签优先省略。此规则需在 ticket 落地时写入 `docs/design/ui-ux-rules.md`（+ zh-CN 镜像）成为硬规则。

---

## Issue 5【功能缺口】: 首页 ready 态不显示 mise 新版本更新入口（latest 字段被无视）

**用户原话**: 「mise 已经有新版本了，但是首页不显示更新按钮，也顺带检查下引导安装的逻辑是不是正常的」（截图：RAW 里 `"latest": "2026.9.1"` 而版本是 2026.8.14，无任何更新提示/按钮）

**代码调查结论**:

- 根因：`HomePage.tsx` 的 `ready` 态（99-120 行）只渲染 version/path/RAW，**完全无视 `raw.latest` 字段**；self-update 按钮只在 `tooOld` 态（低于 MiseDeck 最低版本门槛）出现。"有新版本可用"与"版本太老必须更新"被混为一谈，前者没有任何 UI。
- 数据现成：`mise version --json` 的 RAW 已含 `latest: "2026.9.1"`；`DoctorPayload` 也已有 `selfUpdateAvailable` 字段（`tauri.ts:312`）。`runSelfUpdate`（`useExecution.ts:382`）+ 成功后 invalidate 的逻辑现成，只缺 ready 态的入口。
- **引导安装逻辑检查（用户顺带要求）**：`notFound` → `runInstall()` 走 Rust `install_mise`（官方脚本），`tooOld` → `runSelfUpdate()`，均路由执行面板、失败后 RAW stderr 可见——逻辑链完整，未见异常。✅

**对齐后的理解**: "有新版本可用"与"版本太老必须更新"是两回事；首页本职就是引导安装与自更新（hint 自己这么写），ready 态必须有更新入口。

**定稿（2026-09-07，用户确认推荐 A+A）**:

| 项 | 定稿 |
|---|---|
| 呈现 | ready 面板新增"最新版本"DataRow + "更新 mise"按钮（复用 `runSelfUpdate` + `onSelfUpdateOk` invalidate，走执行面板）；仅在判定有新版时显示 |
| 判定 | **字符串不等即提示**：`raw.latest` 存在且 `!== 当前版本` → 显示；`latest` 缺席（拉取失败）→ 不显示（正确降级）。不引入语义化版本解析 |
| i18n | 新增 key（如 `miseManagement.updateAvailable` / `home.latestVersion` 等），en + zh-CN + keys.ts |
| 不动 | notFound 引导安装、tooOld 流程（已验证逻辑完整） |
| 拟定 issue | 标题 ~"Home page: surface `mise version --json` latest as an update row + self-update button in the ready state"，labels: v1 |

---

## Issue 6【误报】: 诊断页"SHELL 激活：未激活 / SHIMS 在 PATH：未激活"与 .zshrc 实际已激活矛盾

**用户原话**: 「诊断页面显示 shell 未激活，我看 zshrc 文件，是有相关的命令的，你看看是不是对 bash 和 zsh 支持的不够呢还是其他什么原因」（截图：诊断页两个"未激活"徽标）

**代码调查结论**:

- **不是 bash/zsh 支持问题**。诊断页的 `activated` / `shimsOnPath` 来自 **`mise doctor --json` 自己的判断**（`tauri.ts:308-311`），不是 MiseDeck 读 rc 文件的结果。
- 根因：MiseDeck 用 `Command::new(mise_path)`（`mise.rs:234`）**直接 spawn mise，不经过 login shell**；而 GUI 应用由 launchd 启动，进程环境里没有 `mise activate` 设置的环境变量（`MISE_SHELL` 等）。`mise doctor` 判断激活看的是**当前进程环境**，于是在 GUI 子进程里永远报"未激活"。
- 实测证据：交互 shell 里跑同一命令 `mise doctor --json` 返回 `"activated": true`、`env_vars.MISE_SHELL=zsh`；用户的 `~/.zshrc:129` 确实有 `eval "$(/Users/lifan/.local/bin/mise activate zsh)"`。
- MiseDeck 其实**已有**读 rc 文件的检测：`shell_activation_check`（#28，`shell.rs`，zsh→.zshrc/.zshenv，bash→.bashrc/.bash_profile，子串匹配 `mise activate`）——但它只喂给 ActivationBanner，诊断页没用。
- 所以这是**"mise doctor 描述的是子进程环境"与"用户交互 shell 已激活"的语义错位**：诊断页忠实地渲染了一个对用户来说必然为假的值。

**对齐后的理解**: 用户关心的问题是"我的 shell 激活了吗"，rc 文件检测回答的正是这个；doctor 的 `activated`/`shimsOnPath` 描述的是 GUI 子进程环境，在 GUI 里恒为假，直接展示是误导。

**定稿（2026-09-07，用户确认推荐 C；SHIMS 行去留由维护者兜底裁决）**:

| 项 | 定稿 |
|---|---|
| SHELL 激活行 | 数据源换为 `shell_activation_check`（#28 已有，读 rc 文件）；用户机器将正确显示"已激活" |
| SHIMS 在 PATH 行 | **删除**——`mise activate` 模式下 shims 本不需上 PATH，此行对激活用户恒为"未激活"，是无效噪音（维护者裁决，已并入用户的"全部按推荐"） |
| 数据诚实 | doctor 原始输出仍在诊断页 RAW 区完整可见，不吞数据 |
| 状态徽标 | "状态：警告"的推导（`DoctorPage.tsx:294`）同步去掉对 `activated === false / shimsOnPath === false` 的依赖，改由 rc 检测结果参与 |
| 拟定 issue | 标题 ~"Doctor page: source shell-activation status from shell_activation_check (rc file), drop the shims-on-PATH row; keep doctor raw output"，labels: bug, v1 |

---

## Issue 7【bug】: 数据内容被 `text-transform: uppercase` 篡改——上次没修干净的同类残留

**用户原话**: 「这些地方莫名其妙的用了全大写，应该是不对的……找找还有没同样的问题，这个全大写问题之前就修过一次，这次还是没有全部修好」（截图：`MISE PLUGINS LS`、`MISE TASKS LS`/`MISE.TOML`/`[TASKS]`/`MISE-TASKS/` 全大写）

**代码调查结论**（全应用 70+ 处 uppercase 逐一归类）：

1. **Table `.empty` 继承泄漏（两张截图的根因）**：`Table.module.css:88` 的 `.empty`（包裹 EmptyState 的 `<td>`）带 `text-transform: uppercase` + mono + tracking；`text-transform` **会继承**，EmptyState 的 `.body` 没复位 → 正文里的 `mise plugins ls`、`mise tasks ls`、`mise.toml`、`[tasks]`、`mise-tasks/` 全部大写化。**所有用 EmptyState 作 empty 的表都中招**（tools/tasks/plugins/env/settings/doctor/preview）。
2. **`.aliasTag`（PluginsPage.module.css:181-190）**：别名是**数据**（`1password-cli`），被渲染成 `1PASSWORD-CLI`。上次修复给 `Badge` 加了 `data` prop 保住了 backend/类型/后端别名，但别名列用的是手写的 `.aliasTag`，漏网。
3. **`.inputName`（EnvPage.module.css:218-221、SettingsPage.module.css:217-220）**：用户输入的**环境变量名/设置键**被视觉大写化——输入 `myVar` 显示 `MYVAR`，存的却是原值，UI 在撒谎（大小写敏感数据）。`.input`（值）没有 uppercase，是对的。
4. **上次修复的 Badge `data` prop 本身无恙**：backend（ToolsPage:486）、type（SettingsPage:159）、backends（PluginsPage:99）都正确带了 `data`。✅
5. 其余 uppercase 全是真标签（eyebrow / sectionTitle / refresh / toolbarHint / Badge 状态徽标等），符合 visual-language 的"uppercase 只属于标签"规则。✅

**修复方向**: ① Table `.empty` 去掉 uppercase/mono/tracking（或 EmptyState `.body` 复位——选组件层修复更稳）；② `.aliasTag` 删 uppercase + tracking（或迁移到 `<Badge data>`）；③ EnvPage/SettingsPage `.inputName` 删 uppercase。规则层：ui-ux-rules 已有"data honesty"条目，需把"uppercase/tracking 只属于标签，绝不落在数据上（含继承场景）"写得更硬。

**对齐后的理解**: 数据诚实规则已存在于 ui-ux-rules（Badge `data` prop 即其产物），这三处是漏网；修复遵循"防御点在被包裹内容/数据侧"的原则。

**定稿（2026-09-07，用户确认三项推荐）**:

| 项 | 定稿 |
|---|---|
| Table `.empty` | **组件层修复**：EmptyState 根元素加 `text-transform: none; letter-spacing: normal` 复位继承——一处修全站点生效 |
| `.aliasTag` | **迁移到 `<Badge variant="info" data>`**，与 backend 列同款；`.aliasTag` 样式整体删除 |
| `.inputName` ×2 | EnvPage + SettingsPage 删除 `text-transform: uppercase`（用户输入回显必须原样） |
| 规则加固 | `ui-ux-rules.md`（+ zh-CN 镜像）写硬：uppercase/tracking 只属于标签；数据（含用户输入回显、命令名、别名、路径）永不大写化，组件须防继承泄漏 |
| 待裁决 | "标签是否该大写"的设计哲学问题（用户追问中，见下节） |
| 拟定 issue | 标题 ~"Uppercase leaks onto data: EmptyState inherits Table .empty transform, aliasTag uppercases aliases, inputName uppercases typed keys"，labels: bug, v1 |

---

## 设计裁决：标签大写规则推翻，向官网对齐（2026-09-07）

**用户原话**: 「官网没有全大写呀，我觉得是不是更改规则，就正常的写法」（附 mise.jdx.dev 截图）

**证据复核（官网截图）**: 官网**只有**顶级小眉签大写（`01 THE ESSENTIALS`）；区块标题（`Dev tools`/`Environments`/`Tasks`/`Bootstrap`）、链接、命令行全部正常大小写。MiseDeck 当前把 uppercase 用在了区块标题（`REGISTRY`）、表头、徽标、按钮、loading 等远多于官网的位置——确实偏离血缘源头。

**裁决**: 用户拍板——**更改规则，标签回归正常写法**。`visual-language.md:63,68` 的 uppercase/tracking 规范需要修订（+ zh-CN 镜像），全站标签样式随之扫除。

**定稿（2026-09-07，用户选 A）**:

| 项 | 定稿 |
|---|---|
| 眉签 | **保留大写 + 宽字距**（`MISE / 工具`、`01 THE ESSENTIALS` 同款）——与官网逐点对齐 |
| 其余全部正常化 | 区块标题（`REGISTRY`→`Registry`）、表头、徽标文字、按钮、loading/empty/错误标签、`.toolbarHint` 等——删 `text-transform: uppercase`，tracking 回归正常字距 |
| 文档 | `visual-language.md:63,68`（+ zh-CN 镜像）修订：uppercase/tracking 只属于眉签一层；数据永不大写化（与 Issue 7 规则加固合并） |
| 与 Issue 7 的关系 | Issue 7 修"数据被大写"（bug），本条改"标签不大写"（规则修订 + 全站扫除）——两个独立 ticket，规则文档改动放本条 |
| 拟定 issue | 标题 ~"De-uppercase labels except the eyebrow: align with mise.jdx.dev (section titles, table headers, badges, buttons, loading/empty labels)"，labels: v1 |

---

## 收尾主动排查（2026-09-07，closing sweep）

**同类/相邻发现（已并入既有 ticket）**:
- commandHint 全页审计：概览页漏 `mise outdated` / `mise trust`；任务页漏 `mise tasks edit --path`（并入 Issue 2 的 ticket）
- Issue 3 tooltip 范围补漏：表格外 ~15 处原生 title（scope/trust 路径、诊断页状态值等，DirectoryPreview:536,626 / SettingsPage:286,466 / EnvPage:276,324,328,564 / TasksPage:690 / DoctorPage:190,197,246,375,377 / DirectoryIndicator:123）
- EnvPage 没用共享 `fixed` prop，自写 `.tableFixed`（EnvPage.module.css:146）——Issue 4 修 min-width 时统一

**新发现**:
- `TasksPage.tsx:316` 硬编码 `hide` 徽标绕过 i18n → 新 ticket
- `TasksPage.tsx:228` "在编辑器打开"直接 invoke `tasks_edit_path`（`mise tasks edit --path`）绕过执行面板 → **裁决（用户确认推荐 A）：上执行面板**，用户发起的 mise 调用一律走面板（ADR-0005 字面）

**检查干净的**: 无裸控件（全部带 className；无 select/textarea）；除上述边界外无页面级直接 invoke；home/env/settings/doctor/plugins 五页 commandHint 与实际命令一致；Badge `data` prop 修复无恙。

## 发布阶段（2026-09-07）

SPEC 父 issue + 9 个 ticket 拆分（用户已批准）：
T1 链接表单路径输入；T2 commandHint 全页审计；T3 Tooltip 原语；T4 fixed 表 min-width；T5 首页更新按钮；T6 诊断页激活检测；T7 数据大写化三处；T8 标签去大写化+规则文档；T9 tasks edit 上面板 + hide 进 i18n。依赖：仅 T7 → T8（都碰 ui-ux-rules.md）。
