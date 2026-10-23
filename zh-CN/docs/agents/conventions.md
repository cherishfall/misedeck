# Conventions

> [English](../../../docs/agents/conventions.md)

本仓库的代码编写规则。在调用 mise、处理错误或编写测试之前阅读。

## Tauri command contract

每个 Tauri 命令返回 `Result<T, AppError>`，其中 `T` 是可 serde 序列化的类型化形状，且：

```rust
struct AppError {
    code: String,      // SCREAMING_SNAKE, e.g. MISE_NOT_FOUND, MISE_TOO_OLD, COMMAND_FAILED, PARSE_FAILED, TIMEOUT
    message: String,   // i18n key + params, resolved in the UI — never pre-rendered copy
    stderr: String,    // raw mise stderr when a command failed; empty otherwise
}
```

UI 通过 i18n 渲染 `code`，并通过执行面板提供 stderr。调用方对 `code` 做模式匹配，绝不匹配消息文本。UI 中每一个展示 `err.message` 的位置都通过 `resolveAppErrorMessage`（`misedeck/src/utils/appError.ts`）解析：它拆解 `key|param=value|…` 线格式并在 i18n 目录中查键（找不到时回退到 `errors.unknown`，原始键永远不会被渲染）；对原始细节文本（COMMAND_FAILED / PARSE_FAILED）则原样透传。

**边界序列化**：每个跨越 Rust↔TS 边界的类型在 Rust 侧使用 `#[serde(rename_all = "camelCase")]`；对应的 TS 类型为 camelCase。`code` 的取值来自这个固定集合——发明新的是 bug：

```
MISE_NOT_FOUND  MISE_TOO_OLD  COMMAND_FAILED  PARSE_FAILED  TIMEOUT  TERMINAL_NOT_FOUND
```

`TERMINAL_NOT_FOUND` 是 issue #28 的 `open_in_terminal` Tauri 命令在 Linux 上的特殊补充：探测 `gnome-terminal` / `konsole` / `xfce4-terminal`，在用户的 `PATH` 上都没找到，因此 UI 显示可复制的命令而不是猜测。它是集合中唯一一个非 mise 错误码；后续 ticket 应当尽量复用现有的六个。

## Invoking mise

- 启动时定位一次二进制（`mise version --json`）；缓存路径 + 版本。最低支持的 mise 版本为 **2025.12.5**——首个包含应用所需的全部 flag 的版本（`ls-remote --json`，mise #7279）——在此强制执行（code 为 `MISE_TOO_OLD`）；当某个功能需要更新的 mise 时，要有意识地提高该下限。缺失为 `MISE_NOT_FOUND`，并路由到引导式安装流程（issue #2）。
- 始终通过 `-C` 传递目录上下文；凡是支持 `--json` 的地方都请求它。
- 为每条命令设置宽松但有限的超时；流式命令（安装、任务运行）把 stdout/stderr 行流式输出到执行面板，而不是缓冲。
- 非零退出 → `COMMAND_FAILED`，stderr 逐字保留。解析失败 → `PARSE_FAILED`，并记录原始负载。

## Error handling

- 错误即数据：它们以 `AppError` 的形式传递到 UI。命令代码中的 panic 和 `unwrap` 是 bug。
- mise 自己的错误文本原样透传，不做翻译（spec #16）；UI 添加复制按钮和 GitHub 搜索链接。

## Testing

