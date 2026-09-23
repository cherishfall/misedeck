# beta15 pre-release audit（2026-09-23）

> 发正式版前的全维度深度审查。5 个并行 subagent 分别覆盖：前端代码 bug / Tauri 后端 / UI 视觉一致性 / i18n / 用户旅程。
> 基准：HEAD（含 #194–#200 全部实现）。本文是审计结论记录，exempt from zh-CN mirroring。

## 总评

- **P0 = 0**：无崩溃、无数据损坏、无注入面。argv 全数组传参、panic 面干净、token 卫生全绿（4 个 lint 守卫通过 + 人工补扫硬编码）、i18n 守卫全绿。
- 近三个迭代专项（#195/#197/#199/#200）实现质量高，UI 审查确认 #195 无 panel 套 panel 残留、#197 header 合规、#200 删得干净。
- 真正的债集中在三族：**「失败反馈被吞」**（3 份报告交集）、**「错误态/重试态配方分叉」**（7 份逐页拷贝的 error 配方）、**「软取消的後遺症」**（前端 reducer + 后端无 kill）。

---

## P1 — 发版前应修（按修复成本从低到高）

### A. 状态机 / 反馈链路（前端）

**A1. PageShell 只读页 dismiss effect 吞掉失败面板**（3 份报告独立点名，最高优先）
- `PageShell.tsx:50-54`：effect 在 `status !== "running"` 时无条件 `dismiss()`。
- 后果：fail 自动开面板（ui-ux-rules 明文契约）→ 同一 effect 立即 dismiss，失败反馈在它自己的自动打开路径上被撤销；用户手动打开的面板也会被拽走。
- 波及：/preview trust 失败、/plugins 插件安装失败（/plugins 不该在 READ_ONLY_PATHS 里——它有前台 mutation）、安装中切到只读页的任何失败。
- 修法：dismiss 条件改为「进入只读页且无活动 run」时触发一次，不跟随 status 变化；把 /plugins 移出 READ_ONLY_PATHS。

**A2. 软取消后 exit/line 事件覆盖 cancelled 状态**
- `executionState.ts:138-159`：`exit`/`line` 分支不检查 run 当前 status。
- 后果：① cancelled 被改写成 ok/failed（取消语义丢失）；② exitCode≠0 时 `isOpen:true` 把用户已 Dismiss 的面板强制弹开；③ line 继续往 cancelled run 追加日志。
- 修法：reducer 对 `status !== "running"` 的 run 忽略 exit/line（一行守卫）+ 补 "exit after cancel" 测试用例。

**A3. TaskForm 草稿重置缺 editing 守卫**
- `TasksPage.tsx:765-770`：依赖数组含 `task?.run`/`task?.depends`（refetch 后必变），且无 EnvPage/SettingsPage 同类编辑器都有的 `if (!editing)` 守卫（#58 约定）。
- 后果：编辑任务时任何 refetch 静默清空正在编辑的草稿。
- 修法：补一行守卫，对齐 Env/Settings 同类。

**A4. Tasks/Settings 计数 hint 无失败态（违反 #199 刚立的规则）**
- `TasksPage.tsx:548-555`、`SettingsPage.tsx:254-258`：`data ? count : t(common.loading)`，读失败永久「加载中…」，与下方错误块同屏自相矛盾。#199 的四态规则条文点名禁止。
- 修法：对齐 OutdatedHint 四态分发（muted 失败文案 + retry）。DoctorPage 已合规可顺手统一。

**A5. trust 探测 error 态 = 全站 mutation 静默死按钮**
- `trustContext.tsx:287-289` + `TrustBanner.tsx:56`：目录被删/失权后 trust 探测失败 → guard 挡掉一切写操作，但 TrustBanner 只在 `untrusted` 渲染——error 态下所有按钮点了没反应且无任何解释。
- 修法：error 态也渲染一条 muted 横幅（说明探测失败、写入已禁用）。

### B. UI 配方一致性

**B1. EnvPage 错误态是全仓离群配方**
- `EnvPage.module.css:70-103`：中性边框 + 非 mono label；其余 6 页统一 danger-tint + mono label + breach stderr。
- 修法：对齐共用配方（或抽共享 ErrorState 组件，消除 7 份拷贝——抽组件可顺带修 B2/A4 的分叉根源，建议本次先对齐、抽组件另排）。

**B2. TasksPage stderr 用 10px label 字号 + 横向滚动**
- `TasksPage.module.css:102-114`：违反 Typography（data 恒 12px `--size-data`）+ scroll container 条文。
- 修法：改 `--size-data`、删 `overflow-x: auto`。

