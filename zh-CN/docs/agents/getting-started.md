# Getting Started（ticket #17 的黄金路径）

> [English](../../../docs/agents/getting-started.md)

通往可运行骨架的精确、已知良好的路径。照字面执行；不要即兴发挥。

## 前置条件

- Node 22+（`node --version`）
- Rust 工具链：`curl --proto '=https' --tlsv1.2 https://sh.rustup.rs -sSf | sh`，然后重启 shell 并检查 `cargo --version`
- macOS：Xcode Command Line Tools（`xcode-select --install`）

## 脚手架

```bash
npm create tauri-app@latest misedeck -- --template react-ts --manager npm --yes
cd misedeck
npm install
npm run tauri dev   # 会打开一个窗口；这证明工具链可用
```

脚手架后的目录布局：`src/` 是 React 前端，`src-tauri/` 是 Rust 壳，`src-tauri/tauri.conf.json` 是应用配置，`src-tauri/capabilities/` 存放 Tauri 2 权限。

## 然后实现 ticket #17

1. 按 `docs/agents/architecture.md` 添加技术栈库（react-router v7、react-i18next、@tanstack/react-query）——即使 #17 只用到其中一部分，现在也全部装上。
2. 按 `docs/agents/conventions.md` 中的契约编写第一个 Tauri 命令 `detect_mise`：运行 `mise version --json`，返回类型化结果或 `AppError`（`MISE_NOT_FOUND` / `MISE_TOO_OLD`）。
3. 在唯一的起始页面中渲染结果：版本号 + 二进制路径，或未安装状态。
4. 按 `conventions.md` 的 Testing 一节搭建 fixture-mise 测试桩和单元测试。

## Tauri 2 的坑（血泪教训，不要重新踩一遍）

- 前端对命令的每次调用都走 `@tauri-apps/api/core` 的 `invoke`；命令名在 Rust 中是 snake_case，在 `invoke` 中保持一致。
- 前端用到的任何新的 core/plugin API 都必须加入 `src-tauri/capabilities/default.json`，否则该调用在生产构建中会静默失败。
- 创建进程：使用 `tauri-plugin-shell`（加入 Cargo.toml、`tauri.conf.json` 的 plugins 和 capabilities），不要在需要流式输出的命令处理器里用 `std::process`；向 UI 流式输出使用 `tauri::ipc::Channel`。
