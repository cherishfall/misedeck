# MiseDeck v<version>

> [English](https://github.com/cherishfall/mise-deck/blob/master/README.md) · [简体中文](https://github.com/cherishfall/mise-deck/blob/master/zh-CN/README.md)

## English

A stable release of MiseDeck, a faithful desktop GUI for [mise](https://mise.jdx.dev). Cross-platform (macOS polished, Windows / Linux beta).

### What's in this release

Eight pages, each one a part of the mise CLI:

- **Home**: version gate, guided install when mise is missing, one-click self-update.
- **Tools**: install, uninstall, switch, upgrade, and outdated badges in one table.
- **Overview**: resolved tools, env vars, config files in precedence order, and `mise.lock` — each row labeled with its source.
- **Env**: add, edit, rename, and unset environment variables, with source badges.
- **Tasks**: list, run with live output, create and edit.
- **Settings**: view, filter, edit, and unset settings, including `--all`.
- **Doctor**: status, shell activation, warnings, config files, and resolved toolset.
- **Plugins**: installed plugins, install from a git URL, uninstall.

Beyond the pages: the execution panel (exact command, live logs, exit code, copy-command, cancel), read-only untrusted directories with one-click `mise trust`, terminal and activation helpers, light/dark themes, and an English / Simplified Chinese UI.

### Install

GitHub Releases is the only distribution channel — v1 ships no Homebrew formula or cask (per [ADR-0002](https://github.com/cherishfall/mise-deck/blob/master/docs/adr/0002-distribution-github-releases-and-homebrew-tap.md)).

**macOS** — download the `.dmg` from the assets below, open it, and drag MiseDeck to Applications.

> **First launch (unsigned)**: the binary is **not notarized** (per [ADR-0002](https://github.com/cherishfall/mise-deck/blob/master/docs/adr/0002-distribution-github-releases-and-homebrew-tap.md)). macOS Gatekeeper will block the first open and may report that the app is damaged. After dragging `MiseDeck.app` to `/Applications`, remove the quarantine flag from Terminal:
>
> ```bash
> xattr -dr com.apple.quarantine /Applications/MiseDeck.app
> ```
>
> Then launch normally. Subsequent launches work without extra steps.

**Windows (beta)** — download the `.exe` installer and run it.

> **SmartScreen (unsigned)**: the binary is **not code-signed**. Windows SmartScreen will show "Windows protected your PC" — click **More info** → **Run anyway**.

**Linux (beta)** — pick the package that matches your distro: `.deb` (Debian / Ubuntu), `.rpm` (Fedora / RHEL), or `.AppImage` (portable, no install).

### Verify

`SHA256SUMS` is attached below and lists **every** asset in this release — run it from the folder you downloaded into.

```sh
# macOS
shasum -a 256 -c SHA256SUMS

# Linux
sha256sum -c SHA256SUMS

# Windows (PowerShell) — one file at a time
Get-FileHash -Algorithm SHA256 .\MiseDeck_<version>_x64-setup.exe
```

This catches a truncated download, a proxy that served the wrong file, or an asset replaced after upload. It does not prove who built the binary — the builds are unsigned (see Notes).

### Notes

- MiseDeck v1 is distributed **unsigned** on every platform, by design. Code signing and Apple notarization are out of scope for v1.
- Windows and Linux builds are labeled **beta** in this release.
- MiseDeck is a community project, not affiliated with or endorsed by the official mise project.

## 简体中文

MiseDeck <version> 稳定版——一个忠实于 [mise](https://mise.jdx.dev) 的桌面图形客户端。跨平台（macOS 打磨完成，Windows / Linux 为 beta）。

### 本版内容

八个页面，每个对应 mise CLI 的一部分：

- **首页**：版本门禁，mise 缺失时的引导安装，一键自我更新。
- **工具**：在一个表格里安装、卸载、切换、升级，带过时标记。
- **概览**：解析出的工具、环境变量、按优先级排列的配置文件与 `mise.lock`——每行标注来源。
- **环境变量**：新增、编辑、重命名、取消设置环境变量，带来源标记。
- **任务**：列出、带实时输出运行、新建与编辑。
- **设置**：查看、过滤、编辑与取消设置，包括 `--all`。
- **诊断**：状态、shell 激活、警告、配置文件与解析出的工具集。
- **插件**：已安装插件，按 git 地址安装，卸载。

页面之外：执行面板（确切命令、实时日志、退出码、复制命令、取消），未信任目录的只读视图与一键 `mise trust`，终端与激活助手，明暗两套主题，以及英文 / 简体中文界面。

### 安装

GitHub Releases 是唯一分发渠道——v1 不提供 Homebrew formula 或 cask（见 [ADR-0002](https://github.com/cherishfall/mise-deck/blob/master/docs/adr/0002-distribution-github-releases-and-homebrew-tap.md)）。

**macOS** —— 从下方资产下载 `.dmg`，打开并把 MiseDeck 拖进「应用程序」。

> **首次启动（未签名）**：二进制**未经公证**（见 [ADR-0002](https://github.com/cherishfall/mise-deck/blob/master/docs/adr/0002-distribution-github-releases-and-homebrew-tap.md)）。macOS Gatekeeper 会拦下第一次打开，并可能提示应用「已损坏」。把 `MiseDeck.app` 拖进 `/Applications` 后，在终端执行：
>
> ```bash
> xattr -dr com.apple.quarantine /Applications/MiseDeck.app
> ```
>
> 然后正常打开。之后的启动无需额外步骤。

**Windows（beta）** —— 下载 `.exe` 安装包并运行。

> **SmartScreen（未签名）**：二进制**未经代码签名**。Windows SmartScreen 会显示「已保护你的电脑」——点「更多信息」→「仍要运行」。

**Linux（beta）** —— 选择匹配发行版的包：`.deb`（Debian / Ubuntu）、`.rpm`（Fedora / RHEL）或 `.AppImage`（免安装）。

### 校验

下方附有 `SHA256SUMS`，覆盖本发布的**全部**资产——在你下载的目录里运行：

```sh
# macOS
shasum -a 256 -c SHA256SUMS

# Linux
sha256sum -c SHA256SUMS

# Windows (PowerShell) —— 逐个文件
Get-FileHash -Algorithm SHA256 .\MiseDeck_<version>_x64-setup.exe
```

它能发现被截断的下载、代发了错误文件的代理、或上传后被替换的资产。它不能证明二进制是谁构建的——构建未签名（见说明）。

### 说明

- MiseDeck v1 在所有平台**有意未签名**分发。代码签名与 Apple 公证不在 v1 范围内。
- 本发布中 Windows 与 Linux 构建标注为 **beta**。
- MiseDeck 是社区项目，与官方 mise 项目无隶属或背书关系。
