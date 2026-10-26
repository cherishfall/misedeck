# 全量深度审查报告(2026-10-26)

> 工作底稿(docs/feedback/ 按规免镜像)。委托背景:owner 认为前期(kimi k3 / deepseek-4.1-flash)开发质量不满意,要求全面深度审查。
> **审计基线:本地 `09173ba`(2026-10-22)。本地树已落后 origin master 约 2 天 —— origin 已发 v1.0.1(`c546f75`,2026-10-24)。修复前必须先 `git pull`,行号以 pull 后复核为准。**
> 方法:4 路并行深度审计(Rust 后端逐行精读 + 真实 mise 2026.10.17 二进制实测验证 / 前端 135 个 TS 文件逐行精读 / 测试与 CI 工程 / 架构与文档合规)。所有发现均有 file:line 佐证。

## 总体结论

项目工程底盘远好于 owner 预期:CI 真实跑 clippy `-D warnings` + 全量测试 + 14 个事故驱动的自定义 lint,无孤儿脚本、无空断言测试、供应链按 SHA 固定,ADR 合规度高。**但存在 1 个已实测复现的 P0(核心功能失效)和约 10 个 P1**,集中在:管道读取上限与真实 mise 输出的错配、跨页缓存失效不完整、超时语义错配、Windows 收尾路径的锁护航、以及 AGENTS.md 与 ADR 正文的规则分叉。

---

## P0(必须第一个修)

### P0-1 `mise ls-remote --json` 被 8 KiB 行截断 → upstream 版本列表对所有真实工具永久失效

- 位置:`misedeck/src-tauri/src/mise.rs:401`(`MAX_LINE_BYTES = 8 * 1024`)+ `mise.rs:432-477`(`read_line_capped` 截断)+ `mise.rs:493-514`(`CappedStream` 聚合)+ `mise.rs:1044`(`run_mise_json` 的 `from_slice`)。
- 实测:mise 2026.10.17 上 `mise ls-remote --json node` 输出为**单行紧凑 JSON,51,741 字节**(python 74,716 / go 17,268)。截断后聚合出半截 JSON,`from_slice` 必然失败 → `PARSE_FAILED`。截断通知 `OutputTruncated` 发到空回调(`mise.rs:1037`、`mise.rs:2212`),完全静默。
- 影响面:`useLsRemote`(`src/hooks/useToolsList.ts:135-139`)两条路径(直连 `run_mise_json` 与面板 `run_mise_command`)共用同一 reader,**全断**。版本选择器里所有工具的未安装版本列表永远加载失败。
- 为什么历次审计没抓到:唯一 fixture `tests/fixtures/mise/ls-remote---json-go/stdout` 是手工写的 5 行 pretty JSON,从未覆盖真实 mise 的紧凑单行格式。
- 修复:给捕获型读取(`run_mise_json`、`run_mise_timed` 非流式调用)增加"原始字节模式"——stdout 不按行拆分、不逐行截断,直接读到 EOF,仅保留聚合计(确认 `MAX_STREAM_BYTES` 2 MiB 对 ls-remote 足够);流式面板路径维持现上限。同时把 go fixture 换成真实单行大 payload 作回归。
- 验收:用真实 mise 二进制跑 `mise ls-remote --json node` 走 `run_mise_json` 成功解析;新增大 payload 回归测试。

---

## P1(功能错误 / 边界失效 / 严重退化)

### Rust / 后端

- **P1-R1 只读命令挂 30 分钟超时 ceiling** — `mise.rs:904-914`:`run_mise_tracked_read_only` 用 `STREAMING_TIMEOUT`(30 min),而 `READ_TIMEOUT=120s` 的注释(`mise.rs:46`)明确说读不该是 30 分钟。卡死的 mise(stale NFS、网络挂起)变成 30 分钟僵尸进程 + 永久 spinner,且后台读没有取消按钮。修复:`read_only == true` 的 tracked 运行改用 `READ_TIMEOUT`(或专设更短 ceiling)。
- **P1-R2 Windows 退出时锁内同步等 taskkill** — `process_tree.rs:307-312` + `256-272`:`terminate_all` 持注册表锁逐个同步 `.status()` 等 `taskkill` 退出,大进程树串行数秒,期间所有 runner 线程的 `try_wait`(同样持锁)停摆。修复:锁内只收集 group id 快照,释放锁再 kill;或 Windows 分支 `spawn()` 后不等。
- **P1-R3 启动时主线程同步跑 `locate_mise()`** — `lib.rs:949-957`:PATH 含 stale 网络挂载时窗口启动卡数秒。IPC 路径上同类探测已因同样理由移到 blocking pool(`lib.rs:469-477` 注释自证)。修复:启动探测移到 `spawn_blocking`。
- **P1-R4 `locate_mise` 不校验可执行位且不回退** — `mise.rs:213-220`:well-known 路径上一个失去执行位的 mise 被选中 → EACCES → `COMMAND_FAILED "failed to spawn mise"`,不试下一个候选、不给 `MISE_NOT_FOUND` 引导。修复:unix 候选过滤非可执行文件(`mode() & 0o111`),或 spawn 失败为 `PermissionDenied` 时继续探测。

