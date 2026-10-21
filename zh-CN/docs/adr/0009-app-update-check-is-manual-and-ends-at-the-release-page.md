# MiseDeck 自身的更新检查是手动的，且终点是 Release 页

> [English](../../../docs/adr/0009-app-update-check-is-manual-and-ends-at-the-release-page.md)

MiseDeck 之前无法说明自己在跑哪个构建，也无从得知有更新的构建存在——十五个 beta 发出去之后才有人想起这件事。显而易见的解法是 Tauri 的 updater 插件；诚实的解法比它小得多，因为三条约束让"原地自动更新"在这里弊大于利。

**1. 构建未签名。** 没有 Apple Developer ID，也没有公证（见 README → 已知限制），每次 macOS 安装都得先执行 `xattr -dr com.apple.quarantine` 才能启动。Tauri updater 会原地替换 `.app` 包，Gatekeeper 随后重新评估新的包并判定其"已损坏"。自动更新不但省不掉那一步，还会给应用增加一条"把自己搞坏"的路径，用户最后仍然要回到终端。Tauri 的 minisign 签名保护的是字节，不是 Gatekeeper 的裁决。

**2. 每个 MiseDeck 发布都是 prerelease。** `release.yml` 把任何含 `-beta` 的 tag 标为 prerelease，因此 GitHub 的 "Latest" 标记永远不会指向它。官方文档推荐的静态 manifest 路线（`releases/latest/download/latest.json`）于是解析不到任何东西——更新源根本看不见本项目自己的 release。要让它工作，要么放弃 prerelease 标记（丢掉 Releases 页上的视觉区分），要么每次发版都在 CI 里用一把签名私钥生成并上传 manifest 与 `.sig` 产物；而按 Tauri 官方文档，这把私钥丢一次，已安装的用户就永远收不到更新。

**3. 这里 GitHub 慢到不可达，而这个应用从未发过一次网络请求。** MiseDeck 至今唯一的出站流量是一条 shell 命令：为 mise 安装器跑 `curl | sh`，把网络交给平台自带的工具。沿这条路自动下载 100 MB 经常失败，而且失败得很晚；把链接交给浏览器则失败成本极低，还能让用户自己的代理或下载器接手。

**决定：检查是手动的、有上限的，以一条链接收尾。**

- 运行版本来自 Tauri 上下文（`getVersion()`），绝不来自界面里的字面量。显示与比较用同一个值，二者不可能不一致。
- 检查只在用户要求时执行。启动时什么都不发：一个卡在被限速的请求上的冷启动比"不知道有没有新版"更糟；而要让启动检查变安全，需要限速加持久化状态——那是一个功能，不是一个细节。
- 传输用 `curl` 拉 `https://github.com/cherishfall/misedeck/releases.atom`，上限 8 秒。feed 在 `github.com` 上（在 `api.github.com` 常常不可达的网络里仍可达），无需 token、无速率配额，而且——决定性的一点——它列出 prerelease。排序用 semver，因此 `1.0.0-beta.17` 胜过 `1.0.0-beta.16`，正式版胜过它自己的 beta。
- 所有失败——断网、代理、超时、缺 curl、feed 解析不出东西——都收敛成一句话加一个重试。不弹模态、不自动重试、不打断正在跑的 mise 命令。
- 有更新的构建就给出它的 Release 页。应用绝不直接链接二进制，也绝不下载。

## 考虑过的选项

- **`tauri-plugin-updater` + `latest.json` 端点。** 否决，三条约束同时命中：它强制 minisign 签名且无法关闭，需要 `createUpdaterArtifacts` 与 CI secrets，其官方 GitHub 路线看不见 prerelease，而未公证的 macOS 构建在换包后下次启动会被报"已损坏"。
- **自动下载、把传输交给浏览器。** 否决，这是个帮不到任何人的中间态：它仍然装不了东西，用户下载的还是从那条链接就能下到的同一个文件。
- **启动时静默检查，在版本号上点一个点。** 本轮否决，但不是永久否决：那是对的终态，但它需要一个"上次检查时间"、一个限速策略，以及一个能跨重启存活的"有新版"标记。那套状态机值得单开 ticket；把它塞进应用有史以来第一个网络请求里，等于一次提交做两个功能。
- **用 GitHub REST API 替代 Atom feed。** 否决，理由是可达性：`api.github.com` 恰恰是这类用户网络里最可能不可达的主机，它还额外带来 feed 没有的匿名速率配额。
- **引入 HTTP 客户端（reqwest / http 插件）。** 否决：为一个 GET 请求不值得拉进一整棵 TLS 依赖树，何况项目本来就把网络交给平台工具，而且 `curl` 免费继承机器的代理配置。
- **把版本与检查放进 About 页。** 否决：侧栏页脚已经承载了应用对自己的另外两项描述（语言、主题）。让"这个应用"只有一个表面、"mise"归页面，位置本身就在替数字消歧。

## 后果

- 显示版本不需要新权限——`core:default` 已含 `core:app:allow-version`。
- 更新检查是应用第一个、也是唯一一个出站请求。它收在一个 Tauri 命令之后；将来若第二个界面想联网，必须在那里说明理由。
- 本决策固定了词汇：每条文案都以 MiseDeck 作主语（"Check for MiseDeck updates"、"MiseDeck is up to date"），因为 `update`、`upgrade`、`release` 与"新版本"在本应用别处已分别指 mise 或 Tool。版本号永远不加 "Version" 说明——那个词归 `labels.version`。
- `README.md` 的 "No auto-update" 限制仍然为真，也仍然写着。只有在 Apple 签名到位时才重写它；届时由新 ADR 取代本文。
- 发版不再额外产出任何东西：没有 manifest、没有 `.sig`、没有 CI secrets。feed 由 GitHub 根据已经存在的 tag 生成。
- 所有平台统一用 `curl`（Windows 10 1803+ 自带 `curl.exe`）而不做 PowerShell 分支，从而保住 Windows/Linux 一致性——审查回路里没有机器能跑那个分支。
