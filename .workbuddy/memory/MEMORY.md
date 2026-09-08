# MiseDeck project memory

## Owner preferences

- **视觉对比 > 技术选项**：做样式决策时，不要给 owner 列举"padding 8 vs 7 vs 10"这种技术比较。直接画 3-4 个候选 SVG 让他挑，他会自己判断哪个对。
- **不熟技术细节**：owner 自述对"padding / center / edge"等技术名词无感，问就是"我不懂"。**只问"你想要什么视觉效果"**——实现细节直接做掉。
- **非视觉对齐 = bug**：owner 把"看着不对齐"当作 bug 处理（不是 enhancement），归类要标 bug。
- **v1 范围严格**：owner 偏好 v1 收敛；"以后可能要" / "未来会" 这种远期需求**独立排期**，不混进当前 ticket。
- **选错会主动撤回**：owner 会用截图+一句话 ("选错了，选这个样式") 来纠正前一轮选择。要把"撤回"当成普通信号处理，重新对齐而不是覆盖结论。
- **位置/样式会反复翻盘**：beta6 至少两次（Q3 B→A；pick 按钮最左→最右）。**永远把视觉候选做得足够具体（mockup 而不是文字描述）**，永远准备"选错了"的回路——"上一轮选 A / 这轮改 B"是常态不是异常。
- **配色问题先查上游 brand source，不要脑补**：这个项目的 brand source 是 mise.jdx.dev（warm parchment / warm charcoal + wine accent）。owner 说"配色不满意"时，先 WebFetch 上游站点的实际 CSS 拿 token 值，再按"角色对位"映射到本地 panel。我初次凭"warm"脑补了 2 个候选（A 暖色一致 / B 红酒底调），owner 直接贴官网截图 + 用"角色对位"推翻。**方法**：WebFetch 主页 → 用 curl grep 找实际加载的 CSS 文件名 → curl 拉那个文件 → grep `--vp-c-bg-*`（VitePress 变量）拿到精确 hex。

- **改 `--hull` / `--panel` 这类共享 token 前必须 grep 消费方**：`tokens.css:50` `--panel: var(--hull)` 被 11 个组件消费。直接改 `--hull` 会**误伤** popover / dialog / banner / panel 等 elevated 表面（light 端会从 #FFFFFF 变成暖米，"浮"→"沉"）。**每次设计 token 改动前，用 Grep 查 `var\(--hull\)` / `var\(--panel\)` 的完整消费者清单**，确认哪些该改、哪些该保。
- **owner 报的问题只是他能发觉的子集**：「我提出的问题只是我能发觉的，会有遗留的，要改就都统一改吧」。修一类问题时默认修整个类，不要只修被点名的实例；但"统一改" ≠ "统一成一个值"——不同角色（chrome vs elevated）仍要保持可辨间隙。定不下来时 owner 会说"选专业角度、不再问"，此时**直接按专业判断定稿并记录理由**，不要再抛选项。
- **主动扫查是义务，不是加分项**（owner 2026-09-04 明确）：owner 自述非专业产品/UI-UX 人员，"我能提出的问题有限，你应该主动发现这些我没发现的问题，主动提醒我或直接按专业意见做，而不是静默不作为"。每轮反馈收尾时做一轮专业扫查（同类 bug 全站 grep、一致性审计），发现即提或直接入 ticket；发现重要遗漏时**明确提醒**（如失败自动弹——assistant 提醒后 owner 立刻拍板做）。扫查结论要汇报（含"查过没问题"的项），让 owner 知道查了什么。

## CSS 布局陷阱（项目里踩过的）

- **`inline-block` 子元素在普通 `block` 父容器里 = 横排**，即使父容器外面套了 `flex column` 也不传递到孙元素。看到 N 项控件横排时**先怀疑 layout 不要怀疑设计**——很可能是某层 div 漏了 `display: flex; flex-direction: column;`。
  - 真实案例：`LanguageSwitcher.module.css:86` `.popover` 只有 `min-width`，`.option` 默认 inline-block → 两个 menuitem 横排成 `English | 中文`。
  - 修复：给中间层 div 加 `display: flex; flex-direction: column;` 与外层方向一致。

## 项目惯例

- 反馈批次开新 SPEC 父 issue + tickets（沿用 beta5 #61/#65 / #45 三层结构），label `v1` + `ready-for-agent`。
- 每条反馈在 `betaN-feedback-scratch.md` 写："用户原话 → 代码调查结论（带像素/token/行号）→ 拷问后对齐 → 定稿"。
- 拷问走 grill-with-docs；先量数据再问判断题；用户答"我不懂"时立刻给视觉对比图。
- Style / token 决策前必查 `docs/design/visual-language.md` + `docs/design/ui-ux-rules.md`（中英双语镜像）。
- i18n 同步硬约束：en + zh-CN 同提交，缺一视为 bug。

## 进行中的状态

- **beta6 批 10/10 全部实现关闭（2026-09-04）**：SPEC 父 **#74** + tickets **#75–#84**。
  commits `b603dd0` `37dea50` `a611141` `a49d453` `cd5a710` `6ed1faa` `dc3cdc6` `dbb9d26` `a76327c` `6968c14`，handoff 终态 `f7f8c38`。
  **剩余开放：#74 + #45/#61/#65，全等 owner 视觉验收（无一做过视觉验证）。**
  `wip/81-long-data` 分支已成历史（内容救回 `dc3cdc6`），按 AGENTS.md 不删分支。
  验收提醒：#83 会**故意**改变顶栏按钮外观（mono/4px→UI font/6px）；#84 的 rename 路径没加确认弹窗（已在 issue 报备）。
- **判断 frontier 以 `gh issue list --state open` 为准**——HANDOFF.md 和 `betaN-feedback-scratch.md`
  都会过期（曾出现 handoff 写"没活了"而实际有 10 个 ticket；scratch 定稿被 owner 事后翻盘）。
  **GitHub issue body > scratch 文件 > handoff**。
- beta5 #62–#64 / #66–#73 全部 merged。
- `1feb11d` 流式输出截断修复**未进 beta.6 产物**，等下次发版。

## 环境/流程陷阱

- **git push 基本必挂 502 / HTTP2 framing**，直接用：
  `git -c http.proxy=http://127.0.0.1:7890 push origin master`
- **subagent 被限额（429）打断时会留下未提交的半成品**：先把它们 commit 到 WIP 分支保住，
  保持 master 干净且绿，然后在 handoff + 日志里写明"未验证，别直接信"。
- **对同一文件并行发多个 Edit 会静默丢改动**（报成功但没写入）。同文件多次编辑必须逐个串行，
  改完用 CI/grep 核实。
- **i18next 插值默认 `{{ }}`**：写新 key 前查 `i18n/index.ts` 的 interpolation 配置，别照抄邻居
  （`tools.confirm.uninstall` 的单花括号 bug 就是这么来的，已在 #84 修掉）。
