# Web + Android một codebase

## Kiến trúc

`index.html`, `ui.js`, `game.js`, `styles.css`, `consent-gate.js` và `native-bridge.js` là frontend duy nhất. `npm run build` tạo `dist/`; Web dùng source hiện tại cho Vercel và Capacitor dùng `dist/` làm `webDir` để đóng gói Android.

Android không có gameplay/frontend riêng. Thư mục `android/` chỉ là lớp native Capacitor, plugin `@capacitor/app`, manifest deep link và Gradle project.

| Thành phần | Web | Android |
|---|---|---|
| UI/game/assets | Source frontend hiện tại | Cùng bundle `dist/` trong WebView |
| API | Relative `/api/*` | `VITE_API_BASE_URL` trỏ tới Vercel `/api/*` |
| Auth | Supabase Auth redirect Web | Supabase Auth redirect `com.norat02.skybird://login-callback` |
| Database | Không kết nối Neon trực tiếp | Không kết nối Neon trực tiếp |
| Server | Vercel Serverless Functions | Gọi cùng Vercel Serverless Functions |
| Database server-side | Neon PostgreSQL | Neon PostgreSQL qua API server |

## Biến môi trường

Các biến `VITE_*` và `ADSENSE_PUBLISHER_ID` là public runtime configuration. `DATABASE_URL`, `NEON_DATABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `SCORE_SIGNING_SECRET`, `ADMIN_EMAILS` và `ADMIN_USER_IDS` chỉ được đặt trong server/Vercel, không được đưa vào `dist/`, Android assets hoặc APK/AAB.

## OAuth Android

Thêm redirect URL `com.norat02.skybird://login-callback` vào Supabase Auth → URL Configuration và cấu hình Google OAuth provider. Android manifest đăng ký cùng scheme/host; `native-bridge.js` nhận `appUrlOpen`, còn `game.js` đổi authorization code hoặc access/refresh token thành Supabase session.

## Build

```bash
npm ci
npm run build
npx cap sync android
npm run cap:build:apk
npm run cap:build:aab
```

APK/AAB debug không cần signing secret. Khi phát hành production, cấu hình Android signing secrets trong GitHub Actions/Vercel secret store, không commit keystore.