**B3. 同页两个 retry 两副面孔 + 同语义两个 key**
- `OutdatedHint.tsx:40-48`（ghost + `common.retry`）vs `AddToolSection.tsx:711-719`（secondary + `tools.addTool.retryButton`），两 key 字符串完全相同。
- 修法：统一 ghost + `common.retry`，退役 `tools.addTool.retryButton`。

### C. i18n（P1 五条，全是守卫盲区）

| key | 问题 | 修法 |
|---|---|---|
| `env.confirm.renameOverwrite.body` zh:317 | 「用当前值覆盖它的现有值」语义反了 | 「重命名会用新值覆盖它的现有值」 |
| `tools.confirm.link.directoryNotFound` en:186 | "Pick again"（#194 漏网） | "Choose again." |
| `env.confirm.unset.body` en/zh:305 | 退役词 Context/上下文（全仓唯一违例） | "for the current directory" / 「当前目录」 |
| `common.outdatedCount` en:11 | 无 `_one` 复数 → "1 tools outdated" | en 补 `outdatedCount_one`，zh 同步补 parity |
| `settings.success.unset` zh:433 | 「已取消设置」vs 同族全用「移除」 | 「{{key}} 已移除」 |

### D. Tauri 后端（低成本必改）

**D1. `opener:allow-open-path` capability 缺失 → Tasks 页「打开任务文件」必报权限错**
- `capabilities/default.json` 只有 `opener:default`（不含 open-path）。前端 `TasksPage.tsx:270,320` 调 `openPath`。
- 修法：capability 加一行 `opener:allow-open-path`。

**D2. CSP 为 null**
- `tauri.conf.json:24`。渲染 mise 原始输出（工具名/stderr/配置内容），CSP 是最后防线，官方发布检查单要求非 null。
- 修法：最小 `"default-src 'self'"` 起步。

**D3. 版本号 bump**：`tauri.conf.json:4` + `Cargo.toml:3` 仍是 beta.14（流程项，勿漏）。

### E. 决策项（owner 定）

**E1. Windows `locate_mise()` 必然失败**
- `mise.rs:112-127`：只读 `HOME`（Windows 无此变量）、只有 Unix 路径、缺 `.exe`。`bundle.targets: "all"` 会出 Windows 包。
- 选项：① beta.15 不发 Windows 包（targets 收窄到 macOS/Linux/dmg 等）+ 发布说明声明；② 修 locate（`USERPROFILE` + `.exe` + AppData 路径）——成本中等。

**E2. 软取消的后端另一半：无 kill IPC + kill 不杀进程树**
- `useExecution.ts:245-254` 注释自认 soft cancel；`lib.rs:229-281` 无取消句柄；`mise.rs:360-410` kill 只杀 mise 不杀任务子进程 → 任务派生长驻子进程时 `join()` 可能永久挂死、面板卡 running 直到重启。
- 建议：**不做进 beta.15**（进程组 kill + killpg/Job Object 是一个独立 feature），发布说明披露「Cancel 不会终止进程，进程将后台跑完或等 30 分钟上限」。相关 E2 风险（Tasks 跑 dev server 类任务）在 A2 修复后 UI 表现已诚实。

**E3. 发版定位**：beta.15 还是 1.0.0 正式版？影响 tag 命名与发布说明口吻。

---

## P2 — 记录在案（下个批次清）

### 前端 bug / 边界
1. `DirectoryPreview.tsx:193-196,443-472`：lockfile pending 时渲染空 `<pre>`（`!== null` 应为 `!== undefined` 哨兵统一）。
2. `commandEcho.ts:43-45`：`-C <cwd>` 不加引号，含空格路径的 echo 不可派发（纯展示，违反 #72 自我声明）。
3. 拖拽未处理 pointercancel：`ExecutionPanel.tsx:77-96`、`Table.tsx:187-214`（userSelect 残留一次交互）。
4. 两处无清理 setTimeout：`ActivationBanner.tsx:150-162`、`DirectoryIndicator.tsx:78-81`（React 18 无警告，记录）。
5. `AddToolSection.tsx:263`：全仓唯一非空断言 `activeRows[0]!`（有前置守卫，建议 `?.`）。
6. ExecutionPanel 切 run 时吸底不重置（`ExecutionPanel.tsx:99-102`，stickToBottomRef 跨 run）。

### 后端
7. Windows `cmd /c start` 对含 `&`/`^`/`%` 目录名出错甚至拆命令（`shell.rs:457-477`，自伤面）。
8. 后端无 per-family 并发再保险；config.toml 并发写 last-writer-wins（`lib.rs:229-281`，设计上靠前端）。
9. tauri-plugin-shell 完全未使用却是活配置面（`"shell": {"open": true}` + shell:default 权限）——发布最小化应整体移除。
10. `MISE_BINARY` 缓存永不失效（换包管理器装法后需重启，`lib.rs:156`）。
11. `which_exists` 无超时（Windows pwsh 冷启动可挂数秒，`shell.rs:178-192`）。
12. runner 线程 panic 时子进程孤儿（`lib.rs:264-270`，kill-on-drop 可缓解）。
13. 死代码：`mise.rs` 三处 `outcome.timed_out` 检查不可达；`cwd: Some("")` 无防御校验。

