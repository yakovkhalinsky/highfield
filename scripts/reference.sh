#!/bin/sh
# Fetch llm-world at reference.json's sha into .reference/llm-world —
# only apps/estate and apps/shared, one commit deep. A no-op when it is
# already there, or when LLM_WORLD points at a checkout of your own.
set -eu
cd "$(dirname "$0")/.."
[ -n "${LLM_WORLD:-}" ] && exit 0
repo=$(node -p 'require("./reference.json").repo')
sha=$(node -p 'require("./reference.json").sha')
dir=.reference/llm-world
[ "$(git -C "$dir" rev-parse HEAD 2>/dev/null || true)" = "$sha" ] && exit 0
rm -rf "$dir" && mkdir -p "$dir"
git -C "$dir" init -q
git -C "$dir" remote add origin "$repo"
git -C "$dir" sparse-checkout set apps/estate apps/shared
git -C "$dir" fetch -q --depth 1 origin "$sha"
git -C "$dir" -c advice.detachedHead=false checkout -q FETCH_HEAD
echo "reference: llm-world $sha in $dir"
