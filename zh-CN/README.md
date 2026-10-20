# MiseDeck

> [English](../README.md)

**[mise](https://mise.jdx.dev)（多语言工具版本管理器）的桌面 GUI。** 它用 mise 自己的概念构建，而不是在上面另造一层：每个页面镜像 CLI 的一部分，每次改动都真实执行一条 `mise` 命令，命令行、日志与退出码都原样留在执行面板里。

> **状态：公开测试版 `v1.0.0-beta.14`**（自 2026 年 8 月起共 14 个构建）。1.0 尚未定稿，文案与布局在 beta 之间仍会变化。macOS（Apple Silicon）是打磨过的目标平台；Linux 有包但未验证；Windows 为实验性支持。

## 为什么

- **展示解析结果，不靠猜**：已装工具、生效版本、可升级项、按目录的覆盖——每一行都标出来自哪个配置文件。
- **不藏黑箱**：写操作走 CLI，执行面板保留实际执行的命令和它的输出。
- **目录级配置，无需终端**：把应用指向一个目录，就能看到 mise 在该目录下解析出的结果。

## 功能

所有页面都作用在**全局**（`mise -g`）或你选定的**目录**上，最近使用的目录会被记住。目录作用域的写操作，在该目录的配置被信任之前保持禁用。

| 页面 | 可以做什么 | 背后的命令 |
| --- | --- | --- |
| **首页** | 版本检查；mise 缺失时引导安装；一键自我更新 | `mise version`、`mise self-update` |
| **工具** | 已装与生效的工具；registry 搜索；按版本安装、启用、卸载；切换版本；升级过时项；链接本地构建；过滤与翻页 | `mise ls`、`mise registry`、`mise ls-remote`、`mise install`、`mise use`、`mise uninstall`、`mise upgrade`、`mise unuse`、`mise outdated`、`mise link` |
| **概览** | 解析出的工具与环境变量、按优先级排列并可查看内容的配置文件、`mise.lock`——每行标注来源 | `mise ls`、`mise env`、`mise config ls` |
| **环境变量** | 新增、编辑、重命名、取消设置；来源标记；变量定义在写入作用域之外时给出警告 | `mise env`、`mise set`、`mise unset` |
| **任务** | 列出、过滤、带实时输出运行、新建与编辑、在编辑器中打开配置 | `mise tasks ls`、`mise run`、`mise tasks add`、`mise tasks edit` |
| **设置** | 查看、过滤、编辑、取消设置，含 `--all`；表类型的键只读并说明原因 | `mise settings ls`、`mise settings set`、`mise settings unset` |
| **诊断** | 状态、shell 激活、警告、配置文件、解析出的工具集；结构化数据不可用时回退到带染色的原始输出 | `mise doctor` |
| **插件** | 已安装插件；按 git URL 安装；卸载 | `mise plugins ls`、`mise plugins install`、`mise plugins uninstall` |

页面之外：

- **执行面板**：完整命令行、工作目录、流式日志、耗时、退出码、复制命令、取消、收起；可同时运行多条命令。
- **信任机制**：未信任的目录为只读，附横幅与一键 `mise trust`。
- **Shell 激活**：检测 shell rc 中缺失的 `mise activate` 并给出该行内容；可在当前目录打开终端。
- **失败可见**：加载或命令失败时，stderr 与重试留在界面上，而不是渲染一个空页面。
- 双语界面（English / 简体中文）与明暗两套主题。

## 环境要求

- **mise ≥ 2025.1.0**——MiseDeck 调用 CLI，不内置它；mise 缺失时首页可以帮你安装。
- **macOS（Apple Silicon）** 使用预构建包；Linux x86_64 有包但未验证；Windows x64 为实验性支持。
- 从源码构建：Rust stable 与 Node.js 22+。

## 安装

未签名的预构建文件附在 [GitHub Releases](https://github.com/cherishfall/misedeck/releases)。

### macOS（Apple Silicon）

1. 从最新 release 下载 `misedeck_<version>_aarch64.dmg`。
2. 打开 DMG，把 **misedeck** 拖进 `/Applications`。
3. 首次启动会被 Gatekeeper 拦下——见下一节。

### macOS：构建未签名

发布的 macOS 构建没有 Apple Developer ID 签名，也没有公证，因此 Gatekeeper 把它当作不可信：

| 看到的提示 | 出现时机 |
| --- | --- |
| **“misedeck”已损坏，无法打开。您应该将它移到废纸篓。** | 把应用从 DMG 拖出后打开——最常见的症状 |
| **“misedeck”无法打开，因为无法验证开发者。** | 首次双击 |
| **“misedeck”无法打开，因为 Apple 无法检查其是否包含恶意软件。** | 同上，出现在较新的 macOS 上 |

文件没有损坏——这是 macOS 给未签名下载打上的隔离标记（`com.apple.quarantine`）。对已安装的副本清除它：

```bash
xattr -dr com.apple.quarantine /Applications/misedeck.app
```

然后正常打开。不需要 `sudo`；`-d` 删除该属性，`-r` 递归作用于整个应用包。

不想用终端：先打开一次并关掉对话框，进入**系统设置 → 隐私与安全性 → 安全性**，点击**仍要打开**，完成认证，再打开应用并确认**打开**。

仍然打不开时：

- 运行 `/Applications` 里的副本，而不是挂载中 DMG 里的那个（后者只读）。
- 确认标记已清除：`xattr -p com.apple.quarantine /Applications/misedeck.app` 应返回 *No such xattr*。
- 每次重装后都要重新执行——新下载的文件会重新带上标记。
- 不要全局关闭 Gatekeeper（`sudo spctl --master-disable`）；只清理这一个应用，范围最小也足够。

### Linux x86_64

- Debian/Ubuntu：`misedeck_<version>_amd64.deb`
- Fedora/RHEL：`misedeck-<version>-1.x86_64.rpm`
- 任意发行版：`misedeck_<version>_amd64.AppImage`——先 `chmod +x`，再运行。

由 CI 打包，维护者从未在真实桌面上跑过。请预期粗糙之处。

### Windows x64——实验性

每个 release 都会附带 `misedeck_<version>_x64-setup.exe`。Windows 尚未验证：维护者正在真机上测试，Windows 上定位 mise 可执行文件的问题仍在修复（[#208](https://github.com/cherishfall/misedeck/issues/208)）。目前请预期它跑不起来；欢迎反馈。

## 从源码构建

仓库根目录不是应用目录：`package.json` 在 `misedeck/` 子目录里，所有 npm 命令都要在那里执行。

```bash
git clone https://github.com/cherishfall/misedeck.git
cd misedeck/misedeck   # 仓库根 → 应用目录（package.json 在这里）
npm install
npm run tauri build
```

已经克隆过了？先 `cd <repo>/misedeck`——在仓库根目录执行 `npm install` 会报 `ENOENT … package.json`。

安装包输出到 `src-tauri/target/release/bundle/`；`npm run tauri dev` 会配合 Vite 开发服务器运行应用。Linux 上请先安装 [`.github/workflows/release.yml`](../.github/workflows/release.yml) 里列出的 WebKitGTK/GTK 开发包。

## 已知限制

- macOS 构建未签名、未公证（见上）。
- 没有自动更新：请下载新构建，装好后重新执行一次 `xattr`。
- 取消是软取消——它让 MiseDeck 停止等待，但不会杀掉 `mise` 子进程。
- Windows 为实验性支持（[#208](https://github.com/cherishfall/misedeck/issues/208)）；Linux 未验证。
- 没有 Intel macOS 构建；需要请从源码构建。
- beta 阶段：界面文案与布局在版本之间可能变化。

## 截图

[`docs/screenshots/`](../docs/screenshots/) 里的图片早于侧边栏、浅色主题和作用域切换，与当前应用已不一致。1.0 前会重新拍摄。

## 参与贡献

见 [AGENTS.md](../AGENTS.md)、术语表 [CONTEXT.md](../CONTEXT.md)、决策记录 [docs/adr/](../docs/adr/)。问题与反馈提到 [Issues](https://github.com/cherishfall/misedeck/issues)。

## 免责声明

MiseDeck 是社区项目，与 mise 官方项目无隶属或背书关系。

## 许可证

[MIT](../LICENSE)
