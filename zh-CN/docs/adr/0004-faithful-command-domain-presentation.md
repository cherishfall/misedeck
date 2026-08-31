# Faithful command-domain presentation, directory context instead of project entity

> [English](../../../docs/adr/0004-faithful-command-domain-presentation.md)

MiseDeck 是 mise 现有命令面之上的忠实 GUI：每个界面都映射到一条 mise 用户已经熟悉的命令，应用不发明 CLI 没有的概念。项目级支持以**目录上下文**（mise 自己的 `cwd` 模型：顶部一个目录栏，默认为 Global；将其指向某个目录后，每个页面都通过 `mise -C` 在该目录上操作）来表达 —— 而不是带有注册机制或独立"项目世界"的项目实体。每个变更操作都通过一个执行面板运行，展示正在执行的确切 mise 命令及实时日志（教学装置、信任装置、调试装置），这一模式已由 Homebrew GUI Taphouse 验证。

## Considered Options

- 项目作为一等实体（项目列表、项目详情世界）：否决 —— 它让所有者困惑，违背 mise 自己的心智模型，也超出了"作为 mise 子命令之上的 UI 外壳"的初衷。
- 静默执行配友好 loading 动画：否决 —— 它隐藏了使命令映射具有教学价值和可信度的部分。

## Consequences

- README 和设计评审使用同一标准："mise CLI 用户能否预测这个界面会做什么？"
- 解决了在 issue #10 中跟踪的悬而未决的信息架构问题。
