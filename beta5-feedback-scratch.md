# v1.0.0-beta.5 反馈记录

> ✅ **第一批（2 条）已于 2026-09-03 发布到 cherishfall/misedeck**：SPEC 父 issue **#61** + tickets **#62~#64**（label: v1 + ready-for-agent，原生 blocking + sub-issue 关系已设置）。
> 映射：Issue 1（首页位置 + 底部控件行）→ **#62**；Issue 2（折叠态语言菜单被裁）→ **#63**（建浮层 primitive + 迁移语言菜单 + 补齐无障碍）+ **#64**（目录菜单迁移，纯技术债，独立排期）。
> 阻塞链：**#63 ← #62；#64 ← #63**（#62 可立即开工）。
> 每条：用户原话（+截图）→ 代码调查结论 → 对齐后的理解 → 定稿。
> 本次采用「grill with docs」方式逐条拷问：**先量数据、再拷问**，不在没有事实的情况下让用户做判断题。
> 截图：用户直接粘贴，未落盘（见对话上下文）。
> ⚠️ 本批为 beta5 反馈的第一批，后续反馈将开新的 SPEC + ticket 批次。

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
