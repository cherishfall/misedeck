# Issue tracker: GitHub

> [English](../../../docs/agents/issue-tracker.md)

本仓库的 issue 和规格说明以 GitHub issues 的形式存在。所有操作使用 `gh` CLI。

## Conventions

- **创建 issue**: `gh issue create --title "..." --body "..."`。多行正文使用 heredoc。
- **读取 issue**: `gh issue view <number> --comments`，用 `jq` 过滤评论，同时获取标签。
- **列出 issues**: `gh issue list --state open --json number,title,body,labels,comments --jq '[.[] | {number, title, body, labels: [.labels[].name], comments: [.comments[].body]}]'`，并配合适当的 `--label` 和 `--state` 过滤。
- **评论 issue**: `gh issue comment <number> --body "..."`
- **添加 / 移除标签**: `gh issue edit <number> --add-label "..."` / `--remove-label "..."`
- **关闭**: `gh issue close <number> --comment "..."`

从 `git remote -v` 推断仓库；在克隆目录内运行时 `gh` 会自动完成这一步。

## Pull requests as a triage surface

**PR 作为请求入口：否。** _（如果本仓库把外部 PR 当作功能请求处理，则设为 `yes`；`/triage` 会读取此标志。）_

设为 `yes` 时，PR 与 issue 走同一套标签和状态，使用对应的 `gh pr` 命令：

- **读取 PR**: `gh pr view <number> --comments`，以及用 `gh pr diff <number>` 查看 diff。
- **列出待 triage 的外部 PR**: `gh pr list --state open --json number,title,body,labels,author,authorAssociation,comments`，然后只保留 `authorAssociation` 为 `CONTRIBUTOR`、`FIRST_TIME_CONTRIBUTOR` 或 `NONE` 的（丢弃 `OWNER`/`MEMBER`/`COLLABORATOR`）。
- **评论 / 打标签 / 关闭**: `gh pr comment`、`gh pr edit --add-label`/`--remove-label`、`gh pr close`。

GitHub 在 issue 和 PR 之间共享同一个编号空间，所以一个裸的 `#42` 可能是两者中的任何一个：先用 `gh pr view 42` 解析，失败则回退到 `gh issue view 42`。

## When a skill says "publish to the issue tracker"

创建一个 GitHub issue。

## When a skill says "fetch the relevant ticket"

运行 `gh issue view <number> --comments`。

## Wayfinding operations

由 `/wayfinder` 使用。**map** 是一个单独的 issue，其**子** issue 是 ticket。

- **Map**: 一个标有 `wayfinder:map` 标签的单独 issue，存放 Notes / Decisions-so-far / Fog 正文。`gh issue create --label wayfinder:map`。
- **子 ticket**: 通过 GitHub sub-issue 关联到 map 的 issue（在 sub-issues 端点上使用 `gh api`）。在未启用 sub-issues 的地方，把子项加入 map 正文中的任务列表，并在子项正文顶部写上 `Part of #<map>`。标签：`wayfinder:<type>`（`research`/`prototype`/`grilling`/`task`）。认领后，ticket 指派给驱动开发的 dev。
- **阻塞**: GitHub 的**原生 issue 依赖**，这是规范的、在 UI 中可见的表示方式。用 `gh api --method POST repos/<owner>/<repo>/issues/<child>/dependencies/blocked_by -F issue_id=<blocker-db-id>` 添加一条边，其中 `<blocker-db-id>` 是阻塞方的数字**数据库 id**（`gh api repos/<owner>/<repo>/issues/<n> --jq .id`，_不是_ `#number` 或 `node_id`）。GitHub 报告 `issue_dependencies_summary.blocked_by`（仅开放的阻塞项，即实时的门槛）。在依赖不可用时，回退为在子项正文顶部写一行 `Blocked by: #<n>, #<n>`。当所有阻塞项都关闭时，ticket 解除阻塞。
- **Frontier 查询**: 列出 map 的开放子项（`gh issue list --state open`，范围限定在 map 的 sub-issues / 任务列表），丢弃任何有开放阻塞项的（`issue_dependencies_summary.blocked_by > 0`，或 `Blocked by` 行中有开放 issue）或已有 assignee 的；map 顺序中的第一个胜出。
- **认领**: `gh issue edit <n> --add-assignee @me`，这是会话中的第一个写操作。
- **解决**: `gh issue comment <n> --body "<answer>"`，然后 `gh issue close <n>`，然后向 map 的 Decisions-so-far 追加一个上下文指针（gist + 链接）。
