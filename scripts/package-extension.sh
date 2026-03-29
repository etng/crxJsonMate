#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
RELEASE_DIR="$ROOT_DIR/release"
BUILD_DIR="$ROOT_DIR/.output/wxt/chrome-mv3"
VERSION="$(node -e "const pkg = require(process.argv[1]); const version = pkg.version; if (!/^(0|[1-9]\\d*)\\.(0|[1-9]\\d*)\\.(0|[1-9]\\d*)$/.test(version)) { throw new Error('package.json version must be strict semver x.y.z'); } process.stdout.write(version);" "$ROOT_DIR/package.json")"
PACKAGE_NAME="json-mate-v${VERSION}.zip"
PACKAGE_PATH="$RELEASE_DIR/$PACKAGE_NAME"

mkdir -p "$RELEASE_DIR"

cd "$ROOT_DIR"

rm -f "$PACKAGE_PATH"

npm run build:wxt >/dev/null

if [ ! -d "$BUILD_DIR" ]; then
  echo "WXT build output not found: $BUILD_DIR" >&2
  exit 1
fi

(
  cd "$BUILD_DIR"
  zip -rq "$PACKAGE_PATH" . -x "*.DS_Store"
)

echo "$PACKAGE_PATH"
