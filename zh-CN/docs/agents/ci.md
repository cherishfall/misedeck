# 持续集成（CI）

> [English](../../docs/agents/ci.md)

本仓库在 `.github/workflows/` 下运行两个 GitHub Actions workflow。本页说明
它们各自的职责、触发时机，以及维护者如何发版。

## Workflow 一览

| Workflow      | 触发时机                                    | 做了什么                                                                                                                                  | 墙钟预算   |
| ------------- | ------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------- | ---------- |
| `ci.yml`      | 推送到 `master`、每个 PR                    | `npm ci` · `tsc --noEmit` · `npm run lint:i18n` · `npm run build` · `cargo check` · `cargo test`。前端跑在 Ubuntu + Windows，Rust 跑在 Ubuntu。 | < 5 分钟    |
| `release.yml` | 推送 `v*.*.*` tag，或 `workflow_dispatch`   | 在 `macos-latest`、`windows-latest`、`ubuntu-latest` 上并行构建 Tauri bundle；上传各平台 artifact；真实 tag 推送时发布 GitHub Release。       | 由矩阵决定 |

`ci.yml` 是保证 `master` 绿色的闸门。`release.yml` 才是真正产出
artifact 的那个。

## 发版流程

矩阵只在**推送 tag 时构建**（见 ADR-0002 —— 不做自动版本号）。发版步骤：

1. 在 `master` 上选定要发布的 commit。
2. 同步更新两个地方的版本号：
   - `misedeck/src-tauri/Cargo.toml`（`[package].version`）
   - `misedeck/package.json`（`"version"`）
   两者必须一致。Tauri CLI 会读取 `Cargo.toml` 的值并写入 bundle 的元数据；
   `package.json` 的值是 Vite 在构建时注入的。
3. 在双语 README 中更新 changelog 条目（或者在 #32 落地后，按项目惯例的位置更新）。
4. 给该 commit 打 `vMAJOR.MINOR.PATCH` tag 并推送：
   ```sh
   git tag v0.2.0 <commit-sha>
   git push origin v0.2.0
   ```
   推送 tag 才会触发 `release.yml`。推送非 tag commit **不会**触发发版构建。
5. 在 Actions 标签页观察运行情况。矩阵有三段；三段都成功后 `release` job 才会跑。
6. Release 发布后，下载 `SHA256SUMS` 文件，对至少一个平台的 hash
   做一次抽样校验，然后通告用户。

### 附注 tag vs 轻量 tag

如果用 `git tag -a v0.2.0 -m "..."` 推送 tag，附注消息会成为 Release 的正文。
如果用 `git tag v0.2.0 && git push origin v0.2.0` 推送轻量 tag，workflow 会
回退到 `.github/release-template.md`，把 `<version>` 替换为 tag 名。
常规发版推荐走模板路径；紧急修复的消息则适合用附注。

## 不切 tag 也能测试矩阵

`release.yml` 暴露了 `workflow_dispatch` 触发器，让维护者可以从分支上
演练完整构建矩阵：

1. 推送你想测试的分支。
2. 在 GitHub UI 打开 **Actions** 标签页。
3. 左侧栏选择 **release**。
4. 点击 **Run workflow** → 选分支 → **Run workflow**。

`build` job 会跑全部三个平台。`release` job 在 `workflow_dispatch` 下
**被跳过** —— 它只在真实 tag 推送时运行，因此手动测试不会误发布 Release。

## 每个 artifact 里有什么

`release.yml` 按矩阵腿上传一个 artifact，名字带 OS：

- `misedeck-macos-latest` —— `*.app` bundle 目录、`*.dmg`
- `misedeck-windows-latest` —— `*.exe`（NSIS 安装包）
- `misedeck-ubuntu-latest` —— `*.deb`、`*.rpm`、`*.AppImage`
- 每个 artifact 内部还含一份 `SHA256SUMS`，列出每个二进制的 `sha256` 哈希。

