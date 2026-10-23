# Continuous Integration

> [简体中文](../../zh-CN/docs/agents/ci.md)

The repo runs two GitHub Actions workflows under `.github/workflows/`.
This page describes what each one does, when it runs, and how a
maintainer cuts a release.

## Workflows at a glance

| Workflow    | Trigger                                  | What it does                                                                                                                                       | Wall-clock budget |
| ----------- | ---------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------- |
| `ci.yml`    | push to `master`, every PR               | `npm ci` · `tsc --noEmit` · `npm run lint:eslint` · `npm run test` · `npm run lint:i18n` · `npm run lint:i18n-concat` · `npm run lint:css-tokens` · `npm run lint:css-font-size` · `npm run lint:css-spacing` · `npm run lint:css-tracking` · `npm run lint:i18n-ellipsis` · `npm run lint:command-hint` · `npm run lint:install-echo-parity` · `npm run lint:argv-parity` · `npm run build` · `cargo check` · `cargo clippy --all-targets -- -D warnings` · `cargo test`. Frontend runs on Ubuntu + Windows, Rust on Ubuntu; a separate Windows job runs `npm run ci` + `cargo test --all-targets` + `cargo build` (see below). | < 5 min            |
| `release.yml` | push of a `v*.*.*` tag, or `workflow_dispatch` | Builds Tauri bundles for `macos-latest`, `windows-latest`, `ubuntu-22.04` in parallel; uploads per-platform artifacts; on a real tag push, computes one release-wide `SHA256SUMS` and publishes a GitHub Release. | matrix-driven     |

The `ci.yml` workflow is the gate that keeps `master` green. The
`release.yml` workflow is the one that ships artifacts.

