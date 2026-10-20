# MiseDeck

> [English](../README.md)

**[mise](https://mise.jdx.dev)（多语言工具版本管理器）的桌面 GUI。** MiseDeck 映射 CLI 而不是把它藏起来：每个界面都对应一条 mise 命令，每个操作都向你展示它实际执行的命令与实时输出。

> **状态：公开测试版 `v1.0.0-beta.14`。** 自 2026 年 8 月起已发布 14 个 beta，v1 的功能面基本成型；1.0 尚未定稿，界面、文案与行为在 beta 之间仍会变化。macOS（Apple Silicon）是打磨过的目标平台；Linux 包会构建，但维护者未实测；Windows 暂不支持。

## 为什么

- **一目了然**：已装工具、生效版本、可升级项、按目录的覆盖及其配置来源——不用在脑子里算 PATH。
- **安全操作**：每个变更都展示真实的 `mise` 命令和实时日志，没有黑箱。
- **边用边学**：GUI 教你 CLI，而不是把它藏起来。
- **目录级配置，无需终端**：把应用指向一个目录，就能看到（并编辑）mise 在该目录下解析出的结果。

## 功能

所有页面都作用在**全局**（`mise -g`）或你选定的**目录**上，最近使用的目录会被记住。目录作用域的写操作，在该目录的配置被信任之前保持禁用。

| 页面 | 可以做什么 | 背后的命令 |
| --- | --- | --- |
| **首页** | 检查 mise 是否存在、版本是否够新；缺失时引导安装；一键自我更新 | `mise version`、`mise self-update` |
| **工具** | 当前作用域已装与生效的工具；registry 搜索；按版本安装、启用、卸载；切换生效版本；升级过时工具；链接本地构建的目录；过滤与翻页 | `mise registry`、`mise ls`、`mise ls-remote`、`mise install`、`mise use`、`mise upgrade`、`mise unuse`、`mise uninstall`、`mise outdated`、`mise link` |
| **概览** | 解析出的工具、解析出的环境变量、按优先级排列并可查看内容的配置文件，以及 `mise.lock`——每行都标注来源 | `mise ls`、`mise env`、`mise config ls` |
| **环境变量** | 新增、编辑、重命名、取消设置环境变量；带来源标记；当变量定义在写入作用域之外时给出警告 | `mise env`、`mise set`、`mise unset` |
| **任务** | 列出并过滤任务、带实时输出运行、新建与编辑、在编辑器中打开配置、查看依赖 | `mise tasks ls`、`mise run`、`mise tasks add`、`mise tasks edit` |
| **设置** | 查看、过滤、编辑、取消设置 mise 配置项（含 `--all`）；表类型的键为只读并说明原因 | `mise settings ls`、`mise settings set`、`mise settings unset` |
| **诊断** | 结构化的健康报告——状态、shell 激活、警告、配置文件、解析出的工具集；结构化数据不可用时回退到带染色的原始输出 | `mise doctor` |
| **插件** | 已安装插件；按 git URL 安装自定义插件；卸载 | `mise plugins ls`、`mise plugins install`、`mise plugins uninstall` |

贯穿全局的能力：

- **执行面板**：所有命令都在这里运行——完整命令行、工作目录、流式日志、耗时、退出码、复制命令、取消、收起。可以同时跑多条命令，并切换查看。
- **信任机制**：未信任的目录为只读，横幅说明原因，一键执行 `mise trust`。
- **Shell 激活**：检测 shell rc 中缺失的 `mise activate`，给出该行内容，并可在当前目录打开终端。
- **双语界面**（English / 简体中文）与**明暗两套主题**。
- **失败可见**：加载失败与命令失败会留在界面上，附 stderr 与重试，而不是悄悄渲染一个空页面。

## 环境要求

- **mise ≥ 2025.1.0。** MiseDeck 调用 CLI，不内置它。mise 缺失或过旧时，首页会引导你执行官方安装脚本或 `mise self-update`。
- **macOS（Apple Silicon）** 使用当前预构建包。Linux x86_64 包会附带发布，但未实测。Windows 见[已知限制](#已知限制)。
- 从源码构建：Rust stable、Node.js 22+。

## 安装

未签名的预构建文件在 [GitHub Releases](https://github.com/cherishfall/misedeck/releases)。目前没有 Homebrew cask。

### macOS（Apple Silicon）——受支持的目标平台

1. 从最新 release 下载 `misedeck_<version>_aarch64.dmg`。
2. 打开 DMG，把 **misedeck** 拖进 `/Applications`。
3. 首次启动会被 Gatekeeper 拦下——先看下一节，别急着认为应用坏了。

### macOS：首次启动提示“已损坏”或“无法验证开发者”是正常现象

macOS 构建**没有用 Apple Developer ID 签名，也没有公证**，所以系统把下载来的应用当作不可信。根据打开方式不同，你会看到：

| 看到的提示 | 常见触发方式 |
| --- | --- |
| **“misedeck”已损坏，无法打开。您应该将它移到废纸篓。** | 把应用从 DMG 拖出来之后打开——最常见的症状 |
| **“misedeck”无法打开，因为无法验证开发者。** | 首次双击应用 |
| **“misedeck”无法打开，因为 Apple 无法检查其是否包含恶意软件。** | 同上，出现在较新的 macOS 上 |

这些**都不代表下载的文件损坏**——这是 Gatekeeper 给未签名应用打上的隔离标记（`com.apple.quarantine`）。

**推荐解法：对已安装的副本执行一条命令：**

```bash
xattr -dr com.apple.quarantine /Applications/misedeck.app
```

然后正常打开即可。`-d` 表示删除该属性，`-r` 表示递归作用于整个应用包。不需要 `sudo`——你对自己刚装的应用有权限。

**不想用终端：**

1. 先尝试打开一次应用，然后关掉对话框。
2. 打开**系统设置 → 隐私与安全性**，向下找到**安全性**。
3. 点击**仍要打开**，完成认证，再打开一次应用并确认**打开**。

**如果仍然打不开：**

- 要运行 `/Applications` 里的副本，而不是挂载中 DMG 里的那个（DMG 内是只读的，改不了隔离标记）。
- 确认标记已清除：`xattr -p com.apple.quarantine /Applications/misedeck.app` 应返回 *No such xattr*。
- 每次重装或升级后都要重新执行一次 `xattr`——新下载的文件会重新带上隔离标记。
- **不要**全局关闭 Gatekeeper（`sudo spctl --master-disable`）。只清理这一个应用的标记，范围最小也足够。

### Linux x86_64——会构建，维护者未实测

- Debian/Ubuntu：`misedeck_<version>_amd64.deb`
- Fedora/RHEL：`misedeck-<version>-1.x86_64.rpm`
- 任意发行版：`misedeck_<version>_amd64.AppImage`——先 `chmod +x`，再运行。

请预期粗糙之处：这一路只经过 CI 编译，维护者从未在真实桌面上跑过。欢迎反馈。

### Windows

暂不支持。Windows 安装包仍会出现在 Releases 上，因为 CI 会构建整个矩阵，但 MiseDeck 在 Windows 上找不到 mise 可执行文件——请把那些文件当成不可用的预览版。进展见 [#208](https://github.com/cherishfall/misedeck/issues/208)。

## 从源码构建

```bash
git clone https://github.com/cherishfall/misedeck.git
cd misedeck/misedeck
npm install
npm run tauri build
```

安装包输出到 `misedeck/src-tauri/target/release/bundle/`。开发模式用 `npm run tauri dev`。在 Linux 上，请先安装 [`.github/workflows/release.yml`](../.github/workflows/release.yml) 中列出的 WebKitGTK/GTK 开发包。

## 已知限制

- **未代码签名、未公证**（macOS），见上面的安装章节。
- **没有自动更新。** 请从 Releases 下载新版本；安装后需重新执行 `xattr` 修复。
- **取消是“软取消”。** 它让 MiseDeck 不再等待并允许你继续操作，但不会杀掉 `mise` 子进程。
- **Windows 尚不可用**（[#208](https://github.com/cherishfall/misedeck/issues/208)），**Linux 未实测**。
- **仅支持 Apple Silicon。** 没有 Intel macOS 构建；需要请从源码构建。
- beta 迭代很快：界面文案与布局在版本之间可能变化。

## 截图

[`docs/screenshots/`](../docs/screenshots/) 里的图片来自较早的 beta——此后应用新增了侧边栏、浅色主题与全局/目录作用域切换，与当前界面已不一致。1.0 前会重新拍摄。

## 参与贡献

本项目对 AI agent 友好：从 [AGENTS.md](../AGENTS.md)、术语表 [CONTEXT.md](../CONTEXT.md)、决策记录 [docs/adr/](../docs/adr/) 开始。问题与反馈请提到 [Issues](https://github.com/cherishfall/misedeck/issues)。

## 免责声明

MiseDeck 是社区项目，与 mise 官方项目无隶属或背书关系。

## 许可证

[MIT](../LICENSE)