### 前端

- **P1-F1 mutation 后 invalidate 不完整 → 跨页缓存最长 30 秒与 mise 实际状态脱节** — `src/pages/ToolsPage/ToolsPage.tsx:257-259`(+ `TasksPage.tsx:339`、`SettingsPage.tsx:163`、`PluginsPage.tsx:101/120`)。`mise use/unuse/install`、`tasks add`、`set/unset`、`settings set`、`plugins install/uninstall` 都改写 mise.toml(部分改 mise.lock / 可用工具集),但各页只 invalidate 自己的列表 key。`["tools","config",cwd]`/`["tools","lockfile",cwd]` 全库只有 DirectoryPreview 自己刷新;`["env","ls",cwd]` 等在版本切换后不失效。全局 `staleTime: 30_000`(`src/main.tsx:33`)放大成 30 秒脏读。对一个把 data honesty 写进硬规则的项目这是规则级违背。修复:收敛共享助手 `invalidateConfigDependents(queryClient, cwd)`(覆盖 tools/config、tools/lockfile、env/ls、tools/env、tools/ls、tasks/ls、plugins/ls),所有写命令成功分支调用。
- **P1-F2 未安装区最新版本渲染两行、action 相同** — `src/pages/ToolsPage/AddToolSection.tsx:325-338`:先 pin `{kind:"latest", version:newestRemote}` 一行,循环又把全部未安装远端版本 push 一遍,没有 skip `newestRemote`。两行 rowKey 不同(`@latest` vs `@remote:`),两个按钮派发完全相同的 `mise use <tool>@<version>`。修复:循环 `if (item.version === newestRemote) continue;`(若"别名教学 + 具体行"是有意设计,则具体行应降级为不可操作信息行)。
- **P1-F3 Exit 通道事件丢失 → run 永久卡 running 且不可移除** — `src/components/ExecutionPanel/useExecution.ts:316-328` + `executionState.ts:214-220`:前台 run 成功返回后只 dispatch `complete`(仅写 `newVersion`),终态完全依赖 channel 的 Exit 事件;事件丢失则 `RunEntry.status` 永远 "running",受 running 保护(`executionState.ts:267/279`)删不掉,面板留僵尸 chip。修复:reducer 的 `complete` 分支若 run 仍为 running,用 invoke 返回的 `result.outcome`(有 exitCode/durationMs)落终态 —— invoke 结果本身就是权威兜底。
- **P1-F4 语言切换重跑 shell 探针并打回 loading** — `src/state/activationContext.tsx:198-223`:`runProbe` 依赖 `t`,切语言时 `shell_activation_check` 重发、激活横幅闪 loading。修复:错误信息存原始 key、渲染期再 resolve(trustContext.tsx:137-139 已是正确写法),或 `t` 存 ref、effect 只依赖 `[]`。

### 测试 / CI

- **P1-C1 `cargo fmt --check` 全仓库缺失**(workflow 与 ci.md 零命中;clippy 不覆盖格式)。修复:ci.yml rust job 加 `components: clippy, rustfmt` + `cargo fmt --all -- --check` 步骤。
- **P1-C2 macOS 专属 Rust 代码发布前从不编译** — ci.yml Rust 覆盖仅 ubuntu(完整)+ windows(`--lib` + smoke);`lib.rs:979-990` 的 objc 无障碍桥首次编译发生在 release tag 构建上。对"macOS polished first"的产品不可接受。修复:加轻量 macOS `cargo check` job(3-5 分钟)。
- **P1-C3 Windows 进程树击杀无行为测试** — `tests/runner.rs:377-382` 注释自认;unix 侧有真实孙进程击杀测试,Windows 只有编译烟测,而这是取消/超时核心路径。修复:windows job 加 PowerShell 子进程模拟的 tree-kill 行为测试(`#[cfg(windows)]` 门控)。
- **P1-C4 React 渲染/交互层零测试** — 28 个 TS 测试全是纯函数;组件把逻辑接回 DOM 的那层无覆盖(无 @testing-library/react / jsdom)。属项目"静态优先"的自觉选择,但结合 beta UI 缺陷史是最大未覆盖面。修复(可选、量大):为 ConfirmDialog / ExecutionPanel 状态接线先补最小渲染测试。

