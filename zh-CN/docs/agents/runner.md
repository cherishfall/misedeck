# Mise runner

> [English](../../../docs/agents/runner.md)

Runner 层位于 Tauri command 与 mise CLI 之间，代码在 `misedeck/src-tauri/src/mise.rs`，分两部分：

- **纯 runner** — `run_mise(mise_path, req, on_event)` 构造 argv，spawn mise，用后台读线程截获 stdout/stderr，每行调用 `on_event` 并在结束时发 `Exit`。函数不依赖 Tauri，所以能用 fixture 二进制做单元测试。
- **Tauri command** — `run_mise_command(cwd, args, on_event)` 校验输入、解析（首次解析后缓存）mise binary、把事件转发到 `tauri::ipc::Channel<RunEvent>`。最终返回 `RunCommandResult` enum 作为结构化值（不在 JS 端 throw）。

## Argv 形态

`run_mise_command` 总是传字面 argv —— 不走 shell、不做插值。`cwd` 为 `Some` 时前置 `-C <dir>`，后接用户传入的 args。Rust 端拒绝空 args 和任何包含 `;`、`|`、`&`、`` ` ``、`$`、`\n`、`\r` 的 arg。目的是从结构上杜绝 shell 注入。

## Streaming

Runner 用后台读线程（每个 pipe 一个）按行切分，通过有界 `mpsc::channel` 转发。主循环在两次 `try_wait` 之间非阻塞排空 channel，面板就能看到实时输出。`STREAMING_TIMEOUT`（30 分钟）到点自动 kill 进程。当前 ticket 的 cancel 是软取消；真正需要 kill 长进程的下个 ticket（#22 mutations）会再加 kill handle。

## Captured 模式

`detect_mise` 用同一个 `run_mise` 但 `on_event` 是 no-op，事后读 `RunOutcome.stdout` / `RunOutcome.stderr`。两种模式共用一个函数，因此错误映射一致：非零退出 + 非空 stderr → `COMMAND_FAILED`，JSON 解析失败 → `PARSE_FAILED`，超时 → `TIMEOUT`。

## 测试

测试在 `misedeck/src-tauri/tests/`。Runner 只调用 fixture-mise 脚本（`tests/fixtures/mise/fixture-mise`），**绝不**碰用户的真 mise。新增 slug：`doctor-happy`、`doctor-fail`、`doctor-mixed`。共享 `FIXTURE_MISE_SLUG` 环境变量的测试用 `serial_test` 串行。

## 前端 hook

`useExecution()`（在 `misedeck/src/components/ExecutionPanel/useExecution.ts`）是一个小 reducer 加 Tauri `Channel` 消费者。页面调用 `run({ cwd, args })`；面板反映状态、行、退出码。`ExecutionPanel` 组件按 `docs/design/visual-language.md` 渲染底部停靠面板。