- 唯一的测试接缝是 mise CLI 边界：测试用一个 **fixture mise** 替换它 —— 一个小脚本，按 argv 提供录制的 JSON/stderr/退出码。fixture 布局：`tests/fixtures/mise/<slug>/`，其中 `<slug>` 是 argv 用 `-` 连接而成（例如 `ls---json/`），目录内含 `stdout`、`stderr` 和 `exit_code` 三个文件。runner 针对 fixture 做单元测试；runner 之上的一切在 Tauri 命令契约处 mock runner 来测试。
- 不调用 mise 的面在自身边界注入，而不是访问网络或宿主 OS：更新检查把获取与判定拆开（`check` → `check_with`），引导安装循环接受它要流式执行的命令（`run_install_command`），shell 探测接受 `$SHELL` 与 passwd 条目给出的值（`detect_user_shell_from`）。生产入口传入真实实现——这是测试缝，不是第二套行为（issue #255）。
- 工具页的 argv 存在于两处：TS 构建真正下发的命令，Rust 固定仅测试用的 builder。两半都对同一张表 `tests/fixtures/argv-parity.json` 断言——`npm run lint:argv-parity`（已接入 `npm run ci`）执行 TS builder，`tests/argv_parity.rs` 执行 Rust builder。单侧改动会让该侧的闸门失败（issue #255）。
- 只测试外部行为：给定这个 fixture 响应，命令返回这个形状 / 面板显示这个状态。不测试内部辅助函数。
- 前端：用 node:test 对纯函数写单元测试 —— `npm run test`（`tsx --test "src/**/*.test.ts"`），已接入 `npm run ci`。目前 `src/` 下共有 26 个同目录测试套件（例如 `src/utils/paths.test.ts`、`src/api/miseTools.test.ts`）。组件测试设施不存在，UI 行为不做单元测试；新增纯逻辑须附带同目录的 `*.test.ts`。
- 改写进程环境变量的测试要加 `#[serial_test::serial]`，**同一测试二进制里所有会 spawn 子进程的测试也要加**：spawn 会复制环境，因此只要有子进程可能在跑，`std::env::set_var` 就是不健全的。只给"写"的那条加属性保护不了任何东西——真正起互斥作用的是 serial 属性，不是事后恢复变量的 guard。现存两例：`tests/terminal.rs` 的 Linux `$PATH` 探测、`tests/install.rs` 的 `FIXTURE_MISE_ENV_LOG`（issue #278）。
- 同一条门也适用于 `process_tree::terminate_all`：它杀掉的是**进程级全局**注册表里的所有子进程，所以一个调用它的单元测试会顺手 SIGKILL 掉同二进制里邻居正在等的子进程。所有经 `ChildGuard` spawn 的单元测试都要 `#[serial]`，调用 `terminate_all` 的那条也要。缺了这属性的症状是：子进程死于信号，`ExitStatus::code()` 返回 `None`，调用方报 `exited with status -1` 且 stderr 为空——看起来像产品缺陷，其实不是。ubuntu 腿两次这样失败后，已在 `src/process_tree.rs` / `src/install.rs` 修掉。

## Definition of done（每个 ticket，无例外）

1. `cargo check` 和前端 typecheck 通过；所有测试通过。
2. ticket 中的每条验收标准都被确实满足。
3. 改动的流程已通过下文的 Verification loop；如果没人看过渲染结果，在 issue 上标注「未经视觉验证」。
4. 所有新增 UI 文案同时存在于 `en.json` 和 `zh-CN.json`。
5. 如果改动了文档，其在 `zh-CN/` 下的镜像对应文档已在同一次改动中更新。
6. 收尾评论说明验证了什么、如何验证的。

## Verification loop (replaces human code review)

验收静态优先；代理侧不做视觉验证，除非维护者主动要求：启动应用、截图、点验既慢又费 token，还会占用维护者的电脑（维护者决定，beta9）。

1. 构建：`npm run ci`（前端 typecheck + lint 守卫 + 构建）和 `cargo check` 必须通过。
2. 对 diff 做机械自查：数据单元格带 `nowrap`/`min-width: 0`、颜色与字号来自 token、文案是 i18n key、JSX 中无硬编码字形字面量、无未经批准的 caret/装饰字形、无已退休词汇、对比度按 token 取值推算成立。
3. 代理侧视觉验证的替代方案是生成时拦截：每个被报告的视觉/交互问题，只要机械可检查，必须在同一 ticket 里把 lint 守卫接进 `npm run ci`。渲染结果的确认归维护者的 beta 验收门。
4. 在 PR/总结中说明验证了什么、如何验证的；没做过视觉检查就在 issue 上标注「未经视觉验证」。绝不允许虚报没做过的视觉验证。

## Cross-platform

路径、home 目录、进程生成和 shell 检测都走 Tauri/Rust 的跨平台 API。macOS 专属行为（如 Gatekeeper 说明）放在平台守卫之后，其他平台上为空操作或等价实现。

