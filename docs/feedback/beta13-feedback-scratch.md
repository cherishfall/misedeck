# Beta13 Feedback Scratch

> 工作方式（沿用 beta10–beta12 定稿）：用户报一个，调查一个；调查时同时排查同类/关联问题（含「查过、无问题」的对照记录）；结论写入本文档标「待用户定稿」，用户确认后标「定稿」。定稿前不动代码、不发 GitHub。收集齐后发 spec issue（新周期新开 parent，不重开已关闭 ticket）+ 拆实现 ticket。
>
> **出票完成（2026-09-23）**：SPEC **#187**，tickets **#188–#191**（全部 ready-for-agent；#189 Blocked by #188）——#188 版本管理区重设计、#189 主表改造、#190 规则文档修订、#191 命令回显终端视角化。实现顺序：#188 → #189，#190/#191 可并行。Issue 1–4 七轮对话全部定稿。
>
> 周期 bookkeeping（2026-09-22）：beta11 SPEC #139、beta12 SPEC #175 均已在 owner 完成 beta13 视觉验证后关闭，评论留档。beta13 review 新发现问题在本周期承接。

## 背景

- beta13 已发布，owner 已完成 review（2026-09-22）：「还是有问题，问题主要还是出现在工具页面」。
- beta12 周期已闭环：tickets #176–#182 全部 CLOSED，SPEC #175 已关闭。
- review 阶段遗留的未出票发现（若与本期报告相关则重新调查，否则不重复计入）。

## 收集中的 issue

### Issue 1【添加工具区域：标题名不副实 + 过滤栏双清除按钮 + 术语/分区/中译未定稿】（含 4 个子项）

**来源**：用户报告（2026-09-22，附图 1，zh-CN 界面，搜索 java）。

**CLI 语义基线（2026-09-22 `mise --help` 实证）**：
- `mise use` = 安装缺失版本 + 写入 config（一步激活）。
- `mise unuse` = 从 config 移除请求 + prune 无引用安装（`--no-prune` 可保留文件）。
- `mise uninstall` = 只删安装文件，不动 config；`--all` 删全部版本。
- `mise install` = 只装不上 PATH（不写 config）。

---

#### 1-a 区域标题「添加工具」名不副实

**调查结论**：区域组件 `AddToolSection.tsx`（挂载于 `ToolsPage.tsx:627`），标题键 `tools.addTool.title` = "Add a tool"/「添加工具」（`en.json:119`），继承自已退役的顶部 #134 一行式入口。#178 重设计后区域内唯一含 install 语义的按钮是「仅安装」(`tools.actions.install`)，区域实际职能 = 按工具浏览版本并 use/install/uninstall——「添加」只是其中一环。另有 `tools.empty.body`、`tools.tooltip.singleVersion` 文案仍按名引用「Add a tool」。

#### 1-b 过滤栏双「清除」按钮

**调查结论**：无原生 input clear（全仓无 `type="search"`）。两个清除是：
1. `TableFilter` 内置清除（`TableFilter.tsx:37-46`，`value.length>0` 时出现，视觉上贴着输入框，像原生清除）——全仓 Tools/Env/Tasks/Settings 工具栏通用件；
2. `AddToolSection.tsx:516-524` 区域级 ghost 清除按钮（beta12 Q5 owner 定的「清空搜索词与结果」，`onClear` `:125-131` 重置搜索草稿+选中工具+过滤+两个分页器），与过滤输入框并排。

typing 过滤词 → 两个「清除」同时出现，作用域不同（仅清过滤 vs 全重置）、标签相同、位置并排——地狱组合实锤。beta12 Q5 的「清空」决策本身没错，落地位置紧邻过滤器造成碰撞。

#### 1-c use/unuse/install/uninstall 中译 + 四动词与三段分区的映射（owner 未定稿）

现状：Use=使用、Uninstall=删除此版本（添加区按版本）/卸载（主表按工具）、Unuse=卸载、Install only=仅安装。问题：`卸载` 同时承载了 unuse（摘配置+prune）和 uninstall（删文件）两个不同语义；unuse 的准确中译（use 的逆操作）没有着落。分区标题 在用/已安装/未安装 对应 `mise ls`（active vs installed）与 `ls-remote` 的概念，语义准确，是否保留待 owner 定。

---

