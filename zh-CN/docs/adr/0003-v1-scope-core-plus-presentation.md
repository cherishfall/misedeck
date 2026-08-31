# v1 scope: core layer plus presentation layer

> [English](../../../docs/adr/0003-v1-scope-core-plus-presentation.md)

v1 覆盖 mise 的**核心层**（Tool 的安装/切换/升级/outdated，Task 的查看/运行/编辑，环境变量管理，设置，插件/backend 浏览，全局与项目配置）和**展示层**（Lockfile 查看，`mise doctor` 诊断，配置层级可视化 —— 展示每个值来自哪个文件）。**深水区层** —— `mise bootstrap`、`mise oci`、`mise deps`、`mise mcp` —— 明确不在 v1 范围内，列在路线图上。

## Considered Options

- 字面意义的"完整支持"（含 bootstrap/oci/deps）：否决 —— 面向狭窄受众却要 3-4 倍的工作量。
- 仅核心层：否决 —— 展示层（尤其是配置层级可视化）是 GUI 相对于 CLI、以及相对于现有竞品 `likaia/mise_gui`（主要覆盖工具版本）的独特价值。

## Consequences

- README 必须把覆盖范围表述为"覆盖 mise 的核心工作流"而非"完整支持"，以避免预期错位。
- 集成方式是调用用户已安装的 mise CLI，优先使用 `--json` 输出；当 mise 缺失或版本过旧时，应用会检测到，并在 v1 中提供引导式一键安装 / 自我更新（由"v1.x"升级而来，见 Q11 讨论；issue #30）。
- v1 不提供公开的 `mise-deck` CLI 或 agent skill：Tauri 命令层本身就是"一次 UI 操作 → 一组 mise 命令"的封装，并保持可分离，以便日后抽取。对于 AI agent，在自建 CLI 之前先评估 `mise mcp`（mise 自己的 MCP 服务器）。
