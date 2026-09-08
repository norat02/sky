# Hướng dẫn build Sky Bird cho Android, iPhone và PC

## 1. Nguyên tắc cấu hình `.env.local`

Repository **không dùng `config.js`**. Cấu hình local chỉ đặt trong file `.env.local` ở thư mục gốc:

```bash
cp .env.example .env.local
```

Build script đọc `.env.local` rồi sinh `env.js` vào thư mục build để WebView có thể đọc các biến public. `env.js` là artifact tự động, bị ignore và không được tự sửa/commit. Không đưa secret server vào `.env.local` public client.

Các biến client cần điền:

```dotenv
VITE_PUBLIC_SITE_URL=https://your-domain.com/
VITE_API_BASE_URL=https://your-project.vercel.app
VITE_SUPABASE_URL=https://your-project-ref.supabase.co
VITE_SUPABASE_ANON_KEY=your-public-anon-key
VITE_SUPABASE_REDIRECT_URL=https://your-domain.com/
VITE_NATIVE_OAUTH_REDIRECT_SCHEME=com.norat02.skybird
ADSENSE_PUBLISHER_ID=
```

Các biến server đặt riêng trên Vercel, không đưa vào APK/AAB/iOS app:

```dotenv
SUPABASE_URL=https://your-project-ref.supabase.co
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key
SCORE_SIGNING_SECRET=at-least-32-random-characters
ADMIN_EMAILS=admin@example.com
ADMIN_USER_IDS=
```

## 2. Chuẩn bị Android Studio trên Windows/macOS/Linux

Cài các thành phần sau:

1. Android Studio bản mới.
2. Android SDK Platform phù hợp với `compileSdk` của project.
3. Android SDK Platform-Tools.
4. Android SDK Build-Tools.
5. JDK 17 hoặc JDK được Android Studio bundled.
6. Node.js 22+ và npm.

Mở Android Studio, vào **More Actions → SDK Manager** rồi cài SDK Platform và SDK Tools. Vào **Settings → Build, Execution, Deployment → Build Tools → Gradle**, để Gradle JDK là JDK 17.

Kiểm tra terminal:

```bash
node --version
npm --version
java -version
adb version
```

Nếu Gradle báo không tìm thấy SDK, mở Android Studio một lần để SDK được cài, hoặc tạo file `android/local.properties` với đường dẫn thật:

```properties
sdk.dir=C:\\Users\\YOUR_USER\\AppData\\Local\\Android\\Sdk
```

Trên macOS/Linux:

```properties
sdk.dir=/Users/YOUR_USER/Library/Android/sdk
# hoặc /home/YOUR_USER/Android/Sdk
```

`android/local.properties` không được commit.

## 3. Mở và chạy app bằng Android Studio

Từ terminal tại thư mục repository:

```bash
npm ci
cp .env.example .env.local
# sửa .env.local
npm run build
npx cap sync android
```

Sau đó:

1. Mở Android Studio.
2. Chọn **Open**.
3. Chọn thư mục `sky/android`, không chọn thư mục gốc.
4. Chờ Gradle Sync hoàn tất.
5. Chọn emulator hoặc cắm điện thoại Android bật **Developer options → USB debugging**.
6. Bấm nút **Run ▶**.

Lưu ý: mỗi lần sửa `.env.local`, source web hoặc package, chạy lại:

```bash
npm run build
npx cap sync android
```

Sau đó bấm **File → Sync Project with Gradle Files** nếu Android Studio chưa nhận thay đổi.

## 4. Build APK debug trên máy cá nhân

Cách dùng terminal:

```bash
npm ci
npm run build
npx cap sync android
cd android
./gradlew assembleDebug --no-daemon
```

Windows PowerShell:

```powershell
npm ci
npm run build
npx cap sync android
cd android
.\gradlew.bat assembleDebug --no-daemon
```

APK đầu ra:

```text
android/app/build/outputs/apk/debug/app-debug.apk
```

Cài vào thiết bị:

```bash
adb install -r android/app/build/outputs/apk/debug/app-debug.apk
```

