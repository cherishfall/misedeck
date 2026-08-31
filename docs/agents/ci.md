# Continuous Integration

> [简体中文](../../zh-CN/docs/agents/ci.md)

The repo runs two GitHub Actions workflows under `.github/workflows/`.
This page describes what each one does, when it runs, and how a
maintainer cuts a release.

## Workflows at a glance

| Workflow    | Trigger                                  | What it does                                                                                                                                       | Wall-clock budget |
| ----------- | ---------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------- |
| `ci.yml`    | push to `master`, every PR               | `npm ci` · `tsc --noEmit` · `npm run lint:i18n` · `npm run build` · `cargo check` · `cargo test`. Frontend runs on Ubuntu + Windows, Rust on Ubuntu. | < 5 min            |
| `release.yml` | push of a `v*.*.*` tag, or `workflow_dispatch` | Builds Tauri bundles for `macos-latest`, `windows-latest`, `ubuntu-latest` in parallel; uploads per-platform artifacts; on a real tag push, publishes a GitHub Release. | matrix-driven     |

The `ci.yml` workflow is the gate that keeps `master` green. The
`release.yml` workflow is the one that ships artifacts.

## Cutting a release

The matrix only builds on **tag push** (see ADR-0002 — no auto-versioning).
To cut a release:

1. Pick the commit on `master` you want to ship.
2. Make sure the version is bumped in **both**:
   - `misedeck/src-tauri/Cargo.toml` (`[package].version`)
   - `misedeck/package.json` (`"version"`)
   The two must match. The Tauri CLI will read the `Cargo.toml` value
   and stamp it into the bundle metadata; the `package.json` value is
   what Vite injects at build time.
3. Update the changelog entry in the bilingual README (or wherever the
   project keeps it after #32).
4. Tag the commit with a `vMAJOR.MINOR.PATCH` tag and push it:
   ```sh
   git tag v0.2.0 <commit-sha>
   git push origin v0.2.0
   ```
   Pushing the tag is what triggers `release.yml`. Pushing a non-tag
   commit does **not** trigger the release build.
5. Watch the run from the Actions tab. The matrix has three legs; all
   three must succeed before the `release` job runs.
6. Once the Release is published, download the `SHA256SUMS` file,
   spot-check at least one platform's hash against a freshly
   downloaded binary, and announce.

### Annotated vs lightweight tags

If you push the tag with `git tag -a v0.2.0 -m "..."`, the annotation
message becomes the Release body. If you push a lightweight tag with
just `git tag v0.2.0` and `git push origin v0.2.0`, the workflow falls
back to `.github/release-template.md` and substitutes `<version>` with
the tag name. The template is the recommended path for routine
releases; the annotation is the path for one-off hotfix messages.

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

`release.yml` uploads one artifact per matrix leg, named after the OS:

- `misedeck-macos-latest` — `*.app` bundle directory, `*.dmg`
- `misedeck-windows-latest` — `*.exe` (NSIS installer)
- `misedeck-ubuntu-latest` — `*.deb`, `*.rpm`, `*.AppImage`
- A `SHA256SUMS` file inside each artifact, listing every binary with
  its `sha256` hash.

The `release` job downloads all three artifacts and attaches their
files (binaries + the three `SHA256SUMS`) to the GitHub Release with
their original filenames.

## The unsigned / Gatekeeper caveat

Per [ADR-0002 — Distribution via GitHub Releases and own Homebrew tap, unsigned](../adr/0002-distribution-github-releases-and-homebrew-tap.md):

- **macOS** binaries are not Apple-notarized. First launch requires
  right-click → Open to clear Gatekeeper quarantine.
- **Windows** binaries are not code-signed. SmartScreen shows
  "Windows protected your PC" — More info → Run anyway.
- **Linux** ships as `.deb`, `.rpm`, and `.AppImage`. Package
  managers handle trust locally (GPG signature on the package, not
  on the binary).

The release template at `.github/release-template.md` and the bilingual
README both link to this caveat. When the README points users at the
template's "Gatekeeper / SmartScreen note" section, that link lands on
ADR-0002.

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

The CI matrix uses `dtolnay/rust-toolchain@stable` and Node 22; the
exact lockfile is `misedeck/src-tauri/Cargo.lock` and
`misedeck/package-lock.json`. Both are committed.

## Caching

`release.yml` and `ci.yml` both use:

- `Swatinem/rust-cache@v2` for `~/.cargo` and
  `misedeck/src-tauri/target`, keyed on the lockfile + matrix OS.
- `actions/setup-node@v4` with `cache: 'npm'` for `node_modules`,
  keyed on `misedeck/package-lock.json`.

`release.yml` uses `shared-key: ${{ matrix.os }}` so the three
platform caches don't collide; `ci.yml` runs on a single OS per
`rust` job so it doesn't need the dimension.

## When a build fails

1. Open the failed run from the Actions tab or the issue tracker
   link.
2. Identify the failing leg (`build (windows-latest)`,
   `build (ubuntu-latest)`, etc.) and the failing step.
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
├── release.yml           # tag-triggered matrix + release job
├── release-template.md   # curated notes; <version> substituted
├── ci.yml                # push-to-master + PR gate
└── workflows/            # (no other workflows today)

zh-CN/.github/
└── release-template.md   # bilingual mirror, same shape
```

The `zh-CN/.github/release-template.md` file is kept in sync with the
English one, per the documentation languages rule in `AGENTS.md`. The
workflow currently consumes the English template only; once #32
(bilingual README + release prep) lands, the release job can be
extended to pick the language based on the tag or a workflow input.