**同类排查记录**：
- 双清除模式：全仓仅此 1 处（TableFilter 其余 4 页均独立使用，无并列 Clear）；ExecutionPanel 的 Clear 是执行历史清空，无输入框关联。干净。
- i18n：该区域字符串全整句键、`{{tool}}` 插值、双语镜像齐全，无拼接问题。干净。
- product-logic.md 对本区命名无条文（grep 无命中）；ui-ux-rules.md:39/:44 引用 #178 区域时称「Add a tool section」，标题改名后这两处引用需同步。

**待用户定稿**：Q2 标题命名 / Q3 双清除处理 / Q5 中译方案 / Q6 分区标题去留——见对话轮次（2026-09-22）。

---

### Issue 2【主表「Unuse」按钮在 orphan 分支实际运行 `mise uninstall --all`——标签与命令不符】严重

**来源**：用户报告（2026-09-22，附图 2，en 界面，Global 模式，ant 行「Unuse」确认框显示 `mise -C $HOME uninstall --all ant`）。原话：「按钮叫 unuse，但是命令里明显用的是 uninstall，这个是重大稳定（事故），严重违法了原则」。

**调查结论**：
1. 按钮 `RowActions`（`ToolsPage.tsx:874-881`，danger 变体，键 `tools.actions.unuse`），确认框 `:674-730`。命令构造 `miseUnuseArgs`（`:153-155`）：`orphan ? ["uninstall","--all",tool] : ["unuse",tool]`；orphan 判定 `:352`（`requestedVersion == null`）。截图恰为 orphan + Global 路径，逐字吻合。
2. **非 orphan 分支标签与命令一致**（`mise unuse` 官方语义 = 摘配置 + prune）。**orphan 分支不一致**：按钮/标题/确认键（`:703-707` 复用 `tools.actions.unuse`）全部说 Unuse，实际跑 `uninstall --all`（删光所有版本）。对话框首句「removes the tool from the Config file」对 orphan **事实不成立**（无配置可摘），只有 body 里的 orphan 从句是对的；标题不随 orphan 变化。
3. **这是 ADR-0008 的明文决策，不是实现偏差**：`docs/adr/0008-tool-removal-is-unuse-not-uninstall.md:17` 原话决定 orphan 时跑 `uninstall --all` 且「button copy does not change; the confirmation dialog shows the exact argv either way」。ADR 自己的前提（`:19`「a label/command mismatch would break that promise」）恰被 orphan 分支违反。另 ui-ux-rules.md:104 明文「Never pair the label 卸载 with `mise uninstall`——orphan 分支 zh 标签「卸载」配 `uninstall --all`，规则被自家 ADR 违反。
4. 结论：owner 报告是对 ADR-0008 orphan 决策的合法挑战。修复 = 按分支换标签/标题/确认键 + 拆 body 文案，并修订 ADR-0008（双语文档同步）。

**同类排查（标签 vs 命令词汇表，全仓）**：主表四动词映射除 orphan 分支外全对 ADR-0008；Plugins「Uninstall」→`mise plugins uninstall` 一致；Tasks Run/Edit、Settings Unset 一致。**1 个边界发现**：Env 页「Remove」（`env.removeButton`）跑 `mise unset`（`EnvPage.tsx:77`）——标签非 CLI 动词但三处一致、`unset` 仅动配置，属有意 plain-English 处理，待 owner 裁是否统一为 Unset（低风险，可同周期顺手或单独立票）。

**待用户定稿**：Q1 修复方向——见对话轮次（2026-09-22）。

---

### Issue 3【三段分区操作列按钮风格不统一、排版不齐】

**来源**：用户报告（2026-09-22，附图 3，en 界面，搜索 go）。原话：「三个操作列的按钮都风格不统一，看着不太美观和谐统一，我想要统一一点，尽量排版上也对齐均衡一些」。

**调查结论**（变体定义 `Button.tsx:18`：`primary|secondary|ghost|danger`；规则 `ui-ux-rules.md:71-76` 变体表 + `:80` 组内一致条款）：

| 分区 | 现状 | 证据 |
|---|---|---|
| In use | 单个**禁用 danger**「Uninstall」（0.55 透明度的褪红） | `AddToolSection.tsx:352-365` |
| Installed | primary「Use」+ danger「Uninstall」 | `:397-413` |
| Not installed | primary「Use」+ secondary「Install only」 | `:466-483` |

