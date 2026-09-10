# 工具级移除是 `mise unuse`，移除类词汇按 mise 的两条轴拆分

> [English](../../../docs/adr/0008-tool-removal-is-unuse-not-uninstall.md)

工具页行级的"卸载"按钮过去跑的是 `mise uninstall <tool>@<version>`。该命令只删文件，不动 Config file 里的请求，于是下次 install 时 mise 会把工具装回来——维护者报告卸载用起来不对劲（"是不是缺一个卸载功能"）。根因是模型错位：mise 在两条独立的轴上跟踪一个工具——*是否被 Config file 请求*与*磁盘上是否有文件*——并为每条轴各配了一对动词（配置轴 `use`/`unuse`，文件轴 `install`/`uninstall`)。GUI 此前把两条轴压缩成了一个"卸载"按钮，而且为"移除这个工具"选错了那条轴。

**GUI 的动作词表与 mise 的四个动词一一对应，按出现位置划分作用域：**

| UI (en) | UI (zh) | 命令 | 作用域 |
|---|---|---|---|
| Use | 使用 | `mise use <tool>@<version>` | 版本：启用，缺失则自动安装——首要写操作 |
| Install only | 仅安装 | `mise install <tool>@<version>` | 版本：仅文件——例外情形 |
| Uninstall | 删除此版本 | `mise uninstall <tool>@<version>` | 版本：删除非激活版本的文件 |
| Unuse | 卸载 | `mise unuse <tool>` | 工具：移出配置 + 清理安装 |

对于未在任何 Config file 中声明的工具（孤儿安装，例如用户在 CLI 手动 `mise install` 过）,"卸载"动作改跑 `mise uninstall --all <tool>`——`unuse` 没有请求可删，会报错。按钮文案不变；确认对话框一律显示精确 argv（教学规则）。

英文文案保留 mise 的原生动词，因为确认对话框会回显精确命令，而 GUI 承担教学 CLI 的职责——按钮与命令不一致会破坏这个承诺。中文文案在"卸载"上刻意分叉：中文软件语境里"卸载"的常识语义是*彻底移除*，对应的是 `unuse` 而非 `uninstall`；把"卸载"配给 `mise uninstall` 会在用户脑中重新制造原来的 bug。

## 考虑过的选项

- **保留单一"卸载"映射到 `mise uninstall`。** 否决——这正是 bug 本身：配置请求还在，文件会被装回来。
- **英文按钮标 "Uninstall" 但底层跑 `mise unuse`。** 否决——回显的命令与按钮矛盾，而教学 CLI 是产品原则一。
- **用"弃用"或"停用"作为 `unuse` 的中文词。** 否决——二者与屏幕上任何词都不构成反义对，且"停用"暗示可逆的暂停，而 `unuse` 会删文件。两个移除动词在 UI 中从不共享作用域（一个在版本行，一个在工具行），因此不需要一对出现在同一屏的反义词。
- **四个动词同等凸显。** 否决——仅安装是"囤版本"的小众动作；抬高它会给主旅程（use）增加一步。

## 后果

- `CONTEXT.md` 新增 Use / Unuse / Install / Uninstall 四个词条，将此映射固化为项目词汇。
- 激活中的版本行不提供版本级"删除此版本"：它的请求写在 Config file 里，删文件只会招来立即重装。离开激活版本的唯一出口是工具级"卸载"。
- 孤儿安装可通过同一个"卸载"动作移除（经由 `mise uninstall --all`)；工具页上不存在删不掉的东西。
- 工具页重构（可展开的版本中心、Registry 搜索入口）建立在该词表之上：远程行是 使用/仅安装，已装行是 使用/删除此版本，工具行是 卸载。
- 工具页的命令提示（command hint）新增 `mise unuse`。
