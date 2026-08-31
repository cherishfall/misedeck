# Conventions

> [English](../../../docs/agents/conventions.md)

本仓库的代码编写规则。在调用 mise、处理错误或编写测试之前阅读。

## Tauri command contract

每个 Tauri 命令返回 `Result<T, AppError>`，其中 `T` 是可 serde 序列化的类型化形状，且：

```rust
struct AppError {
    code: String,      // SCREAMING_SNAKE, e.g. MISE_NOT_FOUND, MISE_TOO_OLD, COMMAND_FAILED, PARSE_FAILED, UNTRUSTED
    message: String,   // i18n key + params, resolved in the UI — never pre-rendered copy
    stderr: String,    // raw mise stderr when a command failed; empty otherwise
}
```

UI 通过 i18n 渲染 `code`，并通过执行面板提供 stderr。调用方对 `code` 做模式匹配，绝不匹配消息文本。

**边界序列化**：每个跨越 Rust↔TS 边界的类型在 Rust 侧使用 `#[serde(rename_all = "camelCase")]`；对应的 TS 类型为 camelCase。`code` 的取值来自这个固定集合——发明新的是 bug：

```
MISE_NOT_FOUND  MISE_TOO_OLD  COMMAND_FAILED  PARSE_FAILED  UNTRUSTED  TIMEOUT  TERMINAL_NOT_FOUND
```

`TERMINAL_NOT_FOUND` 是 issue #28 的 `open_in_terminal` Tauri 命令在 Linux 上的特殊补充：探测 `gnome-terminal` / `konsole` / `xfce4-terminal` 都没找到，因此 UI 显示可复制的命令而不是猜测。它是集合中唯一一个非 mise 错误码；后续 ticket 应当尽量复用现有的六个。

## Invoking mise

- 启动时定位一次二进制（`mise version --json`）；缓存路径 + 版本。最低支持的 mise 版本为 **2025.1.0**，在此强制执行（code 为 `MISE_TOO_OLD`）；当某个功能需要更新的 mise 时，要有意识地提高该下限。缺失为 `MISE_NOT_FOUND`，并路由到引导式安装流程（issue #2）。
- 始终通过 `-C` 传递目录上下文；凡是支持 `--json` 的地方都请求它。
- 为每条命令设置宽松但有限的超时；流式命令（安装、任务运行）把 stdout/stderr 行流式输出到执行面板，而不是缓冲。
- 非零退出 → `COMMAND_FAILED`，stderr 逐字保留。解析失败 → `PARSE_FAILED`，并记录原始负载。

## Error handling

- 错误即数据：它们以 `AppError` 的形式传递到 UI。命令代码中的 panic 和 `unwrap` 是 bug。
- mise 自己的错误文本原样透传，不做翻译（spec #16）；UI 添加复制按钮和 GitHub 搜索链接。

## Testing

- 唯一的测试接缝是 mise CLI 边界：测试用一个 **fixture mise** 替换它 —— 一个小脚本，按 argv 提供录制的 JSON/stderr/退出码。fixture 布局：`tests/fixtures/mise/<slug>/`，其中 `<slug>` 是 argv 用 `-` 连接而成（例如 `ls---json/`），目录内含 `stdout`、`stderr` 和 `exit_code` 三个文件。runner 针对 fixture 做单元测试；runner 之上的一切在 Tauri 命令契约处 mock runner 来测试。
- 只测试外部行为：给定这个 fixture 响应，命令返回这个形状 / 面板显示这个状态。不测试内部辅助函数。
- 前端：针对类型化契约做组件测试；避免快照测试带来的无谓 churn。

## Definition of done（每个 ticket，无例外）

1. `cargo check` 和前端 typecheck 通过；所有测试通过。
2. ticket 中的每条验收标准都被确实满足。
3. 应用已被运行，改动的流程已被端到端驱动；截图（或运行环境提供的 UI 证据）附在收尾评论中。
4. 所有新增 UI 文案同时存在于 `en.json` 和 `zh-CN.json`。
5. 如果改动了文档，其在 `zh-CN/` 下的镜像对应文档已在同一次改动中更新。
6. 收尾评论说明验证了什么、如何验证的。

## Verification loop (replaces human code review)

1. 构建：`cargo check` + 前端 typecheck 必须通过。
2. 运行应用，用 computer-use 工具驱动改动的流程，并对结果截图。
3. 在 PR/总结中说明验证了什么、如何验证的。

## Cross-platform

路径、home 目录、进程生成和 shell 检测都走 Tauri/Rust 的跨平台 API。macOS 专属行为（如 Gatekeeper 说明）放在平台守卫之后，其他平台上为空操作或等价实现。

## Style

与周围文件保持一致。只在代码无法说明"为什么"的地方写注释。diff 保持在 ticket 范围内。
