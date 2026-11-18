# 内置网络字体

> [English](../../../../../misedeck/src/assets/fonts/README.md)

六个文件，共 152 KiB。有意提交进仓库——原因见 `src/fonts.css`。

| 文件 | 字体家族 | 子集 |
| --- | --- | --- |
| `cormorant-garamond-latin.woff2` | Cormorant Garamond | latin |
| `cormorant-garamond-latin-ext.woff2` | Cormorant Garamond | latin-ext |
| `space-grotesk-latin.woff2` | Space Grotesk | latin |
| `space-grotesk-latin-ext.woff2` | Space Grotesk | latin-ext |
| `jetbrains-mono-latin.woff2` | JetBrains Mono | latin |
| `jetbrains-mono-latin-ext.woff2` | JetBrains Mono | latin-ext |

三个家族都是**可变**字体，每个「家族 + 子集」一个文件即可覆盖 UI 使用的全部
字重（400 / 500 / 600）。CJK 不打包：界面的中文回落到 `--font-ui` 的平台字
体栈（PingFang SC / Microsoft YaHei / Noto Sans CJK SC）。

## 来源

从 Google Fonts CSS API 用现代 user agent（`?family=…&display=swap`）一次性
下载，仅取 latin 与 latin-ext 子集。如需重新生成，请求相同的 query 并保留
`latin` / `latin-ext` 块；`src/fonts.css` 里的 `@font-face` 字重区间来自各
家族公布的 axis 范围。

- Cormorant Garamond — https://fonts.google.com/specimen/Cormorant+Garamond
- Space Grotesk — https://fonts.google.com/specimen/Space+Grotesk
- JetBrains Mono — https://fonts.google.com/specimen/JetBrains+Mono

## 许可证

三个家族都以 **SIL Open Font License 1.1** 授权，允许随软件捆绑与再分发。
OFL 要求版权声明与许可证随字体文件一起分发，因此每个家族的完整许可文本都放
在应用包的 `public/fonts/` 里（由 Vite 复制到 `dist/fonts/`，以 `/fonts/…`
提供服务）：

| 字体 | 许可文件 | 必需的版权行 |
| --- | --- | --- |
| Cormorant Garamond | [`OFL-CormorantGaramond.txt`](../../../../../misedeck/public/fonts/OFL-CormorantGaramond.txt) | Copyright 2015 The Cormorant Project Authors (github.com/CatharsisFonts/Cormorant) |
| Space Grotesk | [`OFL-SpaceGrotesk.txt`](../../../../../misedeck/public/fonts/OFL-SpaceGrotesk.txt) | Copyright 2020 The Space Grotesk Project Authors (https://github.com/floriankarsten/space-grotesk) |
| JetBrains Mono | [`OFL-JetBrainsMono.txt`](../../../../../misedeck/public/fonts/OFL-JetBrainsMono.txt) | Copyright 2020 The JetBrains Mono Project Authors (https://github.com/JetBrains/JetBrainsMono) |

上面的版权行是字体 `name` 表里内嵌的行，与实际捆绑的文件一致。

它们**不**受 MiseDeck 自己的许可证（仓库根目录的 `LICENSE`）覆盖，也不得单
独出售。
