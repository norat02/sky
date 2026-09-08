# Hướng dẫn phát hành Sky Bird Android và đăng nhập Google

Tài liệu này dành cho repository `norat02/sky`. Ứng dụng Android là Capacitor wrapper của game web, vì vậy **Google Login không dùng Firebase mặc định**: luồng đăng nhập đi qua **Supabase Auth → Google OAuth → deep link `com.norat02.skybird://login-callback`**. Hướng dẫn build iPhone và PC nằm tại [`platform-build-vi.md`](platform-build-vi.md).

## 1. Chuẩn bị môi trường

Cài Node.js 22+, JDK 17+, Android Studio và Android SDK. Từ thư mục gốc repository:

```bash
npm ci
cp .env.example .env.local
```

Không commit `.env.local`, `android/keystore.properties`, `*.jks`, `*.keystore` hoặc `google-services.json`. Các file này đã được đưa vào `.gitignore`.

## 2. Cấu hình biến môi trường public

Mở `.env.local` và thay các giá trị sau:

| Biến | Điền ở đâu | Ví dụ | Có được đưa vào APK không? |
|---|---|---|---|
| `VITE_PUBLIC_SITE_URL` | URL production | `https://sky.example.com/` | Có, đây là public URL |
| `VITE_API_BASE_URL` | URL Vercel có các API `/api/*` | `https://sky.vercel.app` | Có |
| `VITE_SUPABASE_URL` | Supabase Dashboard → Project Settings → API → Project URL | `https://abcxyz.supabase.co` | Có |
| `VITE_SUPABASE_ANON_KEY` | Supabase Dashboard → API → Publishable/anon key | chuỗi public dài | Có, chỉ là public key |
| `VITE_NATIVE_OAUTH_REDIRECT_SCHEME` | Giữ đúng application id | `com.norat02.skybird` | Có |

**Tuyệt đối không đưa** `SUPABASE_SERVICE_ROLE_KEY` hoặc `SCORE_SIGNING_SECRET` vào `.env.local` dùng để build client. Các secret server chỉ đặt trong Vercel Environment Variables. `SUPABASE_URL` server-side có thể trùng URL public nhưng service-role key luôn phải giữ kín.

Sau khi sửa biến:

```bash
npm run build
npx cap sync android
```

`env.js` chỉ là artifact public được sinh tự động từ `.env.local` trong lúc build, bị ignore bởi Git và không được tự sửa/commit. Repository không dùng `config.js`.

## 3. Tạo keystore release

Keystore là chìa khóa ký APK/AAB. Nếu mất keystore hoặc đổi alias/password, bản cập nhật có thể không cài đè lên bản cũ.

Tạo thư mục riêng ngoài repository và tạo keystore:

```bash
mkdir -p "$HOME/sky-secrets"
keytool -genkeypair -v \
  -keystore "$HOME/sky-secrets/sky-release.jks" \
  -alias sky-release \
  -keyalg RSA -keysize 2048 -validity 10000 \
  -storepass 'THAY_BANG_MAT_KHAU_STORE' \
  -keypass 'THAY_BANG_MAT_KHAU_KEY' \
  -dname 'CN=Sky Bird, OU=Mobile, O=Norat02, L=VN, ST=VN, C=VN'
```

Lấy fingerprint để khai báo OAuth hoặc Play Console:

```bash
keytool -list -v \
  -keystore "$HOME/sky-secrets/sky-release.jks" \
  -alias sky-release
```

Lưu riêng **SHA-1**, **SHA-256**, file keystore và hai password. Không gửi password vào chat, issue hoặc GitHub.

## 4. Ý nghĩa 4 biến `ANDROID_KEYSTORE_*`

Gradle đã được cấu hình để đọc biến môi trường hoặc file `android/keystore.properties` (file này không commit):

| Tên | Nội dung |
|---|---|
| `ANDROID_KEYSTORE_PATH` | Đường dẫn tuyệt đối tới `.jks`, ví dụ `/home/user/sky-secrets/sky-release.jks` |
| `ANDROID_KEYSTORE_BASE64` | Tùy chọn thay cho PATH: toàn bộ file `.jks` đã mã hóa Base64 một dòng |
| `ANDROID_KEYSTORE_PASSWORD` | Store password khi tạo keystore |
| `ANDROID_KEY_ALIAS` | Alias, ví dụ `sky-release` |
| `ANDROID_KEY_PASSWORD` | Key password của alias |

Thông thường bạn dùng **PATH + 3 thông tin xác thực**. `BASE64` chỉ nên dùng trong CI/CD khi không muốn mount file.

Cách 1 — dùng biến môi trường:

```bash
export ANDROID_KEYSTORE_PATH="$HOME/sky-secrets/sky-release.jks"
export ANDROID_KEYSTORE_PASSWORD='...'
export ANDROID_KEY_ALIAS='sky-release'
export ANDROID_KEY_PASSWORD='...'
```

Cách 2 — dùng `android/keystore.properties`:

```properties
ANDROID_KEYSTORE_PATH=/home/your-user/sky-secrets/sky-release.jks
ANDROID_KEYSTORE_PASSWORD=mat-khau-store
ANDROID_KEY_ALIAS=sky-release
ANDROID_KEY_PASSWORD=mat-khau-key
```

Cách 3 — CI/CD dùng Base64:

```bash
export ANDROID_KEYSTORE_BASE64="$(base64 -w 0 "$HOME/sky-secrets/sky-release.jks")"
export ANDROID_KEYSTORE_PASSWORD='...'
export ANDROID_KEY_ALIAS='sky-release'
export ANDROID_KEY_PASSWORD='...'
```

