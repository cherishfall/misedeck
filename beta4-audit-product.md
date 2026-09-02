# MiseDeck beta4 产品逻辑与交互 UX 审查报告

> 判据：AGENTS.md 产品三原则 + ADR-0004 + product-logic.md + CONTEXT.md 词汇表；product-taste 技能框架。
> 素材：`docs/screenshots/beta4-audit/` 16 张截图 + 只读代码核查 + 本机 mise 实况探测。
> 已排除 `beta4-feedback-scratch.md` 已定稿的 Issue 1–8。

## P0 — 无实锤

### X1. 侧边栏导航疑似要点两次才生效（待实机验证）
- 合成点击环境 ~50% 复现：单击导航项只出高亮边框不切换，第二次才导航。普通按钮单击即生效。若为真即导航阻断级缺陷。**列为 beta5 第一个手动验证项。**

### X2. 应用无辅助功能树（a11y 缺陷）
- 整个 WKWebView 内容对 Accessibility 不可见（AX 树只暴露菜单栏），VoiceOver 等完全不可用；UI 自动化工具也全部失效。

## P1

### U1. Env 页对「工具注入」变量开放写操作，教错 CLI 心智模型
- GOBIN/GOROOT/JAVA_HOME 来源为「工具 · GO/JAVA」，但每行都有可编辑输入框 + 保存 + 移除（EnvPage.tsx:182 无条件渲染 EnvRowEditor）。`mise set/unset` 只作用于配置文件 `[env]`；对 tool 注入变量点「移除」必然失败或静默无操作，「保存」会写入 shadow 值——GUI 里学到的操作在 CLI 里是错的。
- 建议：仅配置来源行可编辑；tool 来源行只读 + tooltip 解释（「由 go 工具注入，`mise env` 解析结果」）。

### U2. 卸载无任何确认
- 每行红色「卸载」按钮 onClick 直接派发 `mise uninstall`（ToolsPage.tsx:430-438），一键即发不可撤回。
- 建议：确认对话框写成教学时刻——「将运行 `mise uninstall go@1.27.0`」。

### U3. 工具表「请求」列恒为「—」，数据存在却没显示
- 截图 5 行请求列全为 —；本机实测 `mise ls --json` 有 `requested_version`（go=1.27.0 等）。解析链路（mise.rs:379 → miseTools.ts:60 → ToolsPage.tsx:175）看似完备，疑似字段失配，**待代码复核**。`mise ls` 的核心信息就是 requested vs installed 对照，丢失后 CLI 用户无法预测该列。

### U4. 「后端」列硬编码为 CORE
- ToolsPage.tsx:176 `backend: "core"` 写死。经 npm/aqua/ubi 安装的工具会被误标 core——编造数据比没有更糟（product-logic policy 5「数据如实呈现」）。
- 建议：从 tool 全名（`npm:prettier` 形式）推导；推不出就撤列。

### U5. 诊断页健康检查卡片自相矛盾且配对混乱
- 标签「已激活」旁挂「未激活」徽章（zh-CN.json:305-306，label 与 badge 文案互为反义）；「版 本」竖排折行；SHELL 行值在左、徽章漂最右，读不出从属。（与视觉报告 V5 同源。）
- 建议：标签改名词性（「Shell 激活」「Shims 在 PATH」），徽章只做 true/false；单行 label:value 列表。

### U6. 词汇违规：「上下文/context」「项目/project」遍布 UI 文案
- zh-CN.json:73,116,121,131,178,184,234,264,294,458 + en.json 同位置。product-logic 明文「The word "Context/上下文" is retired from UI copy」；CONTEXT.md Directory context 条目 Avoid: project。
- 建议：随 Issue 1 文案重写做全量清洗（「当前目录」「该目录」即可）。

### U7. 插件页名实不符：侧栏「插件」↔ 页标题「Registry」，且缺已安装插件
- 页眉「MISE / REGISTRY」、标题「Registry」；command hint 宣称 `mise registry · mise plugins ls`，但整页只有 registry 表（PluginsPage.tsx:13），已安装插件列表不存在。CLI 用户点「插件」预期看到 `mise plugins ls`。
- 建议：页面分两个 section——已安装插件（`mise plugins ls`）在上，Registry 浏览在下；标题统一「插件/Plugins」。

### U8. Global 模式信息架构自相矛盾
- 工具/环境变量/设置页在 Global 正常显示全局数据；预览页与任务页在 Global 显示空状态要求选目录（TasksPage.tsx:302 `if (cwd === null)`）。而 CLI 用户在 home 直接跑 `mise ls/env/tasks ls` 全有输出。CONTEXT.md：Global 就是默认的 directory context，不是「无上下文」。
- 建议：Global 时预览页直接展示全局解析结果（顺带消除 Issue 1 的死锁），任务页列出全局任务。

### U9. Issue 4 落地后 Home 页将彻底失联
- PageShell.tsx:100 品牌区是唯一 `<Link to="/">`；Home 路由（mise 状态/引导安装/self-update）存在。product-logic 规定「点品牌区回 Home」——品牌区删除后无入口。
- 建议：Issue 4 ticket 追加验收项：补 Home 入口（底部组加「状态」项，或窗口标题可点）。

## P2

### U10. 「全部升级」在全部最新时仍可点（同视觉 V7，合并）

### U11. 英文界面数据折行断在 token 中间
- `oracle-8` 断成「oracle-」「8」；路径中间断词。违反 product-logic 交互规则 3（容器内滚动或截断+tooltip，而非断词）。（与视觉 V4 同源。）

### U12. 设置页编辑体验与数据类型脱节
- BOOLEAN 用自由文本框编辑；「添加设置」键名无校验无补全。`mise settings ls --all`（实测有此 flag）可做键名 datalist + 布尔改两态选择，既防错又教学。

### U13. 设置页只显示 1 个已显式设置的键
- 是 CLI 默认行为（忠实没错），但发现性是 GUI 附加值：建议加「显示全部（--all）」开关。「1 键」文案改「1 项」。

### U14. 诊断页「更新：可用」无行动出口
- 建议链接到 Home（self-update 职责页）或提供「复制 `mise self-update`」。

### U15. 任务页空状态把用户推回 CLI
- 「或用 `mise tasks ls` 查看全局任务」——教学应发生在 GUI 内。与 U8 联动解决。

### U16. Registry 行无任何操作
- 浏览到想要的工具后路径断裂。建议行操作「安装…」跳工具页预填工具名，衔接 `mise use`/`mise install` 教学闭环。

### U17. 收起态单字母图标语义不明（同视觉 V16，合并）

### U18. Env 页每行常驻编辑器噪音过大
- 数据列与编辑输入框并排重复显示同一份内容，值列被挤压折行。建议默认只读、点「编辑」再展开行内表单。

### U19. 语言下拉是独立 overlay 窗口
- 非常规模式，窗口级截图/自动化会漏，有「点外面不收起/焦点错乱」风险面。建议改窗口内 popover。

## 未覆盖/无法验证

- 执行面板实际运行态（argv + 日志流）的渲染质量未目验（代码确认命令拼接存在，ExecutionPanel.tsx:30-47）。
- Preview 页选中目录后的 trust banner / lockfile / env 解析等完整状态（本次截图均为 Global 空态）。
- 深浅两主题内容一致，未发现主题特有缺陷。
