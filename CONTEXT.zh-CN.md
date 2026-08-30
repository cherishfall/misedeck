# MiseDeck

> [English](./CONTEXT.md)

MiseDeck 是 [mise](https://mise.jdx.dev)（多语言工具版本管理器）的开源桌面 GUI 客户端。它以引导式 UX 覆盖 mise 的核心工作流，优先支持 macOS，Windows/Linux 为 beta。

## Language

**Tool**（工具）:
由 mise 管理的运行时或 CLI（node、python、ripgrep 等）。以 `backend:name` 形式标识；裸名称通过 Registry 解析。
_Avoid_: runtime, package, program

**Backend**（后端）:
mise 从中安装 Tool 的包生态（`core`、`asdf`、`aqua`、`ubi`、`cargo`、`npm`、`pipx`、`vfox` 等）。
_Avoid_: source, provider, installer

**Plugin**（插件）:
asdf 风格或 vfox 风格的扩展，教 mise 如何安装 Tool。可以是 Registry 支持的（shortname），也可以是自定义的（git URL / 本地路径）。
_Avoid_: extension, addon

**Registry**（注册表）:
mise 内置的 Tool 简写名到 Backend 的映射（`mise registry`）。
_Avoid_: catalog, index

**Config file**（配置文件）:
声明 Tool、环境变量、Task 和设置的 TOML 文件（`mise.toml`、`.mise.toml`、`mise.<env>.toml`、`.config/mise/config.toml` 等）。文件按目录优先级合并；写入目标是最高优先级目录中优先级最低的文件。
_Avoid_: manifest, config (unqualified)

**Environment**（环境）:
通过 `MISE_ENV` / `-E` 加载的命名配置档案（例如 `mise.staging.toml`）。每个 Environment 有自己的 Lockfile。
_Avoid_: profile, mode

**Task**（任务）:
在 Config file 中定义（`[tasks.x]`）或作为 `mise-tasks/` / `.mise/tasks/` 下可执行文件任务存在的可运行单元，支持依赖图和环境变量。
_Avoid_: script, job, command

**Lockfile**（锁文件）:
`mise.lock` —— 固定的 Tool 版本，包含各平台的 URL、校验和和来源信息。
_Avoid_: lock, snapshot

**Trust**（信任）:
mise 的安全门禁：来自不受信任 Config file 的 env/hooks/Task 在用户信任该文件（`mise trust`）之前不会运行。GUI 必须将其暴露出来，绝不能静默绕过。
_Avoid_: approval, whitelist

**Directory context**（目录上下文）:
MiseDeck 表现得如同从该目录被调用 —— 即 mise 自己的 `cwd` 模型。默认为 Global；将其指向某个目录后，每个页面都在该目录上操作（`mise -C <dir>`）。不存在项目注册或项目实体。
_Avoid_: project, workspace, scope switcher

**Shims**（垫片）:
`~/.local/share/mise/shims` 下的可执行文件 —— 适合 IDE、CI 和 GUI 启动的进程的激活模式，与交互式 shell 激活相对。
_Avoid_: symlinks, wrappers
