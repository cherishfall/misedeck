# v1.0.0-beta.3 反馈记录（已发布为 GitHub issues）

> ✅ 已于 2026-09-01 全部发布到 cherishfall/misedeck：SPEC 父 issue **#34** + tickets **#35~#44**（label: v1 + ready-for-agent，原生 blocking 关系已设置）。
> 映射：Issue 1→#38，Issue 2→#35，Issue 3→#38，Issue 4→#38，Issue 5→#37，Issue 6→#38，Issue 7a/7b→#36，Issue 8→#38，Issue 9→#39，Issue 10→#37。
> 产品逻辑文档：docs/design/product-logic.md（双语）。
> 每个条目：现象（中文原文）→ 对齐后的理解 → 代码调查结论。

---

## Issue 1: 窗口内容展示不全 / body 级横向滚动（已定稿）

**用户原话**: 「窗口展示内容不全，需要手动拉大窗口或者拖动对应的滚动条，我希望有一定的自适应能力，竖向的滚动在内容太多时候我还能接受，横向的实在是影响体验，而且我看taphouse 应用，都是窗口有最小尺寸，不给太小」

**对齐结论**:
- 修复策略：两者都要 —— 布局改流式消除 body 级横向滚动 + 设置窗口最小尺寸（像 taphouse 不给太小）。
- 宽内容取舍：body 永不横滚；RAW JSON/宽表格/日志等在各自容器内局部横滚；导航/页头收缩适配。
- 最小尺寸 & 默认尺寸（现 800×600）：不写死，需"动态计算"——本 issue 只记录需求并标 open-question，方案（运行时 JS 测量 vs 设计期静态计算）留给实现 ticket 再定。

**代码调查结论**（explore agent）:
- `misedeck/src-tauri/tauri.conf.json:13-19`：窗口默认 800×600，无 minWidth/minHeight。
- 主因：`PageShell` 头部导航（`misedeck/src/components/PageShell/PageShell.tsx:40-112` + `PageShell.module.css:11-17`）单行不收缩，英文下 min-content ≈1000px > 800px，溢出穿透到 body。
- 次因：全局无 `box-sizing: border-box` reset；`ActivationBanner.module.css:6-12` `width:100%` + padding 额外撑宽 44px。
- 页面内容本身表现良好（表格有 `.scroller` 局部横滚、JSON 块自包含），爆炸半径仅限 chrome 层。
- 附带：`LanguageSwitcher` `position:fixed` 浮在 ContextBar 上，窄窗口会遮挡。

**拟定 issue**: 标题 ~"Window content overflows horizontally at default size; need fluid layout + content-aware minimum window size"，labels: bug, v1，正文含 open-question 标记（动态尺寸方案待定）。

---

## Issue 2: TasksPage 引用不存在的 CSS design tokens（已定稿）

**来源**: 调查 Issue 1 时顺带发现，用户确认单独建 issue。

**代码调查结论**:
- `misedeck/src/components/.../TasksPage.module.css` 多处引用未定义 token：`--space-7`（:13, :332）、`--color-fg-*`、`--color-beam`、`--color-line-*`、`--radius-sm/md`、`--color-bg-*`。
- `tokens.css` 只定义 `--space-1..6` 等，这些声明静默失效；`.page` 的 padding `var(--space-6) var(--space-7)`（:13）整条无效。
- 影响：TasksPage 多处间距/颜色/圆角实际未生效。

**拟定 issue**: 标题 ~"TasksPage.module.css references undefined design tokens (declarations silently dropped)"，labels: bug, v1。

---

# 第二批：整体 UI/导航反馈（用户 7 点，已逐条对齐）

## Issue 3: ContextBar 重构 —— 显隐逻辑 + 路径大小写 + 命名

**用户原话**: 「如果我选择了目录，最上面应该显示当前的目录，如果我选择的是全局，那就应该不显示这个上下文标签，而且现在显示的路径是全大写，实际路径是有大小写的，这个叫上下文也很怪异，甚至都不如当前目录来的好」

**对齐结论**:
- 选中目录时：显示「当前目录 / Directory」标签 + **原始大小写**路径。
- Global 时：整条 ContextBar 隐藏。
- 命名：弃用「上下文 / Context」，改用「当前目录 / Directory」（注意：CONTEXT.md 词汇表的 Directory context 是领域术语，UI 文案可以不直译，领域术语本身保留）。

