#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
RELEASE_DIR="$ROOT_DIR/release"
BUILD_DIR="$ROOT_DIR/.output/wxt/chrome-mv3"
VERSION="$(node -e "const pkg = require(process.argv[1]); const version = pkg.version; if (!/^(0|[1-9]\\d*)\\.(0|[1-9]\\d*)\\.(0|[1-9]\\d*)$/.test(version)) { throw new Error('package.json version must be strict semver x.y.z'); } process.stdout.write(version);" "$ROOT_DIR/package.json")"
PACKAGE_NAME="json-mate-v${VERSION}.zip"
PACKAGE_PATH="$RELEASE_DIR/$PACKAGE_NAME"
STAGING_DIR="$(mktemp -d "${TMPDIR:-/tmp}/json-mate-package.XXXXXX")"

cleanup() {
  rm -rf "$STAGING_DIR"
}
trap cleanup EXIT

mkdir -p "$RELEASE_DIR"

cd "$ROOT_DIR"

rm -f "$PACKAGE_PATH"

npm run build:wxt >/dev/null

if [ ! -d "$BUILD_DIR" ]; then
  echo "WXT build output not found: $BUILD_DIR" >&2
  exit 1
fi

rsync -a --delete "$BUILD_DIR/" "$STAGING_DIR/"
node -e "const fs = require('fs'); const manifestPath = process.argv[1]; const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8')); delete manifest.key; fs.writeFileSync(manifestPath, JSON.stringify(manifest));" "$STAGING_DIR/manifest.json"

(
  cd "$STAGING_DIR"
  zip -rq "$PACKAGE_PATH" . -x "*.DS_Store"
)

echo "$PACKAGE_PATH"
