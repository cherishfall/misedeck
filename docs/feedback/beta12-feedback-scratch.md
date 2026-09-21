# Beta12 Feedback Scratch

> 工作方式（沿用 beta10/beta11 定稿）：用户报一个，调查一个；调查时同时排查同类/关联问题（含「查过、无问题」的对照记录）；结论写入本文档标「待用户定稿」，用户确认后标「定稿」。定稿前不动代码、不发 GitHub。收集齐后发 spec issue（新周期新开 parent，不重开已关闭 ticket；beta11 SPEC #139 仍开着等 owner 视觉验证）+ 拆实现 ticket。
>
> **出票完成（2026-09-21）**：SPEC **#175**，tickets **#176–#182**（全部 ready-for-agent，无互相阻塞）——#176 工具栏两行+变体、#177 页面裁切、#178 添加工具重设计、#179 全局锚定 $HOME、#180 执行面板历史、#181 刷新微修、#182 Env 写路径校验。实现顺序建议：#179/#182 → #177 → #176 → #180 → #178 → #181。

## 背景

- beta12 已发布，owner 尚未做视觉验证；本周期从一轮全仓专业 review（8 个 ticket 已闭环）后紧接着开始。
- review 阶段遗留的未出票发现（已记录在案，不重复计入本周期）：`doctor.toolset.emptyBody`、`tasks.editForm.dependsHelp` 失实文案；mise tasks add 多行 run 上游限制。

## 收集中的 issue

### Issue 2 → #177 + #178【工具页：搜索即安装无浏览环节 + 页面左侧裁切无法恢复 + 添加工具流程重设计】三条一组

**来源**：用户报告（2026-09-21，附截图：添加栏输入 java、版本 latest、窗口默认 1200 CSS px）。原话：「我在添加工具搜个 java，竟然给我直接安装了 latest，而且页面显示不全，还会被遮住，也不能横向移动了。我想要的使用逻辑是：先搜索一个工具，然后查看未安装和已安装版本，如果当前有 use 版本显示在最前面，然后已安装版本可以浏览选择切换和删除，然后未安装版本可以浏览和安装使用，如果很多项则可以分页浏览，这个添加工具功能的整体区域可以一键收起和清空，并且功能区在工具表格的下方而不是上方」。

---

#### 2-a 「搜索即安装」是 #134 的显式设计，属规则空白而非实现偏差（随 2-c 重设计解决）

**调查结论**：

1. 当前「添加工具」栏（搜索输入 + 版本框 + 按钮）由 #134（commit `b82d58a`，2026-09-10，beta11）引入，**显式设计成一步式**：文件头注释原文 "pick a version (default `latest`), and Use runs `mise use <tool>@<version>` — install and activate in one step"（`ToolsPage.tsx:23-26`）。提交链路：空版本回退 `"latest"`（`:1045-1050`）→ `onUse` → `miseUseArgs`（`:174-178`）→ 目录模式 `mise use java@latest` / 全局模式 `mise use -g …`，**零确认零预览**。
2. 对照：同页删除类操作有 ConfirmDialog（ADR-0008），Upgrade 无确认是 product-logic.md:21「deliberate per-tool decision」有意取舍——**添加工具是全页唯一既改 config 又装文件却零确认的主操作**。
3. `docs/design` 全文 grep「pre-install / 预安装」零条文——规则空白；但 ADR-0007 明确把 pre-install checks 列为允许且鼓励的 GUI 层能力，AGENTS.md 原则 2 也点名。owner 的不满与原则层一致，重设计有依据。

---

#### 2-b 页面左侧裁切且无法横向滚动（实锤布局 bug，全 8 页同构，已实证根因）

**调查结论**（子代理用仓库真实 CSS 搭同构 DOM 复现，非推测）：

