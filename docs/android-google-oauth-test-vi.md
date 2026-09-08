# Cấu hình và kiểm thử Google OAuth trên Android thật

Luồng của Sky Bird dùng Supabase Hosted OAuth:

```text
App Android → Supabase Auth → Google OAuth → Supabase callback → deep link Android → App
```

App không dùng Firebase Google Sign-In. Với luồng này, Google Cloud dùng OAuth Client loại **Web application**.

## 1. Chuẩn bị Supabase

Trong Supabase Dashboard:

1. Vào **Authentication → Providers → Google**.
2. Bật Google.
3. Điền Google Client ID và Client Secret.
4. Vào **Authentication → URL Configuration**.
5. Thêm redirect URL:

```text
com.norat02.skybird://login-callback
```

Nếu dùng domain web cố định, thêm thêm:

```text
https://your-domain.com/
```

## 2. Chuẩn bị Google Cloud

Trong Google Cloud Console:

1. Chọn đúng project.
2. Vào **APIs & Services → OAuth consent screen**.
3. Khai báo tên app, email hỗ trợ và developer email.
4. Vào **Credentials → Create Credentials → OAuth client ID**.
5. Chọn **Web application**.
6. Ở **Authorized redirect URIs**, thêm:

```text
https://<PROJECT-REF>.supabase.co/auth/v1/callback
```

Ví dụ:

```text
https://abcdefgh.supabase.co/auth/v1/callback
```

Không thêm `com.norat02.skybird://login-callback` vào Google Cloud callback. Deep link này là redirect cuối từ Supabase về app Android.

Với flow Supabase hosted OAuth, không bắt buộc tạo Android OAuth Client hoặc khai báo SHA-1 để đăng nhập Google. SHA-1 vẫn cần cho một số tính năng Google native khác, nhưng không phải callback flow hiện tại.

## 3. Cấu hình `.env.local`

Tạo file tại thư mục gốc:

```bash
cp .env.example .env.local
```

Điền:

```dotenv
VITE_API_BASE_URL=https://your-project.vercel.app
VITE_SUPABASE_URL=https://<PROJECT-REF>.supabase.co
VITE_SUPABASE_ANON_KEY=your-anon-or-publishable-key
VITE_NATIVE_OAUTH_REDIRECT_SCHEME=com.norat02.skybird
VITE_PUBLIC_SITE_URL=https://your-domain.com/
```

Không điền các secret server vào frontend:

```text
SUPABASE_SERVICE_ROLE_KEY
SCORE_SIGNING_SECRET
```

Build và sync:

```bash
npm run build
npx cap sync android
```

Kiểm tra generated runtime chỉ là file public:

```bash
cat dist/env.js
```

Không commit file này.

## 4. Cài APK lên điện thoại thật

Bật Developer Options:

1. Mở **Settings → About phone**.
2. Chạm **Build number** 7 lần.
3. Vào **Developer options**.
4. Bật **USB debugging**.
5. Cắm điện thoại vào máy bằng cáp USB.
6. Chấp nhận RSA fingerprint trên điện thoại.

Kiểm tra:

```bash
adb devices
```

Thiết bị phải ở trạng thái `device`, không phải `unauthorized`.

Build debug:

```bash
cd android
./gradlew assembleDebug --no-daemon
cd ..
adb install -r android/app/build/outputs/apk/debug/app-debug.apk
```

Nếu app đang mở từ bản cũ, gỡ và cài lại khi cần:

```bash
adb uninstall com.norat02.skybird
adb install android/app/build/outputs/apk/debug/app-debug.apk
```

## 5. Kiểm thử đăng nhập Google

1. Mở app trên điện thoại thật.
2. Chọn ngôn ngữ phù hợp ở **Settings** hoặc để app nhận ngôn ngữ hệ thống.
3. Mở panel đăng nhập.
4. Chọn **Google**.
5. Chọn tài khoản Google.
6. Chấp nhận quyền nếu Google hiển thị consent screen.
7. Kiểm tra trình duyệt quay về app Sky Bird.
8. Kiểm tra trạng thái hiển thị email/Google user trong app.
9. Chạy một ván, kết thúc và thử gửi điểm.
10. Kiểm tra Supabase Dashboard → **Authentication → Users** xuất hiện user.

## 6. Theo dõi log khi lỗi

Mở logcat trong terminal:

```bash
adb logcat | grep -iE "sky|capacitor|chromium|activity|intent"
```

Hoặc lọc package:

```bash
adb logcat --pid=$(adb shell pidof com.norat02.skybird)
```

Khi callback được Android nhận, intent phải có dạng:

```text
com.norat02.skybird://login-callback?code=...
```

App có intent-filter trong:

```text
android/app/src/main/AndroidManifest.xml
```

Và `native-bridge.js` lắng nghe Capacitor `appUrlOpen`.

## 7. Kiểm tra deep link độc lập

Không cần đăng nhập để kiểm tra intent filter:

```bash
adb shell am start \
  -a android.intent.action.VIEW \
  -c android.intent.category.BROWSABLE \
  -d 'com.norat02.skybird://login-callback?code=test'
```

Nếu Android mở Sky Bird, deep link đã đăng ký đúng. Nếu không mở:

- Kiểm tra `applicationId` là `com.norat02.skybird`.
- Kiểm tra scheme là `com.norat02.skybird`.
- Kiểm tra host là `login-callback`.
- Chạy lại `npx cap sync android`.
- Gỡ app cũ rồi cài lại.

## 8. Các lỗi thường gặp

### `redirect_uri_mismatch`

Google Cloud thiếu hoặc sai:

```text
https://<PROJECT-REF>.supabase.co/auth/v1/callback
```

Phải dùng đúng project ref, không dùng domain Vercel và không dùng deep link Android ở trường Google callback.

### Google login xong nhưng không quay về app

Kiểm tra:

```text
com.norat02.skybird://login-callback
```

trong Supabase Redirect URLs, sau đó chạy lại:

```bash
npx cap sync android
```

### App quay về nhưng không đăng nhập

Kiểm tra:

- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_ANON_KEY`
- `VITE_NATIVE_OAUTH_REDIRECT_SCHEME`
- `env.js` trong `dist/`
- `adb logcat`
- phiên bản Supabase Auth đang dùng

### Login được nhưng gửi điểm lỗi

Google Auth có thể đúng nhưng API chưa cấu hình. Kiểm tra Vercel server variables:

```text
SUPABASE_URL
SUPABASE_SERVICE_ROLE_KEY
SCORE_SIGNING_SECRET
```

Kiểm tra thêm:

```text
/api/run-ticket
/api/submit-score
/api/leaderboard
```

và chạy migration:

```text
supabase/schema.sql
```

## 9. Checklist nghiệm thu Android thật

| Hạng mục | Kết quả cần đạt |
|---|---|
| APK cài đặt | App mở được, không crash |
| Ngôn ngữ | App nhận locale hệ thống hoặc lựa chọn trong Settings |
| Google OAuth | Chọn Google và đăng nhập thành công |
| Deep link | App tự mở lại sau callback |
| Session | Email/user hiển thị trong app |
| Run ticket | Bắt đầu ván không báo lỗi server |
| Submit score | Điểm ghi được một lần |
| Leaderboard | Top điểm tải được từ Supabase API |
| Logout | Logout xóa trạng thái đăng nhập |
| Reopen app | Session được khôi phục nếu chưa logout |