Khi đủ 4 trường bắt buộc, Gradle tự gắn signing config cho `release`. Nếu thiếu, debug vẫn build được nhưng release sẽ không được ký bằng keystore của bạn. Kiểm tra signing:

```bash
npm run cap:sync
cd android
./gradlew signingReport
./gradlew assembleRelease --no-daemon
./gradlew bundleRelease --no-daemon
```

File đầu ra thường nằm tại:

```text
android/app/build/outputs/apk/release/app-release.apk
android/app/build/outputs/bundle/release/app-release.aab
```

## 5. Tạo Google OAuth Client đúng loại

Vào [Google Cloud Console](https://console.cloud.google.com/):

1. Chọn hoặc tạo project.
2. Mở **APIs & Services → OAuth consent screen**. Điền app name, email hỗ trợ, developer contact; thêm scope cơ bản `openid`, `email`, `profile` nếu được hỏi.
3. Mở **Credentials → Create Credentials → OAuth client ID**.
4. Chọn **Web application**. Với Supabase hosted OAuth, client loại Web là loại cần dùng; không lấy Client ID của Android để điền vào Supabase provider.
5. Trong **Authorized redirect URIs**, thêm chính xác:

```text
https://<PROJECT-REF>.supabase.co/auth/v1/callback
```

`<PROJECT-REF>` là phần đứng trước `.supabase.co` trong `VITE_SUPABASE_URL`.

6. Ghi lại **Client ID** và **Client secret**. Không đưa client secret vào APK.

## 6. Bật Google trong Supabase

Vào Supabase Dashboard → **Authentication → Providers → Google**:

- Bật Google.
- Dán Google **Client ID** vào Client ID.
- Dán Google **Client secret** vào Client Secret.
- Save.

Vào **Authentication → URL Configuration → Redirect URLs**, thêm tất cả URL cần thiết:

```text
https://sky.example.com/
https://sky.vercel.app/
com.norat02.skybird://login-callback
```

Nếu dashboard yêu cầu wildcard preview, chỉ thêm wildcard cần thiết cho preview team của bạn; không mở rộng tùy tiện.

Trong Android, mã đã đăng ký deep link:

```text
com.norat02.skybird://login-callback
```

`AndroidManifest.xml` có intent filter tương ứng. `native-bridge.js` lắng nghe `appUrlOpen`, còn `game.js` đổi `code` hoặc access/refresh token từ callback thành session Supabase.

## 7. Lấy “ID đăng nhập Google” ở đâu?

Không lấy ID người dùng bằng cách tự nhập một chuỗi vào app. Sau khi đăng nhập thành công:

- Supabase tạo user trong **Authentication → Users**.
- `user.id` là UUID ổn định của Supabase, dùng cho backend và điểm số.
- `user.email` là email Google đã xác thực.
- Google `sub` nằm trong identity metadata; không nên dùng email làm khóa chính.

Để xem ID trong Dashboard: **Authentication → Users → chọn user → User UID**. Để xem trong client chỉ dùng cho hiển thị/debug không nhạy cảm:

```js
const { data: { user } } = await supabase.auth.getUser();
console.log(user?.id, user?.email);
```

Không đưa access token, refresh token hoặc service role key vào log production.

## 8. Build và cài thử Android

```bash
npm run cap:sync
cd android
./gradlew assembleDebug --no-daemon
adb install -r app/build/outputs/apk/debug/app-debug.apk
```

Mở app trên máy thật, bấm **Đăng nhập**, chọn Google và kiểm tra app quay lại sau callback. Nếu trình duyệt báo `redirect_uri_mismatch`, URI callback trong Google Cloud chưa khớp chính xác với `https://<project-ref>.supabase.co/auth/v1/callback`. Nếu app không mở lại, kiểm tra `applicationId`, scheme trong manifest và Redirect URLs của Supabase.

## 9. Checklist lỗi thường gặp

| Triệu chứng | Cách xử lý |
|---|---|
| `server_not_configured` | Đặt `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `SCORE_SIGNING_SECRET` trên Vercel rồi redeploy; chạy `supabase/schema.sql`. |
| Login thành công nhưng app không quay lại | Kiểm tra `com.norat02.skybird://login-callback` ở Supabase Redirect URLs và intent-filter Android. |
| `redirect_uri_mismatch` | Google OAuth chỉ cần callback Supabase dạng `https://<project-ref>.supabase.co/auth/v1/callback`; không dùng deep link làm Google callback. |
| APK cài được nhưng Google không đăng nhập | Kiểm tra `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`, `VITE_API_BASE_URL`; chạy lại `npm run build` và `npx cap sync android`. |
| Release báo unsigned | Kiểm tra đủ `ANDROID_KEYSTORE_PATH` hoặc `ANDROID_KEYSTORE_BASE64`, `ANDROID_KEYSTORE_PASSWORD`, `ANDROID_KEY_ALIAS`, `ANDROID_KEY_PASSWORD`. |
| Không cập nhật được app trên Play | Dùng đúng keystore/alias cũ, tăng `versionCode` trong `android/app/build.gradle`. |
| Bảng xếp hạng rỗng | Kiểm tra API `/api/leaderboard`, `SUPABASE_URL`, service-role key và bảng `scores`; client đọc dữ liệu qua API Supabase. |

## 10. Lệnh kiểm tra trước khi phát hành

```bash
npm run verify
npm test
npm run build
npx cap sync android
cd android && ./gradlew lint test assembleRelease --no-daemon
```

Trước khi upload AAB, mở Google Play Console để kiểm tra App signing, package name `com.norat02.skybird`, version code, privacy policy và Data safety. Không commit secret hoặc keystore vào repository.
