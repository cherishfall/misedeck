# Mise runner

> [English](../../../docs/agents/runner.md)

Runner 层位于 Tauri command 与 mise CLI 之间，代码在 `misedeck/src-tauri/src/mise.rs`，分两部分：

- **纯 runner** — `run_mise(mise_path, req, on_event)` 构造 argv，spawn mise，用后台读线程截获 stdout/stderr，每行调用 `on_event` 并在结束时发 `Exit`。`run_mise_tracked` 是同一次运行加一个 `run_id`，可取消的就是它（见「进程树」）。函数不依赖 Tauri，所以能用 fixture 二进制做单元测试。
- **Tauri command** — `run_mise_command(cwd, args, runId, on_event)` 校验输入、解析（首次解析后缓存）mise binary、把事件转发到 `tauri::ipc::Channel<RunEvent>`。`runId` 是面板给这次运行分配的 id，`cancel_run(runId)` 靠它找到运行。最终返回 `RunCommandResult` enum 作为结构化值（不在 JS 端 throw）。这个命令同时也是成功/失败边界（issue #221）：非零退出以错误分支返回并附带 mise 的 stderr，而 `run_mise` 本身仍报告原始的 `RunOutcome`。

## Argv 形态

`run_mise_command` 总是传字面 argv —— 不走 shell、不做插值。`cwd` 为 `Some` 时前置 `-C <dir>`，后接用户传入的 args。`validate_run_args`（mise.rs）执行两条规则，都是 #160 在 #18 原始护栏上收窄的结果：args 不得为空；以 `-` 开头（flag/选项）的 token 不得包含 shell 元字符（`;`、`|`、`&`、`` ` ``、`$`、`\n`、`\r`）。其余一切 —— 子命令、位置参数、`run` 的值、`set` 的值 —— 在无 shell 的 spawn 里是惰性数据，原样放行，因此 `npm run build && npm run test` 这样的值、或含 `&` 的 `DATABASE_URL`，都能从 GUI 正常保存。shell 注入在构造上不可能发生（没有任何 shell 会看到这份 argv），而不是靠拒绝值来防。

## Streaming

Runner 用后台读线程（每个 pipe 一个）按行切分，通过有界 `mpsc::sync_channel`（256 行；子进程跑得比轮询循环快时施加背压，而不是让队列无限增长）转发。主循环在两次 `try_wait` 之间非阻塞排空 channel，面板就能看到实时输出。`STREAMING_TIMEOUT`（30 分钟）到点自动结束进程；安装脚本另有 5 分钟上限，只读查询 2 分钟。

内存由构造方式封顶（issue #277）。单行最多保留 8 KiB；超过单行上限的字节会被丢弃，但仍会从管道中读掉，因此不含换行的写入方既不会让子进程卡住，也不会撑大读线程的缓冲区。每条流总共最多保留 2 MiB——流式日志和 `RunOutcome.stdout` / `stderr` 共用同一个 `CappedStream`——超过总上限的行会被丢弃，而读线程仍持续排空管道，所以长时间高输出的任务不会耗尽内存。当某条流第一次因上限而丢弃输出时，runner 会发出一个带类型的 `RunEvent::OutputTruncated { stream }`（每条流最多一次），面板通过 i18n 渲染它。它是 channel 事件，绝不是 stdout 里的标记行：捕获的输出保持逐字节真实，UI 文案保持本地化。流式循环只有一份：`drive_child`（见本节末尾）同时驱动 mise runner 与安装器。

读线程按字节读取，每行用 `String::from_utf8_lossy` 解码，因此一个非法字节绝不会终止读线程、截断日志、或在子进程仍在运行时关掉管道（issue #222；`RunOutcome` 本就承诺 lossy 解码）。子进程消失后，runner 会持续排空两个 channel 直到读线程关闭它们，最多 `READER_SHUTDOWN_BOUND`（1 秒）：先排空能为阻塞在 `send` 上的读线程腾出容量，队列满时也不会丢掉尾部输出。继承了管道的孙进程（`npm run dev &`、daemon）可能永远持有写端，绝不能因此吞掉退出事件；到期仍未结束的读线程会被放弃——丢弃其 handle，线程在管道最终关闭时自行退出（#277）。

循环本身是共享的（issue #282）。`mise.rs` 里的 `drive_child` 是 spawn → 轮询 → 取消 → 截止 → 退出 → 读线程收尾的唯一实现；`PipeMode` 决定一条管道是切成日志行（`Lines`）还是整段按原始字节读取（`Raw`，见「Captured 模式」）。`run_mise_timed` 与 `run_install_command` 只是薄包装：把循环的 `DriveOutcome` 映射成各自的结果类型与错误文案。这段循环此前在两个文件里各有一份（约 90 行），一侧的修复很容易漏掉另一侧；现在每个退出路径都从同一处发出恰好一个 `RunEvent::Exit`。