1. **撑宽链条**：`.toolsTable { min-width:1050px }`（`ToolsPage.module.css:52`）→ `.page`（flex 子项，`min-width:auto`=min-content ≈1102px）→ `.main`（flex 列容器，`overflow-x:hidden`，`PageShell.module.css:178-185`）静默裁切、无滚动条。`.page` 的 `margin:0 auto` 使 flex 不 stretch 而取 fit-content，**min-width 撑宽被页面容器而非表格自己的 `.scroller`（`Table.module.css:4-7`）承接**——后者永远没机会生效（ui-ux-rules:48 #90 pattern 落空）。工具页在默认 1200 窗口**必现**裁 ~113px（Use 按钮直接不可见）。
2. **「左侧」裁切的成因**：`overflow-x:hidden` 容器仍可被程序/焦点导航滚动；任何 scrollLeft>0（Tab 焦点、触控板手势、scrollIntoView）后左侧内容永久移出视口且无滚动条可滚回——「工」变「C具」、表格首列整列消失，与截图逐点吻合。
3. **波及面（同类排查，全 8 页同结构）**：ToolsPage 默认窗口即裁（阈值 ~1311px）；TasksPage/EnvPage/SettingsPage 在最小 900px 窗口分别裁 ~250/~190/~76px；其余页安全。
4. **修复方向**：`.page { min-width:0 }` 一行恢复 stretch 语义、让表格 scroller 接管（需验证 1200 居中不受影响）；`ui-ux-rules.md:62` 裁切条文补「页面容器不得承接表格 min-width 撑宽」（中英双语）——此类 bug 在宽窗口 review 下漏网 7 个 beta，必须补条文防再发。

**待用户定稿**：bug 确认即修，推荐按 4 修复。无分支选择。

**定稿（2026-09-21，用户确认）**：按 4 修复——`.page { min-width:0 }`（恢复 stretch、表格 scroller 接管）+ `ui-ux-rules.md:62` 补「页面容器不得承接表格 min-width 撑宽」条文（中英双语）。全 8 页同构一次修。

---

#### 2-c 添加工具流程重设计（owner 提案，可行性已验证，~70% 可复用现有件）

**owner 目标流程**：搜索工具名 → 版本三段视图：①在用版本最前 → ②已安装（可切换 use / 删除）→ ③未安装（可浏览 / 安装 / use）→ 分页 → 区域可一键收起+清空 → 区域位于工具表格**下方**。

**调查结论**：

1. **CLI 层零缺口**（mise 2026.9.12 实证）：`mise ls-remote <tool> --json` → `[{version, created_at}]`（java 3203 行/约 250KB，node 866，python 1073——客户端分页是刚需）；`mise ls --json` 单行含 `version/requested_version/install_path/source{type,path}/installed/active`，足以划分三段；`mise registry --json` 全量 1053 条前端 substring 过滤（现有 `ToolsPage.tsx:1001-1023` 先例）；use/install/uninstall/unuse 语义与封装先例完整。
2. **VersionCenter（`VersionCenter.tsx`）就是现成原型**：两段列表 + ls-remote 缓存键 + 失败重试 + 过滤 + 分页 + 页大小持久化，全可搬。Pagination/FloatingMenu/ConfirmDialog/SuccessBar/run-lock/trust guard/执行面板 background 模式全部现成。i18n 骨架：`tools.versionCenter.*`、`tools.addTool.*`、`tools.queries.pagination.*`。
3. **技术风险（实现时必须处理）**：
   - **版本排序比较器失效**：现有 `compareVersions`（`utils/versions.ts:9-20`）遇字母前缀（`graalvm-community-17.0.7`、`temurin-jre-21.0.0+35.0.LTS`——java 几乎全部）返回 0，即现有「版本降序」对 java 实际无效；三段排序必须换/补比较器（发行商前缀 + 数字段 + 元数据后缀）。
   - **「在用」判定**：`active` 字段与 `requested_version` 不恒等（请求 `latest` 解析后 version=27.0.0 ≠ requested）；且目录模式下 `mise ls --json` **混入全局 config 的工具**——严格「本目录在用」需按 `source.path` 过滤。
   - **ls-remote 冷调用数秒**（python 3.8s）→ 需 loading 态（VersionCenter 圆点先例）。
   - **别名**：ls-remote 输出无 `latest`/`lts` 行（mise 内部解析），浏览列表只有具体版本——`latest` 如何呈现需定（见 Q4）。
   - **文档冲突**：`ui-ux-rules.md:44` 明文「add-tool entry 是工具页**顶部**的 registry 搜索（#134）」——位置条款必须随重设计修订（中英双语）。
4. **去留决策点**：旧 AddToolEntry（顶部一行式）与行展开 VersionCenter（#133）与新区域的关系（见 Q1/Q2）。

**待用户定稿**（2026-09-21 用户已全部按推荐定稿）：

