# MiseDeck v<version>

> [English](https://github.com/cherishfall/misedeck/blob/master/README.md) · [简体中文](https://github.com/cherishfall/misedeck/blob/master/zh-CN/README.md)

MiseDeck 的稳定版本——[mise](https://mise.jdx.dev) 的忠实桌面 GUI。跨平台（macOS 优先打磨，Windows / Linux 为 beta）。

## 本期要点

八个页面，各自对应 mise CLI 的一部分：

- **首页**：版本检查；mise 缺失时引导安装；一键自我更新。
- **工具**：在一个表格里安装、卸载、切换、升级，并查看过期徽标。
- **概览**：解析出的工具与环境变量、按优先级排列的配置文件、`mise.lock`——每行标注来源。
- **环境变量**：新增、编辑、重命名、取消设置；带来源标记。
- **任务**：列出、带实时输出地运行、新建与编辑。
- **设置**：查看、过滤、编辑、取消设置，含 `--all`。
- **诊断**：状态、shell 激活、警告、配置文件、解析出的工具集。
- **插件**：已安装插件；按 git URL 安装；卸载。

页面之外：执行面板（精确命令、实时日志、退出码、复制命令、取消）、未信任目录只读展示并支持一键 `mise trust`、终端与激活辅助、明暗主题，以及英文 / 简体中文界面。

## 安装

GitHub Releases 是唯一的分发渠道 —— v1 不提供 Homebrew formula 或 cask（参见 [ADR-0002](https://github.com/cherishfall/misedeck/blob/master/docs/adr/0002-distribution-github-releases-and-homebrew-tap.md)）。

### macOS

从下方 assets 下载 `.dmg`，打开后把 MiseDeck 拖入 Applications。

> **首次启动（未签名）**：二进制**未做 Apple 公证**（参见 [ADR-0002](https://github.com/cherishfall/misedeck/blob/master/docs/adr/0002-distribution-github-releases-and-homebrew-tap.md)）。macOS Gatekeeper 会拦截首次打开，并可能提示应用已损坏。把 `MiseDeck.app` 拖入 `/Applications` 后，在终端移除 quarantine 标记：
>
> ```bash
> xattr -dr com.apple.quarantine /Applications/MiseDeck.app
> ```
>
> 然后正常启动即可。后续启动不再需要的额外步骤。

### Windows（beta）

下载 `.exe` 安装包并运行。

> **SmartScreen（未签名）**：二进制**未做代码签名**。Windows SmartScreen 会显示「Windows 已保护你的电脑」——点击**更多信息** → **仍要运行**。

### Linux（beta）

按发行版选择对应格式：

- `.deb` —— Debian / Ubuntu
- `.rpm` —— Fedora / RHEL
- `.AppImage` —— 便携，无需安装

## 校验

下方附 `SHA256SUMS`，覆盖本版本**全部**资产 —— 在你下载到的目录里执行。

```sh
# macOS
shasum -a 256 -c SHA256SUMS

# Linux
sha256sum -c SHA256SUMS

# Windows（PowerShell）—— 逐个文件校验
Get-FileHash -Algorithm SHA256 .\MiseDeck_<version>_x64-setup.exe
```

它能挡住下载截断、代理返回了错文件、以及上传后被替换的资产。它不能证明二进制是谁构建的 —— 这些构建没有签名（见下方说明）。

## 说明

- MiseDeck v1 在所有平台上**均为未签名**分发，这是有意的设计选择。代码签名与 Apple 公证在 v1 中超出范围。
- Windows 与 Linux 构建在本版本中标记为 **beta**。
- MiseDeck 是社区项目，与官方 mise 项目无隶属关系，亦未获其背书。
