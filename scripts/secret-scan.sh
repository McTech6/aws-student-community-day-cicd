#!/usr/bin/env bash
# Fail if the source tree contains secrets (API keys, passwords, private keys).
# Runs in CodeBuild on a fresh checkout, before `npm ci`, so it only sees
# committed files. Run locally and it will also flag your gitignored .env files.
set -euo pipefail

VERSION="8.30.1"
SHA256="551f6fc83ea457d62a0d98237cbad105af8d557003051f41f3e7ca7b3f2470eb"
TARGET="${1:-.}"

if command -v gitleaks >/dev/null 2>&1; then
  GITLEAKS="gitleaks"
else
  dir="$(mktemp -d)"
  archive="gitleaks_${VERSION}_linux_x64.tar.gz"
  curl -fsSL --retry 3 -o "$dir/$archive" \
    "https://github.com/gitleaks/gitleaks/releases/download/v${VERSION}/${archive}"
  echo "${SHA256}  $dir/$archive" | sha256sum -c --quiet -
  tar -xzf "$dir/$archive" -C "$dir" gitleaks
  GITLEAKS="$dir/gitleaks"
fi

"$GITLEAKS" dir "$TARGET" --config .gitleaks.toml --redact --no-banner --exit-code 1
