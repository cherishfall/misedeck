# v1.0.0-beta.5 反馈记录

> ✅ **第一批（2 条）已于 2026-09-03 发布到 cherishfall/misedeck**：SPEC 父 issue **#61** + tickets **#62~#64**（label: v1 + ready-for-agent，原生 blocking + sub-issue 关系已设置）。
> 映射：Issue 1（首页位置 + 底部控件行）→ **#62**；Issue 2（折叠态语言菜单被裁）→ **#63**（建浮层 primitive + 迁移语言菜单 + 补齐无障碍）+ **#64**（目录菜单迁移，纯技术债，独立排期）。
> 阻塞链：**#63 ← #62；#64 ← #63**（#62 可立即开工）。
> 每条：用户原话（+截图）→ 代码调查结论 → 对齐后的理解 → 定稿。
> 本次采用「grill with docs」方式逐条拷问：**先量数据、再拷问**，不在没有事实的情况下让用户做判断题。
> 截图：用户直接粘贴，未落盘（见对话上下文）。
> ⚠️ 本批为 beta5 反馈的第一批，后续反馈将开新的 SPEC + ticket 批次。

---

## Issue 3: 侧边栏顶部展开/收起按钮跟 P/T/E 列不对齐

**用户原话**: 「这个展开，收起的的按钮我想和P、T、E 那一列对齐，现在看着不好看」

**代码调查结论（Explore 子代理实测）**:

DOM 层级共享同一容器 `.sidebarTop`（`PageShell.module.css:39-66`），padding-left 12px（展开）/ 8px（折叠）；toggle 跟 navItem 各自的 padding-left 也都是 8px，**不是不同容器造成的偏移**。真正的「不对齐」来源于 toggle 的「按钮盒」外边缘：34px 宽（16 SVG + 8×2 padding + 1×2 border），从侧边栏内边缘就开始；P 字母的 `.navGlyph` 20px 盒子要再向内缩 8px 才出现。

| 元素 | 展开态 x | 折叠态 x |
|---|---|---|
| toggle 按钮盒（含 padding+border） | **12px** | **8px** |
| toggle 内部 SVG | 20px | 16px |
| navItem 盒 | 12px | 8px |
| navGlyph 盒（P 字母） | 20px | 16px |

- toggle 内部 SVG 的左边缘其实**已经**跟 P 字母格子左边缘对齐（都是 20px / 16px）。
- 但因为 SVG 外面包了 8px padding + 1px border，整个按钮盒往左外凸 8px → 视觉上「toggle 的方框比字母列靠左」。
- 展开、折叠偏差都是 8px，算法一致。

**对齐结论（已定稿）**:
- **采用「样式对齐」**（三个候选中用户选定的方案）：让 toggle 跟 navItem 视觉权重一致——去掉 toggle 的 `padding: var(--space-2)`（8px），按钮盒从 34px 缩到 18px（16 SVG + 1×2 border）；默认态透明边框，hover/focus 才显示 `border: var(--line-strong)` + `color: var(--beam)` + `background: color-mix(var(--beam) 6%)`——**直接复用 navItem 的 hover/focus 规则**。
- 展开、折叠算法一致，不为 rail 单独处理。
- 不动 SVG 尺寸（16px）、不动 sidebarTop padding、不动 navItem、不动 navGlyph。
- **已知副作用**：toggle 默认态完全透明，跟 navItem 同款——第一次用的人可能不知道顶部那个位置是按钮。默认接受这个权衡（跟 navItem 一致）；如果用户后续觉得反馈太弱，再加常驻 `color: var(--dim)` 浅色 affordance。
- 候选被否的另两个方案：① 仅加 `margin-left: 8px` 让按钮盒左边缘对齐字母左边缘（位置对齐但右侧仍突出 14px）；② 缩小按钮盒到 20px 跟 navGlyph 同宽（可点击区只有 20×20，偏小）。

**拟定 issue**: 标题 ~"Sidebar toggle: align with the nav item column by removing the standalone button chrome, matching navItem's hover-only border affordance"，labels: enhancement, v1。

---

## Issue 4: 任务页标题字号比别的大、整页看着松散 → TasksPage 硬写值全面偏离 token

**用户原话**: 「任务页的样式左右侧怎么留白比其他页面要多呢」
**追加观察**: 「好像标题字体大小是不是也不一样大」（用户随后补发对比截图，红框标出「工具」vs「任务」两个标题，确实一大一小）

**代码调查结论（Explore 子代理实测）**:

**根因：`.title` 硬写了 `font-size: 32px`，而其他 8 个页面都用 token `var(--size-display)` = 26px**（`TasksPage.module.css:39` vs `ToolsPage.module.css:31` 等）。差 +6px（+23%）。

```css
/* TasksPage.module.css:37-44 — 异常 */
.title {
  font-size: 32px;              /* 应为 var(--size-display) = 26px */
  letter-spacing: -0.01em;      /* 应为 var(--tracking-display) = 0 */
}
/* 其他 8 个页面 — 基准 */
.title { font-size: var(--size-display); letter-spacing: var(--tracking-display); }
```

**排除的错误假设**（走了弯路，记下来避免重复）：
- ❌ 不是 `.page` 容器窄——TasksPage `max-width: 1280px` **大于**其他页面的 1200px，同一窗口下 .page 实际等宽（甚至更宽）。
- ❌ 不是 EmptyState 卡片内留白——`EmptyState.module.css` 无 `max-width`，卡片撑满父容器；其 `align-items: flex-start` 只影响内部文字对齐，不造成整页观感差异。
- ✅ 真正的观感来源：标题大一圈 → 行高被撑大 → 同样的 gap 下视觉密度被稀释，整页显得「松」。