- **Q1**：删除旧顶部「添加工具」栏（b82d58a #134 一行式入口），全页唯一添加入口 = 表格下方新区域；`ui-ux-rules.md:44` 位置条文倒转（中英双语）。
- **Q2**：移除行展开 VersionCenter（#133），版本浏览统一收进新添加区（one rule one home）；`:39`（版本切换下拉条文）/`:40`（版本中心条文）随重写或删除。
- **Q3**：修版本比较器（字母前缀 + 数字段 + 元数据后缀），段内版本号降序（最新在前）；在用段恒排第一不受排序影响。
- **Q4**：未安装段顶部特殊 `latest` 行，标注解析到的具体版本（`latest → 27.0.0`）；其余全为具体版本。
- **Q5**：区域 = 带标题栏的 disclosure（同「高级」区形态），一键收起（仅会话内记忆不持久化）+ 清空按钮（重置搜索词与结果）；默认展开空态（仅搜索框，不自动加载）。
- 实现硬约束（调查 3，非决策项）：`active` 按版本号匹配不用字符串相等；目录模式「本目录在用」按 `source.path` 过滤全局混入；ls-remote 冷调用需 loading 态（圆点先例）；删除类操作保留 ConfirmDialog（ADR-0008）；所有命令仍走执行面板（ADR-0005）。

**定稿（2026-09-21，用户确认 Q1–Q5 全部按推荐）**。

---

### Issue 3 → #179 + #182【全局模式语义缺陷：读路径以进程 cwd 解析，五页同构；写路径按模式而非行来源定目标】严重 bug

**来源**：用户报告（2026-09-21，附截图：Env 页全局模式，红框标出 CARGO_HOME[来源=项目 mise.toml] 与 RUSTUP_HOME/RUSTUP_TOOLCHAIN[来源=当前目录·rust]）。原话：「我切换到全局模式，我还点了刷新，但是还是有非全局的环境变量显示在表格里面，这是个严重的bug吧」。

---

#### 3-a 根因：「Global」在 CLI 层没有对应物，app 用进程 cwd 近似（runner 层缺陷，非缓存/刷新问题）

**调查结论**（已实证复现）：

1. **读路径**：全局模式（`cwd: None`）时 runner 既不加 `-C` 也不设进程 cwd（`mise.rs:276-282`）→ mise 语义是「以进程 cwd 向上解析 config」。**dev 下 `tauri dev` 进程 cwd = 启动终端目录（仓库根）→ 仓库 mise.toml 的变量泄漏**；打包 app 从 Finder 启动 cwd=`/` 才碰巧只解析到全局 config。即：**owner 在本地 dev 运行必现，打包 beta12 碰巧正常**——同一二进制两种表现，本身就是不可辩护的。
2. **刷新无责**：缓存 key `["env","ls",cwd]` 区分模式，刷出来的数据本身就是错的。
3. **波及面（同类排查，逐页实证）**：Tools（`mise ls`/`outdated`，项目 config 激活的工具在全局模式显示 active，页头文案还承诺 "installed and active in Global mode"）、Tasks（`mise tasks ls`，机制同构）、DirectoryPreview（`config ls` 会列出进程 cwd 链上的项目 config）、Doctor（输出含 cwd 相关 config 段）——**五页同构**；Settings 是唯一 argv 区分模式的页面（`--local`）；Plugins 免疫。
4. **文档现状**：「Global 模式显示什么」无任何条文（architecture.md:17 只说「when set」传 -C；CONTEXT.md:46-48 只定义「未指向目录」）；唯一契约是页面文案「全局模式下解析出的环境变量」——**文案承诺与读路径行为不符即本 bug 的直接表述**。
5. **正确修法**：runner 层 `cwd: None` 时发 `-C $HOME`（Rust 侧取 home），语义 = mise 自己的 cwd 模型里 Global = 从 $HOME 解析，一次修五页；同步把「Global = 锚定 $HOME」立为条文（architecture.md + product-logic/ui-ux-rules，中英双语）。

#### 3-b 写路径同构错配：按模式而非行来源决定写入目标（高危假成功）

**调查结论**：

