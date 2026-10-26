# 持续集成（CI）

> [English](../../../docs/agents/ci.md)

本仓库在 `.github/workflows/` 下运行两个 GitHub Actions workflow。本页说明
它们各自的职责、触发时机，以及维护者如何发版。

## Workflow 一览

| Workflow      | 触发时机                                    | 做了什么                                                                                                                                  | 墙钟预算   |
| ------------- | ------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------- | ---------- |
| `ci.yml`      | 推送到 `master`、每个 PR                    | `npm ci` · `npm run ci`（typecheck、eslint、测试、全部 lint 守卫、生产构建）· `cargo fmt --all -- --check` · `cargo check` · `cargo clippy --all-targets --features fixtures -- -D warnings` · `cargo test`。前端跑在 Ubuntu + Windows，Rust 跑在 Ubuntu（完整套件）与 macOS（仅 `cargo check`）；另有独立 Windows job 跑 `npm run ci` + `cargo test --all-targets --features fixtures` + `cargo build`（见下文）。 | < 5 分钟    |
| `release.yml` | 推送 `v*.*.*` tag，或 `workflow_dispatch`   | `preflight` 先要求被 tag 的 commit 有一次绿色的 `ci.yml` 运行；然后在 `macos-latest`、`windows-latest`、`ubuntu-22.04` 上并行构建 Tauri bundle；上传各平台 artifact；真实 tag 推送时计算一份覆盖全版本的 `SHA256SUMS` 并发布 GitHub Release。       | 由矩阵决定 |

`ci.yml` 是保证 `master` 绿色的闸门。`release.yml` 才是真正产出
artifact 的那个。

**每一处 cargo 调用都带 `--features fixtures`，这不是装饰。**
`misedeck/src-tauri/src/bin/` 下的两个 harness 二进制（`mise` 脚本的跨平台替身）
被这个 feature 挡住，好让 release 构建里只有一个二进制。`tauri build` 先跑
`cargo build --bins`，然后打包「那个」应用二进制；包里有三个 bin 时它选中过
fixture —— 安装包只有 262 KB，装出来的应用打印 `no fixture for slug` 就退出。
这个选择既没法用 `tauri.conf.json` 的 `mainBinaryName` 控制（本来就已经设了），
也没法用 `-- --bin misedeck` 控制（试过，结果一样），所以干脆让 fixture 在
release 构建里不存在。不带这个 flag 时，集成测试会直接 panic 并打印它需要的命令。

**当包里有多个 bin 目标时，裸 `cargo run` 启动哪个由 `[package].default-run`
决定——而且它必须指向应用。** Cargo 在选择时把受 feature 门控的 fixture 也算进去，
所以没有这个键，`cargo run` 会报 "could not determine which binary to run"，
`npm run tauri dev` 也无法判断该监视哪个进程（#286 发现，#287 修好）。
`scripts/check-default-run.ts`——即 `npm run ci` 里的 `npm run lint:default-run`——
在包中有多个二进制、而 `default-run` 缺失或没有指向应用时失败。

`release.yml` 的 Linux 用 `ubuntu-22.04`，不是 `ubuntu-latest`
（issue #247）：二进制链接的是构建机的 glibc，24.04 上构建的包在
Ubuntu 22.04 / Debian 12 上无法启动。`ci.yml` 保持 `ubuntu-latest` ——
那个 job 检查的是与当前依赖的兼容性，不是可移植性。

### 权限与 action 固定

两个 workflow 都按最小权限运行（issue #278）：

- **两个** workflow 的顶层都是 `permissions: contents: read`。在
  `release.yml` 中只有 `release` job 在 job 级别声明
  `contents: write` —— 构建腿会执行 `npm ci` 和 cargo build 脚本，
  被攻破的依赖不能借这些步骤发布或改写 Release。
- 每个第三方 action 都固定到完整的 40 位 commit SHA，并在行尾注释
  标出可读版本（`uses: actions/checkout@11d5960… # v4.4.0`）。
  tag 和分支是可变的，SHA 不是。`dtolnay/rust-toolchain@stable`
  固定在其 `stable` 分支当前 head。刷新固定点时，用 `gh api`
  重新解析 tag，并在同一次改动里更新两个 workflow（以及本表的
  版本注释）。

`rust` job 在编译任何东西之前先跑 `cargo fmt --all -- --check`（issue
#287），随后是 `cargo clippy --all-targets --features fixtures -- -D warnings`：
格式或 lint 漂移（包括 `unexpected_cfgs`）都会让 CI 失败，而不是留在
`master` 上。fmt 关卡刻意放在 apt 安装**之前**：格式错误几秒内就能报出来，
不必先下载 Linux 依赖。本地修复方式：在 `misedeck/src-tauri` 下跑
`cargo fmt --all`。