**全量硬写值审计结果**（用户选定「做一次 token 全面对齐扫描」，非只修标题）：

| 分类 | 数量 | 说明 |
|---|---|---|
| **BUCKET A 视觉漂移（必须修）** | **25 处** | 硬写值的解析结果与等价元素在其他页面的取值**确实不同** |
| BUCKET B 装饰性漂移（可选清理） | 13 处 | 数值等于 token 值但绕过了 token，今天视觉一致、将来易发散 |
| 故意保留（勿动） | 5 处 | 小元素 `border-radius: 4px` 字面量，文件头注释 L10-12 声明是全站约定（其他 7 页同样），系统无 `--radius-sm` |
| 无 token 的其他字面量 | ~13 处 | 如 `.page max-width: 1280px`、专属列宽 360/280/220px、13px 字号等，无对应 token |
| 额外 token-to-token 差异 | 5 项 | 选了不同 token 或漏了属性，**超出桶定义**，需单独评审 |

**BUCKET A 的核心规律**（高杠杆收口项）：
- `11px → var(--size-label)`（10px）：`.eyebrow` `.toolbarHint` `.refresh` `.errorLabel` `.errorStderr?` `.cellDepends` `.editFormSub` `.editFormHelp` `.editFormError`——**系统性「标签尺寸偏大 1px」**
- `13px → --size-base`(14px) 或 `--size-data`(12px)：`.errorBody` 等
- `0.1em / 0.12em → var(--tracking-label)`（0.18em）：`.eyebrow` `.toolbarHint` `.refresh` `.errorLabel` `.taskHidden` `.editFormLabel`
- `32px → var(--size-display)`（26px）：`.title`（用户肉眼发现的那个）
- 纵向 spacing 偏离 4/8/12px 约定：`.refresh padding 6px→4px`、`.taskHidden padding 1px→2px`、`.cellActions gap 6px→8px`、`.loading gap 10px→12px`
- `.dot` `6px → 8px`（其他 7 页均 8px）
- `.editFormTitle 15px → 14px`（其他页 `.sectionTitle` 约定 14px）

**额外发现（需单独评审，不在本次 A/B 桶内）**：
1. `.eyebrow` 颜色 `var(--dim)` vs 其他页 `var(--ice)`
2. `.refresh` 颜色 `var(--text)` vs 其他页 `var(--ice)`
3. `.errorState` 用 `var(--breach)+var(--panel)` vs 其他页 `var(--tint-danger)+var(--tint-danger-bg)`（红边 vs 淡红底）
4. `.errorStderr` 颜色 `var(--dim)`/背景 `var(--void)` vs 其他页 `var(--breach)`/淡红底
5. `.loading` 缺 `uppercase` + `var(--tracking-label)`（其他 7 页均有）——属属性遗漏，非数值错误

**对齐结论（已定稿）**:
- **做全面 token 对齐扫描**（用户明选），而非只修 `.title` —— 因为肉眼可见的标题差异只是 25 处漂移中的 2 处。
- 范围：BUCKET A 25 处全部归位 + BUCKET B 13 处可选清理（建议一并做，防将来发散）。
- **边界**：5 处 4px 小圆角**保持原样**（全站约定，勿 token 化）。
- 额外发现的 5 项 token-to-token 差异**另立 issue 单独评审**，不混进本次 token 对齐（性质是「选错 token/漏属性」，不是「硬写值」）。
- ~~`.page max-width: 1280px` 是否降到 1200px~~ **已定稿：降到 1200px，与其他页一致**（用户拍板）。理由：虽然不影响当前观感（窗口不够宽时 max-width 不触发），但它是真实的布局级不一致，留着就是下一个人踩坑的由头。

**拟定 issue**: 标题 ~"TasksPage: replace hardcoded values with design tokens (25 visual drifts: 32px title, 11px labels, non-token tracking/spacing)"，labels: bug, v1。附带一个独立的 enhancement issue 处理额外发现的 5 项 token-to-token 差异。

---

# 第二批（Issue 3~10，已于 2026-09-03 发布）

> ✅ **第二批（8 条）已于 2026-09-03 发布到 cherishfall/misedeck**：SPEC 父 issue **#65** + tickets **#66~#73**（label: v1 + ready-for-agent，原生 blocking + sub-issue 关系已设置）。
> 映射：Issue 3（toggle 对齐）→ **#66**；Issue 4 拆两半——token 硬写值归位 → **#67**、token-to-token 差异 → **#68**；Issue 5（bug）→ **#69**；Issue 6+7（分页+卸载）→ **#70**；Issue 8（链接工具）→ **#71**；Issue 9（执行面板+ADR+复制命令）→ **#72**；Issue 10（预览页 redesign）→ **#73**。
> 阻塞链：**#68 ← #67**（同一 stylesheet，token 先行语义后行）；**#70 ← #69**（bug 不修，卸载按钮无数据可点）。
> **#66 / #67 / #69 / #71 / #72 / #73 六个可立即开工**；#72 建议在 #69~#71 后做（排期建议非硬依赖）；#73 的「复制命令删除」部分归 #72 承接（避免能力空窗）。
> 另：Issue 3 和 Issue 4（记录在下方第一批之后）也归本批，分别映射 #66 / #67+#68。

## Issue 5【bug】: 工具页「已安装版本」明明有数据却显示空