1. 行可编辑性只看来源分类（`isConfigSource` = project|global，`EnvPage.tsx:394-396`），不看当前模式；写入目标由模式决定（`cwd===null` → `set -g`/`unset -g`，`EnvPage.tsx:72-78`）。
2. 后果（实证）：全局模式对项目来源行 Edit → `mise set -g CARGO_HOME=…` 在全局 config 建**影子变量遮蔽项目值**，页面提示「已设置」；Remove → `mise unset -g` 对不存在的键假成功。**反向同构**：目录模式编辑 global 来源行 → 无 `-g` 写到项目文件制造遮蔽。
3. Settings 页已有防护先例（`unsetOutOfScope` 文案：「该设置定义在 {{source}}，不在当前写入范围内——移除不会生效」，zh-CN.json:431）；Env 页无对应物。
4. 修复后（3-a）全局模式不再出现项目来源行，但目录模式编辑 global 行的同构错配仍在 → 必须加行级 source 校验（禁用或确认）。

#### 3-c 待用户定稿

- **Q1（修复方向）**：runner 层 `-C $HOME` 统一锚定（推荐——一次修五页、CLI-faithful、与全部页头文案承诺一致）vs 逐页打补丁过滤（留同类残留，仅作 fallback 不推荐）。
- **Q2（全局模式表格内容）**：锚定 $HOME 后，工具注入行（GOBIN/GOROOT/JAVA_HOME）与继承行（PATH）在真实全局解析下天然存在。A：保留（推荐——「解析出的环境变量」文案即承诺解析视图；且这两类行本就无编辑/移除按钮）vs B：只显示全局 config 的 `[env]` 变量（管理视图，需改走 `mise config get --global env`，丢失解析值语义）。
- **Q3（写路径防护形态）**：行的 sourcePath 不属于当前写入范围时——A：移植 Settings 页模式，确认框内警示「该变量定义在 {{source}}，不在当前写入范围」（推荐，改动小、与既有先例一致）vs B：直接禁用编辑/移除按钮 + tooltip 说明。

**定稿（2026-09-21，用户确认 Q1–Q3 全部按推荐）**：

- Q1：runner 层统一锚定——`cwd: None` 时发 `-C $HOME`（Rust 侧 home），一次修 Env/Tools/Tasks/Preview/Doctor 五页；「Global = 从 $HOME 解析」写入 architecture.md:17 条文 + product-logic/ui-ux-rules 新条文（中英双语）。
- Q2：全局模式保留工具注入行与继承行（解析视图，页头文案承诺不变）。
- Q3：写路径移植 Settings 页 `unsetOutOfScope` 模式——行的 sourcePath 不在当前写入范围时，确认框内警示「该变量定义在 {{source}}，不在当前写入范围」（Env 页新增，i18n 双语新增 key）。

---

### Issue 4 → #180【执行面板历史条目：无关闭/清空入口 + 保留上限规则空白】

**来源**：用户报告（2026-09-21，附截图：执行面板顶部「4 条历史」chips：self-update / use -g java@latest / -C×2）。原话：「怎么突然可以保存多条命令来，而且多条命令还关不掉，保存最新的1到3条就够了吧，或者只展示最新的1条也行，还有如果多个的话，可以允许关掉或者清空吧」。

---

#### 4-a 多条历史是 beta11 #138 的有意设计，但「关闭/清空」是验收空白

**调查结论**：

1. **沿革**：commit `4241c13`（beta11，#138，并发执行改造）把单飞锁换成 `runs[] + activeRunId`，#138 正文明确写有「Cap the retained history (e.g. most recent N finished runs)」——多历史是有意设计非 bug；但验收只覆盖「能切换、能并存、failure 自动弹一次」，**没有覆盖单条关闭/清空**。
2. **「关不掉」机制**：`MAX_FINISHED_RUNS = 5`（`useExecution.ts:32`）只在新命令启动时 prune；reducer 的 Action 全集**没有任何 remove/clear**；面板「关闭」只设 `isOpen=false`，runs 原样保留，重开/failure 自动弹都原样回来。唯一能减少条数的方式是再跑 5 条新命令把旧的挤掉。
3. **规则空白**：`ui-ux-rules.md:82-88` Execution panel 小节 5 条条文无一涉及历史条数/单条关闭/清空；5 条上限只活在代码注释和 issue 正文里。#138 的并发可切换性是显式验收项——**运行中的条目必须始终可见可切换**（ADR-0005「面板是所有 mise 调用的唯一呈现面」的边界）， finished 条目才是裁剪对象。
4. **同类排查**：历史无第二呈现面（仅面板）、无持久化；SuccessBar 独立无耦合；run-lock 不读 runs 数组，移除条目不会误锁控件。实现风险已识别：(a) remove 必须保护 running 条目；(b) 移除 active 条目的回退行为；(c) failure 自动弹窗与已移除条目的交互（`:207-211` 注释前提会变）；(d) reducer 需补 remove/clear 的 node:test 用例。