Trong Android Studio, có thể chọn **Build → Build Bundle(s) / APK(s) → Build APK(s)**. Khi hiện thông báo build xong, bấm **locate** để mở thư mục APK.

## 5. Ký APK/AAB release

Tạo keystore ngoài repository:

```bash
mkdir -p "$HOME/sky-secrets"
keytool -genkeypair -v \
  -keystore "$HOME/sky-secrets/sky-release.jks" \
  -alias sky-release \
  -keyalg RSA -keysize 2048 -validity 10000
```

Khai báo trước khi build:

```bash
export ANDROID_KEYSTORE_PATH="$HOME/sky-secrets/sky-release.jks"
export ANDROID_KEYSTORE_PASSWORD='store-password'
export ANDROID_KEY_ALIAS='sky-release'
export ANDROID_KEY_PASSWORD='key-password'
```

Windows PowerShell:

```powershell
$env:ANDROID_KEYSTORE_PATH="C:\secrets\sky-release.jks"
$env:ANDROID_KEYSTORE_PASSWORD="store-password"
$env:ANDROID_KEY_ALIAS="sky-release"
$env:ANDROID_KEY_PASSWORD="key-password"
```

Build release:

```bash
cd android
./gradlew assembleRelease --no-daemon
./gradlew bundleRelease --no-daemon
```

Kết quả:

```text
android/app/build/outputs/apk/release/app-release.apk
android/app/build/outputs/bundle/release/app-release.aab
```

Trước khi upload Play Console:

```bash
./gradlew signingReport
```

Lưu lại SHA-1/SHA-256 và không làm mất keystore. Để cập nhật app sau này, phải dùng đúng keystore cũ và tăng `versionCode` trong `android/app/build.gradle`.

## 6. Build iPhone/iOS

Build iOS bắt buộc dùng macOS có Xcode. Không thể tạo file `.ipa` hoàn chỉnh trên Windows/Linux vì Apple yêu cầu Xcode, signing certificate và provisioning profile.

Trên macOS:

```bash
npm ci
cp .env.example .env.local
# sửa .env.local
npm run build
npx cap sync ios
cd ios
pod install
open App.xcworkspace
```

Trong Xcode:

1. Chọn project **App** và target **App**.
2. Vào **Signing & Capabilities**.
3. Chọn Apple Developer Team.
4. Đặt Bundle Identifier khớp app id, ví dụ `com.norat02.skybird`.
5. Chọn iPhone thật hoặc Simulator.
6. Bấm **Run** để chạy thử.
7. Để archive: **Product → Archive**.
8. Trong Organizer chọn **Distribute App** để TestFlight hoặc App Store.

Sau mỗi lần đổi web source hoặc `.env.local`:

```bash
npm run build
npx cap sync ios
```

Deep link Google OAuth của iOS cần được khai báo trong URL schemes của app. Nếu đổi scheme, phải đổi đồng thời `VITE_NATIVE_OAUTH_REDIRECT_SCHEME`, Supabase Redirect URLs và native configuration.

## 7. Đóng gói ứng dụng PC thành `.exe`

PC dùng Electron, **không dùng PWA**. Electron mở chính bundle `dist/` đã dùng cho website, Android và iPhone, nên gameplay, theme và locale được đồng bộ.

GitHub Actions tại `.github/workflows/platforms.yml` build bundle web, kiểm tra desktop Windows/macOS/Linux và validate iOS Simulator không signing. Workflow Android tại `.github/workflows/android.yml` build APK/AAB debug. Release AAB cần keystore riêng và không nên để private key trong log CI.

Trên Windows hoặc máy có môi trường build Windows:

```bash
npm ci
cp .env.example .env.local
# sửa .env.local
npm run desktop:dev
```

Để tạo installer và bản portable:

```bash
npm run desktop:build
```

Kết quả nằm trong `dist/` hoặc thư mục output do electron-builder báo, thường gồm:

```text
Sky Bird Setup <version>.exe
Sky Bird <version>.exe
```

Nếu build từ Linux/macOS để phát hành Windows, nên dùng Windows CI/runner hoặc máy Windows để tránh thiếu signing/toolchain. EXE desktop dùng redirect web production cho Google OAuth; cấu hình Google/Supabase giống web. Không đưa service-role key vào `.env.local`.

