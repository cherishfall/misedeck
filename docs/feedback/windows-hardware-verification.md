# MiseDeck — Windows 实机验证报告

**日期**：2026-10-22
**机器**：Windows 11 x64（非管理员，GitHub 不可达，装有向日葵/OrayIddDriver 虚拟显示驱动）
**宿主**：Windows 11 用户 `reformer`，Git Bash（PortableGit 1.3.0）
**结论**：**功能全部可用**。8 个页面、**22 个后端命令里的 19 个**（18 个 IPC 直调 + `run_mise_command` 经执行面板间接验证）、写入闭环、进程树 teardown 均在真实 Windows 上验证通过；`cargo test --all-targets` **266 passed / 0 failed**（此前 9 失败）。剩下的 3 个（`install_mise` / `mise_self_update` / `mise_trust`）只被自动化测试覆盖——它们会改动用户自己的 mise 安装与信任状态，故意未在真机触发，见第 10 节。

---

## 0. 验证基线：为什么这件事此前做不到

三个结构性障碍，全部在本轮解决：

### 0.1 没有可用的 Rust/MSVC 工具链

机器非管理员，无法安装 Visual Studio Build Tools。官方 NuGet 的 `Microsoft.Windows.SDK.CPP.*`（124 个版本全部核查）**不包含** `msvcrt.lib` / `legacy_stdio_definitions.lib` / `OLDNAMES.lib` —— 它们只存在于 529 MB 的完整 SDK 安装器 cab 中。

**解法**：自建工具链

| 组件 | 来源 |
| --- | --- |
| `cl.exe` / `lib.exe` | `Microsoft.VC.14.43.17.13.Tools.HostX64.TargetX64.base` |
| C++ STL 头文件（274 个） | `Microsoft.VC.14.43.17.13.CRT.Headers.base` |
| `clui.dll`（`C1510` 语言资源） | `…Tools.HostX64.TargetX64.Res.base.enu.vsix` → `bin/Hostx64/x64/1033/` |
| Windows SDK 10.0.26100 头文件 + 480 个 um 导入库 + 8 个 ucrt 库 | `Microsoft.Windows.SDK.CPP.x64` nupkg |
| `legacy_stdio_definitions.lib` / `OLDNAMES.lib` | 用 MSVC `lib.exe` 生成空壳归档（仅 CRT 旧符号转发，本项目不调用） |

关键取舍：**静态 CRT**（`RUSTFLAGS="-C target-feature=+crt-static"`），避开动态 CRT 对 `msvcrt.lib` 的需求。

**踩坑**：
- `INCLUDE` / `LIB` 必须用 Windows 路径（`D:/…`），用 MSYS 路径（`/d/…`）则 cl.exe 无法解析；`PATH` 反之必须用 MSYS 格式，否则 `which cl.exe` 找不到。
- Git Bash 会把 cl.exe 的 `/nologo` 开关转成路径 → 必须写 `//nologo`。
- `cc` crate 的 MSVC 探测（`find-msvc-tools`）只查 vswhere/注册表；设了 `VCINSTALLDIR` **且** `PATH` 里有 `cl.exe` 时才走"当前环境"分支。

### 0.2 WebView2 渲染进程反复崩溃

应用启动后 `msedgewebview2.exe` 立刻消失。**根因不是 MiseDeck**：本机装了 OrayIddDriver（向日葵远程桌面虚拟显示器），WebView2 的 D3D11/DXGI GPU 初始化在其上崩溃。4 个 Crashpad dump 全部含 `d3d11.pdb` / `dcomp.pdb` / `dxgi.pdb`。

**解法**（仅验证用，未写入产品代码）：注入 `--disable-gpu --disable-gpu-compositing --disable-software-rasterizer --use-angle=swiftshader --in-process-gpu`，渲染进程随即稳定。

**另一处弯路**：`WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS` 环境变量被 **WebView2 运行时忽略**（应用显式设置 `AdditionalBrowserArguments` 时），而 wry 总是设置它（`wry-0.55.1/src/webview2/mod.rs:327`）→ 必须改 `tauri.conf.json` 源码构建。注册表策略 `HKCU/HKLM\Software\Policies\…\AdditionalBrowserArguments` 需管理员权限，写入被拒。

### 0.3 没有可用的浏览器自动化通道

GDI / BitBlt 截图在此机失败。**解法**：手写纯 Python CDP 客户端（RFC 6455 WebSocket 帧编解码 + mask），通过 `Page.captureScreenshot` 取渲染后像素、`Runtime.evaluate` 读 DOM —— 完全绕开窗口截图。