Windows 的 shell 检测（#277）拆成两半：纯判定函数 `detect_windows_shell`（先看 `$SHELL`，再看 PowerShell）在任意宿主上都跑单元测试；探测本身只在 Windows 上执行（用绝对路径的 `where.exe pwsh.exe`；对绝对 System32 Windows PowerShell 做文件存在检查）。这些探测及其产生的激活提示已在真实 Windows 桌面上运行过——在那里 shell 探测给出 `powerShell`，rc 路径指向真实 profile 目录下的 pwsh 配置文件路径。`windows-latest` CI 现在会跑完整套件（单元测试**和**集成测试），因为 fixture 已是跨平台的 Rust 二进制而非 bash 脚本。

那次真实 Windows 运行现已覆盖整个表面，不只是 shell 探测：八个页面、十四个后端命令，以及一条写入闭环（UI → mise → 磁盘 → UI）都在硬件上跑过。它找出两件 CI 抓不到的事——bash 脚本 fixture；以及在会忽略该变量的平台上、测试伪造 `$HOME` 时会静默失效的 home 解析接缝（见下面注入 home 的约定）。

- **home 一律用 `dirs::home_dir()`，绝不读 `HOME` 环境变量**（issue #229）：Windows 上没有 `HOME`，每一处 `$HOME` 读取都会得到空值——激活探测因此恒为 `activated: null`，`open_in_terminal` 每次都失败。shell rc 路径和其他任何 home 相对路径同理。
- **home 相对路径必须由注入的 home 算出，而不是伪造环境变量**：`dirs::home_dir()` 在 unix 上认 `$HOME`，在 Windows 上走 `SHGetKnownFolderPath`、完全无视该环境变量——用 `$HOME` 伪造 home 的测试在 Windows 上读到的是**真实**用户 profile。rc 路径解析与激活探测都把 home 作为参数接收（`rc_path_for_in`、`rc_sibling_paths_in`、`check_shell_activation_for_in`）；生产入口负责用 `dirs::home_dir()` 解析并委托下去。
- **测试 fixture 必须在它运行的宿主上可执行**：bash 脚本在 Windows 上无法被 spawn（`CreateProcess` 拒绝没有可执行扩展名的文件——os error 193）。fixture 统一是 `src/bin/` 下的 Rust 二进制（`fixture-mise`、`fixture-process-tree`），一份实现服务所有平台，Windows CI 也能跑集成套件。
- **查找 mise 时，在已知候选之后还要扫描 `PATH`**：Windows 上 scoop/winget 装的 mise、Linux 上的 `/usr/bin/mise` 只存在于 `PATH`。
- **回显必须显示执行层真正走的分支**：引导安装在 Windows 跑 `irm … | iex`、其他平台跑 `curl … | sh`，回显行同样按平台生成。`npm run lint:install-echo-parity` 会在前端副本与 `src-tauri/src/install.rs` 不一致时让构建失败。
- **回显引号是 shell 引号**（单引号；POSIX 用 `'\''`、PowerShell 用 `''`），不是 JSON 引号：执行面板承诺给出可粘贴的一行，而 `$HOME`、`$(…)`、反引号和 `!` 在 argv 里无害、在 shell 里却会改变含义。

## i18n

- 绝不在代码中拼接翻译后的字符串——不允许 `t(...) + x`、`x + t(...)`，也不允许在模板字符串中嵌入 `t(...)`。语序、标点和复数规则归语言环境所有，而不是代码。把整句话放进 `en.json` + `zh-CN.json`，用 `{{占位符}}`，通过 `t(key, { ... })` 传入各部分——计数也不例外（`"{{count}} settings"`，而不是 `` `${n} ${t(...)}` ``）。
- `npm run lint:i18n-concat` 在生成期对 `src/**` 强制执行此规则（已接入 `npm run ci`）；确实语言环境安全的例外必须连同理由写进脚本的显式 allowlist，绝不允许靠改写代码规避检查。

## Style

与周围文件保持一致。只在代码无法说明"为什么"的地方写注释。diff 保持在 ticket 范围内。
