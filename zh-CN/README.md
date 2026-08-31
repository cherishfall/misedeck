# MiseDeck

> [English](../README.md)

**[mise](https://mise.jdx.dev)（多语言工具版本管理器）的桌面 GUI。** 忠实于你已知的命令行：每个界面都对应一条 mise 命令，每个操作都向你展示它实际执行的命令。

> 早期开发中 —— v1 正在构建。见 [spec](../../issues/16) 与 [tickets](../../issues?q=label%3Aready-for-agent)。

## 为什么

- **一目了然**：已装工具、生效版本、可升级项、按目录的覆盖及其配置来源——不再用脑算 PATH。
- **安全操作**：每个变更都展示真实的 `mise` 命令和实时日志，没有黑箱。
- **边用边学**：GUI 教你 CLI，而不是把它藏起来。
- **目录级配置，无需终端**：把应用指向一个目录，就能看到（并编辑）mise 在该目录下解析出的结果。

## 功能（v1）

- 全局工具管理：安装、卸载、切换、升级、过时提醒
- 目录上下文：按目录解析工具与环境变量，标注配置来源
- 配置编辑：全局与目录级 `mise.toml` 的 `[tools]`、`[env]` 表单
- 任务：列表、实时输出运行、简单编辑
- 信任机制：未信任目录默认只读
- 设置、doctor 诊断、插件/后端浏览
- 中英文双语界面

## 安装

首个版本发布时提供：GitHub Releases 未签名构建，以及 `brew install --cask cherishfall/tap/misedeck`。macOS 优先；Windows 和 Linux 的 beta 构建由 CI 产出。

## 参与贡献

本项目对 AI agent 友好：从 [AGENTS.md](./AGENTS.md)、术语表 [CONTEXT.md](./CONTEXT.md)、决策记录 [docs/adr/](./docs/adr/) 开始。

## 免责声明

MiseDeck 是社区项目，与 mise 官方项目无隶属或背书关系。

## 许可证

[MIT](./LICENSE)