**待用户定稿**：

- **Q1（保留策略）**：A：finished 上限 3 条 + running 不计入上限不可移除（推荐——兼顾回看与整洁；running 可见性是 #138 验收项+ADR-0005 边界）；B：finished 上限 1 条（最简，但并发运行时 finished 条被秒清，回看价值近零）；C：维持 5 条。
- **Q2（关闭/清空形态）**：A（推荐）：每个 finished 条目 chip 上加单条关闭按钮 + switcher 区加「清空」按钮（仅清 finished，running 不受清空影响）；B：只加「清空」不加单条关闭。均需补 i18n key（双语同 commit）+ `ui-ux-rules.md` Execution panel 小节补条文（中英双语，把上限值写死进条文，防再变成只活在代码注释里的规则）。

**定稿（2026-09-21，用户确认）**：

- Q1：finished 上限 **3 条**（运行中条目**可突破上限**、不计入、不可移除）；裁减只发生在新命令启动时（沿用现有 prune 时机）。
- Q2：每个 finished 条目 chip 加单条关闭按钮 + 历史区「清空」按钮（仅清 finished）；i18n 新增 key 双语同 commit；`ui-ux-rules.md` Execution panel 小节补条文（中英双语，上限值写死）。
- **owner 意图立条（新规则，随本 ticket 入 product-logic.md 执行面板段，中英双语）**：「并发执行不是性能/效率手段。并发的正当用途只有两类：①功能本身需要多条独立命令；②后台执行（background runs）。串行可以实现的场景不得并发。」——这是对 #138 并发改造之设计意图的原始陈述，防止后续把并发当优化乱用。

---

### Issue 5【首页复制按钮无反应（五处复制点同链路）+ 「高级」触发器不像按钮（全站唯一）】

**来源**：用户报告（2026-09-21，两张截图：Home RAW 展开后 JSON 块右上角「复制」；工具页底部「高级」纯文字触发器）。原话：「首页的复制按钮不生效了，还有工具页的高级一眼看过去不像可以点击的按钮，是不是样式上要改得合适些，注意要注重风格统一和谐？这两个在其他页面都查下吧」。

---

#### 5-a 复制无反应：共享 writeClipboard 的运行时拒写 + 失败静默设计（代码链路无断点，五处同病）

**调查结论**：

1. 全站 5 个复制点（Home RAW `HomePage.tsx:260`、Tooltip 内 `Tooltip.tsx:152`、Doctor 升级 `DoctorPage.tsx:391`、ActivationBanner ×2、执行面板复制命令）全部经同一 `utils/clipboard.ts:8-31 writeClipboard`：`navigator.clipboard.writeText` → execCommand 兜底 → 都失败返回 false。**handler、i18n、CSS 命中全部排查干净，beta12=master 零差异**——静态无可定位断点。
2. **根因判断（按可能性）**：① Tauri v2 WKWebView 下 `navigator.clipboard.writeText` 被拒写（已知品类问题）+ **失败完全静默**（`CopyButton.tsx:37` 失败直接 return，ActivationBanner 注释明言 silent by design）——症状与「点了没反应」逐字吻合，且五处同病；② 写成功但唯一反馈是 1.2 秒 12px 小字翻转，不可感知。
3. 全站无 Tauri clipboard 插件（package.json/Cargo.toml/capabilities 均无），「补权限」不成立。
4. **同类排查**：五处同链路，要么全好要么全坏；无第二类实现缺陷。
5. **修复方向**：CopyButton + ActivationBanner + ExecutionPanel 三处补失败瞬时反馈（新 i18n key 双语，如 `common.copyFailed`）+ 「复制失败不得静默」立条 ui-ux-rules（双语）；**同时把 writeClipboard 切到 `@tauri-apps/plugin-clipboard-manager`**（Rust 侧写，绕开 Web 权限栈；新依赖 + `default.json` capability 补 `clipboard-manager:allow-write`）——一处 util 改动五处受益，不依赖对 WKWebView 行为的猜测。
6. 待实证项（agent 侧禁跑应用，owner 本地验证）：切插件后点 RAW 复制确认；顺手点一处 Tooltip 复制做全站二分。

#### 5-b 「高级」触发器：bespoke 裸文字按钮，全站唯一不像按钮的 disclosure

