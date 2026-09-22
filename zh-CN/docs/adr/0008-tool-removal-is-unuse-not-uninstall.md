# 工具级移除是 `mise unuse`，移除类词汇按 mise 的两条轴拆分

> [English](../../../docs/adr/0008-tool-removal-is-unuse-not-uninstall.md)

工具页行级的"卸载"按钮过去跑的是 `mise uninstall <tool>@<version>`。该命令只删文件，不动 Config file 里的请求，于是下次 install 时 mise 会把工具装回来——维护者报告卸载用起来不对劲（"是不是缺一个卸载功能"）。根因是模型错位：mise 在两条独立的轴上跟踪一个工具——*是否被 Config file 请求*与*磁盘上是否有文件*——并为每条轴各配了一对动词（配置轴 `use`/`unuse`，文件轴 `install`/`uninstall`)。GUI 此前把两条轴压缩成了一个"卸载"按钮，而且为"移除这个工具"选错了那条轴。

**GUI 的动作词表与 mise 的四个动词一一对应，按出现位置划分作用域：**

| UI (en) | UI (zh) | 命令 | 作用域 |
|---|---|---|---|
| Use | 使用 | `mise use <tool>@<version>` | 版本：启用，缺失则自动安装——首要写操作（「版本管理」区：已安装 + 未安装行） |
| Install | 安装 | `mise install <tool>@<version>` | 版本：仅文件——例外情形（未安装行） |
| Uninstall | 卸载 | `mise uninstall <tool>@<version>` | 版本：删除某个版本的文件（在用 + 已安装行） |
| Unuse | 取消使用 | `mise unuse <tool>` | 工具：移出配置 + 清理安装（仅在用行——见下方 beta13 修订） |
| Uninstall | 卸载 | `mise plugins uninstall <plugin>` | 插件：移除插件（#164 追记） |

*beta13 后的文案*：en "Install only" → "Install"；zh 删除此版本 → 卸载；Unuse 的 zh 文案 卸载 → 取消使用（beta13 定稿，见下方修订）。

*本文的 orphan 分支决策已* **被 beta13 取代（#187/#188/#189）**。原文：对于未在任何 Config file 中声明的工具（孤儿安装，例如用户在 CLI 手动 `mise install` 过），"卸载"动作改跑 `mise uninstall --all <tool>`——`unuse` 没有请求可删，会报错；按钮文案不变，确认对话框一律显示精确 argv（教学规则）。该分支已退役：主表不再有行级 Unuse，`unuse` 只在「版本管理」区的在用行可达，而在用行必有配置请求；孤儿安装在「已安装」区逐版本卸载（`mise uninstall <tool>@<version>`），`mise uninstall --all` 不进入 GUI。

英文文案保留 mise 的原生动词，因为确认对话框会回显精确命令，而 GUI 承担教学 CLI 的职责——按钮与命令不一致会破坏这个承诺。中文文案在 beta11 时对"卸载"刻意分叉：中文软件语境里"卸载"的常识语义是*彻底移除*，对应 `unuse` 而非 `uninstall`，把"卸载"配给 `mise uninstall` 会在用户脑中重新制造原来的 bug。*beta13 起取代*：unuse 的 zh 文案改名「取消使用」，「卸载」得以与版本级 `mise uninstall` 诚实配对。

## 考虑过的选项

- **保留单一"卸载"映射到 `mise uninstall`。** 否决——这正是 bug 本身：配置请求还在，文件会被装回来。
- **英文按钮标 "Uninstall" 但底层跑 `mise unuse`。** 否决——回显的命令与按钮矛盾，而教学 CLI 是产品原则一。
- **用"弃用"或"停用"作为 `unuse` 的中文词。** 否决——二者与屏幕上任何词都不构成反义对，且"停用"暗示可逆的暂停，而 `unuse` 会删文件。两个移除动词在 UI 中从不共享作用域（一个在版本行，一个在工具行），因此不需要一对出现在同一屏的反义词。
- **四个动词同等凸显。** 否决——仅安装是"囤版本"的小众动作；抬高它会给主旅程（use）增加一步。

## 后果

- `CONTEXT.md` 新增 Use / Unuse / Install / Uninstall 四个词条，将此映射固化为项目词汇。
- 激活中的版本行不提供版本级"删除此版本"：它的请求写在 Config file 里，删文件只会招来立即重装。离开激活版本的唯一出口是工具级"卸载"。*（beta13 起取代：在用区行的版本级「卸载」已启用——danger，该版本未装时按行禁用并附 Tooltip——确认弹窗如实教学「会重新安装」的后果。）*
- 孤儿安装可通过同一个"卸载"动作移除（经由 `mise uninstall --all`)；工具页上不存在删不掉的东西。*（beta13 起取代：GUI 有意不暴露批量删除——孤儿安装逐版本卸载；见下方修订。）*
- 工具页重构（表格下方的「版本管理」区、Registry 搜索入口）建立在该词表之上：未安装行是 使用/安装，已安装行是 使用/卸载，在用行是 取消使用/卸载，主表的工具行不再承载任何移除动作（仅 ghost「版本管理」入口）。
- 工具页的命令提示（command hint）新增 `mise unuse`。

## 追记（beta11，#164）

plugin 级移除加入上表：插件页的「卸载」运行 `mise plugins uninstall <plugin>`（#112）。因此「卸载」涵盖两个层级——tool 级（`mise unuse <tool>`）与 plugin 级（`mise plugins uninstall <plugin>`）——而 version 级移除在任何位置都保持「Uninstall」/「删除此版本」（`mise uninstall <tool>@<version>`；zh「删除此版本」→「卸载」见下方 beta13 修订）。本 ADR 原始前提「两个移除动词在 UI 中从不共享作用域」描述的仅是工具页；插件卸载落地晚于本 ADR，在此以显式的作用域扩展追记，而非任其成为未记录的漂移。

## 修订（beta13，#187/#188/#189/#190）

beta13 的结构重设计取代了本文的 orphan 分支决策并重定了文案。本 ADR 系**经 beta13 修订**，而非撤销——其核心原则（每个标签只配它实际运行的命令，确认弹窗的教学回显绝不与按钮矛盾）完整保留，且从此无任何例外：

- **结构。** 主表操作列只保留一个 ghost「版本管理」/ Manage versions 按钮（点击 = 展开表格下方的版本管理区、填入工具名、滚动到位）。全部版本操作都在该区的三个分区，顺序恒定——在用 → 已安装 → 未安装。工具级 Unuse 只在在用行出现，而在用行必有配置请求——orphan 分支（本 ADR 唯一容忍过的标签/命令错位）结构性消失。
- **无批量删除（产品级决策，owner 定稿）。** GUI 有意不暴露任何批量安装/卸载：全站不存在「卸载全部版本」动作，`mise uninstall --all` 不进入 GUI。理由：mise 管理的是开发工具，稳定优先于追新（见 `product-logic.md` → 指导政策中的「不追新」条款），且用户的工具数量不多，逐版本清理不构成负担。孤儿安装在「已安装」区逐版本卸载（`mise uninstall <tool>@<version>`）。
- **文案定稿。** Unuse 的 zh 文案为「取消使用」（use 的反义），「卸载」让位给版本级 `mise uninstall`；en 文案统一为裸动词（Use / Install / Uninstall / Unuse），弃用 "Install only" /「删除此版本」等限定语。上文 beta11 的 zh 分叉理由随改名退役。
- beta11 追记（插件作用域）不变。