Tauri v2 IPC Channel 协议逆向结论：`onEvent` 必须是 `"__CHANNEL__:" + id` 字符串形式，`id` 来自 `window.__TAURI_INTERNALS__.transformCallback(cb)`。传数字/对象会报 `invalid type: integer/map`。

---

## 1. 页面导航（8/8 通过）

真实点击导航，每页核对 `location.pathname`、`<h1>`、零错误节点、真实 mise 数据。

| 页面 | 截图 | 结果 |
| --- | --- | --- |
| 首页 Home | `windows-hardware-verification-shots/home.png` | ✅ |
| 概览 Overview | `windows-hardware-verification-shots/nav_overview.png` | ✅ |
| 工具 Tools | `windows-hardware-verification-shots/nav_tools.png` | ✅ |
| 环境变量 Env | `windows-hardware-verification-shots/nav_env.png` | ✅ |
| 任务 Tasks | `windows-hardware-verification-shots/nav_tasks.png` | ✅ |
| 插件 Plugins | `windows-hardware-verification-shots/nav_plugins.png` | ✅ |
| 诊断 Doctor | `windows-hardware-verification-shots/nav_doctor.png` | ✅ |
| 设置 Settings | `windows-hardware-verification-shots/nav_settings.png` | ✅ |

---

## 2. 后端命令（14/14 通过）

经 IPC 直接调用，返回真实数据：

| 命令 | 关键返回 | 对应 issue |
| --- | --- | --- |
| `detect_mise` | 版本 / 路径 / 架构 / latest | **#208** ✅ |
| `tools_outdated` | 真实过期列表 | — |
| `tools_env` | 真实工具环境变量 | — |
| `env_ls` | 真实环境变量表 | — |
| `read_lockfile` | 真实 lockfile | — |
| `config_files` | 读到真实 `config.toml` 内容 | — |
| `trust_check` | 真实信任状态 | — |
| `tasks_ls` | 真实任务列表 | — |
| `doctor` | 结构化诊断报告 | — |
| `registry` | 真实注册表 | — |
| `plugins_ls` | 真实插件列表 | — |
| `shell_activation_check` | `shell: {kind:"powerShell"}`，rcPath 指向真实 profile 下的 pwsh 配置文件 | **#277** ✅ |
| `directory_exists` | true / false 均正确 | — |
| `open_in_terminal` | 平台标签 + argv 正确 | — |

---

## 3. 写入闭环（UI → mise → 磁盘 → UI）

1. 在 UI 填写 `MISEDECK_VERIFY_2026=hello-from-cdp`
2. `mise set -g` 落盘 `~/.config/mise/config.toml`
3. 刷新后 UI 正确显示（值 + 来源「全局 / .config/mise/config.toml」）
4. **执行面板**显示 `mise set -g MISEDECK_VERIFY_2026=hello-from-cdp`、`成功 · 0.1s`、运行目录 `~（主目录）`、完整 DEBUG 回显
5. 移除后 `mise env --json-extended` 无该变量，`config.toml` 只剩空 `[env]`

截图：`windows-hardware-verification-shots/env_write.png`、`windows-hardware-verification-shots/env_after_write.png`、`windows-hardware-verification-shots/env_final.png`、`windows-hardware-verification-shots/execution_panel.png`

---

## 4. 安全边界

| 场景 | 结果 |
| --- | --- |
| `run_mise_command` 无效 cwd | 拒绝：`cwd is not a directory`（**#210** ✅） |
| 参数含 shell 元字符 `"; rm -rf /"` | **无命令注入** —— 作为字面参数传给 mise，报 `is not installed`（**#18** ✅） |
| 空 args | 拒绝 ✅ |
| `cwd=D:\AiCodingProjects\mise-deck` | argv = `-C D://AiCodingProjects//mise-deck ls --json`，读到项目 mise.toml 的 rust 1.99.1，`source.path` 指向项目 mise.toml（**#179** ✅） |

---

## 5. 本轮修复：Windows 上的 9 个测试失败

### 5.1 根因：不是产品缺陷，是测试注入点选错平台

`tests/shell.rs` 用 `set_var("HOME", tmp)` 模拟 home 目录。`dirs-6.0.0` 的官方文档写明：

> **Windows:** This function retrieves the user profile folder using `SHGetKnownFolderPath`.

