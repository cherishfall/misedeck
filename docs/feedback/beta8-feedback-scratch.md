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
