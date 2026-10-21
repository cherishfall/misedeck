#!/usr/bin/env bash
# Resolve the Release body for $TAG into release-body.md at the repo root.
# Writes source=<annotation|template|auto> to $GITHUB_OUTPUT.
set -euo pipefail

: "${TAG:?TAG is required}"
cd "$(git rev-parse --show-toplevel)"

# `%(contents)` on a lightweight tag is the commit message, not release
# notes, so only an annotated tag may supply the body (issue #266).
if [ "$(git cat-file -t "$TAG" 2>/dev/null || true)" = "tag" ]; then
  annotation="$(git tag -l --format='%(contents)' "$TAG")"
  if [ -n "$annotation" ]; then
    printf '%s\n' "$annotation" > release-body.md
    echo "source=annotation" >> "${GITHUB_OUTPUT:-/dev/stdout}"
    exit 0
  fi
fi

if [ -f .github/release-template.md ]; then
  # `<version>` is bare (1.2.3): templates write the leading `v`
  # themselves, and bundle asset names carry no tag prefix.
  version="${TAG#v}"
  sed -e "s|<version>|$version|g" -e "s|{{version}}|$version|g" \
    .github/release-template.md > release-body.md
  echo "source=template" >> "${GITHUB_OUTPUT:-/dev/stdout}"
  exit 0
fi

: > release-body.md
echo "source=auto" >> "${GITHUB_OUTPUT:-/dev/stdout}"