**用户原话**: 「工具页面，已安装版本明明是有的，但是没有显示」（附终端 `mise ls java` 输出 10+ oracle 版本佐证）

**代码调查结论（Explore 子代理）**:

**根因：`mise ls --json <tool>` 返回 JSON 数组，而前端 `parseLsPayload` 只接受对象，遇到数组直接 return []。**

4 步证据链：
1. `misedeck/src-tauri/src/mise.rs:506-527` `mise_ls_tool` 跑 `mise ls --json <tool>`，mise 返回**数组** `[items]`
2. `misedeck/src/hooks/useToolsList.ts:193-196` `useParsedLsTool` 把 `q.data.value` 喂给 `parseLsPayload`
3. `misedeck/src/api/miseTools.ts:73-76` `parseLsPayload` 遇到 `Array.isArray(value)` 直接 `return []`
4. `misedeck/src/pages/ToolsPage/VersionQuerySection.tsx:163-165` 因 `rows.length === 0` 渲染空状态「没有已安装版本」

对比（顶部「已安装工具」表格正常，因为它走的是另一条路）：
| | 顶部表格 | 已安装版本查询 |
|---|---|---|
| Tauri 命令 | `tools_ls` | `tools_ls_tool` |
| mise argv | `mise ls --json` | `mise ls --json <tool>` |
| JSON 顶层 | `{ "tool": [items] }` 对象 | `[items]` **数组** |
| 结果 | 正常 | 被解析为空数组 |

**排除的错误假设**：不是 CLI 输出里 `(symlink)` 后缀导致解析失败——`--json` 模式下 version 字段是干净字符串（`symlinked_to` 是独立字段），子代理已核实上游 mise 源码。

**对齐结论（已定稿）**:
- **纯前端修复**，Rust 侧 argv 正确无需改动：`parseLsPayload` 兼容数组（遇到数组包成单元素 groups），上游 `useParsedLsTool` 调用处不变。
- **补 Rust 测试**：`misedeck/src-tauri/tests/tools.rs` 目前**完全没有覆盖** `mise_ls_tool`（只有 `mise_ls` / `mise_outdated` / `mise_ls_remote`），需新增 fixture + 断言数组解析后的 items 数量。这是该项目前端/Rust 测试基建从无到有的第一步。
- 修复后空状态文案自动合规（不再"假空"），`ui-ux-rules.md:20` 那条无需单独 issue。

**拟定 issue**: 标题 ~"Tools: installed-versions query shows empty despite installed versions (parseLsPayload rejects the array payload of mise ls --json <tool>)"，labels: bug, v1。

---

## Issue 6【需求】: 版本查询结果分页（覆盖「已安装版本」+「远程版本」两个区块）

**用户原话**: 「查找远程版本功能，太多了，能不能分页显示，默认1页10行，分页部件可以填写每页大小，上一页，下一页，跳转到指定页数这些，安装版本功能也同样做吧」

**现状（Explore 子代理实测）**:
- `VersionQuerySection.tsx` 是**通用组件**，被实例化两次（installed + remote），改造一次覆盖两个区块
- 折叠阈值 hardcoded `foldLimit = 10`；点「显示全部 3181 项」后**一次性渲染 3181 行** DOM——页面不崩但极长滚动，体验已崩
- **`mise ls` 和 `mise ls-remote` 都不支持 `--limit` / `--offset`**（子代理核实过全部 flag 清单），分页只能**客户端切片**
- 项目**无任何分页组件**（grep `pagination|pager|pageSize|currentPage|usePagination` 全空），需新建
- 该分页方案**取代** beta4 #55 定的「超过 ~10 条折叠为『展开全部 N 条』」，也覆盖 `ui-ux-rules.md:21` 现有规则（该规则需同步更新）

**对齐结论（已定稿）**:
- **去掉**「显示全部 N 项」按钮（点开后 3181 行 DOM 性能崩，分页正是为取代它）
- **阈值切换**：≤10 行全展示不显示分页器；>10 行才显示（避免「5 行 + 3 个空按钮」的尴尬）
- **pageSize**：**纯输入框，最小 10**（不满足自动重置为 10），无上限
- **分页器 UI**（表格底部）：`< 上一页 | 第 X / Y 页 · 共 N 条 | 下一页 | 跳转到 [输入框] [Go]>`
- 新增 `Pagination` 组件于 `misedeck/src/components/Pagination/`，签名：
  `<Pagination total pageSize currentPage onPageChange onPageSizeChange minPageSize={10} />`
- 「清除」按钮**重置全部**：输入框、结果、pageSize→10、当前页→1
- 跨区块状态天然独立（两个独立组件实例）
- 新增 i18n keys（中英双语）：`tools.queries.pagination.total` / `.pageOf` / `.pageSize` / `.pageSizeHelp` / `.prev` / `.next` / `.jumpTo` / `.jump`
- **需同步更新** `docs/design/ui-ux-rules.md:21`（把「折叠为展开全部」改为「分页」），并镜像 `zh-CN/`

**拟定 issue**: 标题 ~"Tools: paginate version query results (installed + remote), replacing the show-all-N fold"，labels: enhancement, v1。

---

## Issue 7【需求】: 已安装版本查询结果加「卸载」按钮（**与 Issue 6 合并为同一 ticket**）

**用户原话**: 「一个需求是已安装版本里显示卸载按钮」