Để chạy web debug trên PC mà không tạo EXE:

```bash
npm run web:dev
```

Mở `http://localhost:4173`. Đây chỉ là server kiểm thử web, không phải PWA hay sản phẩm desktop.

## 8. Một codebase và backend dùng chung

Web, Android, iPhone/iPad và desktop đều dùng cùng `dist/`, API Vercel, Supabase Auth và Supabase Database. Database production hiện tại là **Supabase PostgreSQL**, không phải Neon. Chạy [`supabase/schema.sql`](../supabase/schema.sql) trong Supabase SQL Editor trước khi kiểm thử leaderboard.

## 8. Kiểm tra Google Login trên Android/iPhone

1. Xác nhận Google Cloud có callback:

```text
https://<project-ref>.supabase.co/auth/v1/callback
```

2. Xác nhận Supabase có redirect:

```text
com.norat02.skybird://login-callback
```

3. Build lại web và sync native.
4. Mở app, bấm đăng nhập Google.
5. Chọn tài khoản.
6. Kiểm tra trình duyệt quay lại app.
7. Kiểm tra Supabase Dashboard → Authentication → Users có user mới.

Nếu login web được nhưng Android không quay lại, kiểm tra AndroidManifest deep link, Bundle ID/iOS URL scheme và biến `VITE_NATIVE_OAUTH_REDIRECT_SCHEME`.

## 9. Database Supabase và leaderboard

Chạy migration:

```text
Supabase Dashboard → SQL Editor → supabase/schema.sql → Run
```

Schema hiện có:

- `scores` với giới hạn tên 1–10 ký tự và điểm 0–100000.
- `score_runs` để chống gửi lại một lượt chơi.
- Foreign key tới `auth.users`.
- Index leaderboard `(score DESC, created_at ASC, id ASC)`.
- Partial index cho run chưa submit.
- RLS bật và client bị revoke quyền trực tiếp.

Sau khi chạy migration, kiểm tra nhanh:

```sql
select indexname, indexdef
from pg_indexes
where schemaname = 'public'
  and tablename in ('scores', 'score_runs');

select count(*) from public.scores;
```

Không đưa `SUPABASE_SERVICE_ROLE_KEY` vào `.env.local` dùng cho frontend, APK hoặc iOS.

## 10. Signing certificate và xuất AAB lên Google Play

### 10.1. Tạo upload signing certificate

Google Play nên quản lý **App Signing Key** bằng Play App Signing. Bạn chỉ giữ **Upload Key** để ký AAB trước khi upload. Tạo key ngoài repository:

```bash
mkdir -p "$HOME/sky-secrets"
keytool -genkeypair -v \
  -keystore "$HOME/sky-secrets/sky-upload.jks" \
  -alias sky-upload \
  -keyalg RSA -keysize 2048 -validity 10000 \
  -storetype JKS
```

Khi `keytool` hỏi, đặt store password và key password đủ mạnh. Lấy fingerprint:

```bash
keytool -list -v \
  -keystore "$HOME/sky-secrets/sky-upload.jks" \
  -alias sky-upload
```

Không gửi file `.jks`, password hoặc private key lên GitHub. Có thể dùng biến môi trường khi build local:

```bash
export ANDROID_KEYSTORE_PATH="$HOME/sky-secrets/sky-upload.jks"
export ANDROID_KEYSTORE_PASSWORD='STORE_PASSWORD'
export ANDROID_KEY_ALIAS='sky-upload'
export ANDROID_KEY_PASSWORD='KEY_PASSWORD'
```

Hoặc tạo `android/keystore.properties` (file đã bị `.gitignore`):

```properties
ANDROID_KEYSTORE_PATH=/home/your-user/sky-secrets/sky-upload.jks
ANDROID_KEYSTORE_PASSWORD=STORE_PASSWORD
ANDROID_KEY_ALIAS=sky-upload
ANDROID_KEY_PASSWORD=KEY_PASSWORD
```

Gradle của project đọc PATH hoặc `keystore.properties` và chỉ gắn signing config khi đủ thông tin. Kiểm tra:

```bash
cd android
./gradlew signingReport
```

Trong output, variant `release` phải hiển thị đúng keystore, alias và SHA-1/SHA-256 của upload certificate.

### 10.2. Tăng version trước mỗi lần phát hành

Mở `android/app/build.gradle` và tăng `versionCode`; `versionName` là chuỗi hiển thị cho người dùng:

```gradle
defaultConfig {
    versionCode 2
    versionName "1.1.0"
}
```

`versionCode` phải lớn hơn bản đã upload. Không đổi `applicationId` sau khi app đã phát hành:

```text
com.norat02.skybird
```

### 10.3. Build AAB release

Từ thư mục gốc:

```bash
npm ci
cp .env.example .env.local
# điền VITE_* public variables trong .env.local
npm run build
npx cap sync android

cd android
./gradlew clean
./gradlew bundleRelease --no-daemon
```

Windows PowerShell:

```powershell
npm ci
npm run build
npx cap sync android
cd android
.\gradlew.bat clean
.\gradlew.bat bundleRelease --no-daemon
```

AAB nằm tại:

```text
android/app/build/outputs/bundle/release/app-release.aab
```

Không upload debug APK/AAB. File upload phải là `bundleRelease` được ký bằng upload key.

### 10.4. Tạo app trên Google Play Console

1. Mở [Google Play Console](https://play.google.com/console/).
2. Chọn **Create app**.
3. Chọn ngôn ngữ mặc định phù hợp với app, ví dụ Vietnamese.
4. Nhập tên `Sky Bird`.
5. Chọn **App** và **Game**.
6. Chọn miễn phí hoặc trả phí.
7. Xác nhận declarations và tạo app.

Package name trong AAB phải là:

```text
com.norat02.skybird
```

### 10.5. Bật Play App Signing và upload AAB

Ở lần upload đầu tiên, vào **Test and release → Setup → App integrity** và chọn **Play App Signing**. Với app mới, chọn để Google tạo app signing key mới. Chỉ chọn upload app signing key hiện có nếu bạn phải giữ key của app cũ.

Sau đó vào **Internal testing → Create new release**:

1. Tạo track Internal testing.
2. Chọn **Create new release**.
3. Upload `android/app/build/outputs/bundle/release/app-release.aab`.
4. Chờ Play Console kiểm tra chữ ký và version code.
5. Nhập release name và release notes.
6. Chọn **Save** rồi **Review release**.
7. Chọn **Start rollout to internal testing**.

### 10.6. Thêm tester và kiểm thử

Trong **Internal testing → Testers**, thêm email Google dùng trên thiết bị. Copy opt-in link, mở bằng đúng tài khoản Google trên Android thật, cài app từ Play Store và kiểm tra:

- App cài đặt được.
- Google OAuth quay lại app.
- Leaderboard đọc được.
- Gửi điểm chỉ một lần.
- Logout/login lại đúng session.
- Không có secret trong APK/AAB.

Trước khi production, hoàn tất **Store listing**, **App content**, **Data safety**, **Privacy policy** và **Content rating**.

### 10.7. Lỗi signing thường gặp

| Lỗi | Cách xử lý |
|---|---|
| `release is not signed` | Kiểm tra đủ `ANDROID_KEYSTORE_PATH`, password và alias; chạy `./gradlew signingReport`. |
| `Keystore was tampered with` | Sai store password hoặc file `.jks` bị hỏng; dùng backup chính xác. |
| `alias does not exist` | `ANDROID_KEY_ALIAS` không khớp alias trong `keytool -list`. |
| `version code already used` | Tăng `versionCode` trong `android/app/build.gradle`. |
| `package name changed` | Giữ nguyên `com.norat02.skybird` sau khi app đã phát hành. |
| `certificate differs from previous upload` | Đang dùng sai upload key; dùng key cũ hoặc làm thủ tục reset upload key trong Play Console. |
| Google Login lỗi sau khi upload Play | Kiểm tra Supabase/Google redirect; flow hosted OAuth dùng Web OAuth Client và không đưa service-role key vào app. |