`release` job 下载全部三个 artifact，把它们的文件（二进制 + 三份
`SHA256SUMS`）以原始文件名挂到 GitHub Release 上。

## 未签名 / Gatekeeper 提示

按 [ADR-0002 — 通过 GitHub Releases 与自托管 Homebrew tap 分发，未签名](../adr/0002-distribution-github-releases-and-homebrew-tap.md)：

- **macOS** 二进制未做 Apple 公证。首次启动需要**右键 → 打开**绕过
  Gatekeeper 隔离。
- **Windows** 二进制未做代码签名。SmartScreen 会显示
  "Windows 已保护你的电脑"——**更多信息** → **仍要运行**。
- **Linux** 以 `.deb`、`.rpm`、`.AppImage` 三种格式分发。包管理器
  在本地处理信任（包的 GPG 签名，不是二进制的签名）。

`.github/release-template.md` 模板和双语 README 都链接到这份说明。
当 README 把用户引到模板的 "Gatekeeper / SmartScreen note" 段时，
该链接落在 ADR-0002 上。

代码签名与公证在 v1 中**不在路线图上**，直到项目跨过把
`homebrew-cask` 提交流程变得值得的知名度门槛才会重新评估。

## 可复现性

ticket 中"可复现构建"的含义是：在同一份工具链下，从干净 checkout
出发，矩阵能产生可用的二进制。**不**意味着跨次运行字节一致 —— Tauri
的构建产物会嵌入时间戳、代码签名哈希（若启用）以及其他非确定性元数据。

本地从干净 checkout 重建：

```sh
# Rust 工具链
curl --proto '=https' --tlsv1.2 https://sh.rustup.rs -sSf | sh

# 前端依赖
cd misedeck
npm ci
npm run tauri build -- --bundles app,dmg  # Linux 上用 deb,rpm,appimage
```

CI 矩阵使用 `dtolnay/rust-toolchain@stable` 与 Node 22；lockfile 是
`misedeck/src-tauri/Cargo.lock` 与 `misedeck/package-lock.json`，
两者都已提交。

## 缓存

`release.yml` 与 `ci.yml` 都使用：

- `Swatinem/rust-cache@v2` 缓存 `~/.cargo` 与
  `misedeck/src-tauri/target`，键包含 lockfile + 矩阵 OS。
- `actions/setup-node@v4` 的 `cache: 'npm'` 缓存 `node_modules`，
  键为 `misedeck/package-lock.json`。

`release.yml` 用 `shared-key: ${{ matrix.os }}` 让三个平台缓存不互窜；
`ci.yml` 的 `rust` job 只在单一 OS 上跑，无需这个维度。

## 构建失败时

1. 从 Actions 标签页或 issue tracker 链接打开失败的运行。
2. 定位失败的那一段（`build (windows-latest)`、`build (ubuntu-latest)` 等）
   和失败的那一步。
3. 如果是 Linux 上的系统依赖报错，本页中 apt 包列表就是真值源 —— 同步更新
   release 与 ci 两个 workflow，并按
   [Tauri 2 Linux prerequisites](https://v2.tauri.app/start/prerequisites/#linux)
   刷新包列表。
4. 如果是 Tauri 或 Rust 报错，在本地用同一工具链（Node 22、Rust stable）
   复现：`npm run tauri build`。
5. 在你正在做的 ticket 的收尾评论里附上 issue 链接，让失败留下可追溯的记录。

## 文件布局

```
.github/
├── release.yml           # tag 触发的矩阵 + release job
├── release-template.md   # 策划好的发版说明，<version> 会被替换
├── ci.yml                # 推 master + PR 的闸门
└── workflows/            # （目前没有别的 workflow）

zh-CN/.github/
└── release-template.md   # 双语镜像，结构相同
```

`zh-CN/.github/release-template.md` 与英文版保持同步，遵循 `AGENTS.md` 中
的"文档语言"规则。workflow 目前只消费英文模板；#32（双语 README + 发版准备）
落地后，release job 可以按 tag 或 workflow 输入选择语言。
