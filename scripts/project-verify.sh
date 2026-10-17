#!/usr/bin/env bash
# Project verification gate: schema, syntax, logic tests.
# Nested-Shell integration (pack/install/enable/copy/persist/cycle) is
# documented in docs/PRODUCT.md §8 and runs headless via /tmp scripts;
# it is not part of this gate because it needs an isolated session bus.
set -Eeuo pipefail

ROOT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

fail=0
bad() { printf 'FAIL: %s\n' "$1" >&2; fail=1; }

# 1. GSettings schema must strictly compile.
if ! glib-compile-schemas --strict --dry-run extension/schemas/ 2>&1; then
    bad "gschema failed strict validation."
else
    echo "PASS: gschema strict validation."
fi

# 2. Every JS file must parse.
for f in extension/*.js tests/*.js; do
    if ! node --check "$f" 2>&1; then
        bad "node --check failed for $f."
    fi
done
[[ "$fail" -eq 0 ]] && echo "PASS: all JS files parse."

# 3. History model contract tests under real GJS.
if ! gjs -m tests/test-history.js 2>&1 | tail -n 2; then
    bad "test-history.js failed."
fi

# 4. Gio persistence tests under real GJS (isolated tmp dirs).
if ! gjs -m tests/test-store.js 2>&1 | tail -n 2; then
    bad "test-store.js failed."
fi

[[ "$fail" -eq 0 ]] || exit 1
echo "Project checks passed."
