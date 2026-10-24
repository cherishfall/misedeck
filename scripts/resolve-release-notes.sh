#!/usr/bin/env bash
# Resolve the Release body for $TAG into release-body.md at the repo root.
# Writes source=<annotation|template|auto> to $GITHUB_OUTPUT.
set -euo pipefail

: "${TAG:?TAG is required}"
cd "$(git rev-parse --show-toplevel)"

# A tag-triggered run checks out the tag's *commit*; whether the tag
# object itself is in that clone depends on the refspec the checkout
# used, and on v1.0.1 it was not: `cat-file -t` saw no such ref, the
# annotation was skipped, and the release silently shipped the generic
# template instead of the notes the tag carried. Fetch the tags first —
# the tag is what triggered this run, so there is nothing to surprise.
# Guarded because a repo with no remote (the regression fixture, a local
# checkout) has nothing to fetch and must still resolve.
git fetch --tags --force --quiet origin >/dev/null 2>&1 || true

# `%(contents)` on a lightweight tag is the commit message, not release
# notes, so only an annotated tag may supply the body (issue #266).
if [ "$(git cat-file -t "$TAG" 2>/dev/null || true)" = "tag" ]; then
  annotation="$(git tag -l --format='%(contents)' "$TAG")"
  if [ -n "$annotation" ]; then
    printf '%s\n' "$annotation" > release-body.md
    echo "release notes: using the annotation on $TAG"
    echo "source=annotation" >> "${GITHUB_OUTPUT:-/dev/stdout}"
    exit 0
  fi
  echo "release notes: $TAG is annotated but its message is empty"
fi

if [ -f .github/release-template.md ]; then
  # `<version>` is bare (1.2.3): templates write the leading `v`
  # themselves, and bundle asset names carry no tag prefix.
  version="${TAG#v}"
  sed -e "s|<version>|$version|g" -e "s|{{version}}|$version|g" \
    .github/release-template.md > release-body.md
  echo "release notes: no usable annotation on $TAG, using .github/release-template.md"
  echo "source=template" >> "${GITHUB_OUTPUT:-/dev/stdout}"
  exit 0
fi

: > release-body.md
echo "release notes: no annotation and no template, letting GitHub generate the body"
echo "source=auto" >> "${GITHUB_OUTPUT:-/dev/stdout}"
