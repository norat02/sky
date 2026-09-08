#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "$0")" && pwd)"
cd "$ROOT"
swift build -c release
APP="Sky Bird.app"
rm -rf "$APP" "$APP.zip"
mkdir -p "$APP/Contents/MacOS" "$APP/Contents/Resources"
cp .build/release/SkyBirdMac "$APP/Contents/MacOS/SkyBirdMac"
cat > "$APP/Contents/Info.plist" <<'PLIST'
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict>
  <key>CFBundleDisplayName</key><string>Sky Bird</string>
  <key>CFBundleExecutable</key><string>SkyBirdMac</string>
  <key>CFBundleIdentifier</key><string>com.norat02.skybird.mac</string>
  <key>CFBundleName</key><string>Sky Bird</string>
  <key>CFBundlePackageType</key><string>APPL</string>
  <key>CFBundleShortVersionString</key><string>1.0.0</string>
  <key>CFBundleVersion</key><string>1</string>
  <key>LSMinimumSystemVersion</key><string>13.0</string>
</dict></plist>
PLIST
chmod +x "$APP/Contents/MacOS/SkyBirdMac"
/usr/bin/ditto -c -k --sequesterRsrc --keepParent "$APP" "$APP.zip"
echo "$ROOT/$APP.zip"
