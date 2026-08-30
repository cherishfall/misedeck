# Architecture

> [English](./architecture.md)

分层，自上而下。每一层只与它的下一层对话。

```
React UI (src/)
  └─ Tauri commands (src-tauri/)   ← typed API boundary, separable by design
       └─ mise runner              ← builds argv, spawns mise, parses output
            └─ mise CLI            ← the only way the app touches mise state
```

## Rules

- **应用绝不直接编辑 mise 配置文件，也绝不解析 mise 内部结构。** 所有状态读取走 `mise ... --json`；所有写入走 mise 的写命令（`mise use`、`mise config set`、`mise settings set`、`mise trust` 等）。已知的 JSON 缺口（`plugins ls`、`search`、`tool-alias ls`）在 runner 内部回退到表格解析，绝不在 UI 代码中处理。
- **Directory context**（见 CONTEXT.md）：一个应用级状态，默认为 Global。每次 runner 调用都接收它，并在设置时传递 `-C <dir>`。任何页面都不硬编码目录。
- **命令层是可分离的**（ADR-0003，issue #11）：Tauri 命令很薄 —— 校验输入、调用 runner、整形结果。任何无需 UI 即可复用的东西都属于 runner，这样未来的公开 CLI 可以建立在同一层之上。
- **执行面板**（issue #15）是变更操作的唯一路径：它展示正在执行的确切命令并流式输出日志。只读查询可以跳过面板。
- **Trust**（issue #6）：对不受信任目录的只读视图以 `MISE_SAFE=1` 运行；变更或求值环境变量的操作先检查信任状态，并把用户引导到信任横幅。
- **i18n**：UI 文案存放在 en + zh-CN 资源文件中，按字符串 ID 索引；组件消费这些键。
- **前端状态**：服务端状态（mise 数据）按目录上下文获取，并按 (context, query) 缓存；UI 状态（选中的标签页、面板开合）保持本地。除最近目录列表和用户偏好外不做持久化。

## Data shapes

优先在 runner 边界把 mise 的 `--json` 输出映射为类型化结构体；前端只消费这些类型化形状，绝不消费原始 CLI 输出。

## Stack (prescribed — do not substitute)

中等能力的模型将实现这些 ticket；每一个未事先规定的选择都是一次漂移的机会。在此钉住大版本；其余交给 lockfile。

- **构建**：Vite + React 19 + TypeScript `strict`。包管理器：npm。
- **路由**：react-router v7。
- **i18n**：react-i18next；资源位于 `src/i18n/en.json` 和 `src/i18n/zh-CN.json`，扁平字符串 ID。
- **服务端状态**：TanStack Query v5；缓存键 = `[directoryContext, queryName, params]`。
- **本地状态**：只用 React state/context。不用 Redux，不用 zustand。
- **样式**：设计 token 以 CSS 自定义属性集中在单个 tokens 文件中 + 每个组件使用 CSS modules。不使用 CSS 框架。
- **Rust**：tauri 2 stable，serde/serde_json，tokio 用于进程生成。向执行面板流式输出使用 `tauri::ipc::Channel`，每行输出一条消息。任何新 crate 都需要在 PR 中说明理由。
- **Directory context 类型**：`enum DirContext { Global, Dir(PathBuf) }`，序列化到前端为 `{ kind: "global" } | { kind: "dir", path: string }`。