**调查结论**：

1. 全站 disclosure 触发器 3 种形态：Home RAW / Preview config 查看 = 共享 Button ghost sm（带细边、hover 加深，像按钮 ✅）；Tools「高级」= **裸 `<button>` + `.advancedToggle`（无边框/底色/padding，dim 加粗文字）**（`ToolsPage.tsx:728-737` + `ToolsPage.module.css:439-453`）❌；行展开工具名 = 数据位 affordance（:40 规则背书，且 #178 将移除）。**「不像按钮」全站唯一实例，owner 投诉属实**；直接踩 `ui-ux-rules.md:77`「bespoke 复刻已有按钮样式是 bug」。
2. chevron 图形与既有裁决冲突（:40/:108/beta8/#100 均禁 disclosure 触发器带尖角），**推荐不加**——ghost 的边框 + hover 已提供可点击感。
3. **修复方向**：「高级」迁移共享 `<Button variant="ghost" size="sm" aria-expanded>`（与 Home RAW/Preview config 三处统一），删 `.advancedToggle`；规则立条（双语）：「展开/收起一块区域的触发器 = 共享 Button ghost + aria-expanded，不带 chevron」。**#178 新添加区已定稿「同高级区形态」（Q5）——本次统一后 #178 直接复用，一份修复两处受益**。

**待用户定稿**：

- Q1：5-a 按 5 修复（失败反馈 + 规则 + 切 Tauri clipboard 插件）？
- Q2：5-b 按 3 修复（ghost 统一 + 规则，不加 chevron）？

**定稿（2026-09-21，用户确认 Q1/Q2 全部按推荐）**：① 三处复制点补失败瞬时反馈（`common.copyFailed` 类新 key 双语）+ ui-ux-rules 立「复制失败不得静默」条文（双语）+ writeClipboard 切 `@tauri-apps/plugin-clipboard-manager`（新依赖 + capability `clipboard-manager:allow-write`）；② 「高级」迁移共享 Button ghost sm + aria-expanded，删 `.advancedToggle`，ui-ux-rules 立「disclosure 触发器 = 共享 Button ghost、不带 chevron」条文（双语）；owner 本地验证复制修复（RAW + 一处 Tooltip 二分）。

---

### Issue 6【Env 操作列「—」无操作理由不可发现（理由挂在来源徽标而非「—」本身）】→ #185

**来源**：用户报告（2026-09-21，截图：GOBIN/GOROOT/JAVA_HOME/PATH 操作列「—」）。原话：「不要简单显示个 - 线，要有无操作理由提示，为什么无操作，否则让人产生困惑」。

**调查结论**：理由 Tooltip 存在但挂错位置——`EnvPage.tsx:483-485` 的「—」是裸 dash；理由文案（`env.tooltip.tool`/`env.tooltip.default`）包在来源列徽标上（`EnvSourceCell` :425），与「—」隔两列，用户 hover dash 无反应；Tooltip 纯 hover 无焦点支持；规则 ui-ux-rules:36 的「typically on that row's source-badge Tooltip」口子正是漏洞。**同类排查**：全站唯一问题实例（Settings 页「—」已带 Tooltip `settings.tooltip.objectReadOnly` 是先例；Tools/AddToolSection 的「—」是 orphan 徽标包裹；其余「—」是数据缺失非操作列）。

**定稿（2026-09-21，用户指示+证据直接支撑）**：「—」本身包 Tooltip（复用/新增 dash 专用 key，Settings :444 同构）；ui-ux-rules:36 收紧为「理由必须挂在「—」自身的 Tooltip 上，徽标 tooltip 保留为补充」（中英双语）。

---

### Issue 7【Env 添加变量名「（大写下划线）」提示是 mise 并无要求的格式断言】→ #186

**来源**：用户报告（2026-09-21）。原话：「添加环境变量的提示语里有大写下划线，有必要的理由吗，如果有的话，在添加的时候就要校验是否符合格式，如果没必要的话，提示语就改一下」。