### 前端检查只有一份清单

两条前端腿——`frontend (ubuntu-latest)` 与 `frontend (windows-latest)`——
以及 Windows 的 Rust job，跑的都是同一条命令：在 `misedeck/` 下
`npm run ci`，而这就是检查清单唯一存在的地方（issue #287）。此前 ubuntu
腿手抄了这份脚本的一个子集，于是 `lint:modal-focus`、
`lint:nested-interactive`、`lint:page-layout`、`lint:invoke-wrapper` 只在
Windows 上跑过，新增一个守卫得改两个地方才能全平台生效。
**新守卫一律加进 `misedeck/package.json` 的 `scripts.ci`，不要加进 workflow 文件。**

### macOS `cargo check` job

`ci.yml` 有一个 `macos:` job，只做一件事：在 `macos-latest` 上
`cargo check --all-targets --features fixtures`（issue #287）。
macOS 是本产品优先打磨的平台，而它的 Rust 代码对 ubuntu 那条腿是不存在的：
`src/lib.rs` 里的 objc 无障碍桥和 `src/shell.rs` 的 macOS 半边都在
`#[cfg(target_os = "macos")]` 之下，写错一个字符过去**只**会在
`release.yml` 里、也就是发版途中才碰到编译器。这个 job 刻意只做 check，
不跑测试也不打包：它守的是「macOS 专属代码能编译」，耗时是分钟级而不是
几十分钟，并与 ubuntu 腿共用 `Swatinem/rust-cache` 的设置（缓存键包含
host triple，两个 job 的条目互不覆盖）。macOS 专属代码里的 warning 仍
不受闸门约束——`clippy -D warnings` 只在 ubuntu 上跑。

### Windows job

`ci.yml` 还跑一个 `windows` job 覆盖 Windows beta 目标（issue #208）。
这是 Windows 代码路径在 CI 中真正执行的地方——但截至 2026-10-22，它已
不再是**唯一**的地方：Windows 代码路径如今已在真实 Windows 硬件上跑过，
正是那次实机运行暴露了 `#222` / `#223` 的 fixture 在 Windows 上根本不可用。
它跑的前端检查与两条 `frontend` 腿相同——`npm run ci`，也就是完整的检查清单
（见「前端检查只有一份清单」）——外加完整的 Rust 测试套件
（`cargo test --all-targets --features fixtures --no-fail-fast`），
其中包含 `#[cfg(windows)]` 的进程树 teardown 测试：每一条都启动
PowerShell，由 PowerShell 再启动一个隐藏的 `ping` 作为孙进程，并用
`tasklist` 断言两个进程都已消失——`terminate_tree`（issue #278），以及
退出清扫 `terminate_all` 自己的 Windows 覆盖（issue #284）——最后是
`cargo build` 编译冒烟（`dist/` 由 `npm run ci` 产出，所以顺序有讲究）。
有一件事是刻意不做的：

- Tauri 打包（`npm run tauri build`）——Windows 打包会拉 NSIS/WiX，
  且是否出包是发版时的决定。

集成测试套件在这里也会跑，因为 fixture 已经是 `src-tauri/src/bin/` 下的
跨平台 Rust 二进制（`fixture-mise`、`fixture-process-tree`），不再是 bash
脚本。bash 脚本在 Windows 上根本无法被 spawn：`CreateProcess` 拒绝没有
可执行扩展名的文件（os error 193）——这正是这个 job 过去只能跑
`cargo test --lib` 的原因。于是 `#222` / `#223` 的进程树用例
（`tests/runner.rs`）现在会用与 unix 半边**同样**的断言，验证 **Windows**
侧的 teardown——`CREATE_NEW_PROCESS_GROUP` 加上 `taskkill /F /T`。

Windows job 绿 = 编译级与测试级正确；它**不能**替代在真实 Windows 上跑应用。
这个替代仍然该被拒绝——正是那次实机运行找出了这个 job 抓不到的两个缺陷
（bash 脚本 fixture；以及在会忽略 `$HOME` 的平台上、测试伪造 `$HOME` 时会
静默失效的 home 解析接缝）。

### 发版前置检查

