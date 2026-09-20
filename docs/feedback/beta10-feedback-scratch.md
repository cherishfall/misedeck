# Beta10 Feedback Scratch

> 工作方式（2026-09-20 定稿）：用户报一个，调查一个；调查时同时排查同类/关联问题（含「查过、无问题」的对照记录）；结论写入本文档标「待用户定稿」，用户确认后标「定稿」。定稿前不动代码、不发 GitHub。收集齐后调用 `to-spec`（汇总发 spec issue）+ `to-tickets`（拆实现 ticket）。

## 收集中的 issue

### Issue 2【CI 基础设施】: master CI 在 Windows 上持续红——lint 脚本路径分隔符 bug（beta11 发版阻塞）

**来源**: 非用户报告——beta11 发版前核对 master 状态时发现（AGENTS.md：master 必须常绿）。最近 5 次 master CI 的 `frontend (windows-latest)` 全挂，其余 job 绿。

**调查结论**:

1. **根因**：`misedeck/scripts/check-command-hint.ts` 第 69-70 行——`relative(REPO_ROOT, file)` 在 Windows 返回反斜杠路径，与硬编码正斜杠字面量 `SHARED_CSS`（第 22 行）比较永不相等 → 共享组件自己的 `CommandHint.module.css` 被误报为「在共享组件外定义 `.commandHint`」。macOS/Linux 上 `relative()` 返回正斜杠，所以本机全绿、仅 Windows 挂。
2. **同类排查（scripts/ 全量 8 个 lint 脚本，均查过）**：硬编码正斜杠字面量与平台路径比较**仅此一处**；其余 `relative()` 调用仅用于报错信息显示（Windows 下显示反斜杠，无害）；各 `EXEMPT` 集合两侧都用 `join()` 生成，平台一致，无问题。
3. **修复**：比较改为 `resolve()` 绝对路径相等判定（`misedeck/scripts/check-command-hint.ts`），本机 lint 通过 + 用 `node:path/win32` 模拟 Windows 语义验证：旧逻辑复现失败、新逻辑通过。
4. **附带发现**：该 bug 意味着 #124 的 lint 防线合入后 Windows CI 从未绿过（2026-09-10 起 master 持续红），属于「复制/比较路径用字符串字面量」类 bug 的实例。

**状态**：已修、本地 npm run ci 验证中；修复将随 beta11 版本提交一起走。**待用户知悉**（发版阻塞项，非用户报告，不按定稿流程走）。

**用户原话**: 「执行面板里，明明是成功的，但是显示失败」（附截图：执行面板跑 `mise self-update --yes`，日志显示 `Updated mise to 2026.9.11`，头部却显示「失败 (13.8s, 退出码 0)」）

**代码调查结论**:

1. **根因：已修复，测试构建不含修复**。症状与 #129（`d651a3c`，2026-09-10 19:38 合入 master）修复的 wire-shape bug 完全吻合，而 `v1.0.0-beta.10` tag 切于 2026-09-09 23:40——**比修复早一天**。beta10 构建里 `InstallCommandResult::Ok` 用 `#[serde(flatten)]` 内联了 outcome，成功结果跨线后没有 `outcome` key，前端校验器（beta.10 的 `useExecution.ts` `isRunCommandResult`）判 false → 在流式 `Exit` 事件（已设 `exitCode:0`、时长）之后 dispatch `fail` → reducer 保留 `exitCode: 0` 但翻 `status` 为 `"failed"` → 渲染「失败 (13.8s, 退出码 0)」。已用 `git merge-base --is-ancestor` 验证：beta.10 tag 不含 `d651a3c`。
2. **机制细节（master 现状）**：`useExecution.ts` 状态机只有两条设失败的路径——`exit` 事件按 `exitCode === 0` 判定（正确），`fail` 动作无条件置失败且不覆盖 exitCode/duration（唯一能造成「失败 + 退出码 0」的路径，即本次症状）。`fail` 仅由三种情况触发：invoke 抛错、IPC 结果未过校验、Rust 返回 `{kind:"err"}`。本次是第二种（wire-shape 漂移）。
3. **同类排查（全站成败判定口径，均查过、无问题）**：状态逻辑为共享而非复制——reducer `exit` 按退出码；`toJsonResult` 按 `timedOut`/退出码/JSON 解析；Rust 侧 `run_mise_json`/`run_self_update`/`run_trust` 同口径；`trustContext.tsx`、`TasksPage.tsx` 同口径。无任何代码按 stderr 内容判失败；`mise self-update` 在 runner 里无特殊分支，进度行只影响样式不影响状态。诊断页按行 `[OK]/[WARN]/[ERROR]` 分类属另一语义（健康染色），非运行状态，非问题。
4. **防线现状**：#129 之后已有 wire-shape 钉桩测试（`src-tauri/tests/wire_shapes.rs`）+ `docs/agents/architecture.md` 的「Wire-shape drift guard」规则。ADR-0005 契约明确状态必须由退出码派生，不得由 wire shape/stderr 派生——#129 正是修这个契约违规。
5. **伴生发现**：引导安装 `install_mise` 在 beta.10 有**同一个** wire-shape bug，#129 一并修了。另有一处无害残留：master 上 self-update 后探测到的 `newVersion` 只进 `complete` action，不在面板头部渲染（dead-ish state，非 bug）。

**待用户定稿**（见下，推荐 A）：

- A（推荐）：本条记为「**已被 #129 修复，beta10 构建不含该修复**」——不发修复 ticket，但需要**切一个含 `d651a3c` 的新构建**（beta.11）再验证；在收集文档中留档，防止后续重复上报。
- B：不放心，等 beta.11 构建出来你亲测 self-update 与引导安装两条路径都正常后，再标定稿。
- C：如果你手里的构建确实包含 09-10 之后的 master 仍复现，则重新开查 `useExecution.ts` 的 `fail` 三条路径。

➡️ 推荐 **A + B 合并**：按 A 记录，构建出来后你顺手验证一次即闭环。

**定稿（2026-09-20，用户确认 A）**：本条已被 #129 修复，beta10 构建不含该修复；用户确认忘了发版，先发 beta11 再复测。不发修复 ticket，留档防重复上报。self-update 与引导安装两条路径待 beta11 亲测闭环。

## 已关闭 issue

（暂无）
