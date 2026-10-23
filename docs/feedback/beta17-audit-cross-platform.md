# beta17 cross-platform static audit（2026-10-21）

> 背景：owner 手上没有 Windows / Linux 实机，要求先做**纯静态**的跨平台审查 —— 不看视觉效果，
> 只看「代码里写死了 macOS 的地方」。
> 基准：master `5e3f1ca`（beta.16 + #234–#237 已合入）。
> 范围：`misedeck/src-tauri/src/*.rs`（5042 行）、`misedeck/src/**`（TS/TSX/CSS）、
> `index.html`、`tauri.conf.json`、`.github/workflows/*.yml`。
> 本文是审计结论记录，exempt from zh-CN mirroring。

## 结论摘要

- **P0 = 0**：没有「Windows 上直接起不来」的构造性缺陷。#208/#229 那一轮的修复（`dirs::home_dir()`、
  `mise.exe`、PATH 扫描、cmd.exe 引用注入）是有效的，`windows-latest` 上的 `cargo test --lib` +
  `cargo build` 也在 CI 里跑着。
- **P1 = 4**：都不阻断启动，但 Windows 上用户第一分钟就能看见/踩到。
- **P2 = 8**：Linux 特有 + 显示细节，可随下次发版收敛。
- 真正的债集中在三处：**①GUI 进程 spawn 控制台程序的窗口抑制**（Windows 每条命令都闪黑框）、
  **②webfont 被自家 CSP 拦掉**（字体在三个平台各回退各的）、
  **③「终端」这类平台专属动作只在 macOS 上做对了**。

---

## 已确认干净的面（查过，没问题）

这一节和 P1/P2 同等重要 —— 说明这些类不用再返工：

