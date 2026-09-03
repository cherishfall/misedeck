# The execution panel is the single runner — reads included, not just mutations

> [简体中文](../../zh-CN/docs/adr/0005-execution-panel-is-the-single-runner-for-reads-too.md)

ADR-0004 made the execution panel the single path for *mutations*: every write echoes its exact argv and streams its logs. Reads were allowed to skip it, and three of them did — the tools table's `mise ls --json`, and the two version queries' `mise ls --json <tool>` and `mise ls-remote --json <tool>` — each reaching mise through its own Tauri command. The owner clicked **Run** on a version query, expected the deck to show what ran, and got nothing. The boundary was wrong: it was drawn around *danger* (writes change state, so show them) when the product's promise is drawn around *visibility* (this GUI teaches the CLI, so show everything).

**This ADR reverses that boundary. Every mise invocation the app makes goes through the panel's runner.** To make that possible without invoking mise twice, `run()` stops returning `Promise<void>` and returns the structured result; the read hooks feed that result into the React Query cache instead of fetching for themselves. The two version-query hooks therefore have no query function at all — the panel run *is* the fetch.

A run is either **foreground** or **background**. Foreground is everything the user asked for — mutations and the query sections' Run buttons: it claims the panel, echoes the command, streams the output, and reports exit status. Background is the read the app issues on its own behalf — the tools table's initial load and its post-mutation refresh: same runner, same argv validation, same timeout, but it does not open the panel or replace the transcript. That distinction exists for one reason: a successful mutation invalidates the tools list, so a transcribed background refresh would yank the install log out from under the user the moment it succeeded.

The panel is also now the home of **copy command**. It is the command history, so the affordance belongs there; the DirectoryIndicator's copy button — which guessed at a command when the panel had none — is removed. What lands on the clipboard is the echo itself, a dispatchable command line.

## Considered Options

- **Keep reads out of the panel, and only echo the command as static page text.** Rejected — the section hint already did that and the owner still expected the deck to move. Static text cannot show exit status, duration, or stderr.
- **Route reads through their existing Tauri commands and *also* log them to the panel.** Rejected — two paths to mise means two places to keep the argv, the timeout, and the validation honest, and any "log it too" seam invites a second invocation.
- **Transcribe background refreshes as well.** Rejected — the refresh fires exactly when a mutation succeeds, so it would erase the log the user just earned. A transcript that can be overwritten by machinery is not a record.
- **Keep copy-command on the directory strip.** Rejected — outside the panel it has no command to copy and has to invent one (it fell back to a bare `mise ls`). The panel always knows the real answer, or honestly has none.

## Consequences

- `useExecutionContext().run(request, options?)` returns `RunCommandResult`; `toJsonResult()` reduces a run to the `JsonResult` union the read hooks cache, mapping timeout / non-zero exit / unparsable stdout to the error branch with mise's stderr verbatim.
- Reads are subject to the panel's single-flight rule: while a foreground command runs, Run is disabled — the same guard mutations already had.
- Reads inherit the streaming runner's 30-minute ceiling rather than the 120-second read timeout. Acceptable: the user can see the run and cancel it, which was never true of a silent read.
- Switching the directory context clears a committed version query instead of silently refetching it: a query with no fetcher cannot refetch, and a spinner that never resolves would be a lie. The typed tool name stays, so re-running against the new directory is one click.
- `tools_ls`, `tools_ls_tool`, and `tools_ls_remote` keep their Tauri commands and runner functions (typed contract and Rust tests unchanged) but the UI no longer calls them; the frontend wrappers are gone so the bypass cannot be reintroduced by accident.
- Reads that do not belong to the `ls` family (`outdated`, `env`, `config ls`, lockfile, tasks, plugins) still use their own commands. They are not exempt in principle — this ticket's scope was the three queries the owner hit. New read surfaces should route through the runner.
