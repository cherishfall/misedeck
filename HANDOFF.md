# MiseDeck handoff

This document is a continuation marker between autonomous driver sessions.

## CURRENT STATE (2026-10-26 — **post-1.0.1 audit batch: #282, #284–#288 closed; #283 still open; #239 closed; #281 is the only owner-gated issue left**)

v1.0.1 is live (tag `v1.0.1`; the release-notes resolver fix that followed the tag is `c546f75`). **#239** (the beta17 cross-platform spec) was closed on 2026-10-23, and the items its hardware could not answer were split into **#281**. #281 is open, **deliberately unlabeled**, and owner-gated: it needs a Linux desktop, a macOS visual re-check, and one clean-machine NSIS install. It is not agent-workable, `ready-for-agent` would be a lie (no agent can produce that evidence), and the repo has no owner-gated label — creating one for a single issue would be a taxonomy with one member, so it stays unlabeled by decision, recorded on the issue itself.

The 2026-10-26 full audit (`docs/feedback/full-audit-2026-10-26.md`, committed `d3a5c1a`) filed seven tickets (#282–#288). Six were code/CI work — five of them landed, #283 is still open — and the seventh (#288) is documentation governance:

| Issue | Commit(s) | Scope |
| --- | --- | --- |
| #282 | `9248681` | `ls-remote --json` is no longer truncated by the 8 KiB line cap; the streaming loop is shared with the runner instead of duplicated. |
| #283 | — | **Still open** (blocked only by #282, now closed, so startable): read commands inherit the 30-minute streaming ceiling, the launch probe blocks the main thread, `locate_mise` does not check the executable bit. |
| #284 | `4b83751` | Windows process-tree kill no longer waits for `taskkill` while holding the registry lock; a behaviour test pins it. |
| #285 | `fe979c3` | Every config-dependent view is invalidated after a write command. |
| #286 | `38413e3` | The panel run settles from the invoke outcome; the latest tool row is not duplicated; a locale change no longer re-probes the shell. |
| #287 | `06f05cc` + `a538ab6` | CI gaps: `cargo fmt` gate, macOS Rust code compiled before release, one frontend check set. |
| #288 | `4d1bc17` | Docs governance: AGENTS.md links to ADR-0005 instead of restating it, and ADR-0005's exemption list is complete (`doctor`, `registry`, `trust --show`, plus the `mise version` gate probe); the "use" vocabulary is unified on mise's **active / 已激活**; HANDOFF refreshed; `.DS_Store` ignored repo-wide; the `uninstall --all` pointer names `CONTEXT.md`, which is where that ban actually lives. |

**Vocabulary decision (#288), do not re-litigate:** the action is **Use / 使用**; the state it produces is **Active / 已激活** — mise's own terms (`mise ls --help`: "List installed and active tool versions"; `mise ls --json` carries `"active": true`). `enable` / `activate` / "in use" are retired as alternate *state* words; CONTEXT.md → Use is the one home. Shell activation (`mise activate`, Doctor's 已激活/未激活) is a different concept and keeps its wording.

**One premise in the ticket did not match the repo:** `docs/.DS_Store` and `docs/screenshots/.DS_Store` were on disk but **never tracked** (`git log --all --diff-filter=A -- '*.DS_Store'` is empty; they were hidden by the machine's global gitignore). They are deleted, and the repo now ignores `.DS_Store` at any depth so the state does not depend on a machine's global config. No other junk of that class is tracked (`.vscode/extensions.json` is a deliberate recommendation file).

**Gates:** `npm run ci` green after the copy edits (typecheck, eslint, node tests, every lint guard including i18n parity and the dead-key guard, production build). These are copy and pointer edits only — no behaviour changed, and per the beta9 rule the changed strings are **not visually verified**.

**Next move:** the frontier is #283, #289, #290 and #291 — all `ready-for-agent` and unblocked (#282 and #286 are closed). #281 stays owner-gated and unlabeled. Do not reintroduce a second state word: CONTEXT.md → Use is the one home.

## PREVIOUS STATE (2026-10-24 — **1.0.1 cut; the Windows installer has now been installed on real hardware**)

The gap between 1.0.0 and 1.0.1 was mostly the post-GA audit batch plus what a **real install** on the owner's Windows 11 box turned up. 1.0.1 is that batch, version-bumped in all six places and tagged with release notes (annotated tag, so the body is the annotation, not `release-template.md`).

**Three fixes came out of actually installing 1.0.0**, which is the part no amount of CI could have produced:

- **The release build could package a test fixture.** `npm run tauri build` compiles with `cargo build --bins` and then packages "the" app binary; with three bins in the package (app + two test harnesses) it picked a harness, producing a 262 KB installer that printed `no fixture for slug` and exited 0. `mainBinaryName` and `-- --bin misedeck` both failed to steer it; removing the harnesses from `src/bin` fixed it, which pinned the cause. The harnesses now sit behind a `fixtures` feature, so a release build contains exactly one binary. The released v1.0.0 installer was unaffected (2.7 MB), but nothing stopped CI from hitting it.
- **The activation prompt named a PowerShell the machine does not have.** The primary rc path was hard-coded to pwsh 7's `Documents/PowerShell/…`; this box has only Windows PowerShell 5.1, which reads `Documents/WindowsPowerShell/…` and never touches that file. The primary now follows `where pwsh.exe`, both profiles stay in the candidate list, and the resolution is injectable so the ordering is asserted on any host.
- **The Home page's self-update dialog printed `mise -C $HOME self-update --yes`.** That was a scope carve-out from the terminal-perspective echo rule, not a rule; it now renders `mise self-update --yes` with the shared "Working directory: ~ (home)" line, in the dialog and in the panel.

Also in this cut: the Home page's RAW disclosure no longer repeats its own label (the revealed block is a `role="region"` named by the trigger), and the pre-existing batch of audit fixes — Tasks inline-edit scoping, Env parent-config scope, honest requested-but-missing versions, wrong-shaped payload rejection, table layout at 900×600 / 1200×720, Settings "Show all" in Directory mode, parent-vs-global config distinction, plugin ref/commit, `MISE_SAFE` on panel reads, capped streaming output, `EINTR` retry in the line reader, and `#[serial]` on the tests that can see `terminate_all`.

**The NSIS installer has been installed on the real box** (per-user, `%LOCALAPPDATA%`, no admin, uninstalls from Settings → Apps) — superseding the "still never installed on real hardware" line in the section below. Windows still has one machine behind it, not a matrix.

**1.0.1 shipped** — tag `v1.0.1`, release run `40079635363` (all three build legs plus the release job green; six assets, `isPrerelease: false`). One thing went wrong and is worth remembering: the published body came out as the **generic template**, not the tag's annotation. The tag-triggered checkout holds the tag's commit but not necessarily the tag object, so `git cat-file -t` found nothing, the resolver fell through, and the fallback template shipped. The body was rewritten with `gh release edit`, and the resolver now runs `git fetch --tags --force origin` before deciding. `scripts/test-release-notes.sh` gained a third case — an annotated tag whose object must be recovered from `origin` — and removing the fetch makes that case fail with the template body, so the guard is load-bearing rather than decorative.

**Next move:** #281 is the only open ticket and holds what needs other hardware — a Linux desktop (`kgx` probe, glibc/WebKitGTK baseline, portal picker, GTK theme bleed, `set_theme`) and a macOS pass (self-hosted font glyph/width, `scrollbar-gutter`, re-shoot `docs/screenshots/`). `docs/screenshots/` was **not** re-captured for 1.0.1: the changed surfaces (RAW expanded, the update dialog) are not in the README shots, and re-capturing needs the macOS box.

## PREVIOUS STATE (2026-10-23 — **#239 closed; the READMEs' Windows wording now matches the evidence**)

A third pass on the same Windows 11 x64 box closed out the two things the earlier passes left dangling: the commands that had only unit-test coverage, and two test defects that the audit had flagged.

**Commands.** Four more were exercised over real IPC through CDP (`window.__TAURI_INTERNALS__.invoke`), bringing the real-hardware count to **19 of 22**: `set_window_theme` (`dark`/`light` return `null`; `purple` is refused), `check_app_update` (structured retryable `Err` — the box cannot reach GitHub from the app process), `open_external` (`javascript:` and `file://` both refused, no window opened, so #248's scheme allow-list holds on hardware), `cancel_run` (unknown id returns `null` silently). The remaining three — `install_mise`, `mise_self_update`, `mise_trust` — would reinstall or re-trust the owner's own mise, so they stay untriggered by choice.

**Test defects fixed** (`4fb829f`): `tests/terminal.rs` rewrote `$PATH` under a comment claiming "serial_test below serializes env-var writes" while the file contained no `serial_test` at all; `tests/install.rs` set `FIXTURE_MISE_ENV_LOG` the same way. `set_var` in a multi-threaded test binary is UB, so every test that spawns is now `#[serial_test::serial]`, and the comment states the real reason. Dead-code suppression narrowed (`which_exists`), the fake `_pathbuf_anchor()` that only existed to silence an unused import deleted. The rule is now written down in `docs/agents/conventions.md` (+ zh-CN).

**CI defects fixed** (`81effd4`, `da9205b`): the failure-summary step I added was invalid YAML — a `: ` inside an unquoted scalar — and GitHub's symptom is misleading: the push still creates a run, but it is named after the file, finishes in 0 seconds and fails with **no job ever starting**, which reads exactly like a test failure. Rewritten as a block scalar that also emits an `::error` annotation, so a future flake names its own test in a place that is readable without admin rights. The ubuntu leg does have an intermittent `cargo test` failure (same source: fail, fail, pass) that is still unreproduced; this machine has no Linux environment and WSL is blocked by policy.

**#239 closed.** Its acceptance table is answered item by item in `docs/feedback/beta17-audit-cross-platform.md` § 真机验收, with the evidence level stated for each row rather than one blanket "verified": Windows product-level verification passed (8 pages, 19/22 commands, write round-trip, process-tree kill), `#244` verified on hardware, `#240`/`#242` structurally unobservable from a console-launched dev build (a parent console means no child window either way), `#243` needs a real install run, `#245`/`#247` need a Linux desktop. Those residuals moved to their own issue rather than keeping the parent open indefinitely.

**READMEs rewritten** (both languages): Windows is no longer described as never having run on real hardware — the wording now says the app was exercised end-to-end on one Windows 11 machine while the installer remains untested; the Rust CI paragraph says Windows runs the same `cargo test --all-targets` as Linux instead of a `--lib` smoke; and a new known limitation documents that the `curl`-based update check ignores the Windows system proxy (set `https_proxy`), which is how this box failed its check.

**The ubuntu flake: cause identified, reproduction not achieved.** The failing test is `install::tests::run_install_caps_a_huge_line_and_notifies`, and the message is `install script exited with status -1` with empty stderr — `ExitStatus::code()` returned `None`, i.e. the child died of a **signal**. Two in-process paths can do that, and both are now closed: `process_tree::terminate_all` (a test that SIGKILLs every child in the binary-wide registry, added for app-exit cleanup) and a reader that treats an interrupted `fill_buf` as EOF (which drops the read end of the pipe and SIGPIPEs the child). Five `ChildGuard`-spawning unit tests are now `#[serial]`, and `read_line_capped` retries `ErrorKind::Interrupted`. **Caveat, stated because it matters:** a throwaway branch (`debug/flake-loop`, since deleted) looped the lib suite 30× and then 120× at 16 threads on both the pre-fix and post-fix commits, and never reproduced the failure — 300 iterations, zero failures. So the diagnosis rests on the log plus an enumeration of the binary's kill paths, not on a reproduction, and the timing window is narrow. The guards are still correct (`terminate_all` really is process-global), but nobody should claim the flake is "fixed, proven".

**#281's Windows items are done** (`docs/feedback/windows-hardware-verification.md` § 11):

- **#240 was misjudged last round, twice over.** `CREATE_NO_WINDOW` does not mean "no console" — it means "a console with no window", so `conhost.exe` with mise as parent is the fix working, not a defect. And the symptom was observable all along: a GUI-subsystem app never attaches a console, so its console children either get a window or get the hidden one. Measured properly (visible-only `conhost`/`OpenConsole` + Windows Terminal title changes) `mise ls-remote node` produced no visible console in 3.86 s, and the positive control (`ping` + `CREATE_NEW_CONSOLE`) was caught immediately — so the null result means something.
- **#242 verified end to end**: `open_in_terminal` opened a real console whose prompt is the directory it was handed (screenshot in `round3-terminal-at-directory.png`). On this box the default terminal is Windows Terminal, so the new console is a **tab in the existing WT process** — "look for a new process" is the wrong detector, "the window title changed" is the right one.
- **#243 verified with a control**: the production argv prefix run under `CREATE_NO_WINDOW` against a host that cannot resolve. With the pin the bytes are UTF-8 (`e5 9f ba` for 基) and the message reads `基础连接已经关闭`; with the pin removed the same line arrives as cp936 (`bb f9 b4 a1`) and decoding it as UTF-8 yields 36 replacement characters — the reported mojibake, reproduced and fixed. Nothing was installed: the failure happens before the download, so the owner's mise was untouched.

**Next move:**
1. Nothing agent-pickable is open. #281 now only holds what needs other hardware: a Linux desktop (#245's `kgx` probe, #247's glibc/WebKitGTK baseline, the portal directory picker, GTK theme bleed, `set_theme` semantics) and a macOS pass (self-hosted font glyph/width, `scrollbar-gutter` unchanged, re-shoot `docs/screenshots/`). The NSIS installer has still never been installed on real hardware.
2. If Windows visual work resumes, the reusable pieces stay: `.workbuddy/tmp/msvcenv.sh` (self-built MSVC env — cargo must be preceded by `. .workbuddy/tmp/msvcenv.sh`, otherwise linking asks for a `msvcrt.lib` this box does not have), `cdp.py` (hand-rolled WebSocket CDP client), the SwiftShader flag set in the verification report § 0.2, and `.workbuddy/tmp/verify_240_visible.py` / `verify_243_cp936.py` for console-visibility and encoding checks.
3. Do not undo the two cross-cutting contracts when adding commands: panel reads must pass `readOnly`, and streaming paths must keep the capped reader + typed truncation event.

---

## PREVIOUS STATE (2026-10-22, night — **Windows verified on real hardware: 8/8 pages, 14/14 commands, write loop closed; `cargo test --all-targets` 266 passed / 0 failed**)

The owner asked for a functional verification of the shipping Windows build on an actual Windows machine — the first time the Windows target has ever run outside CI. Answer: **yes, the app works**, with two real defects found and fixed along the way. Full evidence (screenshots, per-command results, root causes) is in `docs/feedback/windows-hardware-verification.md`.

This was an owner-explicit exception to the standing "no agent-side visual verification" rule (AGENTS.md #30, beta9) — the owner asked for it directly. Nothing about the rule changed.

**Verified working on hardware:** all 8 pages navigate with real mise data and zero error nodes; 14 of 14 backend commands return correct data through IPC (`detect_mise` resolves version/path/arch — **#208**; `shell_activation_check` answers `kind: "powerShell"` with the rc path under the real profile folder — **#277**); the write loop closes end to end (UI form → `mise set -g` → `config.toml` on disk → refresh shows value and its source → execution panel shows the exact argv, timing, cwd and DEBUG echo → removal leaves no trace). Safety holds: a non-directory cwd is refused (**#210**), a shell-metacharacter argument is passed through as a literal and merely fails to resolve (**#18** — no injection), `-C <cwd>` reads that directory's own `mise.toml` (**#179**).

**Three structural obstacles had to be cleared first** — none of them MiseDeck defects, all of them reasons this had never been done: no Rust/MSVC toolchain on the machine (built one from VS channel packages, no admin); WebView2's renderer crashed on every launch because the box has an OrayIddDriver virtual display driver whose D3D11 init kills the GPU process (4 Crashpad dumps all name `d3d11/dcomp/dxgi`; `--disable-gpu --use-angle=swiftshader` stabilises it); and no automation channel (`WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS` is ignored at runtime because wry always sets `AdditionalBrowserArguments`, so it took a source build with `additionalBrowserArgs` to open CDP).

**Defect 1 — bash fixtures cannot run on Windows (#222, #223).** `tests/fixtures/{hold-stdout,tree-kill}-fixture` were bash scripts; `CreateProcess` refuses them (os error 193), so `process_tree` was `#[cfg(unix)]` and Windows could not run either case at all. Replaced with `src/bin/fixture-process-tree.rs`, one cross-platform binary playing three roles (`grandchild` / `hold-stdout` / `tree-kill`), the grandchild being the binary re-executed so the fixture needs no shell, no `sleep`, no `sh`. `alive()` gained a Windows branch using `tasklist /FI "PID eq N" /NH /FO "CSV"`. **The #223 Windows half is now verified on real hardware**: `cancel_kills_the_grandchild_too` and `timeout_kills_the_grandchild_too` pass against the real `taskkill /F /T` path, and #222's `exited_child_whose_grandchild_holds_stdout_still_returns` passes too.

**Defect 2 — the home-resolution seam silently no-ops on Windows (#229).** Eight `tests/shell.rs` tests failed by faking `set_var("HOME", tmp)`, which `dirs` ignores on Windows: `dirs-6.0.0` documents "Windows: retrieves the user profile folder using `SHGetKnownFolderPath`", and `dirs-sys-0.5.0`'s `target_windows` module has only `known_folder*` functions. So the tests read the real profile directory. **This is not a product bug — #229 requires precisely that Windows never read `$HOME`.** Fixed the way the codebase already does platform seams (`detect_user_shell_from` / `detect_windows_shell` / `linux_terminal_plan`): added `rc_path_for_in` / `rc_sibling_paths_in` / `check_shell_activation_for_in`, which take the home as a parameter, with the production entry points reduced to thin wrappers over `dirs::home_dir()`. The tests now inject explicitly, `HomeGuard` and the `$HOME` writes are gone (which also removes the lock-poisoning cascade), and a new test `rc_path_for_anchors_at_the_platform_home` pins production to `dirs::home_dir()` so nobody reverts to reading `$HOME`.

**CI and gates.** The Windows job in `ci.yml` went from `cargo test --lib` to `cargo test --all-targets --no-fail-fast` — the integration suite is now runnable there because the fixtures are cross-platform binaries. Gates re-run in this session on the Windows box: `npm run ci` exit 0 (247 node tests, all 18 steps); `cargo test --all-targets` exit 0 (**20 targets, 266 passed, 0 failed** — was 9 failures before these fixes); `cargo clippy --all-targets -- -D warnings` exit 0. Two new conventions written into `docs/agents/conventions.md` (+ zh-CN mirror): *a home-relative path is computed from an injected home, not from a faked env var* and *a test fixture must be executable on the host it runs on*. `docs/agents/ci.md` (+ mirror) now says a green Windows job is still **not** a substitute for real hardware — this run is the proof, since it found two things CI structurally could not.

**Not covered, still owner-side:** the native directory picker (CDP cannot drive a Win32 dialog — the `directory_exists` command and `-C <cwd>` context are verified, the click-through is not); Windows packaging (NSIS/WiX, a release-time decision); `mise` install/self-update against the real machine (would mutate the user's environment); the WebView2 GPU crash is this box's virtual display driver, not MiseDeck.

`src-tauri/tauri.conf.json` was temporarily given `additionalBrowserArgs` for CDP and is **fully restored** (byte-identical to the backup after JSON normalisation). The `MISEDECK_VERIFY_2026` probe variable was removed from the user's config.

**Next move:**
1. #239 (cross-platform spec) is still the only open, owner-gated issue. Nothing is left that an agent may pick up on its own.
2. The Windows target is no longer "unverified" in any sense the repo tracks — if the READMEs still hedge Windows as merely experimental, that language is now understating the evidence, but rewording marketing copy is an owner call.
3. Do not undo the two cross-cutting contracts when adding commands: panel reads must pass `readOnly`, and streaming paths must keep the capped reader + typed truncation event.
4. If Windows visual work resumes, the reusable pieces are `.workbuddy/tmp/msvcenv.sh` (self-built MSVC env), `cdp.py` (hand-rolled WebSocket CDP client), and the GPU flags above.

**Windows-only dead code had to be gated** — `clippy -D warnings` treats an unused import on any target as an error, so two Unix-only test helpers became hard errors on Windows: `src/install.rs` gated `use std::sync::{Arc, Mutex}` (used only by the Unix-only streaming-loop tests) and `tests/terminal.rs` gated `PathGuard` + `tempdir` (used only by the Linux-only `TERMINAL_NOT_FOUND` probe). Both are cfg gates only — no behaviour changed.

**Full change list** (no git on this machine, so this was reconciled file by file): product code — `src/shell.rs` (three `_in` seams, production entry points reduced to thin wrappers), `src/install.rs` (one cfg gate), `src/bin/fixture-process-tree.rs` (new), `src/bin/fixture-mise.rs` (new); tests — `tests/shell.rs`, `tests/runner.rs`, `tests/terminal.rs`, `tests/common/mod.rs` (new), nine `tests/*.rs` switched to `common::fixture_script()`, and the two bash fixtures deleted; CI — `.github/workflows/ci.yml`; docs — `docs/agents/ci.md`, `docs/agents/conventions.md` (+ zh-CN mirrors), `HANDOFF.md`, and `docs/feedback/windows-hardware-verification.md` (new). `src-tauri/tauri.conf.json` was touched only for the CDP run and is fully restored.

---

## PREVIOUS STATE (2026-10-22, late — **post-GA audit batch closed: #266–#280 done; only #239 open, owner-gated**)

Owner asked for a second full review after GA. The findings and evidence live in `docs/feedback/1.0.0-final-audit.md`; 15 tickets (#266–#280) were filed and every one is closed. 19 commits from the GA state `3ce8d39` to `362bb9f`, pushed to `origin/master`; CI run **39721149845** is **green on all four jobs** (frontend + rust on Ubuntu, frontend + windows). One operational note: GitHub's HTTP/2 path failed twice in this network (`Failed to connect to github.com:443`, then an HTTP/2 framing error); `git -c http.version=HTTP/1.1 push origin master` worked. `gh api` worked throughout.

The first CI run with the new clippy gate exposed two Linux-only dead-symbol errors that macOS could not see (`tauri::Manager` and `run_argv` are macOS-only); both are now `cfg(target_os = "macos")` in `362bb9f`. The Windows job also passed, so the windows-native teardown test from #278 and the #277 shell-order logic compile and run there.

| Issue | Commit(s) | Scope |
| --- | --- | --- |
| #266 | `cf4282d` | Release workflow renders the curated template for lightweight tags instead of the commit message. |
| #267 | `544d3b3` | Tasks inline edit gated to lossless, in-scope tasks. |
| #268 | `e364e42` | Env: parent configs scoped out of directory writes; trust parsing hardened. |
| #269 | `9954443` | Tools: requested-but-missing versions presented honestly. |
| #270 | `c80adac` | Read payloads reject wrong-shaped data at the boundary. |
| #271 | `56f3413` | Tasks/Settings table columns stay usable at the reference width. |
| #272 | `0cdda21` | Escape reaches confirm dialogs nested inside KeyForm. |
| #273 | `0f96247` | Settings "Show all" lists defaults in Directory mode. |
| #274 | `b9656d6` | Preview distinguishes parent configs from global. |
| #275 | `525dcc2` | Plugins show the installed ref and commit. |
| #276 | `8cc7b08` | Panel-dispatched reads (`ls`, `settings ls`, `ls-remote`) carry an explicit `readOnly` flag → `MISE_SAFE=1`; mutations/run/install keep the unsafe stream. Rust + TS tests pin the split. |
| #277 | `29dbaa9` | Streaming output caps (8 KiB line, 2 MiB/stream, bounded channel, drain-before-join) with a typed `outputTruncated` event rendered via i18n; installer shares the reader. Windows shell detection now prefers `$SHELL`, probes `pwsh` via System32 `where.exe`, never spawns bare names. |
| #278 | `c07490e` + `362bb9f` | Release permissions are read-only except the publishing job; all 7 actions SHA-pinned; 14 clippy lints cleared and a `clippy -D warnings` gate added; Windows-native teardown test; exact `-C <cwd>` assertion. Follow-up `362bb9f` gates the two macOS-only symbols the Linux clippy gate exposed. |
| #279 | `8c2a2f6` | Docs aligned with shipped truth: unsigned Linux packages, ADR-0009 status note, one validated URL-opening surface, macOS 15 Gatekeeper path, README scaffold removed, inventories corrected (en + zh). |
| #280 | `a634766` + `cea64a5` | Registry combobox scrolls the active option (Arrow/Home/End); Settings shows a filtered count (pure helper + 4 tests); Jump is disabled unless the draft is an integer in range (pure helper + 4 tests); capped `<pre>` viewers gain tab stop, region label and focus ring. |

Audit working doc committed as `0f8c218`.

**Gates at `362bb9f`** (run in the driver session): `npm run ci` exit 0 — 247 node tests, all 18 steps incl. i18n/CSS/argv/invoke guards and the production build; `cargo test --all-targets` exit 0 — 18 suites, 276 passed; `cargo clippy --all-targets -- -D warnings` exit 0; `scripts/test-release-notes.sh` ok. GitHub CI on `362bb9f` is green on all four jobs.

**Visual verification is partial — do not overclaim:** the dev build at 1200×720 confirmed the registry combobox (15 ArrowDowns, Home/End kept the highlight inside the 280px list). The Settings filtered count, Jump disabled state and `<pre>` focus ring were **not** visually re-confirmed: the macOS session locked mid-check, and an earlier pass may have hit the stale installed 1.0.0 window. Settings count and Jump now have unit coverage; the focus ring is static-reviewed only.

**Next move:**
1. #239 (cross-platform spec) stays open and owner-gated — there are no `ready-for-agent` issues left.
2. If the owner wants the remaining visual pass: unlock the screen, run `cd misedeck && npm run tauri dev`, and check at 1200×720: Settings filtered count ("N of M"), Tools pager Jump disabled/enabled, config/lockfile Tab focus ring. Reopen #280 only if a defect shows.
3. #278's gate is proven: CI run 39721149845 is green on Linux + macOS-less Ubuntu + Windows, including the clippy gate, SHA-pinned actions, and the windows-only teardown test. Keep it green — a local macOS clippy pass cannot see Linux dead code.
4. Don't undo the two cross-cutting contracts when adding commands: panel reads must pass `readOnly`, and streaming paths must keep the capped reader + typed truncation event.

---

## GA STATE (2026-10-22, early — **v1.0.0 GA CUT**: every 1.0.0 ticket closed, tag pushed, release building)

Owner pulled the whole pre-release audit into 1.0.0 (P0 + P1 + P2, plus #238 and #249). 21 commits from the audit baseline `37d27fb` to the release commit `99e0aad`; every ticket below is closed. The only open issue is **#239**, the cross-platform spec, which the owner deliberately leaves open — the READMEs keep "macOS polished / Linux unverified / Windows experimental" in step with it.

Release: lightweight tag **`v1.0.0`** on `99e0aad` (pushed 2026-10-21T17:04Z; non-prerelease because the tag has no `-beta`). **Correction:** the published body is the release commit's message, not the template — `release.yml` treated a lightweight tag's `%(contents)` (the commit message) as an annotation. Fixed in #266; editing the published body is an owner action. Workflow run **39640446328** is **green** — all three platform legs and the release job. The published Release has the six expected assets (`dmg`, `deb`, `AppImage`, `rpm`, `nsis`, and a 469-byte `SHA256SUMS`); the manifest lists all five packages by bare basename, and the macOS asset was downloaded and spot-checked: `shasum -a 256 -c` returns `MiseDeck_1.0.0_aarch64.dmg: OK` (`615ec479…535954`).

| Issue | Commit | Scope |
| --- | --- | --- |
| #263 | `3658ff1` | Release surface (P0): dropped the nonexistent tap, aligned artifact docs. |
| #253 | `df6081c` | Rust platform correctness: no terminal-launched environment assumed. |
| #259 | `7eeed67` + `b04720f` | Upgrades stay inside the configured range, structured doctor, four-column plugins; `config ls` shows override files. |
| #265 | `befa619` | Default window fits (tables ≤ content column), floating menus flip near the viewport edge, failed states share the page baseline. |
| #252 | `f3bc043` | The five-dimension pre-release audit with visual/simulation evidence (working doc in `docs/feedback/`). |
| #264 | `072820e` + `fd7b213` | Docs consistency: current inventories, reachable mirrors, semantic citations, zh section headings. |
| #256 | `7cfba55` | Truthful copy and terminology sweep (en + zh). |
| #257 | `02a817b` | Focus order, startup safety, tab semantics. |
| #258 | `3caa91b` | Frontend dead weight removed, hooks lint, font licenses. |
| #260 | `d83e9ce` | Task arguments and navigation order. |
| #261 | `429a1df` + `ad55e40` | README becomes the 1.0.0 front door. |
| #262 | `fe16d90` | Every failure has a visible, recoverable surface (stderr body, timeout affordance, copy that matches what renders). |
| #254 | `ad09af7` | Rust contract and runner gaps. |
| #255 | `db805d7` | Five coverage gaps closed, tools argv pinned. |
| #238 | `3b8a945` + `e548f9f` | Silent launch update check (≤ 1/24h, dot marker, manual check) and the doctor report header carries the MiseDeck build; a seeded panel stays honest after a silent check. |
| #249 | `95efe48` | Global failure notices: every Tauri invoke goes through `src/api/invoke.ts`; rejections enqueue a dismissible danger banner (dedupe, cap 3, 6s, pause on hover/focus). A lint guard (`lint:invoke-wrapper`) blocks direct `@tauri-apps/api/core` imports. |
| #252 | `99e0aad` | **GA release commit**: version `1.0.0` in all six sites, both READMEs aligned to what ships (mise floor 2025.12.5, 18 CI steps, doctor report, failure notices), all 16 screenshots re-captured at 1.0.0, post-fix matrix recorded in the audit doc. |

**Gates at `99e0aad`** (run independently in the main session): `npm run ci` exit 0 — 18 steps, 14 lint guards including the invoke wrapper, 197 node tests, production build; `cargo test --all-targets` exit 0 — 18 suites, 258 passed.

**Post-fix verification** (details in `docs/feedback/1.0.0-pre-release-audit.md` → "Post-fix re-verification (GA)"):
- README captures: 8 pages × en/zh at 1.0.0, 16/16 pass, sidebar footer reads 1.0.0.
- Failure simulation with stub homes at 1200×720: missing / too-old 2025.1.0 / unparsable version × en/zh × light/dark, 12/12 pass.
- Tools failed load: 2/2 pass — the narrow centred column (V-6) and the promised-but-absent stderr copy (V-7) are gone.
- Layout: Tools/Env/Overview × en/zh × light/dark at 1200×720, 12/12 pass, no horizontal overflow (V-1/#265).

**Not verified — do not claim otherwise:** click-driven flows (dialogs, directory picker, cancel, retry buttons, mutation success) need Accessibility permission and remain the owner's terminal acceptance; the timeout state was not re-captured; malformed payloads on pages other than Tools were not simulated individually; below-the-fold and hover/focus/keyboard states were not inspected; no real Windows/Linux/Intel hardware or non-@2x display; packaging, signing, notarization, SHA256SUMS generation and template rendering were out of scope before the tag.

**Next move:**
1. Owner's terminal acceptance of the click paths listed above on the 1.0.0 build. Everything else in the GA gate is verified and closed; if the owner finds a bug, it is a 1.0.1 fix, not an unfinished 1.0.0 ticket.
2. #239 stays open until real Windows/Linux hardware exists; it is the only open issue and it is owner-gated (no `ready-for-agent`).
3. The failure-notice rule lives in `docs/design/ui-ux-rules.md`; the wrapper guard is in `npm run ci` — don't bypass either when adding commands.
4. Release procedure for the next cut is unchanged: bump the six version sites, refresh the READMEs and screenshots, tag `vMAJOR.MINOR.PATCH`, push the tag, then spot-check `SHA256SUMS` as done here.

---

## BETA17 STATE (2026-10-21, evening — **v1.0.0-beta.17 SHIPPED**, six assets + working SHA256SUMS)

Owner asked for three things in beta17: show MiseDeck's own version, check for updates, and (his own doubt) auto-update. Grilled to three decisions: scope ② (show + manual check + hand off to the browser), placement A (sidebar footer colophon), vocabulary ① (verb always carries its subject). Spec **#234** closed once #235/#236 had shipped; tickets **#235 / #236 / #237** all closed.

| Issue | Commit | Scope |
| --- | --- | --- |
| #235 | `d00cc6c` | Sidebar footer gains a colophon line: the app version from `getVersion()`, `--size-label` mono in `--ice`, no "Version" caption (that word is mise's). Collapsed 56px rail degrades to a tag-glyph button with the version in its tooltip — never hidden. `FloatingMenu` grew a `role` prop (`menu` default, `dialog` for panels holding status copy), so no second popover primitive. |
| #236 | `6e48944` | `check_app_update` command: `curl` against `github.com/…/releases.atom` (8s), hand-rolled Atom extraction, `semver` comparison, returns `available`/`current`/`err`. Panel renders four states; the download action is a link to that tag's Release page — the app never downloads. 10 parser tests + 4 wire-shape tests + 6 copy-mapping tests. |
| #237 | `7f60254` | ADR-0009 (en+zh) records why in-place updating is off the table; CONTEXT.md gains App version / Update check; ui-ux-rules gains the placement + vocabulary rules (en+zh); architecture.md names the one `status`-tagged boundary enum exception. |

**Decisions worth not re-litigating:** auto-update is deferred behind Apple Developer ID + notarization — unsigned macOS builds get re-quarantined after a bundle swap, so auto-update would not save the `xattr` step. Every MiseDeck tag is a prerelease, so the documented `latest.json` route cannot see this repo's releases at all. Check is manual: nothing fires at launch, deliberately (a launch-time check needs throttle + persisted state; separate ticket if wanted).

**Release:** tag **`v1.0.0-beta.17`** on `3a6ead3`, prerelease, six assets — `MiseDeck_1.0.0-beta.17_aarch64.dmg`, `…_amd64.deb`, `…_amd64.AppImage`, `…-1.x86_64.rpm`, `…_x64-setup.exe`, and a 509-byte `SHA256SUMS` whose five lines match GitHub's own `assets[].digest` byte for byte. Release body was written with `gh release edit --notes-file` (the annotation still does not survive to the runner).

**Screenshots:** all eight pages re-shot in both languages (`docs/screenshots/{home,preview,tools,env,tasks,plugins,doctor,settings}-{en,zh-CN}.png`, 2560×1718 @2x, `bd97b7b`). The old `overview-*` pair was renamed `home-*` — the name collided with the Overview page, which is `/preview`. Method worth reusing: a temporary `src/__shotSeed.ts` imported first in `main.tsx` reads a timestamped localStorage counter, picks page + language, and `history.replaceState`s before React mounts; a debug `.app` is then launched once per capture with `env -i` (an inherited PATH leaked WorkBuddy's own paths into the Overview table), and `screencapture -l` grabs the window. Window height is capped by the screen (859 logical) — a taller window is clamped, so "the whole page" is not reachable this way.

**SHA256SUMS, second failure in a row:** #251's script globbed `*` at the top of `artifacts/`, but `download-artifact` + `merge-multiple` keeps the uploaded layout (`dmg/`, `deb/`, `rpm/`, `appimage/`, `nsis/`), so it hashed nothing and uploaded a 0-byte file — the release job failed with `size must be greater than or equal to 1` and beta.17 went out once with no manifest at all. Fixed in `3a6ead3` (`find -print0`, bare basenames, `test -s` guard); the tag was deleted and re-cut on the fix rather than re-running the job, because a re-run replays the workflow definition stored in the original tag.

**Not verified:** the update-check panel has still never been clicked inside a running app — the owner's rule (beta9) keeps agent-side visual verification off, and nothing here overrode it.

**Known gaps left open (not ticketed yet):**
- README (en+zh) has not gained a line about the check. `## Known limitations` → "No auto-update" is still accurate, so the release is not blocked, but the feature is undocumented for users.
- `mise doctor`'s report — the thing users paste into a bug report — still has no MiseDeck version in it. The colophon made the version visible; this is the surface where it would actually be useful.

## BETA16 STATE (2026-10-21, night — beta16 batch FULLY VERIFIED by agent; v1.0.0-beta.16 tagged)

**Owner authorized full visual + runtime verification this cycle (beta9 exception, second use).** The agent ran the complete matrix on real builds: 23 happy-path captures (8 pages × en/zh light + 4 dark + 3 dir-mode), failure simulations (all-fail / garbage-output / missing-mise stubs, every page), and class sweeps. All beta16 acceptance items verified green. One new bug found and fixed: **#233** (Doctor page fabricated "Status: OK" from zero data when mise was completely broken — `doctor_text_fallback` swallowed a zero-line non-zero exit into `Ok`; now `Err(COMMAND_FAILED)`, frontend untouched, +2 Rust tests). Three verification-gate SPECs (#220 / #215 / #201) closed after the agent's verification pass; interactive flows that need clicks (dialogs #227, picker #228, run-panel cancel #223, mutation success paths #221) remain the owner's terminal check.

Release: `docs/screenshots/` re-captured (8 README images, 2400×1496), version bumped 8 places / 7 files in `85c5d4a`; annotated tag **`v1.0.0-beta.16`** cut from it (tag message = release body), release.yml three-platform matrix building.

| Issue | Commit | Scope |
| --- | --- | --- |
| #221 | `990d96c` | Non-zero mise exit is now a failure at the command boundary (`require_success`), so install/use/unuse/uninstall/settings-set/plugins/tasks mutations no longer show a green SuccessBar, invalidate caches, or clear forms on failure. Dead branches removed (`toJsonResult`, TasksPage exitCode checks). +2 Rust tests, ADR-0005 + runner.md bilingual. |
| #222 | `7050029` | Bounded reader shutdown (`READER_SHUTDOWN_BOUND = 1s`, measured drain of 64 KiB / 4 KiB pipes) — the panel no longer hangs forever when a grandchild holds stdout; lossy byte decoding so one invalid UTF-8 byte cannot truncate the transcript or EPIPE the child. New fixtures + 2 tests; 179 Rust tests. |
| #223 | `302d5db` + `c1314d1` | New `process_tree.rs`: every child is spawned in its own process group (unix `pre_exec`+`setsid` → `killpg`; windows `CREATE_NEW_PROCESS_GROUP` → `taskkill /F /T`); a pid registry with atomic reap/unregister + a `RunEvent::ExitRequested/Exit` sweep kills orphans on quit; frontend cancel now calls `cancel_run` and releases the page run-lock immediately. runner.md rewritten to the real semantics. |
| #224 | `b1f6379` | `created_at` wire field fixed (Created column real, filter works, guard asserts the real payload); `hasUpgradeTarget()` predicate so a target equal to the current version (rust `stable`) renders no upgrade badge and is not counted; missing source renders `—` instead of `Global`. +7 tests → 100. |
| #225 | `216627a` | `columnCharBudget(w)` derivation (Source 216px → 26 chars, Env Value 320px → 41 chars with head-elision); single-version Version cells render as full-contrast text instead of a disabled button; header/button baselines unified via shared `.cellTrigger`/`.cellButton`. +6 tests → 106. ui-ux-rules bilingual updated. |
| #226 | `b6d2b16` | One shared page baseline/width (Doctor/Plugins/Home no longer jump); empty tables no longer render a floating header band; Settings' empty state carries an in-card action. |
| #227 | `a48d889` | `initialDialogFocusTarget` (danger/busy → Cancel, no `autoFocus`), Tab cycle inside the dialog, focus returned on close, busy confirm explains itself; Tooltip opens on focus immediately and attaches `aria-describedby` on the keyboard path. New `lint:modal-focus` guard. +8 tests → 115. |
| #228 | `0dba09f` | One `pickDirectory` implementation; dialog failure surfaces as `directory.pickerFailed` (cancel stays silent); Link-form picker drops to secondary; `MiseMissingState` uses `navigate()` instead of `Link > Button`. New `lint:nested-interactive` guard. +4 tests → 119. |
| #229 | `57bf0f2` | All home resolution via `dirs::home_dir()` (shell.rs phantom `PROFILE` deleted), `locate_mise` probes `PATH` after the well-known list, install echo derived from the same platform branch the executor runs, shell-safe single-quote echo. Windows CI job green (run `39462447364`). |
| #230 | `eb853e4` | **Implemented by the driver in the main session** (subagent quota was exhausted). `validated_cwd()` gates every cwd-taking command (10) so a dead/unmounted directory fails in the page's own error shape and an empty string never becomes `-C ""`; `read_lockfile` is now `async` + `spawn_run`; doctor/registry fall back only on `PARSE_FAILED`/`COMMAND_FAILED` (no more 2×120s timeout stacking); `MISE_SAFE=1` is really set for every read (all reads funnel through `run_mise_json`; the streaming surface deliberately does not — verified byte-identical mise output with/without it); `opener:default` dropped, `allow-open-path` kept unscoped with the reasoning in architecture.md; the lockfile is resolved by walking up to the nearest `mise.lock` (subdirectory contexts no longer report "no lockfile"). 186 Rust tests + `npm run ci` green. |
| #231 | `d202502` | Retired the self-invented `scope / 作用域` vocabulary (8 strings, both locales; `grep -c` = 0); plugin URL placeholder shortened so the example is not cut in half; Preview's env values render like Env's (no italics, `--text`); `CommandHint`'s separator is `" ·\u00A0"` so a wrapped line can only start with `· command`, never end with an orphaned dot. 125 frontend tests green. |
| #232 | `18bd5ef` | Source-badge colour closed out as neutral: `tool` joins `project` in the info family instead of wearing warning gold (a source is a fact, not a state — the badge's text carries it; warning means needs-attention per visual-language.md). The two per-page copies of `envSourceVariant` (EnvPage + DirectoryPreview) collapse into `src/utils/envSource.ts` with 2 node:test cases, so the pages cannot drift apart again. Found during the post-fix screenshot re-review. |
| #233 | `d99cf15` | Doctor page no longer fabricates health from zero data: `doctor_text_fallback` returned `Ok({rawLines: []})` when mise was completely broken (non-zero exit, no output), and the frontend's `rawLines.length > 0` guard let the empty array render "Status: OK / no config files / no tools". Zero lines on a non-zero exit is now `Err(COMMAND_FAILED)` with stderr; non-zero exits WITH report lines stay Ok (pinned by a new fixture + test). Found in this cycle's all-fail simulation; frontend untouched; verified by re-capture. |

**Not verified anywhere in this batch (every ticket carries it on its issue):** no app launch, no screenshots, no real Windows machine — Windows is compile + unit level only. **Owner verifies on a beta.16 build.**

**Warnings for the next driver:**
- #230 was implemented in the **main session** because subagent spawning hit the 429 quota (resets 2026-10-21 23:00). Everything else in this batch was one subagent per ticket — keep that pattern when quota allows.
- #228 changed the ui-ux-rules "Choose directory renders primary everywhere" rule into a general rule + explicit form-row exception (justified on the issue) — don't revert it as "drift".
- Guards added along the way, all wired into `npm run ci`: `check-i18n.ts` Guard 4 (no Markdown backticks in copy, #219), `check-modal-focus.ts` (#227), `check-nested-interactive.ts` (#228). Do not disable a guard to make CI green.
- `docs/screenshots/` is still stale relative to #225/#226 (Source column now 216px / 26-char budget, new shared page baseline). Re-capture before the beta.16 tag (README freshness gate in `docs/agents/ci.md`).
- Windows remains compile + unit level only: no real Windows machine, so process-group kill (#223), shell home resolution (#229) and the Windows CI job are unverified on hardware.

**Next move:** owner verifies the whole beta16 batch on a build (highlights: #221 failed mutations no longer claim success; #222/#223 the panel can no longer hang and cancel really stops the process tree; #224 honest dates/upgrade targets/sources; #225 legible columns; #226 shared page baseline and no floating header on empty tables; #227 keyboard-safe dialogs and tooltips; #229/#230 Windows + cwd hardening; #231 copy; #232 tool-sourced badges no longer gold). Then **tag beta.16** (bump 6 places / 5 files; re-capture `docs/screenshots/` first per the README freshness gate). A fresh driver session should read #220's ticket list before touching anything.

---

## PREVIOUS STATE (2026-10-20, night — beta16 batch COMPLETE, frontier had no implementable tickets)

**Frontier is empty.** Every open issue is now an owner-verification gate: **#215** (beta16 UI precision SPEC; tickets #216/#217/#218 all closed in `744a9f8` + `421d6e6`), **#201** (beta15 remediation SPEC; all 13 tickets closed), plus **#219** and **#208** closed this session below. `gh issue list --state open` = #215, #201 only.

Three commits this session, all pushed to `master`, every one `npm run ci` green, **none visually verified — owner verifies on a beta.16 build**:

| Issue | Commit | Scope |
| --- | --- | --- |
| #219 | `aa1de9d` | i18n copy de-backticked: **43 values per locale** stripped of Markdown backticks (owner chose option A — plain text, no renderer, no new component; the ticket's option B "markdown-lite" was explicitly rejected). New **Guard 4** in `scripts/check-i18n.ts`: any backtick in either catalog fails `npm run lint:i18n`, with the key path in the error. Rule line added to `ui-ux-rules.md` → Copy in both locales (one home, no restatement). Class sweep: AST scan of `src/**/*.{ts,tsx}` string literals + JSX text — only hit is `api/miseTools.ts:516` — a shell-escape character table (`$`, backtick, quote, backslash), not copy; deliberately kept. |
| #219 | `712960b` | Copy polish caused by de-backticking: `"Update mise with mise self-update."` (2 keys, stutter) → `"Update mise by running mise self-update."`; `"does not have mise activate."` → `"does not have the mise activate line."`; `"could not parse mise version --json."` → `"could not parse the output of mise version --json."` zh untouched (already read correctly). |
| #208 | `de6d829` | `candidate_paths()` resolves home via `dirs::home_dir()` (was `$HOME` only — unset on Windows) and adds the Windows install locations `%USERPROFILE%\.local\bin\mise.exe`, `%USERPROFILE%\.cargo\bin\mise.exe`, `%LOCALAPPDATA%\mise\bin\mise.exe` through a `MISE_BIN` const (`.exe` on Windows). Unix candidate set/order unchanged; dedupe kept. Platform-gated `candidate_paths` unit tests. `ci.yml` gains a `windows` job (`npm run ci` + `cargo test --lib` + `cargo build` compile smoke); integration suite stays Ubuntu-only (it drives a bash fixture Windows cannot execute), Tauri bundler skipped by design — documented in `ci.md` both locales. Run `39418465492`: `windows (windows-latest)` **success**, whole workflow green. |

**Warnings for the next session:**
- #219 removed every mono emphasis from copy — commands now read as plain prose. That is the accepted cost of option A; do not "restore" backticks, Guard 4 will fail.
- #208 does **not** re-enable Windows packaging. `bundle.targets` still ships macOS (+ Linux) only; re-enabling Windows is a release-time owner decision.
- #208 is NOT verified on real Windows — the green CI job is compile/unit level only.

**Next move (superseded 2026-10-21):** the agent ran the full verification this cycle — see CURRENT STATE above. beta.16 is tagged from the release commit; what remains is the owner's terminal check of the click-driven flows (dialogs #227, picker #228, run-panel cancel #223, mutation success paths #221) and a real Windows machine for #208. After that, next feedback cycle → new `docs/feedback/betaN-*.md` + new SPEC parent.

---

## PREVIOUS STATE (2026-09-23, night — beta15 pre-release audit DONE, wave-1 must-fix #202–#207 implemented & closed)

**Pre-release deep audit (5 parallel review subagents: frontend bugs / Tauri backend / UI consistency / i18n / user journeys) landed in `docs/feedback/beta15-pre-release-audit.md` (`118d8ae`, ticketing record `8ff45b3`). Verdict: P0 = 0, releasable; debt clusters around three families — failure feedback swallowed, error/retry recipe drift, soft-cancel aftermath.**

**Platform decision (owner, 2026-09-23):** beta.15 ships WITHOUT Windows packages (narrow `bundle.targets` — Windows `locate_mise()` is broken-by-construction: HOME var, Unix paths, no `.exe`); Linux kept but marked untested in release notes. Owner will fine-tune Windows/Linux strategy later — ticket **#208** stays OPEN for that decision, do not implement without owner. Release notes must also disclose: Cancel is a soft cancel (does not kill the process).

**Wave-1 must-fix (SPEC #201) — all 6 implemented & closed, serial per-ticket subagents, every one `npm run ci` + `npm run test` (57) green, NOT visually verified:**

| Ticket | Commit | Scope |
| --- | --- | --- |
| #202 | `7d1bd4c` | PageShell 只读页 dismiss 改一次性（不再吞失败自动打开的面板/用户手动面板）；/plugins 移出 READ_ONLY_PATHS；trust error 态补 muted 横幅（`trust.banner.errorLabel/errorBody` 双语） |
| #203 | `45d6c98` | reducer `exit`/`line` 加终态守卫（cancelled 不再被覆写/已收起面板不被弹开/无迟到日志，+3 node:test 用例）；TaskForm 草稿重置 effect 依赖收窄 `task?.name`（refetch 不再清空编辑中草稿） |
| #204 | `df8ccb0` | Tasks/Settings/Doctor 计数 hint 四态化（新共享 QueryHint 组件，对齐 #199 OutdatedHint 先例；`common.loadFailed` 双语）；#199 四态规则全仓落地 |
| #205 | `1291bb0` | EnvPage 错误态对齐六页 danger-tint 配方；Tasks stderr 改 `--size-data` 删横向滚动；retry 统一 ghost + `common.retry`（`tools.addTool.retryButton` 退役，dead-key 绿） |
| #206 | `0b055e5` | capabilities 补 `opener:allow-open-path`（Tasks 页「打开任务文件」权限错修复）；CSP null → `"default-src 'self'"`（零额外放行） |
| #207 | `3a802ce` | i18n P1 五条：renameOverwrite zh 语义反转修正 / "Pick again"→"Choose again" / 退役 Context→en "for this scope" zh「当前范围」（确认框两模式共用，"current directory" 语义不通的授权取舍）/ `outdatedCount_one` 复数 / unset 成功 toast「已移除」 |

**Remaining open (all wave-2 P2, do not block release):** #201 SPEC + #208 Windows locate+CI（等 owner 平台决策）+ #209–#214. Wave-2 can be driven autonomously after owner says go, EXCEPT #208.

**Next move: owner visually verifies wave-1 → tag beta.15** (release procedure below; bump 6 places / 5 files, release notes add: Windows 暂不支持 / Cancel 不终止进程 / Linux 未实测). Version naming beta.15 vs 1.0.0 is owner's call at tag time.

---

## PREVIOUS STATE (2026-09-23, afternoon — beta14 wave 2 implemented & closed: #197–#200, awaiting owner visual verification)

**beta14 wave-2 feedback (5 issues settled, 4 ticketed — Issue 6 verified as by-design, no ticket):** SPEC parent **#196** + tickets **#197–#200**, all implemented serially by per-ticket subagents, every one `npm run ci` + `npm run test` (54) green. Decision records: `docs/feedback/beta14-feedback-scratch.md` Issue 3–8 (committed `a838630`).

| Ticket | Commit | Scope |
| --- | --- | --- |
| #197 | `a69cdf5` | 执行面板 header 重构：Dismiss 恒渲染（含 running，语义=最小化，与 Cancel 独立）且恒在最右；Cancel 改 shared Button secondary；ExecutionPanelAffordance 核验无 running 隐藏分支（天然满足回路）；executionState.test +3 close-回路用例；`workingDirHome` zh 家目录→主目录（审定术语）；ui-ux-rules 执行面板条文双语重写 |
| #198 | `6b876e1` | useOwnRun mounted 守卫一行修复（effect setup 恢复 true）——StrictMode dev 双跑后 isRunning 永久卡 true 导致 8 页 14+ 控件 ConfirmDialog 恒禁用；正式包无此路径，dev 验收主战场必修 |
| #199 | `d86be0f` | OutdatedHint 扩四态（loading/N outdated/all up to date/**failed**+retry）；失败不再渲染成 loading（根因：`count==null` 吞掉 error/err 两类失败，retry:false 无自愈）；outdated 查询 staleTime 5min；ui-ux-rules「加载与空状态」补异步 hint 四态条文双语 |
| #200 | `f90258d` | 删 Env/Settings 页内 ScopeBadge（含 CSS/`env.scope.*` keys 退役，dead-key 守卫绿）——顶栏 strip 在滚动容器外恒可见，徽标信息 100% 冗余且违反 product-logic 原则 4；ui-ux-rules 补「目录上下文唯一展示位」条文双语 |

**NOT visually verified — owner verifies manually.** Manual-verify lists on each closed issue（重点：#197 running 态四元素顺序+running 中收起后可回、#198 tauri dev 连续卸载第二次 Confirm 可点、#199 断网/超时显示失败+重试、#200 两页页头无徽标且顶栏不受影响）。

**Open issues are all owner-verification gates / SPEC parents:** #193 (wave 1) + #196 (wave 2) + #187 (beta13). No implementable tickets remain. Next feedback cycle → new scratch + new SPEC parent.

---

## PREVIOUS STATE (2026-09-23, morning — beta14 wave 1 implemented & closed: #194/#195)

**beta14 feedback cycle (2 issues, both owner-settled via SVG candidates + recommendations):** SPEC parent **#193** + tickets **#194/#195** (both ready-for-agent, no blockers, implemented serially by per-ticket subagents). Decision records: `docs/feedback/beta14-feedback-scratch.md` (committed `701a02f`).

| Ticket | Commit | Scope |
| --- | --- | --- |
| #194 | `f4c111c` | 目录选择文案统一（en Choose 家族）：`directory.pickerLabel` "Pick a directory"→"Choose directory"（Link 表单共享 key 连带，预期内）、`pickerTitle`→"Choose a directory for MiseDeck"；DirectoryIndicator 头注释同步；zh 全不动。`npm run ci` 一次通过 |
| #195 | `912f253` | 工具页「高级」改同构全宽 disclosure panel（触发器在 panel 头部 + aria-expanded，LinkToolForm 收入 panel 内，`.installForm` 降级内容容器避免 panel 套 panel；`.advanced` flex-start 旧结构退役）；「disclosure 含 panel 内容 → 触发器在 panel 头部」规则固化进 ui-ux-rules 双语。`npm run ci` + `npm run test`（51）全绿 |

**NOT visually verified — owner verifies manually.** Manual-verify lists on each closed issue (#194: en 顶栏/空态/目录模式按钮 + 对话框标题 + Link 表单按钮；#195: 收起/展开两态 panel 宽度对齐 + 双语条文)。

**Open issues are all owner-verification gates, no implementable tickets:** #193 (this batch) + #187 (beta13 batch — owner said beta14「基本上可以了」，likely closable). Next feedback cycle → new scratch + new SPEC parent.

---

## PREVIOUS STATE (2026-09-23 — beta13 batch fully closed: #188–#191, beta14 RELEASE RUN TRIGGERED)

**v1.0.0-beta.14 released** (tag `v1.0.0-beta.14` pushed + verified on remote, bump commit `9d19ca1`, release run `35771312219` — **success, all 4 build jobs + release job green, 6 assets on the GitHub Pre-release**: macOS aarch64 dmg, Windows x64 setup, Linux AppImage/deb/rpm + SHA256SUMS). Carries the complete beta13 feedback batch: SPEC #187 with all 4 tickets closed, every one `npm run ci` green (cargo green where Rust touched), **NOT visually verified — owner verifies manually**. Source of truth: `docs/feedback/beta13-feedback-scratch.md` (committed `577b8bc`).

| Ticket | Commit | Scope |
| --- | --- | --- |
| #188 | `30f8f25` | 版本管理区重设计：标题「版本管理」(Manage versions)、TableFilter `hideClear` 单一清除、三段分区裸动词操作（取消使用/使用/卸载/安装）、五个解释弹窗、in-config-range upgrade 不带 `--bump`（JS+Rust argv 同步退役）、Global 模式 unuse 带 `-g`、三张表 Actions 列对齐 |
| #189 | `78dc7e3` | 主表 Actions 只剩 ghost「版本管理」入口（RowActions/unuse 弹窗 orphan 分支删除）；`focusTool` 受控展开 API（seq bump → 展开+搜索+滚动）；可升级 chip（Badge，Latest 列退役、Version 列 220px）；Rust `mise_uninstall_all_argv` + fixture 彻底移除 |
| #190 | `b9db3cb` | ADR-0008 动词表按落地文案重定 + beta13 Amendment（含不做批量卸载的产品决策）；ui-ux-rules :39/:40/:44/:93/:104 + 变体表两条新规则；product-logic policy 7 扩展 —— 全部双语镜像；「标签绝不配 uninstall」字面被取代的原则在 issue 上注明 |
| #191 | `80b654f` | `commandEcho.ts` 纯模块 + 5 tests：全局模式回显隐藏 `-C $HOME`（执行层 `-C $HOME` 锚点保留，#179 未回退）、目录模式内联 `-C <dir>`；ConfirmDialog 新增 `cwd` prop + `execution.workingDirHome` 行（10 处调用点接入，self-update 例外）；规则固化 ui-ux-rules 双语 |

**Owner's next moves:** (1) install beta.14 and work the manual-verify list on SPEC #187 (notable: #188 three-section actions + explanatory dialogs, #189 manage-versions expand flow + upgrade chip, #191 global-mode echo + working-dir line); (2) close #187 when satisfied; (3) next feedback cycle → new scratch + new SPEC parent.

---

## PREVIOUS STATE (2026-09-22 — beta13 RELEASED, beta12 batch fully closed: #176–#186)

**v1.0.0-beta.13 released** (tag `v1.0.0-beta.13` pushed + verified on remote, bump commit `66df64c`, release run `35630355246` — **success, all 6 assets on the GitHub Pre-release**). Carries the complete beta12 feedback batch: SPEC #175 with all 11 tickets closed, every one `npm run ci` green (cargo green where Rust touched), **NOT visually verified — owner verifies manually**.

| Ticket | Commit | Scope |
| --- | --- | --- |
| #179 | `6981182` | runner `resolve_cwd_anchor`：cwd:None → `-C $HOME`，五页全局模式一次修正；architecture.md:17 + product-logic policy 8 双语 |
| #182 | `ef3b46b` | `isEnvWriteScopeMismatch` + 越界行确认框警示（移植 Settings unsetOutOfScope 模式） |
| #183 | `b25b960` | writeClipboard 切 `@tauri-apps/plugin-clipboard-manager`（capability `allow-write-text`）；三处失败反馈 `common.copyFailed`；「复制失败不得静默」双语 |
| #177 | `28ba974` | 9 个页面容器 `min-width:0`（一处修 8 页）+ ui-ux-rules 撑宽条文双语 |
| #176 | `a023c60` | 工具栏恒两行 + Open in terminal secondary + 同组 variant 规则；Chrome 条倒转双语 |
| #184 | `893dbc3` | 「高级」等 disclosure 触发器统一共享 ghost Button + aria-expanded；规则双语 |
| #180 | `955dc0d` | 纯 reducer `executionState.ts`（13 tests）；finished 上限 3；removeRun/clearRuns；ui-ux-rules 上限条文 + product-logic 并发意图条文双语 |
| #178 | `9f25dea` | AddToolSection 三段版本视图替代 AddToolEntry+VersionCenter；`compareToolVersions` 新比较器（6 tests）；ui-ux-rules :39/:40/:44 重写双语 |
| #181 | `29cb37f` | pageRefresh 注释漂移 + Tools 刷新补 registry 失效 |
| #185 | `bfe096c` | Env「—」本身挂理由 Tooltip（徽标降为第二触点）；ui-ux-rules:36 收紧双语 |
| #186 | `0284658` | `env.namePlaceholder` 去「大写下划线」格式断言（mise 实证无此要求；submit-and-catch 不加校验） |

**Owner's next moves:** (1) install beta.13 and work the manual-verify list on SPEC #175 (notable: #176 toolbar two-line, #178 add-tool section, #183 RAW+Tooltip copy, #177 narrow windows); (2) close #175 (and #139 if the beta11 batch is also satisfied); (3) next feedback cycle → new scratch + new SPEC parent.

---

## PREVIOUS STATE (2026-09-21 — beta12 post-release review round COMPLETE, tickets #167–#173 closed)

Owner released v1.0.0-beta.12 and asked for a professional code+doc review before his visual verification (beta11 had reversed/refined several decisions). Six parallel audit passes ran (docs-vs-code / zh-CN mirror / code-residue / interaction logic / i18n / doc-internal consistency), findings were ticketed and all seven tickets are implemented, committed to master, and closed — every one `npm run ci` green, **NOT visually verified — owner verifies manually**. Owner then asked for the 🔵 observation items too; they shipped as #173.

| Ticket | Commit | Scope |
| --- | --- | --- |
| #167 doc batch | `2025099` | Rule-doc revisions + zh-CN mirror sync (runner.md argv guard, ADR-0005:26 tools_ls, ui-ux-rules:44 Plugins, product-logic :49/:74/:79 + IA Home + Tasks create + Preview mise.lock, ui-ux-rules:68 empty delegation → new visual-language "Action buttons" section, zh release-template rewrite incl. Gatekeeper xattr cascade, misedeck/README dead link, HANDOFF:199, conventions Testing, domain.md tree, ADR-0008 plugin row) |
| #168 CI | `83a37d7` | ci.yml + ci.md (both locales) gain `npm run test` and `lint:i18n-ellipsis` — frontend test baseline previously not run in CI |
| #169 scratch 补票 | `e5765d8` | beta11-scratch finalized-but-never-ticketed items: DirectoryIndicator `.action` trio → shared Button (secondary/secondary/ghost) + cross-mode-stable order, Button ref-forwarding, Tasks description column hides when all empty, UseVersionCell single-version guard + tooltip, AddTool cap hint, 4× Global-mode hint variants (tools/env/settings/tasks), `--json-extended` out of 4 user strings |
| #170 logic bugs | `117fb56` | Env rename-to-existing now opens an overwrite confirm (`env.confirm.renameOverwrite.*`); Tasks multi-line run editing disabled + flatten-confirm (`tasks.confirm.flattenRun.*`) — agent proved via CLI that `mise tasks add` has **no lossless path** for multi-line run (even depends-only edits flatten/delete it), so disable+confirm was extended beyond the ticket's original recommendation (rationale on the issue) |
| #172 code hazards | `2c489bb` | Empty-value ban lifted in Env+Settings row editors (same ruling as #153 Add forms), run-lock comments corrected to family level, versionsByTool filters `it.installed`, VersionCenter ls-remote error gains retry button (`useLsRemote` uses skipToken so refresh-invalidate is a no-op — reasoned on issue), `run_install` nonzero exit → Err aligned with self-update, SuccessBar same-message timer reset via tick, header comments narrowed (useExecution/useToolsList/useIssue29/DirectoryPreview) |
| #171 i18n polish | `1892305` | Lockfile error block renders real message (drops false "stderr below"), dead keys removed (`doctor.status.error`, `common.ok` — the latter caught by the new guard), `doctor.missing.*` replaces `tools.missing.*` reuse on DoctorPage, `labels.binary` → "Binary path", `doctor.summary.activatedValue`, drift alignment (`common.outdatedCount`, `activation.bannerBody`), StatusRow colon via i18n, 3× "Copied" merged to `common.copied`, **new dead-key reverse lint guard in check-i18n.ts** (dynamic-index whitelist: I18N_KEYS member access, KNOWN_MESSAGE_KEYS, plural suffixes) |
| #173 观察项收尾 | `d0b8318` | Doc micro-fixes (product-logic /config kept-as-compat wording, ci.md zh tag steps, conventions/CONTEXT zh phrase restoration, visual-language wordmark-italic clarification) + i18n/code micro (trust.banner neutralized off "mise.toml", Home timeout dedupe — `states.timeoutBody` deleted, ConfirmDialog index key, DoctorPage warning parse dedupe + index-based self-update exclusion, useOwnRun silent-early-return convention note, DoctorLoading migrated to shared ProgressDot). Doctor "Health check" vs "Status" labels kept — different concepts (reasoned on issue). Deliberately untouched per ticket: unuse/uninstall zh vocabulary (owner decision), prototype.html carets, useTrustGuard unknown pass-through, Pagination placeholder, settings.count plural |

**New in CI from this round:** dead-key guard (Guard 3 in check-i18n.ts) — json leaf keys must be referenced from src. Whitelist patterns: `I18N_KEYS.a.b` static access, dynamic member-access prefixes, `_one/_other` plural bases, KNOWN_MESSAGE_KEYS.

**Flagged on issues, not ticketed (candidates for next cycle):**

**Owner's next moves:** (1) visual verification now covers beta11 batch (#139 SPEC) **plus** this review round — notable new eyeball items: DirectoryIndicator button migration + order (#169), Env rename-overwrite dialog + Tasks flatten dialog (#170), VersionCenter retry button (#172), Tasks description-column hiding (#169), Global-mode hints (#169); (2) close #139 when satisfied; (3) beta.13 release decision (procedure below; ci.yml now runs 2 more steps).

---

## PREVIOUS STATE (2026-09-21 — beta11 batch COMPLETE, all 26 work tickets closed)

**SPEC parent #139 stays OPEN awaiting the owner's manual visual verification** (same protocol as previous betas). The beta11 batch — tickets **#140–#164, #166** (there is no #165) — is fully implemented, committed to master, and pushed. Every ticket: `npm run ci` green (cargo test green where Rust touched, incl. new frontend node:test baseline from #159), **NOT visually verified — owner verifies manually**; each issue closed with its manual-verify list.

**Driver mode this batch:** one ticket per subagent; commit to master referencing `#N`; push via proxy when plain push fails (`git -c http.proxy=http://127.0.0.1:7890 push origin master`); close issue with "NOT visually verified" note. A 5-hour usage-limit 403 interrupted #143 once; handoff was written per stop-condition and the user resumed — no work was lost.

| Ticket | Commit | Notes |
| --- | --- | --- |
| #140 产品立场固化 | `397cfa9` | product-logic.md both locales: 「不引导追新动线」+ 插件级更新 v1 不承接 |
| #141 共享 TrustBanner | `bed82d4` | `components/TrustBanner/` (+`useTrustBannerFocus`); 4 copies deleted; ToolsPage mounts it (3-a fixed); cwd-change clears stale trust note |
| #142 Tooltip flex + 工具栏 | `25a05b4` | Tooltip `.trigger` inline-flex (33 sites audited); `.row` flex-wrap; Chrome 条「actions 窄窗换行」双语 |
| #143 ConfirmDialog 软折行 | `6182460` | `overflow-wrap: anywhere` one fix for 4 dialogs; panel header command gets full-text Tooltip; ui-ux-rules hint-vs-dialog 折行分场景条文双语 |
| #144 成功确认条组件 | `cbc4f9c` | shared `SuccessBar` (Banner success tone, 4s auto-dismiss); ui-ux-rules :75-77 修订「成功页面内闭环、失败走面板」双语; ToolsPage 全部 mutation 接入 |
| #145 确认条推广 | `682fb34` | Env/Tasks/Settings/Plugins/Home; `runSelfUpdate` returns result; TrustBanner 的 trust-ok note 换成 SuccessBar（修了毫秒级消失）；`trust.ok` key 退役 |
| #146 列表级 loading 门 | `858c02e` | shared `ListLoading`（PageShell+ProgressDot+common.loading）；5 页统一门控；5 个 per-page Loading 组件删除；规则入 ui-ux-rules 双语 |
| #147 假陈述扫改 | `075e9b4` | 12 keys（Settings 1 个按票留给 #162）；直接 invoke 页改「stderr 如下所示」；Tasks 两个 key 改条件式陈述；Doctor 一并扫（closing comment 注明） |
| #148 操作列空白约定 | `aefa32a` | Env 只读行 dim "—"；操作列 360→220px；ui-ux-rules「空白操作格是 bug」条文双语 |
| #149 分级排序+Enter 直提交 | `f3065fe` | tier 排序（exact>prefix>alias>description），slice 移到排序后；query==short 时 Enter 直接提交 |
| #150 Registry 退役 | `a978d1d` | 4 处 UI 文案改「搜索工具」等；tools.hint 砍成一句；CONTEXT.md 词条加注（command/doc 词汇）；commandHint 的 `mise registry` 保留 |
| #151 表格+版本中心列重构 | `340f1a0` | Version 单元格即 trigger（3-f 合并，owner 过目项）；最新列无 outdated 整列隐藏；请求版本列名；orphan 徽标+教学 Tooltip；active 行置灰删除按钮+Tooltip（2-f C）；CONTEXT.md orphan 词条 |
| #152 per-action runners | `0f206f9` | 5 个 per-命令族 runner 替换页面级单飞锁；VersionCenter disabled 拆分；非派发控件全程可用 |
| #153 Env/Settings 添加表单 | `6ecd3c7` | 成功清空；重名 ConfirmDialog；空值放开（`FOO=""`）；Env datalist 只留 config 键 |
| #154 来源取值+Tooltip | `5ea4baa` | 当前目录/继承；Badge title→共享 Tooltip（Env+Preview）；Preview 补 isConfigSource |
| #155 重命名竞态 | `5c0c723` | 双命令 ConfirmDialog（#155 起 ConfirmDialog 支持 `string[]`）；顺序执行（unset ok 才 set）；编辑名摘 datalist；值-only 保存也改成仅成功关闭 |
| #156 sourcePath⇒可写 | `186e351` | parseEnvExtendedPayload 优先级翻转；徽标「当前目录 · rust」；tooltip 分纯注入/可覆盖两种真话；ui-ux-rules :35 修订双语；Preview flat 解析的限制 flagged 为后续票 |
| #157 目录概览文案批次 | `043e2ab` | title/nav 改 "Directory Overview"；visual-language 标题层 Title Case 条文双语（修订 beta7）；mise.lock 出 hint、顺序按版面；Global 模式 hint 分开；configToggle 迁共享 Button；死 outdated 字段删 |
| #158 outdated 整体移除 | `f886607` | Preview 的 outdated 查询/OutdatedHint/hint 条目全删；commandHint 同步；Tools 页不受影响 |
| #159 Windows 路径比较 | `75003e3` | shared `utils/paths.ts`（normalize+isPathUnder，大小写折叠默认）；isGlobalConfigPath 同修；**新增前端测试基线**（`npm run test`，tsx+node:test，13 cases，进 ci；新增 devDep @types/node） |
| #160 runner 护栏开口 | `09ba2ba` | `validate_run_args`：只拒含元字符的 flag token；run/set 值放行；新 tests/run_args.rs 9 cases（cargo 160 passed） |
| #161 任务页新建+多行 run | `4f12a5b` | TaskForm 复用（create 可编辑名）；run textarea 按行 quote-aware 拆词（parseRunInput + 10 tests）；**顺带修复旧编辑每次抹掉 description 的 bug**；mise `shell_words::join` 上游限制（`&&` 会被引号化）已 flag owner |
| #162 Settings 三修 | `86b70a1` | Unset danger+ConfirmDialog；范围感知（越出 unset→禁用+Tooltip，`--global` 在 CLI 不存在）；object 行只读；只读默认 Edit 展开迁移；settings ls 收编 runner（`settings_ls` 命令删除，ADR-0005 双语修订）；settings 的假陈述 key 一并修 |
| #163 任务页修复批次 | `cc362c2` | useMemo 提前（rules-of-hooks）；hide 徽标死代码删；m2-m9 全修（复数、计数过滤口径、cellRun 省略、hint 加 config ls、只读名等）；「仅 ok 才关草稿」规则入 ui-ux-rules 双语；settings.count 同款复数缺口 flagged 未动 |
| #164 插件页空态+安装入口 | `b40721b` | 空态「搜索工具」CTA；安装插件表单（name+git URL，live argv 预览，per-action 锁）；卸载弹窗补「工具文件保留在磁盘」；ADR-0008 补卸载作用域行双语；product-logic 两处漂移修双语 |
| #166 诊断页+首页批次 | `631f992` | shell `activated: Option<bool>`（unknown→null，wire_shape 契约测试）；Doctor unknown 走 "—" 不出 Warn；CopyButton 迁移；Home：引导安装 run-lock+成功后 invalidate（不再叫用户重启）、RAW 默认折叠（disclosure）、死 #30 文案删；ui-ux-rules 新增两条数据诚实规则双语 |

**v1.0.0-beta.12 released 2026-09-21** (tag `v1.0.0-beta.12`, commits `01a29af` icon padding fix + `4450530` version bump, release run `35522365329` — all 4 jobs success, 6 assets on the GitHub Pre-release). Carries the full beta11 batch + a macOS icon fix (artwork was full-bleed, no safe-area margin → rendered ~10% larger than other apps; artwork rescaled to center 82%, `icon.icns`/macOS PNGs regenerated, Windows assets untouched). Owner must clear the macOS icon cache (`sudo rm -rf /Library/Caches/com.apple.iconservices.store && killall Dock Finder`) or reinstall to see the new icon size, then verify the beta11 batch against SPEC #139.

**Owner's next moves:** (1) clear icon cache, build & manually verify the whole beta11 batch against SPEC #139 (each closed issue carries its own manual-verify list; the notable eyeball items: #144/#145 SuccessBar look, #151 merged version-trigger + orphan badge placement, #157 config ghost button, #141 Tasks trust-note style, #162 Settings editor rest state, #161 textarea form); (2) close #139 when satisfied; (3) beta.12 release decision (procedure below — note #159 added a devDependency and `npm run test` step, both already in ci).

**Follow-ups flagged on issues (not ticketed):** mise `tasks add` shell-words quoting blocks true `&&` chains/arrays upstream (#161); DirectoryPreview flat `mise env --json` can't distinguish config-requested tool vars — switching to `--json-extended` would make its tooltip truthful (#156); `settings.count` pluralization + filtered-count same class as #163 m5/m8; Settings row-editors' non-empty value ban (#153 Add-form-only by ticket); per-control-instance run locks vs per-command-family (#152 chose family, matches other pages).

---

## PREVIOUS STATE (2026-09-10 — frontier empty, pre-beta11)

**The quota blocker is resolved: #138 (execution-panel concurrency) is implemented and closed.** All code work on the frontier is done; what remains is the owner's manual visual verification of the open SPEC parents, then a beta.11 release decision.

**SPEC #128 fully done — all nine tickets #129–#137 implemented and closed.** Owner decisions this round: #136 approved per professional recommendation; #137 resolved by the owner-committed final icon assets (`f3d9d8b`, verified against `tauri.conf.json` bundle.icon entries); the three flagged small decisions all settled per professional recommendation. Everything committed to master and pushed; every ticket `npm run ci` green (cargo where touched), **NOT visually verified — owner verifies manually**.

**Owner-approved follow-up work completed before the quota block:** ConfirmDialog is execution-aware (`cce57d2`); old findings were handled in separate commits: #91 too-old parameter parsing deduplicated and made graceful (`002c088`), #92 dead Doctor fields removed and Doctor hooks made unconditional (`f839a55`), and #90's table-scroll wording was verified already resolved in both locales (no churn commit). The app-wide draft/run-lock sweep is in `eee5330`.

**#138 implemented (2026-09-10):** the accidental global single-flight rule is replaced with concurrent execution. `useExecution` now keeps an isolated `RunEntry[]` per run with its own transcript and a compact run switcher in `ExecutionPanel`; run no longer rejects. Run-locking is per-action via `useOwnRun()` across Settings/Tasks/Plugins/Tools/Env; `ConfirmDialog` narrows to a `confirmBusy` prop (its own command only, Cancel always enabled). ADR-0005, ui-ux-rules, and runner.md are amended in both locales stating the single-flight was an accidental global lock. `npm run ci` green (cargo untouched). **NOT visually verified — owner verifies manually.**

| Ticket | Commit | Notes |
| --- | --- | --- |
| #129 panel fail-on-success wire-shape | `d651a3c` | removed `#[serde(flatten)]` from `InstallCommandResult` + `rename_all_fields="camelCase"` (bonus fix: `newVersion` never reached UI); new Rust contract suite `tests/wire_shapes.rs` (18 tests); fail path no longer shows stale exit code (`exitCode: number \| null`, new i18n `execution.statusFailedNoCode`); drift-guard rule in architecture.md both locales |
| #130 toolbar refresh never renders | `9e1e657` | `PageRefreshProvider` lifted above the router in `main.tsx`; rule codified (page-registered capability providers live above the router) |
| #131 unuse/uninstall semantics | `bc464ec` | row danger = 卸载/Unuse (`mise unuse`; orphans via `requestedVersion == null` → `uninstall --all`); per-version 删除此版本/Uninstall on non-active rows only; argv builders + fixtures in Rust tests; removal-vocabulary rule in ui-ux-rules both locales |
| #132 version dropdown | `3830608` | `UseVersionCell` FloatingMenu dropdown of installed versions replaces free-text switch; Use/使用 + Install only/仅安装 naming landed (ADR-0008); rule: version switching never free-typed |
| #133 expandable row version center | `264759b` | new `VersionCenter` (installed + available sub-lists, one cached background `ls-remote`, client filter/paginate ≥10, version-desc sort, installed markers, auto scroll-into-view); Table gained `expandedKey`/`renderExpanded`; both `VersionQuerySection`s + datalists deleted; rules codified |
| #134 registry search add-tool entry | `b82d58a` | `AddToolEntry` combobox at top of ToolsPage (hand-rolled listbox — FloatingMenu's menu-button pattern breaks typing, documented); bottom install form + `?install=` round trip gone; free-text `backend:name` stays submittable by design |
| #135 narrow run-lock + Advanced link form | `505a165` | row-expand unlocked; `LinkToolForm` in collapsed Advanced section; run-lock rule: command-firing controls only |
| #136 plugins registry table removal | `51d55a8` | registry section/filter/columns removed from PluginsPage; registry hooks kept (AddToolEntry uses them); no-dead-ends rule updated |
| #137 app icon | `f3d9d8b` (owner) | owner-provided final assets; verified all `tauri.conf.json` bundle.icon entries present; closed |

**Owner-approved follow-up commits (no ticket):** `f3dbd36` TasksPage edit-draft unlock + run-lock rule clarification; `eee5330` app-wide same-class sweep; `cce57d2` ConfirmDialog consumes execution state, disables Confirm while a command is running, and unlocks all confirm-dialog openers (Env Remove, Tools Unuse, VersionCenter Uninstall, Plugins Uninstall). The later concurrency redesign should re-evaluate this global Confirm lock.

**First actions next session:** there is no open `ready-for-agent` ticket — the frontier is empty. The owner's move is to build/run and visually verify the beta11 batch (**#128**, plus #45, #61, #65, #74, #86, #97, #119), with #138's behavior in scope: two commands can now run at once, the panel's run switcher shows them, and a control freezes only while *its own* command is in flight. Then decide on a beta.11 release (release procedure below). If new feedback arrives, open a new SPEC parent + tickets rather than reopening closed ones.

**Open SPEC parents awaiting owner visual verification:** #45, #61, #65, #74, #86, #97, #119 (older batches) + **#128** (this batch, verify against next build).

## PREVIOUS STATE (2026-09-09, evening)

**v1.0.0-beta.10 released** (commit `96449b2`, tag pushed + verified on remote, release run `34371860413`). Carries the beta9 batch.

**Beta9 batch fully implemented and closed.** Tickets **#120–#127** all closed in one autonomous run; SPEC parent **#119 stays open** pending owner visual verification (commented with the beta.10 tag/run).

| Ticket | Commit | Notes |
| --- | --- | --- |
| #120 toolbar mode label 12px + zh tracking | `843b322` | `.eyebrow`→`.modeLabel`; `:lang(zh)` override anchored by `document.documentElement.lang` |
| #121 visual-balance floor ×12 + Badge inline + 当前目录 | `c776b9b` | Badge `size="inline"`; no lint (class ruled not mechanically decidable) |
| #122 choose-directory primary + drop "…" labels | `c6e11d7` | new `lint:i18n-ellipsis` guard |
| #123 page-eyebrow removal + nav 目录概览 | `b766ba6` | 8 pages; 8 eyebrow i18n keys deleted |
| #124 shared CommandHint + drop internal flags | `614d71f` | new `lint:command-hint` guard; no component test (no test runner) |
| #125 self-update `--yes` + GUI ConfirmDialog | `c05cb99` | root cause: stdin EOF on `[Y/n]` prompt; new Rust test suite `tests/install.rs` |
| #126 spacing tokens + check-css-spacing | `5692f50` | 23 literals (ticket said 24); 4 half-step `--space-*` tokens added; **two 7px→6px judgment calls (Badge, DoctorPage warningDot) — 1px visual shift, owner to eyeball** |
| #127 closing sweep | `ab5b5b0` | fixed 4 same-class small-text residue sites; full clean-check report on the issue; **flagged letter-spacing finding RESOLVED (`c1a017e`): `--tracking-button`/`--tracking-title` tokens + `lint:css-tracking` guard** |

**Open SPEC parents awaiting owner visual verification:** #45, #61, #65, #74, #86, #97, **#119** (new — verify against beta.10).

**Owner's standing meta-directives:** proactive-sweep reporting enforced (report clean checks too); NO agent-side visual verification ever unless asked; owner has paused visual nitpicking — function work resumes after this batch is verified.

**Previous state (2026-09-09, morning):**

**Beta9 feedback round collected, specced, ticketed — awaiting implementation in a fresh session.** SPEC parent **#119**; tickets **#120–#127** (all `ready-for-agent`; #127 closing sweep is natively blocked by #120–#126). Source of truth for every settlement: `docs/feedback/beta9-feedback-scratch.md` (owner's verbatim quotes + per-class sweeps + 定稿). Mapping: #120 toolbar mode label 12px/zh-CN tracking, #121 inline 12px floor ×13 + Badge inline size + 本目录→当前目录, #122 choose-directory primary everywhere + drop "…" labels, #123 page-eyebrow row removal + nav 目录概览, #124 shared CommandHint + drop internal flags, #125 self-update `--yes` + GUI ConfirmDialog, #126 spacing literals → tokens + `check-css-spacing` lint, #127 closing sweep.

**Doc-side changes already landed this session (uncommitted at handoff — commit first, see below):** rule cleanup per owner review (he approved rules without full understanding; several were wrong): toolbar-eyebrow exception retired and generalized into a visual-balance floor (`ui-ux-rules.md`: text sharing a line with 12px+ content is ≥ `--size-data`; quietness via `--ice`, never size; **the goal is visual balance, the floor is just its enforcement**); choose-directory mapping moved to primary, beta8 fallback clause deleted; commandHint rule gains user-commands-only + unbreakable-command + shared-component clauses; `visual-language.md`: data size pinned to `--size-data` 12px (no range), "4px grid" claim dropped (the `--space-*` scale is the truth), zh-CN eyebrow note, `--panel` changelog voice cleaned, page-header eyebrows retired (eyebrow = toolbar mode label only). **One-rule-one-home refactor**: verification rule's canonical home is now `docs/agents/conventions.md` (DoD + Verification loop merged, **agent-side visual verification banned by owner decision — slow, token-expensive, drives his machine**; substitute = generation-time lint guards; rendered confirmation = owner's beta gate); `ui-ux-rules.md` keeps only a pointer; `AGENTS.md` non-negotiables demoted to one-line index entries + new meta-rule "one rule, one home — restating is drift". All mirrored en + zh-CN (8 files).

**Owner's meta-directives this round (binding):** (1) he has PAUSED visual nitpicking after 7 rounds — not a rule, just his intent; function work resumes after this batch; (2) criticism logged: when he stops nitpicking, agents stop reporting — the proactive-sweep agreement must be enforced, reporting clean checks too; (3) verification economy: NO screenshots/app launches/computer-use, ever, unless he asks.

**First actions next session:** commit the pending doc changes (rule docs ×6 + AGENTS.md ×2 + `docs/feedback/beta9-feedback-scratch.md`, reference #119), then work the frontier #120–#126 (no inter-blockers; one ticket per session/subagent), then #127.

**Open SPEC parents awaiting owner visual verification:** #45, #61, #65, #74, #86, #97 (older batches) — #119 joins this list once its tickets close.

**v1.0.0-beta.9 released 2026-09-08** (tag pushed; release matrix run was `34242665624`). Known-leftover list empty.

**Previous state (2026-09-08):**

- Code sweep `93813eb`: **fixed a live bug** — ExecutionPanel log lines referenced nonexistent CSS classes (`stderrLine`/`stdoutLine`), so stderr tinting never applied; now `styles.line` + `data-stream`. Deleted: 31 dead i18n keys (both locales), dead hooks (`useGlobalEnvList`, `useParsedGlobalEnvList`, `dirContextLabel`), orphaned CSS (ExecutionPanel demo/caret residue, LanguageSwitcher `.root`, DirectoryPreview `.dim`, VersionQuerySection `.collapseToggle`), unused deps (`thiserror` crate, `@tauri-apps/plugin-shell` npm — Rust-side plugin stays, it powers external links), stale comments (lib.rs/mise.rs/tools.rs/IconButton). Consolidated: clipboard writes → shared `writeClipboard` (ActivationBanner, DoctorPage); Table column-width storage → `loadPersistent`/`savePersistent`. `npm run ci` + `cargo test` (124) green.
- Docs sweep `5259ad6` (all edits mirrored en + zh-CN): theme is light/dark default light (product-logic was wrong); directory-indicator action list dropped Copy-Command; conventions DoD now matches the no-visual-verification rule; runner.md cancel description corrected to reality (still soft-cancel from JS — the audit's premise was wrong; only real kill is the 30-min timeout); ci.md release bump = 6 places/5 files + file-layout tree fixed + changelog hedge resolved; **`.github/workflows/ci.yml` now runs all four lint guards** (`lint:i18n-concat`, `lint:css-font-size` added); ui-ux-rules no-op example genericized off the deleted upgrade-all; IA sketch caret removed; i18n.md key-group table → pointer to keys.ts, error-code list shows all 7 codes; domain.md fictional ADR names → real ones; `docs/agents/getting-started.md` **deleted** (scaffold era, both locales) + AGENTS.md pointer removed; ADR-0002 status note: Homebrew tap not yet implemented; tools-page.prototype.html bannered as historical.

**Error-key gap RESOLVED as #118** (`ecb987b`): shared `resolveAppErrorMessage` in `misedeck/src/utils/appError.ts` parses the `key|param=value` wire format; catalog-miss on a key-shaped message falls back to `errors.unknown` (raw keys can never render); `KNOWN_MESSAGE_KEYS` keeps dynamically-resolved keys alive against dead-key sweeps. Added `errors.miseNotFound`/`miseTooOld`/`terminalNotFound`/`unknown` (both locales); TERMINAL_NOT_FOUND now sends a key from `shell.rs` (was raw English); HomePage/trust/activation consumers all wired through the resolver. Contract codified in conventions.md, i18n.md gap note rewritten (both locales). Note (resolved pre-beta9): `UNTRUSTED` was declared but never emitted by Rust — removed from `mise.rs`, `AppErrorCode`, HomePage's switch, and the code lists in conventions.md / i18n.md (both locales); `toTrustState`'s raw-English defensive fallbacks ("unexpected response") now emit the `errors.unknown` key, which the hook resolves via `resolveAppErrorMessage` (`errors.unknown` added to `KNOWN_MESSAGE_KEYS`).

**Owner decisions (2026-09-08, all resolved):** (1) HANDOFF.md stays English-only — mirroring exemption now codified in AGENTS.md both locales; (2) `docs/agents/issue-tracker.md` /triage + /wayfinder sections KEPT (mattpocock skill machinery the owner may use later); (3) zero-caller shared-component variants (Badge `danger`, Banner `danger`/`success`, DataRow `muted`, ProgressDot `ice`, IconButton `secondary`) KEPT intentionally — do not re-flag these in future audits.

**Post-beta8 cleanup batch done.** Follow-up tickets **#114–#117** implemented and closed (OutdatedHint refactor resolving the #102 deviation; i18n-concat lint guard; component font-size token sweep + guard; StyleGuide gallery deleted). **AGENTS.md gained a new working agreement** (en + zh-CN, commit `92247b2`): rule-introducing tickets must sweep their own class app-wide, and mechanically checkable classes get lint guards in `npm run ci`.

| Ticket | Commit | Notes |
| --- | --- | --- |
| #114 shared OutdatedHint | `eb9f8b9` | one component owns loading/n>0/all-up-to-date; `common.outdatedCount`/`common.allUpToDate` ({{count}} interpolation); `tools.outdatedBadge`/`tools.noOutdated` retired — **#102 deviation formally resolved**; count format changed `outdated (3)` → `3 outdated` (visual, owner to verify) |
| #115 i18n-concat lint | `339f7d0` | `scripts/check-i18n-concat.ts` in ci (AST walk, rejects t(…) as + operand / in template literals); sweep fixed 4 sites (TasksPage count + hardcoded `runLabel required`, ThemeSwitcher, EnvPage/Preview source badges); rule codified in conventions.md both locales |
| #116 component font-size sweep | `da5a38e` | `scripts/check-css-font-size.ts` in ci; 18 literals in 8 component CSS modules folded to `--size-*` tokens, zero remain. **Largest visual fold: EmptyState title 18→14px**; full fold table on the issue — owner visual verification needed |

**#117 done (this session):** StyleGuide dev gallery removed entirely — component + CSS module, `/__styleguide` route in `main.tsx`, the whole `styleguide.*` i18n namespace (60 keys × 2 locales), and the now-stale mentions in `docs/design/product-logic.md` (both locales) and `check-css-tokens.ts` comments. The "StyleGuide demo drift" owner decision below is thereby resolved by deletion.

**Beta8 batch fully implemented.** All 16 tickets **#98–#113** closed in one autonomous run; SPEC parent **#97 stays open** pending the owner's in-person visual verification (same protocol as #86). Every ticket: `npm run ci` (+ `cargo check` where Rust touched) green, static self-audit, **NOT visually verified**.

| Ticket | Commit | Notes |
| --- | --- | --- |
| #98 chrome/toolbar+caret+unified refresh | `54db21f` | PageShell-owned unified refresh (`useRegisterPageRefresh`); 7 local refresh buttons deleted |
| #99 HomePage version compare+update row | `3660bb6` | segment-wise compare; DataRow `flare` tone added; RAW copy (stand-in until #107) |
| #100 glyph sweep ▹→→ + ▾ leftovers | `25e7080` | shared `.upgrade-arrow` in tokens.css; zero ▹/▾ left in src |
| #101 eyebrow dedupe+lockfile hidden | `fbb2f1b` | 9 section eyebrows removed; lockfile section renders only with content/error |
| #102 remove upgrade-all+install variant | `c4713bc` | `tools.noOutdated` KEPT — still feeds live toolbar hints (deviation noted on ticket) |
| #103 fixed px columns | `9308322` | 5 % columns → px; `TableColumn.minWidth` added |
| #104 column drag-resize | `bccf5f7` | opt-in `resizeKey` on Table; localStorage `misedeck.tableWidths.<key>` |
| #105 sortable columns | `06d71d0` | `sortValue`/`sortVersion`; `compareVersions` extracted to `utils/versions.ts` |
| #106 table text filter | `bd06cbe` | `useTableFilter` + `TableFilter` component; registry search gained clear |
| #107 Tooltip guard+CopyButton | `9e98e19` | shared CopyButton; Tooltip pops only on non-empty/non-— values |
| #108 UI-state persistence | `8dcdfe5` | `usePersistentState` hook; panel height is NEW (drag handle 120–600px) |
| #109 form Enter/Esc+datalists | `72e29bc` | `KeyForm`+`Suggestions` components; 9 sites; placeholder width fixes |
| #110 tools table signals | `c9da912` | inactive note (not badge); `current → latest` path; stable version color |
| #111 tools form comprehension | `69820e5` | empty version = latest (JS+Rust argv in lockstep); click-tool-prefills-query; live command preview |
| #112 page dead-ends & copy | `80f64fb` | tasks open-config CTA; plugins uninstall via ConfirmDialog; doctor → Home link; settings count i18n |
| #113 token alignment | `4051c96` | found 17 literals in 7 files (ticket said 14/6); all mapped to `--size-*` tokens |

**Adjacent findings flagged on closing comments (not ticketed yet):** TasksPage hardcoded `"{runLabel} required"` string + its toolbar count concatenation (same class as #112's settings fix); ToolsPage "Active" column now partially redundant with the inline 未激活 note; component-level CSS px literals remain (Badge 9px, Button 11.5/12.5px, etc. — #113 covered pages only); tools-page click-tool doesn't scroll the query section into view; `docs/design/tools-page.prototype.html` still has ▾ carets (static prototype).

**Beta7 batch fully closed** (tickets #87–#95, SPEC #86):

| Ticket | Commit |
| --- | --- |
| #87 Link-tool path from picker only | `c9f1f66` |
| #88 Command hints audit | `dd858bd` |
| #89 Tooltip primitive with copy replaces native title | `ba3fdbe` |
| #90 Fixed tables min-width (narrow windows scroll) | `80f0c33` |
| #91 Home: newer mise version + update button | `e407451` |
| #92 Doctor: activation row from rc-file check | `20e35ac` |
| #93 Uppercase-on-data fixes | `3dc159d` |
| #94 De-uppercase all labels except eyebrow (+ docs both locales) | `824ae43` |
| #95 Tasks: open-in-editor via execution panel; i18n hide badge | `5f6c4fa` |

- **Nothing in #46–#95 was visually verified.** Every ticket was closed with an explicit "NOT visually verified — owner will verify manually" note. Verification was `npm run ci` (+ static audits) only.
- **Open issues are all SPEC parents awaiting the owner's in-person visual verification: #86, #74, #65, #61, #45.** Once the owner is satisfied, close them; nothing is blocked on code.
- Older, not in scope: #11–#15 (chore/roadmap, no `ready-for-agent` label).

### Adjacent findings flagged for future tickets (not done; details in the tickets' closing comments)

1. ~~**#95** — dead Rust command `tasks_edit_path`~~ **Done as #96** (`6f9d81b`, closed). Also removed the other dead Tauri commands found in the same sweep: `tools_ls`, `tools_ls_remote`, `tools_ls_tool` (the `ls` family has been dispatched through the execution panel's generic `run_mise_command` since #72; the "kept for callers outside the UI" comment was stale). Kept: the `mise.rs` helpers + `TasksEditPathResult` enum + `tests/tools.rs`/`tests/tasks.rs` — still exercised by Rust integration tests. Inventory now: every registered command has a live frontend caller.
2. **#92** — `DoctorPayload.activated`/`shimsOnPath` + their parsing are dead for the summary row (kept for raw output); pre-existing rules-of-hooks violation in `DoctorContent`.
3. **#91** — the too-old gate parses pipe-delimited params from Rust error text; fragile if `mise version --json` ever drops `latest`.
4. **#90** — ui-ux-rules "a data table never demands horizontal scrolling" is now in tension with fixed-table min-width; needs a one-line doc clarification.
5. ~~**#94** — StyleGuide dev page hardcoded English gallery strings~~ Resolved by #117 (StyleGuide deleted).
6. **#89** — EnvPage source Badge and directory recents menu items intentionally keep native `title` (explained in the closing comment; needs a decision only if the owner wants richer affordances there).

## Latest release: v1.0.0-beta.8 (2026-09-08)

Tag pushed, `release.yml` run 34143786713 building/publishing in the background (macOS/Windows/Linux assets + GitHub Pre-release). Carries the beta7 feedback batch (#87–#95) + dead-command cleanup #96 (`d7852ea`). Confirm the run finished and all six assets are attached before announcing.

### Release procedure (reapply for the next release)

1. Version bump touches **6 places across 5 files**: `misedeck/package.json`, `misedeck/package-lock.json` (×2), `misedeck/src-tauri/Cargo.toml`, `misedeck/src-tauri/Cargo.lock` (the `name = "misedeck"` entry), `misedeck/src-tauri/tauri.conf.json`. Grep-verify N×new / 0×old; `cargo check` + `npm run ci` green before tagging.
2. `chore(release): bump version to X` → annotated tag `vX` (tag message = Release body, en + zh-CN) → push master + tag → `release.yml` builds macOS/Windows/Linux and publishes the GitHub Pre-release.
3. **Push often needs the proxy**: `git -c http.proxy=http://127.0.0.1:7890 push origin …` (plain push 502s intermittently). Always verify a tag landed: `git ls-remote origin refs/tags/<tag>` — a silent `-q` failure looks like success.

## Standing architecture / rules the next session must know

- **`FloatingMenu`** (`misedeck/src/components/FloatingMenu/`) is the only floating-layer implementation; **`Tooltip`** (`misedeck/src/components/Tooltip/`) is the only hover-detail layer for ellipsized data (has a copy button; native `title` on data is gone app-wide, with two intentional exceptions — the EnvPage source Badge and the directory recents menu items, per the #89 finding above).
- **`useExecutionContext().run()` returns a result** and every mise invocation (reads included) goes through the execution panel — **ADR-0005**. Read hooks have no `queryFn`; the panel run is the fetch. `RunOptions.background` keeps app-initiated refreshes off the transcript. Never reintroduce direct `invoke()` calls.
- **Copy-command lives in the execution panel**; `DirectoryIndicator`'s copy button is deleted (#72).
- **Naming:** preview page = 概览 / Overview; `directory.eyebrow` = 当前目录 / CURRENT DIRECTORY. The terminology ban (`ui-ux-rules.md`) also covers 上下文 / 项目.
- **Typography:** the eyebrow is the only uppercase element; uppercase/tracking never on data — data components reset inheritance at their root (#93/#94, both docs locales).
- **Tables:** the 6 fixed tables declare `min-width` so narrow windows scroll horizontally (#90); long cells ellipsis + Tooltip (#81/#89).
- Chrome surface hierarchy: `--hull` / `--hull-soft` / `--hull-deep` + `--panel` as the elevated role — **ADR-0006** (#78).
- Frontend test baseline is node:test over pure functions (`npm run test`, `tsx --test "src/**/*.test.ts"` — `src/utils/paths.test.ts`, `src/api/miseTools.test.ts`); no component harness (no vitest/jest). Rust tests live in `misedeck/src-tauri/tests/`.

## Feedback docs

Per-beta feedback scratch/audit docs live in **`docs/feedback/`** (`betaN-feedback-scratch.md`, audits). New cycles (e.g. beta8) go there — never the repo root.

## Working agreement reminders

- **One ticket per session / subagent.** Do not batch unrelated tickets.
- **Build before commit.** `npm run ci` and `cargo check` must pass.
- **No visual verification by agents** (owner rule since the beta6 batch): no screenshots, no running the app, no simulator, no kimi-cu. Mark every closed issue "not visually verified".
- **All UI copy through i18n.** `npm run lint:i18n` must stay green.
- **Mirror docs to zh-CN** when any doc is touched.
- **Commit to master** referencing the issue (`#N`); push after; master stays green. Never force-push or delete branches/tags.
- **Commit ONLY ticket-relevant files.** `.workbuddy/` and scratch files stay out of ticket commits.

## Critical files

| File | Purpose |
| ---- | ------- |
| `docs/design/product-logic.md` | Source of truth for IA, navigation, execution-panel rules, and page inventory. |
| `docs/design/visual-language.md` | mise.jdx.dev-derived tokens for light + dark themes. |
| `docs/design/ui-ux-rules.md` | Hard interaction/presentation rules from the beta review cycles. |
| `misedeck/src/components/ExecutionPanel/` | Execution panel (every mise invocation routes through it). |
| `misedeck/src/i18n/{en,zh-CN}.json` + `keys.ts` | i18n catalog; `npm run lint:i18n` enforces parity. |
| `misedeck/scripts/check-css-tokens.ts` | CSS token guard — `npm run lint:css-tokens`. |
| `misedeck/src-tauri/src/lib.rs` / `mise.rs` | Tauri commands and the mise runner. |

## Environment reminders

- Rust toolchain is **managed by mise**. For every shell that needs `cargo`/`rustc`, run:
  ```
  source /Users/lifan/AiCodingProjects/mise-ui/.mise-shims/env.sh
  ```
- mise is at `/Users/lifan/.local/bin/mise`; shims at `/Users/lifan/.local/share/mise/shims/`.
- Tauri dev: `cd misedeck && npm run tauri dev`. Frontend-only: `npx tsc --noEmit` / `npm run build`.
- `node_modules` once silently lost `@tauri-apps/api`; if builds fail oddly, `npm install` first. Do not commit local npm-version churn in `package-lock.json`.
