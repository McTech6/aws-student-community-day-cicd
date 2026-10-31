#!/usr/bin/env bash
# Smoke test a deployed environment through its CloudFront URL.
# Usage: scripts/smoke-test.sh https://<id>.cloudfront.net
set -euo pipefail

SITE_URL="${1:?usage: $0 <site-url>}"
SITE_URL="${SITE_URL%/}"

# A fresh deploy can take a minute to settle behind CloudFront.
fetch() {
  curl -fsS --retry 6 --retry-delay 10 --retry-all-errors --max-time 15 "$1"
}

check() {
  local name="$1" url="$2" expected="$3" body
  if ! body="$(fetch "$url")"; then
    echo "FAIL  $name: request failed ($url)"
    exit 1
  fi
  if [[ "$body" != *"$expected"* ]]; then
    echo "FAIL  $name: response did not contain '$expected'"
    echo "$body" | head -c 300
    echo
    exit 1
  fi
  echo "ok    $name"
}

echo "Smoke testing $SITE_URL"
check "web app"          "$SITE_URL/"             '<div id="root">'
check "SPA deep link"    "$SITE_URL/people/123"   '<div id="root">'
check "API health"       "$SITE_URL/api/health"   '"ok":true'
check "API reads the DB" "$SITE_URL/api/people"   '['

status="$(curl -s -o /dev/null -w '%{http_code}' --max-time 15 "$SITE_URL/api/does-not-exist")"
if [[ "$status" != "404" ]]; then
  echo "FAIL  API 404s: expected 404 from an unknown API route, got $status"
  exit 1
fi
echo "ok    API 404s are real 404s (not the SPA fallback)"

echo "All smoke tests passed"