### UI 漂移
14. TasksPage 整页间距偏大一号（`.page` gap 26px vs 其余 22px 等 3 处）。
15. 未记载的第三档 radius 6px（Button/IconButton/ConfirmDialog/ActivationBanner）——补 token 或补文档。
16. focus ring 透明度两种（beam 30% vs 25%）——抽 `--ring` token。
17. `Button.tsx:6-7` 头注释与实际变体定义矛盾（注释漂移）。
18. IconButton 的 ghost 分支查不存在的 class（恰巧无害的隐形成功）。
19. 三个 section 级表面用 50% 半透明 panel，与「solid --panel」条文相左（有意变体但未记载）。

### i18n P2（19 条，择机打磨）
`labels.binary` zh 丢「二进制」限定；`tools.addTool.created` en `Created` 应 `Released`；`tasks.countFiltered` zh 机翻感；`tools.columns.requested` zh 生硬（需定词）；`doctor.status` en `Ok/Warn` 应 `OK/Warning`；`states.parseFailed` 英式拼写 + 小写；`states.notInstalled.body` 全仓唯一第一人称；`common.outdatedError` 缩写应全拼；self-update 两处句式不一致；`execution.statusFailed*` zh 半角括号；「引导安装/引导式安装」「更新版本/自更新」同概念多词；`doctor.hint` zh 直译腔；`tools.missing.body` / `doctor.missing.body` zh populate 直译；`tools.addTool.activeBadge` zh「活动」生硬；`plugins.installForm.explanation` zh 直译；`trust.banner.body` env 不会「运行」；`preview.title` 全仓唯一 Title Case；`env.*Placeholder` 大小写不一；`activation.bannerBody` zh 丢「交互式」。

### 旅程观察（产品向，另排）
20. tooOld 态只给 self-update，包管理器安装的用户没有重装出路（`HomePage.tsx:324-357`）。
21. 引导安装后「自动翻转到 ready」依赖 PATH 探测，发版前在干净机器实测一次。
22. 目录模式 use 全局激活工具后，并存冲突无提示（in-use 区过滤掉 global 行）。
23. use 确认正文未披露写入目标文件（靠命令 echo 教学）。
24. 卸载最后一版后 Tooltip 说「只安装了一个版本」（0 版本撒谎，`ToolsPage.tsx:855-867`）。
25. 卸载 active 版本无后果说明（config request 保留、symlink 悬空）。
26. 失效目录无校验/引导（recents 与持久化 context 均不校验存在性）。
27. Tasks 失败无行级标记；所有 Run 按钮共享一把 taskRun 锁（串行化有意但未注明）。
28. Settings Global 模式 `unsetInScope` 过宽（source 行可能静默 no-op）。
29. 全 App 无 ErrorBoundary（渲染异常白屏，建议根部包一层 + 回 Home 错误态）。

---

## 查过干净的维度（审计留痕）

- **注入面**：全部 spawn 数组传参，零 shell 拼接；validate_run_args 旗标 tripwire 正确。
- **panic/unwrap**：生产代码全部不可达或良性；后台 panic 转结构化 COMMAND_FAILED。
- **超时矩阵**：无无超时命令（检测 10s / 读 120s / 流式 30min / 安装脚本 5min）；pipe 满死锁不存在（双读线程）。
- **token 硬编码**：零 hex/rgb；spacing/font-size/tracking 100% token（lint 实测 + 人工补扫）。
- **按钮变体语义**：primary/danger/secondary/ghost 使用全部合规。
- **图标字形**：无 emoji 图标；glyph 使用全部在文档豁免清单内。
- **暗色模式**：零硬编码颜色，两主题自动换算无漏。
- **硬编码文案**：全 src 无中文字符串字面量；#194-#200 触及组件无 Pick 残留（唯 D 级 i18n 一处漏网）。
- **「主目录」**：全仓无「家目录」残留。
- **插值**：40+ 带参调用点与 {{var}} 全匹配（含 Rust 侧 KNOWN_MESSAGE_KEYS）。
- **{kind:"err"} 处理**：全部 useParsed* 走 error 分支；invoke 错误全有 toErr/失败 UI。
- **环境变量页写入旅程 / 诊断页全链路 / 执行面板主体生命周期 / 安装工具三大并发分支**（切页/切目录/关面板）：逐一走查无恙。
- **trust 解析 Windows 盘符 / Global 模式 home 锚点**：实现正确。
- **最近 10 commit Rust diff**：无回归。