### 架构 / 文档

- **P1-D1 AGENTS.md 复述 ADR-0005 已与 ADR 正文分叉** — AGENTS.md Non-negotiables 写 "Every mise invocation goes through the execution panel"(zh 镜像同),但 `docs/adr/0005:27` 明确豁免非 ls 家族读命令(`outdated`/`env`/`config ls`/lockfile/tasks/plugins 走各自命令,代码亦如此)。按 AGENTS.md 字面审计会把合规代码判违规。修复:AGENTS.md 改链接式表述,ADR-0005 豁免清单补上 doctor/registry/trust --show 三个实际豁免项,双语同步。
- **P1-D2 "use" 用词三处分叉、en/zh 实际不对齐** — CONTEXT.md 规定动作用 Use/使用、Avoid 含 enable/activate;但 `zh-CN/README.md:22` 译作"启用",`zh-CN.json:212` "已安装并启用" vs `en.json:212` "installed and activated"(activate 与 enable 互不对齐,均在 Avoid 清单)。修复:zh README 改"使用";为 use 后的状态描述定统一词(mise 概念是 active/激活),CONTEXT.md Use 条写明,三处同步。
- **P1-D3 HANDOFF.md 过时** — 仍写 "#239 open, no ready-for-agent left";实际 #239 已关、拆出 #281(open、无标签),v1.0.1 已发。修复:pull 后重写 CURRENT STATE,给 #281 补状态标签。

---

## P2(择机修)

- `mise.rs:708-858` 与 `install.rs:143-275` 流式主循环约 90 行复制,任一侧修复(含 P0-1)极易漏改另一侧 → 抽成基于 `ChildGuard` 的通用循环。**修 P0-1 时顺手做,否则 P0-1 要修两遍。**
- `tauri.conf.json:21` CSP `default-src 'self'` 使 release 包内联 style 属性失效:`ExecutionPanel.tsx:369` 的 `style={{maxHeight}}` 只在打包版失效(dev 无此 CSP,恰好躲过自测)→ 改 CSS class + custom property,**不要放宽 CSP**。
- `mise.rs:1894-1897` 对任何 `COMMAND_FAILED` 都二次跑 `registry` 明文回退(真实失败会再等 120s 且可能覆盖原始 stderr)→ 仅对 exit=2/usage 或 PARSE_FAILED 回退。
- `update.rs:150-154` / `install.rs:72` 非 Windows 用裸名 `curl`/`sh` 查 PATH → 至少对绝对路径做存在性 fallback。
- `process_tree.rs:335-349` spawn 成功与注册表 insert 之间存在 App 退出竞态窗口(极窄)→ 退出时延迟二次 sweep。
- `mise.rs:224-234` `extract_date` 拒绝预发布后缀(`2026.1.0-rc1` → 误判 MISE_TOO_OLD)→ 第 3 段剥 `-` 后缀。
- `lib.rs:373/380/392/950` `MISE_BINARY` 锁用 `.expect("mise path mutex poisoned")`,违 conventions("command code 里 expect 是 bug";当前临界区确实安全,属潜在违例)→ 照 `process_tree.rs:120-124` 的 `unwrap_or_else(|p| p.into_inner())`。
- `capabilities/default.json:8-11` `opener:allow-open-path` 同时列 `$HOME/**` 与 `**`,前者冗余、作用域形同虚设 → 删或真收窄。
- 前端:`DirectoryIndicator.tsx:83-108` hint 提示行可永久卡死(切语言清了定时器没清 hint state);`Table.tsx:209-214` setState updater 里做副作用(StrictMode 双写持久层)+ `sortedRows` memo 因 columns 每渲染新引用而失效(大列表每帧重算,`useTableFilter.ts:38-44` 同类);`AddToolSection.tsx:201-216` ls-remote 派发无 in-flight 守卫(可重复后台派发);`TasksPage.tsx:460` map 形参 `t` 遮蔽 i18n `t`;`ExecutionPanel.tsx:90-112` 拖拽 resize 的 window 监听无卸载清理(理论性)。
- CI:`@types/node ^26.6.2` 与 CI Node 22 运行时错位 → 降 `^22`;ubuntu frontend job 与 windows job 检查集人肉同步(4 个 lint 只经 windows 的 `npm run ci` 间接跑)→ ubuntu 也改跑 `npm run ci` 单一事实来源;`update.rs` 真实 curl 分支无覆盖(可接受,记录在案)。
- 仓库:`docs/.DS_Store`、`docs/screenshots/.DS_Store` 已提交 → 删除并加 .gitignore;`docs/design/ui-ux-rules.md:130` 指向 product-logic.md 的 "owned by" 指针悬空(uninstall `--all` 禁令实际在 CONTEXT.md)→ 补或改指。

