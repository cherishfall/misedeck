# MiseDeck v<version>

MiseDeck 的首个稳定版本——[mise](https://mise.jdx.dev) 的忠实桌面 GUI。跨平台（macOS 优先打磨，Windows / Linux 为 beta）。

## 本期要点

- **全局工具管理**：在一个表格里安装、卸载、切换、升级，并查看过期徽标。
- **目录上下文**：解析后的工具、环境变量、lockfile 预览，附配置文件来源徽标。
- **配置编辑器**：以表单方式编辑全局与按目录的 `mise.toml` 的 `[tools]` 与 `[env]`。
- **任务**：列出、带实时输出地运行、简单编辑。
- **信任交互**：未信任目录只读展示，一键信任。
- **设置、诊断与插件/backend 浏览**。
- **mise 自我管理**：mise 缺失时引导安装，一键自我更新。
- **激活辅助**：在当前目录打开终端、复制激活命令、检查 shell 配置。
- **英文与简体中文界面**。

> [English](../../README.md) · [简体中文](../README.md)

## 安装

### macOS

```bash
brew install --cask cherishfall/tap/misedeck
```

或者从下方 assets 下载 `.dmg`，打开后把 MiseDeck 拖入 Applications。

> **首次启动（未签名）**：二进制**未做 Apple 公证**（参见 [ADR-0002](../../docs/adr/0002-distribution-github-releases-and-homebrew-tap.md)）。macOS Gatekeeper 会拦截首次打开，并可能提示应用已损坏。把 `misedeck.app` 拖入 `/Applications` 后，在终端移除 quarantine 标记：
>
> ```bash
> xattr -dr com.apple.quarantine /Applications/misedeck.app
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

下方附 `SHA256SUMS` 文件。安装前请校验：

```sh
# macOS / Linux
shasum -a 256 -c SHA256SUMS

# Windows (PowerShell)
Get-FileHash -Algorithm SHA256 .\<你下载的文件>
```

## 说明

- MiseDeck v1 在所有平台上**均为未签名**分发，这是有意的设计选择。代码签名与 Apple 公证在 v1 中超出范围。
- Windows 与 Linux 构建在本版本中标记为 **beta**。
- MiseDeck 是社区项目，与官方 mise 项目无隶属关系，亦未获其背书。
