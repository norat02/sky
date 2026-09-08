# Cấu hình Apple Developer và build IPA cho Sky Bird

## 1. Kiến trúc iOS của project

Sky Bird dùng Capacitor. Không viết lại gameplay bằng Swift. Xcode chỉ đóng gói frontend dùng chung trong `dist/`:

```text
index.html + ui.js + game.js + styles.css
                    ↓
                 dist/
                    ↓
           Capacitor iOS / Xcode
                    ↓
                  .ipa
```

Bundle ID hiện tại:

```text
com.norat02.skybird
```

URL scheme Google OAuth đã đăng ký trong `ios/App/App/Info.plist`:

```text
com.norat02.skybird
```

## 2. Điều kiện bắt buộc

Build IPA cần máy Mac có:

- macOS tương thích với Xcode.
- Xcode bản phù hợp iOS SDK.
- Apple ID.
- Apple Developer Program membership để chạy thiết bị thật, TestFlight hoặc App Store.
- Node.js 22+ và npm.
- CocoaPods nếu dependency yêu cầu.

Windows/Linux chỉ có thể sửa source hoặc validate web; không thể ký IPA chính thức vì không có Xcode và Apple signing toolchain.

## 3. Đăng ký Apple Developer Program

1. Tạo hoặc dùng Apple ID tại [appleid.apple.com](https://appleid.apple.com/).
2. Đăng ký Apple Developer Program tại [developer.apple.com/programs](https://developer.apple.com/programs/).
3. Chọn Individual hoặc Organization.
4. Hoàn tất thông tin pháp lý, thanh toán và xác minh.
5. Sau khi được duyệt, mở [developer.apple.com/account](https://developer.apple.com/account/).

Trong **Membership**, ghi lại:

- Team Name
- Team ID
- Membership expiration date

Team ID có dạng chuỗi 10 ký tự và được dùng trong signing/CI.

## 4. Tạo App ID/Bundle ID

Trong Apple Developer Account:

1. Vào **Certificates, Identifiers & Profiles**.
2. Chọn **Identifiers**.
3. Bấm dấu `+`.
4. Chọn **App IDs → App**.
5. Description: `Sky Bird`.
6. Bundle ID: Explicit.
7. Nhập chính xác:

```text
com.norat02.skybird
```

8. Bật capability cần thiết nếu có. Với bản hiện tại, đăng nhập Google OAuth qua web callback không cần Push Notifications.
9. Bấm **Register**.

Không đổi Bundle ID sau khi tạo app trên App Store Connect.

## 5. Tạo app trên App Store Connect

1. Mở [App Store Connect](https://appstoreconnect.apple.com/).
2. Vào **My Apps**.
3. Bấm `+` → **New App**.
4. Chọn:
   - Platform: iOS
   - Name: `Sky Bird`
   - Primary Language: Vietnamese
   - Bundle ID: `com.norat02.skybird`
   - SKU: ví dụ `sky-bird-ios`
5. Tạo app.

Bundle ID trong App Store Connect phải khớp:

```text
com.norat02.skybird
```

## 6. Cách đơn giản: Automatic Signing trong Xcode

Cách này phù hợp build local trên Mac.

Từ thư mục project:

```bash
npm ci
cp .env.example .env.local
# điền VITE_* public variables
npm run build
npx cap sync ios
open ios/App/App.xcworkspace
```

Trong Xcode:

1. Chọn project `App`.
2. Chọn target `App`.
3. Vào **Signing & Capabilities**.
4. Tick **Automatically manage signing**.
5. Chọn đúng **Team**.
6. Kiểm tra Bundle Identifier:

```text
com.norat02.skybird
```

Xcode sẽ tự tạo hoặc tải:

- Apple Development certificate.
- iOS Development provisioning profile.
- App ID mapping.

Chạy Simulator:

```text
Product → Run
```

Chạy iPhone thật:

1. Cắm iPhone.
2. Unlock iPhone.
3. Trust computer nếu được hỏi.
4. Bật Developer Mode trên iPhone nếu phiên bản iOS yêu cầu.
5. Chọn iPhone trong Xcode device list.
6. Chọn **Run**.

## 7. Tạo certificate thủ công

Chỉ dùng manual signing khi cần CI, team nhiều người hoặc kiểm soát profile chính xác.

### 7.1. Tạo CSR trên Mac

Mở:

```text
Applications → Utilities → Keychain Access
```

Chọn:

```text
Keychain Access → Certificate Assistant → Request a Certificate From a Certificate Authority
```

Điền email Apple ID, chọn **Saved to disk**, lưu file:

```text
SkyBird.certSigningRequest
```

### 7.2. Tạo Apple Distribution certificate

Trong Apple Developer Account:

1. Vào **Certificates**.
2. Bấm `+`.
3. Chọn **Apple Distribution**.
4. Upload `SkyBird.certSigningRequest`.
5. Download file `.cer`.
6. Mở file `.cer` bằng Keychain Access.
7. Kiểm tra certificate nằm trong **My Certificates**.

Để dùng trong CI, export certificate và private key thành `.p12`:

1. Mở Keychain Access.
2. Chọn certificate Apple Distribution và private key đi kèm.
3. Chuột phải → **Export 2 items**.
4. Chọn định dạng `.p12`.
5. Đặt password export mạnh.

Không commit `.p12` vào Git.

### 7.3. Tạo iOS Distribution provisioning profile

Trong Apple Developer Account:

1. Vào **Profiles**.
2. Bấm `+`.
3. Chọn **App Store Connect** hoặc **App Store** distribution profile.
4. Chọn App ID `com.norat02.skybird`.
5. Chọn Apple Distribution certificate.
6. Đặt tên profile, ví dụ:

```text
Sky Bird App Store Distribution
```

7. Generate.
8. Download `.mobileprovision`.

Với Xcode Automatic Signing, thường không cần tự tải profile. Với CI manual signing, cần profile này.

## 8. Archive và export IPA bằng Xcode

Sau khi cấu hình signing:

1. Trong Xcode chọn scheme `App`.
2. Chọn destination **Any iOS Device (arm64)** hoặc thiết bị generic.
3. Chọn:

```text
Product → Archive
```

4. Đợi Organizer mở.
5. Chọn archive vừa tạo.
6. Chọn **Distribute App**.
7. Chọn **App Store Connect**.
8. Chọn **Upload** để gửi trực tiếp TestFlight/App Store Connect, hoặc **Export** để tạo `.ipa`.
9. Xcode validate signing, bundle ID, entitlements và version.
10. Lưu file `.ipa` nếu chọn Export.

Nếu chỉ muốn TestFlight, chọn Upload là cách đơn giản nhất; không cần tự phát tán IPA.

## 9. Version iOS

Capacitor/Xcode lấy version từ project setting. Trước mỗi release, kiểm tra trong Xcode:

- `Marketing Version`, ví dụ `1.1.0`.
- `Current Project Version`, ví dụ `2`.

Build number phải tăng sau mỗi upload lên App Store Connect. Không upload lại cùng build number.

## 10. Cấu hình Google OAuth cho iOS

Supabase Provider vẫn dùng Google OAuth Client loại **Web application**.

Google Cloud callback:

```text
https://<PROJECT-REF>.supabase.co/auth/v1/callback
```

Supabase Redirect URLs:

```text
com.norat02.skybird://login-callback
```

Biến `.env.local`:

```dotenv
VITE_NATIVE_OAUTH_REDIRECT_SCHEME=com.norat02.skybird
```

Sau khi đổi scheme:

```bash
npm run build
npx cap sync ios
```

Trong `Info.plist`, URL scheme phải khớp `com.norat02.skybird`. Khi callback đến, Capacitor App plugin phát sự kiện `appUrlOpen`; `native-bridge.js` chuyển URL cho auth handler.

## 11. GitHub Actions secrets cho IPA

Workflow release là:

```text
.github/workflows/release.yml
```

Workflow này chạy khi push tag dạng:

```text
v1.2.0
```

Để job iOS archive/export hoạt động, vào GitHub:

```text
Repository → Settings → Secrets and variables → Actions → New repository secret
```

Thêm các secrets:

| Secret | Nội dung |
|---|---|
| `IOS_CERTIFICATE_P12_BASE64` | File Apple Distribution `.p12` đã base64 |
| `IOS_CERTIFICATE_PASSWORD` | Password khi export `.p12` |
| `IOS_BUNDLE_ID` | `com.norat02.skybird` |
| `IOS_TEAM_ID` | Team ID Apple Developer |
| `APPSTORE_ISSUER_ID` | App Store Connect API issuer ID |
| `APPSTORE_API_KEY_ID` | App Store Connect API key ID |
| `APPSTORE_API_PRIVATE_KEY` | Nội dung private key `.p8` |

Encode `.p12` trên Mac/Linux:

```bash
base64 -i SkyBirdDistribution.p12 | tr -d '\n'
```

Linux có thể dùng:

```bash
base64 -w 0 SkyBirdDistribution.p12
```

Không dùng `echo` để lưu private key vào log. Paste trực tiếp vào GitHub Secret.

## 12. Tạo App Store Connect API Key cho CI

Trong App Store Connect:

1. Vào **Users and Access**.
2. Chọn tab **Integrations → App Store Connect API**.
3. Bấm `+`.
4. Đặt tên, ví dụ `Sky Bird GitHub Actions`.
5. Chọn quyền tối thiểu cần thiết, thường là `App Manager` cho release automation.
6. Generate API key.
7. Tải file `.p8` ngay lập tức.
8. Ghi lại `Issuer ID` và `Key ID`.

Apple chỉ cho tải private key `.p8` một lần. Nếu mất, phải revoke và tạo key mới.

## 13. Chạy release đa nền tảng

Tạo tag và push:

```bash
git tag v1.2.0
git push origin v1.2.0
```

Workflow sẽ build:

- Web bundle.
- Android signed APK/AAB nếu Android secrets đã có.
- Windows EXE.
- macOS DMG/ZIP.
- Linux AppImage/DEB.
- iOS IPA nếu Apple secrets đã có.

Sau khi hoàn tất, job `github-release` tạo GitHub Release và đính kèm assets.

Không trigger workflow release trước khi đã thêm đầy đủ secrets Android/iOS; nếu thiếu signing secret, job tương ứng sẽ fail.

## 14. Lỗi thường gặp

| Lỗi | Cách xử lý |
|---|---|
| `No signing certificate` | Chọn đúng Team hoặc import Apple Distribution `.p12`. |
| `No profiles for ... were found` | Bật Automatic Signing hoặc tạo profile đúng Bundle ID. |
| `The application bundle ... does not match` | Kiểm tra Bundle ID `com.norat02.skybird`. |
| `Code signing is required` | Chọn destination generic iOS device và cấu hình Distribution signing. |
| `Invalid provisioning profile` | Tạo profile mới sau khi đổi capability/certificate. |
| `ITMS-90161 Invalid Provisioning Profile` | Profile không khớp certificate hoặc Bundle ID. Tạo lại profile. |
| `Missing compliance` | Hoàn tất Export Compliance trong App Store Connect. |
| `IPA upload rejected` | Tăng build number và kiểm tra signing/entitlements. |
| OAuth không quay lại app | Kiểm tra URL scheme trong Info.plist và Supabase Redirect URLs. |

## 15. Bảo mật

Không commit:

```text
*.p12
*.mobileprovision
*.p8
*.cer
*.jks
.env
.env.local
```

Không đưa vào client:

```text
SUPABASE_SERVICE_ROLE_KEY
SCORE_SIGNING_SECRET
ADMIN_EMAILS
ADMIN_USER_IDS
```