`release.yml` builds Linux on `ubuntu-22.04`, not `ubuntu-latest`
(issue #247): the binary links the build host's glibc, and 24.04 builds
refuse to start on Ubuntu 22.04 / Debian 12. `ci.yml` keeps
`ubuntu-latest` — that job checks against current dependencies, not
portability.

### Permissions and action pins

Both workflows run with least privilege (issue #278):

- Top level is `permissions: contents: read` in **both** workflows. In
  `release.yml` only the `release` job opts into `contents: write` at
  job level — the build legs run `npm ci` and cargo build scripts, and
  a compromised dependency must not be able to publish or rewrite a
  Release.
- Every third-party action is pinned to a full 40-character commit
  SHA, with the human-readable version in a trailing comment
  (`uses: actions/checkout@11d5960… # v4.4.0`). Tags and branches are
  mutable; the SHA is not. `dtolnay/rust-toolchain@stable` is pinned to
  the current head of its `stable` branch. Refreshing a pin means
  resolving the tag again with `gh api` and updating both workflows
  (and this table's version comment) in one change.

The `rust` job also runs `cargo clippy --all-targets -- -D warnings`,
so a lint (including `unexpected_cfgs`) fails CI instead of lingering
on `master`. The Windows job runs the same full suite — unit **and**
integration tests — which includes the `#[cfg(windows)]` process-tree
teardown test: it spawns PowerShell, which starts `ping` as a
grandchild, calls the real `terminate_tree`, and asserts both
processes are gone through `tasklist` (issue #278).

### The Windows job

`ci.yml` also runs a `windows` job for the Windows beta target
(issue #208). It is the place the Windows code paths actually execute
in CI — and as of 2026-10-22 it is no longer the *only* place: the
Windows code paths have now been run on real Windows hardware, which is
how the `#222` / `#223` fixtures were found to be unusable there. It runs
the full frontend
check (`npm run ci`, the whole 18-step script — see `misedeck/README.md`,
which adds the `modal-focus`, `nested-interactive`, `page-layout` and
`invoke-wrapper` guards the `frontend` job does not run step-by-step), the
full Rust suite (`cargo test --all-targets --no-fail-fast`), and a
`cargo build` compile smoke (`dist/` comes from `npm run ci`, so the
order matters). One thing is deliberately left out:

- The Tauri bundler (`npm run tauri build`) — Windows bundling pulls
  NSIS/WiX, and packaging is a release-time decision.

The integration suite runs here too, because the fixtures are cross-platform
Rust binaries under `src-tauri/src/bin/` (`fixture-mise`,
`fixture-process-tree`) rather than bash scripts. A bash script cannot be
spawned on Windows at all: `CreateProcess` refuses a file with no
executable extension (os error 193), which is why this job used to be
limited to `cargo test --lib`. The `#222` / `#223` process-tree cases
(`tests/runner.rs`) therefore now assert the *Windows* teardown —
`CREATE_NEW_PROCESS_GROUP` plus `taskkill /F /T` — with the same
assertions as the unix half.

A green Windows job means compile-level and test-level correctness; it
is **not** a substitute for running the app on real Windows. That
substitution is still worth refusing — the run on real hardware is what
turned up the two defects this job could not have caught (bash fixtures,
and a home-resolution seam that silently no-ops when a test fakes `$HOME`
on a platform that ignores it).

## Cutting a release

The matrix only builds on **tag push** (see ADR-0002 — no auto-versioning).
To cut a release:

1. Pick the commit on `master` you want to ship.
2. Make sure the version is bumped in all six places, all equal:
   - `misedeck/package.json` (`"version"`)
   - `misedeck/package-lock.json` (the top-level `"version"` and the
     `packages[""].version` entry)
   - `misedeck/src-tauri/Cargo.toml` (`[package].version`)
   - `misedeck/src-tauri/Cargo.lock` (the `name = "misedeck"` package's
     `version`)
   - `misedeck/src-tauri/tauri.conf.json` (`"version"`)
   The Tauri CLI stamps the version into the bundle metadata; the
   `package.json` value is what Vite injects at build time.
3. **Bring the README up to date before tagging.** Check both locales
   against what is actually shipping: the status line and version, the
   page/command table, install steps (file names, signing caveats),
   platform support, known limitations, and `docs/screenshots/` — re-capture
   any page whose UI, copy, or data shape changed. A README that still
   describes an older release blocks the release; it is not a follow-up.
4. Release notes come from an annotated tag's message, or fall back to
   `.github/release-template.md` for lightweight tags (see "Annotated vs
   lightweight tags" below).
5. Tag the commit with a `vMAJOR.MINOR.PATCH` tag and push it:
   ```sh
   git tag v0.2.0 <commit-sha>
   git push origin v0.2.0
   ```
   Pushing the tag is what triggers `release.yml`. Pushing a non-tag
   commit does **not** trigger the release build.
6. Watch the run from the Actions tab. The matrix has three legs; all
   three must succeed before the `release` job runs.
7. Once the Release is published, download the `SHA256SUMS` file,
   spot-check at least one platform's hash against a freshly
   downloaded binary, and announce.

### Annotated vs lightweight tags

If you push the tag with `git tag -a v0.2.0 -m "..."`, the annotation
message becomes the Release body. If you push a lightweight tag with
just `git tag v0.2.0` and `git push origin v0.2.0`, the workflow falls
back to `.github/release-template.md` and substitutes `<version>` with
the bare version (`0.2.0`, no leading `v`). The template is the
recommended path for routine releases; the annotation is the path for
one-off hotfix messages.

The resolver is `scripts/resolve-release-notes.sh`; it only reads
`%(contents)` when `git cat-file -t "$TAG"` reports `tag`, because a
lightweight tag returns its commit message otherwise. CI runs
`scripts/test-release-notes.sh`, which covers both tag shapes and checks
that the rendered body has no repo-relative links (they 404 on
`/releases/tag/`).

## Testing the matrix without cutting a tag

`release.yml` exposes a `workflow_dispatch` trigger so a maintainer can
exercise the full build matrix from a branch:

1. Push the branch you want to test.
2. Open the **Actions** tab in the GitHub UI.
3. Select **release** in the left sidebar.
4. Click **Run workflow** → pick the branch → **Run workflow**.

The `build` job runs all three platforms. The `release` job is
**skipped** for `workflow_dispatch` — it only runs on a real tag push,
so a manual test never publishes a Release by accident.

## What lives in each artifact

`release.yml` uploads one artifact per matrix leg, named after the
matrix `os` value:

- `misedeck-macos-latest` — `*.dmg` only. The `.app` bundle directory is
  not uploaded: it is what the DMG wraps, and it is too large to attach.
- `misedeck-windows-latest` — `*.exe` (NSIS installer), plus `*.msi` if
  a leg ever produces one.
- `misedeck-ubuntu-22.04` — `*.deb`, `*.rpm`, `*.AppImage`.

Each upload keeps the bundler's directory layout, so an artifact is a
nested tree (`dmg/`, `nsis/`, `deb/`, `rpm/`, `appimage/`), not a flat
list of files.

**One `SHA256SUMS` for the whole release — not one per platform.** The
`release` job computes it after every leg has landed, over exactly the
bytes that get attached: `find` walks the merged artifact tree (so the
nested paths are what gets hashed), and each line prints the file's
**bare basename**, because the manifest is meant to be checked from the
directory the user downloaded into:

```sh
shasum -a 256 -c SHA256SUMS   # macOS
sha256sum -c SHA256SUMS       # Linux
```

Entries are sorted by file name, so re-running the job over the same
assets reproduces the file byte for byte. An empty manifest fails the job
before the upload API can reject it. The `release` job then attaches
every file under `artifacts/**` — the installers plus that one manifest —
with its original filename.

The per-platform manifests of earlier betas are gone (issue #251): a
manifest built inside one leg could only ever cover that leg, and
beta.16's ended up listing Linux alone.

## The unsigned / Gatekeeper caveat

Per [ADR-0002 — Distribution via GitHub Releases only, unsigned](../adr/0002-distribution-github-releases-and-homebrew-tap.md):

- **macOS** binaries are not Apple-notarized. First launch requires
  clearing the quarantine flag — `xattr -dr com.apple.quarantine
  /Applications/MiseDeck.app` — or **System Settings → Privacy &
  Security → Open Anyway** (README → Install).
- **Windows** binaries are not code-signed. SmartScreen shows
  "Windows protected your PC" — More info → Run anyway.
- **Linux** ships as `.deb`, `.rpm`, and `.AppImage`. The packages are
  unsigned too: no GPG signature, no repository metadata. `SHA256SUMS`
  is the only integrity check, on every platform.

The release template at `.github/release-template.md` links to this
decision, and the bilingual READMEs state the same caveat in their
Install sections. There is no Homebrew tap for v1: GitHub Releases is
the only channel (ADR-0002).

Code signing and notarization are **out of scope** for v1 and are not
on the roadmap until the project crosses the notability bar that would
make a `homebrew-cask` submission worthwhile.

## Reproducibility

A "reproducible build" in the ticket's sense means: from a clean
checkout, on the same toolchain, the same matrix produces a working
binary. It does **not** mean byte-identical artifacts across runs —
Tauri build artifacts embed timestamps, code-signing hashes (when
applied), and other non-deterministic metadata.

To rebuild from a clean checkout locally:

```sh
# Rust toolchain
curl --proto '=https' --tlsv1.2 https://sh.rustup.rs -sSf | sh

# Frontend deps
cd misedeck
npm ci
npm run tauri build -- --bundles app,dmg  # or deb,rpm,appimage on Linux
```

The CI matrix uses a SHA-pinned `dtolnay/rust-toolchain` at `stable`
and Node 22; the exact lockfile is `misedeck/src-tauri/Cargo.lock` and
`misedeck/package-lock.json`. Both are committed.

## Caching

`release.yml` and `ci.yml` both use:

- `Swatinem/rust-cache` (`v2.9.3`, pinned by SHA) for `~/.cargo` and
  `misedeck/src-tauri/target`, keyed on the lockfile + matrix OS.
- `actions/setup-node` (`v4.4.0`, pinned by SHA) with `cache: 'npm'`
  for `node_modules`, keyed on `misedeck/package-lock.json`.

`release.yml` uses `shared-key: ${{ matrix.os }}` so the three
platform caches don't collide; `ci.yml` runs on a single OS per
`rust` job so it doesn't need the dimension.

## When a build fails

1. Open the failed run from the Actions tab or the issue tracker
   link.
2. Identify the failing leg (`build (windows-latest)`,
   `build (ubuntu-22.04)`, etc.) and the failing step.
3. If it's a system-dependency error on Linux, the apt package list
   in this doc is the source of truth — update both the release and
   ci workflows to keep them in sync, and bump the package list per
   the [Tauri 2 Linux prerequisites](https://v2.tauri.app/start/prerequisites/#linux).
4. If it's a Tauri or Rust error, reproduce locally with the same
   toolchain (Node 22, Rust stable) and `npm run tauri build`.
5. File or link the issue in the closing comment of the ticket you
   were working on, so the failure has a paper trail.

## File layout

```
.github/
├── release-template.md   # curated notes; <version> substituted
└── workflows/
    ├── ci.yml            # push-to-master + PR gate
    └── release.yml       # tag-triggered matrix + release job

zh-CN/.github/
└── release-template.md   # bilingual mirror, same shape
```

The `zh-CN/.github/release-template.md` file is kept in sync with the
English one, per the documentation languages rule in `AGENTS.md`. The
release job consumes the English template only: `scripts/resolve-release-notes.sh`
reads the tag annotation or `.github/release-template.md`. Both READMEs
are bilingual, but they are not an input to the workflow.