**调查结论**（mise 2026.9.12 实证）：mise 对变量名**零格式要求**——小写 `foo=1` 完全正常导出可用；数字开头/横线/空格/点/空名也照收（其中部分在 shell source 路径下产生 invalid identifier 报错——属 mise 上游「收但不拒绝」缺口，非格式要求）。按 ui-ux-rules:41「submit-and-catch 不做提交前校验」既有规则：**改文案、不加校验**——en `Key (UPPER_SNAKE)` → `Key`，zh `变量名（大写下划线）` → `变量名`（与相邻 值/value 风格一致）。**同类排查**：全站表单 placeholder × 校验逐一核对，仅 `env.namePlaceholder` 一处同病（Tools/Plugins/Settings/Tasks/AddToolSection 的 placeholder 均为真实举例或形态示例，无格式断言）。

**定稿（2026-09-21，用户条件指示+实证支撑「没必要」）**：改文案去格式暗示；不加校验；无其它同类项。

---

### Issue 1 → #176【Chrome 工具栏：「在终端中打开」按钮样式不一致 + 长路径时按钮组掉行】两条一组

**来源**：用户报告（2026-09-21，附两张截图：zh/en 同窗口宽度的 Home 页工具栏）。原话：「这个在终端中打开的样式为什么和其他的不一样，而且切换到英文模式下，路径太长导致工具栏按钮在下一行，如果必须要换，也是工具栏保持原来的位置，然后路径在下面且可以换行吧，毕竟路径确实可能很长」。

---

#### 1-a 「Open in terminal」是工具栏里唯一的 ghost 按钮（显式设计判断，非 bug）

**调查结论**：

1. 目录模式 5 个控件全部走共享 `Button`（`misedeck/src/components/DirectoryIndicator/DirectoryIndicator.tsx:142-234`），但 variant 分配为：Global/Recent/Refresh = `secondary`，Choose another directory = `primary`，**Open in terminal = `ghost`**（`:151-158`）。ghost 是透明底 + 细边 + 暗字（`Button.module.css:84-94`），在 `--hull-soft` 工具栏底色上明显弱一档，用户感知的「不一致」属实。
2. **沿革**：beta11 之前它是 bespoke 裸按钮，#169（commit `e5765d8`）按「bespoke re-implementation is a bug」（`ui-ux-rules.md:77`）迁到共享 Button，并**显式选择 ghost**，理由是映射表里 ghost 的例子含「open in editor」类低频动作（beta11 scratch:97,102）。
3. 对照现行规则：ghost = "Dismissive or low-frequency"（`ui-ux-rules.md:75`）。「在终端中打开」是不是「open in editor 类低频动作」是 beta11 的类比解读，无条文强制；secondary = "Routine actions" 同样说得通。这是设计判断，不是违规。
4. **同类排查（查过）**：全仓 `variant="ghost"` 17 处，其余均语义自洽（取消/关闭、disclosure、分页器、低优先级导航）；全局模式工具栏（eyebrow + Refresh + Choose）无 ghost、无 bespoke；工具栏其余 4 按钮无同类隐患。DirectoryIndicator 是全仓唯一「同一实底按钮组里混入一个 ghost」的案例。

**定稿（2026-09-21，用户确认 A）**：改 `secondary`；「同组按钮 variant 必须一致（除非有显式层级理由）」补进 `ui-ux-rules.md`（双语）。

**追加待定（同一按钮的去留）**：用户提出「『在终端中打开』有必要留吗，我没想好」。调查补充：该按钮是产品原则 #1（GUI 是 CLI 的图形版，应引导用户走向 CLI）最直接的载体——从 GUI 一键落到已激活 mise 的 shell；全局模式下工具栏没有它（仅 Refresh + Choose）。若移除，涉及 i18n key 清理与两模式工具栏对称性，是独立决策。

➡️ 推荐**保留**（原则 #1 的核心 affordance，且属 ADR-0007 允许的 GUI 层能力）；若 owner 倾向精简 chrome，再单独立项移除。

**定稿（2026-09-21，用户确认）**：改 `secondary`；「同组按钮 variant 必须一致（除非有显式层级理由）」补进 `ui-ux-rules.md`（双语）；「在终端中打开」**保留**。

---

#### 1-b 长路径时整个按钮组掉第二行（beta11 规则的修订）

**调查结论**：

