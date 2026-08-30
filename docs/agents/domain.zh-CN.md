# Domain Docs

> [English](./domain.md)

工程 skill 在探索代码库时应如何使用本仓库的领域文档。

## Layout: single-context

本仓库是单上下文的：仓库根目录一个 `CONTEXT.md`，外加 `docs/adr/`。

```
/
├── CONTEXT.md
├── docs/adr/
│   ├── 0001-event-sourced-orders.md
│   └── 0002-postgres-for-write-model.md
└── src/
```

## Before exploring, read these

- 仓库根目录的 **`CONTEXT.md`**
- **`docs/adr/`**: 阅读与你即将工作的领域相关的 ADR。

如果这些文件不存在，**静默继续**。不要指出它们的缺失；不要建议提前创建它们。`/domain-modeling` skill（通过 `/grill-with-docs` 和 `/improve-codebase-architecture` 触达）会在术语或决策真正得到解决时惰性创建它们。

## Use the glossary's vocabulary

当你的输出命名一个领域概念时（在 issue 标题、重构提案、假设、测试名称中），使用 `CONTEXT.md` 中定义的术语。不要漂移到词汇表明确避免的同义词。

如果你需要的概念还不在词汇表中，那是一个信号：要么你在发明项目不使用的语言（重新考虑），要么存在一个真实的缺口（为 `/domain-modeling` 记下它）。

## Flag ADR conflicts

如果你的输出与现有 ADR 矛盾，明确地提出来，而不是静默地覆盖：

> _Contradicts ADR-0007 (event-sourced orders), but worth reopening because…_