| 平台 | `dirs::home_dir()` 实现 | 读 `$HOME`？ |
| --- | --- | --- |
| **Windows** | `SHGetKnownFolderPath(FOLDERID_Profile)` | **完全不读** |
| Unix | `env::var_os("HOME")` → getpwuid_r | 读 |

所以在 Windows 上 `rc_path_for` 读的是真实的 `C:\Users\reformer`，fish 测试于是在真实 profile 目录里找 `config.fish` → `Some(false)` 而非 `Some(true)`。

**关键判断**：#229 恰恰要求 Windows 上**必须**走 known folder、**不得**读 `$HOME`。产品代码是对的，测试的前提是错的。

**修法**（沿用项目既有的"纯决策半边可注入"模式，如 `detect_user_shell_from` / `detect_windows_shell` / `linux_terminal_plan`）：把 home 解析抽成可注入的参数。

新增：`rc_path_for_in(home, shell)`、`rc_sibling_paths_in(home, shell)`、`check_shell_activation_for_in(home, shell)`。
生产入口 `rc_path_for` / `rc_sibling_paths` / `check_shell_activation_for` 仍走 `dirs::home_dir()`，只是委托下去。

附带收获：测试不再触碰用户真实 home 目录，也不再需要 `HOME_LOCK` / `HomeGuard` 毒化防护（原先一个测试 panic 会导致后续 7 个连锁 `PoisonError`）。

### 5.2 跨平台 fixture：bash 脚本 → Rust 二进制

两个 bash fixture 在 Windows 上根本无法执行（`CreateProcess` 拒绝没有可执行扩展名的文件 → **os error 193**），导致 `process_tree` 模块整体 `#[cfg(unix)]`，#222 的用例在每个 Windows 宿主上都失败。

新建 `src/bin/fixture-process-tree.rs`，一个二进制承担三个角色（`grandchild` / `hold-stdout` / `tree-kill`），孙进程通过**自身重新执行**实现 —— 不需要 shell、不需要 `sleep`、不需要 `sh`。

两个平台事实决定了实现细节：

- 孙进程必须**继承 stdout 句柄**，#222 的用例才有意义：runner 的 reader 等的是管道 EOF，只有所有写端关闭才会到达。继承别的 stdout 会让测试"因错误的原因通过"。
- 孙进程必须是子进程的**真实后代**，因为 Windows 侧 teardown 是 `taskkill /F /T`（`/T` 走父子树）。普通 `spawn` 在两个平台都满足：unix 侧 runner 的 `setsid()` 让子进程成为新 session 首领，孙进程继承该 group，`killpg` 同样够得着。

### 5.3 #223 的 Windows 半边首次在真实硬件上验证

`tests/runner.rs` 的 `process_tree` 模块从 `#[cfg(unix)]` 改为跨平台，Windows 上用 `tasklist /FI "PID eq N" /NH /FO CSV` 查进程存活（无需额外 crate 依赖 `OpenProcess`）。

| 测试 | 覆盖 | Windows 结果 |
| --- | --- | --- |
| `process_tree::cancel_kills_the_grandchild_too` | 取消 → 整棵树被杀 | ✅ **首次在真实 Windows 验证** |
| `process_tree::timeout_kills_the_grandchild_too` | 超时 → 整棵树被杀 | ✅ **首次在真实 Windows 验证** |
| `exited_child_whose_grandchild_holds_stdout_still_returns` | #222 reader 有界 | ✅ **首次在真实 Windows 验证** |

### 5.4 CI 提升

`.github/workflows/ci.yml` 的 Windows job 从 `cargo test --lib` 改为 `cargo test --all-targets --no-fail-fast` —— fixture 跨平台后，Windows 腿能跑完整套件。

---

## 6. 静态门禁

| 门禁 | 结果 |
| --- | --- |
| `cargo test --all-targets` | ✅ **266 passed / 0 failed**（20 个 target） |
| `cargo clippy --all-targets -- -D warnings` | ✅ 零警告（Windows 上首次） |
| `npm run ci` | ✅ 全绿（typecheck + eslint + 247 tests + 12 个 lint 守卫 + build） |

各 target 明细：

```
81   src/lib.rs 单元测试        15  directory     22  runner ★
 1   argv_parity                 2  install       18  tasks
 2   config                     17  issue29        4  terminal
10   mise                       10  run_args      19  tool_mutations
13   shell ★                    12  tools         11  trust
 4   update                     25  wire_shapes
```