**代码调查结论**:
- `installedColumns`（`ToolsPage.tsx:191-225`）**没有 actions 列**，只有 version / requested / active / source
- `remoteColumns`（`ToolsPage.tsx:227-257`）**有 actions 列**，是个 Install 按钮（`onRemoteInstall` 行 178-181）——**这是现成模板**
- 顶部已安装工具表的卸载流程完整可复用：`RowActions`（行 674-705）danger 按钮 → `setPendingUninstall` → `ConfirmDialog`（行 564-591，展示 `commandEcho("mise", cwd, miseUninstallArgs(...))` 命令预览）→ `runMutation(() => miseUninstallArgs(...))`
- **无需新增 Tauri 命令**：所有工具变更都走通用 `run_mise_command`（`lib.rs:229-296`），argv 由前端构造；`mise_uninstall_argv` 已存在（`mise.rs:1260`），JS 副本 `miseUninstallArgs` 在 `ToolsPage.tsx:97-102`
- 复用 `runMutation`（行 282-289）**自动继承信任门 + 单并发保护**

**对齐结论（已定稿）**:
- 加一个 `actions` 列，单元格放 `variant="danger"` 的卸载按钮（`disabled={isRunning}`），点击打开**复用**现有 `ConfirmDialog` + 命令预览
- argv 与顶部表卸载完全一致（`mise uninstall <tool>@<version>`），**纯前端改动，Rust 无需动**
- **与 Issue 6 合并为同一 ticket**，理由：
  1. 都改版本查询区块（Issue 7 改 columns prop、Issue 6 改组件内部）
  2. **真实耦合点**：卸载后若当前是最后一页且该页仅剩 1 条，需自动跳回上一页——分页与卸载的状态机缠在一起，分开做第二次要重读第一次的改动

---

## Issue 8【需求】: 新增「链接工具」区块（mise link）

**用户原话**: 「然后再安装工具和已安装版本里加一个链接工具（名字可以你帮我想想），就是 mise link 的用法，可以选择某个目录然后指定工具及版本名称」

**mise link 实测语义**（本机 mise 2026.8.14，`mise link --help` 逐字）:
```
Symlinks a tool version into mise
Usage: mise link [-f --force] <TOOL@VERSION> <PATH>
  <TOOL@VERSION>  Tool name and version to create a symlink for
  <PATH>          The local path to the tool version
                  e.g.: ~/.nvm/versions/node/v20.0.0
Flags: -f, --force   Overwrite an existing tool version if it exists
```
- **参数顺序：`<TOOL@VERSION>` 在前，`<PATH>` 在后**（不是 path 在前）
- **唯一标志 `--force`**；别名 `ln`
- **`mise unlink` 不存在**——移除 link 进来的版本走 `mise uninstall <tool>@<version>`

**命名（受 ADR-0004 硬约束）**: mise 自己的动词就是 `link`，概念词是 "symlink a tool version into mise"。唯一词汇安全的名字：
- 按钮 **`Link` / 链接**；区块标题 **`Link a tool` / 链接工具**（与 `Install a tool / 安装工具` 对称）；目录标签 **`Directory` / 目录**（项目已用"目录"取代"上下文/项目"）
- **禁用**「注册 / 绑定 / 挂载 / 关联」——mise 无此概念，违反 ADR-0004

**代码调查结论**:
- **无需新增 Tauri 命令**，复用 `run_mise_command`；需在 `mise.rs` 补 `mise_link_argv` 纯函数 + `tests/tool_mutations.rs` 断言 + JS 副本 `miseLinkArgs`（与 install/uninstall 同模式）
- 表单模板：`InstallToolForm`（`ToolsPage.tsx:707-774`）两输入 tool/version + 提交按钮；link 表单需**三输入**（tool / version / 目录路径）
- **目录选择器已有原语**：`openDialog({ directory: true, multiple: false })` from `@tauri-apps/plugin-dialog`，`DirectoryIndicator.tsx:85-98` 即用法；i18n 键 `directory.pickerTitle` 可复用
- 注意：`DirectoryIndicator.onPick` 会把结果写进**全局目录上下文**，但 link 表单的路径是 `<PATH>` 参数，**不能**改变全局目录——需单独 `openDialog` 存到本地 state

**对齐结论（已定稿）**:
- **位置**：安装工具之后、已安装版本之前（用户选定）。理由：链接和安装是「获取工具」的并列手段（一个从远程下载、一个把本地目录收编）
- **不暴露 `--force`**（用户选定）。冲突时**给提示而非强制覆盖**
- **冲突提示文案**（我优化过用户原话，中英对称带插值）：
  - zh：`{tool}@{version} 已存在，无法重复链接。请先卸载该版本，再重新链接。`
  - en：`{tool}@{version} already exists. Uninstall it first, then link again.`
  - 优化点：①点名具体版本而非泛泛"同名版本" ②补上后果"无法重复链接" ③动作闭环且卸载在 GUI 内可完成（符合 `ui-ux-rules.md:20`）④砍掉绕口的"如需"
- **冲突检测实现要点**：**不能靠前端预检**（已安装版本列表要用户手动查才有数据，前端手上是空的）。正确做法：**提交后捕获 mise stderr**，匹配 `already exists` / `already installed` 关键词 → 命中显示上述 i18n 提示，未命中回退原始错误。**原始错误始终保留在执行面板**（`ui-ux-rules.md` 13-15 行数据诚实原则，不能吞掉真实报错）
- 新增 i18n keys：`tools.actions.link` / `tools.linkForm.*`（title/toolPlaceholder/versionPlaceholder/pathLabel/run/duplicateVersion）/ `tools.confirm.link.*`
- 卸载按钮（Issue 7）直接复用 `tools.actions.uninstall` + `tools.confirm.uninstall.*`，无需新键