1. **无硬编码 token**，颜色全走 `var(--…)`，干净。
2. 变体语义本身**符合** `:71-76` 变体表（uninstall∈danger 示例、install∈primary 示例——「仅安装」render secondary 是组内层级让位，`:80` 允许）。真正的问题：
   - **同位置槽位跨分区变色**：第二槽在 Installed 是 danger（红，视觉抢眼）、在 Not installed 是 neutral secondary——同一语义位置的按钮颜色含义漂移；
   - **在用分区唯一控件是永不可用 danger**（褪红）， alarm 色常驻但永不触发；
   - **三表操作列 x 位置不对齐**（截图实证：In use/Installed 的 Actions 在 ~1410px，Not installed 的 Actions 在 ~1090px——未安装表列模板是 Version+Created+Actions，与前两表 Version+Requested+Source+Actions 不同，Actions 落点偏移）——owner 说的「排版对齐均衡」主要指此。
3. 主表对照：secondary Upgrade + danger Unuse；Env secondary+danger；Settings secondary+danger/禁用 danger；Tasks **primary+secondary+ghost 三变体同组**（`TasksPage.tsx:488-505`，最松的一例，记录待议）。

**同类排查**：各页操作列混变体均为 `:80` 层级逃逸口的既有户型；本区的缺陷类是跨分区槽位漂移 + 列不对齐，属新问题。若 owner 定方案，应把「跨分区同语义槽位同变体家族 + 操作列网格对齐」codify 进 ui-ux-rules.md（中英双语，one rule one home）。

**待用户定稿**：Q4 变体方案 + 禁用态变体 + 对齐方式——见对话轮次（2026-09-22）。

## 定稿记录（2026-09-22 第一轮对话）

- **Q1（Issue 2）定稿**：按分支切换标签/标题/确认键——非 orphan 保持 Unuse/取消使用（`mise unuse`），orphan 改为 Uninstall/卸载（`mise uninstall --all`）；body 拆两条（现有首句对 orphan 事实不成立）；修订 ADR-0008 及其在 ui-ux-rules.md 的引用条文（中英/双语文档同步）。
- **Q2（区域标题）**：owner 提议「工具管理」，调查后 agent 推荐维持「版本管理」——区域内全部操作均为版本作用域（use/install/uninstall 都带 `@version`），工具级操作（unuse 整工具、upgrade）在主表；「工具管理」与整页职能重名且过度承诺。**待 owner 终裁**。
- **Q3（双清除）定稿**：单一清除按钮。TableFilter 内置清除在本区域隐藏（加 prop，不动四页通用行为），过滤框旁仅留一个「清除」（`common.clear`），点击全重置（搜索草稿 + 选中工具 + 过滤词 + 两个分页器）——beta12 Q5 的「一键清空」意图保留，双按钮消灭。
- **Q4（变体）定稿**：语义变体不变（Use=primary、uninstall=danger、install=secondary）；在用区禁用按钮改 secondary 禁用态（不再常驻褪红）；三表操作列统一 grid 列模板，Actions 对齐同一 x。
- **Q5（中译+解释弹窗）定稿**：use=使用、unuse=取消使用、install=安装（en 由 "Install only" 改 "Install"）、uninstall=卸载（按版本处「卸载此版本」）。实查（agent-73）：添加区 Use/Install 现状**无确认弹窗**，直接执行——本期为这两个操作新建解释性 ConfirmDialog（精确命令回显，ADR-0005 不变）；unuse/uninstall 弹窗按 Q1 拆分修订。弹窗文案初稿如下，owner 授权 agent 起草、可否决。
- **Q6 定稿**：分区标题 在用/已安装/未安装 保留（对应 `mise ls` active/installed 与 ls-remote 概念）。
- **插件页核查（owner 要求一并改）**：插件页自 #136 起已无 registry 搜索按钮（浏览安装职能移交工具页）；唯一添加入口是「安装插件」/ "Install plugin" 表单（仅自定义 git-URL 插件安装，名实相符，行级仅 Uninstall 危险操作带确认）——**无需改名**，owner 记忆中的搜索按钮已不存在。
- **待 owner 终裁**：①区域标题（版本管理 vs 工具管理）；②三段分区操作映射提案（见下）。

### 四个动词解释弹窗文案初稿（en / zh-CN，均含精确命令回显）