---

## 检查过且干净的方面(仓库硬性要求,一并报告)

- **管道死锁**:stdout/stderr 独立 reader 线程 + 有界 channel + 双层上限,孙进程持管道由 READER_SHUTDOWN_BOUND 覆盖(#222 修复完备,除 P0-1 所述上限值本身)。
- **取消与进程树语义**:flag-based cancel、无 pid-reuse 击杀、unix setsid+killpg / Windows CREATE_NEW_PROCESS_GROUP 正确且有测试(除 P1-C3 的 Windows 行为测试缺失)。
- **shell 注入面**:mise 一律无 shell 直 spawn,argv 纯数据;Windows cmd /c start 用 cwd、System32 绝对路径,均正确。
- **external_link.rs**:scheme/控制字符/2048 上限,fail-closed,测试覆盖全面。
- **update.rs 决策面**:不下载不安装(ADR-0009),semver 排序、feed-shape 门禁、截断防护正确。
- **Tauri 配置**:release 无 devtools 泄漏、无危险项、capabilities 仅 clipboard/dialog/opener,无 shell/fs/http 权限。
- **前端类型安全**:全库零 `any`/`@ts-ignore`/非空断言;边界一律 `as unknown` + 类型守卫,不合约形状返回 PARSE_FAILED。
- **执行面板垄断**:grep 全部 `@tauri-apps` 导入仅 7 处批准 carve-out,invoke 唯一入口有 lint 守护。
- **reducer 纯度 / 定时器配对 / 键盘焦点**:executionState 终态守卫完备;监听器配对清理;ConfirmDialog capture-phase 键处理、焦点陷阱/归还正确。
- **i18n**:en/zh-CN key 树完全一致(0 差异),插值参数一致,文案走 I18N_KEYS。
- **测试质量**:TS 28 文件 247 用例 0 空断言;Rust 92 单测 + 190 集成 + 61 fixture;无过度 mock(fixture-mise 走真实 Command 全链路)。
- **CI/供应链**:clippy `-D warnings` 真跑;actions 按 SHA 固定;permissions 最小化;三平台 release matrix;版本六处同步;ci.md 与 workflow 逐项吻合无漂移。
- **ADR 合规**:9 条 ADR 逐条核对,代码全部合规(唯一问题是 AGENTS.md 复述分叉,非代码问题)。
- **zh-CN 镜像**:md 层面 1:1 完整,抽查无实质分叉(缺图属合理共享设计)。

---

## 给修复模型的执行路线

1. `git pull`(本地落后 origin 到 v1.0.1,行号需复核)。
2. **第一批(一个 PR):P0-1 + P2 的流式循环去重**(不先去重则 P0-1 要修两遍)+ 真实大 payload 回归 fixture。
3. **第二批(Rust 体验):P1-R1、P1-R3、P1-R4**(都是小改动:换超时常量、spawn_blocking、可执行位过滤)。
4. **第三批(前端数据一致性):P1-F1(共享 invalidate 助手)、P1-F3(complete 落终态)、P1-F2、P1-F4。**
5. **第四批(CI 补漏):P1-C1 fmt、P1-C2 macOS check job、P1-C3 windows tree-kill 测试。**
6. **第五批(文档治理):P1-D1、P1-D2、P1-D3、HANDOFF 重写、.DS_Store。**
7. P2 清单择机分批;CSP 内联 style 项在修时需标记"not visually verified"(仓库规则:agent 不做视觉验证)。