★ = 本轮从失败转为全绿 / 从未在 Windows 跑到。

### 6.1 顺带修复的 5 处 Windows 专属 clippy 缺陷

unix-only 测试已正确加 `#[cfg]`，但**对应导入没加**，CI 的 clippy 只在 Ubuntu 跑所以从未暴露：

- `src/install.rs`：`use std::sync::{Arc, Mutex}` → 加 `#[cfg(not(target_os = "windows"))]`
- `tests/install.rs`：`run_install_command` / `code` / `Command` / `Duration` → 加 cfg 门
- `tests/terminal.rs`：`use tempfile::TempDir` + `fn tempdir()` → 加 `#[cfg(all(unix, not(target_os = "macos")))]`
- `tests/runner.rs`：`run_mise_with_timeout` → 改为跨平台（本轮由 `#[cfg(unix)]` 变为无条件）
- `tests/shell.rs`：`ShellGuard` → 加 `#[cfg(unix)]`

---

## 7. 未覆盖 / 仍需 owner 确认

| 项 | 原因 |
| --- | --- |
| **目录选择器**（原生对话框） | CDP 无法驱动原生 Win32 对话框。已验证 `directory_exists` 命令与 `-C <cwd>` 上下文正确，但"点击选择器 → 选目录 → 应用"这条链路未点过。 |
| **Windows 打包（NSIS/WiX）** | 打包是发版时 owner 的决定，`bundle.targets` 仍只发 macOS (+ Linux)。 |
| **WebView2 GPU 崩溃** | 本机虚拟显示驱动所致，非 MiseDeck 缺陷。正常 Windows 硬件不受影响。 |
| **#239** | 已于 2026-10-23 关闭。逐条验收结论（含每一项的证据等级）见 `docs/feedback/beta17-audit-cross-platform.md` § 真机验收；Linux 桌面与几个需要特殊启动方式的窄项转入独立票据。 |

---

## 8. 改动清单

### 产品代码

| 文件 | 改动 |
| --- | --- |
| `src-tauri/src/shell.rs` | 新增 `rc_path_for_in` / `rc_sibling_paths_in` / `check_shell_activation_for_in`；生产入口委托；更新 PowerShell 路径注释（已实机验证） |
| `src-tauri/src/install.rs` | `Arc`/`Mutex` 导入加 Windows cfg 门 |
| `src-tauri/src/bin/fixture-process-tree.rs` | **新建** —— 跨平台进程树 fixture（`grandchild` / `hold-stdout` / `tree-kill`） |
| `src-tauri/src/bin/fixture-mise.rs` | **新建**（上一轮）—— 跨平台 mise stand-in |

### 测试

| 文件 | 改动 |
| --- | --- |
| `tests/shell.rs` | 改用注入式 home；新增 `rc_path_for_anchors_at_the_platform_home`；移除 `HomeGuard` / `$HOME` 写入 |
| `tests/runner.rs` | `process_tree` 模块跨平台化；改用新 fixture；`alive()` 双平台实现 |
| `tests/common/mod.rs` | **新建** —— `fixture_script()` 统一入口 |
| `tests/{config,directory,install,issue29,mise,tasks,tools,tool_mutations,trust}.rs` | 改用 `common::fixture_script()` |
| `tests/terminal.rs` | `PathGuard` 与 `tempdir` 导入加 `#[cfg(all(unix, not(target_os = "macos")))]` 门 —— 它们只被 Linux-only 探测用例使用，在 Windows 上是死代码，而 clippy 以 `-D warnings` 运行 |
| `tests/fixtures/{tree-kill,hold-stdout}-fixture` | **删除** —— 被 Rust 二进制取代 |

### CI 与文档

| 文件 | 改动 |
| --- | --- |
| `.github/workflows/ci.yml` | Windows job → `cargo test --all-targets --no-fail-fast` |
| `docs/agents/ci.md` + `zh-CN/docs/agents/ci.md` | 同步 Windows job 描述；新增"fixture 必须跨平台可执行"约定 |
| `docs/agents/conventions.md` + `zh-CN/docs/agents/conventions.md` | 同步 #277 实机验证状态；新增"home 必须注入"与"fixture 跨平台"两条约定 |
| `src-tauri/tauri.conf.json` | 临时加 `additionalBrowserArgs` 用于 CDP 验证，**已完全还原**（与备份 JSON 归一化后逐字节相同） |

---

## 9. 验证方法声明