| 操作 | title | body |
|---|---|---|
| Use | Use {{tool}}@{{version}}? / 使用 {{tool}}@{{version}}？ | "If this version is not installed yet, it is installed first; the version is then written to the config file and activated. If it is already installed, the config simply switches to it." / 「若该版本尚未安装，会先安装；随后将该版本写入配置并激活。若已安装，则配置直接切换到该版本。」 |
| Install | Install {{tool}}@{{version}}? / 安装 {{tool}}@{{version}}？ | "Installs this version only. The config file is not touched, so the tool will not be on PATH unless a config already requests this version." / 「仅安装该版本，不修改配置文件；除非已有配置请求该版本，否则安装后不会加入 PATH。」 |
| Uninstall（按版本） | Uninstall {{tool}}@{{version}}? / 卸载 {{tool}}@{{version}}？ | "Deletes this version's files only. Config files are not modified; if a config still requests this version, it is reinstalled on next use." / 「仅删除该版本的安装文件，不修改配置；若配置仍请求该版本，下次使用时会重新安装。」 |
| Unuse（非 orphan） | Unuse {{tool}}? / 取消使用 {{tool}}？ | "Removes this tool's request from the config file, and prunes installations that no config references any more." / 「从配置文件移除该工具的请求，并清理不再被任何配置引用的安装。」 |
| Unuse（orphan） | Uninstall {{tool}}? / 卸载 {{tool}}？ | "No config file requests this tool. This deletes every installed version of it. This cannot be undone." / 「没有任何配置文件请求该工具。此操作将删除其全部已安装版本，不可撤销。」 |

### 三段分区操作映射提案（待 owner 终裁）

| 分区 | 操作 | 命令 | 变体 |
|---|---|---|---|
| 在用 | 取消使用 | `mise unuse [-g] <tool>` | danger |
| 在用 | 卸载此版本（禁用 + tooltip） | —（先切走/取消使用） | secondary 禁用 |
| 已安装 | 使用 | `mise use [-g] <tool>@<v>` | primary |
| 已安装 | 卸载此版本 | `mise uninstall <tool>@<v>` | danger |
| 未安装 | 使用 | `mise use [-g] <tool>@<v>` | primary |
| 未安装 | 安装 | `mise install <tool>@<v>` | secondary |

设计逻辑：每个动词恰好有归宿——use 同命令同标签出现在「已安装 + 未安装」（语境由弹窗解释差异）；install 只在未安装；uninstall（按版本）在「在用（禁用）+ 已安装」；unuse（整工具级）只在在用。在用区「卸载此版本」保持禁用 + 原 tooltip（「先切换到其他版本才能删除此版本」）。

## 定稿记录（2026-09-23 第二轮对话）