## 进程树

超时、取消与退出应用终止的是**整个进程树**，不只是直接子进程（issue #223）。`process_tree.rs` 是这件事唯一的家：两个 runner（`mise.rs`、`install.rs`）都通过它 spawn。

- **Spawn**：每个子进程进入自己的进程组——Unix `pre_exec` + `setsid()`，Windows `CREATE_NEW_PROCESS_GROUP`。
- **终止**：Unix `killpg(pgid, SIGKILL)`；Windows `taskkill /F /T /PID`。组信号用不上时（进程离开了自己的组、`taskkill` 不存在、两者都没有的平台）保留 `child.kill()` 作为直接子进程的兜底。这才让 `sh -c "curl … | sh"` 真的停下：只杀 `sh` 时 `curl` 与安装脚本会继续写 shim，`mise run` 则会留下任务 shell。
- **取消**在产品语义上仍是*软取消*：面板立即标记为 cancelled 并释放按钮，不等进程。但 #223 之后取消会到达 Rust——`cancel_run(runId)`——由持有该子进程的 runner 在一个轮询切片内（≤ 50 ms）拆掉进程组。kill 永远在持有 `Child` handle 的线程上执行，绝不在取消调用里执行，因此取消不可能误伤应用没有启动的 pid。
- **退出**：Tauri 的 `RunEvent::ExitRequested` 与 `RunEvent::Exit` 会终止进程级注册表里仍然存活的每个进程组，所以安装途中关窗口不会留下后台下载。
- **pid 复用**：注册表只保存本进程启动且尚未回收的子进程。条目在被回收的同一步删除——回收后的 pid 可被复用——而 `terminate_all` 在持有注册表锁时发信号，保证 owner 不能抢在查找与 kill 之间完成回收。

平台说明：Windows 的进程树终止没有运行时测试（评审回路里没有 Windows 机器；`windows-latest` CI job 只做编译与单元测试）。Unix 由 fixture 测试覆盖：断言子进程启动的孙进程在取消后、超时后都已死亡（`tests/runner.rs`，`#[cfg(unix)]`）。

## Captured 模式

捕获型读取——`run_mise_json` 及其背后的读 helper（`mise ls`、`env`、`config ls`、`tasks`、`plugins`、`outdated`、`doctor`、`registry`、`trust --show`，以及 `detect_mise` 的版本探测）——走 `run_mise_capture`：子进程由与面板相同的 `drive_child` 循环驱动，但两条管道都以**原始字节模式**读取。stdout 直接读到 EOF，既不按 `\n` 切行，也不做单行截断，唯一上限是聚合的 `MAX_STREAM_BYTES`（2 MiB）。这是正确性要求，不是容量偏好：真实 mise 的 `ls-remote --json <tool>` 就是一行紧凑 JSON（2026.10.17 上 node 为 51,741 字节、python 为 74,716 字节），而日志路径的 8 KiB 单行上限会把它切成无法解析的前缀——每个真实工具都报 `PARSE_FAILED`（issue #282）。确实超过 2 MiB 的 payload 会明确报 `PARSE_FAILED`，而不是静默给出前缀。流式面板路径的单行上限保持不变。

两种模式的错误映射一致：非零退出 + 非空 stderr → `COMMAND_FAILED`，JSON 解析失败 → `PARSE_FAILED`，超时 → `TIMEOUT`。

## 测试

测试在 `misedeck/src-tauri/tests/`。Runner 只调用 fixture-mise 脚本（`tests/fixtures/mise/fixture-mise`），**绝不**碰用户的真 mise。新增 fixture slug 遵循 conventions.md 的布局（`tests/fixtures/mise/<argv 用 - 连接>`）；现有集合就在该目录里。共享 `FIXTURE_MISE_SLUG` 环境变量的测试用 `serial_test` 串行。

## 前端 hook

`useExecution()`（在 `misedeck/src/components/ExecutionPanel/useExecution.ts`）是一个小 reducer 加 Tauri `Channel` 消费者。页面调用 `run({ cwd, args })`；面板反映状态、行、退出码。每次前台运行都把 id 作为 `runId` 随 invoke 传出；`cancel()` 先把条目标记为 cancelled，再用该 id 发出 `cancel_run`——fire-and-forget，因为面板绝不能等进程死掉（issue #223）。`ExecutionPanel` 组件按 `docs/design/visual-language.md` 渲染底部停靠面板。