本轮**实际执行**了：应用启动、8 页真实点击导航、14 个后端命令 IPC 调用、UI→mise→磁盘→UI 写入闭环、执行面板观察、截图（CDP 渲染像素）、`cargo test` / `cargo clippy` / `npm run ci`。

本轮**未执行**：原生目录选择器点击、Windows 打包、`mise` 真实安装/升级（会改动用户环境）。

---

## 10. 第二轮补验（2026-10-23）：把剩下的命令也点掉

第一轮结束时还有 7 个后端命令"只被自动化测试覆盖、没在真机上按过"。本轮补了 4 个，并且是**真的走 IPC**（`window.__TAURI_INTERNALS__.invoke`），不是读代码推断。

| 命令 | 调用 | 结果 |
| --- | --- | --- |
| `set_window_theme` | `dark` → `light` → `purple` | 前两次 `null`（成功切换，窗口未崩）；`purple` 返回 `COMMAND_FAILED`（未知主题被拒，符合实现） |
| `check_app_update` | 无参 | 返回结构化的 `status: "err"`，`code: COMMAND_FAILED`，`stderr: curl: (28) Connection timed out after 5009 ms` —— **命令本身工作正常**，是本机 5 秒连不上 GitHub release feed（应用进程没走 7890 代理）。这正是 #236 设计的"可重试的 Err"，UI 会显示重试而不是崩溃 |
| `open_external` | `javascript:alert(1)`、`file:///C:/Windows/win.ini` | 两条都被拒绝（`COMMAND_FAILED`），**没有打开任何窗口** —— #248 的 scheme 白名单在真机成立 |
| `cancel_run` | 未知 runId | 静默 `null`（不 panic、不报错）；真正的树杀语义由 `tests/runner.rs::process_tree` 覆盖 |
| `shell_activation_check`（复核） | 无参 | `shell: {kind:"powerShell"}`、`rcPath` 指向真实 profile、`activated: false` —— 与 UI 顶部那条告警一致 |

补验后**仍未在真机触发**的只剩 3 个，全部会改动用户自己的环境，故意不点：`install_mise`、`mise_self_update`、`mise_trust`。`run_mise_command` 由写入闭环里的执行面板间接走过。

### 10.1 这一轮踩到的三个坑（供下次直接抄）

- **debug 构建永远加载 `devUrl`**（`http://localhost:1420`），不是内嵌的 `dist`。所以要么起 `npm run dev`，要么用 release 构建。白屏先查这个。
- **Tauri 给 devUrl 页面发的是产品 CSP（`default-src 'self'`）**，而 Vite 的 React 插件注入的是**内联** preamble → 被 CSP 拦掉，`#root` 一直空。解法：`Page.setBypassCSP`，不用改仓库里的任何配置。
- **本机 WebView2 必须带全套 SwiftShader 参数**才是活的：`--disable-gpu --disable-gpu-compositing --disable-software-rasterizer --use-angle=swiftshader --in-process-gpu`（0.2 节）。少一个 `--disable-gpu` 就只有白窗口 + 没有 `msedgewebview2.exe`。
- 顺带确认 0.2 的结论：`WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS` **确实无效**（wry 总是显式设置 `AdditionalBrowserArguments`），必须改 `tauri.conf.json` 再编译。

### 10.2 补验同时修掉的测试缺陷

- `tests/terminal.rs` 改 `$PATH` 的那条测试，注释写着"serial_test below serializes env-var writes"，但**整个文件里一个 `serial_test` 都没有** —— 多线程测试进程里 `std::env::set_var` 是 UB。已给同文件里所有会 spawn 的测试加 `#[serial_test::serial]`，并把注释改成真实原因。
- `tests/install.rs` 设 `FIXTURE_MISE_ENV_LOG`（同样是 `set_var`），给了同文件的 spawn 测试同样的门。
- `tests/terminal.rs` 末尾原来用一个假函数 `_pathbuf_anchor()` 压 unused-import 警告，已删掉假函数和那个 import。
- `src/shell.rs` 的 `which_exists` 原来是无条件的 `#[allow(dead_code)]`，改成 `#[cfg_attr(not(all(unix, not(target_os = "macos"))), allow(dead_code))]` —— 与本文件其他平台专属 helper 一致。

### 10.3 门禁复跑（2026-10-23，改动之后）