**拟定 issue**: 标题 ~"Tools: add a 'Link a tool' section (mise link <tool>@<version> <path>) between install and installed-versions"，labels: enhancement, v1。

---

## ticket 拆分与依赖（用户已确认拆分方式）

| Ticket | 内容 | 依赖 |
|---|---|---|
| **A** | Issue 5（bug：已安装版本不显示 + 补 Rust 测试） | 无，优先级最高 |
| **B** | Issue 6 + Issue 7（分页 + 卸载按钮） | **← A**（bug 不修，已安装版本区块永远空，卸载按钮没数据可点） |
| **C** | Issue 8（链接工具新区块） | 无，可并行排期 |

**拆分理由**：
- A 独立：是 bug、优先级最高，且是 B 的前置
- 6+7 合并：同区域改动 + 卸载后翻页状态机耦合，一次改完一次验收
- C 独立：完全不碰 `VersionQuerySection`，零冲突

---

## Issue 9【架构级重构】: 让所有读查询也走执行面板（小重构 + 新 ADR）

**用户原话**: 「你提到执行面板，为什么运行后没有执行面板显示呢？」

**代码调查结论（Explore 子代理）**:

**当前架构规则**（`docs/agents/architecture.md:19` + `docs/agents/product-logic.md:17, 74`）：
- 执行面板是 **mutations 的唯一通道**：「Every mutation still streams through the execution panel」
- **reads 可跳过面板**：「Read-only queries may skip the panel」
- 「Pages with no mutating action … never show it」

**三个查询命令的调用链**（全部绕过面板）：
| 命令 | 走面板？ | 调用链 |
|---|---|---|
| `tools_ls`（顶部已安装工具表） | ❌ 绕过 | `useToolsList` → `toolsLs` → `invoke()` |
| `tools_ls_tool`（已安装版本查询） | ❌ 绕过 | `useLsTool` → `toolsLsTool` → `invoke()` |
| `tools_ls_remote`（远程版本查询） | ❌ 绕过 | `useLsRemote` → `toolsLsRemote` → `invoke()` |

对比 mutations（install / uninstall / upgrade / task edit / trust）：全部走 `run_mise_command` 通用 IPC → `useExecutionContext().run()` → 面板。

**用户选的方案：所有读查询也进面板（小重构）**

**实现要点**：
- 改造 `useExecutionContext().run()` 返回类型——目前 `Promise<void>`，要返回 `JsonResult`（或解析后的强类型结构）
- `useLsTool` / `useLsRemote` / `useToolsList` 三个 hook 改用 `queryClient.setQueryData()` 写入 cache，**不再独立 invoke**——避免命令跑两次
- `ToolsPage.tsx` 的 `onInstalledRun` / `onRemoteRun`（行 169-172、ToolsPage.tsx 周边）配合改造：先调 `run({cwd, args: [...]})` 拿结果，再写入 cache
- **架构边界反转**：从「mutations 走面板」→「所有 mise 调用走面板」。需要新开一个 ADR（`docs/adr/0005-*.md`，含中英双语镜像）记录这个决策
- **同时带来的好处**：用户能看到自己点"运行"实际跑了什么、命令原文、stdout/stderr、报错信息原文——不再靠空状态猜

**影响面**：
- `useExecution.ts`（行 55-63 的 Action 类型可能要加 `result` 字段；`run` 签名改造）
- `useToolsList.ts` 三个 hook（`useToolsList` / `useLsTool` / `useLsRemote`）
- `ToolsPage.tsx` 的 onRun handler
- 新增 `docs/adr/0005-*.md`（含 zh-CN 镜像）
- `docs/agents/architecture.md` 和 `docs/agents/product-logic.md` 同步更新（去掉"reads 可跳过"那条）

**跟 Issue 5-8 的关系**：
- 跟 Issue 5-8 **不冲突**（改的是 useExecution 路径，Issue 5-8 改的是 VersionQuerySection / ToolsPage 列）
- 但**优先级**：建议**先发 Issue 5-8**（修 bug + 加功能），**再发 Issue 9**（架构重构）——因为：
  1. Issue 9 是大重构，独立发易审查
  2. Issue 5-8 落地后会发现更多 needs-from-execution-panel 的场景，可以一次性纳入 Issue 9
- **不建议合并**：性质不同（一个修 bug/加功能，一个改架构），混在一起审查困难

**拟定 issue**: 标题 ~"Execution panel: route all mise invocations (including reads) through the panel, returning the JSON result for the page to consume"，labels: enhancement, v1。需要同时发一个 ADR。

---

## Issue 10【需求】: 预览页 redesign（侧栏"概览" + DirectoryIndicator 常驻 + 按钮重排）

**用户原话**: 「我对这个预览页面的定位有点儿模糊……侧栏叫预览，点进去叫目录预览，但是全局的时候又没有一个显式的全局的提示，显示一个选择目录的的按钮……选择目录后才有上方目录的工具栏，就感觉是不是这个工具栏常驻比较好……如果是工具栏里 复制命令去掉，… 的按钮用选择目录比较好吧（如果是全局，就是选择目录，如果已经选择目录，就是选择其他目录），工具栏全局模式下不显示全局按钮」

**代码调查结论（Explore 子代理）**:

**用户描述的事实偏差（必须先纠正）**：
- 用户说"复制命令在 `...` 菜单里"——**不属实**。`DirectoryIndicator` 实际是「复制命令」是**常驻主按钮**（左侧按钮组里第一个），「选择目录」是**末尾 `…` 小图标按钮**。两者是**同一组件内两个独立 handler**。所以 redesign 真实抓手是**重排/重样式这两个按钮**，不是从溢出菜单挖。
- 顺带：`DirectoryPreview.tsx` **重复实现**了一个 `onPickDirectory`（与 DirectoryIndicator 的 `onPick` 逐字相同）——重设计时建议抽出公共函数，否则两处易漂移。

**重要历史（子代理挖出）**：
- "Global 模式没有持久工具栏"是 **beta4 Issue 1 当时明确搁置的方案 b**：当时选「空态卡片放选择目录按钮」（方案 a）、**否决**「Global 常驻」（方案 c）、「侧栏常驻切换器」列为"暂缓"（方案 b）。
- **ADR-0004 原文其实支持**方案 b（"a directory bar at the top, defaulting to Global"），所以用户的「常驻」方案**不违反架构**，只是要重启一个搁置项。
- "最近 ▾"弹层正在被 #63/#64 迁移到新浮层原语——**本次 redesign 不动"最近"那部分**，让那两个 in-flight ticket 处理，避免冲突。

**对齐结论（已定稿）**:

| 项 | 定稿 |
|---|---|
| 命名 | 侧栏 + eyebrow + 页标题统一为 **"概览" / "目录概览"**（用户从 4 候选中选"概览"）。同步 `i18n/keys.ts` + `en.json` + `zh-CN.json`（AGENTS.md 硬约束：en+zh-CN 同提交），动侧栏需扫所有引用"preview.nav" 的地方 |
| **目录标签命名（P0 文案 bug）** | `directory.eyebrow` 当前是 `目录 / DIRECTORY`（`en.json:17` / `zh-CN.json:17`）——**违反 `ui-ux-rules.md:45`**。该规则白纸黑字：退役「Context/上下文」「project/项目」，改用 **「current directory / 当前目录」**。故改为 `当前目录 / CURRENT DIRECTORY`。**用户直觉完全正确** |
| **组件注释自相矛盾（P0）** | `DirectoryIndicator.tsx:6` 注释写「favor of 'Directory / 目录'」——**跟绑定规则冲突**，是注释停留在旧词汇。需同步改为「current directory / 当前目录」，否则下一个人照注释写又会错 |
| DirectoryIndicator 常驻 | 重启 beta4 方案 b：组件加 `mode: "global" \| "directory"` prop（不靠 cwd 隐式判断），全状态渲染工具栏，只换内容 |
| 全局模式工具栏内容 | **保留「全局」标签 + 「选择目录」主按钮**（用户定稿），**隐藏**「在终端中打开 / 复制命令 / 最近 / ...」——这些在全局下没意义 |
| 已选目录工具栏 | 现状不变（只调整主按钮优先级，详见下条） |
| 主按钮优先级 | 「选择其他目录」提到显眼主按钮位置（`variant="primary"` 或等效强调），删除末尾「选择目录」`…` 小图标按钮 |
| **按钮静止色（P1 唯一 CSS 漂移）** | `.action` / `.actionDisabled` 的 `color: var(--dim)`（`DirectoryIndicator.module.css:71 / :84`）→ **`var(--ice)`**。理由：最直接的同类（ToolsPage `.refresh` L79、DoctorPage `.refresh` L72）均用 `--ice`，且相邻 eyebrow 已是 `--ice`，同级控件用更暗的 `--dim` 造成「标签比按钮更亮」的内部倒置 |
| 「复制命令」按钮 | **彻底删除**（能力由 Issue 9 接管——执行面板加「复制最近 / 复制当前命令」） |
| 重复实现 | 抽出 `onPickDirectory` 公共函数（`DirectoryIndicator.onPick` 与 `DirectoryPreview` 自带的那个），消除两处漂移风险 |
| 命名同步 | 同步 `docs/design/ui-ux-rules.md`（如有导航命名相关条目）+ `zh-CN/` 镜像 |
| 不动 | 「最近 ▾」弹层（让 #63 处理）；"最近 ▾" 触发的"切到该目录"行为不变 |

**视觉规范审计结果（用户问「工具栏的背景色、字体大小、字重、字体颜色是否符合设计规范」）**：

**结论：DirectoryIndicator 不是离群者，几乎每个视觉属性都落在系统约定内。** 与 Issue 4 的 TasksPage（25 处漂移）形成鲜明对比。

| 视觉属性 | DirectoryIndicator | 规范/同类 | 判定 |
|---|---|---|---|
| 背景 | `var(--panel)` (L13) | Panel / Banner / Sidebar 同 `--panel` | ✅ |
| 边框 | `1px solid var(--line)` (L14) | 全局约定（无边框宽度 token） | ✅ |
| 内边距 | `var(--space-3) var(--space-5)` = 12/22px (L12) | token | ✅ |
| eyebrow 字号 | `var(--size-label)` = 10px (L27) | 全站 eyebrow（Tools/Doctor/Env/DataRow/Banner）同 10px | ✅ |
| eyebrow 字重 | 未设 → 400 | 页面 eyebrow 均未设 | ✅ |
| eyebrow 字距 | `var(--tracking-label)` = 0.18em (L28) | 全站同 | ✅ |
| eyebrow 颜色 | `var(--ice)` (L30) | 全站 eyebrow / DataRow `.label` 同 `--ice` | ✅ |
| path 字号 | `var(--size-data)` = 12px (L38) | DataRow `.value` / Doctor `.statusValue` / Env `.scopePath` 同 12px | ✅ |
| path 颜色 | `var(--text)` (L39) | 主数据色，全站 data 值同 | ✅ |
| path 字族 | `var(--font-mono)` (L37) | 全站 data 值同 | ✅ |
| 按钮字号 | `var(--size-label)` = 10px (L55) | refresh 按钮同 | ✅ |
| 按钮圆角 | `4px` (L59) | 全局 4px 小元素约定（**17 个文件**共用，TasksPage 头注释已声明） | ✅ |
| 按钮内边距 | `4px 10px` (L58) | Tools/Doctor `.refresh` + Button `.size-sm` 完全一致 | ✅ |
| 按钮 hover | `--beam` + `color-mix(beam 6%)` (L76-78) | IconButton / navItem 同 | ✅ |
| **按钮静止色** | `var(--dim)` (L71) | ⚠ Tools/Doctor `.refresh` 用 `--ice` | ⚠ **唯一漂移（P1）** |

