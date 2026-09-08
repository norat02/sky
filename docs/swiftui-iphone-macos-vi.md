# SwiftUI/Swift cho iPhone và macOS

## Kiến trúc

Sky Bird dùng kiến trúc hybrid để mọi nền tảng dùng chung một trải nghiệm:

- **iPhone/iPad:** SwiftUI làm native shell; `CAPBridgeViewController` chạy bundle web game hiện tại.
- **macOS:** SwiftUI + `WKWebView` native; mở cùng web URL/bundle với Android, PC và web.
- **Android:** Capacitor shell hiện tại.
- **Windows:** Electron.
- **Backend:** Supabase Auth, API server và leaderboard dùng chung.

Cách này giữ Google OAuth, Supabase, giao diện, gameplay và leaderboard đồng bộ thay vì viết lại toàn bộ game bằng hai codebase native khác nhau.

## iPhone/iPad

Mã SwiftUI nằm trong:

```text
ios/App/App/SceneDelegate.swift
```

`SkyBirdSwiftUIRootView` bọc `CAPBridgeViewController` bằng `UIHostingController`. Vì vậy callback URL, Capacitor App plugin và bundle `dist` vẫn hoạt động như trước.

Mở project trên macOS:

```bash
npm ci
npm run cap:sync:ios
open ios/App/App.xcodeproj
```

Trong Xcode:

1. Chọn scheme `App`.
2. Chọn iPhone Simulator hoặc iPhone thật.
3. Chọn Signing & Capabilities.
4. Chọn Team Apple Developer.
5. Kiểm tra Bundle Identifier, URL scheme OAuth và Associated Domains nếu dùng.
6. Bấm Run.

Build simulator không cần certificate:

```bash
cd ios
xcodebuild -project App/App.xcodeproj \
  -scheme App \
  -sdk iphonesimulator \
  -configuration Debug \
  -destination 'generic/platform=iOS Simulator' \
  CODE_SIGNING_ALLOWED=NO build
```

## macOS SwiftUI

Native source nằm tại:

```text
macos/SkyBirdMac/Sources/SkyBirdMac/main.swift
```

Package Swift:

```text
macos/SkyBirdMac/Package.swift
```

Build trên macOS:

```bash
cd macos/SkyBirdMac
swift build -c release
```

Tạo app bundle ZIP:

```bash
./build-app.sh
```

Output:

```text
macos/SkyBirdMac/Sky Bird.app.zip
```

Mặc định app mở:

```text
https://norat02.github.io/sky/
```

Có thể đổi URL khi chạy local:

```bash
SKY_BIRD_WEB_URL=http://localhost:4173 swift run
```

Trong production nên đặt URL deploy thật của web game trong `SKY_BIRD_WEB_URL` hoặc thay `defaultGameURL` trong `main.swift`.

## CI/CD

`platforms.yml` compile SwiftUI macOS bằng:

```yaml
swift build -c release
```

`release.yml` tạo native macOS app bundle ZIP và upload vào GitHub Release cùng APK, AAB, IPA, EXE, DMG và các artifact khác.

Build native Apple có ký hay không phụ thuộc vào Apple Developer certificate. Để phân phối chính thức, vẫn cần ký iOS IPA và macOS app/notarization bằng Apple Developer Account.