**事实备注**:
- 全大写来自 CSS `text-transform: uppercase` 标签样式被套用在数据（路径）上；全项目 94 处 uppercase 是视觉语言的一部分，修复原则：**标签可以大写，数据（路径、版本号、命令）永远不大写**。修复时应全局审计数据展示处，不只 ContextBar。

**拟定 issue**: "ContextBar: hide in Global mode, show real-case path, rename label to Directory; audit uppercase transform on data"，labels: bug, v1。

---

## Issue 4: 语言切换改为紧凑下拉，移至侧边栏底部

**用户原话**: 「语言切换是不是放到左下角或者其他位置更好，参考这种风格，更简洁点也可以，因为之后可能不止中文和英文」

**对齐结论**:
- 形态：紧凑下拉按钮（地球图标 + 当前语言名 + chevron），点击弹出语言列表（参考用户截图，类似 GitHub 的语言菜单），可平滑扩展更多语言。
- 位置：左侧边栏最底部，与主题切换并排（见 Issue 8 侧边栏信息架构）。
- 现状问题顺带解决：LanguageSwitcher 目前是 `position: fixed` 浮层，窄窗口下遮挡 ContextBar。
- 实现时遵循设计最佳实践（用 frontend-design / web-design-guidelines 等设计 skill 把关）。

**拟定 issue**: "Language switcher: compact dropdown (globe icon), anchored in sidebar footer, scalable to more locales"，labels: enhancement, v1。

---

## Issue 5: 明暗主题切换（缺失功能，非回归）

**用户原话**: 「我的light模式和dark 模式切换功能去哪里了，切换图标位置和语言切换放在一起」

**事实**: `tokens.css:115` 已有 `[data-theme="light"]` 完整浅色对位色板（设计语言预设了双主题），但**从未实现切换 UI**——不是丢了，是没做。

**对齐结论**:
- 三态：跟随系统（默认）/ 浅色 / 深色。
- 切换图标放侧边栏最底部，与语言切换并排。
- 实现时遵循设计最佳实践（设计 skill 把关）。

**拟定 issue**: "Theme switcher: wire up the existing [data-theme=light] palette with a system/light/dark toggle in sidebar footer"，labels: enhancement, v1。

---

## Issue 6: Wordmark「MiseDeck」大小写 + slogan 一体化排版

**用户原话**: 「MiseDeck 的图标是不是要放在最上面，区分大小写，而且 mise的忠实gui这个slogan 字体小一点，和图标叠放在一起或者怎么排版，就是MiseDeck和这个slogan是一体的」

**对齐结论**:
- 词标写为「MiseDeck」（区分大小写），不是 MISEDECK 全大写。
- slogan（a faithful GUI for mise）字号缩小，与词标作为一个整体排版，置于侧边栏顶部（见 Issue 8）。

**拟定 issue**: "Brand lockup: proper-case 'MiseDeck' + smaller tagline as one unit at sidebar top"，labels: enhancement, v1。

---

## Issue 7a: 从产品导航移除 Styleguide

**用户原话**: 「为什么多一个视觉系统的tab栏和页面，这个属于内部信息，放出来到产品界面干啥……直接去掉这个」

**对齐结论**: 从产品导航移除；路由保留但仅开发模式可访问（内部设计文档用途）。

**拟定 issue**: "Remove Styleguide from product navigation; keep route dev-only"，labels: chore, v1。

## Issue 7b: 【bug】Styleguide 页面进入后无法返回

**用户原话**: 「点进去还不能返回」

**对齐结论**: 独立 bug——进入 Styleguide 后无法导航回主界面（疑似该页面逃出 PageShell/导航上下文）。修复随 7a 一起或单独均可。

**拟定 issue**: "Styleguide page has no way back to main navigation"，labels: bug, v1。

---

## Issue 8: 【核心】导航重构为左侧可折叠边栏 + 信息架构对齐 mise 模型

**用户原话**: 「工具、任务、预览这个导航栏，我想做成那种放在左侧的边栏，而且有隐藏边栏和显示边栏的切换，而且导航栏的顺序组织一下」「工具和环境变量才是重点」「不要发明新概念」