**分桶**：BUCKET A 视觉漂移 **1 处**（按钮静止色）；BUCKET B 装饰性 **0 处**；无 token 的字面量（1px 边框 / 4px 圆角 / z-index:20 / popover 宽高 / 阴影偏移）经核实均为**全局约定或无对应 token**，维持原样。
**其中 `z-index: 20` 与 Issue 6 要新建的 `--z-popover` 是同一件事**——Issue 6 建 token 时 DirectoryIndicator 的 popover 一并收编。

**拟定 issue**: 标题 ~"Preview page: rename to '概览', make DirectoryIndicator persistent across global/directory modes, swap copy-command for pick-directory"，labels: enhancement, v1。

---

## Issue 9 范围扩大（吸收"复制命令"能力）

原 Issue 9 范围：读查询进执行面板 + 新 ADR。

**新增范围**（来自 Issue 10 的"复制命令"能力转移）：
- 执行面板增加「复制最近 / 复制当前命令」能力（按钮位置待定，建议在面板 header 或状态行附近）
- 这是**执行面板的自然能力**（执行面板 = "命令历史"），跟"读查询进面板"同属"执行面板增强"，一次改完

**拟定 issue 标题更新**: "Execution panel: route all mise invocations through the panel + expose recent/current command copy"。

---

---

## Issue 1: 首页应在预览之上；主题切换去掉「主题」文字与外框，与语言切换同一行

**用户原话**: 「这个首页是不是放在预览的上面更合适，而不是放在下面，主题切换那个能不能不要主题两个字后外面的那个框框，就一个切换按钮和语言切换放在同一行，语言切换在左，主题切换在右」

**拷问补充（用户原话）**: 「保留胶囊，只去框和文字，和语言切换放在同一行，语言切换靠右，主题切换靠左，并且高度相同，不管是中文还是英文状态，两者排列注意不要溢出」

> ⚠️ 左右顺序两次表述相反（首次「语言在左、主题在右」，拷问时「语言靠右、主题靠左」），已回问确认，**以首次原话为准：语言在左、主题在右**。

**代码调查结论（Explore 子代理实测）**:

导航结构（`PageShell.tsx:181-193`）——分两组：
- `NAV_ITEMS` 顶部主组：`预览 / 工具 / 环境变量 / 任务 / 插件`
- `BOTTOM_ITEMS` 底部组：`首页 / 诊断 / 设置`
- 落地页 `/` 渲染 `HomePage`（`main.tsx:44`）——**首页本来就是默认落地页**，只是导航里躲在底部组。

底部 footer（`PageShell.module.css:144-151`）——`.footer` / `.footerCollapsed` 共用同一规则：
- `flex-direction: column`（**竖向堆叠**，这是用户看到的现象根因）
- `gap: 8px`、`padding-top: 8px`、`border-top: 1px solid var(--line)`

尺寸实测（`tokens.css` + 各组件 CSS，字体宽度由 Space Grotesk 的 `hmtx` 表实测）：

| 项 | 值 |
|---|---|
| 侧边栏展开宽 | 196px，减去 1px 边框 + 左右各 12px 内边距 → **可用内宽 171px** |
| 侧边栏折叠（rail）宽 | 56px，减 1px 边框 + 左右各 8px → **可用内宽 39px** |
| 语言切换 `.trigger` | 内容驱动；高 = 20(globe) + 4+4(padding) + 1+1(边框) = **30px** |
| 主题胶囊 `.pill` | **40 × 22px**（固定）；knob 16px，深色态 `translateX(18px)` |
| 主题外层 `.switcher` | 带框容器，高 40px，宽 = 74px + label（中文 98px / 英文 112.9px） |
| 语言标签实际渲染 | `en` → `English`（41.38px @12px）；`zh-CN` → `中文`（24px，汉字全角） |

**同行可行性算术**（语言 + 8px 间距 + 主题胶囊 vs 171px）：

| 语言 | 语言切换宽 | 整行宽 | 余量 |
|---|---|---|---|
| 英文 `English` | 97.38px | 145.38px | **+25.62px** ✅ |
| 中文 `中文` | 80.00px | 128.00px | **+43.00px** ✅ |

折叠 rail 同行可行性（vs 39px）：

| 组合 | 宽 | 结果 |
|---|---|---|
| 图标态 + 图标态 | 38 + 8 + 38 = 84px | ❌ 溢出 45px |
| 图标态 + 图标态（gap=0） | 76px | ❌ 溢出 37px |

→ **折叠态物理上放不下任何横排组合**，竖排是唯一解。

高度差：语言 30px vs 胶囊 22px，**差 8px**，不满足用户「高度相同」的要求。