`release.yml` 以一个 `preflight` job 开头，`build` 依赖它（issue #287
第 5 项）。在 tag 推送时它只问一个问题——被 tag 的这个 commit 有没有一次
成功的 `ci.yml` 推送运行？——通过 Actions 的运行记录 API（`actions: read`，
仍然不给写权限）查询；答案为否时它在构建任何东西之前就失败，并把该
commit 上看到的运行列出来。它**不**重跑整套检查：那会在每条腿重复
`ci.yml`，而且仍然要等 bundle 产出之后才会失败。`workflow_dispatch`
下这一步被跳过，所以从分支手动演练矩阵不受影响。对发版仪式的后果是：
推 tag 之前先等该 commit 的 `ci.yml` 运行变绿，被取消的运行用
`gh run rerun <id>` 重跑。

## 发版流程

矩阵只在**推送 tag 时构建**（见 ADR-0002 —— 不做自动版本号）。发版步骤：

1. 在 `master` 上选定要发布的 commit。
2. 同步更新全部六处版本号，保持一致：
   - `misedeck/package.json`（`"version"`）
   - `misedeck/package-lock.json`（顶层 `"version"` 和 `packages[""].version`）
   - `misedeck/src-tauri/Cargo.toml`（`[package].version`）
   - `misedeck/src-tauri/Cargo.lock`（`name = "misedeck"` 包的 `version`）
   - `misedeck/src-tauri/tauri.conf.json`（`"version"`）
   Tauri CLI 会把版本号写入 bundle 元数据；`package.json` 的值是
   Vite 在构建时注入的。
3. **打 tag 之前先把 README 更新到位。** 按实际要发布的内容核对中英两份：
   状态行与版本号、页面/命令对照表、安装步骤（文件名、签名注意事项）、
   平台支持、已知限制，以及 `docs/screenshots/` —— 界面、文案或数据结构
   有变化的页面要重拍。README 还停留在旧版本属于发版阻塞项，不是收尾工作。
4. 发版说明来自附注 tag 的消息；轻量 tag 则回退到
   `.github/release-template.md`（见下文「附注 tag vs 轻量 tag」）。
5. 给该 commit 打 `vMAJOR.MINOR.PATCH` tag 并推送：
   ```sh
   git tag v0.2.0 <commit-sha>
   git push origin v0.2.0
   ```
   推送 tag 才会触发 `release.yml`。推送非 tag commit **不会**触发发版构建。
   被 tag 的 commit 必须已经有绿色的 `ci.yml` 运行（即上面的前置检查 job）；
   在那次运行结束前推 tag，发版会停在 `preflight` 并把看到的运行写进日志。
6. 在 Actions 标签页观察运行情况。前置检查 job 最先跑，然后是矩阵的三段；
   三段都成功后 `release` job 才会跑。
7. Release 发布后，下载 `SHA256SUMS` 文件，对至少一个平台的 hash
   做一次抽样校验，然后通告用户。

### 附注 tag vs 轻量 tag

如果用 `git tag -a v0.2.0 -m "..."` 推送 tag，附注消息会成为 Release 的正文。
如果只用 `git tag v0.2.0` 打 tag、再用 `git push origin v0.2.0` 推送轻量 tag，workflow 会
回退到 `.github/release-template.md`，把 `<version>` 替换为裸版本号
（`0.2.0`，不带前缀 `v`）。
常规发版推荐走模板路径；紧急修复的消息则适合用附注。

**附注正文来自文件时，要加 `--cleanup=verbatim`。** `git tag -F notes.md`
默认使用 `--cleanup=strip`，会删掉所有以 `#` 开头的行——双语的
`## English` / `## 简体中文` 标题会整个消失（v1.0.2 就撞上了；发布的
正文后来用 `gh release edit --notes-file` 恢复）。用 `-m` 内联写的附注
不受影响，因为首行是正文。

解析逻辑在 `scripts/resolve-release-notes.sh`：只有
`git cat-file -t "$TAG"` 返回 `tag` 时才读取 `%(contents)`，因为轻量
tag 会返回 commit 消息。脚本会先跑一次 `git fetch --tags --force origin`
（失败可容忍）：由 tag 触发的那次运行检出的只是 tag 指向的**提交**，
tag 对象本身不保证在克隆里——`v1.0.1` 就撞上了，附注被跳过、发出去的
是通用模板。CI 会运行 `scripts/test-release-notes.sh`，覆盖轻量 tag、
附注 tag，以及「附注 tag 的对象需要从 `origin` 取回」这一种，并检查渲染
结果里没有仓库相对链接（它们在 `/releases/tag/` 下会 404）。

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

`release.yml` 按矩阵腿上传一个 artifact，名字取自矩阵的 `os` 值：

