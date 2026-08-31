# MiseDeck

> [English](../AGENTS.md)

[mise](https://mise.jdx.dev) 的开源桌面 GUI 客户端。Tauri 2 + React/TypeScript，跨平台（macOS 优先打磨，Windows/Linux 为 beta）。产品原则：忠实呈现 mise 的命令面——不发明 CLI 里没有的概念（ADR-0004）。

## 动手写代码前

- 阅读 `CONTEXT.md`（领域术语表）和 `docs/adr/` 中与你要动的区域相关的 ADR。代码、issue 和 UI 文案统一使用术语表词汇。
- v1 spec 和实现 tickets 在 GitHub Issues（`ready-for-agent` 标签）；见 `docs/agents/issue-tracker.md`。

## 工作约定（每个 session 一个 ticket）

- 每个 session 只处理恰好一个 ticket。ticket 是带 `ready-for-agent` 标签的 GitHub issue；只有当其 "Blocked by" 列表中的每个 issue 都已关闭时，该 ticket 才可开始。用 `gh issue view <n> --json issueDependenciesSummary` 检查，或直接看 issue 页面。
- 写代码之前：阅读该 ticket、本文件、`docs/agents/architecture.md` 和 `docs/agents/conventions.md`。要做脚手架 ticket（#17）？还需阅读 `docs/agents/getting-started.md`。
- 严格限定在 ticket 的验收标准之内。发现 ticket 没覆盖到的东西？在 issue 上评论，而不是扩大范围。

## 不可妥协项

- 维护者是产品角色，不是代码审查者。每个改动都要自验证：构建、运行，并在声称完成之前查看运行中的应用——使用你的运行环境提供的任何 UI 自动化或截图能力为它截图。不留红的测试，不留坏的构建。
- 每个变更操作都走执行面板：展示真实的 mise 命令和实时日志。
- 所有 UI 文案走 i18n（en + zh-CN）；禁止硬编码文案。
- 从第一天起跨平台：路径与进程创建只走 Tauri/Rust 的 API。
- 新建或修改任何 Tauri command 前读 `docs/agents/architecture.md`；调用 mise、处理错误、写测试前读 `docs/agents/conventions.md`。

## 文档语言

英语是文档的规范语言（canonical）；中文版本面向中文读者。每份文档都有两个版本，并在顶部双向链接（`[简体中文]` / `[English]`）。所有中文文档位于 `zh-CN/` 目录下，目录结构与文件名与英文版完全镜像（例如 `docs/adr/0001-x.md` ↔ `zh-CN/docs/adr/0001-x.md`）。修改任一版本而不要把同样的改动级联到另一版本，就是 bug。

## Git

除非用户明确要求，不 commit、不 push、不做任何 git 状态变更。

## Agent skills

### Issue tracker

Issue 跟踪在本仓库的 GitHub Issues，使用 `gh` CLI。见 `docs/agents/issue-tracker.md`。

### Domain docs

单上下文：仓库根目录一个 `CONTEXT.md` 加 `docs/adr/`。见 `docs/agents/domain.md`。