**对齐结论（已定稿）**:
- 首页从底部组提到顶部组打头 → `[首页, 预览, 工具, 环境变量, 任务, 插件]`；底部组剩 `[诊断, 设置]`，保留分隔线。路由不动（`/` 已是 HomePage，本次只是让导航顺序与路由事实对齐）。
- 主题切换：去掉「主题/Theme」文字标签 + 去掉外层带框容器，**保留 sun/moon 胶囊本体**。
- 胶囊高度 22px → **30px**，与语言切换严格等高，knob 保持 16px 垂直居中。
- 同行布局：**语言在左、主题在右，贴两端**（justify-between）。
- 语言切换保持原样（globe + 当前语言 + chevron + 外框），用户明确不扩大改动范围。
- **展开横排 / 折叠竖排**（rail 39px 的物理约束）。
- footer 上方 `border-top` 分隔线保留。
- 溢出防御：`.current` 的 `max-width` 从 84px 收紧到 **67px**，防止将来加长语言名（如 "Simplified Chinese" 106px）时整行溢出被 `overflow: hidden` 静默裁掉。

**拟定 issue**: 标题 ~"Sidebar: move Home to the top of the nav; theme switcher loses its label and box, sits inline with the language switcher"，labels: enhancement, v1。

---

## Issue 2: 折叠侧边栏时语言切换菜单被裁掉

**用户原话**: 「折叠的时候，点击语言切换，菜单内容被遮住了」

**代码调查结论（Explore 子代理实测）**:

**根因**：`.sidebar` / `.sidebarCollapsed` 有 `overflow: hidden`（`PageShell.module.css:26`）。裁剪链上**只有这一个**裁剪祖先（无 transform / filter / contain 创建包含块），popover 的最近定位祖先是 `.root`（relative）。

**裁剪算术**：

| | 可见宽 | 菜单跨度 | 结果 |
|---|---|---|---|
| 展开态 | 195px | 24 → 144px | 0 裁剪 ✅ |
| 折叠态 | 55px | 16 → 136px | **裁掉 81px（67.5%）** ❌ |

菜单宽 120px（`min-width` 决定），锚点因两层 8px 内边距落在 x=16px，裁剪边界在 x=55px → 只剩最左 39px，约等于每个选项头一两个字符。

**为何只有语言菜单中招**：
- 导航项悬浮提示用**原生 HTML `title`**（`PageShell.tsx:166`），浏览器画在 DOM 之外，**不受裁剪**。
- 主题切换折叠态是「点一下直接切」（`ThemeSwitcher.tsx:33-47`），**没有菜单**。

**不是层级问题**：popover 有 `z-index: 20`，但祖先裁剪发生在层级计算之前，调 z-index 无效。

**性质升级**：此 bug 违反 `ui-ux-rules.md:27`「折叠侧边栏只隐藏标签、不隐藏能力——语言、主题、每个页面都要保留图标入口」。折叠后语言切换实际不可用，**属规则合规问题，不只是显示瑕疵**。

**建通用浮层机制的前置调研**:
- 硬规则：`ui-ux-rules.md:47`「弹层和菜单渲染在应用窗口内；绝不用独立 overlay 窗口」→ portal 挂 `document.body` 满足此规则。
- **迁移即崩的坑**：两个 popover 的 click-outside 都靠 `rootRef.contains(e.target)` 判断。portal 后 popover 渲染到 `rootRef` 之外，**点菜单内部会被误判为「点在外面」而立即关闭**。必须改为 trigger ref + portal 容器 ref 联合判断。
- **z-index 倒置隐患**：popover 硬编码 `z-index: 20`，而 `--z-deck` 是 40。现在不冲突（popover 在侧栏、deck 在底部），portal 到 body 级后若重叠会被执行面板盖住。需新建 `--z-popover`（介于 40 与 100 之间）。
- **两个 popover 行为有分歧**：语言菜单向上弹 / 目录菜单向下弹；语言有 icon-only 变体、目录没有；目录菜单每项还带删除按钮（"一项多动作"）→ primitive 必须可配置，不能强制统一。
- 依赖现状：React 19，**零定位库、零 UI 库**，全手写 CSS Modules。
- 4 个 ADR 均不约束浮层，建机制不会推翻既有决策。
- 文档缺口：`ui-ux-rules.md` 对浮层的焦点行为、键盘导航、ESC/click-outside、z-index、ARIA **完全沉默**——这正是需要补规范的地方。

**对齐结论（已定稿）**:
- 建**通用浮层机制**（portal 化），而非给语言菜单打补丁。
- **手写 `createPortal` + 自定位，零新依赖**（贴合项目零依赖风格；当前两个场景位置固定，边缘碰撞简单）。否决引入 `@floating-ui/react`（会打破零依赖风格且需新开 ADR）。
- 能力边界：portal + 定位 + 修 click-outside 误判 + **顺带补齐键盘导航 / 焦点管理 / ARIA**（做成 primitive 就该定规范，否则将来每个新浮层仍会发散）。
- 目录切换菜单（`DirectoryIndicator`，目前无 bug）**单独一个 ticket** 迁移，主 ticket 不膨胀。
- 采用 WAI-ARIA Menu Button Pattern 作为无障碍标准；新建 `--z-popover: 60`；保持无入场动画（贴合 `visual-language.md` 的克制原则）；portal 挂 `document.body`；补文档须中英双语镜像。

**拟定 issue**: 标题 ~"Collapsed sidebar clips the language menu: build a portal-based floating-layer primitive"，labels: bug, v1。

---