- `misedeck-macos-latest` —— 只有 `*.dmg`。`.app` bundle 目录不上传：
  它是 DMG 打包的内容，而且体积太大，不适合挂到 Release。
- `misedeck-windows-latest` —— `*.exe`（NSIS 安装包），将来若产出
  `*.msi` 也会带上。
- `misedeck-ubuntu-22.04` —— `*.deb`、`*.rpm`、`*.AppImage`。

每次上传都保留打包器的目录结构，所以 artifact 是一棵嵌套目录树
（`dmg/`、`nsis/`、`deb/`、`rpm/`、`appimage/`），不是平铺的文件列表。

**一份 `SHA256SUMS` 覆盖整个版本，不是每个平台一份。** `release` job 在
三条腿全部落地之后才计算它，覆盖的正是最终挂出去的字节：`find` 遍历合并
后的产物树（所以被哈希的是嵌套路径），而每行打印的是文件的**裸文件名** ——
这份清单就是给用户在他下载到的目录里直接校验的：

```sh
shasum -a 256 -c SHA256SUMS   # macOS
sha256sum -c SHA256SUMS       # Linux
```

条目按文件名排序，因此对同一批资产重跑该 job 会逐字节复现同一个文件。
清单为空会让 job 直接失败，不用等上传 API 拒绝。随后 `release` job 把
`artifacts/**` 下的每个文件 —— 安装包加上这一份清单 —— 以原始文件名
挂到 GitHub Release 上。

早期 beta 的按平台清单已经取消（issue #251）：在单条腿里生成的清单只能
覆盖那条腿，beta.16 的那份最后只列了 Linux。

## 未签名 / Gatekeeper 提示

按 [ADR-0002 — 仅通过 GitHub Releases 分发，未签名](../adr/0002-distribution-github-releases-and-homebrew-tap.md)：

- **macOS** 二进制未做 Apple 公证。首次启动需要清除隔离标记 ——
  `xattr -dr com.apple.quarantine /Applications/MiseDeck.app` —— 或者
  **系统设置 → 隐私与安全性 → 仍要打开**（README → 安装）。
- **Windows** 二进制未做代码签名。SmartScreen 会显示
  "Windows 已保护你的电脑"——**更多信息** → **仍要运行**。
- **Linux** 以 `.deb`、`.rpm`、`.AppImage` 三种格式分发。这些包同样
  未签名：没有 GPG 签名，也没有仓库元数据。`SHA256SUMS` 是所有平台
  唯一的完整性校验。

`.github/release-template.md` 模板链接到这项决定，双语 README 在各自的
安装段里陈述同样的注意事项。v1 没有 Homebrew tap：GitHub Releases 是唯一
渠道（ADR-0002）。

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

CI 矩阵使用按 SHA 固定的 `dtolnay/rust-toolchain` 的 `stable`
与 Node 22；lockfile 是
`misedeck/src-tauri/Cargo.lock` 与 `misedeck/package-lock.json`，
两者都已提交。

## 缓存

`release.yml` 与 `ci.yml` 都使用：

- `Swatinem/rust-cache`（`v2.9.3`，按 SHA 固定）缓存 `~/.cargo` 与
  `misedeck/src-tauri/target`，键包含 lockfile + 矩阵 OS。
- `actions/setup-node`（`v4.4.0`，按 SHA 固定）的 `cache: 'npm'` 缓存
  `node_modules`，键为 `misedeck/package-lock.json`。

`release.yml` 用 `shared-key: ${{ matrix.os }}` 让三个平台缓存不互窜；
`ci.yml` 现在有两个 Rust job（ubuntu 与 macOS），同样不需要这个维度——
`rust-cache` 的键包含 host triple，两个条目不设 `shared-key` 也不会互窜。

## 构建失败时

1. 从 Actions 标签页或 issue tracker 链接打开失败的运行。
2. 定位失败的那一段（`build (windows-latest)`、`build (ubuntu-22.04)` 等）
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
├── release-template.md   # 策划好的发版说明，<version> 会被替换
└── workflows/
    ├── ci.yml            # 推 master + PR 的闸门
    └── release.yml       # tag 触发的矩阵 + release job

zh-CN/.github/
└── release-template.md   # 双语镜像，结构相同
```

`zh-CN/.github/release-template.md` 与英文版保持同步，遵循 `AGENTS.md` 中
的"文档语言"规则。release job 只消费英文模板：`scripts/resolve-release-notes.sh`
读取 tag 附注或 `.github/release-template.md`。两份 README 都是双语的，
但它们不是 workflow 的输入。