- **Q2 定稿**：区域标题 = 「版本管理」/ "Manage versions"（owner 终裁，否掉「工具管理」）。级联：`ui-ux-rules.md:39/:44` 的 "Add a tool section" 引用、`tools.empty.body`、`tools.tooltip.singleVersion` 同步改（中英双语）。
- **Q3 定稿**：单一「清除」按钮（全重置）；TableFilter 内置清除在本区域隐藏（加 prop）。
- **Q7/Q8 被 Q6 取代**（见下）。
- **插件页核查结论（owner 指定检查）**：`plugins.installedEmpty` 空态（zh「大多数工具根本不需要插件——去工具页搜索即可安装…」+「搜索工具」按钮 → `navigate("/tools")`，`PluginsPage.tsx:242`；en "search the Tools page to install one" + "Search tools"）。#178 后工具页搜索仍在（版本管理区域默认展开、仅搜索框的空态），**表述仍然成立，无需修改**。
- **Q6（owner 结构重设计，取代 Q8 映射提案）**：主表操作列只保留**一个**「版本管理」按钮——点击后下方版本管理区域展开并直接搜索该工具，引导用户在其中完成全部版本操作；分区操作：在用 = unuse + uninstall，已安装 = use + uninstall，未安装 = use + install。**连带消解 Issue 2 的 orphan 标签问题**：unuse 只在「在用」区可达（必有配置请求），orphan 分支结构性消失；orphan 工具的出口改为在用空态的「卸载全部版本」（`uninstall --all`，标签=命令）。ADR-0008 仍需修订（其 orphan 分支决策被本结构取代）。
- **Q5 重写版弹窗文案**（依据 mise 官方文档 [use](https://mise.jdx.dev/cli/use.html)/[unuse](https://mise.jdx.dev/cli/unuse.html)/[install](https://mise.jdx.dev/cli/install.html)/[uninstall](https://mise.jdx.dev/cli/uninstall.html) 及 `mise --help` 原文，取代第一版）：

| 操作 | title (en/zh) | body (en/zh) |
|---|---|---|
| Use | Use {{tool}}@{{version}}? / 使用 {{tool}}@{{version}}？ | "Installs the version if it is missing, then records the request in the config file so the tool is active in this scope. If the version is already installed, only the config request changes." / 「若该版本尚未安装，会先安装；随后将请求写入配置文件，使该工具在本配置范围内生效。若已安装，则仅改变配置请求。」 |
| Install | Install {{tool}}@{{version}}? / 安装 {{tool}}@{{version}}？ | "Installs this version only and does not modify the config file; a tool that is not configured will not be on PATH." / 「仅安装该版本，不修改配置文件；未被配置的工具不会加入 PATH。」 |
| Uninstall（按版本） | Uninstall {{tool}}@{{version}}? / 卸载 {{tool}}@{{version}}？ | "Removes only this version's installation and does not modify any config file. If a config still requests this version, it is reinstalled the next time it is needed." / 「仅删除该版本的安装文件，不修改任何配置文件；若配置仍请求该版本，下次需要时会重新安装。」 |
| Unuse | Unuse {{tool}}? / 取消使用 {{tool}}？ | "Removes this tool's request from the config file and prunes installations that no remaining config references." / 「从配置文件移除该工具的请求，并清理不再被任何配置引用的安装。」 |
| 卸载全部版本（orphan 出口，新增） | Uninstall all versions of {{tool}}? / 卸载 {{tool}} 的全部版本？ | "No config file requests this tool. This deletes every installed version of it and cannot be undone." / 「没有任何配置文件请求该工具。此操作将删除其全部已安装版本，不可撤销。」 |

- **Q6 细化待 owner 终裁**（agent 提案，对话轮次 2026-09-23）：
  - 升级（Upgrade）去向：主表的 Upgrade 按钮随重设计移除，推荐放到**在用区标题行右侧**（`mise upgrade` 是请求级操作，不与版本级行操作混排），仅在该工具可升级时出现。
  - orphan 出口形态：「在用」空态（无当前范围请求时）显示说明 + 「卸载全部版本」danger 按钮（有已安装版本时可用）。
  - 主表「版本管理」按钮：ghost 变体（导航/展开性质，不做直接变更）；行为 = 展开区域（若收起）+ 填入工具名 + 滚动到区域。
  - 实现注意（非决策项）：在用区「卸载此版本」按 Q6 启用（原硬编码禁用 `:358` 移除，tooltip `activeUninstallTooltip` 退役）；但「已请求未安装」的行该按钮按行禁用（磁盘无文件可删）；在用区两操作均为 danger（都属 destructive，符合变体表）；目录模式下「在用」仍按 beta12 约束以 `source.path` 过滤全局混入，空态文案需兼容「真 orphan」与「仅其他范围请求」两种情形。

## 定稿记录（2026-09-23 第三轮对话 — Issue 1/2/3 全部定稿）

- **Q5 终版文案（v3，白话版）**：owner 否决 v2 的「配置请求/写入配置/PATH」等术语腔，要求贴近 `mise --help` 的朴素表述。终版（zh 力求口语准确，en 贴近官方原文）：

| 操作 | title (en/zh) | body (en/zh) |
|---|---|---|
| Use | Use {{tool}}@{{version}}? / 使用 {{tool}}@{{version}}？ | "Installs this version if it is missing, then adds it to the config file so the tool is used in this scope." / 「如果没装这个版本，会先安装；然后把它写进配置文件，在这个范围内直接使用。」 |
| Install | Install {{tool}}@{{version}}? / 安装 {{tool}}@{{version}}？ | "Installs this version only. The config file is not changed, so the tool will not be on PATH unless a config requests it." / 「只安装这个版本，不改配置文件；没写进配置的工具，不能在命令行里直接使用。」 |
| Uninstall | Uninstall {{tool}}@{{version}}? / 卸载 {{tool}}@{{version}}？ | "Removes only this version's files. The config file is not changed — if it still asks for this version, the version is reinstalled the next time it is needed." / 「只删除这个版本的安装文件，不改配置文件；配置里还要这个版本的话，下次使用时会重新安装。」 |
| Unuse | Unuse {{tool}}? / 取消使用 {{tool}}？ | "Removes this tool from the config file; installations no longer needed are deleted as well." / 「把这个工具从配置文件里移除；不再被需要的安装文件会一起删掉。」 |
| Upgrade（新增） | Upgrade {{tool}}? / 升级 {{tool}}？ | "Upgrades this tool to the latest version allowed by its config entry and installs it." / 「在配置文件所写的范围内，把这个工具升级到最新的可用版本并安装。」 |

- **批量操作禁令（owner 明确，产品级决策）**：GUI 不提供任何批量安装/卸载/删除全部——**无「卸载全部版本」，`uninstall --all` 不进入 GUI**；orphan 工具在「已安装」区逐版本卸载。连带：第二轮的「卸载全部版本」dialog 与在用空态按钮作废；**Issue 2 进一步简化**——unuse 无 orphan 分支（只在用在区可达、必有请求），标签=命令全局成立，ADR-0008 修订方向改为「GUI 有意不暴露批量删除；orphan 逐版本清理」（ADR 核心原则「unuse 标签只配 unuse 命令；卸载标签绝不配 uninstall」反而被本结构完全满足）。
- **Q6/Q9 升级交互定稿（owner 授权 agent 按专业判断）**：
  - 主表：操作列**只有** ghost「版本管理」/ "Manage versions" 按钮（点击 = 展开区域 + 填入工具名 + 滚动到位）；可升级信息以纯提示呈现——Version 列旁小 chip「可升级 · {{latest}}」（视觉走 visual-language 的 muted/chip 规范，不做按钮）。
  - 版本管理区：「在用」区标题行右侧，可升级时出现「新版本 {{latest}} 可用」+「升级」secondary 按钮 → `mise upgrade <tool>`（**默认不带 --bump**：官方默认在配置所写范围内升级（node@20 → 最新 20.x），符合 owner「开发工具求稳不追新」哲学；现有 GUI 用的 `--bump`（跨大版本）随之退役——此变更已在对话中知会 owner）。
  - 无在用请求时（orphan/他处请求）不出现升级（upgrade 作用于请求，无可升级对象）。
- **命名统一（owner 强调）**：按钮标签一律裸动词——使用/取消使用/安装/卸载，不带「此版本/当前版本」等后缀（`tools.actions.uninstall` zh「删除此版本」→「卸载」；en "Install only"→"Install"）；`activeUninstallTooltip` 随在用卸载启用而退役（仅「已请求未安装」的行按行禁用卸载）。
- **在用空态**（无当前范围请求）：仅说明文案「当前范围内没有正在使用的版本。」，不放操作按钮。

### Issue 1/2/3 最终结构（定稿）

- 主表：行 = Tool/Version(+可升级 chip)/Requested version/Source/Actions(仅「版本管理」ghost)。
- 版本管理区（表格下方 disclosure）：搜索框 + 过滤 + 单一「清除」（全重置）+ 三分区。
  - 在用：行操作 = 取消使用(danger)/卸载(danger，未装按行禁用)；区头右侧 = 可升级提示 + 升级(secondary)；空态 = 纯文案。
  - 已安装：使用(primary)/卸载(danger)。
  - 未安装：使用(primary)/安装(secondary)。
- 五个单工具操作各配解释弹窗（命令精确回显，文案见 v3 表）；无批量、无标签/命令错位。
- 级联修改：ADR-0008 修订（双语）、ui-ux-rules.md `:39`/`:44` 条文重写 + `:104` 条文随新结构确认、变体表补「跨分区同语义槽位同变体家族 + 操作列网格对齐」、`tools.empty.body`/`tools.tooltip.singleVersion` 的 "Add a tool" 引用、版本比较器（beta12 遗留，随 #178 已实现则核对）。

## 定稿记录（2026-09-23 第四轮 — Q5 终版、Q9 定稿）

- **Q9 定稿**：去掉 `--bump`，升级跑 `mise upgrade <tool>` 默认模式（配置内范围升级，不改写配置）。
- **Q5 终版（v5，owner 骨架 + 润色）**：owner 给出方向——书面简洁、不口语化、无费解指代。终版（zh/en）：

| 操作 | zh | en |
|---|---|---|
| Use | 如果该版本未安装，则先安装；然后将其设为当前使用的版本。 | Installs the version if it is missing, then sets it as the version in use. |
| Install | 仅安装该版本，不会使用。 | Installs the version only; it will not be used. |
| Uninstall | 删除该版本的安装文件；如果该版本是当前使用的版本，下次使用时会自动重新安装。 | Deletes this version's installation files; if it is the version in use, it is reinstalled automatically the next time it is used. |
| Unuse | 从配置文件里移除该工具；其安装文件若不再被其他配置使用，将一并删除。 | Removes the tool from the config file; its installations are deleted as well if no other config uses them. |
| Upgrade | 按配置文件里所写的范围升级到最新并安装。 | Upgrades to the latest version within the range written in the config file and installs it. |

v3/v4 作废。润色点仅三处：①「使用」的「配置文件里使用该版本」→「将其设为当前使用的版本」（原搭配别扭，且「当前使用的版本」= 界面「在用」区的同一概念）；②「取消使用」去掉「安装文件」重复；③其余沿用 owner 原文。

**Issue 1/2/3 至此全部定稿**，最终结构见第三轮记录，弹窗文案以本表为准。

## 定稿记录（2026-09-23 第五轮 — Q5 v6，agent 全权重写）

owner 明确不参考其草稿，要求全力重写。设计思路：五操作两套对称——使用/安装只差「当前使用的版本变不变」，卸载/取消使用各动一样东西（安装文件 vs 配置文件）；结构对齐、只含具体名词，可逐行对比。v5 及之前各版作废。

| 操作 | zh | en |
|---|---|---|
| Use | 让该版本成为当前使用的版本；未安装时会先安装。 | Makes this version the one in use; it is installed first if missing. |
| Install | 安装该版本；当前使用的版本不变。 | Installs this version; the version in use stays unchanged. |
| Uninstall | 删除该版本的安装文件，配置文件不变；若该版本正在使用，下次使用时会自动重新安装。 | Deletes this version's files; the config file stays unchanged. If this version is in use, it is reinstalled automatically the next time it is used. |
| Unuse | 从配置文件移除该工具；其他配置不再使用的安装文件一并删除。 | Removes the tool from the config file; installations no longer used by other config files are deleted as well. |
| Upgrade | 将配置文件所写范围内的版本升级到最新并安装。 | Upgrades to the newest version within the range written in the config file and installs it. |

## 定稿记录（2026-09-23 第六轮 — Q5 v7，agent 全权重写 II）

owner 要求兼顾反义对（使用↔取消使用、安装↔卸载）与对照对（使用↔安装、卸载↔取消使用）。架构：四动词 = 两对反义 + 两对对照；每句语序固定「先说哪个变了，再说附带后果」，五句可互相对照阅读。v6 及之前各版作废。

| 操作 | zh | en |
|---|---|---|
| Use | 让该版本成为当前使用的版本；未安装时会先安装。 | Makes this version the one in use; it is installed first if missing. |
| Install | 安装该版本；配置文件不变。 | Installs this version; the config file stays unchanged. |
| Uninstall | 删除该版本的安装文件，配置文件不变；正在使用时，下次会自动重新安装。 | Deletes this version's installation files; the config file stays unchanged. If it is the version in use, it is reinstalled automatically the next time. |
| Unuse | 让该工具不再被使用：从配置文件移除，其他配置不再使用的安装文件一并删除。 | The tool is no longer used: it is removed from the config file, and installation files no other config uses are deleted as well. |
| Upgrade | 将配置文件所写范围内的版本升级到最新并安装。 | Upgrades to the newest version within the range written in the config file, and installs it. |

对照关系：安装/卸载同尾句「配置文件不变」（只动文件的一对反义）；使用/取消使用以「让…成为 / 让…不再」起句（动配置的一对反义）；使用/安装差在「当前使用的版本变不变」；卸载/取消使用差在「动文件还是动配置」。

### Issue 4【全局模式命令回显的 `-C $HOME` 可读性】

**来源**：用户报告（2026-09-23，附图：弹窗命令回显 `mise -C $HOME install go@1.26.7`）。原话：「这个命令里的 $HOME 也太影响理解命令了，为什么要加，能不加吗，如果有必要加，需要显示出来吗」。

**调查结论**：
1. **`-C $HOME` 是执行层的全局模式锚定，#179 引入、全局统一注入**：TS 侧所有变更操作走 `runner.run({cwd, args})`，全局模式 cwd=null；Rust runner（`src-tauri/src/mise.rs:300`）对 cwd=null 一律 `cmd.arg("-C").arg(home)`——**不区分命令**，install 也因此带上。回显（`ExecutionPanel.tsx:61` `commandEcho`）镜像同一规则拼出 `-C cwd ?? "$HOME"`。
2. **为什么必要（执行层）**：mise 没有「全局模式」这个概念，config 解析跟随进程 cwd（官方原文 "Running from your home directory targets global configuration"）。#179 之前五页读路径按 app 进程 cwd 解析出过错；`-C $HOME` 让读写都锚定家目录 = 全局语义。**执行层不能去**（去了 #179 回退）。
3. **现状还有一处冗余**：`miseUseArgs`（`ToolsPage.tsx:169-172`）全局模式已用 `-g`（显式写目标），实际命令 = `mise -C $HOME use -g …`——`-C` 与 `-g` 双保险，`-C` 只管读锚定；而 unuse（`:153-155`）无 `-g`，写目标完全靠 `-C $HOME` 隐式达成（unuse 其实有 `-g` 标志，未用）。
4. **同类排查**：commandEcho 是五页共用的回显件——Env/Tasks/Settings/Plugins 的弹窗与执行面板在全局模式同样显示 `-C $HOME`，本 issue 的修复天然惠及全部；self-update 特例（`ExecutionPanel.tsx:64`）不在变更范围。

**修复方向（待用户定稿，2026-09-23 对话轮次）**：执行层不动；**回显改「终端视角」**——argv 与运行目录分开呈现：回显只显示命令本体（use/unuse 带 `-g` 的显式形态，unuse 顺手补 `-g`），运行目录作为独立上下文行（全局模式显示家目录、目录模式显示所选路径）。如 `mise use -g go@1.26.7` + 「运行目录：~」。弹窗「精确命令回显」承诺升级为「argv + 运行目录」双件，与真实终端行为一致（终端里 cwd 从不在命令行里）。规则层：ui-ux-rules Execution panel 条文补此款（中英双语）。

## 定稿记录（2026-09-23 第七轮 — Issue 4 定稿）

owner 裁决（2026-09-23 原话确认：「全局模式用 -g，非全局模式用 -C 选择目录，这样就都能显示清楚了」）：**全局模式回显不加 `-C $HOME`；目录模式回显保留 `-C 所选目录`**。执行层两种模式都不动（runner 照跑 `-C $HOME`，#179 不回退）——纯回显层呈现规则。

可行性审计（全局模式隐藏 `-C` 后，回显在任意目录复制粘贴的忠实性）：
- `mise use -g …`：显式 -g，已有（`miseUseArgs`）✓
- `mise unuse -g …`：**需补 -g**（现状无，`miseUnuseArgs :153-155` 全靠 -C 隐式定位）→ 列入 #188 区域工作
- Env `mise set/unset -g`：显式 -g，已有（`EnvPage.tsx:73/77`）✓
- Settings `mise settings set/unset`：默认即全局，无需标志（`SettingsPage.tsx:63-78`）✓
- install/uninstall（显式版本）：与目录无关 ✓
- upgrade / tasks run：CLI 无 -g 标志，回显省略 -C 后复制粘贴到项目目录语义会偏——以「运行目录」上下文行兜底披露（见下），接受此局限并记录。

呈现形态定稿：全局模式回显 = 纯命令本体 + 独立上下文行「运行目录：~（家目录）」；目录模式回显 = `mise -C <dir> <args>` 内联（owner 明确要求可见）。弹窗/执行面板共用 commandEcho（`ExecutionPanel.tsx:61`）：改为 cwd===null 时不拼 -C。规则层：ui-ux-rules Execution panel 条文补此款（中英双语）。

## 实现记录（2026-09-23 — 「记录但不展开」①随本期修掉）

owner 指示「就这个周期能修的就修了」。**#192 已实现并推送 master（e491f77）并关闭**：
- `env.removeButton` → `env.unsetButton`（en "Remove"→"Unset"，zh 「移除」不变，与 `settings.unsetButton` 的 zh 一致）；`env.confirm.remove.*` → `env.confirm.unset.*`（title en "Unset {{name}}?"）；EnvPage 全部引用、testid（env-remove-*→env-unset-*）、state（confirmingRemove→confirmingUnset）同步更名，两处注释清扫。
- ui-ux-rules.md:93 英文条文 "(Remove, …)" → "(Unset, …)"；zh 条文「移除」标签未变、无需改。
- `npm run ci` 全绿（typecheck/test/i18n 守卫/构建）；标注 NOT visually verified。
- ②插件页 installedEmpty：核查结论「表述仍成立」经 owner 确认，本期无动作。

beta13 周期最终状态：SPEC #187；tickets #188–#191 待实现（#189 blocked by #188），#192 已闭环。
