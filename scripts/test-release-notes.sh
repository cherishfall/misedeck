#!/usr/bin/env bash
# Regression check for scripts/resolve-release-notes.sh (issue #266).
set -euo pipefail

repo_root="$(cd "$(dirname "$0")/.." && pwd)"
resolver="$repo_root/scripts/resolve-release-notes.sh"
work="$(mktemp -d)"
trap 'rm -rf "$work" || true' EXIT

# Release bodies are rendered on /releases/tag/, where repo-relative
# links resolve under /releases/ and 404.
for template in \
  "$repo_root/.github/release-template.md" \
  "$repo_root/zh-CN/.github/release-template.md"; do
  if grep -q '](\.\./' "$template"; then
    echo "repo-relative link in ${template#"$repo_root"/}" >&2
    exit 1
  fi
  if ! grep -qx '# MiseDeck v<version>' "$template"; then
    echo "missing 'v<version>' title in ${template#"$repo_root"/}" >&2
    exit 1
  fi
done

git -C "$work" init -q
git -C "$work" config user.name test
git -C "$work" config user.email test@example.com
mkdir -p "$work/.github"
cp "$repo_root/.github/release-template.md" "$work/.github/release-template.md"
printf 'fixture\n' > "$work/file.txt"
git -C "$work" add file.txt .github/release-template.md
git -C "$work" commit -qm 'chore(release): cut 9.9.9'

# One output file per case: the resolver appends to $GITHUB_OUTPUT, so
# reusing a file would let an earlier case satisfy a later assertion.
# (Also no `rm`: the sandboxed `rm` in this workspace refuses the
# mixed `C:\…/…` paths mktemp hands back.)
run() {
  ( cd "$work" && TAG="$2" GITHUB_OUTPUT="$work/out.$1" bash "$resolver" )
}

# A lightweight tag must fall through to the curated template, with a
# bare <version> and no commit message leaking into the body.
git -C "$work" tag v1.2.3
run light v1.2.3
grep -qx 'source=template' "$work/out.light"
grep -q 'MiseDeck v1.2.3' "$work/release-body.md"
grep -q 'MiseDeck_1.2.3_x64-setup.exe' "$work/release-body.md"
if grep -q 'chore(release)' "$work/release-body.md"; then
  echo 'lightweight tag leaked its commit message into the body' >&2
  exit 1
fi

# An annotated tag still supplies its own message.
git -C "$work" tag -a v2.0.0 -m 'Annotated notes'
run annotated v2.0.0
grep -qx 'source=annotation' "$work/out.annotated"
grep -qx 'Annotated notes' "$work/release-body.md"

# A tag-triggered run checks out the commit, not necessarily the tag
# object — v1.0.1 shipped with the generic template for exactly this
# reason. The resolver must recover the annotation from origin before
# giving up on it.
git -C "$work" init -q --bare "$work/origin.git"
git -C "$work" remote add origin "$work/origin.git"
git -C "$work" push -q origin HEAD:refs/heads/main
git -C "$work" push -q origin v2.0.0
git -C "$work" tag -d v2.0.0 >/dev/null
if git -C "$work" cat-file -t v2.0.0 >/dev/null 2>&1; then
  echo 'fixture still resolves the tag object; the test proves nothing' >&2
  exit 1
fi
run detached v2.0.0
grep -qx 'source=annotation' "$work/out.detached"
grep -qx 'Annotated notes' "$work/release-body.md"

echo 'release-notes resolution: ok'