1. beta11 修复（#142）后结构：`.row` flex-wrap（`DirectoryIndicator.module.css:17-23`），三个 flex item = eyebrow → Tooltip 包裹的 `.path`（ellipsis 截断，`:42-51`）→ `.actions`（`flex:none` 不可拆组，`:53-59`）。
2. **掉行机制**：flex-wrap 断行判断用 max-content 尺寸，路径长时「eyebrow + 全路径 + 按钮组固有宽 > 行宽」→ 整个 `.actions` 组掉第二行（右对齐）。en 按钮组约 570px vs zh 约 350px，所以同窗口宽英文掉行、中文不掉。beta11 方案 A 定的就是「actions 区窄窗换行」，行为符合当时定稿——用户现在要求倒转：按钮永驻第一行，路径让位。
3. **实现约束（关键技术事实）**：纯 CSS flex-wrap 做不到「短路径留第一行、长路径才掉第二行」——flex-wrap 只搬整个 item，不按 shrink 后尺寸重判；要条件两行只能 JS 测量/容器查询，不推荐。可行方案是**恒两行**：`.actions` 固定第一行右端（`margin-left:auto`），路径独占第二行整宽、改 `overflow-wrap:anywhere` 自然换行（路径无空格，必须 anywhere 才能断）、去掉 ellipsis。短路径也占两行是代价。
4. Tooltip 可保留（hover 全文+复制，合规加分）；beta6「表格内不换行」不冲突（那是表格规则）。
5. **规则冲突需修订**（中英双语同步）：`ui-ux-rules.md:62` Chrome 条「the toolbar path ellipsizes; toolbar actions wrap to a second line on narrow windows（beta11, #142）」整条倒转；且 `ui-ux-rules.md:48`「长数据 ellipsis 是单一默认」在工具栏路径这个 chrome 位要开豁免，建议把工具栏路径从 ellipsis 默认里显式摘出写成独立一句，避免再撞。

**待用户定稿**（2026-09-21 用户已缩小范围，二选一均可）：

- A：**恒两行**——按钮组永驻第一行右端；路径独占第二行整宽；用户明确「不换行也行」→ 第二行仍用 ellipsis 截断 + Tooltip 全文/复制（现状保留）；短路径也占两行。
- B：**恒一行**——去掉 `.row` 的 flex-wrap，路径 `flex:1; min-width:0` 收缩 + ellipsis + Tooltip；按钮永不掉行。
  - ⚠️ 技术事实（B 的风险）：窗口最小 900px + 侧栏展开 + 英文时，eyebrow(~150px) + 按钮组(~570px) 固有宽已超过内容区(~570px)，纯 CSS 一行排不下会溢出；flex-wrap 无法「先收缩路径、真放不下才换行」（换行判断用 max-content，这正是 beta11 掉行的根因）。即 B 在极端窄窗下要么溢出、要么仍需 beta11 式整组掉行兜底。
  - A 无任何溢出角落案例，且路径可见宽度最大。

**定稿（2026-09-21，用户确认 A）**：恒两行——按钮组永驻第一行右端；路径独占第二行整宽、不换行（ellipsis 截断 + Tooltip 全文/复制保留现状）；`.row` 去掉 flex-wrap 掉行机制；`ui-ux-rules.md:62` Chrome 条倒转（中英双语），并给 `ui-ux-rules.md:48` ellipsis 规则的工具栏路径位写显式豁免（路径在第二行展示、允许 truncate + hover 全文）。

**实现要求补充（2026-09-21，用户追加）**：两行形态在统一风格（visual-language tokens）下做美观—— eyebrow 行与路径行的层级、间距、分隔需按设计系统处理，不得是粗暴折行；实现后属「需 owner 视觉确认」项。

---

**定稿**：待 owner 确认 1-a、1-b 选项后填写。

## 已排除项（查过、无问题 / owner 裁决不动）

1. **工具栏「刷新」按钮（owner 怀疑已失效，2026-09-21 查证：有用，保留）**：它不是摆设——点击执行当前页注册的失效回调（`usePageRefresh`，`pageRefresh.tsx:40-53`），8 页全部注册、覆盖面完整（Env 4 key、DirectoryPreview 5 key、其余各页全量）；全应用**没有任何页内刷新按钮**（beta8 #98 刻意收编进工具栏，规则 `ui-ux-rules.md:94`「页面和区块内不再各自放刷新按钮」），移除它=全应用零刷新入口且违规。owner 的怀疑可能源自 #130 修复前（9/10 前）按钮确实从未渲染——现已可用。顺手微修两项（出票时挂靠）：① `pageRefresh.tsx:8` 头注释漂移（plugins 的 registry 表 #136 已删，注释未更新）；② Tools 页刷新回调可补 `["registry",cwd]` 失效（registry 基本静态，非阻塞）。