| 门禁 | 结果 |
| --- | --- |
| `cargo clippy --all-targets -- -D warnings` | exit 0，零警告 |
| `cargo test --all-targets --no-fail-fast` | **266 passed / 0 failed**（20 个 target） |
| `npm run ci` | exit 0（typecheck + eslint + 247 tests + 12 个 lint 守卫 + build） |

本机跑 cargo 必须先 `. .workbuddy/tmp/msvcenv.sh`（静态 CRT + 自建 MSVC + `link.exe`）；不 source 它、只依赖 `src-tauri/.cargo/config.toml` 时，链接会去要 `msvcrt.lib` 而失败——那份 config 指向的是不完整的 CRT 包。

---

## 11. 第三轮补验（2026-10-23 下午）：#281 的三个 Windows 窄项

这三项此前被记为「真机无法判定」，**其中 #240 的判断是错的**，原因写在 `beta17-audit-cross-platform.md`
§ 修正：`CREATE_NO_WINDOW` 的语义不是「不要控制台」而是「要一个没有窗口的控制台」，所以判据必须是
**窗口是否可见**，而不是有没有 `conhost.exe`。

### 11.1 #240 控制台黑框：通过

方法：在 `mise ls-remote node`（经 IPC，单进程、跑 3.86 s）运行期间，每 50 ms 采样一次

- 所有 `conhost.exe` / `OpenConsole.exe` 里 `MainWindowHandle != 0` 的（即真的存在窗口）
- Windows Terminal 的窗口标题（本机默认终端，控制台若要显示会新开标签页）

结果：两者**全程无变化**。同时观察到 `conhost.exe pid=13552 parent=13512 (mise.exe)` ——
这正是 `CREATE_NO_WINDOW` 的预期行为：控制台存在，窗口不可见。

**阳性对照**（关键，否则「没看见窗口」可能只是检测器瞎）：用 `CREATE_NEW_CONSOLE` 起一个 `ping`，
同一套采样立刻抓到 WT 标题变成 `C:\WINDOWS\SYSTEM32\ping.exe`。检测器有效，所以上面的空结果有意义。

### 11.2 #242 在终端中打开：通过

`open_in_terminal(path = D:\AiCodingProjects\mise-deck\misedeck\src-tauri\src)` 返回

```
platform: Windows | terminalApp: cmd.exe
argv: [C:\WINDOWS\System32\cmd.exe, /c, start, "", C:\WINDOWS\System32\cmd.exe]
```

窗口确实弹出，桌面截图里提示符是 `D:\AiCodingProjects\mise-deck\misedeck\src-tauri\src>`：
`windows-hardware-verification-shots/round3-terminal-at-directory.png`。
本机默认终端是 Windows Terminal，所以新控制台是**同一个 WT 进程里的新标签页**——
按「有没有新进程」判断会漏，按窗口标题变化判断才对。

### 11.3 #243 安装输出编码：通过（含反向对照）

不重装 owner 的 mise：用**生产 argv 前缀**（`-NoProfile -ExecutionPolicy Bypass -Command
"try { [Console]::OutputEncoding = [Text.UTF8Encoding]::new($false) } catch { }; …"`）跑一个必定失败的
`irm https://mise.invalid/install.ps1`，并且用 `CREATE_NO_WINDOW` 起进程——**和产品一样的无控制台条件**。

第一次做这个实验时结果是无效的：从 Git Bash 起子进程会继承 UTF-8 控制台，两组都是 UTF-8，对照无法失败。
`chcp` 在本机是 **936**，加上 `CREATE_NO_WINDOW` 才复现出真实条件。

| 组 | 首字节 | 按 UTF-8 解码 |
| --- | --- | --- |
| 带 pin（生产 argv） | `69 72 6d 20 3a 20 e5 9f ba …` | `irm : 基础连接已经关闭: 发送时发生错误。`，0 个替换字符，无 BOM |
| 无 pin（修复前行为） | `69 72 6d 20 3a 20 bb f9 b4 a1 …` | `irm : ���������Ѿ��ر�: …`，**36 个替换字符** |

对照组精确复现了 #243 描述的乱码，pin 把它修好；BOM 也为空，首行没有零宽字符。

### 11.4 仍未验

- **Linux 桌面**（#245 终端探测、#247 glibc/WebKitGTK、portal 目录选择器、GTK 主题污染、`set_theme` 语义）
- **macOS 视觉复核**（自托管字体的字形/字宽、`scrollbar-gutter` 无变化、重拍 `docs/screenshots/`）
- **NSIS 安装包真机安装**（发版决策）