- **路径比较**（`src/utils/paths.ts`）：`\` 归一、大小写折叠、`C:/` 盘根恢复、UNC `\\` 识别、
  段感知的 `isPathUnder`（`/foo/bar` 不会误判 `/foo/barbaz`）。`settingsUnsetScope.ts:41` 的
  `lastIndexOf("/")` 在归一之后的字符串上跑，安全。
- **进程树终止**（`process_tree.rs`）：unix `setsid` + `killpg`，Windows `CREATE_NEW_PROCESS_GROUP` +
  `taskkill /F /T`，注册表在 reap 与 kill 之间持锁，pid 复用窗口是关掉的。设计正确。
- **home 解析**：全仓统一 `dirs::home_dir()`，没有一处读 `$HOME`（`mise.rs:141`、
  `shell.rs:248/286`、`mise.rs:350`）。
- **mise 定位**（`mise.rs:138-214`）：`mise` / `mise.exe` 双名、well-known 候选、PATH 全扫、
  只接受绝对路径条目、去重保序。
- **行读取**：`spawn_line_reader`（`mise.rs:387-415`）按字节切 `\n` 并剥尾随 `\r`，
  CRLF 安全；`from_utf8_lossy` 不会像 `BufRead::lines()` 那样在首个非法字节处截断。
- **cmd.exe 引用注入**（`shell.rs:499-511`）：目录走环境变量而不是命令行走 cmd 解析器，
  `&`/`^`/`%`/`!` 全部炸不到，是标准正解。
- **安装命令双源一致**（`install.rs:53-56` ↔ `commandEcho.ts:35-39` + `lint:install-echo-parity`）。
- **快捷键**：全仓没有 `metaKey` / `ctrlKey` 绑定，也没有自定义菜单加速键 —— 所以
  「⌘ 写成 Ctrl」这一整类问题不存在。
- **npm 脚本可移植性**：`package.json` 里 15 条脚本全是 `tsx` / `vite` / `tsc`，没有 `&&` 串 POSIX
  命令之外的假设，`scripts/*.ts` 无 `child_process`；CI 的 `windows-latest` 腿已验证。
- **现代 CSS 使用面**：没有 `:has()` / `@container` / `backdrop-filter` / `aspect-ratio` /
  `field-sizing`；`color-scheme` 两主题都声明了。唯一较新的是 `color-mix()`（见 P2-6）。

---

## P1 — Windows/Linux 用户第一分钟会遇到

### P1-1 Windows 上每条 mise 命令都会闪一个控制台黑框

- **证据**：
  - `src-tauri/src/main.rs:2`：`#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]`
    —— release 产物是 GUI 子系统，进程本身**没有控制台**。
  - `process_tree.rs:98-106`：`creation_flags(CREATE_NEW_PROCESS_GROUP)`，只有 `0x0000_0200`。
  - 全仓 grep `CREATE_NO_WINDOW` / `0x0800_0000` / `DETACHED_PROCESS` = **0 命中**。
- **后果**：GUI 进程 spawn 控制台程序时，Windows 会给子进程**新分配一个控制台并显示窗口**。
  于是 `mise ls`、`mise doctor`、`mise install`、安装脚本的 `powershell`、甚至
  `shell.rs:221` 的 `pwsh.exe --version` 探针，每一条都会在屏幕上闪一下黑框。
  这是 Windows 上 GUI 应用最常见的体感缺陷，也是 owner 目前完全看不到的那类问题。
- **修法**：`process_tree.rs` 的 Windows 分支把标志改成
  `CREATE_NEW_PROCESS_GROUP | CREATE_NO_WINDOW`（`0x0800_0000`）。
  `shell.rs` 里不走 `ChildGuard` 的两个 spawn（`which_exists` 的探针、`run_cmd_start`）
  也要补，`run_cmd_start` 是例外 —— 它本来就该开窗口。
- **附带**：`which_exists` 探 `pwsh.exe --version`，PowerShell 冷启动可能 1-2 秒，这个探针在
  `detect_user_shell()` 里对 `pwsh.exe` 和 `powershell.exe` 各做一次；建议改成读注册表或用
  `where`/`Get-Command` 的轻量判断（非必须，先修黑框）。

### P1-2 自家 CSP 拦掉了 index.html 里的 Google Fonts —— 三个平台各回退各的字体

- **证据**：
  - `misedeck/index.html:7-11` 从 `fonts.googleapis.com` 拉 Cormorant Garamond / JetBrains Mono /
    Space Grotesk；`dist/index.html` 里这 5 行原样保留（Vite 不处理）。
  - `src-tauri/tauri.conf.json:22-24`：`"csp": "default-src 'self'"`。
  - Tauri 官方 CSP 文档（v2/security/csp）的示例明确写出：要用 Google Fonts 必须
    `style-src https://fonts.googleapis.com` + `font-src https://fonts.gstatic.com`。
- **后果**：`style-src` 回落到 `default-src 'self'` → 那个外部样式表在生产包里**永远不会加载**
  （devtools 里能看到一条 CSP 违规）。于是：
  - macOS 回退 Georgia / SF Mono / PingFang SC（凑巧不难看，所以一直没被发现）；
  - Windows 回退 Georgia / Consolas / 雅黑；
  - Linux 回退 DejaVu / Liberation 系，`ui-monospace` 在旧 WebKitGTK 上还不一定认。
  - 附带一个「离线/墙内」问题：就算放开 CSP，`fonts.googleapis.com` 在国内不可达，
    字形会在请求超时后才回退 —— 一个桌面应用不该有这样的运行时网络依赖。
- **修法**（二选一，推荐 a）：
  a. 把三套字体（只取用到的字重/子集）放进 `misedeck/src/assets/fonts/`，`@font-face` 本地引用，
     删掉 index.html 的外链。CSP 保持 `default-src 'self'` 不动。
  b. 至少把 `--font-ui` 的 CJK 回退补成跨平台栈（`"PingFang SC", "Microsoft YaHei", "Noto Sans CJK SC"`），
     `--font-mono` 补 `Consolas, "DejaVu Sans Mono"`，让三个平台的度量差可控。
- **顺带**：`tokens.css:193-194` 的 `-webkit-font-smoothing: antialiased` 只在 macOS 生效，
  Windows/Linux 忽略 —— 同一套 `--size-*` 在 Windows 上视觉上会更粗。这是平台差异，不是 bug，
  但换字体时要重新对一次字重。

### P1-3 Windows 的「在终端中打开」实际打开的是资源管理器

- **证据**：`shell.rs:499-511`
  ```
  raw_args: /c start "" "%MISEDECK_TERM_DIR%"
  ```
- **后果**：`start "" "C:\some\dir"` 走 ShellExecute，目录参数会被交给文件夹的默认处理程序
  → **弹出文件资源管理器窗口**，不是终端。而 `TerminalOpenOutcome.terminal_app` 报的是
  `"cmd.exe"`，`DirectoryIndicator.tsx:92` 用 `activation.openInTerminalSuccess`
  （「已通过 {{terminal}} 在 {{path}} 打开终端。」）提示成功 —— 用户会看到一个假的成功提示。
- **修法**：`start "" cmd /k cd /d "%MISEDECK_TERM_DIR%"`（保持目录走环境变量，注入面不变）；
  若装了 Windows Terminal 优先 `wt -d "%MISEDECK_TERM_DIR%"`。
  `terminal_app` 字段相应改成 `cmd.exe` / `wt.exe`。

### P1-4 安装脚本的 PowerShell 输出按 UTF-8 解码，中文 Windows 上是乱码

- **证据**：
  - `install.rs:65`：`Command::new("powershell")` —— 是 Windows PowerShell 5.1，不是 `pwsh`。
  - `install.rs:121` → `mise.rs:405`：`String::from_utf8_lossy(&buf)`。
- **后果**：`powershell.exe` 重定向 stdout 时用的是**控制台输出代码页**（zh-CN 简体中文 Windows
  默认 cp936/GBK），不是 UTF-8。安装脚本只要输出一个中文（或任何非 ASCII）字节，就不是合法
  UTF-8 → 整段变成 `����`。英文 Windows 是 cp437，同理。执行面板是唯一能看到安装进度的界面，
  乱码等于「装到哪了完全看不见」。
  （`mise` 自己是 Rust 写的、直接写 UTF-8 字节，所以 `mise` 的输出不受影响 —— 这个坑只在
  install 这一条路径上。）
- **实测修正（实现期核实）**：现网 `install.ps1`（271 行）**一个非 ASCII 字节都没有**，所以
  成功路径今天不会花屏。真正会花的是 PowerShell **自己生成**的输出 —— `irm` 失败、策略拒绝、
  命令找不到，这些在中文 Windows 上都是中文，而它们恰好是安装失败时用户唯一能读的线索。
  结论不变（仍要修），但影响面按此表述，不要写成「安装日志必花」。
- **修法**（任选，推荐 a）：
  a. 命令前缀加编码收敛：`-Command "[Console]::OutputEncoding=[Text.Encoding]::UTF8; <line>"`，
     并把 `INSTALL_SCRIPT_LINE` 的 echo 保持为纯净的一行（echo 与执行体的对应关系用现有
     parity lint 之外的方式对齐，或把编码前缀放在 Rust 侧单独 arg）。
  b. 改用 `-OutputFormat Text` + `chcp 65001`。
  c. 若机器上有 `pwsh`（7+），优先用它 —— pwsh 默认就是 UTF-8 输出。
- **注意**：`install.rs:53-56` 的 echo 与执行体共享 `INSTALL_SCRIPT_LINE`，改命令行时
  `scripts/check-install-echo-parity.ts` 会拦，属预期。

---

## P2 — 下次发版收敛

### P2-1 PowerShell 的 rc 路径写死成 pwsh 7 的位置

- `shell.rs:263-272`：`home/Documents/PowerShell/Microsoft.PowerShell_profile.ps1`。
  这是 **pwsh 6/7** 的路径；**Windows PowerShell 5.1** 的 profile 在
  `Documents/WindowsPowerShell/Microsoft.PowerShell_profile.ps1`。
- 而 `shell.rs:147-153` 只要 `pwsh.exe` 或 `powershell.exe` 任一存在就返回 `PowerShell`。
  → 只有 5.1 的机器上，探针永远读一个不存在的文件 → `activated: Some(false)` →
  横幅报「Shell 激活缺失」，且展示的 `rcPath` 是用户机器上不存在的路径。
- 修法：`rc_path_for(PowerShell)` 同时返回两个候选（主 pwsh 7 路径 + 兄弟 5.1 路径走
  `rc_sibling_paths`），命中哪个用哪个。

### P2-2 rc 文件用 `read_to_string`，UTF-16 / 非 UTF-8 的 profile 会让整个探针报错

- `shell.rs:305`。Windows 上 Notepad 存的 profile 很常见是 UTF-16 LE 或带 BOM。
  UTF-16 → `InvalidData`，`check_shell_activation_for` 往上抛 → 命令返回 Err → 横幅变成错误态。
  带 UTF-8 BOM 的文件不会报错，但首行前面挂着 `\u{feff}`，`trim_start` 去不掉它，
  恰好首行就是激活行时会漏判。
- 修法：`read_rc_file` 里对字节做 BOM 嗅探（UTF-8 BOM 剥掉；UTF-16 BOM 走 `String::from_utf16_lossy`），
  其余仍旧 lossy 解码；读文件失败降级为「无法判定」（`activated: None`，#166 的语义）而不是 Err。

### P2-3 Linux 的终端探测表漏掉了现在的默认终端

- `shell.rs:582-604` 只探 `gnome-terminal` / `konsole` / `xfce4-terminal`。
- 现状：Ubuntu 24.04 的默认终端是 GNOME Console（`kgx`），Fedora 40+ 是 `ptyxis`/`kgx`，
  Debian 走 `x-terminal-emulator`（alternatives symlink）。这些机器上按钮直接返回
  `TERMINAL_NOT_FOUND`（提示「复制命令手动执行」—— 降级可用，但功能等于没有）。
- 修法：探测表补 `x-terminal-emulator`、`kgx`、`ptyxis`、`alacritty`、`kitty`、`foot`、`wezterm`，
  每个带各自的 cwd 参数（`--working-directory=` / `--working-dir` / `-d` / 直接 argv）。

### P2-4 滚动条：布局是按 macOS 的覆盖式滚动条调出来的

- macOS 的滚动条浮在内容上（0px 占位），Windows/GTK 的是经典滚动条（约 15-17px 占位）。
- `PageShell.module.css:194-195` 的 `overflow-y: auto` 一旦在 Windows 上出现竖滚动条，
  main 的可用宽度直接少 ~15px；`ToolsPage` min-width 976、`EnvPage` 980、
  `SettingsPage` 704 这些数字是照着 macOS 的可用宽度定的 → Windows 上更容易触发表格自己的
  横向滚动条（`Table.module.css:6` `overflow-x: auto`），出现「双滚动条」。
- 修法：给滚动容器加 `scrollbar-gutter: stable`（WebKitGTK ≥ 2.40 / Chromium 均支持），
  让三个平台的占位一致；或统一改用 overlay 式自定义滚动条。

### P2-5 路径列的字符预算写死了 0.6em 等宽推进

- `utils/paths.ts:columnCharBudget`：`MONO_ADVANCE_PX = 7.2`（12px × 0.6em），注释也写死了
  「`--font-mono` 在 `--size-data` 下推进 0.6em」。
- 这个 0.6em 只对 JetBrains Mono / SF Mono / Cascadia 成立；Consolas 是 0.55em、
  DejaVu Sans Mono 是 0.602em。而 P1-2 之后三个平台落的字体本来就不同。
- 后果：#216/#225 精心算出来的「一个字符都不能多」在 Windows 上偏 2 个字符 —— 要么提前
  省略（浪费），要么压到列边界被 CSS 再截一次尾（正是那两张票要修的 bug）。
- 修法：把 `MONO_ADVANCE_PX` 改成运行时测量（canvas `measureText("0")` 一次，缓存），
  而不是常量。

### P2-6 `color-mix()` 是整套派生 token 的唯一依赖

- `tokens.css` 里 `--line` / `--panel` 的 tint / `--beam-soft` / 所有 `--tint-*-bg` 都是
  `color-mix(in srgb, …)`。不支持的 WebView 上这些值**整条失效**：边框没有颜色、
  elevated 面板没有底色、状态 tint 全透明 —— 不是「差一点」，是整套视觉塌掉。
- 支持门槛：Chromium 111+（WebView2 常青，没问题）、Safari 16.2+/macOS 13+、**WebKitGTK ≥ 2.40**。
- 影响：deb/rpm 在 Ubuntu 22.04 早期版本、Debian 12 之前的发行版上会是塌的。
  建议在 Linux 上把 `libwebkit2gtk-4.1` 的最低版本写进包依赖（或 README 的 Linux 前置条件）。

### P2-7 Linux 包的 glibc 下限被构建机决定

- `release.yml:33-43`：三个平台都在 `*-latest` 上构建，Ubuntu 现在是 24.04。
- 后果：deb / rpm / AppImage 的二进制链接到 glibc 2.39，Ubuntu 22.04（2.35）/ Debian 12（2.36）
  上会报 `GLIBC_2.39 not found`。这是发行版覆盖问题，不是代码问题，但用户会当成「装不上」。
- 修法：`runs-on: ubuntu-22.04`（Tauri 官方推荐的 Linux 构建基准），或用
  `manylinux` 风格的容器；README 里同时标明实测最低发行版。

### P2-8 两处「平台专属文案 / 声明」的小偏差

- `commandEcho.ts:107`：selfUpdate 的 echo 在 `cwd === null` 时渲染 `mise -C $HOME …`。
  **复核结论：不是 bug，不改。** PowerShell 里 `$HOME` 是有效变量且正是用户主目录；cmd.exe 里
  确实无效，但 cmd.exe 本来就不在 mise 支持的 shell 里（`mise activate cmd` 不存在），
  把它当目标会让 echo 为一种用不了 mise 的 shell 做优化。
- `README.md:132` 已注明「Windows 实验性 / Linux 未验证」，这条和本审计不冲突；
  但 P1-1/P1-3 修完之前，「Windows 实验性」的措辞建议保留。

---

## 静态无法判定、必须真机的部分

1. **WebView2 运行时**：Win10 上没有 WebView2 时应用起不来，NSIS 默认 `downloadBootstrapper`
   需要联网。安装器行为只能在真机确认。
2. **高 DPI**：Windows 125%/150% 缩放下 `minWidth: 900` 的实际观感、以及 `1px` 边框会不会被放大成 2px。
3. **GTK 主题污染**：Linux 上 GTK 的系统主题/字体设置会渗进 WebKitGTK（`GTK_THEME`、
   `font-name`），可能盖掉 `--font-ui`。
4. **`tauri-plugin-dialog` 的目录选择器**：Linux 无 `xdg-desktop-portal` 时 rfd 的降级路径
   未验证（Flatpak/Snap 里尤其明显）。
5. **`set_theme` 的 Linux 语义**：Tauri 2.11 的文档注明 Linux 上是 **app-wide** 且不是 per-window
   （`tauri-2.11.5/src/window/mod.rs:1893-1899`），机制成立，但 GTK 是否真的把标题栏跟着切了要实机看。
   `themeContext.tsx:70` 已经 `.catch(() => {})`，失败不会冒泡到 UI。

---

## 建议的出票切分

| 票 | 内容 | 平台 | 理由 |
| --- | --- | --- | --- |
| A | P1-1 控制台窗口抑制（`CREATE_NO_WINDOW`） | Windows | 一行标志，收益最大 |
| B | P1-2 字体自托管 + 删外链 | 全平台 | 显示一致性的根 |
| C | P1-3 终端启动命令 | Windows | 功能是坏的 |
| D | P1-4 PowerShell 输出编码 | Windows | 中文用户看不见安装进度 |
| E | P2-1 + P2-2 shell 探针（rc 路径双候选 + BOM） | Windows | 同一处代码 |
| F | P2-3 Linux 终端探测表 | Linux | 补一张表 |
| G | P2-4 + P2-5 滚动条占位 + 字符预算实测 | 全平台 | 显示精度 |
| H | P2-6 + P2-7 Linux 运行时/构建基准 | Linux | 发布配置 |

A/B/C/D 属「用户第一眼」；E-H 可以并进下一批。

---

## 出票与实现状态（2026-10-21）

SPEC 父票 **#239**，八张 ticket 全部实现并提交（master）：

| 票 | 提交 | 落地 |
| --- | --- | --- |
| #240 A | `e78e6e6` | `process_tree.rs` 新增 `CREATE_NO_WINDOW` + 单一 `creation_flags` 调用；`hide_console_window` 供 `which_exists` / `fetch_feed` 复用 |
| #243 D | `4b38058` | `install_command_args()` 拆出，PowerShell 执行体加 `[Console]::OutputEncoding`，回显行不变 |
| #241 B | `0f5e3d8` | `src/fonts.css` + 6 个 woff2（152 KiB，可变字体，每族一份）；`index.html` 外链删除；回退栈补三平台 |
| #246 G | `9870c95` | `scrollbar-gutter: stable`（PageShell main + Table scroller）；`check-css-tokens.ts` 新增字体栈断言 |
| #242 #244 #245 | `422e096` | Windows 终端改 `current_dir` 传目录；PowerShell 5.1 profile 进 siblings + BOM 解码；Linux 终端表 11 项 |
| #247 H | `e6d4a56` | release.yml Linux 腿 `ubuntu-22.04`；README 双语写明 WebKitGTK ≥ 2.40 / glibc 2.35 |
| #240 补 | `58b2ded` | 首轮 Windows CI 抓到新单测的竞态（`try_wait` 只问一次），改轮询 |

首轮 CI 的结果值得记一笔：`windows-latest` 腿**真的执行**了新加的四组断言（flag word、
Terminal argv、PowerShell sibling、install 编码前缀）并且全绿 —— 也就是说这几个「无真机」的
结论至少有一层可执行证据，不是纯读代码。唯一红的是测试自身的时序假设，已修。

实现期的三处修正（审计原文不改，以此为准）：

1. **#240** 不给 `run_cmd_start` 加 `CREATE_NO_WINDOW`：它就是为了开窗，抑制外层
   `cmd.exe` 有抑制掉 `start` 新建控制台的风险，不值得为几毫秒的闪烁冒这个险。
2. **#243** 影响面按上面的「实测修正」收窄（脚本纯 ASCII，花的是本地化错误文本）。
3. **P2-8 撤销**：`-C $HOME` 在 PowerShell 下是正确的，cmd.exe 不是 mise 支持的 shell。

单文件跨票的合并提交：`shell.rs` 同时承载 #240（`which_exists` 的 spawn 标志）、#242、#244、#245，
四处改动共享同一批测试和启动器，逐票拆分会产生编译不过的中间提交 —— 于是 #240 的 shell 侧
（`which_exists`）随 `422e096` 落地，#240 自己的提交 `e78e6e6` 只含 `process_tree.rs` + `update.rs`。
这是本批唯一一处偏离 commit-per-issue 的地方，判据是「master 必须始终可编译」优先于提交粒度。

---

## 真机验收（2026-10-23，Windows 11 x64 单机）

本票的验收条件是「八张票在真机上确认」，此前一直卡在没有 Windows/Linux 实机。2026-10-23 起
有一台真实 Windows 11 x64 机器可用，产品级验证已跑完：**8 个页面、22 个后端命令里的 19 个、
写入闭环、进程树 teardown 全部通过**（`docs/feedback/windows-hardware-verification.md`）。
逐条对账如下 —— **证据等级分成「真机观察到」/「代码+CI 钉住但未在真机观察到」/「本机结构上无法判定」**，
不含推断。

| 闸门项 | 结论 | 证据 |
| --- | --- | --- |
| **#240** 控制台黑框 | **真机通过（2026-10-23 补验）** | 见下方「第二轮修正」：判据改成「窗口是否可见」，mise 跑 3.86 s 全程无可见控制台，阳性对照（`ping` + `CREATE_NEW_CONSOLE`）立刻被检测到 |
| **#242** 终端打开 | **真机通过（2026-10-23 补验）** | `open_in_terminal` 弹出真实 cmd 窗口，提示符为 `D:\AiCodingProjects\mise-deck\misedeck\src-tauri\src>`，截图 `windows-hardware-verification-shots/round3-terminal-at-directory.png` |
| **#243** 安装输出编码 | **真机通过（2026-10-23 补验）** | 用生产 argv 前缀在 `CREATE_NO_WINDOW` 下做 A/B：带 pin 解出「基础连接已经关闭」，字节 `e5 9f ba`；无 pin 对照是 cp936 字节 `bb f9 b4 a1`，按 UTF-8 解码出现 36 个替换字符 |
| **#244** PowerShell rc 探针 | **真机通过** | `shell_activation_check` → `kind: "powerShell"`，`rcPath` 落在真实 profile 目录下的 pwsh 配置；5.1 候选与 UTF-16/BOM 解码由 `tests/shell.rs` 覆盖 |
| **#241** 字体自托管 | **构建产物通过，字形需 macOS 复核** | `dist/index.html` 中 `fonts.googleapis`/`gstatic` 出现 0 次；`dist/assets/` 有 6 个 woff2；`check-css-tokens.ts` 断言字体栈首项必须是打包族。字形与字宽变化需要重拍 macOS 截图才能对比，旧截图已过期 |
| **#246** 滚动条占位 | **Windows 正常，macOS 待确认** | `scrollbar-gutter: stable` 落 `PageShell` 与 `Table` 两处；Windows 上两处渲染正常（截图）；「macOS 上应无变化」只能在 macOS 上确认 |
| **#245** Linux 终端探测 | **未验** | 无 Linux 桌面 |
| **#247** Linux 构建基准 | **未验** | 无 Linux 桌面；`release.yml` 钉的是 `ubuntu-22.04` 构建机，deb 在 22.04 上是否真报 `GLIBC_2.39` 要装一次才知道 |

### 修正：上一版把 #240 判成「结构上无法判定」是错的

上一版表格里 #240 那行的理由是「本机从 Git Bash 启动应用，父进程带控制台时子进程不会新开窗口」。
两条都站不住：

1. **`CREATE_NO_WINDOW` 的语义读反了**。它**不是**「不要控制台」，而是「要一个没有窗口的控制台」。
   所以子进程仍会拿到 conhost（`conhost.exe` 的父进程就是 mise.exe），这不代表缺陷。
   真正的判据是**窗口是否可见**，不是有没有 conhost。
2. **症状是可观察的**，与从哪个 shell 启动无关：GUI 子系统的应用本身不附着控制台，
   它的控制台子进程要么新建窗口，要么退到 `CREATE_NO_WINDOW` 的隐藏控制台。

重做的方法与结果（2026-10-23 下午）：

| 命令 | 判据 | 结果 |
| --- | --- | --- |
| `mise ls-remote node`（经 IPC，3.86 s） | 采样「`MainWindowHandle != 0` 的 conhost/OpenConsole」+ Windows Terminal 标题变化 | 两者全程无变化 → **无可见控制台** |
| 阳性对照：`ping` + `CREATE_NEW_CONSOLE` | 同上 | WT 标题立刻变成 `C:\WINDOWS\SYSTEM32\ping.exe` → **检测器有效** |
| `open_in_terminal(path=…\src-tauri\src)` | 桌面截图读提示符 | 窗口打开，提示符 `D:\AiCodingProjects\mise-deck\misedeck\src-tauri\src>` |
| 安装 argv 前缀 + `irm https://mise.invalid/…`（带 pin / 不带 pin，均 `CREATE_NO_WINDOW`） | 原始字节与 UTF-8 解码 | 带 pin：`69 72 6d … e5 9f ba`（UTF-8「基」）、0 个替换字符；不带 pin：`bb f9 b4 a1`（cp936），按 UTF-8 解码 36 个替换字符 |

#243 用的是**生产的 argv 前缀 + 一个必定失败的假域名**，不是真的重装 mise：真正的风险在下载与安装，
而这条票要的是「PowerShell 自己生成的本地化文本能否被正确解码」。#240 的对照组是关键——
没有它，「没有可见窗口」可能只是检测器看不见。

顺带落地的两条结论：

1. **「Windows 实验性」的措辞已过期**。README 双语从「CI 只编译 + 跑单测，从未有人在真机跑过」
   改成「CI 跑与 Linux 相同的测试套件；应用已在一台真实 Windows 11 上走通；安装包未在真机安装」，
   并指向验证报告。措辞按证据收窄，没有升级成「已支持」。
2. **更新检查在这类网络下必然失败**（本轮发现，未改代码）：`curl` 不读 Windows 系统代理，
   只认 `https_proxy` 环境变量。已作为已知限制写进 README 双语，不擅自改产品行为。

剩余未验项只剩**没有对应硬件**的那些（Linux 桌面、macOS 视觉复核），以及发版决策（NSIS 安装包真机安装）；
它们独立跟踪，见后续票据。本票的「Windows 到底能不能用」已有真机答案，故关闭。
