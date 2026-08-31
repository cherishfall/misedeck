# MiseDeck

> [English](../AGENTS.md)

[mise](https://mise.jdx.dev) 的开源桌面 GUI 客户端。Tauri 2 + React/TypeScript，跨平台（macOS 优先打磨，Windows/Linux 为 beta）。产品原则：忠实呈现 mise 的命令面——不发明 CLI 里没有的概念（ADR-0004）。

## 动手写代码前

- 阅读 `CONTEXT.md`（领域术语表）和 `docs/adr/` 中与你要动的区域相关的 ADR。代码、issue 和 UI 文案统一使用术语表词汇。
- v1 spec 和实现 tickets 在 GitHub Issues（`ready-for-agent` 标签）；见 `docs/agents/issue-tracker.md`。
- UI 工作的色彩、字体、布局、动效一律取自 `docs/design/visual-language.md`（issue #33）；禁止临时发明新 token 或动效。

## 工作约定（每个 session 一个 ticket）

- 每个 session 只处理恰好一个 ticket。ticket 是带 `ready-for-agent` 标签的 GitHub issue；只有当其 "Blocked by" 列表中的每个 issue 都已关闭时，该 ticket 才可开始。用 `gh issue view <n> --json issueDependenciesSummary` 检查，或直接看 issue 页面。
- 写代码之前：阅读该 ticket、本文件、`docs/agents/architecture.md` 和 `docs/agents/conventions.md`。要做脚手架 ticket（#17）？还需阅读 `docs/agents/getting-started.md`。
- 严格限定在 ticket 的验收标准之内。发现 ticket 没覆盖到的东西？在 issue 上评论，而不是扩大范围。
- 自主模式：当用户要求连续推进 ticket 时，关闭一个 ticket 后直接开始下一个可开工的。只在以下情况停下来询问：需要人类品味的决策（视觉设计、命名）、需要对外操作（发布、仓库设置、密钥）、同一 ticket 连续失败三次、需求含糊。

## 不可妥协项

- 维护者是产品角色，不是代码审查者。每个改动都要自验证：构建、运行，并在声称完成之前查看运行中的应用——使用你的运行环境提供的任何 UI 自动化或截图能力为它截图。不留红的测试，不留坏的构建。
- 每个变更操作都走执行面板：展示真实的 mise 命令和实时日志。
- 所有 UI 文案走 i18n（en + zh-CN）；禁止硬编码文案。
- 从第一天起跨平台：路径与进程创建只走 Tauri/Rust 的 API。
- 新建或修改任何 Tauri command 前读 `docs/agents/architecture.md`；调用 mise、处理错误、写测试前读 `docs/agents/conventions.md`。

## 文档语言

英语是文档的规范语言（canonical）；中文版本面向中文读者。每份文档都有两个版本，并在顶部双向链接（`[简体中文]` / `[English]`）。所有中文文档位于 `zh-CN/` 目录下，目录结构与文件名与英文版完全镜像（例如 `docs/adr/0001-x.md` ↔ `zh-CN/docs/adr/0001-x.md`）。修改任一版本而不要把同样的改动级联到另一版本，就是 bug。

## 会话卫生

上下文是预算，不是档案馆。过长的上下文会退化（context rot、lost-in-middle）且烧 token；最佳区间远小于窗口上限。

- 每个上下文只做一个 ticket。一个 ticket 关闭后，下一个在全新会话或全新 subagent 中开始——绝不在旧上下文的尾巴上继续。
- 记忆存放在制品里——issue、文档、代码——而不是对话里。结束任何会话前，把下一个会话需要的东西外置（一条 issue 评论、一份收尾说明）。
- 主动建议开新会话的时机：一个 ticket 刚关闭、另一个即将开始；会话已在多个不相关话题间漂移；上下文已经长到"重读一遍文档比信任压缩后的记忆更便宜"。
- 把孤立的子任务（探索、批量编辑、验证性检查）交给自带上下文的 subagent，而不是养大主上下文。自主推进 ticket 时，每个 ticket 都用一个 subagent 执行，保持司机上下文轻薄。

## Git

agent 可以在完成 ticket 的过程中 commit 和 push：DoD 全部通过后提交到 master，commit message 引用对应 issue（`#N`）。仅在并行 worktree 时使用 `ticket/NN-*` 分支 + PR。master 必须始终保持绿色。禁止 force-push、改写已发布历史、删除分支或 tag。

## Agent skills

### Issue tracker

Issue 跟踪在本仓库的 GitHub Issues，使用 `gh` CLI。见 `docs/agents/issue-tracker.md`。

### Domain docs

单上下文：仓库根目录一个 `CONTEXT.md` 加 `docs/adr/`。见 `docs/agents/domain.md`。