**对齐结论（分组已定稿）**:
- 顶部：MiseDeck 品牌区（Issue 6）。
- **主组：预览 → 工具 → 环境变量 → 任务 → 插件**（顺序即优先级；环境变量从现 Config 页拆出为一级页面，因为它是本期重点；「配置文件」页保留为 mise.toml 原始视图〔假设，待用户最终确认〕）。
- 底部组：诊断（Doctor）· 设置（Settings）。
- 最底部：语言切换 + 主题切换（Issue 4、5）。
- 整个侧边栏可折叠/展开（折叠后剩图标栏）。
- 概念对齐 mise 官方模型：dev tools / env vars / tasks 三大支柱（https://mise.jdx.dev/），不发明新概念；顺带消解「Tools 页 vs Config 页工具区」的概念重叠。
- 同时解决 Issue 1 的头部导航横向溢出问题（顶部 nav 没了，~1000px 的 min-content 压力消失）。

**拟定 issue**: "Rework navigation into a collapsible left sidebar aligned with mise's model (Preview/Tools/Env/Tasks/Plugins + Doctor/Settings footer)"，labels: enhancement, v1。这是这批里最大的改动，建议作为父 issue 或排在最前。

---

## Issue 9: 执行面板按需显示

**用户原话**: 「这个执行面板一直在，是不是一些tab下没有执行命令的按钮就不要加了，画蛇添足」

**对齐结论**:
- 默认隐藏；有命令执行时自动滑出（含实时日志）；可手动收起/重新打开。
- 纯展示页（无任何命令操作的页面）不出现执行面板。
- 保留 AGENTS.md 红线：所有变更操作仍必须经过执行面板——只是不常驻。

**拟定 issue**: "Execution panel: hidden by default, auto-slides in on command run, absent on read-only pages"，labels: enhancement, v1。

---

# 第三批：产品原则 + 视觉风格转向（已定稿）

## 产品三原则（已写入 AGENTS.md 双语版，替代原单行原则）

1. **CLI 的 GUI 版**：MiseDeck 是 mise CLI 的 GUI 形态——用 GUI 应当能慢慢学会用 CLI，而不是把 CLI 藏起来。
2. **贴合 CLI 的交互**：遵循 mise CLI 的使用逻辑和交互逻辑，不发明 CLI 里没有的产品/交互花样。
3. **只用 CLI 的词汇**：不发明 mise 没有的新概念和新名词（ADR-0004），用 mise 原有的概念和名词构建产品。

（用户原话：「这个总原则可以写进agents.md及相关必要的文档」——已完成 AGENTS.md + zh-CN/AGENTS.md。建 issue 时不再重复。）

---

## Issue 10: 视觉风格整体转向 —— 废弃极客风，改随 mise 官网

**用户原话**: 「light模式和dark模式的视觉风格就参照mise的官网来就行了，这样有一个继承性，废弃原来的极客风，说实话，我看着觉得太千篇一律的web风格了」

**对齐结论**:
- 废弃现有"极客终端风"（mono 全大写 + 青色辉光那一套），light 和 dark 两个模式都参照 [mise 官网](https://mise.jdx.dev/) 的视觉风格，与 mise 品牌形成继承性。
- 影响面：`docs/design/visual-language.md`（issue #33 产物）需整体重写；所有页面换皮；Issue 5 的主题切换直接在新风格上做。
- 具体色板/字体/圆角等从 mise 官网提取，设计阶段做（实现时用 design skill 把关）。

**拟定 issue**: "Visual language overhaul: drop the hacker-terminal style, adopt mise.jdx.dev's look for both light and dark themes"，labels: enhancement, v1。注意与 issue #33 / visual-language.md 的关系要在 issue 里说明。

---

## Open item（非 issue）: 「配置文件」页方案

**用户原话**: 「「配置文件」页你推敲一下，按照你的产品想法来」「不用出原型了……我需要你更自主点，更发挥你的主观能动性，依照我说的原则去强力理顺这个产品的定位、功能设计和交互逻辑」

**对齐结论（已变更，以此为准）**: 不做原型。由 agent 按产品三原则自主推敲配置页乃至整个产品的定位/功能/交互，直接形成方案落进 issue/spec。辅助技能：已安装 lenny-skills 四个产品设计技能（product-vision / defining-product-strategy / writing-prds / product-taste，手动 HTTPS clone 安装到 ~/.cc-switch/kimi-skills，因 npx skills 走 SSH 失败），理顺产品和写 ticket 时使用；前端设计用已有的 frontend-design / design-taste-frontend / web-design-guidelines。
