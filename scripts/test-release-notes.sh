#!/usr/bin/env bash
# Regression check for scripts/resolve-release-notes.sh (issue #266).
set -euo pipefail

repo_root="$(cd "$(dirname "$0")/.." && pwd)"
resolver="$repo_root/scripts/resolve-release-notes.sh"
work="$(mktemp -d)"
trap 'rm -rf "$work"' EXIT

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

run() {
  ( cd "$work" && TAG="$1" GITHUB_OUTPUT="$work/out" bash "$resolver" )
}

# A lightweight tag must fall through to the curated template, with a
# bare <version> and no commit message leaking into the body.
git -C "$work" tag v1.2.3
run v1.2.3
grep -qx 'source=template' "$work/out"
grep -q 'MiseDeck v1.2.3' "$work/release-body.md"
grep -q 'MiseDeck_1.2.3_x64-setup.exe' "$work/release-body.md"
if grep -q 'chore(release)' "$work/release-body.md"; then
  echo 'lightweight tag leaked its commit message into the body' >&2
  exit 1
fi

# An annotated tag still supplies its own message.
git -C "$work" tag -a v2.0.0 -m 'Annotated notes'
run v2.0.0
grep -qx 'source=annotation' "$work/out"
grep -qx 'Annotated notes' "$work/release-body.md"

echo 'release-notes resolution: ok'
